/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * iosensor.ts: @switchbot/homebridge-switchbot.
 */
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { SwitchBotPlatform } from '../platform.js'
import type { devicesConfig } from '../settings.js'
import type { outdoorMeterServiceData } from '../types/bledevicestatus.js'
import type { device } from '../types/devicelist.js'
import type { outdoorMeterStatus } from '../types/devicestatus.js'
import type { outdoorMeterWebhookContext } from '../types/devicewebhookstatus.js'

import { Units } from 'homebridge'
/*
* For Testing Locally:
* import { SwitchBotBLEModel, SwitchBotBLEModelName } from '/Users/Shared/GitHub/OpenWonderLabs/node-switchbot/dist/index.js';
*/
import { SwitchBotBLEModel, SwitchBotBLEModelName } from 'node-switchbot'
import { interval, skipWhile, Subject } from 'rxjs'

import { convertUnits, formatDeviceIdAsMac, validHumidity } from '../utils.js'
import { deviceBase } from './device.js'

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class IOSensor extends deviceBase {
  // Services
  private Battery: {
    Name: CharacteristicValue
    Service: Service
    BatteryLevel: CharacteristicValue
    StatusLowBattery: CharacteristicValue
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
  deviceStatus!: outdoorMeterStatus

  // Webhook
  webhookContext!: outdoorMeterWebhookContext

  // BLE
  serviceData!: outdoorMeterServiceData

  // Updates
  ioSensorUpdateInProgress!: boolean
  doIOSensorUpdate: Subject<void>

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device)
    // Set category
    accessory.category = this.hap.Categories.SENSOR

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doIOSensorUpdate = new Subject()
    this.ioSensorUpdateInProgress = false

    // Initialize Battery Service
    accessory.context.Battery = accessory.context.Battery ?? {}
    this.Battery = {
      Name: `${accessory.displayName} Battery`,
      Service: accessory.getService(this.hap.Service.Battery) ?? accessory.addService(this.hap.Service.Battery) as Service,
      BatteryLevel: accessory.context.BatteryLevel ?? 100,
      StatusLowBattery: accessory.context.StatusLowBattery ?? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
    }
    accessory.context.Battery = this.Battery as object

    // Initialize Battery Characteristics
    this.Battery.Service.setCharacteristic(this.hap.Characteristic.Name, this.Battery.Name).setCharacteristic(this.hap.Characteristic.ChargingState, this.hap.Characteristic.ChargingState.NOT_CHARGEABLE).getCharacteristic(this.hap.Characteristic.BatteryLevel).onGet(() => {
      return this.Battery.BatteryLevel
    })

    this.Battery.Service.getCharacteristic(this.hap.Characteristic.StatusLowBattery).onGet(() => {
      return this.Battery.StatusLowBattery
    })
    accessory.context.BatteryName = this.Battery.Name

    // InitializeTemperature Sensor Service
    if (device.iosensor?.hide_temperature) {
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
        CurrentTemperature: accessory.context.CurrentTemperature ?? 30,
      }
      accessory.context.TemperatureSensor = this.TemperatureSensor as object

      // Initialize Temperature Sensor Characteristics
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
    if (device.iosensor?.hide_humidity) {
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
        CurrentRelativeHumidity: accessory.context.CurrentRelativeHumidity ?? 50,
      }
      accessory.context.HumiditySensor = this.HumiditySensor as object

      // Initialize Humidity Sensor Characteristics
      this.HumiditySensor.Service.setCharacteristic(this.hap.Characteristic.Name, this.HumiditySensor.Name).getCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity).setProps({
        minStep: 0.1,
      }).onGet(() => {
        return this.HumiditySensor!.CurrentRelativeHumidity
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
      .pipe(skipWhile(() => this.ioSensorUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus()
      })
  }

  async BLEparseStatus(): Promise<void> {
    await this.debugLog('BLEparseStatus')
    await this.debugLog(`(battery, temperature, humidity) = BLE:(${this.serviceData.battery}, ${this.serviceData.celsius}, ${this.serviceData.humidity}), current:(${this.Battery.BatteryLevel}, ${this.TemperatureSensor?.CurrentTemperature}, ${this.HumiditySensor?.CurrentRelativeHumidity})`)

    // BatteryLevel
    this.Battery.BatteryLevel = this.serviceData.battery
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`)

    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`)

    // CurrentRelativeHumidity
    if (!this.device.iosensor?.hide_humidity && this.HumiditySensor?.Service) {
      this.HumiditySensor.CurrentRelativeHumidity = validHumidity(this.serviceData.humidity, 0, 100)
      await this.debugLog(`CurrentRelativeHumidity: ${this.HumiditySensor.CurrentRelativeHumidity}%`)
    }

    // Current Temperature
    if (!this.device.meter?.hide_temperature && this.TemperatureSensor?.Service) {
      const CELSIUS = this.serviceData.celsius < 0 ? 0 : this.serviceData.celsius > 100 ? 100 : this.serviceData.celsius
      this.TemperatureSensor.CurrentTemperature = CELSIUS
      await this.debugLog(`Temperature: ${this.TemperatureSensor.CurrentTemperature}°c`)
    }
  }

  async openAPIparseStatus(): Promise<void> {
    await this.debugLog('openAPIparseStatus')
    await this.debugLog(`(battery, temperature, humidity) = OpenAPI:(${this.deviceStatus.battery}, ${this.deviceStatus.temperature}, ${this.deviceStatus.humidity}), current:(${this.Battery.BatteryLevel}, ${this.TemperatureSensor?.CurrentTemperature}, ${this.HumiditySensor?.CurrentRelativeHumidity})`)

    // BatteryLevel
    this.Battery.BatteryLevel = this.deviceStatus.battery
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`)

    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`)

    // CurrentRelativeHumidity
    if (!this.device.iosensor?.hide_humidity && this.HumiditySensor?.Service) {
      this.HumiditySensor.CurrentRelativeHumidity = this.deviceStatus.humidity
      await this.debugLog(`CurrentRelativeHumidity: ${this.HumiditySensor.CurrentRelativeHumidity}%`)
    }

    // Current Temperature
    if (!this.device.meter?.hide_temperature && this.TemperatureSensor?.Service) {
      this.TemperatureSensor.CurrentTemperature = this.deviceStatus.temperature
      await this.debugLog(`CurrentTemperature: ${this.TemperatureSensor.CurrentTemperature}°c`)
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
    await this.debugLog(`(scale, temperature, humidity) = Webhook:(${this.webhookContext.scale}, ${convertUnits(this.webhookContext.temperature, this.webhookContext.scale, this.device.iosensor?.convertUnitTo)}, ${this.webhookContext.humidity}), current:(${this.TemperatureSensor?.CurrentTemperature}, ${this.HumiditySensor?.CurrentRelativeHumidity})`)

    if (this.webhookContext.scale !== 'CELSIUS' && this.device.iosensor?.convertUnitTo === undefined) {
      await this.warnLog(`received a non-CELSIUS Webhook scale: ${this.webhookContext.scale}, Use the *convertUnitsTo* config under Hub settings, if displaying incorrectly in HomeKit.`)
    }
    // CurrentRelativeHumidity
    if (this.device.iosensor?.hide_humidity && this.HumiditySensor?.Service) {
      this.HumiditySensor.CurrentRelativeHumidity = this.webhookContext.humidity
      await this.debugLog(`CurrentRelativeHumidity: ${this.HumiditySensor.CurrentRelativeHumidity}%`)
    }
    // CurrentTemperature
    if (this.device.iosensor?.hide_temperature && this.TemperatureSensor?.Service) {
      this.TemperatureSensor.CurrentTemperature = convertUnits(this.webhookContext.temperature, this.webhookContext.scale, this.device.iosensor?.convertUnitTo)
      await this.debugLog(`CurrentTemperature: ${this.TemperatureSensor.CurrentTemperature}°c`)
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
        const serviceData = await this.monitorAdvertisementPackets(switchbot) as outdoorMeterServiceData
        // Update HomeKit
        if (serviceData.model === SwitchBotBLEModel.OutdoorMeter && serviceData.modelName === SwitchBotBLEModelName.OutdoorMeter) {
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
        this.platform.bleEventHandler[this.device.bleMac] = async (context: outdoorMeterServiceData) => {
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

  async registerWebhook() {
    if (this.device.webhook) {
      await this.debugLog('is listening webhook.')
      this.platform.webhookEventHandler[this.device.deviceId] = async (context: outdoorMeterWebhookContext) => {
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
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    // CurrentRelativeHumidity
    if (!this.device.iosensor?.hide_humidity && this.HumiditySensor?.Service) {
      await this.updateCharacteristic(this.HumiditySensor.Service, this.hap.Characteristic.CurrentRelativeHumidity, this.HumiditySensor.CurrentRelativeHumidity, 'CurrentRelativeHumidity')
    }
    // CurrentTemperature
    if (!this.device.iosensor?.hide_temperature && this.TemperatureSensor?.Service) {
      await this.updateCharacteristic(this.TemperatureSensor.Service, this.hap.Characteristic.CurrentTemperature, this.TemperatureSensor.CurrentTemperature, 'CurrentTemperature')
    }
    // BatteryLevel
    await this.updateCharacteristic(this.Battery.Service, this.hap.Characteristic.BatteryLevel, this.Battery.BatteryLevel, 'BatteryLevel')
    // StatusLowBattery
    await this.updateCharacteristic(this.Battery.Service, this.hap.Characteristic.StatusLowBattery, this.Battery.StatusLowBattery, 'StatusLowBattery')
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
      if (!this.device.iosensor?.hide_humidity && this.HumiditySensor?.Service) {
        this.HumiditySensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity, 50)
      }
      if (!this.device.iosensor?.hide_temperature && this.TemperatureSensor?.Service) {
        this.TemperatureSensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, 30)
      }
    }
  }

  async apiError(e: any): Promise<void> {
    if (!this.device.iosensor?.hide_humidity && this.HumiditySensor?.Service) {
      this.HumiditySensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity, e)
    }
    if (!this.device.iosensor?.hide_temperature && this.TemperatureSensor?.Service) {
      this.TemperatureSensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, e)
    }
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e)
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e)
  }
}
