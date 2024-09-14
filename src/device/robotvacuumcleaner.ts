/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * robotvacuumcleaner.ts: @switchbot/homebridge-switchbot.
 */
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { SwitchBotPlatform } from '../platform.js'
import type { devicesConfig } from '../settings.js'
import type { robotVacuumCleanerServiceData } from '../types/bledevicestatus.js'
import type { device } from '../types/devicelist.js'
import type { floorCleaningRobotS10Status, robotVacuumCleanerS1PlusStatus, robotVacuumCleanerS1Status } from '../types/devicestatus.js'
import type {
  floorCleaningRobotS10WebhookContext,
  robotVacuumCleanerS1PlusWebhookContext,
  robotVacuumCleanerS1WebhookContext,
} from '../types/devicewebhookstatus.js'

/*
* For Testing Locally:
* import { SwitchBotBLEModel, SwitchBotBLEModelName } from '/Users/Shared/GitHub/OpenWonderLabs/node-switchbot/dist/index.js';
*/
import { SwitchBotBLEModel, SwitchBotBLEModelName } from 'node-switchbot'
import { debounceTime, interval, skipWhile, Subject, take, tap } from 'rxjs'

import { formatDeviceIdAsMac } from '../utils.js'
import { deviceBase } from './device.js'

export class RobotVacuumCleaner extends deviceBase {
  // Services
  private LightBulb: {
    Name: CharacteristicValue
    Service: Service
    On: CharacteristicValue
    Brightness: CharacteristicValue
  }

  private Battery: {
    Name: CharacteristicValue
    Service: Service
    BatteryLevel: CharacteristicValue
    StatusLowBattery: CharacteristicValue
    ChargingState: CharacteristicValue
  }

  // OpenAPI
  deviceStatus!: robotVacuumCleanerS1Status | robotVacuumCleanerS1PlusStatus | floorCleaningRobotS10Status

  // Webhook
  webhookContext!: robotVacuumCleanerS1WebhookContext | robotVacuumCleanerS1PlusWebhookContext | floorCleaningRobotS10WebhookContext

  // BLE
  serviceData!: robotVacuumCleanerServiceData

  // Updates
  robotVacuumCleanerUpdateInProgress!: boolean
  doRobotVacuumCleanerUpdate!: Subject<void>

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device)
    // Set category
    accessory.category = this.hap.Categories.OTHER

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doRobotVacuumCleanerUpdate = new Subject()
    this.robotVacuumCleanerUpdateInProgress = false

    // Initialize Lightbulb Service
    accessory.context.LightBulb = accessory.context.LightBulb ?? {}
    this.LightBulb = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.Lightbulb) ?? accessory.addService(this.hap.Service.Lightbulb) as Service,
      On: accessory.context.On ?? false,
      Brightness: accessory.context.Brightness ?? 0,
    }
    accessory.context.LightBulb = this.LightBulb as object

    // Initialize LightBulb Characteristics
    this.LightBulb.Service.setCharacteristic(this.hap.Characteristic.Name, this.LightBulb.Name).getCharacteristic(this.hap.Characteristic.On).onGet(() => {
      return this.LightBulb.On
    }).onSet(this.OnSet.bind(this))

    // Initialize LightBulb Brightness Characteristic
    this.LightBulb.Service.getCharacteristic(this.hap.Characteristic.Brightness).setProps({
      minStep: 25,
      minValue: 0,
      maxValue: 100,
      validValues: [0, 25, 50, 75, 100],
      validValueRanges: [0, 100],
    }).onGet(() => {
      return this.LightBulb.Brightness
    }).onSet(this.BrightnessSet.bind(this))

    // Initialize Battery Service
    accessory.context.Battery = accessory.context.Battery ?? {}
    this.Battery = {
      Name: `${accessory.displayName} Battery`,
      Service: accessory.getService(this.hap.Service.Battery) ?? accessory.addService(this.hap.Service.Battery) as Service,
      BatteryLevel: accessory.context.BatteryLevel ?? 100,
      StatusLowBattery: accessory.context.StatusLowBattery ?? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      ChargingState: accessory.context.ChargingState ?? this.hap.Characteristic.ChargingState.NOT_CHARGING,
    }
    accessory.context.Battery = this.Battery as object

    // Initialize Battery Characteristics
    this.Battery.Service.setCharacteristic(this.hap.Characteristic.Name, this.Battery.Name).getCharacteristic(this.hap.Characteristic.BatteryLevel).onGet(() => {
      return this.Battery.BatteryLevel
    })

    this.Battery.Service.getCharacteristic(this.hap.Characteristic.StatusLowBattery).onGet(() => {
      return this.Battery.StatusLowBattery
    })

    this.Battery.Service.getCharacteristic(this.hap.Characteristic.ChargingState).onGet(() => {
      return this.Battery.ChargingState
    })

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
      .pipe(skipWhile(() => this.robotVacuumCleanerUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus()
      })

    // Watch for Plug change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doRobotVacuumCleanerUpdate
      .pipe(
        tap(() => {
          this.robotVacuumCleanerUpdateInProgress = true
        }),
        debounceTime(this.devicePushRate * 1000),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges()
        } catch (e: any) {
          await this.apiError(e)
          await this.errorLog(`failed pushChanges with ${device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
        }
        this.robotVacuumCleanerUpdateInProgress = false
      })
  }

  async BLEparseStatus(): Promise<void> {
    await this.debugLog('BLEparseStatus')
    await this.debugLog(`(state, battery) = BLE: (${this.serviceData.state}, ${this.serviceData.battery}), current: (${this.LightBulb.On}, ${this.Battery.BatteryLevel})`)

    // On
    this.LightBulb.On = !!['InDustCollecting', 'Clearing'].includes(this.deviceStatus.workingStatus)
    await this.debugLog(`On: ${this.LightBulb.On}`)

    // BatteryLevel
    this.Battery.BatteryLevel = this.serviceData.battery
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`)

    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`)
  }

  async openAPIparseStatus() {
    await this.debugLog('openAPIparseStatus')
    await this.debugLog(`(onlineStatus, battery, workingStatus) = API: (${this.deviceStatus.onlineStatus}, ${this.deviceStatus.battery}, ${this.deviceStatus.workingStatus}), current: (${this.LightBulb.On}, ${this.Battery.BatteryLevel}, ${this.Battery.ChargingState})`)

    // On
    this.LightBulb.On = this.deviceStatus.onlineStatus === 'online'
    await this.debugLog(`On: ${this.LightBulb.On}`)

    // BatteryLevel
    this.Battery.BatteryLevel = this.deviceStatus.battery
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`)

    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`)

    // ChargingState
    this.Battery.ChargingState = this.deviceStatus.workingStatus === 'Charging'
      ? this.hap.Characteristic.ChargingState.CHARGING
      : this.hap.Characteristic.ChargingState.NOT_CHARGING
    await this.debugLog(`ChargingState: ${this.Battery.ChargingState}`)

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
    await this.debugLog(`(onlineStatus, battery, workingStatus) = Webhook: (${this.webhookContext.onlineStatus}, ${this.webhookContext.battery}, ${this.webhookContext.workingStatus}), current: (${this.LightBulb.On}, ${this.Battery.BatteryLevel}, ${this.Battery.ChargingState})`)

    // On
    this.LightBulb.On = this.webhookContext.onlineStatus === 'online'
    await this.debugLog(`On: ${this.LightBulb.On}`)

    // BatteryLevel
    this.Battery.BatteryLevel = this.webhookContext.battery
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`)

    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`)

    // ChargingState
    this.Battery.ChargingState = this.webhookContext.workingStatus === 'Charging'
      ? this.hap.Characteristic.ChargingState.CHARGING
      : this.hap.Characteristic.ChargingState.NOT_CHARGING
    await this.debugLog(`ChargingState: ${this.Battery.ChargingState}`)
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
        const serviceData = await this.monitorAdvertisementPackets(switchbot) as unknown as robotVacuumCleanerServiceData
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
        this.platform.bleEventHandler[this.device.bleMac] = async (context: robotVacuumCleanerServiceData) => {
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
      this.platform.webhookEventHandler[this.device.deviceId] = async (context: robotVacuumCleanerS1WebhookContext | robotVacuumCleanerS1PlusWebhookContext | floorCleaningRobotS10WebhookContext) => {
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
   * Pushes the requested changes to the SwitchBot API
   * deviceType                commandType   Command      parameter          Description
   * Robot Vacuum Cleaner S1   "command"     "start"      "default"    =     start vacuuming
   * Robot Vacuum Cleaner S1   "command"     "stop"       "default"    =     stop vacuuming
   * Robot Vacuum Cleaner S1   "command"     "dock"       "default"   =      return to charging dock
   * Robot Vacuum Cleaner S1   "command"     "PowLevel"   "{0-3}"     =      set suction power level: 0 (Quiet), 1 (Standard), 2 (Strong), 3 (MAX)
   */
  async pushChanges(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      await this.errorLog(`pushChanges enableCloudService: ${this.device.enableCloudService}`)
    } else if (this.BLE) {
      await this.BLEpushChanges()
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges()
    } else {
      await this.offlineOff()
      await this.debugWarnLog(`Connection Type: ${this.device.connectionType}, pushChanges will not happen.`)
    }
    // Refresh the status from the API
    interval(15000)
      .pipe(skipWhile(() => this.robotVacuumCleanerUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus()
      })
  }

  async BLEpushChanges(): Promise<void> {
    await this.debugLog('BLEpushChanges')
    if (this.LightBulb.On !== this.accessory.context.On) {
      const switchbot = await this.platform.connectBLE(this.accessory, this.device)
      try {
        const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
        this.device.bleMac = formattedDeviceId
        await this.debugLog(`bleMac: ${this.device.bleMac}`)
        if (switchbot !== false) {
          switchbot
            .discover({ model: this.device.bleModel, id: this.device.bleMac })
            .then(async (device_list: any) => {
              await this.infoLog(`On: ${this.LightBulb.On}`)
              return await this.retryBLE({
                max: await this.maxRetryBLE(),
                fn: async () => {
                  if (this.LightBulb.On) {
                    return await device_list[0].turnOn({ id: this.device.bleMac })
                  } else {
                    return await device_list[0].turnOff({ id: this.device.bleMac })
                  }
                },
              })
            })
            .then(async () => {
              await this.successLog(`On: ${this.LightBulb.On} sent over SwitchBot BLE,  sent successfully`)
              await this.updateHomeKitCharacteristics()
            })
            .catch(async (e: any) => {
              await this.apiError(e)
              await this.errorLog(`failed BLEpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
              await this.BLEPushConnection()
            })
        } else {
          await this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`)
          await this.BLEPushConnection()
        }
      } catch (error) {
        await this.errorLog(`failed to format device ID as MAC, Error: ${error}`)
      }
    } else {
      await this.debugLog(`No changes (BLEpushChanges), On: ${this.LightBulb.On}, OnCached: ${this.accessory.context.On}`)
    }
  }

  async openAPIpushChanges() {
    await this.debugLog('openAPIpushChanges')
    if (this.LightBulb.On !== this.accessory.context.On) {
      const command = this.LightBulb.On ? 'start' : 'dock'
      const bodyChange = JSON.stringify({
        command: `${command}`,
        parameter: 'default',
        commandType: 'command',
      })
      await this.debugLog(`SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`)
      try {
        const { body, statusCode } = await this.pushChangeRequest(bodyChange)
        const deviceStatus: any = await body.json()
        await this.debugLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        if (await this.successfulStatusCodes(statusCode, deviceStatus)) {
          await this.debugSuccessLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
          await this.updateHomeKitCharacteristics()
        } else {
          await this.statusCode(statusCode)
          await this.statusCode(deviceStatus.statusCode)
        }
      } catch (e: any) {
        await this.apiError(e)
        await this.errorLog(`failed openAPIpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
      }
    } else {
      await this.debugLog(`No changes (openAPIpushChanges), On: ${this.LightBulb.On}, OnCached: ${this.accessory.context.On}`)
    }
  }

  async openAPIpushBrightnessChanges() {
    await this.debugLog('openAPIpushBrightnessChanges')
    if (this.LightBulb.Brightness !== this.accessory.context.Brightness) {
      const command = this.LightBulb.Brightness === 0 ? 'dock' : 'PowLevel'
      const parameter = this.LightBulb.Brightness === 25
        ? '0'
        : this.LightBulb.Brightness === 50
          ? '1'
          : this.LightBulb.Brightness === 75
            ? '2'
            : this.LightBulb.Brightness === 100 ? '3' : 'default'
      const bodyChange = JSON.stringify({
        command: `${command}`,
        parameter: `${parameter}`,
        commandType: 'command',
      })
      await this.debugLog(`SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`)
      try {
        const { body, statusCode } = await this.pushChangeRequest(bodyChange)
        const deviceStatus: any = await body.json()
        await this.debugLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        if (await this.successfulStatusCodes(statusCode, deviceStatus)) {
          await this.debugSuccessLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
          await this.updateHomeKitCharacteristics()
        } else {
          await this.statusCode(statusCode)
          await this.statusCode(deviceStatus.statusCode)
        }
      } catch (e: any) {
        await this.apiError(e)
        await this.errorLog(`failed openAPIpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
      }
    } else {
      await this.debugLog(`No changes (openAPIpushBrightnessChanges), Brightness: ${this.LightBulb.Brightness}, BrightnessCached: ${this.accessory.context.Brightness}`)
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
    this.doRobotVacuumCleanerUpdate.next()
  }

  /**
   * Handle requests to set the value of the "Brightness" characteristic
   */
  async BrightnessSet(value: CharacteristicValue): Promise<void> {
    if (this.LightBulb.On && (this.LightBulb.Brightness !== this.accessory.context.Brightness)) {
      await this.infoLog(`Set Brightness: ${value}`)
    } else {
      if (this.LightBulb.On) {
        this.debugLog(`No Changes, Brightness: ${value}`)
      } else {
        this.debugLog(`Brightness: ${value}, On: ${this.LightBulb.On}`)
      }
    }

    this.LightBulb.Brightness = value
    this.doRobotVacuumCleanerUpdate.next()
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    // On
    await this.updateCharacteristic(this.LightBulb.Service, this.hap.Characteristic.On, this.LightBulb.On, 'On')
    // Brightness
    await this.updateCharacteristic(this.LightBulb.Service, this.hap.Characteristic.Brightness, this.LightBulb.Brightness, 'Brightness')
    // BatteryLevel
    await this.updateCharacteristic(this.Battery.Service, this.hap.Characteristic.BatteryLevel, this.Battery.BatteryLevel, 'BatteryLevel')
    // StatusLowBattery
    await this.updateCharacteristic(this.Battery.Service, this.hap.Characteristic.StatusLowBattery, this.Battery.StatusLowBattery, 'StatusLowBattery')
    // ChargingState
    await this.updateCharacteristic(this.Battery.Service, this.hap.Characteristic.ChargingState, this.Battery.ChargingState, 'ChargingState')
  }

  async BLEPushConnection() {
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      await this.warnLog('Using OpenAPI Connection to Push Changes')
      await this.openAPIpushChanges()
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
      this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.On, false)
    }
  }

  async apiError(e: any): Promise<void> {
    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.On, e)
  }
}
