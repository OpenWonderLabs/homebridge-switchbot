// Utility: Validate BLE response length before parsing
/* eslint-disable style/max-statements-per-line, unused-imports/no-unused-vars */

/**
 * Status Update Strategy for BLE and OpenAPI
 *
 * BLE (Bluetooth Low Energy):
 * - Primary: Subscribes to device notifications for real-time state updates using _subscribeBLENotifications().
 * - Fallback: (Recommended) Optionally, a low-frequency polling timer (e.g., every 5–10 minutes) can call getState() to recover from missed notifications or connection loss.
 *   - This ensures state stays in sync even if notifications are unreliable or the device reconnects.
 *   - Polling should be infrequent to avoid battery drain and BLE congestion.
 *
 * BLE Polling Options (config & per-device):
 * - blePollingEnabled (boolean): Enable/disable BLE polling fallback (default: true).
 * - blePollIntervalMs (integer): Polling interval in ms (default: 600000, min: 60000).
 *   - These can be set globally in config or overridden per device.
 *   - Setting a lower interval increases update frequency but may drain battery faster.
 *   - Setting a higher interval reduces battery impact but may delay state recovery.
 *
 * OpenAPI (Cloud):
 * - Uses periodic polling to fetch device status at a configurable interval (default: 300 seconds, can be set per device or platform).
 * - Platform supports batched refresh (matterBatchEnabled, matterBatchRefreshRate, etc.) and per-device refreshRate overrides.
 * - Rate limiting:
 *   - Default daily limit: 10,000 OpenAPI requests (configurable via options.dailyApiLimit).
 *   - Reserve: 1,000 requests for user commands (options.dailyApiReserveForCommands).
 *   - When the remaining budget reaches the reserve, background polling/discovery pauses, but user commands and webhooks continue.
 *   - Counter resets at local or UTC midnight (options.dailyApiResetLocalMidnight).
 *
 * Best Practices:
 * - BLE: Use notifications for instant updates, add periodic polling as a safety net.
 * - OpenAPI: Tune polling intervals to balance freshness and rate limit budget.
 * - Both: Document and expose polling intervals and rate limit settings in config.
 *
 * See README.md and docs for more details.
 */
import type { SwitchBotPluginConfig } from '../settings.js'

import { Buffer } from 'node:buffer'

import { MATTER_ATTRIBUTE_IDS, MATTER_CLUSTER_IDS } from '../utils.js'
import { DeviceBase } from './deviceBase.js'

function validateBLEResponseLength(buf: Buffer | Uint8Array | any[], expected: number, context = '', log: import('homebridge').Logger): boolean {
  if (!buf || typeof buf.length !== 'number' || buf.length !== expected) {
    log.warn(`[BLE] Invalid response length${context ? ` for ${context}` : ''}: expected ${expected}, got ${buf?.length}`)
    return false
  }
  return true
}

// BLE notification handling: per-command notification futures and unsolicited notification logging
const BLE_NOTIFICATION_HANDLERS = new Map<string, (payload: Buffer) => void>()

// Module-scope regex pattern to avoid recompilation
const HEX_COLOR_REGEX = /^#?[0-9A-F]{6}$/i

export class GenericDevice extends DeviceBase {
  protected log: import('homebridge').Logger
  private _blePollTimer: NodeJS.Timeout | null = null
  private _blePollIntervalMs: number
  private _blePollingEnabled: boolean

  constructor(opts: any, cfg: SwitchBotPluginConfig) {
    super(opts, cfg)
    // Require logger from opts or cfg
    this.log = opts?.log || cfg?.log
    if (!this.log) {
      throw new Error('Device requires a logger (Homebridge logger) in opts or cfg')
    }
    // If BLE encryptionKey/keyId provided, set on node-switchbot device instance if possible
    if (opts.encryptionKey && this.client && typeof this.client.devices?.get === 'function') {
      try {
        const dev = this.client.devices.get(opts.id)
        if (dev && typeof dev.setKey === 'function') {
          dev.setKey({
            encryptionKey: opts.encryptionKey,
            keyId: opts.keyId || undefined,
          })
        }
      } catch (e) {
        // ignore if device not found or setKey not available
      }
    }
    // BLE polling config: allow override via opts.blePollingEnabled/blePollIntervalMs or cfg.blePollingEnabled/blePollIntervalMs
    this._blePollingEnabled = opts?.blePollingEnabled ?? cfg?.blePollingEnabled ?? true
    let pollMs = opts?.blePollIntervalMs ?? cfg?.blePollIntervalMs ?? 10 * 60 * 1000 // default: 10 min
    if (typeof pollMs !== 'number' || Number.isNaN(pollMs) || pollMs < 60000) {
      this.log.warn(`[BLE] Invalid blePollIntervalMs (${pollMs}), using minimum 60000ms`)
      pollMs = 60000
    }
    this._blePollIntervalMs = pollMs
    // Subscribe to BLE notifications if supported (node-switchbot v4+)
    this._subscribeBLENotifications()
    // Start BLE polling fallback if enabled
    if (this._blePollingEnabled) {
      this._startBlePolling()
    }
  }

  /**
   * Start periodic BLE polling as a fallback to notifications.
   */
  private _startBlePolling() {
    if (this._blePollTimer) {
      clearInterval(this._blePollTimer)
    }
    this._blePollTimer = setInterval(async () => {
      try {
        this.log.debug(`[BLE] Polling getState() for device ${this.opts.id}`)
        await this.getState()
      } catch (e) {
        this.log.debug(`[BLE] Polling getState() failed for device ${this.opts.id}:`, (e as Error)?.message)
      }
    }, this._blePollIntervalMs)
  }

  /**
   * Clean up BLE polling timer on destroy.
   */
  async destroy(): Promise<void> {
    if (this._blePollTimer) {
      clearInterval(this._blePollTimer)
      this._blePollTimer = null
    }
    // Only call super.destroy if DeviceBase.prototype.destroy is a function and not this method itself
    const baseProto = Object.getPrototypeOf(GenericDevice.prototype)
    if (typeof baseProto.destroy === 'function' && baseProto.destroy !== GenericDevice.prototype.destroy) {
      await super.destroy()
    }
  }

  /**
   * Subscribe to BLE notifications for this device (if supported by node-switchbot)
   * Logs unsolicited notifications and enables per-command notification futures.
   */
  private async _subscribeBLENotifications() {
    if (!this.client || typeof this.client.devices?.get !== 'function') { return }
    const dev = this.client.devices.get(this.opts.id)
    if (!dev || typeof dev.mac !== 'string' || !dev.mac) { return }
    // Only subscribe once per device
    if (BLE_NOTIFICATION_HANDLERS.has(dev.mac)) { return }
    if (typeof dev.subscribeNotifications === 'function') {
      const handler = (payload: Buffer) => {
        // If a per-command notification future is waiting, let node-switchbot handle it
        // Otherwise, log unsolicited notification
        if (payload && payload.length > 0) {
          // Unsolicited notification logging
          // (node-switchbot will resolve per-command futures internally)
          this.log.debug(`[BLE] Unsolicited notification from ${dev.mac}: ${payload.toString('hex')}`)
        }
      }
      try {
        // Subscribe and remember handler for possible cleanup
        await dev.subscribeNotifications(handler)
        BLE_NOTIFICATION_HANDLERS.set(dev.mac, handler)
      } catch (e) {
        // ignore if subscription fails
      }
    }
  }

  /**
   * Await a BLE notification for this device (for advanced use in subclasses)
   * Returns the notification payload or throws on timeout.
   */
  protected async _awaitBLENotification(timeoutMs = 5000): Promise<Buffer> {
    if (!this.client || typeof this.client.devices?.get !== 'function') { throw new Error('No BLE client/device') }
    const dev = this.client.devices.get(this.opts.id)
    if (!dev || typeof dev.mac !== 'string' || !dev.mac) { throw new Error('No BLE MAC for device') }
    if (typeof dev.bleConnection?.sendCommand !== 'function') { throw new TypeError('BLE connection does not support sendCommand') }
    // This is a low-level utility; in most cases, node-switchbot handles notification futures for commands
    // Here, we expose a direct await for advanced use
    return new Promise<Buffer>((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined
      const handler = (payload: Buffer) => {
        clearTimeout(timer)
        dev.bleConnection?.unsubscribeNotifications(dev.mac, handler)
        resolve(payload)
      }
      dev.bleConnection?.subscribeNotifications(dev.mac, handler).then(() => {
        timer = setTimeout(() => {
          dev.bleConnection?.unsubscribeNotifications(dev.mac, handler)
          reject(new Error('BLE notification timeout'))
        }, timeoutMs)
      }).catch(reject)
    })
  }

  async getState(): Promise<any> {
    // Default: return minimal info; implementations should override
    if (this.client && typeof this.client.getDevice === 'function') {
      try {
        const raw = await this.client.getDevice(this.opts.id)
        // If this is a BLE buffer/array, validate length (common BLE status: 12 bytes, but may vary by device)
        if (raw && (raw instanceof Buffer || Array.isArray(raw) || raw instanceof Uint8Array)) {
          // Default to 12, override per device if needed
          if (!validateBLEResponseLength(raw, 12, this.opts.type, this.log)) {
            return { id: this.opts.id, type: this.opts.type, error: 'invalid_ble_response_length', raw }
          }
        }
        // Normalize common response shapes
        try {
          const device = raw?.body ?? raw
          return device
        } catch (e) {
          return raw
        }
      } catch (e) {
        // ignore and fallback
      }
    }
    return { id: this.opts.id, type: this.opts.type }
  }

  async setState(change: any): Promise<any> {
    // Apply change via SwitchBot API in real implementation
    // Translate common high-level changes into SwitchBot OpenAPI commands
    if (!this.client) {
      return { success: false, reason: 'no client', change }
    }

    const cmdBody: any = {}

    if (typeof change.on === 'boolean') {
      cmdBody.command = change.on ? 'turnOn' : 'turnOff'
      cmdBody.parameter = 'default'
      cmdBody.commandType = 'command'
    } else if (typeof change.brightness === 'number') {
      const v = Math.max(0, Math.min(100, Number(change.brightness)))
      cmdBody.command = 'setBrightness'
      cmdBody.parameter = String(v)
      cmdBody.commandType = 'command'
    } else if (typeof change.speed === 'number') {
      const v = Math.max(0, Math.min(100, Number(change.speed)))
      cmdBody.command = 'setFanSpeed'
      cmdBody.parameter = String(v)
      cmdBody.commandType = 'command'
    } else if (typeof change.position === 'number') {
      const v = Math.max(0, Math.min(100, Number(change.position)))
      cmdBody.command = 'setPosition'
      cmdBody.parameter = String(v)
      cmdBody.commandType = 'command'
    } else if (typeof change.locked === 'boolean') {
      cmdBody.command = change.locked ? 'lock' : 'unlock'
      cmdBody.parameter = 'default'
      cmdBody.commandType = 'command'
    } else if (typeof change.start === 'boolean') {
      cmdBody.command = change.start ? 'start' : 'stop'
      cmdBody.parameter = 'default'
      cmdBody.commandType = 'command'
    } else {
      // If caller supplied an explicit command body, pass through
      if (change && typeof change.command === 'string') {
        Object.assign(cmdBody, change)
      } else {
        // Fallback: send raw change to client setDeviceState
        try {
          if (typeof this.client.setDeviceState === 'function') {
            return await this.client.setDeviceState(this.opts.id, change)
          }
          if (typeof this.client.sendCommand === 'function') {
            return await this.client.sendCommand(this.opts.id, change)
          }
        } catch (err) {
          const e = err as any
          return { success: false, reason: e?.message ?? String(e) }
        }
        return { success: false, reason: 'unsupported change', change }
      }
    }

    try {
      return await this.client.setDeviceState(this.opts.id, cmdBody)
    } catch (err) {
      // try alternative client API if available
      try {
        if (typeof this.client.sendCommand === 'function') {
          return await this.client.sendCommand(this.opts.id, cmdBody)
        }
      } catch (e2) {
        // ignore
      }
      const e = err as any
      return { success: false, reason: e?.message ?? String(e) }
    }
  }

  createHAPAccessory(api: any): any {
    // Default HAP descriptor: a Switch service with On characteristic
    return {
      services: [
        {
          type: 'Switch',
          characteristics: {
            On: {
              get: async () => {
                const s = await this.getState()
                return !!(s && (s.on === true || s.state === 'on' || s.power === 'on'))
              },
              set: async (v: any) => {
                await this.setState({ on: !!v })
              },
            },
          },
        },
      ],
    }
  }

  // Default Matter descriptor mirrors HAP descriptor structure so the
  // platform can construct a Matter accessory representation when
  // Homebridge Matter APIs are available. Device subclasses may override
  // this to provide Matter-specific clusters/attributes if desired.
  async createMatterAccessory(api: any): Promise<any> {
    // Dynamically detect features from getState()
    const state = await this.getState()
    const clusters: any[] = []

    // On/Off (Switch/Plug/Generic)
    if ('on' in state || 'power' in state || 'state' in state) {
      clusters.push({
        type: 'OnOff',
        clusterId: MATTER_CLUSTER_IDS.OnOff,
        attributes: {
          onOff: { read: async () => !!(await this.getState()).on || (await this.getState()).power === 'on' || (await this.getState()).state === 'on', write: async (v: any) => this.setState({ on: !!v }) },
          [MATTER_ATTRIBUTE_IDS.OnOff.OnOff]: { read: async () => !!(await this.getState()).on || (await this.getState()).power === 'on' || (await this.getState()).state === 'on', write: async (v: any) => this.setState({ on: !!v }) },
        },
      })
    }

    // Brightness (Light)
    if ('brightness' in state) {
      clusters.push({
        type: 'LevelControl',
        clusterId: MATTER_CLUSTER_IDS.LevelControl,
        attributes: {
          currentLevel: { read: async () => (await this.getState()).brightness ?? 100, write: async (v: any) => this.setState({ brightness: Number(v) }) },
          [MATTER_ATTRIBUTE_IDS.LevelControl.CurrentLevel]: { read: async () => (await this.getState()).brightness ?? 100, write: async (v: any) => this.setState({ brightness: Number(v) }) },
        },
      })
    }

    // Color (Light)
    if ('hue' in state && 'saturation' in state) {
      clusters.push({
        type: 'ColorControl',
        clusterId: MATTER_CLUSTER_IDS.ColorControl,
        attributes: {
          colorMode: { read: async () => 0 },
          colorHue: { read: async () => (await this.getState()).hue ?? 0, write: async (v: any) => this.setState({ hue: Number(v) }) },
          [MATTER_ATTRIBUTE_IDS.ColorControl.CurrentHue]: { read: async () => (await this.getState()).hue ?? 0, write: async (v: any) => this.setState({ hue: Number(v) }) },
          colorSaturation: { read: async () => (await this.getState()).saturation ?? 0, write: async (v: any) => this.setState({ saturation: Number(v) }) },
          [MATTER_ATTRIBUTE_IDS.ColorControl.CurrentSaturation]: { read: async () => (await this.getState()).saturation ?? 0, write: async (v: any) => this.setState({ saturation: Number(v) }) },
          ...(typeof state.colorTemperature === 'number' || typeof state.kelvin === 'number'
            ? {
                colorTemperature: { read: async () => typeof (await this.getState()).colorTemperature === 'number' ? (await this.getState()).colorTemperature : Math.round(1000000 / ((await this.getState()).kelvin ?? 2500)), write: async (v: any) => this.setState({ colorTemperature: Number(v) }) },
                [MATTER_ATTRIBUTE_IDS.ColorControl.ColorTemperatureMireds]: { read: async () => typeof (await this.getState()).colorTemperature === 'number' ? (await this.getState()).colorTemperature : Math.round(1000000 / ((await this.getState()).kelvin ?? 2500)), write: async (v: any) => this.setState({ colorTemperature: Number(v) }) },
              }
            : {}),
        },
      })
    }

    // Temperature sensor
    if ('temperature' in state) {
      clusters.push({
        type: 'TemperatureMeasurement',
        // No clusterId, not present in MATTER_CLUSTER_IDS
        attributes: {
          measuredValue: { read: async () => (await this.getState()).temperature ?? 0 },
        },
      })
    }

    // Humidity sensor
    if ('humidity' in state) {
      clusters.push({
        type: 'RelativeHumidityMeasurement',
        clusterId: MATTER_CLUSTER_IDS.RelativeHumidityMeasurement,
        attributes: {
          measuredValue: { read: async () => (await this.getState()).humidity ?? 0 },
        },
      })
    }

    // CO2 sensor
    if ('CO2' in state) {
      clusters.push({
        type: 'AirQuality',
        attributes: {
          CO2: { read: async () => (await this.getState()).CO2 ?? 0 },
        },
      })
    }

    // Lock
    if ('lockState' in state || 'locked' in state) {
      clusters.push({
        type: 'DoorLock',
        clusterId: MATTER_CLUSTER_IDS.DoorLock,
        attributes: {
          lockState: { read: async () => (await this.getState()).lockState ?? (await this.getState()).locked ? 1 : 0, write: async (v: any) => this.setState({ locked: !!v }) },
        },
      })
    }

    // Motion sensor
    if ('moveDetected' in state || 'motion' in state) {
      clusters.push({
        type: 'OccupancySensing',
        // No clusterId, not present in MATTER_CLUSTER_IDS
        attributes: {
          occupancy: { read: async () => (await this.getState()).moveDetected === true || (await this.getState()).motion === true ? 1 : 0 },
        },
      })
    }

    // Contact sensor
    if ('openState' in state || 'contact' in state || 'open' in state) {
      clusters.push({
        type: 'BooleanState',
        // No clusterId, not present in MATTER_CLUSTER_IDS
        attributes: {
          stateValue: { read: async () => (await this.getState()).openState === 'open' || (await this.getState()).open === true ? 1 : 0 },
        },
      })
    }

    // Leak sensor
    if ('leak' in state || 'status' in state) {
      clusters.push({
        type: 'LeakSensor',
        attributes: {
          leakDetected: { read: async () => (await this.getState()).leak === true || (await this.getState()).status === 1 ? 1 : 0 },
        },
      })
    }

    // Energy monitoring (Plug)
    if ('voltage' in state || 'power' in state || 'electricCurrent' in state) {
      clusters.push({
        type: 'ElectricalMeasurement',
        // No clusterId, not present in MATTER_CLUSTER_IDS
        attributes: {
          voltage: { read: async () => (await this.getState()).voltage ?? 0 },
          power: { read: async () => (await this.getState()).power ?? 0 },
          electricCurrent: { read: async () => (await this.getState()).electricCurrent ?? 0 },
        },
      })
    }

    // Fan
    if ('speed' in state || 'fanSpeed' in state) {
      clusters.push({
        type: 'FanControl',
        clusterId: MATTER_CLUSTER_IDS.FanControl,
        attributes: {
          speedCurrent: { read: async () => (await this.getState()).speed ?? (await this.getState()).fanSpeed ?? 0, write: async (v: any) => this.setState({ speed: Number(v) }) },
        },
      })
    }

    // Vacuum
    if ('workingStatus' in state) {
      clusters.push({
        type: 'RobotVacuumCleaner',
        attributes: {
          workingStatus: { read: async () => (await this.getState()).workingStatus ?? 'StandBy' },
        },
      })
    }

    return {
      id: this.opts.id,
      name: this.opts.name ?? this.opts.type,
      protocol: 'matter',
      clusters,
    }
  }
}

// Specific device classes can extend GenericDevice for custom behavior.
export class BotDevice extends GenericDevice {}

export class CurtainDevice extends GenericDevice {
  createHAPAccessory(api: any) {
    return {
      services: [
        {
          type: 'WindowCovering',
          characteristics: {
            CurrentPosition: {
              get: async () => {
                const s = await this.getState()
                return typeof s.position === 'number' ? s.position : 0
              },
            },
            TargetPosition: {
              get: async () => {
                const s = await this.getState()
                return typeof s.position === 'number' ? s.position : 0
              },
              set: async (v: any) => {
                await this.setState({ position: Number(v) })
              },
            },
          },
        },
      ],
    }
  }

  // Matter-specific descriptor for Curtain (WindowCovering cluster) with new attributes
  async createMatterAccessory(api: any): Promise<any> {
    // Get current state for dynamic attributes
    const state = await this.getState()
    // Compose attributes for Matter WindowCovering cluster
    const attributes: Record<string, any> = {
      currentPositionLiftPercent100ths: {
        read: async () => {
          const s = await this.getState()
          return typeof s.position === 'number' ? Math.round(s.position * 100) : 0
        },
        write: undefined,
      },
      targetPositionLiftPercent100ths: {
        read: async () => {
          const s = await this.getState()
          return typeof s.position === 'number' ? Math.round(s.position * 100) : 0
        },
        write: async (v: any) => this.setState({ position: Math.round(Number(v) / 100) }),
      },
      operationalStatus: {
        read: async () => state.operationalStatus ?? { global: 0, lift: 0, tilt: 0 },
        write: undefined,
      },
      endProductType: {
        read: async () => state.endProductType ?? 0,
        write: undefined,
      },
      configStatus: {
        read: async () => state.configStatus ?? {
          operational: true,
          onlineReserved: true,
          liftMovementReversed: false,
          liftPositionAware: true,
          tiltPositionAware: false,
          liftEncoderControlled: true,
          tiltEncoderControlled: false,
        },
        write: undefined,
      },
    }
    // If tilt is supported, add tilt attributes
    if (typeof state.tilt === 'number') {
      attributes.currentPositionTiltPercent100ths = {
        read: async () => {
          const s = await this.getState()
          return typeof s.tilt === 'number' ? Math.round(s.tilt * 100) : 0
        },
        write: undefined,
      }
      attributes.targetPositionTiltPercent100ths = {
        read: async () => {
          const s = await this.getState()
          return typeof s.tilt === 'number' ? Math.round(s.tilt * 100) : 0
        },
        write: async (v: any) => this.setState({ tilt: Math.round(Number(v) / 100) }),
      }
    }
    const windowCoveringCluster = {
      type: 'WindowCovering',
      clusterId: MATTER_CLUSTER_IDS.WindowCovering,
      attributes,
    }
    // Provide both array and named property for clusters for compatibility with test expectations
    const clustersArr: any[] = [windowCoveringCluster]
    const clusters: any = [...clustersArr]
    // Always set clusters.windowCovering to the WindowCovering cluster by clusterId
    const foundWC = clustersArr.find((c: any) => c && c.clusterId === MATTER_CLUSTER_IDS.WindowCovering)
    clusters.windowCovering = foundWC || null
    return {
      id: this.opts.id,
      name: this.opts.name ?? this.opts.type,
      protocol: 'matter',
      clusters,
    }
  }
}

export class FanDevice extends GenericDevice {
  createHAPAccessory(api: any) {
    return {
      services: [
        {
          type: 'Fan',
          characteristics: {
            On: {
              get: async () => {
                const s = await this.getState()
                return !!(s && (s.on === true || s.state === 'on'))
              },
              set: async (v: any) => {
                await this.setState({ on: !!v })
              },
            },
            RotationSpeed: {
              get: async () => {
                const s = await this.getState()
                return typeof s.speed === 'number' ? s.speed : 0
              },
              set: async (v: any) => {
                await this.setState({ speed: Number(v) })
              },
            },
          },
        },
      ],
    }
  }

  async setState(change: any): Promise<any> {
    if (!this.client) { return { success: false, reason: 'no client' } }

    // Oscillation support
    if (typeof change.oscillate === 'boolean') {
      const body = { command: 'setOscillation', parameter: change.oscillate ? 'on' : 'off', commandType: 'command' }
      try {
        return await this.client.setDeviceState(this.opts.id, body)
      } catch (err) {
        try {
          if (typeof this.client.sendCommand === 'function') { return await this.client.sendCommand(this.opts.id, body) }
        } catch (e) {}
        const e = err as any
        return { success: false, reason: e?.message ?? String(e) }
      }
    }

    // Swing / sweep support (angle or mode)
    if (change && (typeof change.swing === 'boolean' || typeof change.swingAngle === 'number' || typeof change.swingMode === 'string')) {
      let param: string = 'default'
      if (typeof change.swingMode === 'string') { param = change.swingMode } else if (typeof change.swingAngle === 'number') { param = String(Number(change.swingAngle)) } else {
        param = change.swing ? 'on' : 'off'
      }

      const body = { command: 'setSwing', parameter: param, commandType: 'command' }
      try {
        return await this.client.setDeviceState(this.opts.id, body)
      } catch (err) {
        try {
          if (typeof this.client.sendCommand === 'function') { return await this.client.sendCommand(this.opts.id, body) }
        } catch (e) {}
        const e = err as any
        return { success: false, reason: e?.message ?? String(e) }
      }
    }

    return super.setState(change)
  }

  // Matter-specific descriptor for Fan
  createMatterAccessory(api: any): any {
    return {
      id: this.opts.id,
      name: this.opts.name ?? this.opts.type,
      protocol: 'matter',
      clusters: [
        {
          // OnOff cluster
          type: 'OnOff',
          clusterId: MATTER_CLUSTER_IDS.OnOff,
          attributes: {
            onOff: { read: async () => { const s = await this.getState(); return !!(s && (s.on === true || s.state === 'on')) }, write: async (v: any) => this.setState({ on: !!v }) },
            // numeric attribute id for onOff
            [MATTER_ATTRIBUTE_IDS.OnOff.OnOff]: { read: async () => { const s = await this.getState(); return !!(s && (s.on === true || s.state === 'on')) }, write: async (v: any) => this.setState({ on: !!v }) },
          },
        },
        {
          // Fan Control cluster
          type: 'FanControl',
          clusterId: MATTER_CLUSTER_IDS.FanControl,
          attributes: {
            rotationSpeed: { read: async () => { const s = await this.getState(); return typeof s.speed === 'number' ? s.speed : 0 }, write: async (v: any) => this.setState({ speed: Number(v) }) },
            [MATTER_ATTRIBUTE_IDS.FanControl.SpeedCurrent]: { read: async () => { const s = await this.getState(); return typeof s.speed === 'number' ? s.speed : 0 }, write: async (v: any) => this.setState({ speed: Number(v) }) },
            oscillation: { read: async () => { const s = await this.getState(); return !!s?.oscillating }, write: async (v: any) => this.setState({ oscillate: !!v }) },
            swingMode: { read: async () => { const s = await this.getState(); return s?.swingMode ?? null }, write: async (v: any) => this.setState({ swingMode: v }) },
          },
        },
      ],
    }
  }
}
export class LightDevice extends GenericDevice {
  createHAPAccessory(api: any) {
    return {
      services: [
        {
          type: 'Lightbulb',
          characteristics: {
            On: {
              get: async () => {
                const s = await this.getState()
                return !!(s && (s.on === true || s.state === 'on' || s.power === 'on'))
              },
              set: async (v: any) => {
                await this.setState({ on: !!v })
              },
            },
            Brightness: {
              props: { minValue: 0, maxValue: 100, minStep: 1 },
              get: async () => {
                const s = await this.getState()
                return typeof s.brightness === 'number' ? s.brightness : 100
              },
              set: async (v: any) => {
                await this.setState({ brightness: Number(v) })
              },
            },
            Hue: {
              props: { minValue: 0, maxValue: 360, minStep: 1 },
              get: async () => {
                const s = await this.getState()
                // prefer explicit hue if provided
                if (s && typeof s.hue === 'number') { return s.hue }
                // try HSV from color hex
                const hex = s?.color || s?.colorHex || s?.colour
                if (typeof hex === 'string' && HEX_COLOR_REGEX.test(hex)) {
                  const h = (() => {
                    const hsl = (h: number, s: number, l: number) => ({ h, s, l })
                    // convert hex -> rgb -> hsv
                    const cleaned = hex.replace('#', '')
                    const r = Number.parseInt(cleaned.substr(0, 2), 16) / 255
                    const g = Number.parseInt(cleaned.substr(2, 2), 16) / 255
                    const b = Number.parseInt(cleaned.substr(4, 2), 16) / 255
                    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b)
                    const d = mx - mn
                    if (d === 0) { return 0 }
                    let hue = 0
                    switch (mx) {
                      case r: hue = ((g - b) / d) % 6; break
                      case g: hue = (b - r) / d + 2; break
                      case b: hue = (r - g) / d + 4; break
                    }
                    hue = Math.round(hue * 60)
                    if (hue < 0) { hue += 360 }
                    return hue
                  })()
                  return h
                }
                return 0
              },
              set: async (v: any) => {
                await this.setState({ hue: Number(v) })
              },
            },
            Saturation: {
              props: { minValue: 0, maxValue: 100, minStep: 1 },
              get: async () => {
                const s = await this.getState()
                if (s && typeof s.saturation === 'number') { return s.saturation }
                // if color hex is available, derive saturation from rgb
                const hex = s?.color || s?.colorHex || s?.colour
                if (typeof hex === 'string' && HEX_COLOR_REGEX.test(hex)) {
                  const cleaned = hex.replace('#', '')
                  const r = Number.parseInt(cleaned.substr(0, 2), 16) / 255
                  const g = Number.parseInt(cleaned.substr(2, 2), 16) / 255
                  const b = Number.parseInt(cleaned.substr(4, 2), 16) / 255
                  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b)
                  const d = mx - mn
                  const sat = mx === 0 ? 0 : Math.round((d / mx) * 100)
                  return sat
                }
                return 0
              },
              set: async (v: any) => {
                await this.setState({ saturation: Number(v) })
              },
            },
            ColorTemperature: {
              props: { minValue: 153, maxValue: 500, minStep: 1 },
              get: async () => {
                const s = await this.getState()
                // prefer mired if provided
                if (s && typeof s.colorTemperature === 'number') { return s.colorTemperature }
                if (s && typeof s.color_temp === 'number') { return s.color_temp }
                // some devices provide kelvin
                if (s && typeof s.kelvin === 'number' && s.kelvin > 0) {
                  return Math.round(1000000 / s.kelvin)
                }
                return 400
              },
              set: async (v: any) => {
                await this.setState({ colorTemperature: Number(v) })
              },
            },
          },
        },
      ],
    }
  }

  async setState(change: any): Promise<any> {
    if (!this.client) { return { success: false, reason: 'no client' } }

    // Color temperature (mired) or brightness/hue/sat
    if (typeof change.colorTemperature === 'number' || typeof change.color_temp === 'number') {
      const v = String(Number(change.colorTemperature ?? change.color_temp))
      const body = { command: 'setColorTemperature', parameter: v, commandType: 'command' }
      try {
        return await this.client.setDeviceState(this.opts.id, body)
      } catch (err) {
        try {
          if (typeof this.client.sendCommand === 'function') { return await this.client.sendCommand(this.opts.id, body) }
        } catch (e) {}
        const e = err as any
        return { success: false, reason: e?.message ?? String(e) }
      }
    }

    if (typeof change.hue === 'number' && typeof change.saturation === 'number') {
      const body = { command: 'setColor', parameter: `${Number(change.hue)},${Number(change.saturation)}`, commandType: 'command' }
      try {
        return await this.client.setDeviceState(this.opts.id, body)
      } catch (err) {
        try {
          if (typeof this.client.sendCommand === 'function') { return await this.client.sendCommand(this.opts.id, body) }
        } catch (e) {}
        const e = err as any
        return { success: false, reason: e?.message ?? String(e) }
      }
    }

    if (change && typeof change.color === 'string') {
      const body = { command: 'setColor', parameter: change.color, commandType: 'command' }
      try {
        return await this.client.setDeviceState(this.opts.id, body)
      } catch (err) {
        try {
          if (typeof this.client.sendCommand === 'function') { return await this.client.sendCommand(this.opts.id, body) }
        } catch (e) {}
        const e = err as any
        return { success: false, reason: e?.message ?? String(e) }
      }
    }

    // Fallback to generic handler (brightness/on)
    return super.setState(change)
  }

  // Matter-specific descriptor for lights (OnOff + Level + Color)
  createMatterAccessory(api: any): any {
    return {
      id: this.opts.id,
      name: this.opts.name ?? this.opts.type,
      protocol: 'matter',
      clusters: [
        {
          // OnOff cluster
          type: 'OnOff',
          clusterId: MATTER_CLUSTER_IDS.OnOff,
          attributes: {
            onOff: { read: async () => { const s = await this.getState(); return !!(s && (s.on === true || s.state === 'on' || s.power === 'on')) }, write: async (v: any) => this.setState({ on: !!v }) },
            [MATTER_ATTRIBUTE_IDS.OnOff.OnOff]: { read: async () => { const s = await this.getState(); return !!(s && (s.on === true || s.state === 'on' || s.power === 'on')) }, write: async (v: any) => this.setState({ on: !!v }) },
          },
        },
        {
          // Level Control cluster
          type: 'LevelControl',
          clusterId: MATTER_CLUSTER_IDS.LevelControl,
          attributes: {
            currentLevel: { read: async () => { const s = await this.getState(); return typeof s.brightness === 'number' ? s.brightness : 100 }, write: async (v: any) => this.setState({ brightness: Number(v) }) },
            [MATTER_ATTRIBUTE_IDS.LevelControl.CurrentLevel]: { read: async () => { const s = await this.getState(); return typeof s.brightness === 'number' ? s.brightness : 100 }, write: async (v: any) => this.setState({ brightness: Number(v) }) },
          },
        },
        {
          // Color Control cluster
          type: 'ColorControl',
          clusterId: MATTER_CLUSTER_IDS.ColorControl,
          attributes: {
            // Required colorMode attribute for Matter conformance (0 = currentHueAndSaturation)
            colorMode: { read: async () => 0 },
            colorHue: { read: async () => { const s = await this.getState(); return typeof s.hue === 'number' ? s.hue : 0 }, write: async (v: any) => this.setState({ hue: Number(v) }) },
            [MATTER_ATTRIBUTE_IDS.ColorControl.CurrentHue]: { read: async () => { const s = await this.getState(); return typeof s.hue === 'number' ? s.hue : 0 }, write: async (v: any) => this.setState({ hue: Number(v) }) },
            colorSaturation: { read: async () => { const s = await this.getState(); return typeof s.saturation === 'number' ? s.saturation : 0 }, write: async (v: any) => this.setState({ saturation: Number(v) }) },
            [MATTER_ATTRIBUTE_IDS.ColorControl.CurrentSaturation]: { read: async () => { const s = await this.getState(); return typeof s.saturation === 'number' ? s.saturation : 0 }, write: async (v: any) => this.setState({ saturation: Number(v) }) },
            colorTemperature: { read: async () => {
              const s = await this.getState(); if (typeof s.colorTemperature === 'number') { return s.colorTemperature } if (typeof s.kelvin === 'number') { return Math.round(1000000 / s.kelvin) } return 400
            }, write: async (v: any) => this.setState({ colorTemperature: Number(v) }) },
            [MATTER_ATTRIBUTE_IDS.ColorControl.ColorTemperatureMireds]: { read: async () => {
              const s = await this.getState(); if (typeof s.colorTemperature === 'number') { return s.colorTemperature } if (typeof s.kelvin === 'number') { return Math.round(1000000 / s.kelvin) } return 400
            }, write: async (v: any) => this.setState({ colorTemperature: Number(v) }) },
          },
        },
      ],
    }
  }
}

export class LightStripDevice extends LightDevice {}

export class MotionSensorDevice extends GenericDevice {
  createHAPAccessory(api: any) {
    return {
      services: [
        {
          type: 'MotionSensor',
          characteristics: {
            MotionDetected: {
              get: async () => {
                const s = await this.getState()
                return !!(s && s.motion === true)
              },
            },
          },
        },
      ],
    }
  }

  async setState(change: any): Promise<any> {
    if (!this.client) { return { success: false, reason: 'no client' } }

    // Oscillation support
    if (typeof change.oscillate === 'boolean') {
      const body = { command: 'setOscillation', parameter: change.oscillate ? 'on' : 'off', commandType: 'command' }
      try {
        return await this.client.setDeviceState(this.opts.id, body)
      } catch (err) {
        try {
          if (typeof this.client.sendCommand === 'function') { return await this.client.sendCommand(this.opts.id, body) }
        } catch (e) {}
        const e = err as any
        return { success: false, reason: e?.message ?? String(e) }
      }
    }

    // Swing / sweep support (angle or mode)
    if (change && (typeof change.swing === 'boolean' || typeof change.swingAngle === 'number' || typeof change.swingMode === 'string')) {
      let param: string = 'default'
      if (typeof change.swingMode === 'string') { param = change.swingMode } else if (typeof change.swingAngle === 'number') { param = String(Number(change.swingAngle)) } else {
        param = change.swing ? 'on' : 'off'
      }

      const body = { command: 'setSwing', parameter: param, commandType: 'command' }
      try {
        return await this.client.setDeviceState(this.opts.id, body)
      } catch (err) {
        try {
          if (typeof this.client.sendCommand === 'function') { return await this.client.sendCommand(this.opts.id, body) }
        } catch (e) {}
        const e = err as any
        return { success: false, reason: e?.message ?? String(e) }
      }
    }

    return super.setState(change)
  }
}

export class ContactSensorDevice extends GenericDevice {
  createHAPAccessory(api: any) {
    return {
      services: [
        {
          type: 'ContactSensor',
          characteristics: {
            ContactSensorState: {
              get: async () => {
                const s = await this.getState()
                return s && s.open ? 1 : 0
              },
            },
          },
        },
      ],
    }
  }
}

export class VacuumDevice extends GenericDevice {
  // Use DeviceBase defaults (Switch-style) — no override needed
  createHAPAccessory(api: any) {
    return super.createHAPAccessory(api)
  }
}

export class LockDevice extends GenericDevice {
  createHAPAccessory(api: any) {
    return {
      services: [
        {
          type: 'LockMechanism',
          characteristics: {
            LockCurrentState: {
              get: async () => {
                const s = await this.getState()
                return s && s.locked ? 1 : 0
              },
            },
            LockTargetState: {
              get: async () => {
                const s = await this.getState()
                return s && s.locked ? 1 : 0
              },
              set: async (v: any) => {
                await this.setState({ locked: !!v })
              },
            },
          },
        },
      ],
    }
  }

  async setState(change: any): Promise<any> {
    if (!this.client) { return { success: false, reason: 'no client' } }

    // User management actions: add/remove/list users, unlock with pin
    if (change && typeof change.action === 'string') {
      const action = change.action
      try {
        if (action === 'addUser' && (change.user || change.userId) && (change.pin || change.code)) {
          const user = change.user ?? change.userId
          const p = String(change.pin ?? change.code)
          const body = { command: 'addUserCode', parameter: `${user}:${p}`, commandType: 'command' }
          return await this.client.setDeviceState(this.opts.id, body)
        }

        if (action === 'removeUser' && (change.user || change.userId)) {
          const user = change.user ?? change.userId
          const body = { command: 'removeUserCode', parameter: String(user), commandType: 'command' }
          return await this.client.setDeviceState(this.opts.id, body)
        }

        if (action === 'listUsers') {
          const body = { command: 'listUsers', parameter: 'default', commandType: 'command' }
          return await this.client.setDeviceState(this.opts.id, body)
        }

        if (action === 'unlockWithPin' && (change.pin || change.code)) {
          const p = String(change.pin ?? change.code)
          const body = { command: 'unlockWithPin', parameter: p, commandType: 'command' }
          return await this.client.setDeviceState(this.opts.id, body)
        }
      } catch (err) {
        try {
          if (typeof this.client.sendCommand === 'function') { return await this.client.sendCommand(this.opts.id, { command: action, parameter: change.parameter ?? 'default', commandType: 'command' }) }
        } catch (e) {}
        const e = err as any
        return { success: false, reason: e?.message ?? String(e) }
      }
    }

    // Support setting lock PIN/passcode via `pin` or `passcode` (fallback)
    const pin = change?.pin ?? change?.passcode ?? change?.code
    if (typeof pin === 'string' || typeof pin === 'number') {
      const body = { command: 'setLockPin', parameter: String(pin), commandType: 'command' }
      try {
        return await this.client.setDeviceState(this.opts.id, body)
      } catch (err) {
        try {
          if (typeof this.client.sendCommand === 'function') { return await this.client.sendCommand(this.opts.id, body) }
        } catch (e) {}
        const e = err as any
        return { success: false, reason: e?.message ?? String(e) }
      }
    }

    return super.setState(change)
  }

  // Matter DoorLock descriptor including simple user-management actions
  createMatterAccessory(api: any): any {
    return {
      id: this.opts.id,
      name: this.opts.name ?? this.opts.type,
      protocol: 'matter',
      clusters: [
        {
          // DoorLock cluster
          type: 'DoorLock',
          clusterId: MATTER_CLUSTER_IDS.DoorLock,
          attributes: {
            lockState: { read: async () => { const s = await this.getState(); return !!(s && s.locked) }, write: async (v: any) => this.setState({ locked: !!v }) },
            [MATTER_ATTRIBUTE_IDS.DoorLock.LockState]: { read: async () => { const s = await this.getState(); return !!(s && s.locked) }, write: async (v: any) => this.setState({ locked: !!v }) },
          },
        },
        {
          // DoorLock user mgmt cluster (conceptual)
          type: 'DoorLockUserManagement',
          clusterId: 0x0301,
          attributes: {
            addUser: { write: async (v: any) => this.setState({ action: 'addUser', user: v?.user, pin: v?.pin }) },
            removeUser: { write: async (v: any) => this.setState({ action: 'removeUser', user: v?.user }) },
            listUsers: { read: async () => { const r = await this.setState({ action: 'listUsers' }); return r }, write: undefined },
            unlockWithPin: { write: async (v: any) => this.setState({ action: 'unlockWithPin', pin: v?.pin }) },
          },
        },
      ],
    }
  }
}

export class HumidifierDevice extends GenericDevice {
  createHAPAccessory(api: any) {
    return {
      services: [
        {
          type: 'HumidifierDehumidifier',
          characteristics: {
            Active: {
              get: async () => {
                const s = await this.getState()
                return s && s.on ? 1 : 0
              },
              set: async (v: any) => {
                await this.setState({ on: v === 1 })
              },
            },
            CurrentHumidifierDehumidifierState: {
              get: async () => {
                const s = await this.getState()
                return s && s.on ? 2 : 0 // 0 = Inactive, 2 = Humidifying
              },
            },
            TargetHumidifierDehumidifierState: {
              get: async () => 1, // 1 = Humidifier
              set: async (v: any) => {
                // Support humidifier mode
              },
            },
            CurrentRelativeHumidity: {
              get: async () => {
                const s = await this.getState()
                return typeof s.humidity === 'number' ? s.humidity : 0
              },
            },
            RelativeHumidityHumidifierThreshold: {
              get: async () => {
                const s = await this.getState()
                return typeof s.targetHumidity === 'number' ? s.targetHumidity : 50
              },
              set: async (v: any) => {
                await this.setState({ humidity: Number(v) })
              },
            },
          },
        },
      ],
    }
  }

  async setState(change: any): Promise<any> {
    if (!this.client) { return { success: false, reason: 'no client' } }

    if (typeof change.humidity === 'number') {
      const v = String(Number(change.humidity))
      const body = { command: 'setHumidity', parameter: v, commandType: 'command' }
      try {
        return await this.client.setDeviceState(this.opts.id, body)
      } catch (err) {
        try {
          if (typeof this.client.sendCommand === 'function') { return await this.client.sendCommand(this.opts.id, body) }
        } catch (e) {}
        const e = err as any
        return { success: false, reason: e?.message ?? String(e) }
      }
    }

    if (typeof change.dry === 'boolean') {
      const body = { command: 'setDry', parameter: change.dry ? 'on' : 'off', commandType: 'command' }
      try {
        return await this.client.setDeviceState(this.opts.id, body)
      } catch (err) {
        try {
          if (typeof this.client.sendCommand === 'function') { return await this.client.sendCommand(this.opts.id, body) }
        } catch (e) {}
        const e = err as any
        return { success: false, reason: e?.message ?? String(e) }
      }
    }

    return super.setState(change)
  }
}

// Provide Matter descriptor for humidifier (humidity and on/off)
export class HumidifierMatterDevice extends HumidifierDevice {
  async createMatterAccessory(api: any): Promise<any> {
    return {
      id: this.opts.id,
      name: this.opts.name ?? this.opts.type,
      protocol: 'matter',
      clusters: [
        {
          // Relative Humidity Sensor cluster
          type: 'RelativeHumiditySensor',
          clusterId: MATTER_CLUSTER_IDS.RelativeHumidityMeasurement,
          attributes: {
            currentRelativeHumidity: { read: async () => { const s = await this.getState(); return typeof s.humidity === 'number' ? s.humidity : 0 }, write: undefined },
            [MATTER_ATTRIBUTE_IDS.RelativeHumidityMeasurement.MeasuredValue]: { read: async () => { const s = await this.getState(); return typeof s.humidity === 'number' ? s.humidity : 0 }, write: undefined },
          },
        },
        {
          type: 'OnOff',
          clusterId: MATTER_CLUSTER_IDS.OnOff,
          attributes: {
            onOff: { read: async () => { const s = await this.getState(); return !!s?.on }, write: async (v: any) => this.setState({ on: !!v }) },
            [MATTER_ATTRIBUTE_IDS.OnOff.OnOff]: { read: async () => { const s = await this.getState(); return !!s?.on }, write: async (v: any) => this.setState({ on: !!v }) },
          },
        },
      ],
    }
  }
}

export class TemperatureSensorDevice extends GenericDevice {
  createHAPAccessory(api: any) {
    return {
      services: [
        {
          type: 'TemperatureSensor',
          characteristics: {
            CurrentTemperature: {
              get: async () => {
                const s = await this.getState()
                return typeof s.temperature === 'number' ? s.temperature : 0
              },
            },
          },
        },
      ],
    }
  }
}

// Additional device classes (aliases / specialized variants)
export class RelaySwitchDevice extends GenericDevice {}
export class RelaySwitch1PMDevice extends GenericDevice {}
export class PlugDevice extends GenericDevice {
  createHAPAccessory(api: any) {
    return {
      services: [
        {
          type: 'Outlet',
          characteristics: {
            On: {
              get: async () => {
                const s = await this.getState()
                return !!(s && (s.on === true || s.state === 'on'))
              },
              set: async (v: any) => {
                await this.setState({ on: !!v })
              },
            },
            OutletInUse: {
              get: async () => {
                const s = await this.getState()
                return s && s.inUse ? 1 : 0
              },
            },
          },
        },
      ],
    }
  }
}

export class PlugMiniDevice extends PlugDevice {}

export class BlindTiltDevice extends CurtainDevice {}
export class Curtain3Device extends CurtainDevice {}
export class RollerShadeDevice extends CurtainDevice {}

export class Hub2Device extends GenericDevice {}

export class MeterDevice extends GenericDevice {
  createHAPAccessory(api: any) {
    return {
      services: [
        {
          type: 'TemperatureSensor',
          characteristics: {
            CurrentTemperature: {
              get: async () => {
                const s = await this.getState()
                return typeof s.temperature === 'number' ? s.temperature : 0
              },
            },
          },
        },
        {
          type: 'HumiditySensor',
          characteristics: {
            CurrentRelativeHumidity: {
              get: async () => {
                const s = await this.getState()
                return typeof s.humidity === 'number' ? s.humidity : 0
              },
            },
          },
        },
      ],
    }
  }
}

export class WaterDetectorDevice extends GenericDevice {
  private _leakRefreshing = false
  private _leakRefreshTs = 0
  private lastLeakDetected?: boolean
  private readonly LEAK_REFRESH_TTL_MS = 30_000

  async init(): Promise<void> {
    await super.init()
    await this._refreshLeakState(!this.client)
  }

  private normalizeLeakDetected(state: any): boolean | undefined {
    if (typeof state?.leak === 'boolean') {
      return state.leak
    }
    if (typeof state?.waterLeakDetected === 'boolean') {
      return state.waterLeakDetected
    }
    if (typeof state?.body?.waterLeakDetected === 'boolean') {
      return state.body.waterLeakDetected
    }
    const status = state?.status ?? state?.body?.status
    if (typeof status === 'number') {
      return status === 1
    }
    if (typeof status === 'string') {
      return ['1', 'leak', 'leaked', 'detected', 'water_leak_detected'].includes(status.toLowerCase())
    }
    return undefined
  }

  private async readLeakDetectedFromOpenAPI(): Promise<boolean | undefined> {
    const token = this.cfg?.openApiToken
    const secret = this.cfg?.openApiSecret
    if (!token || !secret) {
      return undefined
    }

    try {
      const { OpenAPIClient } = await import('node-switchbot')
      const apiClient = new OpenAPIClient(token, secret)
      return this.normalizeLeakDetected(await apiClient.getStatus(this.opts.id))
    } catch (e) {
      this.log?.debug?.(`[WaterDetector] direct OpenAPI leak refresh failed: ${(e as Error)?.message}`)
    }

    return undefined
  }

  private async readLeakDetected(fallbackToDeviceState = true): Promise<boolean | undefined> {
    const openApiLeak = await this.readLeakDetectedFromOpenAPI()
    if (typeof openApiLeak === 'boolean') {
      return openApiLeak
    }
    if (!fallbackToDeviceState) {
      return undefined
    }

    try {
      return this.normalizeLeakDetected(await this.getState())
    } catch (e) {
      this.log?.debug?.(`[WaterDetector] leak refresh failed: ${(e as Error)?.message}`)
    }

    return undefined
  }

  private async _refreshLeakState(fallbackToDeviceState = true): Promise<void> {
    if (this._leakRefreshing) {
      return
    }
    this._leakRefreshing = true
    try {
      const leakDetected = await this.readLeakDetected(fallbackToDeviceState)
      if (typeof leakDetected === 'boolean') {
        this.lastLeakDetected = leakDetected
        this._leakRefreshTs = Date.now()
      }
    } catch (e) {
      this.log?.debug?.(`[WaterDetector] leak refresh failed: ${(e as Error)?.message}`)
    } finally {
      this._leakRefreshing = false
    }
  }

  private getLeakDetectedFast(api: any): number {
    if (Date.now() - this._leakRefreshTs >= this.LEAK_REFRESH_TTL_MS) {
      this._refreshLeakState().catch(() => undefined)
    }
    if (typeof this.lastLeakDetected === 'boolean') {
      return this.lastLeakDetected ? 1 : 0
    }
    throw new api.hap.HapStatusError(api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE)
  }

  createHAPAccessory(api: any) {
    return {
      services: [
        {
          type: 'LeakSensor',
          characteristics: {
            LeakDetected: {
              get: () => this.getLeakDetectedFast(api),
            },
          },
        },
      ],
    }
  }
}

export class SmartFanDevice extends FanDevice {}

export class StripLightDevice extends LightStripDevice {}

export class WalletFinderDevice extends GenericDevice {}

// K10 / WoSweeper variants map to VacuumDevice
export class WoSweeperDevice extends VacuumDevice {}
export class WoSweeperMiniDevice extends VacuumDevice {}
export class WoSweeperMiniProDevice extends VacuumDevice {}
