/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * curtain.ts: @switchbot/homebridge-switchbot.
 */
import type { CharacteristicChange, CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { SwitchBotPlatform } from '../platform.js'
import type { devicesConfig } from '../settings.js'
import type { curtain3ServiceData, curtainServiceData } from '../types/bledevicestatus.js'
import type { device } from '../types/devicelist.js'
import type { curtainStatus } from '../types/devicestatus.js'
import type { curtain3WebhookContext, curtainWebhookContext } from '../types/devicewebhookstatus.js'

import { hostname } from 'node:os'

/*
* For Testing Locally:
* import { SwitchBotBLEModel, SwitchBotBLEModelName } from '/Users/Shared/GitHub/OpenWonderLabs/node-switchbot/dist/index.js';
*/
import { SwitchBotBLEModel, SwitchBotBLEModelName } from 'node-switchbot'
import { debounceTime, interval, skipWhile, Subject, take, tap } from 'rxjs'

import { formatDeviceIdAsMac } from '../utils.js'
import { deviceBase } from './device.js'

export class Curtain extends deviceBase {
  // Services
  private WindowCovering: {
    Name: CharacteristicValue
    Service: Service
    PositionState: CharacteristicValue
    TargetPosition: CharacteristicValue
    CurrentPosition: CharacteristicValue
    HoldPosition: CharacteristicValue
  }

  private Battery: {
    Name: CharacteristicValue
    Service: Service
    BatteryLevel: CharacteristicValue
    StatusLowBattery: CharacteristicValue
    ChargingState: CharacteristicValue
  }

  private LightSensor?: {
    Name: CharacteristicValue
    Service: Service
    CurrentAmbientLightLevel?: CharacteristicValue
  }

  private OpenModeSwitch?: {
    Name: string
    Service: Service
    On: CharacteristicValue
  }

  private CloseModeSwitch?: {
    Name: string
    Service: Service
    On: CharacteristicValue
  }

  // OpenAPI
  deviceStatus!: curtainStatus

  // Webhook
  webhookContext!: curtainWebhookContext | curtain3WebhookContext

  // BLE
  serviceData!: curtainServiceData | curtain3ServiceData

  // Target
  hasLoggedStandby!: boolean
  setNewTarget!: boolean
  setNewTargetTimer!: NodeJS.Timeout

  // Updates
  curtainMoving!: boolean
  curtainUpdateInProgress!: boolean
  doCurtainUpdate!: Subject<void>

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device)
    // Set category
    accessory.category = this.hap.Categories.WINDOW_COVERING

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doCurtainUpdate = new Subject()
    this.curtainMoving = false
    this.curtainUpdateInProgress = false
    this.setNewTarget = false

    // Initialize WindowCovering Service
    accessory.context.WindowCovering = accessory.context.WindowCovering ?? {}
    this.WindowCovering = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.WindowCovering) ?? accessory.addService(this.hap.Service.WindowCovering) as Service,
      PositionState: accessory.context.PositionState ?? this.hap.Characteristic.PositionState.STOPPED,
      TargetPosition: accessory.context.TargetPosition ?? 100,
      CurrentPosition: accessory.context.CurrentPosition ?? 100,
      HoldPosition: accessory.context.HoldPosition ?? false,
    }
    accessory.context.WindowCovering = this.WindowCovering as object

    // Initialize WindowCovering Service
    this.WindowCovering.Service.setCharacteristic(this.hap.Characteristic.Name, this.WindowCovering.Name).setCharacteristic(this.hap.Characteristic.ObstructionDetected, false).getCharacteristic(this.hap.Characteristic.PositionState).onGet(() => {
      return this.WindowCovering.PositionState
    })

    // Initialize WindowCovering CurrentPosition
    this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.CurrentPosition).setProps({
      minStep: device.curtain?.set_minStep ?? 1,
      minValue: 0,
      maxValue: 100,
      validValueRanges: [0, 100],
    }).onGet(() => {
      return this.WindowCovering.CurrentPosition
    })

    // Initialize WindowCovering TargetPosition
    this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.TargetPosition).setProps({
      minStep: device.curtain?.set_minStep ?? 1,
      minValue: 0,
      maxValue: 100,
      validValueRanges: [0, 100],
    }).onGet(() => {
      return this.WindowCovering.TargetPosition
    }).onSet(this.TargetPositionSet.bind(this))

    // Initialize WindowCovering TargetPosition
    this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.HoldPosition).onGet(() => {
      return this.WindowCovering.HoldPosition
    }).onSet(this.HoldPositionSet.bind(this))

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

    // Initialize Battery Service
    this.Battery.Service.setCharacteristic(this.hap.Characteristic.Name, this.Battery.Name).getCharacteristic(this.hap.Characteristic.BatteryLevel).onGet(() => {
      return this.Battery.BatteryLevel
    })

    this.Battery.Service.getCharacteristic(this.hap.Characteristic.StatusLowBattery).onGet(() => {
      return this.Battery.StatusLowBattery
    })

    this.Battery.Service.getCharacteristic(this.hap.Characteristic.ChargingState).onGet(() => {
      return this.Battery.ChargingState
    })

    // Initialize LightSensor Service
    if (device.curtain?.hide_lightsensor || (device.deviceType !== 'curtain' && device.deviceType !== 'curtain3')) {
      if (this.LightSensor?.Service) {
        this.debugLog('Removing Light Sensor Service')
        this.LightSensor.Service = this.accessory.getService(this.hap.Service.LightSensor) as Service
        accessory.removeService(this.LightSensor.Service)
        accessory.context.LightSensor = {}
      }
    } else if (device.deviceType === 'curtain' || device.deviceType === 'curtain3') {
      accessory.context.LightSensor = accessory.context.LightSensor ?? {}
      this.LightSensor = {
        Name: `${accessory.displayName} Light Sensor`,
        Service: accessory.getService(this.hap.Service.LightSensor) ?? this.accessory.addService(this.hap.Service.LightSensor) as Service,
        CurrentAmbientLightLevel: accessory.context.CurrentAmbientLightLevel ?? 0.0001,
      }
      accessory.context.LightSensor = this.LightSensor as object

      // Initialize LightSensor Characteristic
      this.LightSensor.Service.setCharacteristic(this.hap.Characteristic.Name, this.LightSensor.Name).setCharacteristic(this.hap.Characteristic.StatusActive, true).getCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel).onGet(() => {
        return this.LightSensor!.CurrentAmbientLightLevel!
      })
    }

    // Initialize Open Mode Switch Service
    if (!device.curtain?.silentModeSwitch) {
      if (this.OpenModeSwitch?.Service) {
        this.debugLog('Removing Open Mode Switch Service')
        this.OpenModeSwitch.Service = this.accessory.getService(this.hap.Service.Switch) as Service
        accessory.removeService(this.OpenModeSwitch.Service)
        accessory.context.OpenModeSwitch = {}
      }
    } else {
      accessory.context.OpenModeSwitch = accessory.context.OpenModeSwitch ?? {}
      this.debugLog('Adding Open Mode Switch Service')
      const name = `${accessory.displayName} Silent Open Mode`
      const uuid = this.api.hap.uuid.generate(name)
      this.OpenModeSwitch = {
        Name: name,
        Service: accessory.getService(name) ?? accessory.addService(this.hap.Service.Switch, name, uuid) as Service,
        On: accessory.context.OpenModeSwitch.On ?? false,
      }
      accessory.context.OpenModeSwitch = this.OpenModeSwitch as object

      // Initialize Open Mode Switch Service
      this.OpenModeSwitch.Service.setCharacteristic(this.hap.Characteristic.Name, this.OpenModeSwitch.Name).setCharacteristic(this.hap.Characteristic.ConfiguredName, this.OpenModeSwitch.Name).getCharacteristic(this.hap.Characteristic.On).onGet(() => {
        return this.OpenModeSwitch?.On ?? false
      })

      this.OpenModeSwitch.Service.getCharacteristic(this.hap.Characteristic.On).onSet(this.OpenModeSwitchSet.bind(this))
    }

    // Initialize Close Mode Switch Service
    if (!device.curtain?.silentModeSwitch) {
      if (this.CloseModeSwitch?.Service) {
        this.debugLog('Removing Close Mode Switch Service')
        this.CloseModeSwitch.Service = this.accessory.getService(this.hap.Service.Switch) as Service
        accessory.removeService(this.CloseModeSwitch.Service)
        accessory.context.CloseModeSwitch = {}
      }
    } else {
      accessory.context.CloseModeSwitch = accessory.context.CloseModeSwitch ?? {}
      this.debugLog('Adding Close Mode Switch Service')
      const name = `${accessory.displayName} Silent Close Mode`
      const uuid = this.api.hap.uuid.generate(name)
      this.CloseModeSwitch = {
        Name: name,
        Service: this.accessory.getService(name) ?? accessory.addService(this.hap.Service.Switch, name, uuid) as Service,
        On: accessory.context.CloseModeSwitch.On ?? false,
      }
      accessory.context.CloseModeSwitch = this.CloseModeSwitch as object

      // Initialize Close Mode Switch Service
      this.CloseModeSwitch.Service.setCharacteristic(this.hap.Characteristic.Name, this.CloseModeSwitch.Name).setCharacteristic(this.hap.Characteristic.ConfiguredName, this.CloseModeSwitch.Name).getCharacteristic(this.hap.Characteristic.On).onGet(() => {
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

    // History
    this.history()

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.curtainUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus()
      })

    // update slide progress
    interval(this.deviceUpdateRate * 1000)
      .pipe(skipWhile(() => !this.curtainMoving))
      .subscribe(async () => {
        if (this.WindowCovering.PositionState === this.hap.Characteristic.PositionState.STOPPED) {
          return
        }
        await this.debugLog(`Refresh Status When Moving, PositionState: ${this.WindowCovering.PositionState}`)
        await this.refreshStatus()
      })

    // Watch for Curtain change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doCurtainUpdate
      .pipe(
        tap(() => {
          this.curtainUpdateInProgress = true
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
        this.curtainUpdateInProgress = false
      })

    // Setup EVE history features
    this.setupHistoryService()
  }

  async history() {
    if (this.device.history === true) {
      // initialize when this accessory is newly created.
      this.accessory.context.lastActivation = this.accessory.context.lastActivation ?? 0
    } else {
      // removes cached values if history is turned off
      delete this.accessory.context.lastActivation
    }
  }

  /*
   * Setup EVE history features for curtain devices.
   */
  async setupHistoryService(): Promise<void> {
    if (this.device.history !== true) {
      return
    }

    try {
      const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
      this.device.bleMac = formattedDeviceId
      await this.debugLog(`bleMac: ${this.device.bleMac}`)
      this.historyService = new this.platform.fakegatoAPI('custom', this.accessory, {
        log: this.platform.log,
        storage: 'fs',
        filename: `${hostname().split('.')[0]}_${this.device.bleMac}_persist.json`,
      })
      const motion: Service
      = this.accessory.getService(this.hap.Service.MotionSensor)
      || this.accessory.addService(this.hap.Service.MotionSensor, 'Motion')
      motion.addOptionalCharacteristic(this.platform.eve.Characteristics.LastActivation)
      motion.getCharacteristic(this.platform.eve.Characteristics.LastActivation).onGet(() => {
        const lastActivation = this.accessory.context.lastActivation
          ? Math.max(0, this.accessory.context.lastActivation - this.historyService.getInitialTime())
          : 0
        return lastActivation
      })
      await this.setMinMax()
      motion.getCharacteristic(this.hap.Characteristic.MotionDetected).on('change', (event: CharacteristicChange) => {
        if (event.newValue !== event.oldValue) {
          const sensor = this.accessory.getService(this.hap.Service.MotionSensor)
          const entry = {
            time: Math.round(new Date().valueOf() / 1000),
            motion: event.newValue,
          }
          this.accessory.context.lastActivation = entry.time
          sensor?.updateCharacteristic(
            this.platform.eve.Characteristics.LastActivation,
            Math.max(0, this.accessory.context.lastActivation - this.historyService.getInitialTime()),
          )
          this.historyService.addEntry(entry)
        }
      })
      this.updateHistory()
    } catch (error) {
      await this.errorLog(`failed to format device ID as MAC, Error: ${error}`)
    }
  }

  async updateHistory(): Promise<void> {
    const motion = Number(this.WindowCovering.CurrentPosition) > 0 ? 1 : 0
    this.historyService.addEntry({
      time: Math.round(new Date().valueOf() / 1000),
      motion,
    })
    setTimeout(async () => {
      await this.updateHistory()
    }, 10 * 60 * 1000)
  }

  async BLEparseStatus(): Promise<void> {
    await this.debugLog('BLEparseStatus')
    await this.debugLog(`(position, battery) = BLE:(${this.serviceData.position}, ${this.serviceData.battery}), current:(${this.WindowCovering.CurrentPosition}, ${this.Battery.BatteryLevel})`)
    // CurrentPosition
    this.WindowCovering.CurrentPosition = 100 - this.serviceData.position
    await this.getCurrentPostion()
    // CurrentAmbientLightLevel
    if (!this.device.curtain?.hide_lightsensor && this.LightSensor?.Service) {
      const set_minLux = this.device.curtain?.set_minLux ?? 1
      const set_maxLux = this.device.curtain?.set_maxLux ?? 6001
      const lightLevel = this.serviceData.lightLevel
      this.LightSensor.CurrentAmbientLightLevel = await this.getLightLevel(lightLevel, set_minLux, set_maxLux, 19)
      this.debugLog(`LightLevel: ${this.serviceData.lightLevel}, CurrentAmbientLightLevel: ${this.LightSensor.CurrentAmbientLightLevel}`)
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
    await this.debugLog(`(slidePosition, battery, version) = OpenAPI:(${this.deviceStatus.slidePosition}, ${this.deviceStatus.battery}, ${this.deviceStatus.version}), current:(${this.WindowCovering.CurrentPosition}, ${this.Battery.BatteryLevel}, ${this.accessory.context.version})`)
    // CurrentPosition
    this.WindowCovering.CurrentPosition = 100 - this.deviceStatus.slidePosition
    await this.getCurrentPostion()

    // Brightness
    if (!this.device.curtain?.hide_lightsensor && this.LightSensor?.Service) {
      const set_minLux = this.device.curtain?.set_minLux ?? 1
      const set_maxLux = this.device.curtain?.set_maxLux ?? 6001
      const lightLevel = this.deviceStatus.lightLevel === 'bright' ? set_maxLux : set_minLux
      this.LightSensor.CurrentAmbientLightLevel = await this.getLightLevel(lightLevel, set_minLux, set_maxLux, 2)
      await this.debugLog(`CurrentAmbientLightLevel: ${this.LightSensor.CurrentAmbientLightLevel}`)
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
    await this.debugLog(`(slidePosition, battery) = Webhook:(${this.webhookContext.slidePosition}, ${this.webhookContext.battery}), current:(${this.WindowCovering.CurrentPosition}, ${this.Battery.BatteryLevel})`)

    // CurrentPosition
    this.WindowCovering.CurrentPosition = 100 - this.webhookContext.slidePosition
    await this.getCurrentPostion()

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
        const serviceData = await this.monitorAdvertisementPackets(switchbot) as curtainServiceData | curtain3ServiceData
        // Update HomeKit
        if ((serviceData.model === SwitchBotBLEModel.Curtain || SwitchBotBLEModel.Curtain3)
          && (serviceData.modelName === SwitchBotBLEModelName.Curtain || SwitchBotBLEModelName.Curtain3)) {
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
      this.platform.webhookEventHandler[this.device.deviceId] = async (context: curtainWebhookContext | curtain3WebhookContext) => {
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

  async registerPlatformBLE(): Promise<void> {
    await this.debugLog('registerPlatformBLE')
    if (this.config.options?.BLE) {
      await this.debugLog('is listening to Platform BLE.')
      try {
        const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
        this.device.bleMac = formattedDeviceId
        await this.debugLog(`bleMac: ${this.device.bleMac}`)
        this.platform.bleEventHandler[this.device.bleMac] = async (context: curtainServiceData | curtain3ServiceData) => {
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

  /**
   * Pushes the requested changes to the SwitchBot API
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
      .pipe(skipWhile(() => this.curtainUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus()
      })
  }

  async BLEpushChanges(): Promise<void> {
    await this.debugLog('BLEpushChanges')
    if (this.WindowCovering.TargetPosition !== this.WindowCovering.CurrentPosition) {
      const switchbot = await this.platform.connectBLE(this.accessory, this.device)
      try {
        const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
        this.device.bleMac = formattedDeviceId
        await this.debugLog(`bleMac: ${this.device.bleMac}`)
        const { setPositionMode, Mode }: { setPositionMode: number, Mode: string } = await this.setPerformance()
        const adjustedMode = setPositionMode === 1 ? 0x01 : 0xFF
        await this.debugLog(`Mode: ${Mode}, setPositionMode: ${setPositionMode}`)
        if (switchbot !== false) {
          switchbot
            .discover({ model: this.device.bleModel, quick: true, id: this.device.bleMac })
            .then(async (device_list: any) => {
              return await this.retryBLE({
                max: await this.maxRetryBLE(),
                fn: async () => {
                  return await device_list[0].runToPos(100 - Number(this.WindowCovering.TargetPosition), adjustedMode)
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
    if (this.WindowCovering.TargetPosition !== this.WindowCovering.CurrentPosition || this.device.disableCaching) {
      await this.debugLog(`Pushing ${this.WindowCovering.TargetPosition}`)
      const adjustedTargetPosition = 100 - Number(this.WindowCovering.TargetPosition)
      const { setPositionMode, Mode }: { setPositionMode: number, Mode: string } = await this.setPerformance()
      await this.debugLog(`Mode: ${Mode}, setPositionMode: ${setPositionMode}`)
      const adjustedMode = setPositionMode || 'ff'
      let bodyChange: string
      if (this.WindowCovering.HoldPosition) {
        bodyChange = JSON.stringify({
          command: 'pause',
          parameter: 'default',
          commandType: 'command',
        })
      } else {
        bodyChange = JSON.stringify({
          command: 'setPosition',
          parameter: `0,${adjustedMode},${adjustedTargetPosition}`,
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
      await this.debugLog(`No changes (openAPIpushChanges), CurrentPosition: ${this.WindowCovering.CurrentPosition}, TargetPosition: ${this.WindowCovering.TargetPosition}`)
    }
  }

  /**
   * Handle requests to set the value of the "Target Position" characteristic
   */
  async TargetPositionSet(value: CharacteristicValue): Promise<void> {
    if (this.WindowCovering.TargetPosition !== this.accessory.context.TargetPosition) {
      await this.infoLog(`Set TargetPosition: ${value}`)
    } else {
      await this.debugLog(`No Changes, TargetPosition: ${value}`)
    }

    // Set HoldPosition to false when TargetPosition is changed
    this.WindowCovering.HoldPosition = false
    this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.HoldPosition, this.WindowCovering.HoldPosition)

    this.WindowCovering.TargetPosition = value
    await this.mqtt('TargetPosition', this.WindowCovering.TargetPosition)
    await this.mqtt('HoldPosition', this.WindowCovering.HoldPosition)
    await this.startUpdatingCurtainIfNeeded()
  }

  async startUpdatingCurtainIfNeeded() {
    await this.setMinMax()
    if (this.WindowCovering.TargetPosition > this.WindowCovering.CurrentPosition) {
      this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.INCREASING
      this.setNewTarget = true
      await this.debugLog(`value: ${this.WindowCovering.TargetPosition}, CurrentPosition: ${this.WindowCovering.CurrentPosition}`)
    } else if (this.WindowCovering.TargetPosition < this.WindowCovering.CurrentPosition) {
      this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.DECREASING
      this.setNewTarget = true
      await this.debugLog(`value: ${this.WindowCovering.TargetPosition}, CurrentPosition: ${this.WindowCovering.CurrentPosition}`)
    } else {
      this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.STOPPED
      this.setNewTarget = false
      await this.debugLog(`value: ${this.WindowCovering.TargetPosition}, CurrentPosition: ${this.WindowCovering.CurrentPosition}`)
    }
    this.WindowCovering.Service.setCharacteristic(this.hap.Characteristic.PositionState, this.WindowCovering.PositionState)
    this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState)

    /**
     * If Curtain movement time is short, the moving flag from backend is always false.
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
    this.doCurtainUpdate.next()
  }

  /**
   * Handle requests to set the value of the "Target Position" characteristic
   */
  async HoldPositionSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`HoldPosition: ${value}`)
    this.WindowCovering.HoldPosition = value
    this.doCurtainUpdate.next()
  }

  /**
   * Handle requests to set the value of the "Target Position" characteristic
   */
  async OpenModeSwitchSet(value: CharacteristicValue): Promise<void> {
    if (this.OpenModeSwitch && this.device.curtain?.silentModeSwitch) {
      this.debugLog(`Silent Open Mode: ${value}`)
      this.OpenModeSwitch.On = value
      this.accessory.context.OpenModeSwitch.On = value
      if (value === true) {
        this.infoLog('Silent Open Mode is enabled')
      }
    }
  }

  /**
   * Handle requests to set the value of the "Target Position" characteristic
   */
  async CloseModeSwitchSet(value: CharacteristicValue): Promise<void> {
    if (this.CloseModeSwitch && this.device.curtain?.silentModeSwitch) {
      this.debugLog(`Silent Close Mode: ${value}`)
      this.CloseModeSwitch.On = value
      this.accessory.context.CloseModeSwitch.On = value
      if (value === true) {
        this.infoLog('Silent Close Mode is enabled')
      }
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    await this.setMinMax()
    // CurrentPosition
    await this.updateCharacteristic(this.WindowCovering.Service, this.hap.Characteristic.CurrentPosition, this.WindowCovering.CurrentPosition, 'CurrentPosition')
    // PositionState
    await this.updateCharacteristic(this.WindowCovering.Service, this.hap.Characteristic.PositionState, this.WindowCovering.PositionState, 'PositionState')
    // TargetPosition
    await this.updateCharacteristic(this.WindowCovering.Service, this.hap.Characteristic.TargetPosition, this.WindowCovering.TargetPosition, 'TargetPosition')
    // HoldPosition
    await this.updateCharacteristic(this.WindowCovering.Service, this.hap.Characteristic.HoldPosition, this.WindowCovering.HoldPosition, 'HoldPosition')
    // CurrentAmbientLightLevel
    if (!this.device.curtain?.hide_lightsensor && this.LightSensor?.Service) {
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
      if (this.device.curtain?.setOpenMode === '1' || this.OpenModeSwitch?.On) {
        setPositionMode = 1
        Mode = 'Silent Mode'
      } else if (this.device.curtain?.setOpenMode === '0' || !this.OpenModeSwitch?.On) {
        setPositionMode = 0
        Mode = 'Performance Mode'
      } else {
        setPositionMode = 0
        Mode = 'Default Mode'
      }
    } else {
      if (this.device.curtain?.setCloseMode === '1' || this.CloseModeSwitch?.On) {
        setPositionMode = 1
        Mode = 'Silent Mode'
      } else if (this.device.curtain?.setCloseMode === '0' || !this.CloseModeSwitch?.On) {
        setPositionMode = 0
        Mode = 'Performance Mode'
      } else {
        setPositionMode = 0
        Mode = 'Default Mode'
      }
    }
    this.infoLog(`Position Mode: ${setPositionMode}, Mode: ${Mode}`)
    return { setPositionMode, Mode }
  }

  async getCurrentPostion(): Promise<void> {
    await this.setMinMax()
    await this.debugLog(`CurrentPosition ${this.WindowCovering.CurrentPosition}`)
    this.hasLoggedStandby = this.hasLoggedStandby ?? false
    if (this.setNewTarget || this.deviceStatus.moving) {
      this.hasLoggedStandby = false
      this.infoLog('Checking Status ...')
      this.curtainMoving = true
      await this.setMinMax()
      if (this.WindowCovering.TargetPosition > this.WindowCovering.CurrentPosition) {
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
        await this.debugLog(`Standby, CurrentPosition: ${this.WindowCovering.CurrentPosition}`)
        this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.STOPPED
        this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState)
        await this.debugLog(`Stopped, PositionState: ${this.WindowCovering.PositionState}`)
      }
    } else {
      if (!this.hasLoggedStandby) {
        await this.infoLog('Standby ...')
        this.hasLoggedStandby = true
      }
      this.curtainMoving = false
      await this.debugLog(`Standby, CurrentPosition: ${this.WindowCovering.CurrentPosition}`)
      this.WindowCovering.TargetPosition = this.WindowCovering.CurrentPosition
      this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.STOPPED
      await this.debugLog(`Stopped, PositionState: ${this.WindowCovering.PositionState}`)
    }
    await this.debugLog(`CurrentPosition: ${this.WindowCovering.CurrentPosition}, TargetPosition: ${this.WindowCovering.TargetPosition}, PositionState: ${this.WindowCovering.PositionState},`)
  }

  async setMinMax(): Promise<void> {
    if (this.device.curtain?.set_min) {
      if (Number(this.WindowCovering.CurrentPosition) <= this.device.curtain?.set_min) {
        this.WindowCovering.CurrentPosition = 0
      }
    }
    if (this.device.curtain?.set_max) {
      if (Number(this.WindowCovering.CurrentPosition) >= this.device.curtain?.set_max) {
        this.WindowCovering.CurrentPosition = 100
      }
    }
    if (this.device.history) {
      const motion = this.accessory.getService(this.hap.Service.MotionSensor)
      const state = Number(this.WindowCovering.CurrentPosition) > 0 ? 1 : 0
      motion?.updateCharacteristic(this.hap.Characteristic.MotionDetected, state)
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100)
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100)
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED)
    }
  }

  async apiError(e: any): Promise<void> {
    this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e)
    this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e)
    this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e)
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e)
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e)
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.ChargingState, e)
    if (!this.device.curtain?.hide_lightsensor && this.LightSensor?.Service) {
      this.LightSensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, e)
      this.LightSensor.Service.updateCharacteristic(this.hap.Characteristic.StatusActive, e)
    }
  }
}
