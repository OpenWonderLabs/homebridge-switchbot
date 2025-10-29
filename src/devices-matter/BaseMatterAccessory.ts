/**
 * Base Matter Accessory Class
 *
 * This base class implements the MatterAccessory interface and provides
 * common functionality that all Matter devices can use.
 *
 * Individual device types should extend this class and call super() with
 * the required configuration.
 */

import type { API, EndpointType, Logger, MatterAccessory } from 'homebridge'

import { deviceLoggingEnabled, deviceLoggingIsDebug, logDeviceStatusCode, rgb2hs } from '../utils.js'

export interface BaseMatterAccessoryConfig {
  uuid: string
  displayName: string
  deviceType: EndpointType
  serialNumber: string
  manufacturer: string
  model: string
  firmwareRevision: string
  hardwareRevision: string
  context?: Record<string, unknown>
  clusters?: MatterAccessory['clusters']
  handlers?: MatterAccessory['handlers']
  parts?: MatterAccessory['parts']
}

/**
 * Base class for all Matter accessories
 * Implements the MatterAccessory interface and provides common methods
 */
export abstract class BaseMatterAccessory implements MatterAccessory {
  // Required MatterAccessory properties
  public readonly uuid: string
  public readonly displayName: string
  public readonly deviceType: EndpointType
  public readonly serialNumber: string
  public readonly manufacturer: string
  public readonly model: string
  public readonly firmwareRevision: string
  public readonly hardwareRevision: string
  public readonly context: Record<string, unknown>
  public readonly clusters?: MatterAccessory['clusters']
  public readonly handlers?: MatterAccessory['handlers']
  public readonly parts?: MatterAccessory['parts']

  // Protected properties available to child classes
  protected readonly api: API
  protected readonly log: Logger

  constructor(
    api: API,
    log: Logger,
    config: BaseMatterAccessoryConfig,
  ) {
    this.api = api
    this.log = log

    // Set all required properties
    this.uuid = config.uuid
    this.displayName = config.displayName
    this.deviceType = config.deviceType
    this.serialNumber = config.serialNumber
    this.manufacturer = config.manufacturer
    this.model = config.model
    this.firmwareRevision = config.firmwareRevision
    this.hardwareRevision = config.hardwareRevision
    this.clusters = config.clusters
    this.handlers = config.handlers
    this.parts = config.parts

    // Set context with all metadata
    this.context = {
      serialNumber: this.serialNumber,
      manufacturer: this.manufacturer,
      model: this.model,
      firmwareRevision: this.firmwareRevision,
      hardwareRevision: this.hardwareRevision,
      ...config.context,
    }
  }

  /**
   * Update the accessory state
   * Helper method to update cluster attributes
   */
  protected async updateState(cluster: string, attributes: Record<string, unknown>): Promise<void> {
    await this.api.matter.updateAccessoryState(this.uuid, cluster, attributes)
    this.logDebug(`Updated ${cluster} state:`, attributes)
  }

  /**
   * Log helper methods
   */
  // Generic logging delegation: prefer platform-provided log helpers in
  // `this.context` (infoLog/debugLog/warnLog/errorLog) and fall back to the
  // local `this.log` methods when not available.
  protected logWith(level: 'info' | 'error' | 'debug' | 'warn', message: string, ...args: unknown[]): void {
    const ctx: any = this.context as any
    const map: Record<string, string> = {
      info: 'infoLog',
      error: 'errorLog',
      debug: 'debugLog',
      warn: 'warnLog',
    }
    const fn = ctx?.[map[level]]
    if (typeof fn === 'function') {
      fn(`[${this.displayName}] ${message}`, ...args)
      return
    }
    const local = (this.log as any)[level]
    if (typeof local === 'function') {
      local.call(this.log, `[${this.displayName}] ${message}`, ...args)
    }
  }

  protected logInfo(message: string, ...args: unknown[]): void {
    this.logWith('info', message, ...args)
  }

  protected logError(message: string, ...args: unknown[]): void {
    this.logWith('error', message, ...args)
  }

  protected logDebug(message: string, ...args: unknown[]): void {
    this.logWith('debug', message, ...args)
  }

  protected logWarn(message: string, ...args: unknown[]): void {
    this.logWith('warn', message, ...args)
  }

  /**
   * Logging helpers parity: allow Matter accessories to ask whether device-level
   * logging is enabled or in debug mode. These mirror the helpers used by the
   * HAP/IR device bases so behavior is consistent across platforms.
   */
  public async loggingIsDebug(): Promise<boolean> {
    const ctx: any = this.context as any
    return deviceLoggingIsDebug(ctx?.deviceLogging)
  }

  public async enablingDeviceLogging(): Promise<boolean> {
    const ctx: any = this.context as any
    return deviceLoggingEnabled(ctx?.deviceLogging, ctx?.platformLogging)
  }

  /**
   * Status code logging using shared helper
   */
  public async statusCode(statusCode: number, deviceId?: string, hubDeviceId?: string): Promise<void> {
    await logDeviceStatusCode(
      statusCode,
      {
        debugLog: this.logDebug.bind(this),
        errorLog: this.logError.bind(this),
        infoLog: this.logInfo.bind(this),
      },
      deviceId ?? (this.context as any)?.deviceId,
      hubDeviceId ?? (this.context as any)?.hubDeviceId,
    )
  }

  /**
   * Convenience helpers that delegate OpenAPI/BLE commands to platform-provided
   * functions that are injected into the accessory `context` by
   * `platform-matter` when the accessory is created from a discovered device.
   *
   * These methods are intentionally thin wrappers — the platform controls
   * retries, discovery and client lifecycle via the helper functions.
   */
  protected async sendOpenAPICommand(command: string, parameter = 'default'): Promise<any> {
    const ctx: any = this.context as any
    const fn = ctx?.sendOpenAPI
    if (typeof fn === 'function') {
      return fn(command, parameter)
    }
    throw new Error('OpenAPI helper not available')
  }

  protected async sendBLECommand(methodName: string, ...args: any[]): Promise<any> {
    const ctx: any = this.context as any
    const fn = ctx?.sendBLE
    if (typeof fn === 'function') {
      return fn(methodName, ...args)
    }
    throw new Error('BLE helper not available')
  }

  public async sendOnCommand(deviceId?: string): Promise<void> {
    const ctx: any = this.context as any
    const id = deviceId ?? ctx?.deviceId
    try {
      if (ctx?.connectionType === 'BLE') {
        await this.sendBLECommand('turnOn')
      } else {
        await this.sendOpenAPICommand('turnOn')
      }
      // update our matter state
      await this.updateState(this.api.matter.clusterNames.OnOff, { onOff: true })
      this.logInfo(`sendOnCommand successful for ${id}`)
    } catch (e: any) {
      this.logError(`sendOnCommand failed for ${id}: ${String(e?.message ?? e)}`)
      throw e
    }
  }

  public async sendOffCommand(deviceId?: string): Promise<void> {
    const ctx: any = this.context as any
    const id = deviceId ?? ctx?.deviceId
    try {
      if (ctx?.connectionType === 'BLE') {
        await this.sendBLECommand('turnOff')
      } else {
        await this.sendOpenAPICommand('turnOff')
      }
      await this.updateState(this.api.matter.clusterNames.OnOff, { onOff: false })
      this.logInfo(`sendOffCommand successful for ${id}`)
    } catch (e: any) {
      this.logError(`sendOffCommand failed for ${id}: ${String(e?.message ?? e)}`)
      throw e
    }
  }

  public async sendSetBrightness(percent: number, deviceId?: string): Promise<void> {
    const ctx: any = this.context as any
    const id = deviceId ?? ctx?.deviceId
    try {
      if (ctx?.connectionType === 'BLE') {
        await this.sendBLECommand('setBrightness', percent)
      } else {
        await this.sendOpenAPICommand('setBrightness', String(percent))
      }
      const level = Math.round((percent / 100) * 254)
      await this.updateState(this.api.matter.clusterNames.LevelControl, { currentLevel: level })
      this.logInfo(`sendSetBrightness successful for ${id}: ${percent}%`)
    } catch (e: any) {
      this.logError(`sendSetBrightness failed for ${id}: ${String(e?.message ?? e)}`)
      throw e
    }
  }

  public async sendSetColor(r: number, g: number, b: number, deviceId?: string): Promise<void> {
    const ctx: any = this.context as any
    const id = deviceId ?? ctx?.deviceId
    try {
      if (ctx?.connectionType === 'BLE') {
        await this.sendBLECommand('setRGB', r, g, b)
      } else {
        await this.sendOpenAPICommand('setColor', `${r}:${g}:${b}`)
      }
      // Convert to hue/sat for matter state update
      const [h, s] = rgb2hs(r, g, b)
      await this.updateState(this.api.matter.clusterNames.ColorControl, { currentHue: Math.round((h / 360) * 254), currentSaturation: Math.round((s / 100) * 254) })
      this.logInfo(`sendSetColor successful for ${id}: ${r},${g},${b}`)
    } catch (e: any) {
      this.logError(`sendSetColor failed for ${id}: ${String(e?.message ?? e)}`)
      throw e
    }
  }

  public async sendSetColorTemperature(kelvin: number, deviceId?: string): Promise<void> {
    const ctx: any = this.context as any
    const id = deviceId ?? ctx?.deviceId
    try {
      if (ctx?.connectionType === 'BLE') {
        await this.sendBLECommand('setColorTemperature', kelvin)
      } else {
        await this.sendOpenAPICommand('setColorTemperature', `${kelvin}`)
      }
      const mireds = Math.round(1000000 / kelvin)
      await this.updateState(this.api.matter.clusterNames.ColorControl, { colorTemperatureMireds: mireds })
      this.logInfo(`sendSetColorTemperature successful for ${id}: ${kelvin}K`)
    } catch (e: any) {
      this.logError(`sendSetColorTemperature failed for ${id}: ${String(e?.message ?? e)}`)
      throw e
    }
  }

  /**
   * Convert this class instance to a plain MatterAccessory object
   * This is what gets registered with Homebridge
   */
  public toAccessory(): MatterAccessory {
    return {
      uuid: this.uuid,
      displayName: this.displayName,
      deviceType: this.deviceType,
      serialNumber: this.serialNumber,
      manufacturer: this.manufacturer,
      model: this.model,
      firmwareRevision: this.firmwareRevision,
      hardwareRevision: this.hardwareRevision,
      context: this.context,
      clusters: this.clusters,
      handlers: this.handlers,
      parts: this.parts,
    }
  }
}
