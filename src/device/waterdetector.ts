/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * waterdetector.ts: @switchbot/homebridge-switchbot.
 */
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { SwitchBotPlatform } from '../platform.js'
import type { devicesConfig } from '../settings.js'
import type { waterLeakDetectorServiceData } from '../types/bledevicestatus.js'
import type { device } from '../types/devicelist.js'
import type { waterLeakDetectorStatus } from '../types/devicestatus.js'
import type { waterLeakDetectorWebhookContext } from '../types/devicewebhookstatus.js'

/*
* For Testing Locally:
* import { SwitchBotBLEModel, SwitchBotBLEModelName } from '/Users/Shared/GitHub/OpenWonderLabs/node-switchbot/dist/index.js';
*/
import { SwitchBotBLEModel, SwitchBotBLEModelName } from 'node-switchbot'
import { interval, skipWhile, Subject } from 'rxjs'

import { formatDeviceIdAsMac } from '../utils.js'
import { deviceBase } from './device.js'

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class WaterDetector extends deviceBase {
  // Services
  private Battery: {
    Name: CharacteristicValue
    Service: Service
    BatteryLevel: CharacteristicValue
    StatusLowBattery: CharacteristicValue
    ChargingState: CharacteristicValue
  }

  private LeakSensor?: {
    Name: CharacteristicValue
    Service: Service
    StatusActive: CharacteristicValue
    LeakDetected: CharacteristicValue
  }

  // OpenAPI
  deviceStatus!: waterLeakDetectorStatus

  // Webhook
  webhookContext!: waterLeakDetectorWebhookContext

  // BLE
  serviceData!: waterLeakDetectorServiceData

  // Updates
  WaterDetectorUpdateInProgress!: boolean
  doWaterDetectorUpdate: Subject<void>

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device)
    // Set category
    accessory.category = this.hap.Categories.SENSOR

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doWaterDetectorUpdate = new Subject()
    this.WaterDetectorUpdateInProgress = false

    // Initialize Battery Service
    accessory.context.Battery = accessory.context.Battery ?? {}
    this.Battery = {
      Name: `${accessory.displayName} Battery`,
      Service: accessory.getService(this.hap.Service.Battery) ?? accessory.addService(this.hap.Service.Battery) as Service,
      BatteryLevel: accessory.context.BatteryLevel ?? 100,
      StatusLowBattery: accessory.context.StatusLowBattery ?? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      ChargingState: accessory.context.ChargingState ?? this.hap.Characteristic.ChargingState.NOT_CHARGEABLE,
    }
    accessory.context.Battery = this.Battery as object

    // Initialize Battery Characteristic
    this.Battery.Service.setCharacteristic(this.hap.Characteristic.Name, this.Battery.Name).setCharacteristic(this.hap.Characteristic.ChargingState, this.hap.Characteristic.ChargingState.NOT_CHARGEABLE).getCharacteristic(this.hap.Characteristic.BatteryLevel).onGet(() => {
      return this.Battery.StatusLowBattery
    })

    this.Battery.Service.getCharacteristic(this.hap.Characteristic.StatusLowBattery).onGet(() => {
      return this.Battery.StatusLowBattery
    })

    // Initialize Leak Sensor Service
    if (device.waterdetector?.hide_leak) {
      if (this.LeakSensor) {
        this.debugLog('Removing Leak Sensor Service')
        this.LeakSensor.Service = this.accessory.getService(this.hap.Service.LeakSensor) as Service
        accessory.removeService(this.LeakSensor.Service)
      } else {
        this.debugLog('Leak Sensor Service Not Found')
      }
    } else {
      accessory.context.LeakSensor = accessory.context.LeakSensor ?? {}
      this.LeakSensor = {
        Name: `${accessory.displayName} Leak Sensor`,
        Service: accessory.getService(this.hap.Service.LeakSensor) ?? this.accessory.addService(this.hap.Service.LeakSensor) as Service,
        StatusActive: accessory.context.StatusActive ?? false,
        LeakDetected: accessory.context.LeakDetected ?? this.hap.Characteristic.LeakDetected.LEAK_NOT_DETECTED,
      }
      accessory.context.LeakSensor = this.LeakSensor as object

      // Initialize LeakSensor Characteristic
      this.LeakSensor!.Service.setCharacteristic(this.hap.Characteristic.Name, this.LeakSensor.Name).setCharacteristic(this.hap.Characteristic.StatusActive, true).getCharacteristic(this.hap.Characteristic.LeakDetected).onGet(() => {
        return this.LeakSensor!.LeakDetected
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
      .pipe(skipWhile(() => this.WaterDetectorUpdateInProgress))
      .subscribe(async () => {
        await this.debugLog(`update interval: ${this.deviceRefreshRate * 1000} seconds`)
        await this.refreshStatus()
      })
  }

  async BLEparseStatus(): Promise<void> {
    await this.debugLog('BLEparseStatus')
    await this.debugLog(`(state, status, battery) = BLE: (${this.serviceData.state}, ${this.serviceData.status}, ${this.serviceData.battery}), current:(${this.LeakSensor?.LeakDetected}, ${this.Battery.BatteryLevel})`)

    // LeakSensor
    if (!this.device.waterdetector?.hide_leak && this.LeakSensor?.Service) {
      // StatusActive
      this.LeakSensor.StatusActive = this.serviceData.state
      await this.debugLog(`StatusActive: ${this.LeakSensor.StatusActive}`)

      // LeakDetected
      if (this.device.waterdetector?.dry) {
        this.LeakSensor.LeakDetected = this.serviceData.status === 0 ? 1 : 0
        this.debugLog(`LeakDetected: ${this.LeakSensor.LeakDetected}`)
      } else {
        this.LeakSensor.LeakDetected = this.serviceData.status
        this.debugLog(`LeakDetected: ${this.LeakSensor.LeakDetected}`)
      }
    }
    // BatteryLevel
    this.Battery.BatteryLevel = this.serviceData.battery
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`)
    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`)
  }

  async openAPIparseStatus(): Promise<void> {
    await this.debugLog('openAPIparseStatus')
    await this.debugLog(`(status, battery) = OpenAPI: (${this.deviceStatus.status}, ${this.deviceStatus.battery}), current:(${this.LeakSensor?.LeakDetected}, ${this.Battery.BatteryLevel})`)

    // LeakSensor
    if (!this.device.waterdetector?.hide_leak && this.LeakSensor?.Service) {
      // StatusActive
      this.LeakSensor.StatusActive = this.deviceStatus.battery !== 0
      await this.debugLog(`StatusActive: ${this.LeakSensor.StatusActive}`)

      // LeakDetected
      if (this.device.waterdetector?.dry) {
        this.LeakSensor.LeakDetected = this.deviceStatus.status === 0 ? 1 : 0
        this.debugLog(`LeakDetected: ${this.LeakSensor.LeakDetected}`)
      } else {
        this.LeakSensor.LeakDetected = this.deviceStatus.status
        this.debugLog(`LeakDetected: ${this.LeakSensor.LeakDetected}`)
      }
    }

    // BatteryLevel
    this.Battery.BatteryLevel = this.deviceStatus.battery
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`)

    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`)

    // FirmwareVersion
    if (this.deviceStatus.version) {
      const version = this.deviceStatus.version.toString()
      await this.debugLog(`FirmwareVersion: ${version.replace(/^V|-.*$/g, '')}`)
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
    await this.debugLog(`(detectionState, battery) = Webhook: (${this.webhookContext.detectionState}, ${this.webhookContext.battery}), current:(${this.LeakSensor?.LeakDetected}, ${this.Battery.BatteryLevel})`)

    // LeakSensor
    if (!this.device.waterdetector?.hide_leak && this.LeakSensor?.Service) {
      // StatusActive
      this.LeakSensor.StatusActive = !!this.webhookContext.detectionState
      await this.debugLog(`StatusActive: ${this.LeakSensor.StatusActive}`)

      // LeakDetected
      if (this.device.waterdetector?.dry) {
        this.LeakSensor.LeakDetected = this.webhookContext.detectionState === 0 ? 1 : 0
        this.debugLog(`LeakDetected: ${this.LeakSensor.LeakDetected}`)
      } else {
        this.LeakSensor.LeakDetected = this.webhookContext.detectionState
        await this.debugLog(`LeakDetected: ${this.LeakSensor.LeakDetected}`)
      }
    }

    // BatteryLevel
    this.Battery.BatteryLevel = this.webhookContext.battery
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`)

    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`)
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
        const serviceData = await this.monitorAdvertisementPackets(switchbot) as waterLeakDetectorServiceData
        // Update HomeKit
        if (serviceData.model === SwitchBotBLEModel.Unknown && serviceData.modelName === SwitchBotBLEModelName.Unknown) {
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
        this.platform.bleEventHandler[this.device.bleMac] = async (context: waterLeakDetectorServiceData) => {
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
      this.platform.webhookEventHandler[this.device.deviceId] = async (context: waterLeakDetectorWebhookContext) => {
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
    if (!this.device.waterdetector?.hide_leak && this.LeakSensor?.Service) {
      // StatusActive
      await this.updateCharacteristic(this.LeakSensor.Service, this.hap.Characteristic.StatusActive, this.LeakSensor.StatusActive, 'StatusActive')
      // LeakDetected
      await this.updateCharacteristic(this.LeakSensor.Service, this.hap.Characteristic.LeakDetected, this.LeakSensor.LeakDetected, 'LeakDetected')
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
      if (!this.device.waterdetector?.hide_leak && this.LeakSensor?.Service) {
        this.LeakSensor.Service.updateCharacteristic(this.hap.Characteristic.StatusActive, false)
        this.LeakSensor.Service.updateCharacteristic(this.hap.Characteristic.LeakDetected, this.hap.Characteristic.LeakDetected.LEAK_NOT_DETECTED)
      }
    }
  }

  async apiError(e: any): Promise<void> {
    if (!this.device.waterdetector?.hide_leak && this.LeakSensor?.Service) {
      this.LeakSensor.Service.updateCharacteristic(this.hap.Characteristic.StatusActive, e)
      this.LeakSensor.Service.updateCharacteristic(this.hap.Characteristic.LeakDetected, e)
    }
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e)
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e)
  }
}
