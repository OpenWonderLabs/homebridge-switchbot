/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * hub.ts: @switchbot/homebridge-switchbot.
 */
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { SwitchBotPlatform } from '../platform.js'
import type { devicesConfig } from '../settings.js'
import type { hub2ServiceData } from '../types/bledevicestatus.js'
import type { device } from '../types/devicelist.js'
import type { hub2Status } from '../types/devicestatus.js'
import type { hub2WebhookContext } from '../types/devicewebhookstatus.js'

import { Units } from 'homebridge'
/*
* For Testing Locally:
* import { SwitchBotBLEModel, SwitchBotBLEModelName } from '/Users/Shared/GitHub/OpenWonderLabs/node-switchbot/dist/index.js';
*/
import { SwitchBotBLEModel, SwitchBotBLEModelName } from 'node-switchbot'
import { interval, skipWhile, Subject } from 'rxjs'

import { convertUnits, formatDeviceIdAsMac, validHumidity } from '../utils.js'
import { deviceBase } from './device.js'

export class Hub extends deviceBase {
  // Services
  private LightSensor?: {
    Name: CharacteristicValue
    Service: Service
    CurrentAmbientLightLevel: CharacteristicValue
  }

  private HumiditySensor?: {
    Name: CharacteristicValue
    Service: Service
    CurrentRelativeHumidity: CharacteristicValue
  }

  private TemperatureSensor?: {
    Name: CharacteristicValue
    Service: Service
    CurrentTemperature: CharacteristicValue
  }

  // OpenAPI
  deviceStatus!: hub2Status

  // Webhook
  webhookContext!: hub2WebhookContext

  // BLE
  serviceData!: hub2ServiceData

  // Updates
  hubUpdateInProgress!: boolean
  doHubUpdate!: Subject<void>

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device)
    // Set category
    accessory.category = this.hap.Categories.SENSOR

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doHubUpdate = new Subject()
    this.hubUpdateInProgress = false

    // Initialize Temperature Sensor Service
    if (device.hub?.hide_temperature) {
      if (this.TemperatureSensor) {
        this.debugLog('Removing Temperature Sensor Service')
        this.TemperatureSensor.Service = this.accessory.getService(this.hap.Service.TemperatureSensor) as Service
        accessory.removeService(this.TemperatureSensor.Service)
      }
    } else {
      accessory.context.TemperatureSensor = accessory.context.TemperatureSensor ?? {}
      this.TemperatureSensor = {
        Name: `${accessory.displayName} Temperature Sensor`,
        Service: accessory.getService(this.hap.Service.TemperatureSensor) ?? this.accessory.addService(this.hap.Service.TemperatureSensor) as Service,
        CurrentTemperature: accessory.context.CurrentTemperature ?? 0,
      }
      accessory.context.TemperatureSensor = this.TemperatureSensor as object

      // Initialize Temperature Sensor Characteristic
      this.TemperatureSensor.Service.setCharacteristic(this.hap.Characteristic.Name, this.TemperatureSensor.Name).getCharacteristic(this.hap.Characteristic.CurrentTemperature).setProps({
        unit: Units.CELSIUS,
        validValueRanges: [-273.15, 100],
        minValue: -273.15,
        maxValue: 100,
        minStep: 0.1,
      }).onGet(() => {
        return this.TemperatureSensor!.CurrentTemperature
      })
    }

    // Initialize Humidity Sensor Service
    if (device.hub?.hide_humidity) {
      if (this.HumiditySensor) {
        this.debugLog('Removing Humidity Sensor Service')
        this.HumiditySensor.Service = this.accessory.getService(this.hap.Service.HumiditySensor) as Service
        accessory.removeService(this.HumiditySensor.Service)
      }
    } else {
      accessory.context.HumiditySensor = accessory.context.HumiditySensor ?? {}
      this.HumiditySensor = {
        Name: `${accessory.displayName} Humidity Sensor`,
        Service: accessory.getService(this.hap.Service.HumiditySensor) ?? this.accessory.addService(this.hap.Service.HumiditySensor) as Service,
        CurrentRelativeHumidity: accessory.context.CurrentRelativeHumidity ?? 0,
      }
      accessory.context.HumiditySensor = this.HumiditySensor as object

      // Initialize Humidity Sensor Characteristics
      this.HumiditySensor!.Service.setCharacteristic(this.hap.Characteristic.Name, this.HumiditySensor.Name).getCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity).setProps({
        minStep: 0.1,
      }).onGet(() => {
        return this.HumiditySensor!.CurrentRelativeHumidity
      })
    }

    // Initialize Light Sensor Service
    if (device.hub?.hide_lightsensor) {
      if (this.LightSensor) {
        this.debugLog('Removing Light Sensor Service')
        this.LightSensor.Service = this.accessory.getService(this.hap.Service.LightSensor) as Service
        accessory.removeService(this.LightSensor.Service)
      }
    } else {
      accessory.context.LightSensor = accessory.context.LightSensor ?? {}
      this.LightSensor = {
        Name: `${accessory.displayName} Light Sensor`,
        Service: accessory.getService(this.hap.Service.LightSensor) ?? this.accessory.addService(this.hap.Service.LightSensor) as Service,
        CurrentAmbientLightLevel: accessory.context.CurrentAmbientLightLevel ?? 0.0001,
      }
      accessory.context.LightSensor = this.LightSensor as object

      // Initialize Light Sensor Characteristics
      this.LightSensor!.Service.setCharacteristic(this.hap.Characteristic.Name, this.LightSensor.Name).getCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel).setProps({
        minStep: 1,
      }).onGet(() => {
        return this.LightSensor!.CurrentAmbientLightLevel
      })
    }

    // Retrieve initial values and updateHomekit
    try {
      this.debugLog('Retrieve initial values and update Homekit')
      this.refreshStatus()
    } catch (e: any) {
      this.errorLog(`failed to retrieve initial values and update Homekit, Error: ${e}`)
    }

    // regisiter webhook event handler if enabled
    try {
      this.debugLog('Registering Webhook Event Handler')
      this.registerWebhook()
    } catch (e: any) {
      this.errorLog(`failed to registerWebhook, Error: ${e}`)
    }

    // regisiter platform BLE event handler if enabled
    try {
      this.debugLog('Registering Platform BLE Event Handler')
      this.registerPlatformBLE()
    } catch (e: any) {
      this.errorLog(`failed to registerPlatformBLE, Error: ${e}`)
    }

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.hubUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus()
      })
  }

  async BLEparseStatus(): Promise<void> {
    await this.debugLog('BLEparseStatus')
    await this.debugLog(`(temperature, humidity, lightLevel) = BLE:(${this.serviceData.celsius}, ${this.serviceData.humidity}, ${this.serviceData.lightLevel}), current:(${this.TemperatureSensor?.CurrentTemperature}, ${this.HumiditySensor?.CurrentRelativeHumidity}, ${this.LightSensor?.CurrentAmbientLightLevel})`)

    // CurrentTemperature
    if (!this.device.hub?.hide_temperature && this.TemperatureSensor?.Service) {
      this.TemperatureSensor.CurrentTemperature = this.serviceData.celsius
      await this.debugLog(`CurrentTemperature: ${this.TemperatureSensor.CurrentTemperature}°c`)
    }

    // CurrentRelativeHumidity
    if (!this.device.hub?.hide_humidity && this.HumiditySensor?.Service) {
      this.HumiditySensor!.CurrentRelativeHumidity = validHumidity(this.serviceData.humidity, 0, 100)
      await this.debugLog(`CurrentRelativeHumidity: ${this.HumiditySensor.CurrentRelativeHumidity}%`)
    }

    // CurrentAmbientLightLevel
    if (!this.device.hub?.hide_lightsensor && this.LightSensor?.Service) {
      const set_minLux = this.device.blindTilt?.set_minLux ?? 1
      const set_maxLux = this.device.blindTilt?.set_maxLux ?? 6001
      const lightLevel = this.serviceData.lightLevel
      this.LightSensor.CurrentAmbientLightLevel = await this.getLightLevel(lightLevel, set_minLux, set_maxLux, 19)
      await this.debugLog(`LightLevel: ${this.serviceData.lightLevel}, CurrentAmbientLightLevel: ${this.LightSensor.CurrentAmbientLightLevel}`)
    }
  }

  async openAPIparseStatus(): Promise<void> {
    await this.debugLog('openAPIparseStatus')
    await this.debugLog(`(temperature, humidity, lightLevel) = OpenAPI:(${this.deviceStatus.temperature}, ${this.deviceStatus.humidity}, ${this.deviceStatus.lightLevel}), current:(${this.TemperatureSensor?.CurrentTemperature}, ${this.HumiditySensor?.CurrentRelativeHumidity}, ${this.LightSensor?.CurrentAmbientLightLevel})`)

    // CurrentRelativeHumidity
    if (!this.device.hub?.hide_humidity && this.HumiditySensor?.Service) {
      this.HumiditySensor.CurrentRelativeHumidity = this.deviceStatus.humidity
      await this.debugLog(`CurrentRelativeHumidity: ${this.HumiditySensor.CurrentRelativeHumidity}%`)
    }

    // CurrentTemperature
    if (!this.device.hub?.hide_temperature && this.TemperatureSensor?.Service) {
      this.TemperatureSensor.CurrentTemperature = this.deviceStatus.temperature
      await this.debugLog(`CurrentTemperature: ${this.TemperatureSensor.CurrentTemperature}°c`)
    }

    // LightSensor
    if (!this.device.hub?.hide_lightsensor && this.LightSensor?.Service) {
      const set_minLux = this.device.blindTilt?.set_minLux ?? 1
      const set_maxLux = this.device.blindTilt?.set_maxLux ?? 6001
      const lightLevel = this.deviceStatus.lightLevel
      this.LightSensor.CurrentAmbientLightLevel = await this.getLightLevel(lightLevel, set_minLux, set_maxLux, 19)
      await this.debugLog(`LightLevel: ${this.deviceStatus.lightLevel}, CurrentAmbientLightLevel: ${this.LightSensor!.CurrentAmbientLightLevel}`)
    }

    // Firmware Version
    if (this.deviceStatus.version) {
      const version = this.deviceStatus.version.toString()
      await this.debugLog(`Firmware Version: ${version.replace(/^V|-.*$/g, '')}`)
      const deviceVersion = version.replace(/^V|-.*$/g, '') ?? '0.0.0'
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
        .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
        .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
        .updateValue(deviceVersion)
      this.accessory.context.version = deviceVersion
      await this.debugSuccessLog(`version: ${this.accessory.context.version}`)
    }
  }

  async parseStatusWebhook(): Promise<void> {
    await this.debugLog('parseStatusWebhook')
    await this.debugLog(`(scale, temperature, humidity, lightLevel) = Webhook:(${this.webhookContext.scale}, ${convertUnits(this.webhookContext.temperature, this.webhookContext.scale, this.device.hub?.convertUnitTo)}, ${this.webhookContext.humidity}, ${this.webhookContext.lightLevel}), current:(${this.TemperatureSensor?.CurrentTemperature}, ${this.HumiditySensor?.CurrentRelativeHumidity}, ${this.LightSensor?.CurrentAmbientLightLevel})`)
    // Check if the scale is not CELSIUS
    if (this.webhookContext.scale !== 'CELSIUS' && this.device.hub?.convertUnitTo === undefined) {
      await this.warnLog(`received a non-CELSIUS Webhook scale: ${this.webhookContext.scale}, Use the *convertUnitsTo* config under Hub settings, if displaying incorrectly in HomeKit.`)
    }

    // CurrentRelativeHumidity
    if (!this.device.hub?.hide_humidity && this.HumiditySensor?.Service) {
      this.HumiditySensor.CurrentRelativeHumidity = this.webhookContext.humidity
      await this.debugLog(`CurrentRelativeHumidity: ${this.HumiditySensor.CurrentRelativeHumidity}`)
    }

    // CurrentTemperature
    if (!this.device.hub?.hide_temperature && this.TemperatureSensor?.Service) {
      this.TemperatureSensor.CurrentTemperature = convertUnits(this.webhookContext.temperature, this.webhookContext.scale, this.device.hub?.convertUnitTo)
      await this.debugLog(`CurrentTemperature: ${this.TemperatureSensor.CurrentTemperature}`)
    }

    // CurrentAmbientLightLevel
    if (!this.device.hub?.hide_lightsensor && this.LightSensor?.Service) {
      const set_minLux = this.device.blindTilt?.set_minLux ?? 1
      const set_maxLux = this.device.blindTilt?.set_maxLux ?? 6001
      this.LightSensor.CurrentAmbientLightLevel = await this.getLightLevel(this.webhookContext.lightLevel, set_minLux, set_maxLux, 19)
      await this.debugLog(`CurrentAmbientLightLevel: ${this.LightSensor.CurrentAmbientLightLevel}`)
    }
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      await this.errorLog(`refreshStatus enableCloudService: ${this.device.enableCloudService}`)
    } else if (this.BLE) {
      await this.BLERefreshStatus()
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIRefreshStatus()
    } else {
      await this.offlineOff()
      await this.debugWarnLog(`Connection Type: ${this.device.connectionType}, refreshStatus will not happen.`)
    }
  }

  async BLERefreshStatus(): Promise<void> {
    await this.debugLog('BLERefreshStatus')
    const switchbot = await this.switchbotBLE()
    if (switchbot === undefined) {
      await this.BLERefreshConnection(switchbot)
    } else {
      // Start to monitor advertisement packets
      (async () => {
        // Start to monitor advertisement packets
        const serviceData = await this.monitorAdvertisementPackets(switchbot) as hub2ServiceData
        // Update HomeKit
        if (serviceData.model === SwitchBotBLEModel.Hub2 && serviceData.modelName === SwitchBotBLEModelName.Hub2) {
          this.serviceData = serviceData
          await this.BLEparseStatus()
          await this.updateHomeKitCharacteristics()
        } else {
          await this.errorLog(`failed to get serviceData, serviceData: ${serviceData}`)
          await this.BLERefreshConnection(switchbot)
        }
      })()
    }
  }

  async registerPlatformBLE(): Promise<void> {
    await this.debugLog('registerPlatformBLE')
    if (this.config.options?.BLE) {
      await this.debugLog('is listening to Platform BLE.')
      try {
        const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
        this.device.bleMac = formattedDeviceId
        await this.debugLog(`bleMac: ${this.device.bleMac}`)
        this.platform.bleEventHandler[this.device.bleMac] = async (context: hub2ServiceData) => {
          try {
            await this.debugLog(`received BLE: ${JSON.stringify(context)}`)
            this.serviceData = context
            await this.BLEparseStatus()
            await this.updateHomeKitCharacteristics()
          } catch (e: any) {
            await this.errorLog(`failed to handle BLE. Received: ${JSON.stringify(context)} Error: ${e}`)
          }
        }
      } catch (error) {
        await this.errorLog(`failed to format device ID as MAC, Error: ${error}`)
      }
    } else {
      await this.debugLog('is not listening to Platform BLE')
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    await this.debugLog('openAPIRefreshStatus')
    try {
      const { body, statusCode } = await this.deviceRefreshStatus()
      const deviceStatus: any = await body.json()
      await this.debugLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
      if (await this.successfulStatusCodes(statusCode, deviceStatus)) {
        await this.debugSuccessLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        this.deviceStatus = deviceStatus.body
        await this.openAPIparseStatus()
        await this.updateHomeKitCharacteristics()
      } else {
        await this.debugWarnLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        await this.debugWarnLog(statusCode, deviceStatus)
      }
    } catch (e: any) {
      await this.apiError(e)
      await this.errorLog(`failed openAPIRefreshStatus with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
    }
  }

  async registerWebhook(): Promise<void> {
    if (this.device.webhook) {
      await this.debugLog('is listening webhook.')
      this.platform.webhookEventHandler[this.device.deviceId] = async (context: hub2WebhookContext) => {
        try {
          await this.debugLog(`received Webhook: ${JSON.stringify(context)}`)
          this.webhookContext = context
          await this.parseStatusWebhook()
          await this.updateHomeKitCharacteristics()
        } catch (e: any) {
          await this.errorLog(`failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`)
        }
      }
    } else {
      await this.debugLog('is not listening webhook.')
    }
  }

  /**
   * Handle requests to set the value of the "Target Position" characteristic
   */

  async updateHomeKitCharacteristics(): Promise<void> {
    // CurrentRelativeHumidity
    if (!this.device.hub?.hide_humidity && this.HumiditySensor?.Service) {
      await this.updateCharacteristic(this.HumiditySensor.Service, this.hap.Characteristic.CurrentRelativeHumidity, this.HumiditySensor.CurrentRelativeHumidity, 'CurrentRelativeHumidity')
    }
    // CurrentTemperature
    if (!this.device.hub?.hide_temperature && this.TemperatureSensor?.Service) {
      await this.updateCharacteristic(this.TemperatureSensor.Service, this.hap.Characteristic.CurrentTemperature, this.TemperatureSensor.CurrentTemperature, 'CurrentTemperature')
    }
    // CurrentAmbientLightLevel
    if (!this.device.hub?.hide_lightsensor && this.LightSensor?.Service) {
      await this.updateCharacteristic(this.LightSensor.Service, this.hap.Characteristic.CurrentAmbientLightLevel, this.LightSensor.CurrentAmbientLightLevel, 'CurrentAmbientLightLevel')
    }
  }

  async BLERefreshConnection(switchbot: any): Promise<void> {
    await this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`)
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      await this.warnLog('Using OpenAPI Connection to Refresh Status')
      await this.openAPIRefreshStatus()
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      if (!this.device.hub?.hide_temperature && this.TemperatureSensor?.Service) {
        this.TemperatureSensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, this.accessory.context.CurrentTemperature)
      }
      if (!this.device.hub?.hide_humidity && this.HumiditySensor?.Service) {
        this.HumiditySensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity, this.accessory.context.CurrentRelativeHumidity)
      }
      if (!this.device.hub?.hide_lightsensor && this.LightSensor?.Service) {
        this.LightSensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, this.accessory.context.CurrentAmbientLightLevel)
      }
    }
  }

  async apiError(e: any): Promise<void> {
    if (!this.device.hub?.hide_temperature && this.TemperatureSensor?.Service) {
      this.TemperatureSensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, e)
    }
    if (!this.device.hub?.hide_humidity && this.HumiditySensor?.Service) {
      this.HumiditySensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity, e)
    }
    if (!this.device.hub?.hide_lightsensor && this.LightSensor?.Service) {
      this.LightSensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, e)
    }
  }
}
