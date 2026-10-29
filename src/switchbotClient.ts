import type { SwitchBotPluginConfig } from './settings.js'
import type { SwitchBot } from 'node-switchbot'

import { getDeviceCommandHandler } from './deviceCommandMapper.js'
import { CharacteristicMissingError, SwitchbotAuthenticationError, SwitchbotOperationError } from './errors.js'

// Commands that set the same state and may replace each other while debounced
const WRITE_GROUP: Record<string, string> = { turnOn: 'power', turnOff: 'power', toggle: 'power' }

export interface ISwitchBotClient {
  init: () => Promise<void>
  getDevice: (id: string) => Promise<any>
  getDevices: () => Promise<any[]>
  setDeviceState: (id: string, body: any) => Promise<any>
  destroy: () => Promise<void>
}

/**
 * Thin wrapper around node-switchbot v4.0.0+
 * Leverages upstream resilience features (retry, circuit breaker, connection intelligence)
 * while maintaining plugin-specific features like write debouncing and OpenAPI fallback.
 */
export class SwitchBotClient implements ISwitchBotClient {
  private cfg: SwitchBotPluginConfig
  private client: SwitchBot | null = null
  private writeDebounceMs = 100
  private discoveryCacheTtlMs = 30_000
  private lastDiscoveryAt = 0
  private discoveryInFlight?: Promise<any[]>
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
    if (typeof (cfg as any)?.discoveryCacheTtlMs === 'number') {
      this.discoveryCacheTtlMs = Math.max(0, (cfg as any).discoveryCacheTtlMs)
    }
  }

  async init(): Promise<void> {
    if (this.client) {
      return
    }

    try {
      // Dynamic import of node-switchbot v4 with native resilience features
      const { SwitchBot } = await import('node-switchbot')
      const rawNodeClientConfig = typeof (this.cfg as any)?.nodeClientConfig === 'object' ? (this.cfg as any).nodeClientConfig : {}
      const scanTimeout = this.resolveScanTimeoutMs(rawNodeClientConfig)
      this.client = new SwitchBot({
        token: this.cfg.openApiToken,
        secret: this.cfg.openApiSecret,
        // Enable built-in resilience features from node-switchbot v4.
        enableFallback: true, // Auto-fallback from BLE to API
        enableRetry: true, // Retry with exponential backoff
        enableCircuitBreaker: true, // Circuit breaker per connection type
        enableConnectionIntelligence: true, // Connection tracking and route preference
        enableBLE: this.cfg.enableBLE !== false, // Use config value, default true
        scanTimeout,
        ...rawNodeClientConfig,
        logLevel: this.cfg.nodeSwitchBotLogLevel ?? rawNodeClientConfig.logLevel,
      })
      this.lastDiscoveryAt = 0
      this.logger?.info?.('SwitchBot client initialized with native resilience features')
    } catch (e) {
      this.logger?.warn?.('Failed to load node-switchbot; will use OpenAPI fallback:', e)
      this.client = null
    }
  }

  async getDevice(id: string): Promise<any> {
    if (this.client) {
      try {
        const fromManager = this.getManagedDevice(id)
        if (fromManager) {
          return fromManager
        }

        const devices = await this.ensureDiscovered(false)
        const fromDiscovery = devices.find((d: any) => d.id === id)
        if (fromDiscovery) {
          return fromDiscovery
        }

        const refreshDevices = await this.ensureDiscovered(true)
        return refreshDevices.find((d: any) => d.id === id)
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

  getCachedDevice(id: string): any {
    return this.getManagedDevice(id)
  }

  async getDevices(): Promise<any[]> {
    if (this.client) {
      try {
        const fromManager = this.getManagedDevices()
        if (fromManager.length > 0) {
          return fromManager
        }
        return await this.ensureDiscovered(false)
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

    // Coalesce repeated writes of the same operation only. Power commands share one key, so a
    // quick on/off/on sends the last one; other commands (brightness, color, position...) keep
    // their own key so a turnOn sent together with setBrightness is not dropped.
    const key = `${id}\u0000${WRITE_GROUP[body?.command] ?? body?.command ?? ''}`
    return new Promise((resolve, reject) => {
      const existing = this.pendingWrites.get(key)
      if (existing) {
        existing.body = body
        existing.resolvers.push({ resolve, reject })
        return
      }

      const resolvers: Array<{ resolve: (v: any) => void, reject: (e: any) => void }> = [{ resolve, reject }]
      const timer = setTimeout(async () => {
        const entry = this.pendingWrites.get(key)
        if (!entry) {
          return
        }
        this.pendingWrites.delete(key)
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

      this.pendingWrites.set(key, { timer, body, resolvers })
    })
  }

  private async _doSetDeviceState(id: string, body: any): Promise<any> {
    if (!this.client) {
      throw new SwitchbotOperationError('No SwitchBot client available for setDeviceState', 'no_client')
    }
    try {
      const device = await this.getDevice(id)
      if (!device) {
        throw new SwitchbotOperationError(`Device ${id} not found`, 'device_not_found')
      }
      const deviceType = (device.deviceType ?? '').toLowerCase()
      const command = body?.command
      if (!command) {
        throw new SwitchbotOperationError('No command specified in body', 'no_command')
      }
      const handler = getDeviceCommandHandler(deviceType, command, device)
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
    for (const [, pending] of this.pendingWrites) {
      clearTimeout(pending.timer)
      const err = new SwitchbotOperationError('Client destroyed before pending write was sent', 'client_destroyed')
      for (const r of pending.resolvers) {
        r.reject(err)
      }
    }
    this.pendingWrites.clear()

    if (this.client?.cleanup) {
      await this.client.cleanup()
    }
    this.client = null
    this.lastDiscoveryAt = 0
  }

  private resolveScanTimeoutMs(rawNodeClientConfig: Record<string, any>): number {
    if (typeof rawNodeClientConfig.scanTimeout === 'number' && Number.isFinite(rawNodeClientConfig.scanTimeout)) {
      return Math.max(500, rawNodeClientConfig.scanTimeout)
    }

    if (typeof rawNodeClientConfig.scanDuration === 'number' && Number.isFinite(rawNodeClientConfig.scanDuration)) {
      return Math.max(500, rawNodeClientConfig.scanDuration)
    }

    if (typeof (this.cfg as any)?.bleScanDurationSeconds === 'number') {
      return Math.max(500, (this.cfg as any).bleScanDurationSeconds * 1000)
    }

    return 5000
  }

  private getManagedDevice(id: string): any {
    const manager = (this.client as any)?.devices
    if (manager?.get) {
      return manager.get(id)
    }
    return undefined
  }

  private getManagedDevices(): any[] {
    const manager = (this.client as any)?.devices
    if (manager?.list) {
      const list = manager.list()
      return Array.isArray(list) ? list : []
    }
    return []
  }

  private async ensureDiscovered(force: boolean): Promise<any[]> {
    if (!this.client) {
      throw new SwitchbotOperationError('No SwitchBot client available', 'no_client')
    }

    const fromManager = this.getManagedDevices()
    const cacheValid = this.discoveryCacheTtlMs > 0 && (Date.now() - this.lastDiscoveryAt) < this.discoveryCacheTtlMs
    // A forced refresh (a device was not found) still respects the cache period once a discovery
    // has run: an offline device would otherwise trigger a BLE scan and an OpenAPI call per lookup.
    if (cacheValid && (!force || fromManager.length > 0)) {
      return fromManager
    }

    // Share one discovery between concurrent callers; each BLE scan also resets the last one's results.
    if (!this.discoveryInFlight) {
      const client = this.client
      this.discoveryInFlight = (async () => {
        try {
          const discovered = await client.discover()
          this.lastDiscoveryAt = Date.now()
          return discovered
        } finally {
          this.discoveryInFlight = undefined
        }
      })()
    }
    return this.discoveryInFlight
  }
}
