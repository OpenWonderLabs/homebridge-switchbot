/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * lightstrip.ts: @switchbot/homebridge-switchbot.
 */
import type { CharacteristicValue, Controller, ControllerConstructor, ControllerServiceMap, PlatformAccessory, Service } from 'homebridge'
import type { bodyChange, device, stripLightServiceData, stripLightStatus, stripLightWebhookContext, SwitchbotDevice, WoStrip } from 'node-switchbot'

import type { SwitchBotPlatform } from '../platform.js'
import type { devicesConfig, stripLightConfig } from '../settings.js'

/*
* For Testing Locally:
* import { SwitchBotBLEModel, SwitchBotBLEModelName } from '/Users/Shared/GitHub/OpenWonderLabs/node-switchbot/dist/index.js';
*/
import { SwitchBotBLEModel, SwitchBotBLEModelName } from 'node-switchbot'
import { debounceTime, interval, skipWhile, Subject, take, tap } from 'rxjs'

import { formatDeviceIdAsMac, hs2rgb, m2hs, rgb2hs } from '../utils.js'
import { deviceBase } from './device.js'

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class StripLight extends deviceBase {
  // Services
  private LightBulb: {
    Name: CharacteristicValue
    Service: Service
    On: CharacteristicValue
    Hue: CharacteristicValue
    Saturation: CharacteristicValue
    Brightness: CharacteristicValue
    ColorTemperature?: CharacteristicValue
  }

  // OpenAPI
  deviceStatus!: stripLightStatus

  // Webhook
  webhookContext!: stripLightWebhookContext

  // BLE
  serviceData!: stripLightServiceData

  // Adaptive Lighting
  adaptiveLighting!: boolean
  adaptiveLightingShift!: number
  AdaptiveLightingController?: ControllerConstructor | Controller<ControllerServiceMap>

  // Updates
  stripLightUpdateInProgress!: boolean
  doStripLightUpdate!: Subject<void>

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device)
    // Set category
    accessory.category = this.hap.Categories.LIGHTBULB

    // Adaptive Lighting
    this.getAdaptiveLightingSettings(accessory, device)

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doStripLightUpdate = new Subject()
    this.stripLightUpdateInProgress = false

    // Initialize the LightBulb Service
    accessory.context.LightBulb = accessory.context.LightBulb ?? {}
    this.LightBulb = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.Lightbulb) ?? accessory.addService(this.hap.Service.Lightbulb) as Service,
      On: accessory.context.On ?? false,
      Hue: accessory.context.Hue ?? 0,
      Saturation: accessory.context.Saturation ?? 0,
      Brightness: accessory.context.Brightness ?? 0,
      ColorTemperature: accessory.context.ColorTemperature ?? 140,
    }
    accessory.context.LightBulb = this.LightBulb as object

    if (this.adaptiveLighting && this.adaptiveLightingShift === -1 && this.LightBulb) {
      accessory.removeService(this.LightBulb.Service)
      this.LightBulb.Service = accessory.addService(this.hap.Service.Lightbulb)
      accessory.context.adaptiveLighting = false
      this.debugLog(`adaptiveLighting: ${this.adaptiveLighting}`)
    } else if (this.adaptiveLighting && this.adaptiveLightingShift >= 0 && this.LightBulb) {
      this.AdaptiveLightingController = new platform.api.hap.AdaptiveLightingController(this.LightBulb.Service, {
        controllerMode: this.hap.AdaptiveLightingControllerMode.AUTOMATIC,
        customTemperatureAdjustment: this.adaptiveLightingShift,
      })
      accessory.configureController(this.AdaptiveLightingController)
      accessory.context.adaptiveLighting = true
      this.debugLog(`adaptiveLighting: ${this.adaptiveLighting}, adaptiveLightingShift: ${this.adaptiveLightingShift}`,
      )
    } else {
      accessory.context.adaptiveLighting = false
      this.debugLog(`adaptiveLighting: ${accessory.context.adaptiveLighting}`)
    }

    // Initialize LightBulb Characteristics
    this.LightBulb.Service.setCharacteristic(this.hap.Characteristic.Name, this.LightBulb.Name).getCharacteristic(this.hap.Characteristic.On).onGet(() => {
      return this.LightBulb.On
    }).onSet(this.OnSet.bind(this))

    // Initialize LightBulb Brightness Characteristic
    this.LightBulb.Service.getCharacteristic(this.hap.Characteristic.Brightness).setProps({
      minStep: (device as stripLightConfig).set_minStep ?? 1,
      minValue: 0,
      maxValue: 100,
      validValueRanges: [0, 100],
    }).onGet(() => {
      return this.LightBulb.Brightness
    }).onSet(this.BrightnessSet.bind(this))

    // Initialize LightBulb ColorTemperature Characteristic
    this.LightBulb.Service.getCharacteristic(this.hap.Characteristic.ColorTemperature).setProps({
      minValue: 140,
      maxValue: 500,
      validValueRanges: [140, 500],
    }).onGet(() => {
      return this.LightBulb.ColorTemperature!
    }).onSet(this.ColorTemperatureSet.bind(this))

    // Initialize LightBulb Hue Characteristic
    this.LightBulb.Service.getCharacteristic(this.hap.Characteristic.Hue).setProps({
      minValue: 0,
      maxValue: 360,
      validValueRanges: [0, 360],
    }).onGet(() => {
      return this.LightBulb.Hue
    }).onSet(this.HueSet.bind(this))

    // Initialize LightBulb Saturation Characteristic
    this.LightBulb.Service.getCharacteristic(this.hap.Characteristic.Saturation).setProps({
      minValue: 0,
      maxValue: 100,
      validValueRanges: [0, 100],
    }).onGet(() => {
      return this.LightBulb.Saturation
    }).onSet(this.SaturationSet.bind(this))

    // Retrieve initial values and updateHomekit
    try {
      this.debugLog('Retrieve initial values and update Homekit')
      this.refreshStatus()
    } catch (e: any) {
      this.errorLog(`failed to retrieve initial values and update Homekit, Error: ${e.message ?? e}`)
    }

    // regisiter webhook event handler if enabled
    try {
      this.debugLog('Registering Webhook Event Handler')
      this.registerWebhook()
    } catch (e: any) {
      this.errorLog(`failed to registerWebhook, Error: ${e.message ?? e}`)
    }

    // regisiter platform BLE event handler if enabled
    try {
      this.debugLog('Registering Platform BLE Event Handler')
      this.registerPlatformBLE()
    } catch (e: any) {
      this.errorLog(`failed to registerPlatformBLE, Error: ${e.message ?? e}`)
    }

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.stripLightUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus()
      })

    // Watch for Bulb change events
    // We put in a debounce of 1000ms so we don't make duplicate calls
    this.doStripLightUpdate
      .pipe(
        tap(() => {
          this.stripLightUpdateInProgress = true
        }),
        debounceTime(this.devicePushRate * 1000),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges()
        } catch (e: any) {
          await this.apiError(e)
          this.errorLog(`failed pushChanges with ${device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
        }
        this.stripLightUpdateInProgress = false
      })
  }

  async BLEparseStatus(): Promise<void> {
    this.debugLog('BLEparseStatus')
    this.debugLog(`(power, brightness, color) = BLE:(${this.serviceData.power}, ${this.serviceData.brightness}, ${this.serviceData.red}:${this.serviceData.green}:${this.serviceData.blue}), current:(${this.LightBulb.On}, ${this.LightBulb.Brightness}, ${this.LightBulb.Hue}, ${this.LightBulb.Saturation})`)

    // On
    this.LightBulb.On = this.serviceData.power
    this.debugLog(`On: ${this.LightBulb.On}`)

    // Brightness
    this.LightBulb.Brightness = this.serviceData.brightness
    this.debugLog(`Brightness: ${this.LightBulb.Brightness}`)

    // Color, Hue & Brightness
    this.debugLog(`red: ${this.serviceData.red}, green: ${this.serviceData.green}, blue: ${this.serviceData.blue}`)
    const [hue, saturation] = rgb2hs(this.serviceData.red, this.serviceData.green, this.serviceData.blue)
    this.debugLog(`hs: ${JSON.stringify(rgb2hs(this.serviceData.red, this.serviceData.green, this.serviceData.blue))}`)

    // Hue
    this.LightBulb.Hue = hue
    this.debugLog(`Hue: ${this.LightBulb.Hue}`)

    // Saturation
    this.LightBulb.Saturation = saturation
    this.debugLog(`Saturation: ${this.LightBulb.Saturation}`)
  }

  async openAPIparseStatus(): Promise<void> {
    this.debugLog('openAPIparseStatus')
    this.debugLog(`(power, brightness, color) = API:(${this.deviceStatus.power}, ${this.deviceStatus.brightness}, ${this.deviceStatus.color}), current:(${this.LightBulb.On}, ${this.LightBulb.Brightness}, ${this.LightBulb.Hue}, ${this.LightBulb.Saturation})`)

    // On
    this.LightBulb.On = this.deviceStatus.power === 'on'
    this.debugLog(`On: ${this.LightBulb.On}`)

    // Brightness
    this.LightBulb.Brightness = this.deviceStatus.brightness
    this.debugLog(`Brightness: ${this.LightBulb.Brightness}`)

    // Color, Hue & Brightness
    this.debugLog(`color: ${JSON.stringify(this.deviceStatus.color)}`)
    const [red, green, blue] = this.deviceStatus.color.split(':')
    this.debugLog(`red: ${JSON.stringify(red)}, green: ${JSON.stringify(green)}, blue: ${JSON.stringify(blue)}`)
    const [hue, saturation] = rgb2hs(red, green, blue)
    this.debugLog(`hs: ${JSON.stringify(rgb2hs(red, green, blue))}`)

    // Hue
    this.LightBulb.Hue = hue
    this.debugLog(`Hue: ${this.LightBulb.Hue}`)

    // Saturation
    this.LightBulb.Saturation = saturation
    this.debugLog(`Saturation: ${this.LightBulb.Saturation}`)

    // Firmware Version
    if (this.deviceStatus.version) {
      const version = this.deviceStatus.version.toString()
      this.debugLog(`Firmware Version: ${version.replace(/^V|-.*$/g, '')}`)
      const deviceVersion = version.replace(/^V|-.*$/g, '') ?? '0.0.0'
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
        .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
        .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
        .updateValue(deviceVersion)
      this.accessory.context.version = deviceVersion
      this.debugSuccessLog(`version: ${this.accessory.context.version}`)
    }
  }

  async parseStatusWebhook(): Promise<void> {
    this.debugLog('parseStatusWebhook')
    this.debugLog(`(powerState, brightness, color) = Webhook:(${this.webhookContext.powerState}, ${this.webhookContext.brightness}, ${this.webhookContext.color}), current:(${this.LightBulb.On}, ${this.LightBulb.Brightness}, ${this.LightBulb.Hue}, ${this.LightBulb.Saturation})`)

    // On
    this.LightBulb.On = this.webhookContext.powerState === 'ON'
    this.debugLog(`On: ${this.LightBulb.On}`)

    // Brightness
    this.LightBulb.Brightness = this.webhookContext.brightness
    this.debugLog(`Brightness: ${this.LightBulb.Brightness}`)

    // Color, Hue & Brightness
    this.debugLog(`color: ${JSON.stringify(this.webhookContext.color)}`)
    const [red, green, blue] = this.webhookContext.color.split(':')
    this.debugLog(`red: ${JSON.stringify(red)}, green: ${JSON.stringify(green)}, blue: ${JSON.stringify(blue)}`)
    const [hue, saturation] = rgb2hs(red, green, blue)
    this.debugLog(`hs: ${JSON.stringify(rgb2hs(red, green, blue))}`)

    // Hue
    this.LightBulb.Hue = hue
    this.debugLog(`Hue: ${this.LightBulb.Hue}`)

    // Saturation
    this.LightBulb.Saturation = saturation
    this.debugLog(`Saturation: ${this.LightBulb.Saturation}`)
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`refreshStatus enableCloudService: ${this.device.enableCloudService}`)
    } else if (this.BLE) {
      await this.BLERefreshStatus()
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIRefreshStatus()
    } else {
      await this.offlineOff()
      this.debugWarnLog(`Connection Type: ${this.device.connectionType}, refreshStatus will not happen.`)
    }
  }

  async BLERefreshStatus(): Promise<void> {
    this.debugLog('BLERefreshStatus')
    const switchBotBLE = await this.switchbotBLE()
    if (switchBotBLE === undefined) {
      await this.BLERefreshConnection(switchBotBLE)
    } else {
      // Start to monitor advertisement packets
      (async () => {
        // Start to monitor advertisement packets
        const serviceData = await this.monitorAdvertisementPackets(switchBotBLE) as stripLightServiceData
        // Update HomeKit
        if (serviceData.model === SwitchBotBLEModel.StripLight && serviceData.modelName === SwitchBotBLEModelName.StripLight) {
          this.serviceData = serviceData
          await this.BLEparseStatus()
          await this.updateHomeKitCharacteristics()
        } else {
          this.errorLog(`failed to get serviceData, serviceData: ${JSON.stringify(serviceData)}`)
          await this.BLERefreshConnection(switchBotBLE)
        }
      })()
    }
  }

  async registerPlatformBLE(): Promise<void> {
    this.debugLog('registerPlatformBLE')
    if (this.config.options?.BLE) {
      this.debugLog('is listening to Platform BLE.')
      try {
        const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
        this.device.bleMac = formattedDeviceId
        this.debugLog(`bleMac: ${this.device.bleMac}`)
        this.platform.bleEventHandler[this.device.bleMac] = async (context: stripLightServiceData) => {
          try {
            this.debugLog(`received BLE: ${JSON.stringify(context)}`)
            this.serviceData = context
            await this.BLEparseStatus()
            await this.updateHomeKitCharacteristics()
          } catch (e: any) {
            this.errorLog(`failed to handle BLE. Received: ${JSON.stringify(context)} Error: ${e.message ?? e}`)
          }
        }
      } catch (error) {
        this.errorLog(`failed to format device ID as MAC, Error: ${error}`)
      }
    } else {
      this.debugLog('is not listening to Platform BLE')
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog('openAPIRefreshStatus')
    try {
      const { body } = await this.deviceRefreshStatus()
      const deviceStatus: any = await body
      this.debugLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
      if (await this.successfulStatusCodes(deviceStatus)) {
        this.debugSuccessLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        this.deviceStatus = deviceStatus.body
        await this.openAPIparseStatus()
        await this.updateHomeKitCharacteristics()
      } else {
        this.debugWarnLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        this.debugWarnLog(deviceStatus)
      }
    } catch (e: any) {
      await this.apiError(e)
      this.errorLog(`failed openAPIRefreshStatus with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
    }
  }

  async registerWebhook() {
    if (this.device.webhook) {
      this.debugLog('is listening webhook.')
      this.platform.webhookEventHandler[this.device.deviceId] = async (context: stripLightWebhookContext) => {
        try {
          this.debugLog(`received Webhook: ${JSON.stringify(context)}`)
          this.webhookContext = context
          await this.parseStatusWebhook()
          await this.updateHomeKitCharacteristics()
        } catch (e: any) {
          this.errorLog(`failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e.message ?? e}`)
        }
      }
    } else {
      this.debugLog('is not listening webhook.')
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType        commandType            Command                 command parameter                       Description
   * Strip Light  -    "command"            "turnOn"                   "default"                =        set to ON state |
   * Strip Light  -    "command"           "turnOff"                   "default"                =        set to OFF state |
   * Strip Light  -    "command"            "toggle"                   "default"                =        toggle state |
   * Strip Light  -    "command"        "setBrightness"               "`{1-100}`"               =        set brightness |
   * Strip Light  -    "command"          "setColor"           "`"{0-255}:{0-255}:{0-255}"`"    =        set RGB color value |
   *
   */
  async pushChanges(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`pushChanges enableCloudService: ${this.device.enableCloudService}`)
    } else if (this.BLE) {
      await this.BLEpushChanges()
      if (this.LightBulb.On) {
        // Push Brightness Update
        this.debugLog(`Brightness: ${this.LightBulb.Brightness}`)
        await this.BLEpushBrightnessChanges()
        // Push Hue & Saturation Update
        this.debugLog(`Hue: ${this.LightBulb.Hue}, Saturation: ${this.LightBulb.Saturation}`)
        await this.BLEpushRGBChanges()
        // Set ColorTemperature
        if (this.LightBulb.ColorTemperature !== this.accessory.context.ColorTemperature) {
          const kelvin = Math.round(1000000 / Number(this.LightBulb.ColorTemperature))
          this.accessory.context.kelvin = kelvin
        } else {
          this.debugLog(`No pushColorTemperatureChanges, ColorTemperature: ${this.LightBulb.ColorTemperature}, ColorTemperatureCached: ${this.accessory.context.ColorTemperature}`)
        }
      } else {
        this.debugLog('BLE (Brightness), (Hue), & (Saturation) changes will not happen, as the device is OFF.')
      }
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges()
      if (this.LightBulb.On) {
        // Push Brightness Update
        this.debugLog(`Brightness: ${this.LightBulb.Brightness}`)
        await this.pushBrightnessChanges()
        // Push Hue & Saturation Update
        this.debugLog(`Hue: ${this.LightBulb.Hue}, Saturation: ${this.LightBulb.Saturation}`)
        await this.pushHueSaturationChanges()
      } else {
        this.debugLog('openAPI (Brightness), (ColorTemperature), (Hue), & (Saturation) changes will not happen, as the device is OFF.')
      }
    } else {
      await this.offlineOff()
      this.debugWarnLog(`Connection Type: ${this.device.connectionType}, pushChanges will not happen.`)
    }
    // Refresh the status from the API
    interval(15000)
      .pipe(skipWhile(() => this.stripLightUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus()
      })
  }

  async BLEpushChanges(): Promise<void> {
    this.debugLog('BLEpushChanges')
    if (this.LightBulb.On !== this.accessory.context.On) {
      this.debugLog(`BLEpushChanges On: ${this.LightBulb.On}, OnCached: ${this.accessory.context.On}`)
      const switchBotBLE = await this.platform.connectBLE(this.accessory, this.device)
      try {
        const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
        this.device.bleMac = formattedDeviceId
        this.debugLog(`bleMac: ${this.device.bleMac}`)
        if (switchBotBLE !== false) {
          switchBotBLE
            .discover({ model: this.device.bleModel, id: this.device.bleMac })
            .then(async (device_list: SwitchbotDevice[]) => {
              const deviceList = device_list as unknown as WoStrip[]
              this.infoLog(`On: ${this.LightBulb.On}`)
              return await this.retryBLE({
                max: await this.maxRetryBLE(),
                fn: async () => {
                  if (this.LightBulb.On) {
                    return await deviceList[0].turnOn()
                  } else {
                    return await deviceList[0].turnOff()
                  }
                },
              })
            })
            .then(async () => {
              this.successLog(`On: ${this.LightBulb.On} sent over SwitchBot BLE,  sent successfully`)
              await this.updateHomeKitCharacteristics()
            })
            .catch(async (e: any) => {
              await this.apiError(e)
              this.errorLog(`failed BLEpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
              await this.BLEPushConnection()
            })
        } else {
          this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${JSON.stringify(switchBotBLE)}`)
          await this.BLEPushConnection()
        }
      } catch (error) {
        this.errorLog(`failed to format device ID as MAC, Error: ${error}`)
      }
    } else {
      this.debugLog(`No changes (BLEpushChanges), On: ${this.LightBulb.On}, OnCached: ${this.accessory.context.On}`)
    }
  }

  async BLEpushBrightnessChanges(): Promise<void> {
    this.debugLog('BLEpushBrightnessChanges')
    if (this.LightBulb.Brightness !== this.accessory.context.Brightness) {
      const switchBotBLE = await this.platform.connectBLE(this.accessory, this.device)
      try {
        const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
        this.device.bleMac = formattedDeviceId
        this.debugLog(`bleMac: ${this.device.bleMac}`)
        if (switchBotBLE !== false) {
          switchBotBLE
            .discover({ model: this.device.bleModel, id: this.device.bleMac })
            .then(async (device_list: SwitchbotDevice[]) => {
              this.infoLog(`Brightness: ${this.LightBulb.Brightness}`)
              return await device_list[0].setBrightness(this.LightBulb.Brightness)
            })
            .then(async () => {
              this.successLog(`Brightness: ${this.LightBulb.Brightness} sent over SwitchBot BLE,  sent successfully`)
              await this.updateHomeKitCharacteristics()
            })
            .catch(async (e: any) => {
              await this.apiError(e)
              this.errorLog(`failed BLEpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
              await this.BLEPushConnection()
            })
        } else {
          this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${JSON.stringify(switchBotBLE)}`)
          await this.BLEPushConnection()
        }
      } catch (error) {
        this.errorLog(`failed to format device ID as MAC, Error: ${error}`)
      }
    } else {
      this.debugLog(`No changes (BLEpushBrightnessChanges), Brightness: ${this.LightBulb.Brightness}, BrightnessCached: ${this.accessory.context.Brightness}`)
    }
  }

  async BLEpushRGBChanges(): Promise<void> {
    this.debugLog('BLEpushRGBChanges')
    if ((this.LightBulb.Hue !== this.accessory.context.Hue) || (this.LightBulb.Saturation !== this.accessory.context.Saturation)) {
      this.debugLog(`Hue: ${JSON.stringify(this.LightBulb.Hue)}, Saturation: ${JSON.stringify(this.LightBulb.Saturation)}`)
      const [red, green, blue] = hs2rgb(this.LightBulb.Hue, this.LightBulb.Saturation)
      this.debugLog(`rgb: ${JSON.stringify([red, green, blue])}`)
      const switchBotBLE = await this.platform.connectBLE(this.accessory, this.device)
      try {
        const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
        this.device.bleMac = formattedDeviceId
        this.debugLog(`bleMac: ${this.device.bleMac}`)
        if (switchBotBLE !== false) {
          switchBotBLE
            .discover({ model: this.device.bleModel, id: this.device.bleMac })
            .then(async (device_list: SwitchbotDevice[]) => {
              this.infoLog(`RGB: ${(this.LightBulb.Brightness, red, green, blue)}`)
              return await device_list[0].setRGB(this.LightBulb.Brightness, red, green, blue)
            })
            .then(async () => {
              this.successLog(`RGB: ${(this.LightBulb.Brightness, red, green, blue)} sent over SwitchBot BLE,  sent successfully`)
              await this.updateHomeKitCharacteristics()
            })
            .catch(async (e: any) => {
              await this.apiError(e)
              this.errorLog(`failed BLEpushRGBChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
              await this.BLEPushConnection()
            })
        } else {
          this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${JSON.stringify(switchBotBLE)}`)
          await this.BLEPushConnection()
        }
      } catch (error) {
        this.errorLog(`failed to format device ID as MAC, Error: ${error}`)
      }
    } else {
      this.debugLog(`No changes (BLEpushRGBChanges), Hue: ${this.LightBulb.Hue}, HueCached: ${this.accessory.context.Hue}, Saturation: ${this.LightBulb.Saturation}, SaturationCached: ${this.accessory.context.Saturation}`)
    }
  }

  async openAPIpushChanges() {
    this.debugLog('openAPIpushChanges')
    if (this.LightBulb.On !== this.accessory.context.On) {
      const command = this.LightBulb.On ? 'turnOn' : 'turnOff'
      const bodyChange: bodyChange = {
        command: `${command}`,
        parameter: 'default',
        commandType: 'command',
      }
      this.debugLog(`SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`)
      try {
        const { body } = await this.pushChangeRequest(bodyChange)
        const deviceStatus: any = await body
        this.debugLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        if (await this.successfulStatusCodes(deviceStatus)) {
          this.debugSuccessLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
          await this.updateHomeKitCharacteristics()
        } else {
          await this.statusCode(deviceStatus.statusCode)
        }
      } catch (e: any) {
        await this.apiError(e)
        this.errorLog(`failed openAPIpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
      }
    } else {
      this.debugLog(`No changes (openAPIpushChanges), On: ${this.LightBulb.On}, OnCached: ${this.accessory.context.On}`)
    }
  }

  async pushHueSaturationChanges(): Promise<void> {
    this.debugLog('pushHueSaturationChanges')
    if ((this.LightBulb.Hue !== this.accessory.context.Hue) || (this.LightBulb.Saturation !== this.accessory.context.Saturation)) {
      this.debugLog(`Hue: ${JSON.stringify(this.LightBulb.Hue)}, Saturation: ${JSON.stringify(this.LightBulb.Saturation)}`)
      const [red, green, blue] = hs2rgb(this.LightBulb.Hue, this.LightBulb.Saturation)
      this.debugLog(`rgb: ${JSON.stringify([red, green, blue])}`)
      const bodyChange: bodyChange = {
        command: 'setColor',
        parameter: `${red}:${green}:${blue}`,
        commandType: 'command',
      }
      this.debugLog(`SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`)
      try {
        const { body } = await this.pushChangeRequest(bodyChange)
        const deviceStatus: any = await body
        this.debugLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        if (await this.successfulStatusCodes(deviceStatus)) {
          this.debugSuccessLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
          await this.updateHomeKitCharacteristics()
        } else {
          await this.statusCode(deviceStatus.statusCode)
        }
      } catch (e: any) {
        await this.apiError(e)
        this.errorLog(`failed pushHueSaturationChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
      }
    } else {
      this.debugLog(`No changes (pushHueSaturationChanges), Hue: ${this.LightBulb.Hue}, HueCached: ${this.accessory.context.Hue}, Saturation: ${this.LightBulb.Saturation}, SaturationCached: ${this.accessory.context.Saturation}`)
    }
  }

  async pushBrightnessChanges(): Promise<void> {
    this.debugLog('pushBrightnessChanges')
    if (this.LightBulb.Brightness !== this.accessory.context.Brightness) {
      const bodyChange: bodyChange = {
        command: 'setBrightness',
        parameter: `${this.LightBulb.Brightness}`,
        commandType: 'command',
      }
      this.debugLog(`SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`)
      try {
        const { body } = await this.pushChangeRequest(bodyChange)
        const deviceStatus: any = await body
        this.debugLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        if (await this.successfulStatusCodes(deviceStatus)) {
          this.debugSuccessLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
          await this.updateHomeKitCharacteristics()
        } else {
          await this.statusCode(deviceStatus.statusCode)
        }
      } catch (e: any) {
        await this.apiError(e)
        this.errorLog(`failed pushBrightnessChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
      }
    } else {
      this.debugLog(`No changes (pushBrightnessChanges), Brightness: ${this.LightBulb.Brightness}, BrightnessCached: ${this.accessory.context.Brightness}`)
    }
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    if (this.LightBulb.On !== this.accessory.context.On) {
      this.infoLog(`Set On: ${value}`)
    } else {
      this.debugLog(`No Changes, On: ${value}`)
    }

    this.LightBulb.On = value
    this.doStripLightUpdate.next()
  }

  /**
   * Handle requests to set the value of the "Brightness" characteristic
   */
  async BrightnessSet(value: CharacteristicValue): Promise<void> {
    if (this.LightBulb.On && (this.LightBulb.Brightness !== this.accessory.context.Brightness)) {
      this.infoLog(`Set Brightness: ${value}`)
    } else {
      if (this.LightBulb.On) {
        this.debugLog(`No Changes, Brightness: ${value}`)
      } else {
        this.debugLog(`Set Brightness: ${value}, On: ${this.LightBulb.On}`)
      }
    }

    this.LightBulb.Brightness = value
    this.doStripLightUpdate.next()
  }

  /**
   * Handle requests to set the value of the "ColorTemperature" characteristic
   */
  async ColorTemperatureSet(value: CharacteristicValue): Promise<void> {
    if (this.LightBulb.On && (this.LightBulb.ColorTemperature !== this.accessory.context.ColorTemperature)) {
      this.infoLog(`Set ColorTemperature: ${value}`)
    } else {
      if (this.LightBulb.On) {
        this.debugLog(`No Changes, ColorTemperature: ${value}`)
      } else {
        this.debugLog(`Set ColorTemperature: ${value}, On: ${this.LightBulb.On}`)
      }
    }

    const minKelvin = 2000
    const maxKelvin = 9000
    // Convert mired to kelvin to nearest 100 (SwitchBot seems to need this)
    const kelvin = Math.round(1000000 / Number(value) / 100) * 100
    // Check and increase/decrease kelvin to range of device
    const k = Math.min(Math.max(kelvin, minKelvin), maxKelvin)

    if (!this.accessory.context.On || this.accessory.context.maxKelvin === k) {
      return
    }

    // Updating the hue/sat to the corresponding values mimics native adaptive lighting
    const hs = m2hs(value)
    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.Hue, hs[0])
    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.Saturation, hs[1])

    this.LightBulb.ColorTemperature = value
    this.doStripLightUpdate.next()
  }

  /**
   * Handle requests to set the value of the "Hue" characteristic
   */
  async HueSet(value: CharacteristicValue): Promise<void> {
    if (this.LightBulb.On && (this.LightBulb.Hue !== this.accessory.context.Hue)) {
      this.infoLog(`Set Hue: ${value}`)
    } else {
      if (this.LightBulb.On) {
        this.debugLog(`No Changes, Hue: ${value}`)
      } else {
        this.debugLog(`Set Hue: ${value}, On: ${this.LightBulb.On}`)
      }
    }

    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.ColorTemperature, 140)

    this.LightBulb.Hue = value
    this.doStripLightUpdate.next()
  }

  /**
   * Handle requests to set the value of the "Saturation" characteristic
   */
  async SaturationSet(value: CharacteristicValue): Promise<void> {
    if (this.LightBulb.On && (this.LightBulb.Saturation !== this.accessory.context.Saturation)) {
      this.infoLog(`Set Saturation: ${value}`)
    } else {
      if (this.LightBulb.On) {
        this.debugLog(`No Changes, Saturation: ${value}`)
      } else {
        this.debugLog(`Set Saturation: ${value}, On: ${this.LightBulb.On}`)
      }
    }

    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.ColorTemperature, 140)

    this.LightBulb.Saturation = value
    this.doStripLightUpdate.next()
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    // On
    await this.updateCharacteristic(this.LightBulb.Service, this.hap.Characteristic.On, this.LightBulb.On, 'On')
    // Brightness
    await this.updateCharacteristic(this.LightBulb.Service, this.hap.Characteristic.Brightness, this.LightBulb.Brightness, 'Brightness')
    // ColorTemperature
    await this.updateCharacteristic(this.LightBulb.Service, this.hap.Characteristic.ColorTemperature, this.LightBulb.ColorTemperature, 'ColorTemperature')
    // Hue
    await this.updateCharacteristic(this.LightBulb.Service, this.hap.Characteristic.Hue, this.LightBulb.Hue, 'Hue')
    // Saturation
    await this.updateCharacteristic(this.LightBulb.Service, this.hap.Characteristic.Saturation, this.LightBulb.Saturation, 'Saturation')
  }

  async getAdaptiveLightingSettings(accessory: PlatformAccessory, device: device & devicesConfig): Promise<void> {
    // Adaptive Lighting
    this.adaptiveLighting = accessory.context.adaptiveLighting ?? true
    this.debugLog(`adaptiveLighting: ${this.adaptiveLighting}`)
    // Adaptive Lighting Shift
    this.adaptiveLightingShift = (device as stripLightConfig).adaptiveLightingShift ?? 0
    this.debugLog(`adaptiveLightingShift: ${this.adaptiveLightingShift}`)
  }

  async BLEPushConnection() {
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog('Using OpenAPI Connection to Push Changes')
      await this.openAPIpushChanges()
    }
  }

  async BLERefreshConnection(switchbot: any): Promise<void> {
    this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`)
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog('Using OpenAPI Connection to Refresh Status')
      await this.openAPIRefreshStatus()
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.On, false)
    }
  }

  async apiError(e: any): Promise<void> {
    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.On, e)
    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.Hue, e)
    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.Brightness, e)
    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.Saturation, e)
    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.ColorTemperature, e)
  }
}
