/* Copyright(C) 2017-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * platform.ts: @switchbot/homebridge-switchbot platform class.
 */
import type { Server } from 'node:http'

import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory } from 'homebridge'
import type { MqttClient } from 'mqtt'
/*
* For Testing Locally:
* import type { blindTilt, curtain, curtain3, device, irdevice } from '/Users/Shared/GitHub/OpenWonderLabs/node-switchbot/dist/index.js';
* import { LogLevel, SwitchBotBLE, SwitchBotModel, SwitchBotOpenAPI } from '/Users/Shared/GitHub/OpenWonderLabs/node-switchbot/dist/index.js';
*/
import type { blindTilt, bodyChange, curtain, curtain3, device, deviceStatusRequest, irdevice } from 'node-switchbot'

import type { blindTiltConfig, curtainConfig, devicesConfig, irDevicesConfig, options, SwitchBotPlatformConfig } from './settings.js'

import { readFileSync } from 'node:fs'
import { argv } from 'node:process'

import asyncmqtt from 'async-mqtt'
import fakegato from 'fakegato-history'
import { EveHomeKitTypes } from 'homebridge-lib/EveHomeKitTypes'
import { LogLevel, SwitchBotBLE, SwitchBotModel, SwitchBotOpenAPI } from 'node-switchbot'
import { queueScheduler } from 'rxjs'

import { AirPurifier } from './devices-hap/airpurifier.js'
import { BlindTilt } from './devices-hap/blindtilt.js'
import { Bot } from './devices-hap/bot.js'
import { CeilingLight } from './devices-hap/ceilinglight.js'
import { ColorBulb } from './devices-hap/colorbulb.js'
import { Contact } from './devices-hap/contact.js'
import { Curtain } from './devices-hap/curtain.js'
import { Fan } from './devices-hap/fan.js'
import { Hub } from './devices-hap/hub.js'
import { Humidifier } from './devices-hap/humidifier.js'
import { IOSensor } from './devices-hap/iosensor.js'
import { StripLight } from './devices-hap/lightstrip.js'
import { Lock } from './devices-hap/lock.js'
import { Meter } from './devices-hap/meter.js'
import { MeterPlus } from './devices-hap/meterplus.js'
import { MeterPro } from './devices-hap/meterpro.js'
import { Motion } from './devices-hap/motion.js'
import { Plug } from './devices-hap/plug.js'
import { RelaySwitch } from './devices-hap/relayswitch.js'
import { RobotVacuumCleaner } from './devices-hap/robotvacuumcleaner.js'
import { WaterDetector } from './devices-hap/waterdetector.js'
import { AirConditioner } from './irdevice/airconditioner.js'
import { AirPurifierIR } from './irdevice/airpurifier.js'
import { Camera } from './irdevice/camera.js'
import { IRFan } from './irdevice/fan.js'
import { Light } from './irdevice/light.js'
import { Others } from './irdevice/other.js'
import { TV } from './irdevice/tv.js'
import { VacuumCleaner } from './irdevice/vacuumcleaner.js'
import { WaterHeater } from './irdevice/waterheater.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'
import { ApiRequestTracker, applyDeviceTypeTemplates, createPlatformLogger, formatDeviceIdAsMac, isBlindTiltDevice, isCurtainDevice, isSuccessfulStatusCode, logStatusCode, mergeByDeviceId, safeStringify, sleep } from './utils.js'

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class SwitchBotHAPPlatform implements DynamicPlatformPlugin {
  // Platform properties
  public accessories: PlatformAccessory[] = []
  public readonly api: API
  public readonly log: Logging

  // Logging helper functions (attached from utils.createPlatformLogger in constructor)
  infoLog!: (...log: any[]) => Promise<void>
  successLog!: (...log: any[]) => Promise<void>
  debugSuccessLog!: (...log: any[]) => Promise<void>
  warnLog!: (...log: any[]) => Promise<void>
  debugWarnLog!: (...log: any[]) => Promise<void>
  errorLog!: (...log: any[]) => Promise<void>
  debugErrorLog!: (...log: any[]) => Promise<void>
  debugLog!: (...log: any[]) => Promise<void>
  loggingIsDebug!: () => Promise<boolean>
  enablingPlatformLogging!: () => Promise<boolean>

  // Configuration properties
  platformConfig!: SwitchBotPlatformConfig
  platformLogging!: options['logging']
  platformRefreshRate!: options['refreshRate']
  platformPushRate!: options['pushRate']
  platformUpdateRate!: options['updateRate']
  platformMaxRetries!: options['maxRetries']
  platformDelayBetweenRetries!: options['delayBetweenRetries']
  config!: SwitchBotPlatformConfig
  debugMode!: boolean
  version!: string

  // MQTT and Webhook properties
  mqttClient: MqttClient | null = null
  webhookEventListener: Server | null = null

  // SwitchBot APIs
  switchBotAPI!: SwitchBotOpenAPI
  switchBotBLE!: SwitchBotBLE

  // API request tracking
  private apiTracker?: ApiRequestTracker

  // External APIs
  public readonly eve: any
  public readonly fakegatoAPI: any

  // Event Handlers
  public readonly webhookEventHandler: { [x: string]: (context: any) => void } = {}
  public readonly bleEventHandler: { [x: string]: (context: any) => void } = {}

  constructor(
    log: Logging,
    config: SwitchBotPlatformConfig,
    api: API,
  ) {
    this.api = api
    this.log = log

    // Attach shared platform logging helpers (moved to utils for reuse)
    const _pl = createPlatformLogger(async () => this.platformLogging, this.log)
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

    // only load if configured
    if (!config) {
      this.errorLog('No configuration found for the plugin, please check your config.')
      return
    }

    // Plugin options into our config variables.
    this.config = {
      platform: 'SwitchBotPlatform',
      name: config.name,
      credentials: config.credentials as object,
      options: config.options as object,
      devices: config.devices as { deviceId: string }[],
    }

    // Determine platform logging preference (match HAP behaviour as closely as
    // possible using config values. We default to 'standard' when unspecified.)
    this.platformLogging = (this.config.options?.logging === 'debug' || this.config.options?.logging === 'standard' || this.config.options?.logging === 'none')
      ? this.config.options.logging
      : 'standard'

    // Unconditional diagnostic using the raw Homebridge `log` so it always
    // appears regardless of the platform logging helpers' gating logic.
    try {
      this.log.debug?.(`[SwitchBot HAP] effective platformLogging=${String(this.platformLogging)}`)
    } catch (e: any) {
      // swallow any logging errors — diagnostics are best-effort
    }

    // Note: deviceConfig and irdeviceConfig have been removed from the platform.
    // All device-specific configuration should be done via options.devices and options.irdevices arrays.

    // Plugin Configuration
    this.getPlatformLogSettings()
    this.getPlatformRateSettings()
    this.getPlatformConfigSettings()
    this.getVersion()

    // Finish initializing the platform
    this.debugLog(`Finished initializing platform: ${config.name}`)

    // verify the config
    try {
      this.verifyConfig()
      this.debugLog('Config OK')
    } catch (e: any) {
      this.errorLog(`Verify Config, Error Message: ${e.message ?? e}, Submit Bugs Here: ` + 'https://tinyurl.com/SwitchBotBug')
      this.debugErrorLog(`Verify Config, Error: ${e.message ?? e}`)
      return
    }

    // SwitchBot OpenAPI
    if (this.config.credentials?.token && this.config.credentials?.secret) {
      this.switchBotAPI = new SwitchBotOpenAPI(this.config.credentials.token, this.config.credentials.secret, this.config.options?.hostname)
    } else {
      this.debugErrorLog('Missing SwitchBot API credentials (token or secret).')
    }
    // Listen for log events
    if (!this.config.options?.disableLogsforOpenAPI && this.switchBotAPI) {
      this.switchBotAPI.on('log', (log) => {
        switch (log.level) {
          case LogLevel.SUCCESS:
            this.successLog(log.message)
            break
          case LogLevel.DEBUGSUCCESS:
            this.debugSuccessLog(log.message)
            break
          case LogLevel.WARN:
            this.warnLog(log.message)
            break
          case LogLevel.DEBUGWARN:
            this.debugWarnLog(log.message)
            break
          case LogLevel.ERROR:
            this.errorLog(log.message)
            break
          case LogLevel.DEBUGERROR:
            this.debugErrorLog(log.message)
            break
          case LogLevel.DEBUG:
            this.debugLog(log.message)
            break
          case LogLevel.INFO:
          default:
            this.infoLog(log.message)
        }
      })
    } else {
      this.debugErrorLog(`SwitchBot OpenAPI logs are disabled, enable it by setting disableLogsforOpenAPI to false.`)
      this.debugLog(`SwitchBot OpenAPI: ${JSON.stringify(this.switchBotAPI)}, disableLogsforOpenAPI: ${this.config.options?.disableLogsforOpenAPI}`)
    }
    // import fakegato-history module and EVE characteristics
    this.fakegatoAPI = fakegato(api)
    this.eve = new EveHomeKitTypes(api)

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', async () => {
      this.debugLog('Executed didFinishLaunching callback')

      // Initialize API request tracking
      try {
        const dailyApiLimit = this.config.options?.dailyApiLimit ?? 10000
        const dailyApiReserveForCommands = this.config.options?.dailyApiReserveForCommands ?? 1000
        const webhookOnlyOnReserve = this.config.options?.webhookOnlyOnReserve ?? false
        this.apiTracker = new ApiRequestTracker(this.api, this.log, 'SwitchBot HAP', {
          dailyLimit: dailyApiLimit,
          reserveForCommands: dailyApiReserveForCommands,
          pausePollingAtReserve: webhookOnlyOnReserve,
          resetAtLocalMidnight: this.config.options?.dailyApiResetAtLocalMidnight ?? false,
        })
        this.apiTracker.startHourlyLogging()
      } catch (e: any) {
        this.errorLog(`Failed to initialize API request tracking: ${e.message ?? e}`)
      }

      // run the method to discover / register your devices as accessories
      try {
        // Does the user have a version of Homebridge that is compatible with matter?
        if (!this.api.isMatterAvailable?.()) {
          this.debugLog(`Matter is not available in this version of Homebridge. Please update Homebridge to use this plugin, ${this.api.isMatterAvailable?.() ? '' : ' (Matter is not available in this version of Homebridge)'}`)
        }
        if (!this.api.isMatterEnabled?.()) {
          this.debugLog(`Matter is not enabled in Homebridge. Please enable Matter in the Homebridge settings to use this plugin, ${this.api.isMatterEnabled?.() ? '' : ' (Matter is not enabled in Homebridge)'}`)
        }
        if (!this.api.isMatterAvailable?.() && !this.api.isMatterEnabled?.()) {
          await this.discoverDevices()
        } else {
          this.infoLog('Matter is enabled in Homebridge. SwitchBot Matter devices will be handled by the Matter platform.')
        }
      } catch (e: any) {
        this.errorLog(`Failed to Discover, Error Message: ${e.message ?? e}, Submit Bugs Here: ` + 'https://tinyurl.com/SwitchBotBug')
        this.debugErrorLog(`Failed to Discover, Error: ${e.message ?? e}`)
      }
    })

    try {
      this.setupMqtt()
    } catch (e: any) {
      this.errorLog(`Setup MQTT, Error Message: ${e.message ?? e}, Submit Bugs Here: ` + 'https://tinyurl.com/SwitchBotBug')
    }
    try {
      this.setupwebhook()
    } catch (e: any) {
      this.errorLog(`Setup Webhook, Error Message: ${e.message ?? e}, Submit Bugs Here: ` + 'https://tinyurl.com/SwitchBotBug')
    }
    try {
      this.setupBlE()
    } catch (e: any) {
      this.errorLog(`Setup Platform BLE, Error Message: ${e.message ?? e}, Submit Bugs Here: ` + 'https://tinyurl.com/SwitchBotBug')
    }
  }

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
          this.mqttClient.on('message', async (topic: string, message) => {
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

  async setupwebhook() {
    // webhook configuration
    if (this.config.options?.webhookURL) {
      const url = this.config.options?.webhookURL
      try {
        this.switchBotAPI.setupWebhook(url)
        // Listen for webhook events
        this.switchBotAPI.on('webhookEvent', (body) => {
          if (this.config.options?.mqttURL) {
            const mac = body.context.deviceMac?.toLowerCase().match(/[\s\S]{1,2}/g)?.join(':')
            const options = this.config.options?.mqttPubOptions || {}
            this.mqttClient?.publish(`homebridge-switchbot/webhook/${mac}`, `${JSON.stringify(body.context)}`, options)
          }
          this.webhookEventHandler[body.context.deviceMac]?.(body.context)
        })
      } catch (e: any) {
        this.errorLog(`Failed to setup webhook. Error: ${e.message ?? e}`)
      }

      this.api.on('shutdown', async () => {
        try {
          this.switchBotAPI.deleteWebhook(url)
        } catch (e: any) {
          this.errorLog(`Failed to delete webhook. Error: ${e.message ?? e}`)
        }
      })
    }
  }

  async setupBlE() {
    this.switchBotBLE = new SwitchBotBLE()
    // Listen for log events
    if (!this.config.options?.disableLogsforBLE) {
      this.switchBotBLE.on('log', (log) => {
        switch (log.level) {
          case LogLevel.SUCCESS:
            this.successLog(log.message)
            break
          case LogLevel.DEBUGSUCCESS:
            this.debugSuccessLog(log.message)
            break
          case LogLevel.WARN:
            this.warnLog(log.message)
            break
          case LogLevel.DEBUGWARN:
            this.debugWarnLog(log.message)
            break
          case LogLevel.ERROR:
            this.errorLog(log.message)
            break
          case LogLevel.DEBUGERROR:
            this.debugErrorLog(log.message)
            break
          case LogLevel.DEBUG:
            this.debugLog(log.message)
            break
          case LogLevel.INFO:
          default:
            this.infoLog(log.message)
        }
      })
    }
    if (this.config.options?.BLE) {
      this.debugLog('setupBLE')
      if (this.switchBotBLE === undefined) {
        this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${JSON.stringify(this.switchBotBLE)}`)
      } else {
        // Start to monitor advertisement packets
        (async () => {
          // Start to monitor advertisement packets
          this.debugLog('Scanning for BLE SwitchBot devices...')
          try {
            await this.switchBotBLE.startScan()
          } catch (e: any) {
            this.errorLog(`Failed to start BLE scanning. Error: ${e.message ?? e}`)
          }
          // Set an event handler to monitor advertisement packets
          this.switchBotBLE.onadvertisement = async (ad: any) => {
            try {
              this.bleEventHandler[ad.address]?.(ad.serviceData)
            } catch (e: any) {
              this.errorLog(`Failed to handle BLE event. Error: ${e.message ?? e}`)
            }
          }
        })()

        this.api.on('shutdown', async () => {
          try {
            // this.switchBotBLE.stopScan()
            this.infoLog('Stopped BLE scanning to close listening.')
          } catch (e: any) {
            this.errorLog(`Failed to stop Platform BLE scanning. Error: ${e.message ?? e}`)
          }
        })
      }
    } else {
      this.debugLog('Platform BLE is not enabled')
    }
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  async configureAccessory(accessory: PlatformAccessory) {
    const { displayName } = accessory
    this.debugLog(`Loading accessory from cache: ${displayName}`)

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory)
  }

  /**
   * Verify the config passed to the plugin is valid
   */
  async verifyConfig() {
    this.debugLog('Verifying Config')
    this.config = this.config || {}
    this.config.options = this.config.options || {}

    if (this.config.options) {
      // Device Config
      if (this.config.options.devices) {
        for (const deviceConfig of this.config.options.devices) {
          if (!deviceConfig.hide_device) {
            if (!deviceConfig.deviceId) {
              this.errorLog('The devices config section is missing the *Device ID* in the config. Please check your config.')
            }
            if (!deviceConfig.configDeviceType && (deviceConfig as devicesConfig).connectionType) {
              this.errorLog('The devices config section is missing the *Device Type* in the config. Please check your config.')
            }
          }
        }
      }

      // IR Device Config
      if (this.config.options.irdevices) {
        for (const irDeviceConfig of this.config.options.irdevices) {
          if (!irDeviceConfig.hide_device) {
            if (!irDeviceConfig.deviceId) {
              this.errorLog('The devices config section is missing the *Device ID* in the config. Please check your config.')
            }
            if (!irDeviceConfig.deviceId && !irDeviceConfig.configRemoteType) {
              this.errorLog('The devices config section is missing the *Device Type* in the config. Please check your config.')
            }
          }
        }
      }
    }

    if (!this.config.credentials && !this.config.options) {
      this.debugWarnLog('Missing Credentials')
    } else if (this.config.credentials && !this.config.credentials.notice) {
      if (!this.config.credentials?.token) {
        this.debugErrorLog('Missing token')
        this.debugWarnLog('Cloud Enabled SwitchBot Devices & IR Devices will not work')
      }
      if (this.config.credentials?.token) {
        if (!this.config.credentials?.secret) {
          this.debugErrorLog('Missing secret')
          this.debugWarnLog('Cloud Enabled SwitchBot Devices & IR Devices will not work')
        }
      }
    }
  }

  async discoverDevices() {
    if (!this.config.credentials?.token) {
      return this.handleManualConfig()
    }

    let retryCount = 0
    const maxRetries = this.platformMaxRetries ?? 5
    const delayBetweenRetries = this.platformDelayBetweenRetries || 5000
    let rateLimitExceeded = false

    this.debugWarnLog(`Retry Count: ${retryCount}`)
    this.debugWarnLog(`Max Retries: ${this.platformMaxRetries}`)
    this.debugWarnLog(`Delay Between Retries: ${this.platformDelayBetweenRetries}`)

    while (retryCount < maxRetries) {
      try {
        if (!this.apiTracker?.trySpend('discovery')) {
          rateLimitExceeded = true
          this.warnLog('OpenAPI daily budget reached (discovery blocked). Falling back to manual device configuration.')
          break
        }
        const { response, statusCode } = await this.switchBotAPI.getDevices()
        this.debugLog(`response: ${JSON.stringify(response)}`)
        if (this.isSuccessfulResponse(statusCode)) {
          const deviceList = Array.isArray(response.body.deviceList) ? response.body.deviceList : []
          const irDeviceList = Array.isArray(response.body.infraredRemoteList) ? response.body.infraredRemoteList : []
          await this.handleDevices(deviceList)
          await this.handleIRDevices(irDeviceList)
          // Diagnostic: warn users if their device count + refresh rate may exceed daily limits
          this.validateApiUsageConfig(deviceList.length, irDeviceList.length)
          break
        } else {
          // Check if rate limit exceeded (429)
          if (statusCode === 429) {
            rateLimitExceeded = true
            this.warnLog('OpenAPI rate limit (429) exceeded. Falling back to manual device configuration.')
            this.warnLog('Webhook functionality will still work if devices are configured manually.')
            break
          }
          await this.handleErrorResponse(statusCode, retryCount, maxRetries, delayBetweenRetries)
          retryCount++
        }
      } catch (e: any) {
        retryCount++
        this.debugErrorLog(`Failed to Discover Devices, Error Message: ${JSON.stringify(e.message)}, Submit Bugs Here: https://tinyurl.com/SwitchBotBug`)
        this.debugErrorLog(`Failed to Discover Devices, Error: ${e.message ?? e}`)
      }
    }

    // If rate limit exceeded or retries exhausted, try to load from manual config or cached accessories
    if (rateLimitExceeded || retryCount >= maxRetries) {
      const hasCachedAccessories = this.accessories.length > 0
      const hasManualConfig = this.config.options?.devices || this.config.options?.irdevices

      if (hasManualConfig || hasCachedAccessories) {
        if (hasCachedAccessories) {
          this.warnLog(`Found ${this.accessories.length} cached accessories from previous sessions.`)
          this.warnLog('Reinstantiating device classes to enable webhook handlers...')
          await this.restoreCachedAccessories()
        }
        if (hasManualConfig) {
          this.warnLog('Attempting to load devices from manual configuration...')
          await this.handleManualConfig()
        }
        if (hasCachedAccessories) {
          this.infoLog('Cached accessories restored. Webhook functionality is active.')
          this.infoLog('Device discovery will resume when API rate limit resets.')
        }
      } else {
        this.errorLog('OpenAPI unavailable and no cached accessories or manual device configuration found.')
        this.errorLog('Please configure devices manually in the plugin settings to use webhook functionality.')
      }
    }
  }

  /**
   * Restore cached accessories by reinstantiating their device classes
   * This ensures webhook handlers and other functionality are properly set up
   */
  private async restoreCachedAccessories() {
    this.debugLog('Restoring cached accessories and setting up webhook handlers...')

    for (const accessory of this.accessories) {
      try {
        const device = accessory.context.device
        const deviceType = accessory.context.deviceType || device?.deviceType
        const deviceId = accessory.context.deviceId || device?.deviceId

        if (!device || !deviceType || !deviceId) {
          this.debugWarnLog(`Skipping cached accessory ${accessory.displayName} - missing context data`)
          continue
        }

        this.debugLog(`Reinstantiating ${deviceType} for cached accessory: ${accessory.displayName}`)

        // Reinstantiate the device class based on deviceType
        const deviceTypeHandlers: { [key: string]: new (platform: any, accessory: PlatformAccessory, device: any) => any } = {
          'Humidifier': Humidifier,
          'Humidifier2': Humidifier,
          'Hub 2': Hub,
          'Hub 3': Hub,
          'Bot': Bot,
          'Relay Switch 1': RelaySwitch,
          'Relay Switch 1PM': RelaySwitch,
          'Meter': Meter,
          'MeterPlus': MeterPlus,
          'Meter Plus (JP)': MeterPlus,
          'MeterPro': MeterPro,
          'MeterPro(CO2)': MeterPro,
          'WoIOSensor': IOSensor,
          'Water Detector': WaterDetector,
          'Motion Sensor': Motion,
          'Contact Sensor': Contact,
          'Curtain': Curtain,
          'Curtain3': Curtain,
          'WoRollerShade': Curtain,
          'Roller Shade': Curtain,
          'Blind Tilt': BlindTilt,
          'Plug': Plug,
          'Plug Mini (US)': Plug,
          'Plug Mini (JP)': Plug,
          'Smart Lock': Lock,
          'Smart Lock Pro': Lock,
          'Smart Lock Ultra': Lock,
          'Color Bulb': ColorBulb,
          'K10+': RobotVacuumCleaner,
          'K10+ Pro': RobotVacuumCleaner,
          'WoSweeper': RobotVacuumCleaner,
          'WoSweeperMini': RobotVacuumCleaner,
          'Robot Vacuum Cleaner S1': RobotVacuumCleaner,
          'Robot Vacuum Cleaner S1 Plus': RobotVacuumCleaner,
          'Robot Vacuum Cleaner S10': RobotVacuumCleaner,
          'Ceiling Light': CeilingLight,
          'Ceiling Light Pro': CeilingLight,
          'Strip Light': StripLight,
          'Battery Circulator Fan': Fan,
          'Air Purifier PM2.5': AirPurifier,
          'Air Purifier Table PM2.5': AirPurifier,
          'Air Purifier VOC': AirPurifier,
          'Air Purifier Table VOC': AirPurifier,
        }

        const DeviceClass = deviceTypeHandlers[deviceType]
        if (DeviceClass) {
          new DeviceClass(this, accessory, device)
          this.debugSuccessLog(`Successfully restored ${deviceType}: ${accessory.displayName}`)
        } else {
          this.debugLog(`No handler for device type: ${deviceType}`)
        }
      } catch (e: any) {
        this.errorLog(`Failed to restore cached accessory ${accessory.displayName}, Error: ${e.message ?? e}`)
      }
    }

    this.infoLog(`Restored ${this.accessories.length} cached accessories with webhook support`)
  }

  private async handleManualConfig() {
    // Handle regular devices
    if (this.config.options?.devices) {
      this.debugLog(`SwitchBot Device Manual Config Set: ${JSON.stringify(this.config.options?.devices)}`)
      const devices = this.config.options.devices.map((v: any) => v)
      for (const device of devices) {
        device.deviceType = device.configDeviceType !== undefined ? device.configDeviceType : 'Unknown'
        device.deviceName = device.configDeviceName !== undefined ? device.configDeviceName : 'Unknown'
        try {
          device.deviceId = formatDeviceIdAsMac(device.deviceId, true)
          this.debugLog(`deviceId: ${device.deviceId}`)
          if (device.deviceType) {
            await this.createDevice(device)
          }
        } catch (error) {
          this.errorLog(`failed to format device ID as MAC, Error: ${error}`)
        }
      }
    }

    // Handle IR devices
    if (this.config.options?.irdevices) {
      this.debugLog(`SwitchBot IR Device Manual Config Set: ${JSON.stringify(this.config.options?.irdevices)}`)
      const irdevices = this.config.options.irdevices.map((v: any) => v)
      for (const irdevice of irdevices) {
        irdevice.remoteType = irdevice.configRemoteType !== undefined ? irdevice.configRemoteType : 'Unknown'
        irdevice.deviceName = irdevice.configDeviceName !== undefined ? irdevice.configDeviceName : 'Unknown'
        try {
          this.debugLog(`IR deviceId: ${irdevice.deviceId}`)
          if (irdevice.remoteType) {
            await this.createIRDevice(irdevice)
          }
        } catch (error) {
          this.errorLog(`failed to create IR device, Error: ${error}`)
        }
      }
    }

    if (!this.config.options?.devices && !this.config.options?.irdevices) {
      this.errorLog('Neither SwitchBot Token or Device Config are set.')
    }
  }

  /**
   * Check if an API status code indicates success
   * @deprecated Use shared isSuccessfulStatusCode from utils.js instead
   */
  private isSuccessfulResponse(apiStatusCode: number): boolean {
    return isSuccessfulStatusCode(apiStatusCode)
  }

  private async handleDevices(deviceLists: any[]) {
    if (!this.config.options?.devices) {
      this.debugLog(`SwitchBot Device Config Not Set: ${JSON.stringify(this.config.options?.devices)}`)
      if (deviceLists.length === 0) {
        this.debugLog('SwitchBot API Has No Devices With Cloud Services Enabled')
      } else {
        for (const device of deviceLists) {
          if (device.deviceType) {
            if (device.configDeviceName) {
              device.deviceName = device.configDeviceName
            }
            await this.createDevice(device)
          }
        }
      }
    } else {
      this.debugLog(`SwitchBot Device Config Set: ${JSON.stringify(this.config.options?.devices)}`)

      // Check and assign configDeviceType to deviceType if deviceType is not present
      const devicesWithTypeAssigned = deviceLists.map((device) => {
        if (!device.deviceType) {
          device.deviceType = device.configDeviceType !== undefined ? device.configDeviceType : 'Unknown'
          this.warnLog(`API is displaying no deviceType: ${device.deviceType}, So using configDeviceType: ${device.configDeviceType}`)
        }
        return device
      })

      // Apply device-type templates from config entries with applyToAllDevicesOfType=true
      const devicesWithTemplates = applyDeviceTypeTemplates(
        devicesWithTypeAssigned,
        this.config.options.devices,
        'deviceType',
        msg => this.debugLog(msg),
      )

      const allowConfigOnly = Boolean(this.config.options?.allowConfigOnlyDevices)
      const devices = mergeByDeviceId(this.config.options.devices ?? [], devicesWithTemplates ?? [], allowConfigOnly)

      // Apply global webhook option to devices that don't have their own webhook setting
      if (this.config.options?.webhook === true) {
        for (const device of devices) {
          if (device.webhook === undefined) {
            device.webhook = true
            this.debugLog(`Applying global webhook option to device: ${device.deviceName ?? device.deviceId}`)
          }
        }
      }

      this.debugLog(`SwitchBot Devices: ${JSON.stringify(devices)}`)

      for (const device of devices) {
        if (device.configDeviceName) {
          device.deviceName = device.configDeviceName
        }
        // Log effective webhook setting for diagnostics
        try {
          const effectiveWebhook = device.webhook !== undefined ? device.webhook : (this.config.options?.webhook === true ? true : undefined)
          this.debugLog(`Effective webhook for device ${device.deviceName ?? device.deviceId}: ${String(effectiveWebhook)}`)
        } catch (e: any) {
          this.debugLog(`Failed logging effective webhook for ${device.deviceName ?? device.deviceId}: ${e?.message ?? e}`)
        }
        await this.createDevice(device)
      }
    }
  }

  private async handleIRDevices(irDeviceLists: any[]) {
    if (!this.config.options?.irdevices) {
      this.debugLog(`IR Device Config Not Set: ${JSON.stringify(this.config.options?.irdevices)}`)
      for (const device of irDeviceLists) {
        if (device.remoteType) {
          await this.createIRDevice(device)
        }
      }
    } else {
      this.debugLog(`IR Device Config Set: ${JSON.stringify(this.config.options?.irdevices)}`)

      // Check and assign configRemoteType to remoteType if remoteType is not present
      const devicesWithTypeAssigned = irDeviceLists.map((device) => {
        if (!device.remoteType && device.configRemoteType) {
          device.remoteType = device.configRemoteType
          this.warnLog(`API is displaying no remoteType: ${device.remoteType}, So using configRemoteType: ${device.configRemoteType}`)
        } else if (!device.remoteType && !device.configDeviceName) {
          this.errorLog('No remoteType or configRemoteType for device. No device will be created.')
          return null
        }
        return device
      }).filter(device => device !== null) // Filter out skipped devices

      // Apply remote-type templates from config entries with applyToAllDevicesOfType=true
      const devicesWithTemplates = applyDeviceTypeTemplates(
        devicesWithTypeAssigned,
        this.config.options.irdevices,
        'remoteType',
        msg => this.debugLog(msg),
      )

      const allowConfigOnly = Boolean(this.config.options?.allowConfigOnlyDevices)
      const devices = mergeByDeviceId(this.config.options.irdevices ?? [], devicesWithTemplates ?? [], allowConfigOnly)

      // Apply global webhook option to IR devices that don't have their own webhook setting
      if (this.config.options?.webhook === true) {
        for (const device of devices) {
          if (device.webhook === undefined) {
            device.webhook = true
            this.debugLog(`Applying global webhook option to IR device: ${device.deviceName ?? device.deviceId}`)
          }
        }
      }

      this.debugLog(`IR Devices: ${JSON.stringify(devices)}`)
      for (const device of devices) {
        if (device.configDeviceName) {
          device.deviceName = device.configDeviceName
        }
        // Log effective webhook setting for diagnostics (IR devices)
        try {
          const effectiveWebhook = device.webhook !== undefined ? device.webhook : (this.config.options?.webhook === true ? true : undefined)
          this.debugLog(`Effective webhook for IR device ${device.deviceName ?? device.deviceId}: ${String(effectiveWebhook)}`)
        } catch (e: any) {
          this.debugLog(`Failed logging effective webhook for IR ${device.deviceName ?? device.deviceId}: ${e?.message ?? e}`)
        }
        await this.createIRDevice(device)
      }
    }
  }

  private async handleErrorResponse(apiStatusCode: number, retryCount: number, maxRetries: number, delayBetweenRetries: number) {
    await this.statusCode(apiStatusCode)
    if (apiStatusCode === 500) {
      this.infoLog(`statusCode: ${apiStatusCode} Attempt ${retryCount + 1} of ${maxRetries}`)
      await sleep(delayBetweenRetries)
    }
  }

  private async createDevice(device: device & devicesConfig) {
    const deviceTypeHandlers: { [key: string]: (device: device & devicesConfig) => Promise<void> } = {
      'Humidifier': this.createHumidifier.bind(this),
      'Humidifier2': this.createHumidifier.bind(this),
      'Hub 2': this.createHub2.bind(this),
      'Hub 3': this.createHub2.bind(this),
      'Bot': this.createBot.bind(this),
      'Relay Switch 1': this.createRelaySwitch.bind(this),
      'Relay Switch 1PM': this.createRelaySwitch.bind(this),
      'Meter': this.createMeter.bind(this),
      'MeterPlus': this.createMeterPlus.bind(this),
      'Meter Plus (JP)': this.createMeterPlus.bind(this),
      'MeterPro': this.createMeterPro.bind(this),
      'MeterPro(CO2)': this.createMeterPro.bind(this),
      'WoIOSensor': this.createIOSensor.bind(this),
      'Water Detector': this.createWaterDetector.bind(this),
      'Motion Sensor': this.createMotion.bind(this),
      'Contact Sensor': this.createContact.bind(this),
      'Curtain': this.createCurtain.bind(this),
      'Curtain3': this.createCurtain.bind(this),
      'WoRollerShade': this.createCurtain.bind(this),
      'Roller Shade': this.createCurtain.bind(this),
      'Blind Tilt': this.createBlindTilt.bind(this),
      'Plug': this.createPlug.bind(this),
      'Plug Mini (US)': this.createPlug.bind(this),
      'Plug Mini (JP)': this.createPlug.bind(this),
      'Smart Lock': this.createLock.bind(this),
      'Smart Lock Pro': this.createLock.bind(this),
      'Smart Lock Ultra': this.createLock.bind(this),
      'Color Bulb': this.createColorBulb.bind(this),
      'K10+': this.createRobotVacuumCleaner.bind(this),
      'K10+ Pro': this.createRobotVacuumCleaner.bind(this),
      'WoSweeper': this.createRobotVacuumCleaner.bind(this),
      'WoSweeperMini': this.createRobotVacuumCleaner.bind(this),
      'Robot Vacuum Cleaner S1': this.createRobotVacuumCleaner.bind(this),
      'Robot Vacuum Cleaner S1 Plus': this.createRobotVacuumCleaner.bind(this),
      'Robot Vacuum Cleaner S10': this.createRobotVacuumCleaner.bind(this),
      'Ceiling Light': this.createCeilingLight.bind(this),
      'Ceiling Light Pro': this.createCeilingLight.bind(this),
      'Strip Light': this.createStripLight.bind(this),
      'Battery Circulator Fan': this.createFan.bind(this),
      'Air Purifier PM2.5': this.createAirPurifier.bind(this),
      'Air Purifier Table PM2.5': this.createAirPurifier.bind(this),
      'Air Purifier VOC': this.createAirPurifier.bind(this),
      'Air Purifier Table VOC': this.createAirPurifier.bind(this),
    }

    if (deviceTypeHandlers[device.deviceType!]) {
      this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`)
      await deviceTypeHandlers[device.deviceType!](device)
    } else if (['Hub Mini', 'Hub Plus', 'Remote', 'Indoor Cam', 'remote with screen'].includes(device.deviceType!)) {
      this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}, is currently not supported, device: ${JSON.stringify(device)}`)
    } else {
      this.warnLog(`Device: ${device.deviceName} with Device Type: ${device.deviceType}, is currently not supported. Submit Feature Requests Here: https://tinyurl.com/SwitchBotFeatureRequest, device: ${JSON.stringify(device)}`)
    }
  }

  private async createIRDevice(device: irdevice & irDevicesConfig) {
    device.connectionType = device.connectionType ?? 'OpenAPI'
    const deviceTypeHandlers: { [key: string]: (device: irdevice & irDevicesConfig) => Promise<void> } = {
      'TV': this.createTV.bind(this),
      'DIY TV': this.createTV.bind(this),
      'Projector': this.createTV.bind(this),
      'DIY Projector': this.createTV.bind(this),
      'Set Top Box': this.createTV.bind(this),
      'DIY Set Top Box': this.createTV.bind(this),
      'IPTV': this.createTV.bind(this),
      'DIY IPTV': this.createTV.bind(this),
      'DVD': this.createTV.bind(this),
      'DIY DVD': this.createTV.bind(this),
      'Speaker': this.createTV.bind(this),
      'DIY Speaker': this.createTV.bind(this),
      'Fan': this.createIRFan.bind(this),
      'DIY Fan': this.createIRFan.bind(this),
      'Air Conditioner': this.createAirConditioner.bind(this),
      'DIY Air Conditioner': this.createAirConditioner.bind(this),
      'Light': this.createLight.bind(this),
      'DIY Light': this.createLight.bind(this),
      'Air Purifier': this.createAirPurifierIR.bind(this),
      'DIY Air Purifier': this.createAirPurifierIR.bind(this),
      'Water Heater': this.createWaterHeater.bind(this),
      'DIY Water Heater': this.createWaterHeater.bind(this),
      'Vacuum Cleaner': this.createVacuumCleaner.bind(this),
      'DIY Vacuum Cleaner': this.createVacuumCleaner.bind(this),
      'Camera': this.createCamera.bind(this),
      'DIY Camera': this.createCamera.bind(this),
      'Others': this.createOthers.bind(this),
    }

    if (deviceTypeHandlers[device.remoteType!]) {
      this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`)
      if (device.remoteType.startsWith('DIY') && device.external === undefined) {
        device.external = true
      }
      await deviceTypeHandlers[device.remoteType!](device)
    } else {
      this.warnLog(`Device: ${device.deviceName} with Device Type: ${device.remoteType}, is currently not supported. Submit Feature Requests Here: https://tinyurl.com/SwitchBotFeatureRequest, device: ${JSON.stringify(device)}`)
    }
  }

  private async createHumidifier(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.context.model = device.deviceType === 'Humidifier2' ? SwitchBotModel.Humidifier2 : SwitchBotModel.Humidifier
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Humidifier(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.context.model = device.deviceType === 'Humidifier2' ? SwitchBotModel.Humidifier2 : SwitchBotModel.Humidifier
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Humidifier(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createBot(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.context.model = SwitchBotModel.Bot
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Bot(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.context.model = SwitchBotModel.Bot
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // accessory.context.version = findaccessories.accessoryAttribute.softwareRevision;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Bot(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createRelaySwitch(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.context.model = device.deviceType === 'Relay Switch 1' ? SwitchBotModel.RelaySwitch1 : SwitchBotModel.RelaySwitch1PM
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new RelaySwitch(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.context.model = device.deviceType === 'Relay Switch 1' ? SwitchBotModel.RelaySwitch1 : SwitchBotModel.RelaySwitch1PM
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // accessory.context.version = findaccessories.accessoryAttribute.softwareRevision;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new RelaySwitch(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createMeter(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.model = SwitchBotModel.Meter
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Meter(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.model = SwitchBotModel.Meter
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Meter(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createMeterPlus(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // console.log("existingAccessory", existingAccessory);
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.model = SwitchBotModel.MeterPlusUS ?? SwitchBotModel.MeterPlusJP
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new MeterPlus(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.model = SwitchBotModel.MeterPlusUS ?? SwitchBotModel.MeterPlusJP
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new MeterPlus(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createMeterPro(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // console.log("existingAccessory", existingAccessory);
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.model = SwitchBotModel.MeterPro ?? SwitchBotModel.MeterProCO2
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new MeterPro(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.model = SwitchBotModel.MeterPro ?? SwitchBotModel.MeterProCO2
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new MeterPro(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createHub2(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // console.log("existingAccessory", existingAccessory);
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.model = SwitchBotModel.Hub2
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Hub(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.model = SwitchBotModel.Hub2
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Hub(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createIOSensor(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.model = SwitchBotModel.OutdoorMeter
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new IOSensor(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.model = SwitchBotModel.OutdoorMeter
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new IOSensor(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createWaterDetector(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.context.model = SwitchBotModel.WaterDetector
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new WaterDetector(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.context.model = SwitchBotModel.WaterDetector
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      accessory.context.connectionType = await this.connectionType(device)
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new WaterDetector(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createMotion(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.context.model = SwitchBotModel.MotionSensor
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Motion(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.context.model = SwitchBotModel.MotionSensor
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Motion(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createContact(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.context.model = SwitchBotModel.ContactSensor
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Contact(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.context.model = SwitchBotModel.ContactSensor
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Contact(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createBlindTilt(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.context.model = SwitchBotModel.BlindTilt
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new BlindTilt(this, existingAccessory, device as blindTiltConfig)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      if (isBlindTiltDevice(device)) {
        if (device.group && !(device as blindTiltConfig | curtainConfig).disable_group) {
          this.debugLog(
            'Your Curtains are grouped, '
            + `, Secondary curtain automatically hidden. Main Curtain: ${device.deviceName}, deviceId: ${device.deviceId}`,
          )
        } else {
          if (device.master) {
            this.warnLog(`Main Curtain: ${device.deviceName}, deviceId: ${device.deviceId}`)
          } else {
            this.errorLog(`Secondary Curtain: ${device.deviceName}, deviceId: ${device.deviceId}`)
          }
        }
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.context.model = SwitchBotModel.BlindTilt
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new BlindTilt(this, accessory, device as blindTiltConfig)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createCurtain(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.context.model = device.deviceType === 'Curtain3' ? SwitchBotModel.Curtain3 : SwitchBotModel.Curtain
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Curtain(this, existingAccessory, device as curtainConfig)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      if (isCurtainDevice(device)) {
        if (device.group && !(device as blindTiltConfig | curtainConfig).disable_group) {
          this.debugLog(
            'Your Curtains are grouped, '
            + `, Secondary curtain automatically hidden. Main Curtain: ${device.deviceName}, deviceId: ${device.deviceId}`,
          )
        } else {
          if (device.master) {
            this.warnLog(`Main Curtain: ${device.deviceName}, deviceId: ${device.deviceId}`)
          } else {
            this.errorLog(`Secondary Curtain: ${device.deviceName}, deviceId: ${device.deviceId}`)
          }
        }
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.context.model = device.deviceType === 'Curtain3' ? SwitchBotModel.Curtain3 : SwitchBotModel.Curtain
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Curtain(this, accessory, device as curtainConfig)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createPlug(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.context.model = device.deviceType === 'Plug Mini (US)'
          ? SwitchBotModel.PlugMiniUS
          : device.deviceType === 'Plug Mini (JP)'
            ? SwitchBotModel.PlugMiniJP
            : SwitchBotModel.Plug
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Plug(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.context.model = device.deviceType === 'Plug Mini (US)'
        ? SwitchBotModel.PlugMiniUS
        : device.deviceType === 'Plug Mini (JP)'
          ? SwitchBotModel.PlugMiniJP
          : SwitchBotModel.Plug
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Plug(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createLock(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.context.model = (device.deviceType === 'Smart Lock Pro' || device.deviceType === 'Smart Lock Ultra') ? SwitchBotModel.LockPro : SwitchBotModel.Lock
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Lock(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.context.model = (device.deviceType === 'Smart Lock Pro' || device.deviceType === 'Smart Lock Ultra') ? SwitchBotModel.LockPro : SwitchBotModel.Lock
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Lock(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createColorBulb(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.context.model = SwitchBotModel.ColorBulb
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new ColorBulb(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.context.model = SwitchBotModel.ColorBulb
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new ColorBulb(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createCeilingLight(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.context.model = device.deviceType === 'Ceiling Light Pro' ? SwitchBotModel.CeilingLightPro : SwitchBotModel.CeilingLight
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new CeilingLight(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.context.model = device.deviceType === 'Ceiling Light Pro' ? SwitchBotModel.CeilingLightPro : SwitchBotModel.CeilingLight
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new CeilingLight(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createStripLight(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.context.model = SwitchBotModel.StripLight
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new StripLight(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.context.model = SwitchBotModel.StripLight
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new StripLight(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createFan(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.context.model = SwitchBotModel.BatteryCirculatorFan
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Fan(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.context.model = SwitchBotModel.BatteryCirculatorFan
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Fan(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createAirPurifier(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.context.model = SwitchBotModel.BatteryCirculatorFan
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new AirPurifier(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.context.model = SwitchBotModel.BatteryCirculatorFan
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new AirPurifier(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createRobotVacuumCleaner(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = device.deviceType
        existingAccessory.context.model = device.deviceType === 'Robot Vacuum Cleaner S1'
          ? SwitchBotModel.RobotVacuumCleanerS1
          : device.deviceType === 'Robot Vacuum Cleaner S1 Plus'
            ? SwitchBotModel.RobotVacuumCleanerS1Plus
            : device.deviceType === 'Robot Vacuum Cleaner S10'
              ? SwitchBotModel.RobotVacuumCleanerS10
              : device.deviceType === 'WoSweeper'
                ? SwitchBotModel.WoSweeper
                : device.deviceType === 'WoSweeperMini'
                  ? SwitchBotModel.WoSweeperMini
                  : SwitchBotModel.Unknown
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        existingAccessory.context.connectionType = await this.connectionType(device)
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new RobotVacuumCleaner(this, existingAccessory, device)
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = device.deviceType
      accessory.context.model = device.deviceType === 'Robot Vacuum Cleaner S1'
        ? SwitchBotModel.RobotVacuumCleanerS1
        : device.deviceType === 'Robot Vacuum Cleaner S1 Plus'
          ? SwitchBotModel.RobotVacuumCleanerS1Plus
          : device.deviceType === 'Robot Vacuum Cleaner S10'
            ? SwitchBotModel.RobotVacuumCleanerS10
            : device.deviceType === 'WoSweeper'
              ? SwitchBotModel.WoSweeper
              : device.deviceType === 'WoSweeperMini'
                ? SwitchBotModel.WoSweeperMini
                : SwitchBotModel.Unknown
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new RobotVacuumCleaner(this, accessory, device)
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`)
    }
  }

  private async createTV(device: irdevice & irDevicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (!device.hide_device && existingAccessory) {
      // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
      existingAccessory.context.device = device
      existingAccessory.context.deviceId = device.deviceId
      existingAccessory.context.deviceType = `IR: ${device.remoteType}`
      existingAccessory.context.model = device.remoteType
      existingAccessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
      existingAccessory.context.connectionType = device.connectionType
      this.api.updatePlatformAccessories([existingAccessory])
      // create the accessory handler for the restored accessory
      // this is imported from `platformAccessory.ts`
      new TV(this, existingAccessory, device)
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`)
    } else if (!device.hide_device && device.hubDeviceId) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = `IR: ${device.remoteType}`
      accessory.context.model = device.remoteType
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new TV(this, accessory, device)
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`)

      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} deviceId: ${device.deviceId}`)
    }
  }

  private async createIRFan(device: irdevice & irDevicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`
        existingAccessory.context.model = device.remoteType
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        existingAccessory.context.connectionType = device.connectionType
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new IRFan(this, existingAccessory, device)
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = `IR: ${device.remoteType}`
      accessory.context.model = device.remoteType
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new IRFan(this, accessory, device)
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} deviceId: ${device.deviceId}`)
    }
  }

  private async createLight(device: irdevice & irDevicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`
        existingAccessory.context.model = device.remoteType
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        existingAccessory.context.connectionType = device.connectionType
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Light(this, existingAccessory, device)
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = `IR: ${device.remoteType}`
      accessory.context.model = device.remoteType
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Light(this, accessory, device)
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} deviceId: ${device.deviceId}`)
    }
  }

  private async createAirConditioner(device: irdevice & irDevicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`
        existingAccessory.context.model = device.remoteType
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        existingAccessory.context.connectionType = device.connectionType
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new AirConditioner(this, existingAccessory, device)
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = `IR: ${device.remoteType}`
      accessory.context.model = device.remoteType
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new AirConditioner(this, accessory, device)
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} deviceId: ${device.deviceId}`)
    }
  }

  private async createAirPurifierIR(device: irdevice & irDevicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`
        existingAccessory.context.model = device.remoteType
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        existingAccessory.context.connectionType = device.connectionType
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new AirPurifierIR(this, existingAccessory, device)
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = `IR: ${device.remoteType}`
      accessory.context.model = device.remoteType
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new AirPurifierIR(this, accessory, device)
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} deviceId: ${device.deviceId}`)
    }
  }

  private async createWaterHeater(device: irdevice & irDevicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`
        existingAccessory.context.model = device.remoteType
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        existingAccessory.context.connectionType = device.connectionType
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new WaterHeater(this, existingAccessory, device)
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = `IR: ${device.remoteType}`
      accessory.context.model = device.remoteType
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new WaterHeater(this, accessory, device)
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} deviceId: ${device.deviceId}`)
    }
  }

  private async createVacuumCleaner(device: irdevice & irDevicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`
        existingAccessory.context.model = device.remoteType
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        existingAccessory.context.connectionType = device.connectionType
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new VacuumCleaner(this, existingAccessory, device)
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = `IR: ${device.remoteType}`
      accessory.context.model = device.remoteType
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new VacuumCleaner(this, accessory, device)
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} deviceId: ${device.deviceId}`)
    }
  }

  private async createCamera(device: irdevice & irDevicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`
        existingAccessory.context.model = device.remoteType
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        existingAccessory.context.connectionType = device.connectionType
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Camera(this, existingAccessory, device)
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = `IR: ${device.remoteType}`
      accessory.context.model = device.remoteType
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Camera(this, accessory, device)
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} deviceId: ${device.deviceId}`)
    }
  }

  private async createOthers(device: irdevice & irDevicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`)

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device
        existingAccessory.context.deviceId = device.deviceId
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`
        existingAccessory.context.model = device.remoteType
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`)
        existingAccessory.context.connectionType = device.connectionType
        this.api.updatePlatformAccessories([existingAccessory])
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Others(this, existingAccessory, device)
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`)
      } else {
        this.unregisterPlatformAccessories(existingAccessory)
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid)

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device
      accessory.context.deviceId = device.deviceId
      accessory.context.deviceType = `IR: ${device.remoteType}`
      accessory.context.model = device.remoteType
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName)
      accessory.context.connectionType = await this.connectionType(device)
      accessory.context.version = device.firmware ?? this.version ?? '0.0.0'
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external'
      this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`)
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Others(this, accessory, device)
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`)

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory)
      this.accessories.push(accessory)
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} deviceId: ${device.deviceId}`)
    }
  }

  async registerCurtains(device: device & devicesConfig): Promise<boolean> {
    let registerWindowCovering: boolean
    if (isCurtainDevice(device)) {
      this.debugWarnLog(`deviceName: ${device.deviceName} deviceId: ${device.deviceId}, curtainDevicesIds: ${device.curtainDevicesIds},x master: ${device.master}, group: ${device.group}, disable_group: ${(device as blindTiltConfig | curtainConfig).disable_group}, connectionType: ${device.connectionType}`)
      registerWindowCovering = await this.registerWindowCovering(device)
    } else if (isBlindTiltDevice(device)) {
      this.debugWarnLog(`deviceName: ${device.deviceName} deviceId: ${device.deviceId}, blindTiltDevicesIds: ${device.blindTiltDevicesIds}, master: ${device.master}, group: ${device.group}, disable_group: ${(device as blindTiltConfig | curtainConfig).disable_group}, connectionType: ${device.connectionType}`)
      registerWindowCovering = await this.registerWindowCovering(device)
    } else {
      registerWindowCovering = false
    }
    return registerWindowCovering
  }

  async registerWindowCovering(device: (curtain | curtain3 | blindTilt) & devicesConfig) {
    this.debugLog(`master: ${device.master}`)
    let registerCurtain: boolean
    if (device.master && device.group) {
      // OpenAPI: Master Curtains/Blind Tilt in Group
      registerCurtain = true
      this.debugLog(`deviceName: ${device.deviceName} [${device.deviceType} Config] device.master: ${device.master}, device.group: ${device.group} connectionType; ${device.connectionType}`)
      this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`)
    } else if (!device.master && (device as blindTiltConfig | curtainConfig).disable_group) {
      registerCurtain = true
      this.debugLog(`deviceName: ${device.deviceName} [${device.deviceType} Config] device.master: ${device.master}, disable_group: ${(device as blindTiltConfig | curtainConfig).disable_group}, connectionType; ${device.connectionType}`)
      this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`)
    } else if (device.master && !device.group) {
      // OpenAPI: Master Curtains/Blind Tilts not in Group
      registerCurtain = true
      this.debugLog(`deviceName: ${device.deviceName} [${device.deviceType} Config] device.master: ${device.master}, device.group: ${device.group} connectionType; ${device.connectionType}`)
      this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`)
    } else if (device.connectionType === 'BLE') {
      // BLE: Curtains/Blind Tilt
      registerCurtain = true
      this.debugLog(`deviceName: ${device.deviceName} [${device.deviceType} Config] connectionType: ${device.connectionType}, group: ${device.group}`)
      this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`)
    } else {
      registerCurtain = false
      this.debugErrorLog(`deviceName: ${device.deviceName} [${device.deviceType} Config] disable_group: ${(device as blindTiltConfig | curtainConfig).disable_group}, device.master: ${device.master}, device.group: ${device.group}`)
      this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}, device.connectionType: ${device.connectionType}`)
    }
    return registerCurtain
  }

  async connectionType(device: (device & devicesConfig) | (irdevice & irDevicesConfig)): Promise<any> {
    let connectionType: string
    if (!device.connectionType && this.config.credentials?.token && this.config.credentials.secret) {
      connectionType = 'OpenAPI'
    } else {
      connectionType = device.connectionType!
    }
    return connectionType
  }

  async registerDevice(device: device & devicesConfig) {
    device.connectionType = await this.connectionType(device)
    let registerDevice: boolean

    const shouldRegister = !device.hide_device && (device.connectionType === 'BLE/OpenAPI' || (device.deviceId && device.configDeviceType && device.configDeviceName && device.connectionType === 'BLE') || device.connectionType === 'OpenAPI' || device.connectionType === 'Disabled')

    if (shouldRegister) {
      registerDevice = await this.handleDeviceRegistration(device)
    } else {
      registerDevice = false
      this.debugErrorLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, hide_device: ${device.hide_device}, will not display in HomeKit`)
    }

    return registerDevice
  }

  async handleDeviceRegistration(device: device & devicesConfig): Promise<boolean> {
    let registerDevice: boolean

    switch (device.deviceType) {
      case 'Curtain':
      case 'Curtain3':
      case 'Blind Tilt':
        registerDevice = await this.registerCurtains(device)
        this.debugWarnLog(`Device: ${device.deviceName} ${device.deviceType} registerDevice: ${registerDevice}`)
        break
      default:
        registerDevice = true
        this.debugWarnLog(`Device: ${device.deviceName} registerDevice: ${registerDevice}`)
    }

    if (registerDevice) {
      this.debugWarnLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will display in HomeKit`)
    } else {
      this.debugErrorLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will not display in HomeKit`)
    }

    return registerDevice
  }

  public async externalOrPlatform(device: (device & devicesConfig) | (irdevice & irDevicesConfig), accessory: PlatformAccessory) {
    const { displayName } = accessory
    const isExternal = device.external ?? false

    if (isExternal) {
      this.debugWarnLog(`${displayName} External Accessory Mode`)
      this.api.publishExternalAccessories(PLUGIN_NAME, [accessory])
    } else {
      this.debugLog(`${displayName} External Accessory Mode: ${isExternal}`)
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
    }
  }

  public unregisterPlatformAccessories(existingAccessory: PlatformAccessory) {
    const { displayName } = existingAccessory
    // remove platform accessories when no longer present
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory])
    this.warnLog(`Removing existing accessory from cache: ${displayName}`)
  }

  /**
   * Handles the status codes returned by the device and logs appropriate messages.
   *
   * @param statusCode - The status code returned by the device.
   * @returns A promise that resolves when the logging is complete.
   * @deprecated Use shared logStatusCode from utils.js instead
   */
  async statusCode(statusCode: number): Promise<void> {
    await logStatusCode(statusCode, {
      debugLog: this.debugLog.bind(this),
      errorLog: this.errorLog.bind(this),
    })
  }

  async retryRequest(device: (device & devicesConfig) | (irdevice & irDevicesConfig), deviceMaxRetries: number, deviceDelayBetweenRetries: number): Promise<{ response: any, statusCode: deviceStatusRequest['statusCode'] }> {
    // Check API budget BEFORE attempting any retries - don't waste cycles on blocked requests
    if (!this.apiTracker?.trySpend('poll')) {
      // Don't log on every blocked request - the ApiRequestTracker handles periodic warnings
      return {
        response: {
          deviceId: '',
          deviceType: '',
          hubDeviceId: '',
          version: 0,
          deviceName: '',
        },
        statusCode: 429,
      }
    }

    let retryCount = 0
    const maxRetries = deviceMaxRetries
    const delayBetweenRetries = deviceDelayBetweenRetries
    while (retryCount < maxRetries) {
      try {
        const { response, statusCode } = await this.switchBotAPI.getDeviceStatus(device.deviceId, this.config.credentials?.token, this.config.credentials?.secret)
        this.debugLog(`response: ${JSON.stringify(response)}`)
        return { response, statusCode }
      } catch (error: any) {
        this.errorLog(`Error making request: ${error.message}`)
      }
      retryCount++
      this.debugLog(`Retry attempt ${retryCount} of ${maxRetries}`)
      await sleep(delayBetweenRetries)
    }
    return { response: {
      deviceId: '',
      deviceType: '',
      hubDeviceId: '',
      version: 0,
      deviceName: '',
    }, statusCode: 500 }
  }

  async retryCommand(device: (device & devicesConfig) | (irdevice & irDevicesConfig), bodyChange: bodyChange, deviceMaxRetries?: number, deviceDelayBetweenRetries?: number): Promise<{ response: any, statusCode: number }> {
    let retryCount = 0
    const maxRetries = deviceMaxRetries ?? 1
    const delayBetweenRetries = deviceDelayBetweenRetries ?? 1000
    while (retryCount < maxRetries) {
      try {
        if (!this.apiTracker?.trySpend('command')) {
          return { response: {}, statusCode: 429 }
        }
        const { response, statusCode } = await this.switchBotAPI.controlDevice(
          device.deviceId,
          bodyChange.command,
          bodyChange.parameter,
          bodyChange.commandType as import('node-switchbot').commandType,
          this.config.credentials?.token,
          this.config.credentials?.secret,
        )
        this.debugLog(`response: ${JSON.stringify(response)}`)
        return { response, statusCode }
      } catch (error: any) {
        this.errorLog(`Error making request: ${error.message}`)
      }
      retryCount++
      this.debugLog(`Retry attempt ${retryCount} of ${maxRetries}`)
      await sleep(delayBetweenRetries)
    }
    return { response: {}, statusCode: 500 }
  }

  // BLE Connection
  async connectBLE(accessory: PlatformAccessory, device: device & devicesConfig): Promise<any> {
    try {
      queueScheduler.schedule(async () => this.switchBotBLE)
      this.debugLog(`${device.deviceType}: ${accessory.displayName} 'node-switchbot' found: ${safeStringify(this.switchBotBLE)}`)
      return this.switchBotBLE
    } catch (e: any) {
      this.errorLog(`${device.deviceType}: ${accessory.displayName} 'node-switchbot' not found, Error: ${e.message ?? e}`)
      return false
    }
  }

  async getPlatformConfigSettings() {
    if (this.config.options) {
      const platformConfig: SwitchBotPlatformConfig = {
        platform: 'Resideo',
      }
      platformConfig.logging = this.config.options.logging ? this.config.options.logging : undefined
      platformConfig.refreshRate = this.config.options.refreshRate ? this.config.options.refreshRate : undefined
      platformConfig.updateRate = this.config.options.updateRate ? this.config.options.updateRate : undefined
      platformConfig.pushRate = this.config.options.pushRate ? this.config.options.pushRate : undefined
      platformConfig.maxRetries = this.config.options.maxRetries ? this.config.options.maxRetries : undefined
      platformConfig.delayBetweenRetries = this.config.options.delayBetweenRetries ? this.config.options.delayBetweenRetries : undefined
      if (Object.entries(platformConfig).length !== 0) {
        await this.debugLog(`Platform Config: ${JSON.stringify(platformConfig)}`)
      }
      this.platformConfig = platformConfig
    }
  }

  async getPlatformRateSettings() {
    // RefreshRate
    this.platformRefreshRate = this.config.options?.refreshRate ? this.config.options.refreshRate : undefined
    const refreshRate = this.config.options?.refreshRate ? 'Using Platform Config refreshRate' : 'Platform Config refreshRate Not Set'
    await this.debugLog(`${refreshRate}: ${this.platformRefreshRate}`)
    // UpdateRate
    this.platformUpdateRate = this.config.options?.updateRate ? this.config.options.updateRate : undefined
    const updateRate = this.config.options?.updateRate ? 'Using Platform Config updateRate' : 'Platform Config updateRate Not Set'
    await this.debugLog(`${updateRate}: ${this.platformUpdateRate}`)
    // PushRate
    this.platformPushRate = this.config.options?.pushRate ? this.config.options.pushRate : undefined
    const pushRate = this.config.options?.pushRate ? 'Using Platform Config pushRate' : 'Platform Config pushRate Not Set'
    await this.debugLog(`${pushRate}: ${this.platformPushRate}`)
    // MaxRetries
    this.platformMaxRetries = this.config.options?.maxRetries ? this.config.options.maxRetries : undefined
    const maxRetries = this.config.options?.maxRetries ? 'Using Platform Config maxRetries' : 'Platform Config maxRetries Not Set'
    await this.debugLog(`${maxRetries}: ${this.platformMaxRetries}`)
    // DelayBetweenRetries
    this.platformDelayBetweenRetries = this.config.options?.delayBetweenRetries ? this.config.options.delayBetweenRetries : undefined
    const delayBetweenRetries = this.config.options?.delayBetweenRetries ? 'Using Platform Config delayBetweenRetries' : 'Platform Config delayBetweenRetries Not Set'
    await this.debugLog(`${delayBetweenRetries}: ${this.platformDelayBetweenRetries}`)
  }

  async getPlatformLogSettings() {
    this.debugMode = argv.includes('-D') ?? argv.includes('--debug')
    this.platformLogging = (this.config.options?.logging === 'debug' || this.config.options?.logging === 'standard'
      || this.config.options?.logging === 'none')
      ? this.config.options.logging
      : this.debugMode ? 'debugMode' : 'standard'
    const logging = this.config.options?.logging ? 'Platform Config' : this.debugMode ? 'debugMode' : 'Default'
    await this.debugLog(`Using ${logging} Logging: ${this.platformLogging}`)
  }

  /**
   * Asynchronously retrieves the version of the plugin from the package.json file.
   *
   * This method reads the package.json file located in the parent directory,
   * parses its content to extract the version, and logs the version using the debug logger.
   * The extracted version is then assigned to the `version` property of the class.
   *
   * @returns {Promise<void>} A promise that resolves when the version has been retrieved and logged.
   */
  async getVersion(): Promise<void> {
    const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'))
    this.debugLog(`Plugin Version: ${version}`)
    this.version = version
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

      const refreshRate = this.platformRefreshRate ?? 300 // seconds
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
        this.errorLog(`   SOLUTION: Increase refreshRate to ${Math.ceil((totalDevices * 86400) / usableLimit)} seconds or higher`)
        this.errorLog(`   OR: Enable webhooks and set 'webhookOnlyOnReserve: true' to reduce polling`)
      } else if (totalEstimatedCalls > usableLimit) {
        this.warnLog(`⚠️ API USAGE WARNING: Configuration may exceed usable daily API budget`)
        this.warnLog(`   Devices: ${totalDevices} | Refresh rate: ${refreshRate}s | Estimated daily polls: ${totalEstimatedCalls}`)
        this.warnLog(`   Usable limit (after reserve): ${usableLimit} | You will use ${percentOfLimit}% of budget`)
        this.warnLog(`   Polling may pause when approaching limit. Consider increasing refreshRate to ${Math.ceil((totalDevices * 86400) / usableLimit)}s`)
      } else if (percentOfLimit > 75) {
        this.infoLog(`[API Usage] Using ${percentOfLimit}% of daily budget (${totalEstimatedCalls}/${usableLimit} calls). Monitor usage if adding more devices.`)
      } else {
        this.debugLog(`[API Usage] Configuration looks good: ${percentOfLimit}% of daily budget (${totalEstimatedCalls}/${usableLimit} calls)`)
      }
    } catch (e: any) {
      this.debugErrorLog(`Failed to validate API usage config: ${e.message ?? e}`)
    }
  }

  /**
   * Validate and clean a string value for a Name Characteristic.
   * @param displayName - The display name of the accessory.
   * @param name - The name of the characteristic.
   * @param value - The value to be validated and cleaned.
   * @returns The cleaned string value.
   */
  async validateAndCleanDisplayName(displayName: string, name: string, value: string): Promise<string> {
    if (this.config.options?.allowInvalidCharacters) {
      return value
    } else {
      const validPattern = /^[\p{L}\p{N}][\p{L}\p{N} ']*[\p{L}\p{N}]$/u
      const invalidCharsPattern = /[^\p{L}\p{N} ']/gu
      const invalidStartEndPattern = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu

      if (typeof value === 'string' && !validPattern.test(value)) {
        this.warnLog(`WARNING: The accessory '${displayName}' has an invalid '${name}' characteristic ('${value}'). Please use only alphanumeric, space, and apostrophe characters. Ensure it starts and ends with an alphabetic or numeric character, and avoid emojis. This may prevent the accessory from being added in the Home App or cause unresponsiveness.`)

        // Remove invalid characters
        if (invalidCharsPattern.test(value)) {
          const before = value
          this.warnLog(`Removing invalid characters from '${name}' characteristic, if you feel this is incorrect, please enable \'allowInvalidCharacter\' in the config to allow all characters`)
          value = value.replace(invalidCharsPattern, '')
          this.warnLog(`${name} Before: '${before}' After: '${value}'`)
        }

        // Ensure it starts and ends with an alphanumeric character
        if (invalidStartEndPattern.test(value)) {
          const before = value
          this.warnLog(`Removing invalid starting or ending characters from '${name}' characteristic, if you feel this is incorrect, please enable \'allowInvalidCharacter\' in the config to allow all characters`)
          value = value.replace(invalidStartEndPattern, '')
          this.warnLog(`${name} Before: '${before}' After: '${value}'`)
        }
      }

      return value
    }
  }
}
