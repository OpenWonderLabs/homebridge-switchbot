import type { SwitchBotPluginConfig } from './settings.js'
import type { SwitchBot } from 'node-switchbot'

import { getDeviceCommandHandler } from './deviceCommandMapper.js'
import { CharacteristicMissingError, SwitchbotAuthenticationError, SwitchbotOperationError } from './errors.js'

export interface ISwitchBotClient {
  init: () => Promise<void>
  getDevice: (id: string) => Promise<any>
  getDevices: () => Promise<any[]>
  setDeviceState: (id: string, body: any) => Promise<any>
  destroy: () => Promise<void>
}

/**
 * Thin wrapper around node-switchbot v4.0.0-beta.2+
 * Leverages upstream resilience features (retry, circuit breaker, connection intelligence)
 * while maintaining plugin-specific features like write debouncing and OpenAPI fallback.
 */
export class SwitchBotClient implements ISwitchBotClient {
  private cfg: SwitchBotPluginConfig
  private client: SwitchBot | null = null
  private writeDebounceMs = 100
  private logger: import('homebridge').Logger
  private pendingWrites: Map<string, { timer: any, body: any, resolvers: Array<{ resolve: (v: any) => void, reject: (e: any) => void }> }> = new Map()

  constructor(cfg: SwitchBotPluginConfig) {
    this.cfg = cfg
    this.logger = (cfg as any)?.logger as import('homebridge').Logger
    if (!this.logger) {
      throw new Error('SwitchBotClient requires a logger (Homebridge logger) in config')
    }
    if (typeof (cfg as any)?.writeDebounceMs === 'number') {
      this.writeDebounceMs = (cfg as any).writeDebounceMs
    }
  }

  async init(): Promise<void> {
    try {
      // Dynamic import of node-switchbot v4 with native resilience features
      const { SwitchBot } = await import('node-switchbot')
      this.client = new SwitchBot({
        token: this.cfg.openApiToken,
        secret: this.cfg.openApiSecret,
        // Enable all built-in resilience features from node-switchbot v4
        enableFallback: true, // Auto-fallback from BLE to API
        enableRetry: true, // Retry with exponential backoff
        enableCircuitBreaker: true, // Circuit breaker per connection type
        enableMetrics: true, // Connection tracking and statistics
        enableBLE: this.cfg.enableBLE !== false, // Use config value, default true
        scanDuration: 5000, // BLE scan duration in milliseconds
        ...(typeof (this.cfg as any)?.nodeClientConfig === 'object' && (this.cfg as any).nodeClientConfig),
      })
      this.logger?.info?.('SwitchBot client initialized with native resilience features')
    } catch (e) {
      this.logger?.warn?.('Failed to load node-switchbot; will use OpenAPI fallback:', e)
      this.client = null
    }
  }

  async getDevice(id: string): Promise<any> {
    if (this.client) {
      try {
        const devices = await this.client.discover()
        return devices.find((d: any) => d.id === id)
      } catch (e: any) {
        if (e instanceof SwitchbotAuthenticationError) {
          this.logger?.error?.(`Authentication error for getDevice(${id}):`, e.message)
          throw e
        } else if (e instanceof SwitchbotOperationError) {
          this.logger?.warn?.(`Operation error for getDevice(${id}):`, e.message, e.code)
          throw e
        } else if (e instanceof CharacteristicMissingError) {
          this.logger?.warn?.(`Characteristic missing for getDevice(${id}):`, e.characteristic)
          throw e
        } else {
          this.logger?.warn?.(`Client getDevice failed for ${id}:`, e)
          throw e
        }
      }
    }
    throw new SwitchbotOperationError('No SwitchBot client available', 'no_client')
  }

  async getDevices(): Promise<any[]> {
    if (this.client) {
      try {
        return await this.client.discover()
      } catch (e) {
        this.logger?.warn?.('Client getDevices failed:', e)
        throw e
      }
    }
    throw new SwitchbotOperationError('No SwitchBot client available', 'no_client')
  }

  async setDeviceState(id: string, body: any): Promise<any> {
    // Plugin-level debounce: coalesce rapid writes per device
    if (!this.writeDebounceMs || this.writeDebounceMs <= 0) {
      return this._doSetDeviceState(id, body)
    }

    return new Promise((resolve, reject) => {
      const existing = this.pendingWrites.get(id)
      if (existing) {
        existing.body = body
        existing.resolvers.push({ resolve, reject })
        return
      }

      const resolvers: Array<{ resolve: (v: any) => void, reject: (e: any) => void }> = [{ resolve, reject }]
      const timer = setTimeout(async () => {
        const entry = this.pendingWrites.get(id)
        if (!entry) {
          return
        }
        this.pendingWrites.delete(id)
        try {
          const out = await this._doSetDeviceState(id, entry.body)
          for (const r of entry.resolvers) r.resolve(out)
        } catch (e: any) {
          if (e instanceof SwitchbotAuthenticationError) {
            this.logger?.error?.(`Authentication error for setDeviceState(${id}):`, e.message)
          } else if (e instanceof SwitchbotOperationError) {
            this.logger?.warn?.(`Operation error for setDeviceState(${id}):`, e.message, e.code)
          } else if (e instanceof CharacteristicMissingError) {
            this.logger?.warn?.(`Characteristic missing for setDeviceState(${id}):`, e.characteristic)
          }
          for (const r of entry.resolvers) r.reject(e)
        }
      }, this.writeDebounceMs)

      this.pendingWrites.set(id, { timer, body, resolvers })
    })
  }

  private async _doSetDeviceState(id: string, body: any): Promise<any> {
    if (!this.client) {
      throw new SwitchbotOperationError('No SwitchBot client available for setDeviceState', 'no_client')
    }
    try {
      const devices = await this.client.discover()
      const device = devices.find((d: any) => d.id === id)
      if (!device) {
        throw new SwitchbotOperationError(`Device ${id} not found`, 'device_not_found')
      }
      const deviceType = (device.deviceType ?? '').toLowerCase()
      const command = body?.command
      if (!command) {
        throw new SwitchbotOperationError('No command specified in body', 'no_command')
      }
      const handler = getDeviceCommandHandler(deviceType, command)
      if (!handler) {
        throw new SwitchbotOperationError(`Unsupported command '${command}' for device type '${deviceType}'`, 'unsupported_command')
      }
      this.logger?.debug?.(`[${id}] Calling mapped command '${command}' for device type '${deviceType}'`)
      return await handler(device, body)
    } catch (e: any) {
      if (e instanceof SwitchbotAuthenticationError) {
        this.logger?.error?.(`Authentication error for setDeviceState(${id}):`, e.message)
        throw e
      } else if (e instanceof SwitchbotOperationError) {
        this.logger?.warn?.(`Operation error for setDeviceState(${id}):`, e.message, e.code)
        throw e
      } else if (e instanceof CharacteristicMissingError) {
        this.logger?.warn?.(`Characteristic missing for setDeviceState(${id}):`, e.characteristic)
        throw e
      } else {
        this.logger?.warn?.(`Device command failed for ${id}:`, e)
        throw e
      }
    }
  }

  async destroy(): Promise<void> {
    if (this.client?.cleanup) {
      await this.client.cleanup()
    }
    this.client = null
  }
}
