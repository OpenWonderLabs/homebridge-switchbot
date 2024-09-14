/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * contact.ts: @switchbot/homebridge-switchbot.
 */
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { SwitchBotPlatform } from '../platform.js'
import type { devicesConfig } from '../settings.js'
import type { contactSensorServiceData } from '../types/bledevicestatus.js'
import type { device } from '../types/devicelist.js'
import type { contactSensorStatus } from '../types/devicestatus.js'
import type { contactSensorWebhookContext } from '../types/devicewebhookstatus.js'

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
export class Contact extends deviceBase {
  // Services
  private ContactSensor: {
    Name: CharacteristicValue
    Service: Service
    ContactSensorState: CharacteristicValue
  }

  private Battery: {
    Name: CharacteristicValue
    Service: Service
    BatteryLevel: CharacteristicValue
    StatusLowBattery: CharacteristicValue
  }

  private MotionSensor?: {
    Name: CharacteristicValue
    Service: Service
    MotionDetected: CharacteristicValue
  }

  private LightSensor?: {
    Name: CharacteristicValue
    Service: Service
    CurrentAmbientLightLevel: CharacteristicValue
  }

  // OpenAPI
  deviceStatus!: contactSensorStatus

  // Webhook
  webhookContext!: contactSensorWebhookContext

  // BLE
  serviceData!: contactSensorServiceData

  // Updates
  contactUpdateInProgress!: boolean
  doContactUpdate!: Subject<void>

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device)
    // Set category
    accessory.category = this.hap.Categories.SENSOR

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doContactUpdate = new Subject()
    this.contactUpdateInProgress = false

    // Initialize Contact Sensor Service
    accessory.context.ContactSensor = accessory.context.ContactSensor ?? {}
    this.ContactSensor = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.ContactSensor) ?? accessory.addService(this.hap.Service.ContactSensor) as Service,
      ContactSensorState: accessory.context.ContactSensorState ?? this.hap.Characteristic.ContactSensorState.CONTACT_DETECTED,
    }
    accessory.context.ContactSensor = this.ContactSensor as object

    // Initialize ContactSensor Characteristics
    this.ContactSensor.Service.setCharacteristic(this.hap.Characteristic.Name, this.ContactSensor.Name).setCharacteristic(this.hap.Characteristic.StatusActive, true).getCharacteristic(this.hap.Characteristic.ContactSensorState).onGet(() => {
      return this.ContactSensor.ContactSensorState
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

    // Initialize Motion Sensor Service
    if (this.device.contact?.hide_motionsensor) {
      if (this.MotionSensor) {
        this.debugLog('Removing Motion Sensor Service')
        this.MotionSensor.Service = accessory.getService(this.hap.Service.MotionSensor) as Service
        accessory.removeService(this.MotionSensor.Service)
      }
    } else {
      accessory.context.MotionSensor = accessory.context.MotionSensor ?? {}
      this.MotionSensor = {
        Name: `${accessory.displayName} Motion Sensor`,
        Service: accessory.getService(this.hap.Service.MotionSensor) ?? accessory.addService(this.hap.Service.MotionSensor) as Service,
        MotionDetected: accessory.context.MotionDetected ?? false,
      }
      accessory.context.MotionSensor = this.MotionSensor as object

      // Motion Sensor Characteristics
      this.MotionSensor.Service.setCharacteristic(this.hap.Characteristic.Name, this.MotionSensor.Name).setCharacteristic(this.hap.Characteristic.StatusActive, true).getCharacteristic(this.hap.Characteristic.MotionDetected).onGet(() => {
        return this.MotionSensor!.MotionDetected
      })
    }

    // Initialize Light Sensor Service
    if (device.contact?.hide_lightsensor) {
      if (this.LightSensor) {
        this.debugLog('Removing Light Sensor Service')
        this.LightSensor.Service = accessory.getService(this.hap.Service.LightSensor) as Service
        accessory.removeService(this.LightSensor.Service)
      }
    } else {
      accessory.context.LightSensor = accessory.context.LightSensor ?? {}
      this.LightSensor = {
        Name: `${accessory.displayName} Light Sensor`,
        Service: accessory.getService(this.hap.Service.LightSensor) ?? accessory.addService(this.hap.Service.LightSensor) as Service,
        CurrentAmbientLightLevel: accessory.context.CurrentAmbientLightLevel ?? 0.0001,
      }
      accessory.context.LightSensor = this.LightSensor as object

      // Light Sensor Characteristics
      this.LightSensor.Service.setCharacteristic(this.hap.Characteristic.Name, this.LightSensor.Name).setCharacteristic(this.hap.Characteristic.StatusActive, true).getCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel).onGet(() => {
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
      .pipe(skipWhile(() => this.contactUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus()
      })
  }

  async BLEparseStatus(): Promise<void> {
    await this.debugLog('BLEparseStatus')
    // ContactSensorState
    this.ContactSensor.ContactSensorState = this.serviceData.doorState === 'open'
      ? this.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
      : this.hap.Characteristic.ContactSensorState.CONTACT_DETECTED
    await this.debugLog(`ContactSensorState: ${this.ContactSensor.ContactSensorState}`)

    // MotionDetected
    if (!this.device.contact?.hide_motionsensor && this.MotionSensor?.Service) {
      this.MotionSensor.MotionDetected = this.serviceData.movement
      await this.debugLog(`MotionDetected: ${this.MotionSensor.MotionDetected}`)
    }
    // CurrentAmbientLightLevel
    if (!this.device.contact?.hide_lightsensor && this.LightSensor?.Service) {
      const set_minLux = this.device.blindTilt?.set_minLux ?? 1
      const set_maxLux = this.device.blindTilt?.set_maxLux ?? 6001
      const lightLevel = this.serviceData.lightLevel === 'bright' ? set_maxLux : set_minLux
      this.LightSensor.CurrentAmbientLightLevel = await this.getLightLevel(lightLevel, set_minLux, set_maxLux, 2)
      await this.debugLog(`LightLevel: ${this.serviceData.lightLevel}, CurrentAmbientLightLevel: ${this.LightSensor.CurrentAmbientLightLevel}`)
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
    // Contact State
    this.ContactSensor.ContactSensorState = this.deviceStatus.openState === 'open'
      ? this.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
      : this.hap.Characteristic.ContactSensorState.CONTACT_DETECTED
    await this.debugLog(`ContactSensorState: ${this.ContactSensor.ContactSensorState}`)

    // MotionDetected
    if (!this.device.contact?.hide_motionsensor && this.MotionSensor?.Service) {
      this.MotionSensor.MotionDetected = this.deviceStatus.moveDetected
      await this.debugLog(`MotionDetected: ${this.MotionSensor.MotionDetected}`)
    }
    // Light Level
    if (!this.device.contact?.hide_lightsensor && this.LightSensor?.Service) {
      const set_minLux = this.device.blindTilt?.set_minLux ?? 1
      const set_maxLux = this.device.blindTilt?.set_maxLux ?? 6001
      const lightLevel = this.deviceStatus.brightness === 'bright' ? set_maxLux : set_minLux
      this.LightSensor.CurrentAmbientLightLevel = await this.getLightLevel(lightLevel, set_minLux, set_maxLux, 2)
      await this.debugLog(`LightLevel: ${this.deviceStatus.brightness}, CurrentAmbientLightLevel: ${this.LightSensor.CurrentAmbientLightLevel}`)
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
      await this.debugLog(`Firmware Version: ${version.replace(/^V|-.*$/g, '')}`)
      const deviceVersion = version.replace(/^V|-.*$/g, '') ?? '0.0.0'
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
        .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
        .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
        .updateValue(deviceVersion)
      this.accessory.context.version = deviceVersion
      await this.debugLog(`version: ${this.accessory.context.version}`)
    }
  }

  async parseStatusWebhook(): Promise<void> {
    await this.debugLog('parseStatusWebhook')
    await this.debugLog(`(detectionState, brightness, openState) = Webhook:(${this.webhookContext.detectionState}, ${this.webhookContext.brightness}, ${this.webhookContext.openState}), current:(${this.MotionSensor?.MotionDetected}, ${this.LightSensor?.CurrentAmbientLightLevel}, ${this.ContactSensor.ContactSensorState})`)
    // ContactSensorState
    this.ContactSensor.ContactSensorState = this.webhookContext.openState === 'open' ? 1 : 0
    await this.debugLog(`ContactSensorState: ${this.ContactSensor.ContactSensorState}`)
    if (!this.device.contact?.hide_motionsensor && this.MotionSensor?.Service) {
      // MotionDetected
      this.MotionSensor.MotionDetected = this.webhookContext.detectionState === 'DETECTED'
      await this.debugLog(`MotionDetected: ${this.MotionSensor.MotionDetected}`)
    }
    if (!this.device.contact?.hide_lightsensor && this.LightSensor?.Service) {
      const set_minLux = this.device.blindTilt?.set_minLux ?? 1
      const set_maxLux = this.device.blindTilt?.set_maxLux ?? 6001
      const lightLevel = this.webhookContext.brightness === 'bright' ? set_maxLux : set_minLux
      this.LightSensor.CurrentAmbientLightLevel = await this.getLightLevel(lightLevel, set_minLux, set_maxLux, 2)
      await this.debugLog(`LightLevel: ${this.webhookContext.brightness}, CurrentAmbientLightLevel: ${this.LightSensor.CurrentAmbientLightLevel}`)
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
        const serviceData = await this.monitorAdvertisementPackets(switchbot) as contactSensorServiceData
        // Update HomeKit
        if (serviceData.model === SwitchBotBLEModel.ContactSensor && serviceData.modelName === SwitchBotBLEModelName.ContactSensor) {
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
        this.platform.bleEventHandler[this.device.bleMac] = async (context: contactSensorServiceData) => {
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
      this.platform.webhookEventHandler[this.device.deviceId] = async (context: contactSensorWebhookContext) => {
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
    // ContactSensorState
    await this.updateCharacteristic(this.ContactSensor.Service, this.hap.Characteristic.ContactSensorState, this.ContactSensor.ContactSensorState, 'ContactSensorState')
    // MotionDetected
    if (!this.device.contact?.hide_motionsensor && this.MotionSensor?.Service) {
      await this.updateCharacteristic(this.MotionSensor.Service, this.hap.Characteristic.MotionDetected, this.MotionSensor.MotionDetected, 'MotionDetected')
    }
    // CurrentAmbientLightLevel
    if (!this.device.contact?.hide_lightsensor && this.LightSensor?.Service) {
      await this.updateCharacteristic(this.LightSensor.Service, this.hap.Characteristic.CurrentAmbientLightLevel, this.LightSensor.CurrentAmbientLightLevel, 'CurrentAmbientLightLevel')
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
      this.ContactSensor.Service.updateCharacteristic(this.hap.Characteristic.ContactSensorState, this.hap.Characteristic.ContactSensorState.CONTACT_DETECTED)
      if (!this.device.contact?.hide_motionsensor && this.MotionSensor?.Service) {
        this.MotionSensor.Service.updateCharacteristic(this.hap.Characteristic.MotionDetected, false)
      }
      if (!this.device.contact?.hide_lightsensor && this.LightSensor?.Service) {
        this.LightSensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, 100)
      }
    }
  }

  async apiError(e: any): Promise<void> {
    this.ContactSensor.Service.updateCharacteristic(this.hap.Characteristic.ContactSensorState, e)
    this.ContactSensor.Service.updateCharacteristic(this.hap.Characteristic.StatusActive, e)
    if (!this.device.contact?.hide_motionsensor && this.MotionSensor?.Service) {
      this.MotionSensor.Service.updateCharacteristic(this.hap.Characteristic.MotionDetected, e)
      this.MotionSensor.Service.updateCharacteristic(this.hap.Characteristic.StatusActive, e)
    }
    if (!this.device.contact?.hide_lightsensor && this.LightSensor?.Service) {
      this.LightSensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, e)
      this.LightSensor.Service.updateCharacteristic(this.hap.Characteristic.StatusActive, e)
    }
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e)
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e)
  }
}
