/* Copyright(C) 2017-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * platform.ts: @switchbot/homebridge-switchbot platform class.
 */
import type { Server } from 'node:http'

import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory } from 'homebridge'
import type { MqttClient } from 'mqtt'

import type { blindTiltConfig, curtainConfig, devicesConfig, irDevicesConfig, options, SwitchBotPlatformConfig } from './settings.js'

import { readFileSync } from 'node:fs'
import process from 'node:process'

import asyncmqtt from 'async-mqtt'
import fakegato from 'fakegato-history'
import { EveHomeKitTypes } from 'homebridge-lib/EveHomeKitTypes'
/*
* For Testing Locally:
* import type { blindTilt, curtain, curtain3, device, irdevice } from '/Users/Shared/GitHub/OpenWonderLabs/node-switchbot/dist/index.js';
* import { LogLevel, SwitchBotBLE, SwitchBotModel, SwitchBotOpenAPI } from '/Users/Shared/GitHub/OpenWonderLabs/node-switchbot/dist/index.js';
*/
import type { blindTilt, curtain, curtain3, device, deviceStatus, deviceStatusRequest, irdevice } from 'node-switchbot'

import { LogLevel, SwitchBotBLE, SwitchBotModel, SwitchBotOpenAPI } from 'node-switchbot'
import { queueScheduler } from 'rxjs'

import { BlindTilt } from './device/blindtilt.js'
import { Bot } from './device/bot.js'
import { CeilingLight } from './device/ceilinglight.js'
import { ColorBulb } from './device/colorbulb.js'
import { Contact } from './device/contact.js'
import { Curtain } from './device/curtain.js'
import { Fan } from './device/fan.js'
import { Hub } from './device/hub.js'
import { Humidifier } from './device/humidifier.js'
import { IOSensor } from './device/iosensor.js'
import { StripLight } from './device/lightstrip.js'
import { Lock } from './device/lock.js'
import { Meter } from './device/meter.js'
import { MeterPlus } from './device/meterplus.js'
import { MeterPro } from './device/meterpro.js'
import { Motion } from './device/motion.js'
import { Plug } from './device/plug.js'
import { RobotVacuumCleaner } from './device/robotvacuumcleaner.js'
import { WaterDetector } from './device/waterdetector.js'
import { AirConditioner } from './irdevice/airconditioner.js'
import { AirPurifier } from './irdevice/airpurifier.js'
import { Camera } from './irdevice/camera.js'
import { IRFan } from './irdevice/fan.js'
import { Light } from './irdevice/light.js'
import { Others } from './irdevice/other.js'
import { TV } from './irdevice/tv.js'
import { VacuumCleaner } from './irdevice/vacuumcleaner.js'
import { WaterHeater } from './irdevice/waterheater.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'
import { formatDeviceIdAsMac, isBlindTiltDevice, isCurtainDevice, sleep } from './utils.js'

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class SwitchBotPlatform implements DynamicPlatformPlugin {
  // Platform properties
  public accessories: PlatformAccessory[] = []
  public readonly api: API
  public readonly log: Logging

  // Configuration properties
  version!: string
  Logging?: string
  debugMode!: boolean
  maxRetries!: number
  delayBetweenRetries!: number
  platformConfig!: SwitchBotPlatformConfig['options']
  platformLogging!: SwitchBotPlatformConfig['logging']
  config!: SwitchBotPlatformConfig

  // MQTT and Webhook properties
  mqttClient: MqttClient | null = null
  webhookEventListener: Server | null = null

  // SwitchBot APIs
  switchBotAPI!: SwitchBotOpenAPI
  switchBotBLE!: SwitchBotBLE

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

    // only load if configured
    if (!config) {
      this.log.error('No configuration found for the plugin, please check your config.')
      return
    }

    // Plugin options into our config variables.
    this.config = {
      platform: 'SwitchBotPlatform',
      name: config.name,
      credentials: config.credentials as object,
      options: config.options as object,
      devices: config.devices as { deviceId: string }[],
      deviceConfig: config.deviceConfig as { [deviceType: string]: devicesConfig },
    }

    // Plugin Configuration
    this.getPlatformLogSettings()
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
      this.switchBotAPI = new SwitchBotOpenAPI(this.config.credentials.token, this.config.credentials.secret)
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
      // run the method to discover / register your devices as accessories
      try {
        await this.discoverDevices()
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
              this.errorLog(`Failed to handle webhook event. Error:${e.message ?? e}`)
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
        this.errorLog(`Failed to setup webhook. Error:${e.message ?? e}`)
      }

      this.api.on('shutdown', async () => {
        try {
          this.switchBotAPI.deleteWebhook(url)
        } catch (e: any) {
          this.errorLog(`Failed to delete webhook. Error:${e.message ?? e}`)
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
            this.errorLog(`Failed to start BLE scanning. Error:${e.message ?? e}`)
          }
          // Set an event handler to monitor advertisement packets
          this.switchBotBLE.onadvertisement = async (ad: any) => {
            try {
              this.bleEventHandler[ad.address]?.(ad.serviceData)
            } catch (e: any) {
              this.errorLog(`Failed to handle BLE event. Error:${e.message ?? e}`)
            }
          }
        })()

        this.api.on('shutdown', async () => {
          try {
            // this.switchBotBLE.stopScan()
            this.infoLog('Stopped BLE scanning to close listening.')
          } catch (e: any) {
            this.errorLog(`Failed to stop Platform BLE scanning. Error:${e.message ?? e}`)
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

    const platformConfig: options = {}
    if (this.config.options.logging) {
      platformConfig.logging = this.config.options.logging
    }
    if (this.config.options.logging && this.config.options.refreshRate) {
      platformConfig.refreshRate = this.config.options.refreshRate
    }
    if (this.config.options.logging && this.config.options.pushRate) {
      platformConfig.pushRate = this.config.options.pushRate
    }
    if (Object.entries(platformConfig).length !== 0) {
      this.debugWarnLog(`Platform Config: ${JSON.stringify(platformConfig)}`)
    }

    if (this.config.options) {
      // Device Config
      if (this.config.options.devices) {
        for (const deviceConfig of this.config.options.devices) {
          if (!deviceConfig.hide_device) {
            if (!deviceConfig.deviceId) {
              throw new Error('The devices config section is missing the *Device ID* in the config. Please check your config.')
            }
            if (!deviceConfig.configDeviceType && (deviceConfig as devicesConfig).connectionType) {
              throw new Error('The devices config section is missing the *Device Type* in the config. Please check your config.')
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

    if (this.config.options!.refreshRate! < 5) {
      throw new Error('Refresh Rate must be above 5 (5 seconds).')
    }

    if (!this.config.options.refreshRate) {
      // default 120 seconds (2 minutes)
      this.config.options!.refreshRate! = 120
      this.debugWarnLog('Using Default Refresh Rate (2 minutes).')
    }

    if (!this.config.options.pushRate) {
      // default 100 milliseconds
      this.config.options!.pushRate! = 0.1
      this.debugWarnLog('Using Default Push Rate.')
    }

    if (!this.config.options.maxRetries) {
      this.config.options.maxRetries = 5
      this.debugWarnLog('Using Default Max Retries.')
    } else {
      this.maxRetries = this.config.options.maxRetries
    }

    if (!this.config.options.delayBetweenRetries) {
      // default 3 seconds
      this.config.options!.delayBetweenRetries! = 3000
      this.debugWarnLog('Using Default Delay Between Retries.')
    } else {
      this.delayBetweenRetries = this.config.options.delayBetweenRetries * 1000
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
    const maxRetries = this.maxRetries
    const delayBetweenRetries = this.delayBetweenRetries

    this.debugWarnLog(`Retry Count: ${retryCount}`)
    this.debugWarnLog(`Max Retries: ${maxRetries}`)
    this.debugWarnLog(`Delay Between Retries: ${delayBetweenRetries}`)

    while (retryCount < maxRetries) {
      try {
        const { response, statusCode } = await this.switchBotAPI.getDevices()
        this.debugLog(`response: ${JSON.stringify(response)}`)
        if (this.isSuccessfulResponse(statusCode)) {
          await this.handleDevices(Array.isArray(response.body.deviceList) ? response.body.deviceList : [])
          await this.handleIRDevices(Array.isArray(response.body.infraredRemoteList) ? response.body.infraredRemoteList : [])
          break
        } else {
          await this.handleErrorResponse(statusCode, retryCount, maxRetries, delayBetweenRetries)
          retryCount++
        }
      } catch (e: any) {
        retryCount++
        this.debugErrorLog(`Failed to Discover Devices, Error Message: ${JSON.stringify(e.message)}, Submit Bugs Here: https://tinyurl.com/SwitchBotBug`)
        this.debugErrorLog(`Failed to Discover Devices, Error: ${e.message ?? e}`)
      }
    }
  }

  private async handleManualConfig() {
    if (this.config.options?.devices) {
      this.debugLog(`SwitchBot Device Manual Config Set: ${JSON.stringify(this.config.options?.devices)}`)
      const devices = this.config.options.devices.map((v: any) => v)
      for (const device of devices) {
        device.deviceType = device.configDeviceType
        device.deviceName = device.configDeviceName
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
    } else {
      this.errorLog('Neither SwitchBot Token or Device Config are set.')
    }
  }

  private isSuccessfulResponse(apiStatusCode: number): boolean {
    return (apiStatusCode === 200 || apiStatusCode === 100)
  }

  private async handleDevices(deviceLists: any[]) {
    if (!this.config.options?.devices && !this.config.options?.deviceConfig) {
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
    } else if (this.config.options?.devices || this.config.options?.deviceConfig) {
      this.debugLog(`SwitchBot Device Config Set: ${JSON.stringify(this.config.options?.devices)}`)

      // Step 1: Check and assign configDeviceType to deviceType if deviceType is not present
      const devicesWithTypeConfigPromises = deviceLists.map(async (device) => {
        if (!device.deviceType && device.configDeviceType) {
          device.deviceType = device.configDeviceType
          this.warnLog(`API is displaying no deviceType: ${device.deviceType}, So using configDeviceType: ${device.configDeviceType}`)
        } else if (!device.deviceType && !device.configDeviceName) {
          this.errorLog('No deviceType or configDeviceType for device. No device will be created.')
          return null // Skip this device
        }

        // Retrieve deviceTypeConfig for each device and merge it
        const deviceTypeConfig = this.config.options?.deviceConfig?.[device.deviceType] || {}
        return Object.assign({}, device, deviceTypeConfig)
      })

      // Wait for all promises to resolve
      const devicesWithTypeConfig = (await Promise.all(devicesWithTypeConfigPromises)).filter(device => device !== null) // Filter out skipped devices

      const devices = this.mergeByDeviceId(this.config.options.devices ?? [], devicesWithTypeConfig ?? [])

      this.debugLog(`SwitchBot Devices: ${JSON.stringify(devices)}`)

      for (const device of devices) {
        const deviceIdConfig = this.config.options?.devices?.[device.deviceId] || {}
        const deviceWithConfig = Object.assign({}, device, deviceIdConfig)

        if (device.configDeviceName) {
          device.deviceName = device.configDeviceName
        }
        // Pass the merged device object to createDevice
        await this.createDevice(deviceWithConfig)
      }
    }
  }

  private async handleIRDevices(irDeviceLists: any[]) {
    if (!this.config.options?.irdevices && !this.config.options?.irdeviceConfig) {
      this.debugLog(`IR Device Config Not Set: ${JSON.stringify(this.config.options?.irdevices)}`)
      for (const device of irDeviceLists) {
        if (device.remoteType) {
          await this.createIRDevice(device)
        }
      }
    } else if (this.config.options?.irdevices || this.config.options?.irdeviceConfig) {
      this.debugLog(`IR Device Config Set: ${JSON.stringify(this.config.options?.irdevices)}`)

      // Step 1: Check and assign configRemoteType to remoteType if remoteType is not present
      const devicesWithTypeConfigPromises = irDeviceLists.map(async (device) => {
        if (!device.remoteType && device.configRemoteType) {
          device.remoteType = device.configRemoteType
          this.warnLog(`API is displaying no remoteType: ${device.remoteType}, So using configRemoteType: ${device.configRemoteType}`)
        } else if (!device.remoteType && !device.configDeviceName) {
          this.errorLog('No remoteType or configRemoteType for device. No device will be created.')
          return null // Skip this device
        }

        // Retrieve remoteTypeConfig for each device and merge it
        const remoteTypeConfig = this.config.options?.irdeviceConfig?.[device.remoteType] || {}
        return Object.assign({}, device, remoteTypeConfig)
      })
      // Wait for all promises to resolve
      const devicesWithRemoteTypeConfig = (await Promise.all(devicesWithTypeConfigPromises)).filter(device => device !== null) // Filter out skipped devices

      const devices = this.mergeByDeviceId(this.config.options.irdevices ?? [], devicesWithRemoteTypeConfig ?? [])

      this.debugLog(`IR Devices: ${JSON.stringify(devices)}`)
      for (const device of devices) {
        const irdeviceIdConfig = this.config.options?.irdevices?.[device.deviceId] || {}
        const irdeviceWithConfig = Object.assign({}, device, irdeviceIdConfig)

        if (device.configDeviceName) {
          device.deviceName = device.configDeviceName
        }
        await this.createIRDevice(irdeviceWithConfig)
      }
    }
  }

  private mergeByDeviceId(a1: { deviceId: string }[], a2: any[]) {
    const normalizeDeviceId = (deviceId: string) => deviceId.toUpperCase().replace(/[^A-Z0-9]+/g, '')
    return a1.map((itm) => {
      const matchingItem = a2.find(item => normalizeDeviceId(item.deviceId) === normalizeDeviceId(itm.deviceId))
      return { ...matchingItem, ...itm }
    })
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
      'Hub 2': this.createHub2.bind(this),
      'Bot': this.createBot.bind(this),
      'Meter': this.createMeter.bind(this),
      'MeterPlus': this.createMeterPlus.bind(this),
      'Meter Plus (JP)': this.createMeterPlus.bind(this),
      'Meter Pro': this.createMeterPro.bind(this),
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
      'Air Purifier': this.createAirPurifier.bind(this),
      'DIY Air Purifier': this.createAirPurifier.bind(this),
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
        existingAccessory.context.model = SwitchBotModel.Humidifier
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
      accessory.context.model = SwitchBotModel.Humidifier
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
        existingAccessory.context.model = device.deviceType === 'Smart Lock Pro' ? SwitchBotModel.LockPro : SwitchBotModel.Lock
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
      accessory.context.model = device.deviceType === 'Smart Lock Pro' ? SwitchBotModel.LockPro : SwitchBotModel.Lock
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

  private async createAirPurifier(device: irdevice & irDevicesConfig) {
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
        new AirPurifier(this, existingAccessory, device)
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
      new AirPurifier(this, accessory, device)
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
   */
  async statusCode(statusCode: number): Promise<void> {
    const messages: { [key: number]: string } = {
      151: `Command not supported by this device type, statusCode: ${statusCode}, Submit Feature Request Here: 
            https://tinyurl.com/SwitchBotFeatureRequest`,
      152: `Device not found, statusCode: ${statusCode}`,
      160: `Command is not supported, statusCode: ${statusCode}, Submit Bugs Here: https://tinyurl.com/SwitchBotBug`,
      161: `Device is offline, statusCode: ${statusCode}`,
      171: `is offline, statusCode: ${statusCode}`,
      190: `Requests reached the daily limit, statusCode: ${statusCode}`,
      100: `Command successfully sent, statusCode: ${statusCode}`,
      200: `Request successful, statusCode: ${statusCode}`,
      400: `Bad Request, The client has issued an invalid request. This is commonly used to specify validation errors in a request payload, 
            statusCode: ${statusCode}`,
      401: `Unauthorized, Authorization for the API is required, but the request has not been authenticated, statusCode: ${statusCode}`,
      403: `Forbidden, The request has been authenticated but does not have appropriate permissions, or a requested resource is not found, 
            statusCode: ${statusCode}`,
      404: `Not Found, Specifies the requested path does not exist, statusCode: ${statusCode}`,
      406: `Not Acceptable, The client has requested a MIME type via the Accept header for a value not supported by the server, 
            statusCode: ${statusCode}`,
      415: `Unsupported Media Type, The client has defined a contentType header that is not supported by the server, statusCode: ${statusCode}`,
      422: `Unprocessable Entity, The client has made a valid request, but the server cannot process it. This is often used for APIs for which 
            certain limits have been exceeded, statusCode: ${statusCode}`,
      429: `Too Many Requests, The client has exceeded the number of requests allowed for a given time window, statusCode: ${statusCode}`,
      500: `Internal Server Error, An unexpected error on the SmartThings servers has occurred. These errors should be rare, 
            statusCode: ${statusCode}`,
    }

    const message = messages[statusCode] ?? `Unknown statusCode, statusCode: ${statusCode}, Submit Bugs Here: https://tinyurl.com/SwitchBotBug`

    if ([100, 200].includes(statusCode)) {
      this.debugLog(message)
    } else {
      this.errorLog(message)
    }
  }

  async retryRequest(deviceId: string, deviceMaxRetries: number, deviceDelayBetweenRetries: number): Promise<{ response: deviceStatus, statusCode: deviceStatusRequest['statusCode'] }> {
    let retryCount = 0
    const maxRetries = deviceMaxRetries
    const delayBetweenRetries = deviceDelayBetweenRetries
    while (retryCount < maxRetries) {
      try {
        const { response, statusCode } = await this.switchBotAPI.getDeviceStatus(deviceId)
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
      enableCloudService: false,
    }, statusCode: 500 }
  }

  // BLE Connection
  async connectBLE(accessory: PlatformAccessory, device: device & devicesConfig): Promise<any> {
    try {
      queueScheduler.schedule(async () => this.switchBotBLE)
      this.debugLog(`${device.deviceType}: ${accessory.displayName} 'node-switchbot' found: ${this.switchBotBLE}`)
      return this.switchBotBLE
    } catch (e: any) {
      this.errorLog(`${device.deviceType}: ${accessory.displayName} 'node-switchbot' not found, Error: ${e.message ?? e}`)
      return false
    }
  }

  async getVersion(): Promise<string> {
    const json = JSON.parse(
      readFileSync(
        new URL('../package.json', import.meta.url),
        'utf-8',
      ),
    )
    this.debugLog(`Plugin Version: ${json.version}`)
    this.version = json.version
    return json.version
  }

  async getPlatformConfigSettings() {
    const { options } = this.config
    const platformConfig: SwitchBotPlatformConfig['options'] = {}

    if (options) {
      platformConfig.logging = options.logging
      platformConfig.refreshRate = options.refreshRate
      platformConfig.updateRate = options.updateRate
      platformConfig.pushRate = options.pushRate

      this.maxRetries = options.maxRetries || 3
      platformConfig.maxRetries = this.maxRetries
      if (!options.maxRetries) {
        this.debugWarnLog('Using Default Max Retries')
      }

      this.delayBetweenRetries = (options.delayBetweenRetries || 3) * 1000
      platformConfig.delayBetweenRetries = this.delayBetweenRetries / 1000
      if (!options.delayBetweenRetries) {
        this.debugWarnLog('Using Default Delay Between Retries')
      }

      if (Object.keys(platformConfig).length) {
        this.debugLog(`Platform Config: ${JSON.stringify(platformConfig)}`)
      }

      this.platformConfig = platformConfig
    }
  }

  async getPlatformLogSettings() {
    this.debugMode = process.argv.includes('-D') ?? process.argv.includes('--debug')
    if (this.config.options?.logging === 'debug' || this.config.options?.logging === 'standard' || this.config.options?.logging === 'none') {
      this.platformLogging = this.config.options.logging
      this.debugWarnLog(`Using Config Logging: ${this.platformLogging}`)
    } else if (this.debugMode) {
      this.platformLogging = 'debugMode'
      this.debugWarnLog(`Using ${this.platformLogging} Logging`)
    } else {
      this.platformLogging = 'standard'
      this.debugWarnLog(`Using ${this.platformLogging} Logging`)
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

  /**
   * If device level logging is turned on, log to log.warn
   * Otherwise send debug logs to log.debug
   */
  async infoLog(...log: any[]): Promise<void> {
    if (await this.enablingPlatformLogging()) {
      this.log.info(String(...log))
    }
  }

  async successLog(...log: any[]): Promise<void> {
    if (await this.enablingPlatformLogging()) {
      this.log.success(String(...log))
    }
  }

  async debugSuccessLog(...log: any[]): Promise<void> {
    if (await this.enablingPlatformLogging()) {
      if (await this.loggingIsDebug()) {
        this.log.success('[DEBUG]', String(...log))
      }
    }
  }

  async warnLog(...log: any[]): Promise<void> {
    if (await this.enablingPlatformLogging()) {
      this.log.warn(String(...log))
    }
  }

  async debugWarnLog(...log: any[]): Promise<void> {
    if (await this.enablingPlatformLogging()) {
      if (await this.loggingIsDebug()) {
        this.log.warn('[DEBUG]', String(...log))
      }
    }
  }

  async errorLog(...log: any[]): Promise<void> {
    if (await this.enablingPlatformLogging()) {
      this.log.error(String(...log))
    }
  }

  async debugErrorLog(...log: any[]): Promise<void> {
    if (await this.enablingPlatformLogging()) {
      if (await this.loggingIsDebug()) {
        this.log.error('[DEBUG]', String(...log))
      }
    }
  }

  async debugLog(...log: any[]): Promise<void> {
    if (await this.enablingPlatformLogging()) {
      if (this.platformLogging === 'debug') {
        this.log.info('[DEBUG]', String(...log))
      } else if (this.platformLogging === 'debugMode') {
        this.log.debug(String(...log))
      }
    }
  }

  async loggingIsDebug(): Promise<boolean> {
    return this.platformLogging === 'debugMode' || this.platformLogging === 'debug'
  }

  async enablingPlatformLogging(): Promise<boolean> {
    return this.platformLogging === 'debugMode' || this.platformLogging === 'debug' || this.platformLogging === 'standard'
  }
}
