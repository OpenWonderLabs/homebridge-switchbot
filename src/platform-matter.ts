import type { Server } from 'node:http'

import type {
  API,
  DynamicPlatformPlugin,
  Logging,
  MatterAccessory,
  SerializedMatterAccessory,
} from 'homebridge'
import type { MqttClient } from 'mqtt'
import type { bodyChange, device, irdevice } from 'node-switchbot'

import type { devicesConfig, irDevicesConfig, SwitchBotPlatformConfig } from './settings.js'

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import asyncmqtt from 'async-mqtt'
import { SwitchBotBLE, SwitchBotOpenAPI } from 'node-switchbot'

import {
  ColorLightAccessory,
  ColorTemperatureLightAccessory,
  ContactSensorAccessory,
  DimmableLightAccessory,
  DoorLockAccessory,
  ExtendedColorLightAccessory,
  FanAccessory,
  HumiditySensorAccessory,
  LeakSensorAccessory,
  LightSensorAccessory,
  OccupancySensorAccessory,
  OnOffLightAccessory,
  OnOffOutletAccessory,
  OnOffSwitchAccessory,
  PowerStripAccessory,
  RoboticVacuumAccessory,
  SmokeCOAlarmAccessory,
  TemperatureSensorAccessory,
  ThermostatAccessory,
  VenetianBlindAccessory,
  WindowBlindAccessory,
} from './devices-matter/index.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'
import { ApiRequestTracker, applyDeviceTypeTemplates, createPlatformLogger, formatDeviceIdAsMac, hs2rgb, isSuccessfulStatusCode, makeBLESender, makeOpenAPISender, mergeByDeviceId, normalizeDeviceId, rgb2hs, sleep } from './utils.js'

export class SwitchBotMatterPlatform implements DynamicPlatformPlugin {
  // Track restored HAP cached accessories (required for DynamicPlatformPlugin)
  // This is commented out here as this plugin does not have any HAP accessories
  // public readonly accessories: Map<string, PlatformAccessory> = new Map()

  // Track restored Matter cached accessories
  public readonly matterAccessories: Map<string, SerializedMatterAccessory> = new Map()
  // node-switchbot clients
  private switchBotAPI?: SwitchBotOpenAPI
  private switchBotBLE?: SwitchBotBLE
  // discovered devices cache
  private discoveredDevices: device[] = []
  // discovered IR devices cache
  private discoveredIRDevices: irdevice[] = []
  // Registry of created accessory instances keyed by normalized deviceId
  private accessoryInstances: Map<string, any> = new Map()
  // Refresh timers keyed by normalized deviceId
  private refreshTimers: Map<string, NodeJS.Timeout> = new Map()
  // Platform-level refresh timer for batch status updates
  private platformRefreshTimer?: NodeJS.Timeout
  // Device status cache from last refresh
  private deviceStatusCache: Map<string, any> = new Map()
  // Backoff cooldowns persisted across restarts: normalized deviceId -> nextAllowedAt(ms)
  private backoffCooldowns: Map<string, number> = new Map()
  private backoffFilePath?: string
  // Devices that have explicit per-device refresh timers (normalized deviceId)
  private perDeviceRefreshSet: Set<string> = new Set()
  // BLE event handlers keyed by device MAC (formatted)
  private bleEventHandler: { [x: string]: (context: any) => void } = {}
  // MQTT and Webhook properties (mirror HAP behavior so Matter platform can
  // receive OpenAPI webhook events and/or MQTT-proxied webhook messages)
  private mqttClient: MqttClient | null = null
  private webhookEventListener: Server | null = null
  private webhookEventHandler: { [x: string]: (context: any) => void } = {}
  // Platform logging toggle (can be controlled via UI or config)
  // Use same shape as HAP platform: string values like 'debug', 'debugMode', 'standard', or 'none'
  private platformLogging?: string

  // API request tracking (persistent across restarts)
  private apiTracker?: ApiRequestTracker

  // Platform-provided logging helpers (attached in constructor)
  infoLog!: (...args: any[]) => void
  successLog!: (...args: any[]) => void
  debugSuccessLog!: (...args: any[]) => void
  warnLog!: (...args: any[]) => void
  debugWarnLog!: (...args: any[]) => void
  errorLog!: (...args: any[]) => void
  debugErrorLog!: (...args: any[]) => void
  debugLog!: (...args: any[]) => void
  loggingIsDebug!: () => Promise<boolean>
  enablingPlatformLogging!: () => Promise<boolean>

  constructor(
    public readonly log: Logging,
    public readonly config: SwitchBotPlatformConfig,
    public readonly api: API,
  ) {
    // Determine platform logging preference (match HAP behaviour as closely as
    // possible using config values. We default to 'standard' when unspecified.)
    this.platformLogging = (this.config.options?.logging === 'debug' || this.config.options?.logging === 'standard' || this.config.options?.logging === 'none')
      ? this.config.options.logging
      : 'standard'

    // Unconditional diagnostic using the raw Homebridge `log` so it always
    // appears regardless of the platform logging helpers' gating logic.
    try {
      this.log.debug?.(`[SwitchBot Matter] effective platformLogging=${String(this.platformLogging)}`)
    } catch (e: any) {
      // swallow any logging errors — diagnostics are best-effort
    }

    // Attach platform-wide logging helpers from utils so Matter and device
    // classes can use consistent logging methods (infoLog/debugLog/etc.)
    const _pl = createPlatformLogger(async () => (this as any).platformLogging, this.log)
    this.infoLog = _pl.infoLog
    this.successLog = _pl.successLog
    this.debugSuccessLog = _pl.debugSuccessLog
    this.warnLog = _pl.warnLog
    this.debugWarnLog = _pl.debugWarnLog
    this.errorLog = _pl.errorLog
    this.debugErrorLog = _pl.debugErrorLog
    this.debugLog = _pl.debugLog
    this.loggingIsDebug = _pl.loggingIsDebug
    this.enablingPlatformLogging = _pl.enablingPlatformLogging

    this.debugLog('Finished initializing platform:', this.config.name)

    // Note: deviceConfig and irdeviceConfig have been removed from the platform.
    // All device-specific configuration should be done via options.devices arrays.

    // Does the user have a version of Homebridge that is compatible with matter?
    if (!this.api.isMatterAvailable?.()) {
      this.warnLog('Matter is not available in this version of Homebridge. Please update Homebridge to use this plugin.')
    }

    // Check if the user has matter enabled, this means:
    // - If the plugin is running on the main bridge, then the user must have enabled matter in the Homebridge settings page in the UI
    // - If the plugin is running on a child bridge, then the user must have enabled matter on the plugin bridge settings section in the UI
    // In reality, only the below check is needed, but they are both included here for completeness
    // Remember to use a '?.' optional chaining operator in case the user is running an older version of Homebridge that does not have these APIs
    if (!this.api.isMatterEnabled?.()) {
      this.warnLog('Matter is not enabled in Homebridge. Please enable Matter in the Homebridge settings to use this plugin.')
      return
    }

    // Register Matter accessories when Homebridge has finished launching
    this.api.on('didFinishLaunching', () => {
      this.debugLog('Executed didFinishLaunching callback')
      // Log presence of credentials (do not log actual values)
      try {
        this.debugLog(`SwitchBot credentials present? token=${Boolean(this.config.credentials?.token)}, secret=${Boolean(this.config.credentials?.secret)}`)
      } catch (e: any) {
        this.debugLog('Failed to log credentials presence: %s', e?.message ?? e)
      }

      // Do not fall back to environment variables here — credentials must
      // come from plugin config (Homebridge UI). If credentials appear
      // missing we'll log that fact and continue; the UI should store token
      // and secret in `config.credentials`.
      // Initialize SwitchBot API clients
      try {
        if (this.config.credentials?.token && this.config.credentials?.secret) {
          this.switchBotAPI = new SwitchBotOpenAPI(this.config.credentials.token, this.config.credentials.secret, this.config.options?.hostname)
          // forward basic logs
          if (!this.config.options?.disableLogsforOpenAPI && this.switchBotAPI?.on) {
            this.switchBotAPI.on('log', (l: any) => this.debugLog('[SwitchBot OpenAPI]', l.message))
          }
        } else {
          this.debugLog('SwitchBot OpenAPI credentials not provided; cloud devices will be skipped')
        }
      } catch (e: any) {
        this.errorLog('Failed to initialize SwitchBot OpenAPI:', e?.message ?? e)
      }

      // Initialize API request tracking
      if (this.switchBotAPI) {
        try {
          this.apiTracker = new ApiRequestTracker(this.api, this.log, 'SwitchBot Matter', {
            dailyLimit: this.config.options?.dailyApiLimit ?? 10000,
            reserveForCommands: this.config.options?.dailyApiReserveForCommands ?? 1000,
            pausePollingAtReserve: this.config.options?.webhookOnlyOnReserve ?? false,
            resetAtLocalMidnight: this.config.options?.dailyApiResetAtLocalMidnight ?? false,
          })
          this.apiTracker.startHourlyLogging()
          // Parity with HAP platform: indicate successful initialization of API tracking (Matter-specific wording)
          this.debugLog('API request tracking initialized (Matter platform, OpenAPI)')
        } catch (e: any) {
          this.errorLog('Failed to initialize API request tracking:', e?.message ?? e)
        }
      }

      try {
        this.switchBotBLE = new SwitchBotBLE()
        if (!this.config.options?.disableLogsforBLE && this.switchBotBLE?.on) {
          this.switchBotBLE.on('log', (l: any) => this.debugLog('[SwitchBot BLE]', l.message))
        }
      } catch (e: any) {
        this.errorLog('Failed to initialize SwitchBot BLE client:', e?.message ?? e)
      }

      // If BLE scanning is enabled, start scanning and route advertisements to registered handlers
      if (this.config.options?.BLE && this.switchBotBLE) {
        const ble = this.switchBotBLE
        ;(async () => {
          try {
            await ble.startScan()
          } catch (e: any) {
            this.errorLog(`Failed to start BLE scanning: ${e?.message ?? e}`)
          }

          // route advertisements to our handlers
          ble.onadvertisement = async (ad: any) => {
            try {
              const mac = (ad.address || '').toLowerCase()
              const handler = this.bleEventHandler[mac]
              if (handler) {
                await handler(ad.serviceData)
              }
            } catch (e: any) {
              this.errorLog(`Failed to handle BLE advertisement: ${e?.message ?? e}`)
            }
          }
        })()
      }

      // Ensure we clean up any per-device timers and BLE handlers when Homebridge shuts down
      this.api.on('shutdown', async () => {
        try {
          this.infoLog('Homebridge shutting down: clearing refresh timers and BLE handlers')

          // Stop API tracking hourly logging
          if (this.apiTracker) {
            this.apiTracker.stopHourlyLogging()
          }

          // Clear all refresh timers
          for (const [nid, t] of Array.from(this.refreshTimers.entries())) {
            try {
              clearInterval(t)
            } catch (e: any) {
              this.debugLog(`Failed to clear timer for ${nid}: ${e?.message ?? e}`)
            }
            this.refreshTimers.delete(nid)
          }

          // Clear platform-level refresh timer
          try {
            if (this.platformRefreshTimer) {
              clearInterval(this.platformRefreshTimer)
              this.platformRefreshTimer = undefined
            }
          } catch (e: any) {
            this.debugLog(`Failed to clear platform refresh timer: ${e?.message ?? e}`)
          }

          // Clear accessory instances registry
          try {
            this.accessoryInstances.clear()
          } catch (e: any) {
            this.debugLog(`Failed to clear accessoryInstances: ${e?.message ?? e}`)
          }

          // Remove BLE handlers
          try {
            for (const k of Object.keys(this.bleEventHandler)) {
              delete this.bleEventHandler[k]
            }
          } catch (e: any) {
            this.debugLog(`Failed to clear bleEventHandler: ${e?.message ?? e}`)
          }

          // Stop BLE scanning if available
          try {
            if (this.switchBotBLE && typeof (this.switchBotBLE as any).stopScan === 'function') {
              await (this.switchBotBLE as any).stopScan()
              this.infoLog('Stopped BLE scanning')
            }
          } catch (e: any) {
            this.debugLog(`Failed to stop BLE scanning: ${e?.message ?? e}`)
          }

          // Persist backoff cooldowns to disk
          try {
            if (this.backoffFilePath) {
              const obj: Record<string, number> = {}
              for (const [k, v] of this.backoffCooldowns.entries()) {
                if (Number.isFinite(v)) {
                  obj[k] = v
                }
              }
              writeFileSync(this.backoffFilePath, JSON.stringify(obj, null, 2))
              this.debugLog(`Saved ${Object.keys(obj).length} backoff cooldown entries`)
            }
          } catch (e: any) {
            this.debugLog(`Failed to save backoff state: ${e?.message ?? e}`)
          }
        } catch (e: any) {
          this.debugLog('Shutdown cleanup failed: %s', e?.message ?? e)
        }
      })

      // perform device discovery from SwitchBot OpenAPI (if configured) and
      // register Matter accessories after discovery completes. Previously we
      // called discoverDevices() without awaiting it which caused registration
      // to run before discovery finished and only example accessories were
      // created. Use an async IIFE to sequentially await discovery then register.
      ;(async () => {
        try {
          await this.discoverDevices()
        } catch (e: any) {
          this.debugLog('Device discovery failed during startup: %s', e?.message ?? e)
        }

        try {
          await this.registerMatterAccessories()
        } catch (e: any) {
          this.errorLog('Failed to register Matter accessories: %s', e?.message ?? e)
        }
      })()
    })

    try {
      this.setupMqtt()
    } catch (e: any) {
      this.errorLog(`Setup MQTT, Error Message: ${e?.message ?? e}, Submit Bugs Here: ` + 'https://tinyurl.com/SwitchBotBug')
    }
    try {
      this.setupwebhook()
    } catch (e: any) {
      this.errorLog(`Setup Webhook, Error Message: ${e?.message ?? e}, Submit Bugs Here: ` + 'https://tinyurl.com/SwitchBotBug')
    }

    // Initialize backoff persistence file path and load any saved cooldowns
    try {
      const storagePath = this.api.user.storagePath()
      this.backoffFilePath = join(storagePath, `${PLUGIN_NAME.replace('@', '').replace('/', '-')}-matter-backoff.json`)
      if (existsSync(this.backoffFilePath)) {
        try {
          const raw = readFileSync(this.backoffFilePath, 'utf8')
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') {
            for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
              const ts = Number(v)
              if (Number.isFinite(ts)) {
                this.backoffCooldowns.set(String(k), ts)
              }
            }
            this.debugLog(`Loaded ${this.backoffCooldowns.size} backoff cooldown entries`)
          }
        } catch (e: any) {
          this.debugLog(`Failed to load backoff state: ${e?.message ?? e}`)
        }
      }
    } catch (e: any) {
      this.debugLog(`Failed to initialize backoff persistence: ${e?.message ?? e}`)
    }
  }

  /**
   * Normalize a deviceId for matching (uppercase alphanumerics only)
   * @deprecated Use shared normalizeDeviceId from utils.js instead
   */
  private normalizeDeviceId(deviceId: string) {
    return normalizeDeviceId(deviceId)
  }

  /** Determine the platform-level batch interval in seconds */
  private getPlatformBatchInterval(): number {
    const opt = this.config.options
    const val = opt?.matterBatchRefreshRate ?? opt?.refreshRate ?? 300
    const n = Number(val)
    return Number.isFinite(n) && n > 0 ? n : 300
  }

  /**
   * Clear per-device resources: refresh timers, accessory instance registry, BLE handlers
   */
  private clearDeviceResources(deviceId?: string) {
    if (!deviceId) {
      return
    }
    try {
      const nid = this.normalizeDeviceId(deviceId)
      const existing = this.refreshTimers.get(nid)
      if (existing) {
        try {
          clearInterval(existing)
        } catch (e: any) {
          this.debugLog(`Failed to clear refresh timer for ${deviceId}: ${e?.message ?? e}`)
        }
        this.refreshTimers.delete(nid)
      }

      try {
        this.accessoryInstances.delete(nid)
      } catch (e: any) {
        this.debugLog(`Failed to delete accessory instance for ${deviceId}: ${e?.message ?? e}`)
      }

      try {
        const mac = formatDeviceIdAsMac(deviceId).toLowerCase()
        if (this.bleEventHandler[mac]) {
          delete this.bleEventHandler[mac]
        }
      } catch (e: any) {
        // formatting failed (not a MAC-like id) — ignore
        this.debugLog(`clearDeviceResources: failed to remove BLE handler for ${deviceId}: ${e?.message ?? e}`)
      }
    } catch (e: any) {
      this.debugLog(`clearDeviceResources top-level error for ${deviceId}: ${e?.message ?? e}`)
    }
  }

  /**
   * Merge discovered devices with per-device overrides from `config.options.devices`.
   * Also applies device-type templates when applyToAllDevicesOfType is set.
   */
  private async mergeDiscoveredDevices(discovered: device[]): Promise<any[]> {
    // If there's no per-device config, return discovered as-is
    if (!this.config.options?.devices) {
      return discovered
    }

    // Assign missing deviceType from configDeviceType if needed
    const devicesWithTypeAssigned = discovered.map((deviceObj) => {
      if (!deviceObj.deviceType) {
        deviceObj.deviceType = (deviceObj as any).configDeviceType !== undefined ? (deviceObj as any).configDeviceType : 'Unknown'
        this.debugLog(`API missing deviceType for ${deviceObj.deviceId}, using configDeviceType: ${(deviceObj as any).configDeviceType}`)
      }
      return deviceObj
    })

    // Apply device-type templates from config entries with applyToAllDevicesOfType=true
    const devicesWithTemplates = applyDeviceTypeTemplates(
      devicesWithTypeAssigned,
      this.config.options.devices,
      'deviceType',
      msg => this.debugLog(msg),
    )

    // Merge per-device overrides by matching deviceId
    const allowConfigOnly = Boolean(this.config.options?.allowConfigOnlyDevices)
    const merged = mergeByDeviceId(this.config.options?.devices ?? [], devicesWithTemplates ?? [], allowConfigOnly)

    // Apply global webhook setting if not explicitly set on individual devices
    if (this.config.options?.webhook === true) {
      merged.forEach((device: any) => {
        if (device.webhook === undefined) {
          device.webhook = true
          this.debugLog(`Applied global webhook setting to Matter device: ${device.deviceId}`)
        }
      })
    }

    return merged
  }

  /**
   * Merge discovered IR devices with per-device overrides from `config.options.irdevices`.
   * Also applies device-type templates when applyToAllDevicesOfType is set.
   */
  private async mergeDiscoveredIRDevices(discovered: irdevice[]): Promise<irdevice[]> {
    // If there's no per-device config, return discovered as-is
    if (!this.config.options?.irdevices) {
      return discovered
    }

    // Assign missing remoteType from configRemoteType if needed
    const devicesWithTypeAssigned = discovered.map((deviceObj) => {
      if (!deviceObj.remoteType && (deviceObj as any).configRemoteType) {
        deviceObj.remoteType = (deviceObj as any).configRemoteType
        this.debugLog(`API missing remoteType for ${deviceObj.deviceId}, using configRemoteType: ${(deviceObj as any).configRemoteType}`)
      } else if (!deviceObj.remoteType) {
        this.warnLog(`No remoteType for IR device ${deviceObj.deviceId}, skipping`)
        return null
      }
      return deviceObj
    }).filter(device => device !== null) as irdevice[]

    // Apply remote-type templates from config entries with applyToAllDevicesOfType=true
    const devicesWithTemplates = applyDeviceTypeTemplates(
      devicesWithTypeAssigned,
      this.config.options.irdevices,
      'remoteType',
      msg => this.debugLog(msg),
    )

    // Merge per-device overrides by matching deviceId
    const allowConfigOnly = Boolean(this.config.options?.allowConfigOnlyDevices)
    type IRMerged = irdevice & irDevicesConfig
    const merged = mergeByDeviceId(this.config.options?.irdevices ?? [], devicesWithTemplates ?? [], allowConfigOnly) as IRMerged[]

    // Apply global webhook setting if not explicitly set on individual IR devices
    if (this.config.options?.webhook === true) {
      merged.forEach((device: any) => {
        if (device.webhook === undefined) {
          device.webhook = true
          this.debugLog(`Applied global webhook setting to Matter IR device: ${device.deviceId}`)
        }
      })
    }

    return merged as unknown as irdevice[]
  }

  /**
   * Select effective connection type for a device: prefer explicit device.connectionType,
   * otherwise prefer BLE when platform BLE is enabled and device provides a BLE model/id.
   */
  private chooseConnectionType(deviceObj: any): 'BLE' | 'OpenAPI' {
    if (deviceObj?.connectionType) {
      return deviceObj.connectionType === 'BLE' ? 'BLE' : 'OpenAPI'
    }
    // If platform BLE is enabled and we have a bleModel or deviceId that formats to a MAC, prefer BLE
    if (this.config.options?.BLE && (deviceObj?.bleModel || formatDeviceIdAsMac(deviceObj?.deviceId))) {
      return 'BLE'
    }
    return 'OpenAPI'
  }

  /**
   * Map a SwitchBot device object to a MatterAccessory using the device-specific
   * Matter accessory classes in `src/devices-matter`.
   */
  private async createAccessoryFromDevice(dev: device & devicesConfig): Promise<MatterAccessory<Record<string, unknown>> | undefined> {
    // Basic metadata
    const displayName = dev.deviceName ?? dev.deviceId ?? 'SwitchBot Device'
    const serial = dev.deviceId ?? 'unknown'
    const manufacturer = 'SwitchBot'
    const model = dev.model ?? dev.deviceType ?? 'SwitchBot'
    const firmware = (dev as any).firmware ?? (dev as any).version ?? '0.0.0'

    // Helper to build a default opts object consumed by the matter device classes
    const baseOpts = {
      uuid: this.api.matter.uuid.generate(serial),
      displayName,
      serialNumber: serial,
      manufacturer,
      model,
      firmwareRevision: String(firmware),
      hardwareRevision: '1.0.0',
      deviceId: dev.deviceId,
      // Inject handy platform-side helpers into the accessory `context` so Matter
      // accessory classes can perform OpenAPI/BLE actions without reaching into
      // the platform implementation directly.
      context: {
        deviceId: dev.deviceId,
        // Expose the display name so Matter accessory classes can read it from context
        name: displayName,
        // Provide device-level logging override (if present) and platform logging flag
        // so accessories can decide how verbose they should be.
        deviceLogging: (dev as any)?.logging,
        platformLogging: this.platformLogging,
        // Expose effective webhook setting for parity with HAP base device logic
        // Prefer explicit per-device setting; otherwise fall back to global option
        webhook: (dev as any)?.webhook !== undefined ? (dev as any).webhook : (this.config.options?.webhook === true ? true : undefined),
      },
    }

    // Log effective webhook for diagnostics
    try {
      const effectiveWebhook = (dev as any)?.webhook !== undefined ? (dev as any).webhook : (this.config.options?.webhook === true ? true : undefined)
      this.debugLog(`Effective webhook for Matter device ${displayName} (${dev.deviceId}): ${String(effectiveWebhook)}`)
    } catch (e: any) {
      this.debugLog(`Failed logging effective webhook for Matter device ${displayName} (${dev.deviceId}): ${e?.message ?? e}`)
    }

    // Build platform-side helpers using shared factories so they can be reused/tested
    const sendOpenAPI = makeOpenAPISender(this.retryCommand.bind(this), dev, { maxRetries: this.config.options?.maxRetries ?? 1, delayBetweenRetries: this.config.options?.delayBetweenRetries ?? 1000 })
    const sendBLE = makeBLESender(this.switchBotBLE, dev, { bleRetries: (this.config.options as any)?.bleRetries ?? 2, bleRetryDelay: (this.config.options as any)?.bleRetryDelay ?? 500 })

    // Log that we're initializing this device so it's visible in startup logs
    try {
      this.infoLog(`Initializing Matter device: ${displayName} (type=${dev.deviceType ?? 'Unknown'}) id=${dev.deviceId}`)
    } catch (e: any) {
      // best-effort logging — swallow errors to avoid breaking initialization
      this.debugLog('Failed to log initializing device:', e?.message ?? e)
    }

    const makeOnOffHandlers = (uuid: string, connectionType: 'BLE' | 'OpenAPI') => ({
      onOff: {
        on: async () => {
          try {
            if (connectionType === 'BLE' && this.switchBotBLE) {
              await sendBLE('turnOn')
            } else {
              await sendOpenAPI('turnOn')
            }
            await this.api.matter.updateAccessoryState(uuid, this.api.matter.clusterNames.OnOff, { onOff: true })
          } catch (e: any) {
            this.errorLog(`Failed to turn on device ${dev.deviceId}: ${e?.message ?? e}`)
          }
        },
        off: async () => {
          try {
            if (connectionType === 'BLE' && this.switchBotBLE) {
              await sendBLE('turnOff')
            } else {
              await sendOpenAPI('turnOff')
            }
            await this.api.matter.updateAccessoryState(uuid, this.api.matter.clusterNames.OnOff, { onOff: false })
          } catch (e: any) {
            this.errorLog(`Failed to turn off device ${dev.deviceId}: ${e?.message ?? e}`)
          }
        },
      },
    })

    // Mapping from SwitchBot deviceType -> constructor (expanded for parity with HAP)
    const mapping: { [key: string]: any } = {
      // Plugs / Outlets
      'Plug': OnOffOutletAccessory,
      'Plug Mini (US)': OnOffOutletAccessory,
      'Plug Mini (JP)': OnOffOutletAccessory,
      'Plug Mini': OnOffOutletAccessory,
      'WoPlug': OnOffOutletAccessory,

      // Lighting
      'Color Bulb': ColorLightAccessory,
      'Color Bulb Mini': ColorLightAccessory,
      'Ceiling Light': ColorTemperatureLightAccessory,
      'Ceiling Light Pro': ColorTemperatureLightAccessory,
      'Strip Light': ExtendedColorLightAccessory,
      'Light Strip': ExtendedColorLightAccessory,
      'Light Strip Plus': ExtendedColorLightAccessory,
      'Strip Light Pro': ExtendedColorLightAccessory,
      'Dimmable Light': DimmableLightAccessory,

      // Robot Vacuums
      'K10+': RoboticVacuumAccessory,
      'K10+ Pro': RoboticVacuumAccessory,
      'WoSweeper': RoboticVacuumAccessory,
      'WoSweeperMini': RoboticVacuumAccessory,
      'Robot Vacuum Cleaner S1': RoboticVacuumAccessory,
      'Robot Vacuum Cleaner S1 Plus': RoboticVacuumAccessory,
      'Robot Vacuum Cleaner S10': RoboticVacuumAccessory,
      'Robot Vacuum Cleaner S1 Pro': RoboticVacuumAccessory,
      'Robot Vacuum Cleaner S1 Mini': RoboticVacuumAccessory,

      // Locks
      'Smart Lock': DoorLockAccessory,
      'Smart Lock Pro': DoorLockAccessory,
      'Smart Lock Ultra': DoorLockAccessory,

      // Sensors
      'Motion Sensor': OccupancySensorAccessory,
      'Contact Sensor': ContactSensorAccessory,
      'Water Detector': LeakSensorAccessory,
      'Meter': TemperatureSensorAccessory,
      'MeterPlus': TemperatureSensorAccessory,
      'MeterPro': TemperatureSensorAccessory,
      'WoIOSensor': TemperatureSensorAccessory,
      'Air Purifier PM2.5': HumiditySensorAccessory,
      'Air Purifier Table PM2.5': HumiditySensorAccessory,
      'Air Purifier': HumiditySensorAccessory,
      'Air Purifier VOC': HumiditySensorAccessory,
      'Air Purifier Table VOC': HumiditySensorAccessory,

      // Fans
      'Battery Circulator Fan': FanAccessory,

      // Curtains / Blinds
      'Blind Tilt': VenetianBlindAccessory,
      'Curtain': WindowBlindAccessory,
      'Curtain2': WindowBlindAccessory,
      'Curtain3': WindowBlindAccessory,
      'Curtain 2': WindowBlindAccessory,
      'WoRollerShade': WindowBlindAccessory,
      'Roller Shade': WindowBlindAccessory,
      'Venetian Blind': VenetianBlindAccessory,

      // Switches / Relays
      'Relay Switch 1': OnOffSwitchAccessory,
      'Relay Switch 1PM': OnOffSwitchAccessory,
      'Relay Switch 2': OnOffSwitchAccessory,
      'Relay Switch 3': OnOffSwitchAccessory,

      // Misc / hubs / other
      'Hub 2': undefined,
      'Hub 3': undefined,
      'Hub Mini': undefined,
      'Bot': OnOffSwitchAccessory,
      'Smart Bot': OnOffSwitchAccessory,
      'Humidifier': HumiditySensorAccessory,
      'Humidifier2': HumiditySensorAccessory,
      'Thermostat': ThermostatAccessory,
      'Water Heater': ThermostatAccessory,
    }

    const Ctor = mapping[dev.deviceType ?? '']
    if (!Ctor) {
      this.debugLog(`No Matter mapping for deviceType='${dev.deviceType}', deviceId=${dev.deviceId}`)
      return undefined
    }

    // Build opts and handlers tailored for basic capabilities
    const uuid = baseOpts.uuid
    const handlers: Record<string, any> = {}

    // Choose connection type for this device (BLE vs OpenAPI)
    const connectionType = this.chooseConnectionType(dev)

    // On/Off common
    handlers.onOff = makeOnOffHandlers(uuid, connectionType).onOff

    // If this is a light, add brightness and color handlers
    if (['Color Bulb', 'Ceiling Light', 'Ceiling Light Pro', 'Strip Light', 'Dimmable Light'].includes(dev.deviceType ?? '')) {
      // levelControl
      handlers.levelControl = {
        moveToLevelWithOnOff: async (request: any) => {
          try {
            const level = request.level as number
            const percent = Math.round((level / 254) * 100)
            if (connectionType === 'BLE' && this.switchBotBLE) {
              await sendBLE('setBrightness', percent)
            } else {
              await sendOpenAPI('setBrightness', `${percent}`)
            }
            await this.api.matter.updateAccessoryState(uuid, this.api.matter.clusterNames.LevelControl, { currentLevel: level })
          } catch (e: any) {
            this.errorLog(`Failed to set brightness for ${dev.deviceId}: ${e?.message ?? e}`)
          }
        },
      }

      // colorControl
      handlers.colorControl = {
        moveToHueAndSaturationLogic: async (request: any) => {
          try {
            const hue = request.hue as number
            const saturation = request.saturation as number
            const [r, g, b] = hs2rgb(Math.round((hue / 254) * 360), Math.round((saturation / 254) * 100))
            if (connectionType === 'BLE' && this.switchBotBLE) {
              await sendBLE('setRGB', Number(request.level ?? 100), r, g, b)
            } else {
              await sendOpenAPI('setColor', `${r}:${g}:${b}`)
            }
            await this.api.matter.updateAccessoryState(uuid, this.api.matter.clusterNames.ColorControl, { currentHue: hue, currentSaturation: saturation })
          } catch (e: any) {
            this.errorLog(`Failed to set hue/sat for ${dev.deviceId}: ${e?.message ?? e}`)
          }
        },
        moveToColorLogic: async (request: any) => {
          try {
            // MoveToColor gives colorX/colorY values; convert to approximate RGB by mapping to 0-255 scale
            const colorX = request.colorX as number
            const colorY = request.colorY as number
            // Naive conversion: map X/Y into RGB via hue approximation (not colorimetrically accurate)
            const hueApprox = Math.round((colorX / 65535) * 360)
            const satApprox = Math.round((colorY / 65535) * 100)
            const [r, g, b] = hs2rgb(hueApprox, satApprox)
            if (connectionType === 'BLE' && this.switchBotBLE) {
              await sendBLE('setRGB', Number(request.level ?? 100), r, g, b)
            } else {
              await sendOpenAPI('setColor', `${r}:${g}:${b}`)
            }
            await this.api.matter.updateAccessoryState(uuid, this.api.matter.clusterNames.ColorControl, { currentX: colorX, currentY: colorY })
          } catch (e: any) {
            this.errorLog(`Failed to set XY color for ${dev.deviceId}: ${e?.message ?? e}`)
          }
        },
      }

      // color temperature — map to kelvin and send setColorTemperature
      handlers.colorTemperature = {
        moveToColorTemperature: async (request: any) => {
          try {
            const kelvin = Math.round(1000000 / Number(request.colorTemperature))
            if (connectionType === 'BLE' && this.switchBotBLE) {
              await sendBLE('setColorTemperature', kelvin)
            } else {
              await sendOpenAPI('setColorTemperature', `${kelvin}`)
            }
            await this.api.matter.updateAccessoryState(uuid, this.api.matter.clusterNames.ColorControl, { currentX: request.colorX ?? 0, currentY: request.colorY ?? 0 })
          } catch (e: any) {
            this.errorLog(`Failed to set color temperature for ${dev.deviceId}: ${e?.message ?? e}`)
          }
        },
      }
    }

    // Expose platform helpers to the accessory via context so accessory
    // classes can call OpenAPI/BLE actions (sendOpenAPI/sendBLE) and know
    // the effective connection type.
    try {
      /* Inject platform helpers (OpenAPI/BLE senders + logging helpers + connection type)
         into the accessory context so Matter accessory classes can use them without
         reaching into the platform implementation directly. */
      ;(baseOpts as any).context = Object.assign({}, (baseOpts as any).context, {
        sendOpenAPI,
        sendBLE,
        connectionType,
        // Expose platform logging helpers so accessories can use consistent logging
        infoLog: this.infoLog,
        debugLog: this.debugLog,
        warnLog: this.warnLog,
        errorLog: this.errorLog,
        successLog: this.successLog,
      })
    } catch (e: any) {
      this.debugLog('Failed to attach platform helpers to baseOpts.context: %s', e?.message ?? e)
    }

    const opts = Object.assign({}, baseOpts, { handlers })

    // Instantiate the device class and return its serialized accessory
    const instance = new Ctor(this.api, this.log, opts)
    // Save instance in registry so platform can call device-specific update methods if needed
    try {
      if (dev?.deviceId) {
        this.accessoryInstances.set(this.normalizeDeviceId(dev.deviceId), instance)
      }
    } catch (e: any) {
      this.debugLog('Failed to register accessory instance: %s', e?.message ?? e)
    }
    try {
      this.infoLog(`Initialized Matter accessory: ${displayName} (type=${dev.deviceType ?? 'Unknown'}) id=${dev.deviceId}`)
    } catch (e: any) {
      this.debugLog('Failed to log initialized accessory:', e?.message ?? e)
    }

    // Register BLE->Matter push handler for this device's MAC (if BLE scanning is active)
    try {
      const mac = formatDeviceIdAsMac(dev.deviceId).toLowerCase()
      // Handler receives advertisement/serviceData when BLE scan events arrive
      this.bleEventHandler[mac] = async (serviceData?: any) => {
        const uuidLocal = baseOpts.uuid

        // First try model-specific / normalized parsing of BLE advertisement
        try {
          const parsed = this.parseAdvertisementForDevice(dev, serviceData)
          try {
            const _p = JSON.stringify(parsed)
            this.debugLog(`BLE advertisement parsed for ${dev.deviceId}: ${_p}`)
          } catch (e) {
            this.debugLog(`BLE advertisement parsed for ${dev.deviceId}: [unstringifiable parse result]`)
          }
          if (parsed) {
            // Power
            if (parsed.power !== undefined) {
              await this.api.matter.updateAccessoryState(uuidLocal, this.api.matter.clusterNames.OnOff, { onOff: Boolean(parsed.power) })
            }

            // Brightness
            if (parsed.brightness !== undefined) {
              const rawLevel = Math.round((Number(parsed.brightness) / 100) * 254)
              const level = Math.max(0, Math.min(254, rawLevel))
              this.debugLog(`[BLE Brightness Debug] Device ${dev.deviceId}: rawBrightness=${parsed.brightness}, calculated=${rawLevel}, clamped=${level}`)
              await this.api.matter.updateAccessoryState(uuidLocal, this.api.matter.clusterNames.LevelControl, { currentLevel: level })
            }

            // Color
            if (parsed.color !== undefined) {
              const { r, g, b } = parsed.color
              const [h, s] = rgb2hs(r, g, b)
              const rawHue = Math.round((h / 360) * 254)
              const rawSat = Math.round((s / 100) * 254)
              const hue = Math.max(0, Math.min(254, rawHue))
              const sat = Math.max(0, Math.min(254, rawSat))
              this.debugLog(`[BLE Color Debug] Device ${dev.deviceId}: RGB=[${r},${g},${b}], HS=[${h},${s}], Matter=[${rawHue},${rawSat}], clamped=[${hue},${sat}]`)
              await this.api.matter.updateAccessoryState(uuidLocal, this.api.matter.clusterNames.ColorControl, { currentHue: hue, currentSaturation: sat })
            }

            // Battery -> powerSource cluster (common mapping)
            if (parsed.battery !== undefined) {
              // Skip battery updates for device types that don't support PowerSource cluster
              const deviceType = String(dev?.deviceType ?? '')
              const unsupportedTypes = ['Curtain', 'Curtain2', 'Curtain3', 'Curtain 2', 'Blind Tilt']

              if (unsupportedTypes.includes(deviceType)) {
                this.debugLog(`Device ${dev.deviceId} type ${deviceType} does not support PowerSource cluster, skipping BLE battery update`)
              } else {
                try {
                  const percentage = Number(parsed.battery)
                  const batPercentRemaining = Math.max(0, Math.min(200, Math.round(percentage * 2)))
                  let batChargeLevel = 0
                  if (percentage < 20) {
                    batChargeLevel = 2
                  } else if (percentage < 40) {
                    batChargeLevel = 1
                  }
                  try {
                    await this.api.matter.updateAccessoryState(uuidLocal, 'powerSource', { batPercentRemaining, batChargeLevel })
                  } catch (updateError: any) {
                    // Silently skip if powerSource cluster doesn't exist on this device
                    const msg = String(updateError?.message ?? updateError)
                    if (!msg.includes('does not exist') && !msg.includes('not found')) {
                      throw updateError
                    }
                  }
                } catch (e: any) {
                  this.debugLog(`Failed to update battery state for ${dev.deviceId}: ${e?.message ?? e}`)
                }
              }
            }

            // Temperature -> temperatureMeasurement
            if (parsed.temperature !== undefined) {
              try {
                const c = Number(parsed.temperature)
                const measured = Math.round(c * 100)
                await this.api.matter.updateAccessoryState(uuidLocal, 'temperatureMeasurement', { measuredValue: measured })
              } catch (e: any) {
                this.debugLog(`Failed to update temperature for ${dev.deviceId}: ${e?.message ?? e}`)
              }
            }

            // Humidity -> relativeHumidityMeasurement
            if (parsed.humidity !== undefined) {
              try {
                const percent = Number(parsed.humidity)
                const measured = Math.round(percent * 100)
                await this.api.matter.updateAccessoryState(uuidLocal, 'relativeHumidityMeasurement', { measuredValue: measured })
              } catch (e: any) {
                this.debugLog(`Failed to update humidity for ${dev.deviceId}: ${e?.message ?? e}`)
              }
            }

            // Contact / Leak -> BooleanState
            if (parsed.contact !== undefined || parsed.leak !== undefined) {
              try {
                // Some devices report contact as true=open; ContactSensor expects inverted value
                const isContactOpen = parsed.contact === undefined ? undefined : Boolean(parsed.contact)
                const leakDetected = parsed.leak === undefined ? undefined : Boolean(parsed.leak)

                if (isContactOpen !== undefined) {
                  // If this is a contact sensor device type, invert; otherwise set conservatively
                  if ((dev.deviceType || '').includes('Contact')) {
                    await this.api.matter.updateAccessoryState(uuidLocal, this.api.matter.clusterNames.BooleanState, { stateValue: !isContactOpen })
                  } else {
                    await this.api.matter.updateAccessoryState(uuidLocal, this.api.matter.clusterNames.BooleanState, { stateValue: isContactOpen })
                  }
                }

                if (leakDetected !== undefined) {
                  await this.api.matter.updateAccessoryState(uuidLocal, this.api.matter.clusterNames.BooleanState, { stateValue: leakDetected })
                }
              } catch (e: any) {
                this.debugLog(`Failed to update contact/leak for ${dev.deviceId}: ${e?.message ?? e}`)
              }
            }

            // Motion -> occupancy
            if (parsed.motion !== undefined) {
              try {
                await this.api.matter.updateAccessoryState(uuidLocal, 'occupancySensing', { occupancy: { occupied: Boolean(parsed.motion) } })
              } catch (e: any) {
                this.debugLog(`Failed to update occupancy for ${dev.deviceId}: ${e?.message ?? e}`)
              }
            }

            // Lock state -> doorLock
            if (parsed.lock !== undefined) {
              try {
                const s = String(parsed.lock).toLowerCase()
                let lockState = 0
                if (s === 'locked' || s === '1' || s === 'true') {
                  lockState = 1
                } else if (s === 'unlocked' || s === '0' || s === 'false') {
                  lockState = 2
                }
                await this.api.matter.updateAccessoryState(uuidLocal, this.api.matter.clusterNames.DoorLock, { lockState })
              } catch (e: any) {
                this.debugLog(`Failed to update lock for ${dev.deviceId}: ${e?.message ?? e}`)
              }
            }

            // Position / Cover -> WindowCovering (convert open percent to closed*100)
            if (parsed.position !== undefined) {
              try {
                const openPercent = Number(parsed.position)
                const closedPercent = 100 - Math.max(0, Math.min(100, openPercent))
                const value = Math.round(closedPercent * 100)
                await this.api.matter.updateAccessoryState(uuidLocal, this.api.matter.clusterNames.WindowCovering, { currentPositionLiftPercent100ths: value, targetPositionLiftPercent100ths: value })
              } catch (e: any) {
                this.debugLog(`Failed to update cover position for ${dev.deviceId}: ${e?.message ?? e}`)
              }
            }

            // Fan speed -> FanControl
            if (parsed.fanSpeed !== undefined) {
              try {
                const percent = Number(parsed.fanSpeed)
                await this.api.matter.updateAccessoryState(uuidLocal, this.api.matter.clusterNames.FanControl, { percentSetting: percent, percentCurrent: percent })
              } catch (e: any) {
                this.debugLog(`Failed to update fan speed for ${dev.deviceId}: ${e?.message ?? e}`)
              }
            }

            // Robot vacuum fields (battery already handled) - update run/operational/clean modes when present
            if (parsed.rvcRunMode !== undefined) {
              try {
                await this.api.matter.updateAccessoryState(uuidLocal, 'rvcRunMode', { currentMode: Number(parsed.rvcRunMode) })
              } catch (e: any) {
                this.debugLog(`Failed to update rvcRunMode for ${dev.deviceId}: ${e?.message ?? e}`)
              }
            }

            if (parsed.rvcOperationalState !== undefined) {
              try {
                await this.api.matter.updateAccessoryState(uuidLocal, 'rvcOperationalState', { operationalState: Number(parsed.rvcOperationalState) })
              } catch (e: any) {
                this.debugLog(`Failed to update rvcOperationalState for ${dev.deviceId}: ${e?.message ?? e}`)
              }
            }

            // If we parsed something from serviceData prefer it and return early
            if (serviceData) {
              return
            }
          }
        } catch (e: any) {
          this.debugLog(`BLE advertisement parsing failed for ${dev.deviceId}: ${e?.message ?? e}`)
        }

        // Fallback to OpenAPI getDeviceStatus when serviceData is not present or parsing failed
        if (!this.switchBotAPI) {
          return
        }
        try {
          if (!this.apiTracker?.trySpend('poll')) {
            return
          }
          const { response, statusCode } = await this.switchBotAPI.getDeviceStatus(dev.deviceId, this.config.credentials?.token, this.config.credentials?.secret)
          const respAny: any = response
          const body = respAny?.body ?? respAny
          try {
            const s = JSON.stringify(body)
            this.debugLog(`OpenAPI getDeviceStatus for ${dev.deviceId} returned statusCode=${statusCode} body=${s}`)
          } catch (e) {
            this.debugLog(`OpenAPI getDeviceStatus for ${dev.deviceId} returned statusCode=${statusCode} (body not stringifiable)`)
          }
          if (!isSuccessfulStatusCode(statusCode)) {
            return
          }
          const status = body?.status ?? body

          // Use centralized mapper which prefers accessory instance update helpers
          await this.applyStatusWithRegistrationRetry(uuidLocal, dev, status)
        } catch (e: any) {
          this.debugLog(`BLE push handler failed for ${dev.deviceId}: ${e?.message ?? e}`)
        }
      }
    } catch (e: any) {
      this.debugLog(`Failed to register BLE handler for ${dev.deviceId}: ${e?.message ?? e}`)
    }

    // Schedule periodic OpenAPI refreshes for this device (if OpenAPI is configured)
    try {
      const nid = this.normalizeDeviceId(dev.deviceId)
      // Clear any existing timer for this device
      const existing = this.refreshTimers.get(nid)
      if (existing) {
        clearInterval(existing)
        this.refreshTimers.delete(nid)
      }

      const platformInterval = this.getPlatformBatchInterval()
      const hasDeviceInterval = typeof dev.refreshRate === 'number' && Number(dev.refreshRate) > 0
      if (this.switchBotAPI && (hasDeviceInterval || platformInterval > 0)) {
        // One-shot to populate initial state AFTER registration has likely completed
        // Defer slightly to avoid race where updateAccessoryState runs before registration
        ;(async () => {
          await sleep(250)
          try {
            this.infoLog(`Performing initial OpenAPI refresh for ${dev.deviceId}`)
            if (!this.apiTracker?.trySpend('poll')) {
              this.warnLog(`Skipping initial OpenAPI refresh for ${dev.deviceId} due to daily budget`)
              return
            }
            const { response, statusCode } = await this.switchBotAPI!.getDeviceStatus(dev.deviceId, this.config.credentials?.token, this.config.credentials?.secret)
            const respAny: any = response
            const body = respAny?.body ?? respAny
            try {
              const s = JSON.stringify(body)
              this.debugLog(`Initial OpenAPI refresh for ${dev.deviceId} returned statusCode=${statusCode} body=${s}`)
            } catch (e) {
              this.debugLog(`Initial OpenAPI refresh for ${dev.deviceId} returned statusCode=${statusCode} (body not stringifiable)`)
            }
            if (isSuccessfulStatusCode(statusCode)) {
              const status = body?.status ?? body
              await this.applyStatusWithRegistrationRetry(uuid, dev, status)
              this.infoLog(`Initial OpenAPI refresh succeeded for ${dev.deviceId}`)
            } else {
              this.warnLog(`Initial OpenAPI refresh returned unexpected statusCode=${statusCode} for ${dev.deviceId}`)
            }
          } catch (e: any) {
            this.errorLog(`Initial OpenAPI refresh failed for ${dev.deviceId}: ${e?.message ?? e}`)
          }
        })()

        if (hasDeviceInterval) {
          // Create a per-device timer and exclude it from batch
          const interval = Number(dev.refreshRate)
          this.perDeviceRefreshSet.add(nid)
          const timer = setInterval(async () => {
            try {
              // Skip if device is under cooldown
              const now = Date.now()
              const nextAllowed = this.backoffCooldowns.get(nid) ?? 0
              if (now < nextAllowed) {
                return
              }
              await this.refreshSingleDeviceWithRetry(dev)
            } catch (e: any) {
              this.debugLog(`Per-device refresh failed for ${dev.deviceId}: ${e?.message ?? e}`)
            }
          }, interval * 1000)
          this.refreshTimers.set(nid, timer)
          this.infoLog(`Started per-device refresh timer for ${dev.deviceId} at ${interval}s`)
        } else {
          // Start platform-level batched refresh timer (only once)
          this.startPlatformRefreshTimer(platformInterval)
        }
      }
    } catch (e: any) {
      this.debugLog(`Failed to schedule refresh for ${dev.deviceId}: ${e?.message ?? e}`)
    }

    // Register webhook handler for this device
    try {
      if (dev.webhook && dev.deviceId) {
        this.debugLog(`Registering webhook handler for Matter device: ${dev.deviceId}`)
        this.webhookEventHandler[dev.deviceId] = async (context: any) => {
          try {
            this.debugLog(`Received webhook for Matter device ${dev.deviceId}: ${JSON.stringify(context)}`)
            // Apply webhook status update to the accessory
            await this.applyStatusWithRegistrationRetry(uuid, dev, context)
          } catch (e: any) {
            this.errorLog(`Failed to handle webhook for ${dev.deviceId}: ${e?.message ?? e}`)
          }
        }
        this.debugSuccessLog(`Webhook handler registered for ${dev.deviceId}`)
      }
    } catch (e: any) {
      this.debugLog(`Failed to register webhook handler for ${dev.deviceId}: ${e?.message ?? e}`)
    }

    return instance.toAccessory()
  }

  /**
   * Discover devices via SwitchBot OpenAPI and cache them for later use
   */
  private async discoverDevices(): Promise<void> {
    if (!this.switchBotAPI) {
      this.debugLog('SwitchBot OpenAPI not configured; skipping discovery')
      return
    }

    try {
      if (!this.apiTracker?.trySpend('discovery')) {
        this.warnLog('OpenAPI daily budget reached; skipping Matter discovery')
        return
      }
      const { response, statusCode } = await this.switchBotAPI.getDevices()
      this.debugLog(`SwitchBot getDevices response status: ${statusCode}`)
      if (isSuccessfulStatusCode(statusCode)) {
        const deviceList = Array.isArray(response?.body?.deviceList) ? response.body.deviceList : []
        this.discoveredDevices = deviceList
        this.infoLog(`Discovered ${deviceList.length} SwitchBot device(s) from OpenAPI`)
        for (const d of deviceList) {
          this.debugLog(`  - ${d.deviceName} (${d.deviceType}) id=${d.deviceId}`)
        }

        const irDeviceList = Array.isArray(response?.body?.infraredRemoteList) ? response.body.infraredRemoteList : []
        this.discoveredIRDevices = irDeviceList
        this.infoLog(`Discovered ${irDeviceList.length} SwitchBot IR device(s) from OpenAPI`)
        for (const d of irDeviceList) {
          this.debugLog(`  - ${d.deviceName} (${d.remoteType}) id=${d.deviceId}`)
        }

        // Diagnostic: warn users if their device count + refresh rate may exceed daily limits
        this.validateApiUsageConfig(deviceList.length, irDeviceList.length)
      } else {
        this.warnLog(`SwitchBot getDevices returned status ${statusCode}`)
        // If rate limit exceeded (429), log specific message
        if (statusCode === 429) {
          this.warnLog('OpenAPI rate limit (429) exceeded during discovery.')
          this.warnLog('Webhook functionality will still work for manually configured devices.')
          this.warnLog('Device state updates will be limited until rate limit resets.')
        }
      }
    } catch (e: any) {
      this.errorLog('Failed to discover SwitchBot devices:', e?.message ?? e)
    }
  }

  /**
   * Setup MQTT connection (if configured) and route incoming webhook messages
   * to registered webhook handlers. Mirrors behaviour in platform-hap.
   */
  async setupMqtt(): Promise<void> {
    if (this.config.options?.mqttURL) {
      try {
        const { connectAsync } = asyncmqtt
        this.mqttClient = await connectAsync(this.config.options?.mqttURL, this.config.options.mqttOptions || {})
        this.debugLog('MQTT connection has been established successfully.')
        this.mqttClient.on('error', async (e: Error) => {
          this.errorLog(`Failed to publish MQTT messages. ${e.message ?? e}`)
        })
        if (!this.config.options?.webhookURL) {
          // receive webhook events via MQTT
          this.infoLog(`Webhook is configured to be received through ${this.config.options.mqttURL}/homebridge-switchbot/webhook.`)
          this.mqttClient.subscribe('homebridge-switchbot/webhook/+')
          this.mqttClient.on('message', async (topic: string, message: any) => {
            try {
              this.debugLog(`Received Webhook via MQTT: ${topic}=${message}`)
              const context = JSON.parse(message.toString())
              this.webhookEventHandler[context.deviceMac]?.(context)
            } catch (e: any) {
              this.errorLog(`Failed to handle webhook event. Error: ${e.message ?? e}`)
            }
          })
        }
      } catch (e: any) {
        this.mqttClient = null
        this.errorLog(`Failed to establish MQTT connection. ${e.message ?? e}`)
      }
    }
  }

  /**
   * Setup OpenAPI webhook (if webhookURL configured) and forward incoming
   * webhook events to MQTT (if configured) and local handlers.
   */
  async setupwebhook() {
    if (this.config.options?.webhookURL) {
      const url = this.config.options?.webhookURL
      try {
        this.switchBotAPI?.setupWebhook(url)
        this.infoLog(`Webhook configured for URL: ${url}`)
        // Listen for webhook events
        this.switchBotAPI?.on('webhookEvent', (body: any) => {
          try {
            this.infoLog(`Received webhook event for device: ${body.context.deviceMac}`)
            if (this.config.options?.mqttURL) {
              const mac = body.context.deviceMac?.toLowerCase().match(/[\s\S]{1,2}/g)?.join(':')
              const options = this.config.options?.mqttPubOptions || {}
              this.mqttClient?.publish(`homebridge-switchbot/webhook/${mac}`, `${JSON.stringify(body.context)}`, options)
            }
            this.webhookEventHandler[body.context.deviceMac]?.(body.context)
          } catch (e: any) {
            this.errorLog(`Failed to handle webhook event. Error: ${e.message ?? e}`)
          }
        })
      } catch (e: any) {
        this.errorLog(`Failed to setup webhook. Error: ${e.message ?? e}`)
      }

      this.api.on('shutdown', async () => {
        try {
          this.switchBotAPI?.deleteWebhook(url)
        } catch (e: any) {
          this.errorLog(`Failed to delete webhook. Error: ${e.message ?? e}`)
        }
      })
    }
  }

  /**
   * Retry wrapper for control commands using SwitchBot OpenAPI
   */
  async retryCommand(deviceObj: device, bodyChange: bodyChange, maxRetries = 1, delayBetweenRetries = 1000): Promise<{ response: any, statusCode: number }> {
    // Check API budget BEFORE attempting any retries
    if (!this.apiTracker?.trySpend('command')) {
      return { response: {}, statusCode: 429 }
    }

    let retryCount = 0
    while (retryCount < maxRetries) {
      try {
        if (!this.switchBotAPI) {
          throw new Error('SwitchBot OpenAPI not initialized')
        }
        const { response, statusCode } = await this.switchBotAPI.controlDevice(
          deviceObj.deviceId,
          bodyChange.command,
          bodyChange.parameter,
          bodyChange.commandType as import('node-switchbot').commandType | undefined,
          this.config.credentials?.token,
          this.config.credentials?.secret,
        )
        return { response, statusCode }
      } catch (e: any) {
        this.debugLog(`retryCommand error: ${e?.message ?? e}`)
      }
      retryCount++

      await sleep(delayBetweenRetries)
    }
    return { response: {}, statusCode: 500 }
  }

  /**
   * Parse BLE advertisement/serviceData into normalized fields for a given device.
   * Returns null when serviceData is falsy or parsing fails.
   */
  private parseAdvertisementForDevice(dev: device, serviceData?: any) {
    if (!serviceData) {
      return null
    }
    try {
      const sd = serviceData
      const result: any = {}

      // Power/on state - supports multiple field names used by different models
      const power = sd.power ?? sd.on ?? sd.p
      if (power !== undefined) {
        result.power = (String(power).toLowerCase() === 'on' || Number(power) === 1)
      }

      // Brightness (0-100)
      const brightness = sd.brightness ?? sd.b
      if (brightness !== undefined) {
        result.brightness = Number(brightness)
      }

      // Color - could be 'r:g:b', '#rrggbb' or 'rrggbb'
      const color = sd.color ?? sd.rgb ?? sd.c
      if (color !== undefined) {
        let r = 0
        let g = 0
        let b = 0
        const c = String(color)
        if (c.includes(':')) {
          const parts = c.split(':').map(Number)
          ;[r, g, b] = parts
        } else if (c.includes(',')) {
          const parts = c.split(',').map(s => Number(s.trim()))
          ;[r, g, b] = parts
        } else if (c.includes(' ')) {
          const parts = c.split(' ').map(s => Number(s.trim()))
          ;[r, g, b] = parts
        } else if (c.startsWith('#')) {
          const hex = c.replace('#', '')
          r = Number.parseInt(hex.substring(0, 2), 16)
          g = Number.parseInt(hex.substring(2, 4), 16)
          b = Number.parseInt(hex.substring(4, 6), 16)
        } else if (/^[0-9a-f]{6}$/i.test(c)) {
          r = Number.parseInt(c.substring(0, 2), 16)
          g = Number.parseInt(c.substring(2, 4), 16)
          b = Number.parseInt(c.substring(4, 6), 16)
        }
        result.color = { r, g, b }
      }

      // Battery (some devices use battery or batt)
      const battery = sd.battery ?? sd.batt
      if (battery !== undefined) {
        result.battery = Number(battery)
      }

      // VOC / TVOC (some air quality devices report total volatile organic compounds)
      const voc = sd.voc ?? sd.tvoc
      if (voc !== undefined) {
        result.voc = Number(voc)
      }

      // PM10 (some devices report PM10 alongside PM2.5)
      const pm10 = sd.pm10
      if (pm10 !== undefined) {
        result.pm10 = Number(pm10)
      }

      // PM2.5 (some BLE adverts use pm25 / pm_2_5)
      const pm25 = sd.pm2_5 ?? sd.pm25 ?? sd.pm_2_5
      if (pm25 !== undefined) {
        result.pm25 = Number(pm25)
      }

      // CO2 (carbon dioxide ppm)
      const co2 = sd.co2 ?? sd.co2ppm ?? sd.carbonDioxide
      if (co2 !== undefined) {
        result.co2 = Number(co2)
      }

      // Temperature (C) and Humidity (%) — support common shorthand keys
      const temperature = sd.temperature ?? sd.temp ?? sd.t
      if (temperature !== undefined) {
        result.temperature = Number(temperature)
      }

      const humidity = sd.humidity ?? sd.h ?? sd.humid
      if (humidity !== undefined) {
        result.humidity = Number(humidity)
      }

      // Motion, Contact, Leak
      const motion = sd.motion ?? sd.m
      if (motion !== undefined) {
        result.motion = Boolean(motion)
      }

      const contact = sd.contact ?? sd.open
      if (contact !== undefined) {
        result.contact = contact
      }

      const leak = sd.leak ?? sd.water
      if (leak !== undefined) {
        result.leak = Boolean(leak)
      }

      // Position / Cover / Curtain synonyms
      const position = sd.position ?? sd.percent ?? sd.slidePosition ?? sd.curtainPosition
      if (position !== undefined) {
        result.position = Number(position)
      }

      // Fan speed/speed
      const fanSpeed = sd.fanSpeed ?? sd.speed
      if (fanSpeed !== undefined) {
        result.fanSpeed = Number(fanSpeed)
      }

      // Lock state
      const lock = sd.lock
      if (lock !== undefined) {
        result.lock = lock
      }

      // Robot vacuum fields
      const rvcRunMode = sd.rvcRunMode
      if (rvcRunMode !== undefined) {
        result.rvcRunMode = rvcRunMode
      }
      const rvcOperationalState = sd.rvcOperationalState
      if (rvcOperationalState !== undefined) {
        result.rvcOperationalState = rvcOperationalState
      }

      return result
    } catch (e: any) {
      this.debugLog(`parseAdvertisementForDevice failed for ${dev.deviceId}: ${e?.message ?? e}`)
      return null
    }
  }

  /**
   * Central helper to apply a SwitchBot status object to a Matter accessory.
   * Tries to call accessory instance update helpers when available, otherwise
   * falls back to calling api.matter.updateAccessoryState directly.
   */
  private async applyStatusToAccessory(uuidLocal: string, dev: device & devicesConfig, status: any) {
    if (!status) {
      return
    }

    const instance = dev?.deviceId ? this.accessoryInstances.get(this.normalizeDeviceId(dev.deviceId)) : undefined

    // Helper to safely call instance methods or fallback to api.matter.updateAccessoryState
    const safeUpdate = async (cluster: string, attributes: Record<string, unknown>, methodName?: string) => {
      try {
        // Special-case: powerSource cluster is optional on many devices (e.g., Curtains/Blinds).
        // To avoid noisy Matter server errors ("Behavior ID powerSource does not exist"),
        // always use the direct updateAccessoryState path wrapped in a guard for this cluster,
        // even when an accessory instance is present.
        const powerClusterName = (this.api.matter?.clusterNames && (this.api.matter.clusterNames as any).PowerSource)
          ? (this.api.matter.clusterNames as any).PowerSource
          : 'powerSource'
        const isPowerSourceCluster = cluster === powerClusterName || cluster === 'powerSource'

        // If the accessory instance declares supported clusters, skip updates for clusters
        // not present to avoid triggering Matter server errors and logs.
        let clusterSupported = true
        if (instance && (instance as any).clusters) {
          const declared = (instance as any).clusters
          if (Array.isArray(declared)) {
            clusterSupported = declared.includes(cluster)
          } else if (typeof declared === 'object') {
            clusterSupported = Object.prototype.hasOwnProperty.call(declared, cluster)
          }
          if (!clusterSupported) {
            this.debugLog(`Cluster ${cluster} not declared on accessory for ${dev.deviceId}, skipping update`)
            return
          }
        }

        if (instance && methodName && typeof (instance as any)[methodName] === 'function') {
          // prefer device-specific update helpers when available
          await (instance as any)[methodName](...(Object.values(attributes)))
        } else if (!isPowerSourceCluster && instance && typeof (instance as any).updateState === 'function') {
          // some accessories expose updateState that accepts cluster and attributes
          await (instance as any).updateState(cluster, attributes)
        } else {
          try {
            await this.api.matter.updateAccessoryState(uuidLocal, cluster, attributes)
          } catch (updateError: any) {
            // Silently ignore "does not exist" errors for clusters that aren't
            // supported by this device type (e.g., powerSource on WindowBlind).
            const msg = String(updateError?.message ?? updateError)
            if (msg.includes('does not exist') || msg.includes('not found')) {
              this.debugLog(`Cluster ${cluster} not available on ${dev.deviceId}, skipping update`)
              return
            }
            throw updateError
          }
        }
      } catch (e: any) {
        this.debugLog(`safeUpdate failed for ${dev.deviceId} cluster=${cluster}: ${e?.message ?? e}`)
      }
    }

    try {
      // On/Off
      if (status?.power !== undefined) {
        const on = (String(status.power).toLowerCase() === 'on' || Number(status.power) === 1 || Boolean(status.power) === true)
        await safeUpdate(this.api.matter.clusterNames.OnOff, { onOff: on }, 'updateOnOffState')
      }

      // Robot vacuum: some OpenAPI responses use 'runState' or similar textual
      // fields to indicate cleaning/mapping/idle. Map common textual values to
      // the numeric run mode values expected by the RoboticVacuumAccessory and
      // prefer calling accessory helpers when present.
      if (status?.runState !== undefined || status?.run_state !== undefined || status?.run !== undefined) {
        try {
          const raw = status?.runState ?? status?.run_state ?? status?.run
          let mode: number | undefined
          if (typeof raw === 'number') {
            mode = Number(raw)
          } else if (typeof raw === 'string') {
            const s = raw.toLowerCase()
            if (s.includes('clean')) {
              mode = 1 // Cleaning
            } else if (s.includes('map')) {
              mode = 2 // Mapping
            } else if (s.includes('idle') || s.includes('stop') || s.includes('dock') || s.includes('charge') || s.includes('docked')) {
              mode = 0 // Idle
            } else {
              const n = Number(raw)
              if (!Number.isNaN(n)) {
                mode = n
              }
            }
          }

          if (mode !== undefined) {
            await safeUpdate('rvcRunMode', { currentMode: Number(mode) }, 'updateRunMode')
          }
        } catch (e: any) {
          this.debugLog(`Failed to apply runState for ${dev.deviceId}: ${e?.message ?? e}`)
        }
      }

      // Robot vacuum: some firmwares expose 'taskType' or 'task' with similar semantics
      // to runState (e.g., 'cleaning', 'mapping', 'idle'). Map to rvcRunMode accordingly.
      if (status?.taskType !== undefined || status?.task_type !== undefined || status?.task !== undefined) {
        try {
          const raw = status?.taskType ?? status?.task_type ?? status?.task
          let mode: number | undefined
          if (typeof raw === 'number') {
            mode = Number(raw)
          } else if (typeof raw === 'string') {
            const s = raw.toLowerCase()
            if (s.includes('clean')) {
              mode = 1 // Cleaning
            } else if (s.includes('map')) {
              mode = 2 // Mapping
            } else if (s.includes('idle') || s.includes('stop') || s.includes('dock') || s.includes('charge') || s.includes('docked')) {
              mode = 0 // Idle
            } else {
              const n = Number(raw)
              if (!Number.isNaN(n)) {
                mode = n
              }
            }
          }

          if (mode !== undefined) {
            await safeUpdate('rvcRunMode', { currentMode: Number(mode) }, 'updateRunMode')
          }
        } catch (e: any) {
          this.debugLog(`Failed to apply taskType for ${dev.deviceId}: ${e?.message ?? e}`)
        }
      }

      // Brightness
      if (status?.brightness !== undefined) {
        const rawBrightness = Number(status.brightness)
        const clampedBrightness = Math.max(0, Math.min(100, rawBrightness))

        // If instance has updateBrightness method, it expects percentage (0-100)
        // Otherwise, updateAccessoryState expects Matter-scaled value (0-254)
        if (instance && typeof instance.updateBrightness === 'function') {
          this.debugLog(`[Brightness Debug] Device ${dev.deviceId}: calling updateBrightness with percent=${clampedBrightness}`)
          await safeUpdate(this.api.matter.clusterNames.LevelControl, { currentLevel: clampedBrightness }, 'updateBrightness')
        } else {
          const level = Math.round((clampedBrightness / 100) * 254)
          const clampedLevel = Math.max(0, Math.min(254, level))
          this.debugLog(`[Brightness Debug] Device ${dev.deviceId}: calling updateAccessoryState with rawBrightness=${rawBrightness}, level=${clampedLevel}`)
          await safeUpdate(this.api.matter.clusterNames.LevelControl, { currentLevel: clampedLevel })
        }
      }

      // Color
      if (status?.color !== undefined) {
        const color = String(status.color)
        let r = 0
        let g = 0
        let b = 0
        if (color.includes(':')) {
          const parts = color.split(':').map(Number)
          ;[r, g, b] = parts
        } else if (color.includes(',')) {
          const parts = color.split(',').map(s => Number(s.trim()))
          ;[r, g, b] = parts
        } else if (color.includes(' ')) {
          const parts = color.split(' ').map(s => Number(s.trim()))
          ;[r, g, b] = parts
        } else if (color.startsWith('#')) {
          const hex = color.replace('#', '')
          r = Number.parseInt(hex.substring(0, 2), 16)
          g = Number.parseInt(hex.substring(2, 4), 16)
          b = Number.parseInt(hex.substring(4, 6), 16)
        }
        const [h, s] = rgb2hs(r, g, b)
        const clampedH = Math.max(0, Math.min(360, h))
        const clampedS = Math.max(0, Math.min(100, s))

        // If instance has updateHueSaturation method, it expects raw values (h: 0-360, s: 0-100)
        // Otherwise, updateAccessoryState expects Matter-scaled values (0-254)
        if (instance && typeof instance.updateHueSaturation === 'function') {
          this.debugLog(`[Color Debug] Device ${dev.deviceId}: calling updateHueSaturation with color="${color}", RGB=[${r},${g},${b}], HS=[${clampedH},${clampedS}]`)
          await safeUpdate(this.api.matter.clusterNames.ColorControl, { currentHue: clampedH, currentSaturation: clampedS }, 'updateHueSaturation')
        } else {
          const hue = Math.round((clampedH / 360) * 254)
          const sat = Math.round((clampedS / 100) * 254)
          const clampedHue = Math.max(0, Math.min(254, hue))
          const clampedSat = Math.max(0, Math.min(254, sat))
          this.debugLog(`[Color Debug] Device ${dev.deviceId}: calling updateAccessoryState with color="${color}", RGB=[${r},${g},${b}], HS=[${h},${s}], Matter=[${clampedHue},${clampedSat}]`)
          await safeUpdate(this.api.matter.clusterNames.ColorControl, { currentHue: clampedHue, currentSaturation: clampedSat })
        }
      }

      // Battery/powerSource (support many possible field names)
      // Note: Some device types like WindowBlind and RoboticVacuumCleaner don't support PowerSource cluster
      if (status?.battery !== undefined || status?.batt !== undefined || status?.batteryLevel !== undefined || status?.batteryPercentage !== undefined || status?.battery_level !== undefined
        || status?.baseBattery !== undefined || status?.base_battery !== undefined || status?.stationBattery !== undefined || status?.waterBaseBattery !== undefined || status?.dockBattery !== undefined) {
        // Skip battery updates for device types that don't support PowerSource cluster
        const deviceType = String(status?.deviceType ?? dev?.deviceType ?? '')
        const unsupportedTypes = [
          'Curtain',
          'Curtain2',
          'Curtain3',
          'Curtain 2',
          'Blind Tilt',
          // Robot Vacuums - PowerSource cluster not in Matter spec for RoboticVacuumCleaner
          'K10+',
          'K10+ Pro',
          'WoSweeper',
          'WoSweeperMini',
          'Robot Vacuum Cleaner S1',
          'Robot Vacuum Cleaner S1 Plus',
          'Robot Vacuum Cleaner S10',
          'Robot Vacuum Cleaner S1 Pro',
          'Robot Vacuum Cleaner S1 Mini',
        ]

        if (unsupportedTypes.includes(deviceType)) {
          this.debugLog(`Device ${dev.deviceId} type ${deviceType} does not support PowerSource cluster, skipping battery update`)
        } else {
          try {
            const percentage = Number(
              status?.battery ?? status?.batt ?? status?.batteryPercentage ?? status?.batteryLevel ?? status?.battery_level
              ?? status?.baseBattery ?? status?.base_battery ?? status?.stationBattery ?? status?.waterBaseBattery ?? status?.dockBattery,
            )
            const batPercentRemaining = Math.max(0, Math.min(200, Math.round(percentage * 2)))
            let batChargeLevel = 0
            if (percentage < 20) {
              batChargeLevel = 2
            } else if (percentage < 40) {
              batChargeLevel = 1
            }
            const powerCluster = (this.api.matter?.clusterNames && (this.api.matter.clusterNames as any).PowerSource) ? (this.api.matter.clusterNames as any).PowerSource : 'powerSource'
            await safeUpdate(powerCluster, { batPercentRemaining, batChargeLevel }, 'updateBatteryPercentage')
          } catch (e: any) {
            this.debugLog(`Failed to apply battery status for ${dev.deviceId}: ${e?.message ?? e}`)
          }
        }
      }

      // Temperature + thermostat
      if (status?.temperature !== undefined || status?.temp !== undefined) {
        try {
          const c = Number(status?.temperature ?? status?.temp)
          const measured = Math.round(c * 100)
          await safeUpdate('temperatureMeasurement', { measuredValue: measured }, 'updateTemperature')
          // Thermostat-specific mapping
          if (status?.targetTemp !== undefined || status?.targetTemperature !== undefined || status?.heatingSetpoint !== undefined) {
            const target = Number(status?.targetTemp ?? status?.targetTemperature ?? status?.heatingSetpoint)
            const val = Math.round(target * 100)
            await safeUpdate('thermostat', { occupiedHeatingSetpoint: val }, 'updateHeatingSetpoint')
          }
        } catch (e: any) {
          this.debugLog(`Failed to apply temperature for ${dev.deviceId}: ${e?.message ?? e}`)
        }
      }

      // Humidity (support different keys)
      if (status?.humidity !== undefined || status?.h !== undefined || status?.humid !== undefined) {
        try {
          const percent = Number(status?.humidity ?? status?.h ?? status?.humid)
          const measured = Math.round(percent * 100)
          await safeUpdate('relativeHumidityMeasurement', { measuredValue: measured }, 'updateHumidity')
        } catch (e: any) {
          this.debugLog(`Failed to apply humidity for ${dev.deviceId}: ${e?.message ?? e}`)
        }
      }

      // Contact / Leak -> BooleanState
      if (status?.contact !== undefined || status?.open !== undefined || status?.leak !== undefined || status?.water !== undefined) {
        try {
          const isContactOpen = status?.contact ?? status?.open
          if (isContactOpen !== undefined) {
            if ((dev.deviceType || '').includes('Contact')) {
              await safeUpdate(this.api.matter.clusterNames.BooleanState, { stateValue: !(String(isContactOpen).toLowerCase() === 'true' || Number(isContactOpen) === 1) }, 'updateContactState')
            } else {
              await safeUpdate(this.api.matter.clusterNames.BooleanState, { stateValue: (String(isContactOpen).toLowerCase() === 'true' || Number(isContactOpen) === 1) }, 'updateContactState')
            }
          }
          const leakDetected = status?.leak ?? status?.water
          if (leakDetected !== undefined) {
            await safeUpdate(this.api.matter.clusterNames.BooleanState, { stateValue: Boolean(leakDetected) }, 'updateLeakState')
          }
        } catch (e: any) {
          this.debugLog(`Failed to apply contact/leak for ${dev.deviceId}: ${e?.message ?? e}`)
        }
      }

      // Motion -> occupancy
      if (status?.motion !== undefined || status?.m !== undefined) {
        try {
          const detected = Boolean(status?.motion ?? status?.m)
          await safeUpdate('occupancySensing', { occupancy: { occupied: detected } }, 'updateOccupancy')
        } catch (e: any) {
          this.debugLog(`Failed to apply motion for ${dev.deviceId}: ${e?.message ?? e}`)
        }
      }

      // Lock state
      if (status?.lock !== undefined) {
        try {
          const s = String(status.lock).toLowerCase()
          let lockState = 0
          if (s === 'locked' || s === '1' || s === 'true') {
            lockState = 1
          } else if (s === 'unlocked' || s === '0' || s === 'false') {
            lockState = 2
          }
          await safeUpdate(this.api.matter.clusterNames.DoorLock, { lockState }, 'updateLockState')
        } catch (e: any) {
          this.debugLog(`Failed to apply lock for ${dev.deviceId}: ${e?.message ?? e}`)
        }
      }

      // Cover position
      if (status?.position !== undefined || status?.percent !== undefined) {
        try {
          const openPercent = Number(status?.position ?? status?.percent)
          const closedPercent = 100 - Math.max(0, Math.min(100, openPercent))
          const value = Math.round(closedPercent * 100)
          await safeUpdate(this.api.matter.clusterNames.WindowCovering, { currentPositionLiftPercent100ths: value, targetPositionLiftPercent100ths: value }, 'updateLiftPosition')
        } catch (e: any) {
          this.debugLog(`Failed to apply cover position for ${dev.deviceId}: ${e?.message ?? e}`)
        }
      }

      // Fan
      if (status?.fanSpeed !== undefined || status?.speed !== undefined) {
        try {
          const percent = Number(status?.fanSpeed ?? status?.speed)
          await safeUpdate(this.api.matter.clusterNames.FanControl, { percentSetting: percent, percentCurrent: percent }, 'updateFanSpeed')
        } catch (e: any) {
          this.debugLog(`Failed to apply fan speed for ${dev.deviceId}: ${e?.message ?? e}`)
        }
      }

      // Robot vacuum: run/operational/clean modes
      if (status?.rvcRunMode !== undefined) {
        try {
          await safeUpdate('rvcRunMode', { currentMode: Number(status.rvcRunMode) }, 'updateRunMode')
        } catch (e: any) {
          this.debugLog(`Failed to apply rvcRunMode for ${dev.deviceId}: ${e?.message ?? e}`)
        }
      }
      // CO2 (carbon dioxide) - support common synonyms
      if (status?.co2 !== undefined || status?.co2ppm !== undefined || status?.carbonDioxide !== undefined) {
        try {
          const val = Number(status?.co2 ?? status?.co2ppm ?? status?.carbonDioxide)
          await safeUpdate('carbonDioxide', { carbonDioxideLevel: val }, 'updateCO2')
        } catch (e: any) {
          this.debugLog(`Failed to apply CO2 for ${dev.deviceId}: ${e?.message ?? e}`)
        }
      }

      // PM2.5 / particulate matter
      if (status?.pm2_5 !== undefined || status?.pm25 !== undefined || status?.pm_2_5 !== undefined) {
        try {
          const pm = Number(status?.pm2_5 ?? status?.pm25 ?? status?.pm_2_5)
          await safeUpdate('pm2_5', { pm25: pm }, 'updatePM25')
        } catch (e: any) {
          this.debugLog(`Failed to apply PM2.5 for ${dev.deviceId}: ${e?.message ?? e}`)
        }
      }
      // PM10 (some devices report pm10)
      if (status?.pm10 !== undefined) {
        try {
          const pm10 = Number(status?.pm10)
          await safeUpdate('pm10', { pm10 }, 'updatePM10')
        } catch (e: any) {
          this.debugLog(`Failed to apply PM10 for ${dev.deviceId}: ${e?.message ?? e}`)
        }
      }

      // VOC / TVOC - volatile organic compounds
      if (status?.voc !== undefined || status?.tvoc !== undefined) {
        try {
          const val = Number(status?.voc ?? status?.tvoc)
          await safeUpdate('voc', { voc: val }, 'updateVOC')
        } catch (e: any) {
          this.debugLog(`Failed to apply VOC for ${dev.deviceId}: ${e?.message ?? e}`)
        }
      }
      if (status?.rvcOperationalState !== undefined) {
        try {
          await safeUpdate('rvcOperationalState', { operationalState: Number(status.rvcOperationalState) }, 'updateOperationalState')
        } catch (e: any) {
          this.debugLog(`Failed to apply rvcOperationalState for ${dev.deviceId}: ${e?.message ?? e}`)
        }
      }
    } catch (e: any) {
      this.debugLog(`applyStatusToAccessory top-level failure for ${dev.deviceId}: ${e?.message ?? e}`)
    }
  }

  /**
   * Apply status update with a small retry if the accessory is not yet registered.
   * Useful for first-time updates that can race with registration.
   */
  private async applyStatusWithRegistrationRetry(
    uuidLocal: string,
    dev: device & devicesConfig,
    status: any,
    retries = 1,
    delayMs = 300,
  ): Promise<void> {
    let attempt = 0
    // Normalize retries bounds
    const maxAttempts = Math.max(1, retries + 1)
    while (attempt < maxAttempts) {
      try {
        await this.applyStatusToAccessory(uuidLocal, dev, status)
        return
      } catch (e: any) {
        const msg = String(e?.message ?? e)
        const notReady = msg.includes('not found') || msg.includes('not registered')
        if (!notReady || attempt >= maxAttempts - 1) {
          throw e
        }
        this.debugLog(`Accessory ${uuidLocal} not registered yet for ${dev.deviceId}, retrying in ${delayMs}ms`)
        await sleep(delayMs)
        attempt++
      }
    }
  }

  /**
   * Required for DynamicPlatformPlugin
   * Called when homebridge restores cached accessories from disk at startup
   */
  configureAccessory(/* accessory: PlatformAccessory */) {
    // Note this is not used for Matter accessories - use configureMatterAccessory instead
    // This plugin does not have any hap accessories, so here we can comment this out
    // this.accessories.set(accessory.UUID, accessory)
  }

  /**
   * Called when homebridge restores cached Matter accessories from disk at startup.
   *
   * This is where you can access the `accessory.context` object to retrieve
   * any custom data you stored when the accessory was originally registered.
   */
  configureMatterAccessory(accessory: SerializedMatterAccessory) {
    this.debugLog('Loading cached Matter accessory:', accessory.displayName)
    this.matterAccessories.set(accessory.uuid, accessory)
  }

  /**
   * Register all Matter accessories
   */
  private async registerMatterAccessories() {
    // Remove accessories that are disabled in config
    await this.removeDisabledAccessories()

    // If we discovered real SwitchBot devices via OpenAPI, map and register them
    if (this.discoveredDevices && this.discoveredDevices.length > 0) {
      this.infoLog(`Registering ${this.discoveredDevices.length} discovered SwitchBot device(s) as Matter accessories`)

      // Merge device config (deviceConfig per deviceType and per-device overrides) to match HAP behavior
      const devicesToProcess = await this.mergeDiscoveredDevices(this.discoveredDevices)

      // By default, automatically remove previously-registered Matter
      // accessories whose deviceId is not present in the merged discovered
      // list. If the user explicitly sets `options.keepStaleAccessories` to
      // true, then we will keep previously-registered accessories (legacy
      // behavior).
      if ((this.config as any).options?.keepStaleAccessories) {
        this.debugLog('Keeping previously-registered stale accessories because options.keepStaleAccessories=true')
      } else {
        try {
          const desiredIds = new Set((devicesToProcess || []).map((d: any) => this.normalizeDeviceId(d.deviceId)))
          const toUnregister: Array<MatterAccessory<Record<string, unknown>>> = []
          for (const [uuid, acc] of Array.from(this.matterAccessories.entries())) {
            try {
              const deviceId = (acc as any)?.context?.deviceId
              if (!deviceId) {
                continue
              }
              const nid = this.normalizeDeviceId(deviceId)
              if (!desiredIds.has(nid)) {
                // Accessory exists but is no longer desired -> schedule for removal
                this.infoLog(`Removing previously-registered accessory for deviceId=${deviceId} (no longer discovered or configured)`)
                try {
                  this.clearDeviceResources(deviceId)
                } catch (e: any) {
                  this.debugLog(`Failed to clear resources for ${deviceId} before unregister: ${e?.message ?? e}`)
                }
                toUnregister.push(acc as unknown as MatterAccessory<Record<string, unknown>>)
                this.matterAccessories.delete(uuid)
              }
            } catch (e: any) {
              this.debugLog(`Error while checking existing accessory ${uuid}: ${e?.message ?? e}`)
            }
          }

          if (toUnregister.length > 0) {
            try {
              await this.api.matter.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, toUnregister)
            } catch (e: any) {
              this.debugLog(`Failed to unregister accessories: ${e?.message ?? e}`)
            }
          }
        } catch (e: any) {
          this.debugLog(`Failed to remove stale accessories: ${e?.message ?? e}`)
        }
      }

      // We'll separate discovered devices into two buckets:
      // - platformAccessories: accessories that will be hosted under the plugin's Matter bridge
      // - roboticAccessories: robot vacuum devices which require standalone commissioning behaviour
      const platformAccessories: Array<MatterAccessory<Record<string, unknown>>> = []
      const roboticAccessories: Array<MatterAccessory<Record<string, unknown>>> = []

      // Known robot vacuum deviceType names (matches mapping in createAccessoryFromDevice)
      const robotTypes = new Set([
        'K10+',
        'K10+ Pro',
        'WoSweeper',
        'WoSweeperMini',
        'Robot Vacuum Cleaner S1',
        'Robot Vacuum Cleaner S1 Plus',
        'Robot Vacuum Cleaner S10',
        'Robot Vacuum Cleaner S1 Pro',
        'Robot Vacuum Cleaner S1 Mini',
      ])

      for (const dev of devicesToProcess) {
        try {
          const acc = await this.createAccessoryFromDevice(dev)
          if (!acc) {
            continue
          }
          if (robotTypes.has(dev.deviceType ?? '')) {
            roboticAccessories.push(acc)
          } else {
            platformAccessories.push(acc)
          }
        } catch (e: any) {
          this.errorLog(`Failed to create Matter accessory for ${dev.deviceId}: ${e?.message ?? e}`)
        }
      }

      // Register platform-hosted accessories (most devices)
      if (platformAccessories.length > 0) {
        this.infoLog(`✓ Registered ${platformAccessories.length} discovered platform-hosted device(s)`)
        for (const acc of platformAccessories) {
          this.infoLog(`  - ${acc.displayName}`)
        }
        await this.api.matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, platformAccessories)
      }

      // Register robotic accessories (robot vacuums) separately so they can be
      // commissioned in the way Apple Home expects (these devices often require
      // standalone commissioning flow). We still call registerPlatformAccessories
      // because the accessory implementations manage their commissioning behavior.
      if (roboticAccessories.length > 0) {
        this.infoLog(`✓ Registered ${roboticAccessories.length} discovered robot vacuum device(s)`)
        for (const acc of roboticAccessories) {
          this.infoLog(`  - ${acc.displayName} (standalone for Apple Home compatibility)`)
        }
        await this.api.matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, roboticAccessories)
      }

      // Debug/info: how many discovered vs example accessories were registered.
      // Example accessories are disabled — we intentionally do NOT register them.
      const discoveredRegistered = platformAccessories.length + roboticAccessories.length
      const exampleRegistered = 0
      this.debugLog(`Discovered accessories registered: ${discoveredRegistered}; Example accessories registered: ${exampleRegistered}`)

      // Dump registry state to help runtime debugging: which accessory instances
      // were created and which refresh timers are scheduled. This helps confirm
      // whether safeUpdate will prefer accessory helpers and whether periodic
      // refreshes exist for each device.
      try {
        const instanceKeys = Array.from(this.accessoryInstances.keys())
        this.debugLog(`Accessory instances registered (${instanceKeys.length}): ${JSON.stringify(instanceKeys)}`)
        const timerKeys = Array.from(this.refreshTimers.keys())
        this.debugLog(`Refresh timers scheduled (${timerKeys.length}): ${JSON.stringify(timerKeys)}`)
      } catch (e: any) {
        this.debugLog(`Failed to dump platform registries: ${e?.message ?? e}`)
      }

      return
    }

    // If no discovered devices are available, check for cached Matter accessories
    const hasCachedAccessories = this.matterAccessories.size > 0
    if (hasCachedAccessories) {
      this.infoLog(`No devices discovered via OpenAPI, but found ${this.matterAccessories.size} cached Matter accessories.`)
      this.infoLog('Cached accessories will continue to function with webhook updates.')
      this.infoLog('Restoring webhook handlers for cached Matter accessories...')
      await this.restoreCachedMatterAccessoryWebhooks()
      this.infoLog('Device discovery will resume when API becomes available.')
    } else {
      this.infoLog('No discovered SwitchBot devices found.')
    }

    this.debugLog('═'.repeat(80))
    this.debugLog('Finished registering Matter accessories')
    this.debugLog('═'.repeat(80))
  }

  /**
   * Restore webhook handlers for cached Matter accessories
   * This ensures webhook functionality continues to work even when device discovery fails
   */
  private async restoreCachedMatterAccessoryWebhooks() {
    this.debugLog('Restoring webhook handlers for cached Matter accessories...')

    let restoredCount = 0
    let fallbackCount = 0
    for (const [uuid, accessory] of this.matterAccessories.entries()) {
      try {
        const context = (accessory as any)?.context
        const deviceId = context?.deviceId
        let webhook = context?.webhook as boolean | undefined
        // If cached accessory predates global webhook context, fall back to global option
        if (webhook === undefined && this.config.options?.webhook === true) {
          webhook = true
          try {
            ;(accessory as any).context.webhook = true
            this.debugLog(`Applying global webhook fallback for cached Matter device ${deviceId}`)
            fallbackCount++
          } catch (e: any) {
            this.debugLog(`Failed to persist global webhook fallback for ${deviceId}: ${e?.message ?? e}`)
          }
        }

        if (!deviceId) {
          this.debugLog(`Skipping cached accessory ${accessory.displayName} - no deviceId in context`)
          continue
        }

        // Only register webhook if the device had webhook enabled
        if (webhook) {
          this.debugLog(`Restoring webhook handler for Matter device: ${deviceId}`)

          // Create a minimal device object from cached context for webhook handling
          const dev: any = {
            deviceId,
            deviceName: context?.name || accessory.displayName,
            deviceType: context?.deviceType,
            webhook: true,
          }

          this.webhookEventHandler[deviceId] = async (webhookContext: any) => {
            try {
              this.debugLog(`Received webhook for cached Matter device ${deviceId}: ${JSON.stringify(webhookContext)}`)
              // Apply webhook status update to the accessory
              await this.applyStatusWithRegistrationRetry(uuid, dev, webhookContext)
            } catch (e: any) {
              this.errorLog(`Failed to handle webhook for cached device ${deviceId}: ${e?.message ?? e}`)
            }
          }

          restoredCount++
          this.debugSuccessLog(`Webhook handler restored for ${deviceId}`)
        } else {
          this.debugLog(`Device ${deviceId} does not have webhook enabled, skipping`)
        }
      } catch (e: any) {
        this.errorLog(`Failed to restore webhook handler for cached accessory ${accessory.displayName}: ${e?.message ?? e}`)
      }
    }

    if (fallbackCount > 0) {
      this.infoLog(`Applied global webhook fallback for ${fallbackCount} cached Matter accessories`)
    }
    this.infoLog(`Restored webhook handlers for ${restoredCount} cached Matter accessories`)
  }

  /**
   * Remove accessories that are disabled in config
   */
  private async removeDisabledAccessories() {
    const configMap = [
      { enabled: this.config.enableOnOffLight, uuid: this.api.matter.uuid.generate('matter-onoff-light'), name: 'On/Off Light' },
      { enabled: this.config.enableDimmableLight, uuid: this.api.matter.uuid.generate('matter-dimmable-light'), name: 'Dimmable Light' },
      { enabled: this.config.enableColourTemperatureLight, uuid: this.api.matter.uuid.generate('matter-colour-temp-light'), name: 'Colour Temperature Light' },
      { enabled: this.config.enableColourLight, uuid: this.api.matter.uuid.generate('matter-colour-light'), name: 'Colour Light (HS)' },
      { enabled: this.config.enableExtendedColourLight, uuid: this.api.matter.uuid.generate('matter-extended-colour-light'), name: 'Extended Colour Light' },
      { enabled: this.config.enableOnOffOutlet, uuid: this.api.matter.uuid.generate('matter-onoff-outlet'), name: 'On/Off Outlet' },
      { enabled: this.config.enableOnOffSwitch, uuid: this.api.matter.uuid.generate('matter-onoff-switch'), name: 'On/Off Switch' },
      { enabled: this.config.enableTemperatureSensor, uuid: this.api.matter.uuid.generate('matter-temperature-sensor'), name: 'Temperature Sensor' },
      { enabled: this.config.enableHumiditySensor, uuid: this.api.matter.uuid.generate('matter-humidity-sensor'), name: 'Humidity Sensor' },
      { enabled: this.config.enableLightSensor, uuid: this.api.matter.uuid.generate('matter-light-sensor'), name: 'Light Sensor' },
      { enabled: this.config.enableOccupancySensor, uuid: this.api.matter.uuid.generate('matter-occupancy-sensor'), name: 'Occupancy Sensor' },
      { enabled: this.config.enableContactSensor, uuid: this.api.matter.uuid.generate('matter-contact-sensor'), name: 'Contact Sensor' },
      { enabled: this.config.enableLeakSensor, uuid: this.api.matter.uuid.generate('matter-leak-sensor'), name: 'Leak Sensor' },
      { enabled: this.config.enableSmokeSensor, uuid: this.api.matter.uuid.generate('matter-smoke-sensor'), name: 'Smoke Sensor' },
      { enabled: this.config.enableDoorLock, uuid: this.api.matter.uuid.generate('matter-door-lock'), name: 'Door Lock' },
      { enabled: this.config.enableWindowBlind, uuid: this.api.matter.uuid.generate('matter-window-blind'), name: 'Window Blind' },
      { enabled: this.config.enableVenetianBlind, uuid: this.api.matter.uuid.generate('matter-venetian-blind'), name: 'Venetian Blind' },
      { enabled: this.config.enableThermostat, uuid: this.api.matter.uuid.generate('matter-thermostat'), name: 'Thermostat' },
      { enabled: this.config.enableFan, uuid: this.api.matter.uuid.generate('matter-fan'), name: 'Fan' },
      { enabled: this.config.enableRobotVacuum, uuid: this.api.matter.uuid.generate('matter-robot-vacuum'), name: 'Robot Vacuum' },
      { enabled: this.config.enablePowerStrip, uuid: this.api.matter.uuid.generate('matter-power-strip'), name: 'Power Strip' },
    ]

    for (const { enabled, uuid, name } of configMap) {
      if (enabled === false) {
        const existingAccessory = this.matterAccessories.get(uuid)
        if (existingAccessory) {
          this.infoLog(`Removing accessory '${name}' (disabled in config)`)
          // Attempt to clear any per-device resources (timers, BLE handlers, instances)
          try {
            const deviceId = (existingAccessory as any)?.context?.deviceId
            if (deviceId) {
              this.clearDeviceResources(deviceId)
            }
          } catch (e: any) {
            this.debugLog(`Failed to clear resources for disabled accessory ${name}: ${e?.message ?? e}`)
          }
          await this.api.matter.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory as unknown as MatterAccessory])
          this.matterAccessories.delete(uuid)
        }
      }
    }
  }

  /**
   * Section 4: Lighting Devices (Matter Spec § 4)
   */
  private async registerSection4Lighting() {
    this.debugLog('═'.repeat(80))
    this.infoLog('Section 4: Lighting Devices (Matter Spec § 4)')
    this.debugLog('═'.repeat(80))

    const accessories: Array<MatterAccessory<Record<string, unknown>>> = []

    // On/Off Light
    if (this.config.enableOnOffLight !== false) {
      const device = new OnOffLightAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    // Dimmable Light
    if (this.config.enableDimmableLight !== false) {
      const device = new DimmableLightAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    // Color Temperature Light
    if (this.config.enableColourTemperatureLight !== false) {
      const device = new ColorTemperatureLightAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    // Color Light (HS only)
    if (this.config.enableColourLight !== false) {
      const device = new ColorLightAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    // Extended Color Light (HS+CCT)
    if (this.config.enableExtendedColourLight !== false) {
      const device = new ExtendedColorLightAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    if (accessories.length > 0) {
      this.infoLog(`✓ Registered ${accessories.length} lighting device(s)`)
      for (const acc of accessories) {
        this.infoLog(`  - ${acc.displayName}`)
      }
      await this.api.matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessories)
    }
  }

  /**
   * Section 5: Smart Plugs/Actuators (Matter Spec § 5)
   */
  private async registerSection5SmartPlugs() {
    this.debugLog('═'.repeat(80))
    this.infoLog('Section 5: Smart Plugs/Actuators (Matter Spec § 5)')
    this.debugLog('═'.repeat(80))

    const accessories: Array<MatterAccessory<Record<string, unknown>>> = []

    // On/Off Outlet
    if (this.config.enableOnOffOutlet !== false) {
      const device = new OnOffOutletAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    if (accessories.length > 0) {
      this.infoLog(`✓ Registered ${accessories.length} smart plug/actuator device(s)`)
      for (const acc of accessories) {
        this.infoLog(`  - ${acc.displayName}`)
      }
      await this.api.matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessories)
    }
  }

  /**
   * Section 6: Switches & Controllers (Matter Spec § 6)
   */
  private async registerSection6Switches() {
    this.debugLog('═'.repeat(80))
    this.infoLog('Section 6: Switches & Controllers (Matter Spec § 6)')
    this.debugLog('═'.repeat(80))

    const accessories: Array<MatterAccessory<Record<string, unknown>>> = []

    // On/Off Switch
    if (this.config.enableOnOffSwitch !== false) {
      const device = new OnOffSwitchAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    if (accessories.length > 0) {
      this.infoLog(`✓ Registered ${accessories.length} switch/controller device(s)`)
      for (const acc of accessories) {
        this.infoLog(`  - ${acc.displayName}`)
      }
      await this.api.matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessories)
    }
  }

  /**
   * Section 7: Sensors (Matter Spec § 7)
   */
  private async registerSection7Sensors() {
    this.debugLog('═'.repeat(80))
    this.infoLog('Section 7: Sensors (Matter Spec § 7)')
    this.debugLog('═'.repeat(80))

    const accessories: Array<MatterAccessory<Record<string, unknown>>> = []

    // Contact Sensor
    if (this.config.enableContactSensor !== false) {
      const device = new ContactSensorAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    // Light Sensor
    if (this.config.enableLightSensor !== false) {
      const device = new LightSensorAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    // Occupancy Sensor
    if (this.config.enableOccupancySensor !== false) {
      const device = new OccupancySensorAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    // Temperature Sensor
    if (this.config.enableTemperatureSensor !== false) {
      const device = new TemperatureSensorAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    // Humidity Sensor
    if (this.config.enableHumiditySensor !== false) {
      const device = new HumiditySensorAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    // Smoke/CO Alarm
    if (this.config.enableSmokeSensor !== false) {
      const device = new SmokeCOAlarmAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    // Leak Sensor
    if (this.config.enableLeakSensor !== false) {
      const device = new LeakSensorAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    if (accessories.length > 0) {
      this.infoLog(`✓ Registered ${accessories.length} sensor device(s)`)
      for (const acc of accessories) {
        this.infoLog(`  - ${acc.displayName}`)
      }
      await this.api.matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessories)
    }
  }

  /**
   * Section 8: Closure Devices (Matter Spec § 8)
   */
  private async registerSection8Closure() {
    this.debugLog('═'.repeat(80))
    this.infoLog('Section 8: Closure Devices (Matter Spec § 8)')
    this.debugLog('═'.repeat(80))

    const accessories: Array<MatterAccessory<Record<string, unknown>>> = []

    // Door Lock
    if (this.config.enableDoorLock !== false) {
      const device = new DoorLockAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    // Window Blind
    if (this.config.enableWindowBlind !== false) {
      const device = new WindowBlindAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    // Venetian Blind
    if (this.config.enableVenetianBlind !== false) {
      const device = new VenetianBlindAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    if (accessories.length > 0) {
      this.infoLog(`✓ Registered ${accessories.length} closure device(s)`)
      for (const acc of accessories) {
        this.infoLog(`  - ${acc.displayName}`)
      }
      await this.api.matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessories)
    }
  }

  /**
   * Section 9: HVAC (Matter Spec § 9)
   */
  private async registerSection9HVAC() {
    this.debugLog('═'.repeat(80))
    this.infoLog('Section 9: HVAC (Matter Spec § 9)')
    this.debugLog('═'.repeat(80))

    const accessories: Array<MatterAccessory<Record<string, unknown>>> = []

    // Thermostat
    if (this.config.enableThermostat !== false) {
      const device = new ThermostatAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    // Fan
    if (this.config.enableFan !== false) {
      const device = new FanAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    if (accessories.length > 0) {
      this.infoLog(`✓ Registered ${accessories.length} HVAC device(s)`)
      for (const acc of accessories) {
        this.infoLog(`  - ${acc.displayName}`)
      }
      await this.api.matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessories)
    }
  }

  /**
   * Section 12: Robotic Devices (Matter Spec § 12)
   * ⚠️ IMPORTANT: RVC devices use a DIFFERENT PROCESS (same code) than other devices!
   * When this runs, you'll see separate commissioning codes in the logs for the robot vacuum.
   * Use those codes to pair the vacuum as a separate bridge in your Home app.
   */
  private async registerSection12Robotic() {
    this.debugLog('═'.repeat(80))
    this.infoLog('Section 12: Robotic Devices (Matter Spec § 12)')
    this.debugLog('═'.repeat(80))

    const accessories: Array<MatterAccessory<Record<string, unknown>>> = []

    // Robot Vacuum
    if (this.config.enableRobotVacuum !== false) {
      const device = new RoboticVacuumAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    if (accessories.length > 0) {
      this.infoLog(`✓ Registered ${accessories.length} robot vacuum device(s)`)
      for (const acc of accessories) {
        this.infoLog(`  - ${acc.displayName} (standalone for Apple Home compatibility)`)
      }
      await this.api.matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessories)
    }
  }

  /**
   * Custom Devices
   *
   * This section demonstrates custom device implementations that go beyond
   * the standard Matter device types. These examples show advanced patterns
   * like managing multiple logical components within a single device.
   */
  private async registerCustomDevices() {
    this.debugLog('═'.repeat(80))
    this.infoLog('Custom Devices')
    this.debugLog('═'.repeat(80))

    const accessories: Array<MatterAccessory<Record<string, unknown>>> = []

    // Power Strip (4 Outlets)
    if (this.config.enablePowerStrip !== false) {
      const device = new PowerStripAccessory(this.api, this.log)
      accessories.push(device.toAccessory())
    }

    if (accessories.length > 0) {
      this.infoLog(`✓ Registered ${accessories.length} custom device(s)`)
      for (const acc of accessories) {
        this.infoLog(`  - ${acc.displayName}`)
      }
      await this.api.matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessories)
    }
  }

  /**
   * Start platform-level refresh timer to batch all device status updates
   */
  private startPlatformRefreshTimer(refreshRateSec: number): void {
    // Only create timer once
    if (this.platformRefreshTimer) {
      return
    }
    // Respect user toggle
    if (this.config.options?.matterBatchEnabled === false) {
      this.infoLog('Matter batch refresh is disabled by configuration')
      return
    }
    const jitterSec = Number(this.config.options?.matterBatchJitter ?? 0)
    const intervalMs = Number(refreshRateSec) * 1000
    const jitterMs = Number.isFinite(jitterSec) && jitterSec > 0 ? Math.floor(Math.random() * jitterSec * 1000) : 0
    // Start after optional jitter, then schedule recurring interval
    setTimeout(async () => {
      try {
        await this.batchRefreshAllDevices()
      } catch (e: any) {
        this.debugLog(`Initial batch refresh failed: ${e?.message ?? e}`)
      }
      this.platformRefreshTimer = setInterval(async () => {
        await this.batchRefreshAllDevices()
      }, intervalMs)
    }, jitterMs)
  }

  /**
   * Batch refresh all devices - still makes individual API calls but batches them together
   * Note: SwitchBot API doesn't support true batch status calls, but we can parallelize them
   */
  private async batchRefreshAllDevices(): Promise<void> {
    if (!this.switchBotAPI) {
      return
    }

    this.debugLog('Performing batched periodic OpenAPI refresh for all devices')

    // Build list from registered accessory instances (uuid) and discovered devices
    const devicesToRefresh: Array<{ uuid: string, dev: device }> = []
    try {
      for (const [nid, instance] of this.accessoryInstances.entries()) {
        const uuid = (instance as any)?.uuid as string | undefined
        if (!uuid) {
          continue
        }
        const dev = this.discoveredDevices.find(d => this.normalizeDeviceId(d.deviceId) === nid)
        // Skip devices with per-device timers and those in cooldown
        const now = Date.now()
        const nextAllowed = this.backoffCooldowns.get(nid) ?? 0
        if (dev && !this.perDeviceRefreshSet.has(nid) && now >= nextAllowed) {
          devicesToRefresh.push({ uuid, dev })
        }
      }
    } catch (e: any) {
      this.errorLog(`Failed to enumerate devices for batch refresh: ${e?.message ?? e}`)
      return
    }

    if (devicesToRefresh.length === 0) {
      this.debugLog('No devices to refresh')
      return
    }

    this.debugLog(`Refreshing ${devicesToRefresh.length} devices in parallel batch`)

    // Randomize order to reduce synchronized spikes
    for (let i = devicesToRefresh.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[devicesToRefresh[i], devicesToRefresh[j]] = [devicesToRefresh[j], devicesToRefresh[i]]
    }
    const concurrency = Number(this.config.options?.matterBatchConcurrency ?? 5)
    await this.runWithConcurrency(devicesToRefresh, async ({ uuid, dev }) => {
      try {
        const status = await this.refreshSingleDeviceWithRetry(dev)
        if (status) {
          await this.applyStatusToAccessory(uuid, dev as any, status)
        }
      } catch (e: any) {
        this.errorLog(`Periodic OpenAPI refresh failed for ${dev.deviceId}: ${e?.message ?? e}`)
      }
    }, Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 5)
    this.debugLog(`Batch refresh completed for ${devicesToRefresh.length} devices`)
  }

  /** Refresh a single device with retry and backoff; returns status object if successful */
  private async refreshSingleDeviceWithRetry(dev: device, retries = 3, baseDelayMs = 500): Promise<any | null> {
    const deviceId = dev.deviceId

    // Check API budget BEFORE attempting any retries - don't waste cycles on blocked requests
    if (!this.apiTracker?.trySpend('poll')) {
      // Don't log on every blocked request - the ApiRequestTracker handles periodic warnings
      return null
    }

    let attempt = 0
    while (attempt <= retries) {
      try {
        const { response, statusCode } = await this.switchBotAPI!.getDeviceStatus(deviceId, this.config.credentials?.token, this.config.credentials?.secret)
        const respAny: any = response
        const body = respAny?.body ?? respAny
        if (isSuccessfulStatusCode(statusCode)) {
          const status = body?.status ?? body
          this.deviceStatusCache.set(this.normalizeDeviceId(deviceId), { status, timestamp: Date.now() })
          this.debugLog(`OpenAPI refresh succeeded for ${deviceId} (attempt ${attempt + 1})`)
          return status
        }
        this.debugLog(`OpenAPI refresh unexpected statusCode=${statusCode} for ${deviceId} (attempt ${attempt + 1})`)
      } catch (e: any) {
        this.debugLog(`OpenAPI refresh error for ${deviceId} (attempt ${attempt + 1}): ${e?.message ?? e}`)
      }
      // backoff before next retry if any left
      attempt++
      if (attempt <= retries) {
        const delay = baseDelayMs * (2 ** (attempt - 1))
        await sleep(delay)
      }
    }
    // Set a cooldown after exhausting retries to avoid hammering problematic devices
    try {
      const nid = this.normalizeDeviceId(deviceId)
      const cooldownMs = Math.max(60_000, baseDelayMs * (2 ** retries) * 10)
      this.backoffCooldowns.set(nid, Date.now() + cooldownMs)
      this.debugLog(`Applied cooldown for ${deviceId}: ${Math.round(cooldownMs / 1000)}s`)
    } catch {}
    return null
  }

  /**
   * Validate that the user's configuration won't exceed API limits
   * Warn if device count × polling frequency will hit daily limits
   */
  private validateApiUsageConfig(deviceCount: number, irDeviceCount: number): void {
    try {
      const totalDevices = deviceCount + irDeviceCount
      if (totalDevices === 0) {
        return
      }

      // For Matter platform, use matterBatchRefreshRate or fallback to refreshRate
      const refreshRate = this.getPlatformBatchInterval() // seconds
      const dailyLimit = this.config.options?.dailyApiLimit ?? 10000
      const reserveForCommands = this.config.options?.dailyApiReserveForCommands ?? 1000

      // Calculate polls per day (86400 seconds in a day)
      const pollsPerDevicePerDay = Math.floor(86400 / refreshRate)
      const totalPollsPerDay = pollsPerDevicePerDay * totalDevices

      // Add discovery calls (typically 1-2 per day)
      const estimatedDiscoveryCalls = 2
      const totalEstimatedCalls = totalPollsPerDay + estimatedDiscoveryCalls

      const usableLimit = dailyLimit - reserveForCommands
      const percentOfLimit = Math.round((totalEstimatedCalls / usableLimit) * 100)

      this.debugLog(`[API Usage Diagnostic] ${totalDevices} devices × ${pollsPerDevicePerDay} polls/day = ${totalPollsPerDay} estimated daily polls`)
      this.debugLog(`[API Usage Diagnostic] With ${reserveForCommands} reserved for commands, usable limit is ${usableLimit}`)

      if (totalEstimatedCalls > dailyLimit) {
        this.errorLog(`⚠️ API LIMIT WARNING: Your configuration will exceed the daily API limit!`)
        this.errorLog(`   Devices: ${totalDevices} | Refresh rate: ${refreshRate}s | Estimated daily polls: ${totalEstimatedCalls}`)
        this.errorLog(`   Daily limit: ${dailyLimit} | You will use ${percentOfLimit}% of available budget`)
        this.errorLog(`   SOLUTION: Increase matterBatchRefreshRate to ${Math.ceil((totalDevices * 86400) / usableLimit)} seconds or higher`)
        this.errorLog(`   OR: Enable webhooks and set 'webhookOnlyOnReserve: true' to reduce polling`)
      } else if (totalEstimatedCalls > usableLimit) {
        this.warnLog(`⚠️ API USAGE WARNING: Configuration may exceed usable daily API budget`)
        this.warnLog(`   Devices: ${totalDevices} | Refresh rate: ${refreshRate}s | Estimated daily polls: ${totalEstimatedCalls}`)
        this.warnLog(`   Usable limit (after reserve): ${usableLimit} | You will use ${percentOfLimit}% of budget`)
        this.warnLog(`   Polling may pause when approaching limit. Consider increasing matterBatchRefreshRate to ${Math.ceil((totalDevices * 86400) / usableLimit)}s`)
      } else if (percentOfLimit > 75) {
        this.infoLog(`[API Usage] Using ${percentOfLimit}% of daily budget (${totalEstimatedCalls}/${usableLimit} calls). Monitor usage if adding more devices.`)
      } else {
        this.debugLog(`[API Usage] Configuration looks good: ${percentOfLimit}% of daily budget (${totalEstimatedCalls}/${usableLimit} calls)`)
      }
    } catch (e: any) {
      this.debugLog(`Failed to validate API usage config: ${e?.message ?? e}`)
    }
  }

  /** Simple concurrency limiter for an array of items */
  private async runWithConcurrency<T>(items: T[], worker: (item: T) => Promise<void>, concurrency: number): Promise<void> {
    const queue = items.slice()
    const workers: Promise<void>[] = []
    const runNext = async (): Promise<void> => {
      const item = queue.shift()
      if (!item) {
        return
      }
      await worker(item)
      return runNext()
    }
    const pool = Math.min(concurrency, Math.max(1, items.length))
    for (let i = 0; i < pool; i++) {
      workers.push(runNext())
    }
    await Promise.all(workers)
  }
}
