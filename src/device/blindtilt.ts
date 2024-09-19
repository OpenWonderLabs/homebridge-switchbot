/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * blindtilt.ts: @switchbot/homebridge-switchbot.
 */
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { SwitchBotPlatform } from '../platform.js'
import type { devicesConfig } from '../settings.js'
import type { blindTiltServiceData } from '../types/bledevicestatus.js'
import type { device } from '../types/devicelist.js'
import type { blindTiltStatus } from '../types/devicestatus.js'
import type { blindTiltWebhookContext } from '../types/devicewebhookstatus.js'

/*
* For Testing Locally:
* import { SwitchBotBLEModel, SwitchBotBLEModelName } from '/Users/Shared/GitHub/OpenWonderLabs/node-switchbot/dist/index.js';
*/
import { SwitchBotBLEModel, SwitchBotBLEModelName } from 'node-switchbot'
import { debounceTime, interval, skipWhile, Subject, take, tap } from 'rxjs'

import { BlindTiltMappingMode, formatDeviceIdAsMac } from '../utils.js'
import { deviceBase } from './device.js'

export class BlindTilt extends deviceBase {
  // Services
  private WindowCovering: {
    Name: CharacteristicValue
    Service: Service
    PositionState: CharacteristicValue
    TargetPosition: CharacteristicValue
    CurrentPosition: CharacteristicValue
    TargetHorizontalTiltAngle: CharacteristicValue
    CurrentHorizontalTiltAngle: CharacteristicValue
  }

  private Battery: {
    Name: CharacteristicValue
    Service: Service
    BatteryLevel: CharacteristicValue
    StatusLowBattery: CharacteristicValue
    ChargingState?: CharacteristicValue
  }

  private LightSensor?: {
    Name: CharacteristicValue
    Service: Service
    CurrentAmbientLightLevel?: CharacteristicValue
  }

  private OpenModeSwitch?: {
    Name: CharacteristicValue
    Service: Service
    On: CharacteristicValue
  }

  private CloseModeSwitch?: {
    Name: CharacteristicValue
    Service: Service
    On: CharacteristicValue
  }

  // OpenAPI
  deviceStatus!: blindTiltStatus
  mappingMode: BlindTiltMappingMode = BlindTiltMappingMode.OnlyUp

  // Webhook
  webhookContext!: blindTiltWebhookContext

  // BLE
  serviceData!: blindTiltServiceData

  // Target
  setNewTarget!: boolean
  setNewTargetTimer!: NodeJS.Timeout

  // Updates
  blindTiltMoving: boolean
  blindTiltUpdateInProgress: boolean
  doBlindTiltUpdate: Subject<void>

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device)
    // Set category
    accessory.category = this.hap.Categories.WINDOW_COVERING

    // default placeholders
    this.mappingMode = (device.blindTilt?.mode as BlindTiltMappingMode) ?? BlindTiltMappingMode.OnlyUp
    this.debugLog(`Mapping mode: ${this.mappingMode}`)

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doBlindTiltUpdate = new Subject()
    this.blindTiltMoving = false
    this.blindTiltUpdateInProgress = false
    this.setNewTarget = false

    // Initialize WindowCovering Service
    accessory.context.WindowCovering = accessory.context.WindowCovering ?? {}
    this.WindowCovering = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.WindowCovering) ?? accessory.addService(this.hap.Service.WindowCovering) as Service,
      PositionState: accessory.context.PositionState ?? this.hap.Characteristic.PositionState.STOPPED,
      TargetPosition: accessory.context.TargetPosition ?? 100,
      CurrentPosition: accessory.context.CurrentPosition ?? 100,
      TargetHorizontalTiltAngle: accessory.context.TargetHorizontalTiltAngle ?? 90,
      CurrentHorizontalTiltAngle: accessory.context.CurrentHorizontalTiltAngle ?? 90,
    }
    accessory.context.WindowCovering = this.WindowCovering as object

    // Initialize WindowCovering Characteristics
    this.WindowCovering.Service.setCharacteristic(this.hap.Characteristic.Name, this.WindowCovering.Name).getCharacteristic(this.hap.Characteristic.TargetPosition).setProps({
      minStep: device.blindTilt?.set_minStep ?? 1,
      minValue: 0,
      maxValue: 100,
      validValueRanges: [0, 100],
    }).onGet(() => {
      return this.WindowCovering.TargetPosition
    }).onSet(this.TargetPositionSet.bind(this))

    // Initialize WindowCovering CurrentPosition Characteristic
    this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.CurrentPosition).setProps({
      minStep: device.blindTilt?.set_minStep ?? 1,
      minValue: 0,
      maxValue: 100,
      validValueRanges: [0, 100],
    }).onGet(() => {
      return this.WindowCovering.CurrentPosition ?? 0
    })

    // Initialize WindowCovering TargetHorizontalTiltAngle Characteristic
    this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.TargetHorizontalTiltAngle).setProps({
      minStep: 180,
      minValue: -90,
      maxValue: 90,
      validValues: [-90, 90],
    }).onGet(() => {
      return this.WindowCovering.TargetHorizontalTiltAngle
    }).onSet(this.TargetHorizontalTiltAngleSet.bind(this))

    // Initialize WindowCovering CurrentHorizontalTiltAngle Characteristic
    this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.CurrentHorizontalTiltAngle).setProps({
      minStep: 180,
      minValue: -90,
      maxValue: 90,
      validValues: [-90, 90],
    }).onGet(() => {
      return this.WindowCovering.CurrentHorizontalTiltAngle ?? 0
    })

    // Initialize Battery Service
    accessory.context.Battery = accessory.context.Battery ?? {}
    this.Battery = {
      Name: `${accessory.displayName} Battery`,
      Service: accessory.getService(this.hap.Service.Battery) ?? accessory.addService(this.hap.Service.Battery) as Service,
      BatteryLevel: accessory.context.BatteryLevel ?? 100,
      StatusLowBattery: this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      ChargingState: accessory.context.ChargingState ?? this.hap.Characteristic.ChargingState.NOT_CHARGING,
    }
    accessory.context.Battery = this.Battery as object

    // Initialize Battery Name Characteristic
    this.Battery.Service.setCharacteristic(this.hap.Characteristic.Name, this.Battery.Name).setCharacteristic(this.hap.Characteristic.ChargingState, this.hap.Characteristic.ChargingState.NOT_CHARGEABLE)

    // Initialize LightSensor Service
    if (device.blindTilt?.hide_lightsensor) {
      if (this.LightSensor?.Service) {
        this.debugLog('Removing Light Sensor Service')
        this.LightSensor.Service = accessory.getService(this.hap.Service.LightSensor) as Service
        accessory.removeService(this.LightSensor.Service)
        accessory.context.LightSensor = {}
      } else {
        this.debugLog('Light Sensor Service is already removed')
      }
    } else {
      accessory.context.LightSensor = accessory.context.LightSensor ?? {}
      this.LightSensor = {
        Name: `${accessory.displayName} Light Sensor`,
        Service: accessory.getService(this.hap.Service.LightSensor) ?? accessory.addService(this.hap.Service.LightSensor) as Service,
        CurrentAmbientLightLevel: accessory.context.CurrentAmbientLightLevel ?? 0.0001,
      }
      accessory.context.LightSensor = this.LightSensor as object

      // Initialize LightSensor Characteristics
      this.LightSensor.Service.setCharacteristic(this.hap.Characteristic.Name, this.LightSensor.Name).setCharacteristic(this.hap.Characteristic.StatusActive, true).getCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel).onGet(() => {
        return this.LightSensor?.CurrentAmbientLightLevel ?? 0.0001
      })
    }

    // Initialize Open Mode Switch Service
    if (!device.blindTilt?.silentModeSwitch) {
      if (this.OpenModeSwitch?.Service) {
        this.debugLog('Removing Open Mode Switch Service')
        this.OpenModeSwitch.Service = this.accessory.getService(this.hap.Service.Switch) as Service
        accessory.removeService(this.OpenModeSwitch.Service)
        accessory.context.OpenModeSwitch = {}
      }
    } else {
      accessory.context.OpenModeSwitch = accessory.context.OpenModeSwitch ?? {}
      this.OpenModeSwitch = {
        Name: `${accessory.displayName} Silent Open Mode`,
        Service: accessory.getService(this.hap.Service.Switch) ?? accessory.addService(this.hap.Service.Switch) as Service,
        On: accessory.context.OpenModeSwitch.On ?? false,
      }
      accessory.context.OpenModeSwitch = this.OpenModeSwitch as object

      // Initialize Open Mode Switch Service
      this.OpenModeSwitch.Service.setCharacteristic(this.hap.Characteristic.Name, this.OpenModeSwitch.Name).getCharacteristic(this.hap.Characteristic.On).onGet(() => {
        return this.OpenModeSwitch?.On ?? false
      })

      this.OpenModeSwitch.Service.getCharacteristic(this.hap.Characteristic.On).onSet(this.OpenModeSwitchSet.bind(this))
    }

    // Initialize Close Mode Switch Service
    if (!device.blindTilt?.silentModeSwitch) {
      if (this.CloseModeSwitch?.Service) {
        this.debugLog('Removing Close Mode Switch Service')
        this.CloseModeSwitch.Service = this.accessory.getService(this.hap.Service.Switch) as Service
        accessory.removeService(this.CloseModeSwitch.Service)
        accessory.context.CloseModeSwitch = {}
      }
    } else {
      accessory.context.CloseModeSwitch = accessory.context.CloseModeSwitch ?? {}
      this.CloseModeSwitch = {
        Name: `${accessory.displayName} Silent Close Mode`,
        Service: accessory.getService(this.hap.Service.Switch) ?? accessory.addService(this.hap.Service.Switch) as Service,
        On: accessory.context.CloseModeSwitch.On ?? false,
      }
      accessory.context.CloseModeSwitch = this.CloseModeSwitch as object

      // Initialize Close Mode Switch Service
      this.CloseModeSwitch.Service.setCharacteristic(this.hap.Characteristic.Name, this.CloseModeSwitch.Name).getCharacteristic(this.hap.Characteristic.On).onGet(() => {
        return this.CloseModeSwitch?.On ?? false
      })

      this.CloseModeSwitch.Service.getCharacteristic(this.hap.Characteristic.On).onSet(this.CloseModeSwitchSet.bind(this))
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
      .pipe(skipWhile(() => this.blindTiltUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus()
      })

    // update slide progress
    interval(this.deviceUpdateRate * 1000)
      .pipe(skipWhile(() => !this.blindTiltMoving))
      .subscribe(async () => {
        if (this.WindowCovering.PositionState === this.hap.Characteristic.PositionState.STOPPED) {
          return
        }
        this.debugLog(`Refresh Status When Moving, PositionState: ${this.WindowCovering.PositionState}`)
        await this.refreshStatus()
      })

    // Watch for BlindTilt change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doBlindTiltUpdate
      .pipe(
        tap(() => {
          this.blindTiltUpdateInProgress = true
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
        this.blindTiltUpdateInProgress = false
      })
  }

  /**
   * Parse the device status from the SwitchBotBLE API
   */
  async BLEparseStatus(): Promise<void> {
    await this.debugLog('BLEparseStatus')
    await this.debugLog(`(direction, slidePosition, battery, version) = BLE:(${this.serviceData.tilt}, ${this.serviceData.tilt}, ${this.serviceData.battery}, ${this.accessory.context.version}), current:(${this.WindowCovering.CurrentHorizontalTiltAngle}, ${this.WindowCovering.CurrentPosition}, ${this.Battery.BatteryLevel}, ${this.accessory.context.version})`)

    // CurrentPosition
    this.WindowCovering.CurrentPosition = 100 - Number(this.serviceData.tilt)
    await this.setMinMax()
    await this.debugLog(`CurrentPosition ${this.WindowCovering.CurrentPosition}`)
    if (this.setNewTarget) {
      await this.infoLog('Checking Status ...')
    }
    if (this.setNewTarget && this.serviceData.inMotion) {
      this.blindTiltMoving = true
      await this.setMinMax()
      if (Number(this.WindowCovering.TargetPosition) > this.WindowCovering.CurrentPosition) {
        await this.debugLog(`Closing, CurrentPosition: ${this.WindowCovering.CurrentPosition}`)
        this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.INCREASING
        this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState)
        await this.debugLog(`Increasing, PositionState: ${this.WindowCovering.PositionState}`)
      } else if (Number(this.WindowCovering.TargetPosition) < this.WindowCovering.CurrentPosition) {
        await this.debugLog(`Opening, CurrentPosition: ${this.WindowCovering.CurrentPosition}`)
        this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.DECREASING
        this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState)
        await this.debugLog(`Decreasing, PositionState: ${this.WindowCovering.PositionState}`)
      } else {
        await this.debugLog(`Standby, CurrentPosition: ${this.WindowCovering.CurrentPosition}`)
        this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.STOPPED
        this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState)
        await this.debugLog('Stopped, PositionState', this.WindowCovering.PositionState)
      }
    } else {
      this.blindTiltMoving = false
      await this.debugLog(`Standby, CurrentPosition: ${this.WindowCovering.CurrentPosition}`)
      this.WindowCovering.TargetPosition = this.WindowCovering.CurrentPosition
      this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.STOPPED
      await this.debugLog(`Stopped, PositionState: ${this.WindowCovering.PositionState}`)
    }
    await this.debugLog(`CurrentPosition: ${this.WindowCovering.CurrentPosition}, TargetPosition: ${this.WindowCovering.TargetPosition}, PositionState: ${this.WindowCovering.PositionState}`)

    // CurrentAmbientLightLevel
    if (!this.device.blindTilt?.hide_lightsensor && this.LightSensor?.Service) {
      const set_minLux = this.device.blindTilt?.set_minLux ?? 1
      const set_maxLux = this.device.blindTilt?.set_maxLux ?? 6001
      const spaceBetweenLevels = 9

      await this.getLightLevel(this.serviceData.lightLevel, set_minLux, set_maxLux, spaceBetweenLevels)
      await this.debugLog(`LightLevel: ${this.serviceData.lightLevel}, CurrentAmbientLightLevel: ${this.LightSensor!.CurrentAmbientLightLevel}`)
    }

    // BatteryLevel
    this.Battery.BatteryLevel = this.serviceData.battery
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`)

    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`)
  };

  /**
   * Parse the device status from the SwitchBot OpenAPI
   */
  async openAPIparseStatus(): Promise<void> {
    await this.debugLog('openAPIparseStatus')
    await this.debugLog(`(direction, slidePosition, battery, version) = OpenAPI:(${this.deviceStatus.direction}, ${this.deviceStatus.slidePosition}, ${this.deviceStatus.battery}, ${this.deviceStatus.version}), current:(${this.WindowCovering.CurrentHorizontalTiltAngle}, ${this.WindowCovering.CurrentPosition}, ${this.Battery.BatteryLevel}, ${this.accessory.context.version})`)

    // CurrentPosition
    await this.getCurrentPosttionDirection(this.deviceStatus.direction, this.deviceStatus.slidePosition)

    if (!this.device.blindTilt?.hide_lightsensor && this.LightSensor?.Service) {
      const set_minLux = this.device.blindTilt?.set_minLux ?? 1
      const set_maxLux = this.device.blindTilt?.set_maxLux ?? 6001
      const lightLevel = this.deviceStatus.lightLevel === 'bright' ? set_maxLux : set_minLux
      this.LightSensor.CurrentAmbientLightLevel = await this.getLightLevel(lightLevel, set_minLux, set_maxLux, 2)
      await this.debugLog(`LightLevel: ${this.deviceStatus.lightLevel}, CurrentAmbientLightLevel: ${this.LightSensor.CurrentAmbientLightLevel}`)
    }

    // BatteryLevel
    this.Battery.BatteryLevel = this.deviceStatus.battery
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`)

    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`)

    // Firmware Version
    const version = this.deviceStatus.version.toString()
    await this.debugLog(`Firmware Version: ${version.replace(/^V|-.*$/g, '')}`)
    let deviceVersion: string
    if (version?.includes('.') === false) {
      const replace = version?.replace(/^V|-.*$/g, '')
      const match = replace?.match(/./g)
      const blindTiltVersion = match?.join('.') ?? '0.0.0'
      deviceVersion = blindTiltVersion
    } else {
      deviceVersion = version.replace(/^V|-.*$/g, '') ?? '0.0.0'
    }
    this.accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
      .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
      .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
      .updateValue(deviceVersion)
    this.accessory.context.version = deviceVersion
    await this.debugLog(`version: ${this.accessory.context.version}`)
  }

  async parseStatusWebhook(): Promise<void> {
    await this.debugLog('parseStatusWebhook')
    await this.debugLog(`(slidePosition, battery, version) = Webhook:(${this.webhookContext.direction}, ${this.webhookContext.slidePosition}, ${this.webhookContext.battery}, ${this.webhookContext.version}, current:(${this.WindowCovering.CurrentHorizontalTiltAngle}, ${this.WindowCovering.CurrentPosition}, ${this.Battery.BatteryLevel}, ${this.accessory.context.version})`)
    // CurrentPosition and CurrentHorizontalTiltAngle
    await this.getCurrentPosttionDirection(this.webhookContext.direction, this.webhookContext.slidePosition)
    // BatteryLevel
    this.Battery.BatteryLevel = this.webhookContext.battery
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`)
    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`)
    // Firmware Version
    const deviceVersion = this.webhookContext.version.replace(/^V|-.*$/g, '') ?? '0.0.0'
    this.accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
      .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
      .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
      .updateValue(deviceVersion)
    this.accessory.context.version = deviceVersion
    await this.debugSuccessLog(`version: ${this.accessory.context.version}`)
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
        const serviceData = await this.monitorAdvertisementPackets(switchbot) as blindTiltServiceData
        // Update HomeKit
        if (serviceData.model === SwitchBotBLEModel.BlindTilt && serviceData.modelName === SwitchBotBLEModelName.BlindTilt) {
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
        this.platform.bleEventHandler[this.device.bleMac] = async (context: blindTiltServiceData) => {
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
      this.platform.webhookEventHandler[this.device.deviceId] = async (context: blindTiltWebhookContext) => {
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
      .pipe(skipWhile(() => this.blindTiltUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus()
      })
  }

  async BLEpushChanges(): Promise<void> {
    await this.debugLog('BLEpushChanges')
    if (this.WindowCovering.TargetPosition !== this.WindowCovering.CurrentPosition) {
      await this.debugLog(`BLEpushChanges On: ${this.WindowCovering.TargetPosition} OnCached: ${this.WindowCovering.CurrentPosition}`)
      const switchbot = await this.platform.connectBLE(this.accessory, this.device)
      try {
        const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
        this.device.bleMac = formattedDeviceId
        await this.debugLog(`bleMac: ${this.device.bleMac}`)
        const { setPositionMode, Mode }: { setPositionMode: number, Mode: string } = await this.setPerformance()
        await this.debugLog(`Mode: ${Mode}, setPositionMode: ${setPositionMode}`)
        if (switchbot !== false) {
          switchbot
            .discover({ model: this.device.bleModel, quick: true, id: this.device.bleMac })
            .then(async (device_list: any) => {
              return await this.retryBLE({
                max: await this.maxRetryBLE(),
                fn: async () => {
                  return await device_list[0].runToPos(100 - Number(this.WindowCovering.TargetPosition), setPositionMode)
                },
              })
            })
            .then(async () => {
              await this.successLog(`TargetPostion: ${this.WindowCovering.TargetPosition} sent over SwitchBot BLE,  sent successfully`)
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
      await this.debugLog(`No changes (BLEpushChanges), TargetPosition: ${this.WindowCovering.TargetPosition}, CurrentPosition: ${this.WindowCovering.CurrentPosition}`)
    }
  }

  async openAPIpushChanges(): Promise<void> {
    await this.debugLog('openAPIpushChanges')
    const hasDifferentAndRelevantHorizontalTiltAngle
      = this.mappingMode === BlindTiltMappingMode.UseTiltForDirection
      && this.WindowCovering.TargetHorizontalTiltAngle !== this.WindowCovering.CurrentHorizontalTiltAngle
    if (this.WindowCovering.TargetPosition !== this.WindowCovering.CurrentPosition
      || hasDifferentAndRelevantHorizontalTiltAngle || this.device.disableCaching) {
      const [direction, position] = this.mapHomekitValuesToDeviceValues(Number(this.WindowCovering.TargetPosition), Number(this.WindowCovering.TargetHorizontalTiltAngle))
      const { Mode, setPositionMode }: { setPositionMode: number, Mode: string } = await this.setPerformance()
      await this.debugLog(`Pushing ${this.WindowCovering.TargetPosition} (device = ${direction};${position})`)
      await this.debugLog(`Mode: ${Mode}, setPositionMode: ${setPositionMode}`)
      let bodyChange: string
      if (position === 100) {
        bodyChange = JSON.stringify({
          command: 'fullyOpen',
          parameter: 'default',
          commandType: 'command',
        })
      } else if (position === 0) {
        bodyChange = JSON.stringify({
          command: direction === 'up' ? 'closeUp' : 'closeDown',
          parameter: 'default',
          commandType: 'command',
        })
      } else {
        bodyChange = JSON.stringify({
          command: 'setPosition',
          parameter: `${direction};${position}`,
          commandType: 'command',
        })
      }
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
      await this.debugLog(`No changes (openAPIpushChanges), TargetPosition: ${this.WindowCovering.TargetPosition}, CurrentPosition: ${this.WindowCovering.CurrentPosition}`)
      await this.debugLog(`No changes (openAPIpushChanges), TargetHorizontalTiltAngle: ${this.WindowCovering.TargetHorizontalTiltAngle}, CurrentHorizontalTiltAngle: ${this.WindowCovering.CurrentHorizontalTiltAngle}`)
    }
  }

  /**
   * Handle requests to set the value of the "Target Horizontal Tilt" characteristic
   */
  async TargetHorizontalTiltAngleSet(value: CharacteristicValue): Promise<void> {
    if (this.WindowCovering.TargetHorizontalTiltAngle !== this.accessory.context.TargetHorizontalTiltAngle) {
      await this.debugLog(`Set TargetHorizontalTiltAngle: ${value}`)
    } else {
      await this.debugLog(`No changes, TargetHorizontalTiltAngle: ${value}`)
    }

    // value = value < 0 ? -90 : 90;
    this.WindowCovering.TargetHorizontalTiltAngle = value
    await this.mqtt('TargetHorizontalTiltAngle', this.WindowCovering.TargetHorizontalTiltAngle)
    await this.startUpdatingBlindTiltIfNeeded()
  }

  /**
   * Handle requests to set the value of the "Target Position" characteristic
   */
  async TargetPositionSet(value: CharacteristicValue): Promise<void> {
    if (this.WindowCovering.TargetPosition !== this.accessory.context.TargetPosition) {
      await this.debugLog(`Set TargetPosition: ${value}`)
    } else {
      await this.debugLog(`No changes, TargetPosition: ${value}`)
    }

    this.WindowCovering.TargetPosition = value
    await this.mqtt('TargetPosition', this.WindowCovering.TargetPosition)
    await this.startUpdatingBlindTiltIfNeeded()
  }

  async startUpdatingBlindTiltIfNeeded(): Promise<void> {
    await this.setMinMax()
    await this.debugLog('setMinMax')
    if (this.WindowCovering.TargetPosition > this.WindowCovering.CurrentPosition
      || this.WindowCovering.TargetHorizontalTiltAngle !== this.WindowCovering.CurrentHorizontalTiltAngle) {
      this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.INCREASING
      this.setNewTarget = true
      await this.debugLog(`value: ${this.WindowCovering.CurrentPosition}, CurrentPosition: ${this.WindowCovering.CurrentPosition}`)
    } else if (this.WindowCovering.TargetPosition < this.WindowCovering.CurrentPosition) {
      this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.DECREASING
      this.setNewTarget = true
      await this.debugLog(`value: ${this.WindowCovering.CurrentPosition}, CurrentPosition: ${this.WindowCovering.CurrentPosition}`)
    } else {
      this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.STOPPED
      this.setNewTarget = false
      await this.debugLog(`value: ${this.WindowCovering.CurrentPosition}, CurrentPosition: ${this.WindowCovering.CurrentPosition}`)
    }
    this.WindowCovering.Service.setCharacteristic(this.hap.Characteristic.PositionState, this.WindowCovering.PositionState)
    this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState)

    /**
     * If Blind Tilt movement time is short, the moving flag from backend is always false.
     * The minimum time depends on the network control latency.
     */
    clearTimeout(this.setNewTargetTimer)
    await this.debugLog(`deviceUpdateRate: ${this.deviceUpdateRate}`)
    if (this.setNewTarget) {
      this.setNewTargetTimer = setTimeout(async () => {
        await this.debugLog(`setNewTarget ${this.setNewTarget} timeout`)
        this.setNewTarget = false
      }, this.deviceUpdateRate * 1000)
    }
    this.doBlindTiltUpdate.next()
  }

  /**
   * Handle requests to set the value of the "Target Position" characteristic
   */
  async OpenModeSwitchSet(value: CharacteristicValue): Promise<void> {
    if (this.OpenModeSwitch && this.device.blindTilt?.silentModeSwitch) {
      this.debugLog(`Silent Open Mode: ${value}`)
      this.OpenModeSwitch.On = value
      this.accessory.context.OpenModeSwitch.On = value
      this.doBlindTiltUpdate.next()
    }
  }

  /**
   * Handle requests to set the value of the "Target Position" characteristic
   */
  async CloseModeSwitchSet(value: CharacteristicValue): Promise<void> {
    if (this.CloseModeSwitch && this.device.blindTilt?.silentModeSwitch) {
      this.debugLog(`Silent Close Mode: ${value}`)
      this.CloseModeSwitch.On = value
      this.accessory.context.CloseModeSwitch.On = value
      this.doBlindTiltUpdate.next()
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    await this.setMinMax()
    // CurrentHorizontalTiltAngle
    if (this.mappingMode === BlindTiltMappingMode.UseTiltForDirection) {
      await this.updateCharacteristic(this.WindowCovering.Service, this.hap.Characteristic.CurrentHorizontalTiltAngle, this.WindowCovering.CurrentHorizontalTiltAngle, 'CurrentHorizontalTiltAngle')
    }
    // CurrentPosition
    await this.updateCharacteristic(this.WindowCovering.Service, this.hap.Characteristic.CurrentPosition, this.WindowCovering.CurrentPosition, 'CurrentPosition')
    // PositionState
    await this.updateCharacteristic(this.WindowCovering.Service, this.hap.Characteristic.PositionState, this.WindowCovering.PositionState, 'PositionState')
    // TargetPosition
    await this.updateCharacteristic(this.WindowCovering.Service, this.hap.Characteristic.TargetPosition, this.WindowCovering.TargetPosition, 'TargetPosition')
    // CurrentAmbientLightLevel
    if (!this.device.blindTilt?.hide_lightsensor && this.LightSensor?.Service) {
      const history = { time: Math.round(new Date().valueOf() / 1000), lux: this.LightSensor.CurrentAmbientLightLevel }
      await this.updateCharacteristic(this.LightSensor?.Service, this.hap.Characteristic.CurrentAmbientLightLevel, this.LightSensor?.CurrentAmbientLightLevel, 'CurrentAmbientLightLevel', history)
    }
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

  async setPerformance() {
    let setPositionMode: number
    let Mode: string
    if (Number(this.WindowCovering.TargetPosition) > 50) {
      if (this.device.blindTilt?.setOpenMode === '1' || this.OpenModeSwitch?.On) {
        setPositionMode = 1
        Mode = 'Silent Mode'
      } else if (this.device.blindTilt?.setOpenMode === '0' || !this.OpenModeSwitch?.On) {
        setPositionMode = 0
        Mode = 'Performance Mode'
      } else {
        setPositionMode = 0
        Mode = 'Default Mode'
      }
    } else {
      if (this.device.blindTilt?.setCloseMode === '1' || this.CloseModeSwitch?.On) {
        setPositionMode = 1
        Mode = 'Silent Mode'
      } else if (this.device.blindTilt?.setOpenMode === '0' || !this.CloseModeSwitch?.On) {
        setPositionMode = 0
        Mode = 'Performance Mode'
      } else {
        setPositionMode = 0
        Mode = 'Default Mode'
      }
    }
    return { setPositionMode, Mode }
  }

  async setMinMax(): Promise<void> {
    if (this.device.blindTilt?.set_min) {
      if (Number(this.WindowCovering.CurrentPosition) <= this.device.blindTilt?.set_min) {
        this.WindowCovering.CurrentPosition = 0
      }
    }
    if (this.device.blindTilt?.set_max) {
      if (Number(this.WindowCovering.CurrentPosition) >= this.device.blindTilt?.set_max) {
        this.WindowCovering.CurrentPosition = 100
      }
    }
    if (this.device.history) {
      const motion = this.accessory.getService(this.hap.Service.MotionSensor)
      const state = Number(this.WindowCovering.CurrentPosition) > 0 ? 1 : 0
      motion?.updateCharacteristic(this.hap.Characteristic.MotionDetected, state)
    }

    if (this.mappingMode === BlindTiltMappingMode.UseTiltForDirection) {
      this.WindowCovering.CurrentHorizontalTiltAngle = Number(this.WindowCovering.CurrentHorizontalTiltAngle) < 0 ? -90 : 90
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100)
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED)
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100)
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentHorizontalTiltAngle, 90)
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetHorizontalTiltAngle, 90)
    }
  }

  async apiError(e: any): Promise<void> {
    this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e)
    this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e)
    this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e)
    this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentHorizontalTiltAngle, e)
    this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetHorizontalTiltAngle, e)
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e)
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e)
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.ChargingState, e)
    if (!this.device.blindTilt?.hide_lightsensor && this.LightSensor?.Service) {
      this.LightSensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, e)
      this.LightSensor.Service.updateCharacteristic(this.hap.Characteristic.StatusActive, e)
    }
  }

  async getCurrentPosttionDirection(
    direction: blindTiltStatus['direction'] | blindTiltWebhookContext['direction'],
    slidePosition: blindTiltStatus['slidePosition'] | blindTiltWebhookContext['slidePosition'],
  ) {
    const [homekitPosition, homekitTiltAngle] = this.mapDeviceValuesToHomekitValues(Number(slidePosition), String(direction))
    await this.debugLog(`Slide Position: ${slidePosition}`)
    await this.debugLog(`Homekit Position: ${homekitPosition}`)

    this.WindowCovering.CurrentPosition = homekitPosition
    await this.setMinMax()
    await this.debugLog(`CurrentPosition: ${this.WindowCovering.CurrentPosition}`)

    if (homekitTiltAngle) {
      this.WindowCovering.CurrentHorizontalTiltAngle = homekitTiltAngle!
      await this.debugLog(`CurrentHorizontalTiltAngle: ${this.WindowCovering.CurrentHorizontalTiltAngle}`)
    }

    if (this.setNewTarget) {
      this.blindTiltMoving = true
      await this.infoLog('Checking Status ...')
      await this.setMinMax()
      if (this.WindowCovering.TargetPosition > this.WindowCovering.CurrentPosition
        || (homekitTiltAngle && this.WindowCovering.TargetHorizontalTiltAngle !== this.WindowCovering.CurrentHorizontalTiltAngle)) {
        await this.debugLog(`Closing, CurrentPosition: ${this.WindowCovering.CurrentPosition}`)
        this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.INCREASING
        this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState)
        await this.debugLog(`Increasing, PositionState: ${this.WindowCovering.PositionState}`)
      } else if (this.WindowCovering.TargetPosition < this.WindowCovering.CurrentPosition) {
        await this.debugLog(`Opening, CurrentPosition: ${this.WindowCovering.CurrentPosition}`)
        this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.DECREASING
        this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState)
        await this.debugLog(`Decreasing, PositionState: ${this.WindowCovering.PositionState}`)
      } else {
        await this.debugLog(`Standby because reached position, CurrentPosition: ${this.WindowCovering.CurrentPosition}`)
        this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.STOPPED
        this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState)
        await this.debugLog(`Stopped, PositionState: ${this.WindowCovering.PositionState}`)
      }
    } else {
      this.blindTiltMoving = false
      await this.debugLog(`Standby because device not moving, CurrentPosition: ${this.WindowCovering.CurrentPosition}`)
      this.WindowCovering.TargetPosition = this.WindowCovering.CurrentPosition
      if (homekitTiltAngle) {
        this.WindowCovering.TargetHorizontalTiltAngle = this.WindowCovering.CurrentHorizontalTiltAngle
      }
      this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.STOPPED
      await this.debugLog(`Stopped, PositionState: ${this.WindowCovering.PositionState}`)
    }
    await this.debugLog(`CurrentPosition: ${this.WindowCovering.CurrentPosition}, TargetPosition: ${this.WindowCovering.TargetPosition}, PositionState: ${this.WindowCovering.PositionState}`)
  }

  /**
   * Maps device values to homekit values
   *
   * @param devicePosition the position as reported by the devide
   * @param deviceDirection the direction as reported by the device
   * @returns [homekit position, homekit tiltAngle]
   */
  mapDeviceValuesToHomekitValues(devicePosition: number, deviceDirection: string): [CharacteristicValue, CharacteristicValue?] {
    // device position 0 => closed down
    // device position 50 => open
    // device position 100 => closed up

    // homekit position 0 =>  closed
    // homekit position 100 => open
    const direction = deviceDirection === 'up' ? 'up' : 'down'
    this.debugLog(`Mapping device values to homekit values, devicePostion: ${devicePosition}, deviceDirection: ${direction}`)
    switch (this.mappingMode) {
      case BlindTiltMappingMode.OnlyUp:
        // we only close upwards, so we see anything that is tilted downwards(<50) as open
        if (devicePosition < 50) {
          return [100, undefined] // fully open in homekit
        } else {
          // we range from 50->100, with 100 being closed, so map to homekit by scaling to 0..100 and then reversing
          return [100 - (devicePosition - 50) * 2, undefined]
        }

      case BlindTiltMappingMode.OnlyDown:
        // we only close downwards, so we see anything that is tilted upwards(>50) as upwards
        if (devicePosition > 50) {
          return [100, undefined] // fully open in homekit
        } else {
          // we range from 0..50 so scale to homekit and then reverse
          return [devicePosition * 2, undefined]
        }

      case BlindTiltMappingMode.DownAndUp:
        // we close both ways with closed downwards being 0 in homekit and closed upwards in homekit being 100. Open is 50 in homekit
        return [devicePosition, undefined]

      case BlindTiltMappingMode.UpAndDown:
        // we close both ways with closed downwards being 1000 in homekit and closed upwards in homekit being 0. Open is 50 in homekit.,
        // so we reverse the value
        return [100 - devicePosition, undefined]

      case BlindTiltMappingMode.UseTiltForDirection:
        // we use tilt for direction, so being closed downwards is 0 in homekit with -90 tilt, while being closed upwards is 0 with 90 tilt.
        if (devicePosition <= 50) {
          // downwards tilted, so we range from 0..50, with 0 being closed and 50 being open, so scale.
          return [devicePosition * 2, -90]
        } else {
          // upwards tilted, so we range from 50..100, with 50 being open and 100 being closed, so scale and rever
          return [100 - (devicePosition - 50) * 2, 90]
        }
    }
  }

  /**
   * Maps homekit values to device values
   *
   * @param homekitPosition the position as reported by homekit
   * @param homekitTiltAngle the tilt angle as reported by homekit
   * @returns [device position, device direction]
   */
  mapHomekitValuesToDeviceValues(homekitPosition: number, homekitTiltAngle: number): [string, number] {
    // homekit position 0 =>  closed
    // homekit position 100 => open

    // device position [up, 0] = closed upwards
    // device position [down, 0] = closed downwards
    // device position [up, 100] = open
    // device position [down, 100] = open

    switch (this.mappingMode) {
      case BlindTiltMappingMode.OnlyUp:
        // invert
        return ['up', homekitPosition]
      case BlindTiltMappingMode.OnlyDown:
        // invert
        return ['down', homekitPosition]

      case BlindTiltMappingMode.DownAndUp:
        // homekit 0 = downwards closed,
        // homekit 50 = open,
        // homekit 100 = upwards closed
        if (homekitPosition <= 50) {
          // homekit 0..50 -> device 100..0 so scale and invert
          return ['down', 100 - homekitPosition * 2]
        } else {
          // homekit 50..100 -> device 0..100, so rebase, scale and invert
          return ['up', (homekitPosition - 50) * 2]
        }

      case BlindTiltMappingMode.UpAndDown:
        // homekit 0 = upwards closed,
        // homekit 50 = open,
        // homekit 100 = upwards closed
        if (homekitPosition <= 50) {
          // homekit 0..50 -> device 0..100 so scale and invert
          return ['up', homekitPosition * 2]
        } else {
          // homekit 50..100 -> device 100...0 so scale
          return ['down', 100 - homekitPosition * 2]
        }

      case BlindTiltMappingMode.UseTiltForDirection:
        // tilt -90, homekit 0 = closed downwards
        // tilt -90, homekit 100 = open
        // tilt 90, homekit 0 = closed upwards
        // tilt 90, homekit 100 = open
        if (homekitTiltAngle! <= 0) {
          // downwards
          // homekit 0..100 -> device 0..100, so invert
          return ['down', homekitPosition]
        } else {
          // upwards
          // homekit 0..100 -> device 0..100, so invert
          return ['up', homekitPosition]
        }
    }
  }
}
