/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * presence.ts: @switchbot/homebridge-switchbot.
 */
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'
import type { device, presenceSensorServiceData, presenceSensorStatus, presenceSensorWebhookContext, SwitchBotBLE } from 'node-switchbot'
/*
* For Testing Locally:
* import { SwitchBotBLEModel, SwitchBotBLEModelName } from '/Users/Shared/GitHub/OpenWonderLabs/node-switchbot/dist/index.js';
*/
import { SwitchBotBLEModel, SwitchBotBLEModelName } from 'node-switchbot'
import { interval, skipWhile, Subject } from 'rxjs'

import type { SwitchBotPlatform } from '../platform.js'
import type { devicesConfig, presenceConfig } from '../settings.js'
import { formatDeviceIdAsMac } from '../utils.js'
import { deviceBase } from './device.js'

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Presence extends deviceBase {
  // Services
  private Battery: {
    Name: CharacteristicValue
    Service: Service
    BatteryLevel: CharacteristicValue
    StatusLowBattery: CharacteristicValue
  }

  private OccupancySensor: {
    Name: CharacteristicValue
    Service: Service
    OccupancyDetected: CharacteristicValue
  }

  private LightSensor?: {
    Name: CharacteristicValue
    Service: Service
    CurrentAmbientLightLevel: CharacteristicValue
  }

  // OpenAPI
  deviceStatus!: presenceSensorStatus

  // Webhook
  webhookContext!: presenceSensorWebhookContext

  // BLE
  serviceData!: presenceSensorServiceData

  // Updates
  occcupancyUbpdateInProgress!: boolean
  doOccupancyUpdate!: Subject<void>

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device)
    // Set category
    accessory.category = this.hap.Categories.SENSOR

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doOccupancyUpdate = new Subject()
    this.occcupancyUbpdateInProgress = false

    // Initialize Occupancy Sensor property
    accessory.context.OccupancySensor = accessory.context.OccupancySensor ?? {}
    this.OccupancySensor = {
      Name: `${accessory.displayName} Occupancy Sensor`,
      Service: accessory.getService(this.hap.Service.OccupancySensor) ?? accessory.addService(this.hap.Service.OccupancySensor) as Service,
      OccupancyDetected: accessory.context.OccupancyDetected ?? false,
    }
    accessory.context.OccupancySensor = this.OccupancySensor as object

    // Initialize Occupancy Sensor Characteristics
    this.OccupancySensor.Service.setCharacteristic(this.hap.Characteristic.Name, this.OccupancySensor.Name).setCharacteristic(this.hap.Characteristic.StatusActive, true).getCharacteristic(this.hap.Characteristic.OccupancyDetected).onGet(() => {
      return this.OccupancySensor.OccupancyDetected
    })

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

    this.Battery.Service.setCharacteristic(this.hap.Characteristic.StatusLowBattery, this.Battery.StatusLowBattery).getCharacteristic(this.hap.Characteristic.StatusLowBattery).onGet(() => {
      return this.Battery.StatusLowBattery
    })

    // Initialize Light Sensor Service
    if ((device as unknown as presenceConfig).hide_lightsensor) {
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

      // Initialize LightSensor Characteristics
      this.LightSensor.Service.setCharacteristic(this.hap.Characteristic.Name, this.LightSensor.Name).setCharacteristic(this.hap.Characteristic.StatusActive, true)
    };

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
      .pipe(skipWhile(() => this.occcupancyUbpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus()
      })
  }

  async BLEparseStatus(): Promise<void> {
    this.debugLog('BLEparseStatus')
    this.debugLog(`(moveDetected) = BLE: (${this.serviceData.motionDetected}), current: (${this.OccupancySensor.OccupancyDetected})`)

    // Movement
    this.OccupancySensor.OccupancyDetected = this.serviceData.motionDetected
    this.debugLog(`OccupancyDetected: ${this.OccupancySensor.OccupancyDetected}`)

    // CurrentAmbientLightLevel
    if (!(this.device as unknown as presenceConfig).hide_lightsensor && this.LightSensor?.Service) {
      const set_minLux = (this.device as unknown as presenceConfig).set_minLux ?? 1
      const set_maxLux = (this.device as unknown as presenceConfig).set_maxLux ?? 6001
      const lightLevel = this.serviceData.lightLevel ? set_maxLux : set_minLux
      this.LightSensor.CurrentAmbientLightLevel = this.getLightLevel(lightLevel, set_minLux, set_maxLux, 2)
      this.debugLog(`LightLevel: ${this.serviceData.lightLevel}, CurrentAmbientLightLevel: ${this.LightSensor.CurrentAmbientLightLevel}`)
    }
    // Battery Info
    if ('battery' in this.serviceData) {
      // BatteryLevel
      this.Battery.BatteryLevel = Number(this.serviceData.battery)
      this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`)
      // StatusLowBattery
      this.Battery.StatusLowBattery = Number(this.Battery.BatteryLevel) < 10
        ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
        : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
      this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`)
    }
  }

  async openAPIparseStatus(): Promise<void> {
    this.debugLog('openAPIparseStatus')
    this.debugLog(`(moveDetected) = OpenAPI: (${this.deviceStatus.Detected}), current: (${this.OccupancySensor.OccupancyDetected})`)

    // Occupancy State
    this.OccupancySensor.OccupancyDetected = this.deviceStatus.Detected
    this.debugLog(`OccupancyDetected: ${this.OccupancySensor.OccupancyDetected}`)

    // CurrentAmbientLightLevel
    if (!(this.device as unknown as presenceConfig).hide_lightsensor && this.LightSensor?.Service) {
      const set_minLux = (this.device as unknown as presenceConfig).set_minLux ?? 1
      const set_maxLux = (this.device as unknown as presenceConfig).set_maxLux ?? 6001
      const lightLevel = this.deviceStatus.lightLevel ? set_maxLux : set_minLux
      this.LightSensor.CurrentAmbientLightLevel = this.getLightLevel(lightLevel, set_minLux, set_maxLux, 2)
      this.debugLog(`LightLevel: ${this.deviceStatus.lightLevel}, CurrentAmbientLightLevel: ${this.LightSensor.CurrentAmbientLightLevel}`)
    }
    // BatteryLevel
    this.Battery.BatteryLevel = this.deviceStatus.battery
    this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`)

    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`)

    // FirmwareVersion
    if (this.deviceStatus.version) {
      const version = String(this.deviceStatus.version)
      this.debugLog(`Firmware Version: ${version.replace(/^V|-.*$/g, '')}`)
      const deviceVersion = version.replace(/^V|-.*$/g, '') ?? '0.0.0'
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
        .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
        .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
        .updateValue(deviceVersion)
      this.accessory.context.version = deviceVersion
      this.debugLog(`version: ${this.accessory.context.version}`)
    }
  }

  async parseStatusWebhook(): Promise<void> {
    this.debugLog('parseStatusWebhook')
    this.debugLog(`(detectionState) = Webhook: (${this.webhookContext.detectionState}), current: (${this.OccupancySensor.OccupancyDetected})`)

    // OccupancyDetected
    this.OccupancySensor.OccupancyDetected = this.webhookContext.detectionState === 'DETECTED'
    this.debugLog(`OccupancyDetected: ${this.OccupancySensor.OccupancyDetected}`)
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
        const serviceData = await this.monitorAdvertisementPackets(switchBotBLE) as presenceSensorServiceData
        // Update HomeKit
        if (serviceData.model === SwitchBotBLEModel.PresenceSensor && serviceData.modelName === SwitchBotBLEModelName.PresenceSensor) {
          this.serviceData = serviceData
          if (serviceData !== undefined || serviceData !== null) {
            await this.BLEparseStatus()
            await this.updateHomeKitCharacteristics()
          } else {
            this.errorLog(`serviceData is either undefined or null, serviceData: ${JSON.stringify(serviceData)}`)
            await this.BLERefreshConnection(switchBotBLE)
          }
        } else {
          this.errorLog(`failed to get serviceData, serviceData: ${JSON.stringify(serviceData)}`)
          await this.BLERefreshConnection(switchBotBLE)
        }
      })()
    }
  }

  async registerPlatformBLE(): Promise<void> {
    this.debugLog('registerPlatformBLE')
    if (this.config.options?.BLE && !this.device.disablePlatformBLE) {
      this.debugLog('is listening to Platform BLE.')
      try {
        const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
        this.device.bleMac = formattedDeviceId
        this.debugLog(`bleMac: ${this.device.bleMac}`)
        this.platform.bleEventHandler[this.device.bleMac] = async (context: presenceSensorServiceData) => {
          try {
            this.serviceData = context
            if (context !== undefined || context !== null) {
              this.debugLog(`received BLE: ${JSON.stringify(context)}`)
              await this.BLEparseStatus()
              await this.updateHomeKitCharacteristics()
            } else {
              this.errorLog(`context is either undefined or null, context: ${JSON.stringify(context)}`)
              await this.BLERefreshConnection(context)
            }
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
      const response = await this.deviceRefreshStatus()
      const deviceStatus: any = response.body
      this.debugLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
      if (await this.successfulStatusCodes(deviceStatus)) {
        this.debugSuccessLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        this.deviceStatus = deviceStatus.body
        await this.openAPIparseStatus()
        await this.updateHomeKitCharacteristics()
      } else {
        this.debugWarnLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
      }
    } catch (e: any) {
      await this.apiError(e)
      this.errorLog(`failed openAPIRefreshStatus with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
    }
  }

  async registerWebhook() {
    if (this.device.webhook) {
      this.debugLog('is listening webhook.')
      this.platform.webhookEventHandler[this.device.deviceId] = async (context: presenceSensorWebhookContext) => {
        try {
          this.webhookContext = context
          if (context !== undefined || context !== null) {
            this.debugLog(`received Webhook: ${JSON.stringify(context)}`)
            await this.parseStatusWebhook()
            await this.updateHomeKitCharacteristics()
          } else {
            this.errorLog(`context is either undefined or null, context: ${JSON.stringify(context)}`)
          }
        } catch (e: any) {
          this.errorLog(`failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e.message ?? e}`)
        }
      }
    } else {
      this.debugLog('is not listening webhook.')
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    // OccupancyDetected
    await this.updateCharacteristic(this.OccupancySensor.Service, this.hap.Characteristic.OccupancyDetected, this.OccupancySensor.OccupancyDetected, 'OccupancyDetected')
    // BatteryLevel
    await this.updateCharacteristic(this.Battery.Service, this.hap.Characteristic.BatteryLevel, this.Battery.BatteryLevel, 'BatteryLevel')
    // StatusLowBattery
    await this.updateCharacteristic(this.Battery.Service, this.hap.Characteristic.StatusLowBattery, this.Battery.StatusLowBattery, 'StatusLowBattery')
    // CurrentAmbientLightLevel
    if (!(this.device as unknown as presenceConfig).hide_lightsensor && this.LightSensor?.Service) {
      await this.updateCharacteristic(this.LightSensor.Service, this.hap.Characteristic.CurrentAmbientLightLevel, this.LightSensor.CurrentAmbientLightLevel, 'CurrentAmbientLightLevel')
    }
  }

  async BLERefreshConnection(switchbot: SwitchBotBLE): Promise<void> {
    this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`)
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog('Using OpenAPI Connection to Refresh Status')
      await this.openAPIRefreshStatus()
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      this.OccupancySensor.Service.updateCharacteristic(this.hap.Characteristic.OccupancyDetected, false)
    }
  }

  async apiError(e: any): Promise<void> {
    this.OccupancySensor.Service.updateCharacteristic(this.hap.Characteristic.OccupancyDetected, e)
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e)
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e)
    if (!(this.device as unknown as presenceConfig).hide_lightsensor && this.LightSensor?.Service) {
      this.LightSensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, e)
    }
  }
}
