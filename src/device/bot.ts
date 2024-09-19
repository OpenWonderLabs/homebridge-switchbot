/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * bot.ts: @switchbot/homebridge-switchbot.
 */
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { SwitchBotPlatform } from '../platform.js'
import type { devicesConfig } from '../settings.js'
import type { botServiceData } from '../types/bledevicestatus.js'
import type { device } from '../types/devicelist.js'
import type { botStatus } from '../types/devicestatus.js'
import type { botWebhookContext } from '../types/devicewebhookstatus.js'

/*
* For Testing Locally:
* import { SwitchBotBLEModel, SwitchBotBLEModelName } from '/Users/Shared/GitHub/OpenWonderLabs/node-switchbot/dist/index.js';
*/
import { SwitchBotBLEModel, SwitchBotBLEModelName } from 'node-switchbot'
import { debounceTime, interval, skipWhile, Subject, take, tap } from 'rxjs'

import { formatDeviceIdAsMac } from '../utils.js'
import { deviceBase } from './device.js'

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Bot extends deviceBase {
  // Services
  private Battery: {
    Name: CharacteristicValue
    Service: Service
    BatteryLevel: CharacteristicValue
    StatusLowBattery: CharacteristicValue
  }

  private Switch?: {
    Name: CharacteristicValue
    Service: Service
  }

  private GarageDoor?: {
    Name: CharacteristicValue
    Service: Service
  }

  private Door?: {
    Name: CharacteristicValue
    Service: Service
  }

  private Window?: {
    Name: CharacteristicValue
    Service: Service
  }

  private WindowCovering?: {
    Name: CharacteristicValue
    Service: Service
  }

  private LockMechanism?: {
    Name: CharacteristicValue
    Service: Service
  }

  private Faucet?: {
    Name: CharacteristicValue
    Service: Service
  }

  private Fan?: {
    Name: CharacteristicValue
    Service: Service
  }

  private StatefulProgrammableSwitch?: {
    Name: CharacteristicValue
    Service: Service
  }

  private Outlet?: {
    Name: CharacteristicValue
    Service: Service
  }

  On!: boolean

  // OpenAPI
  deviceStatus!: botStatus

  // Webhook
  webhookContext!: botWebhookContext

  // BLE
  serviceData!: botServiceData

  // Config
  botMode!: string
  allowPush?: boolean
  doublePress!: number
  botDeviceType!: string
  pushRatePress!: number
  multiPressCount!: number

  // Updates
  botUpdateInProgress!: boolean
  doBotUpdate!: Subject<void>

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device)

    // default placeholders
    this.getBotConfigSettings(device)

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doBotUpdate = new Subject()
    this.botUpdateInProgress = false

    // Initialize Battery property
    accessory.context.Battery = accessory.context.Battery ?? {}
    this.Battery = {
      Name: `${accessory.displayName} Battery`,
      Service: accessory.getService(this.hap.Service.Battery) ?? accessory.addService(this.hap.Service.Battery) as Service,
      BatteryLevel: accessory.context.BatteryLevel ?? 100,
      StatusLowBattery: accessory.context.StatusLowBattery ?? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
    }
    accessory.context.Battery = this.Battery as object
    // Initialize Battery Characteristics
    this.Battery.Service.setCharacteristic(this.hap.Characteristic.Name, this.Battery.Name).setCharacteristic(this.hap.Characteristic.StatusLowBattery, this.Battery.StatusLowBattery).setCharacteristic(this.hap.Characteristic.ChargingState, this.hap.Characteristic.ChargingState.NOT_CHARGEABLE)

    // deviceType
    if (this.botDeviceType === 'switch') {
      // Set category
      accessory.category = this.hap.Categories.SWITCH
      // Initialize Switch Service
      accessory.context.Switch = accessory.context.Switch ?? {}
      this.Switch = {
        Name: accessory.displayName,
        Service: accessory.getService(this.hap.Service.Switch) ?? accessory.addService(this.hap.Service.Switch) as Service,
      }
      accessory.context.Switch = this.Switch as object
      this.debugLog('Displaying as Switch')
      // Initialize Switch Characteristics
      this.Switch.Service.setCharacteristic(this.hap.Characteristic.Name, this.Switch.Name).getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this))
      // Remove other services
      this.removeFanService(accessory)
      this.removeLockService(accessory)
      this.removeDoorService(accessory)
      this.removeFaucetService(accessory)
      this.removeOutletService(accessory)
      this.removeWindowService(accessory)
      this.removeGarageDoorService(accessory)
      this.removeWindowCoveringService(accessory)
      this.removeStatefulProgrammableSwitchService(accessory)
    } else if (this.botDeviceType === 'garagedoor') {
      // Set category
      accessory.category = this.hap.Categories.GARAGE_DOOR_OPENER
      // Initialize GarageDoor Service
      accessory.context.GarageDoor = accessory.context.GarageDoor ?? {}
      this.GarageDoor = {
        Name: accessory.displayName,
        Service: accessory.getService(this.hap.Service.GarageDoorOpener) ?? accessory.addService(this.hap.Service.GarageDoorOpener) as Service,
      }
      accessory.context.GarageDoor = this.GarageDoor as object
      this.debugLog('Displaying as Garage Door Opener')
      // Initialize GarageDoor Characteristics
      this.GarageDoor.Service.setCharacteristic(this.hap.Characteristic.Name, this.GarageDoor.Name).setCharacteristic(this.hap.Characteristic.ObstructionDetected, false).getCharacteristic(this.hap.Characteristic.TargetDoorState).setProps({
        validValues: [0, 100],
        minValue: 0,
        maxValue: 100,
        minStep: 100,
      }).onSet(this.OnSet.bind(this))
      // Remove other services
      this.removeFanService(accessory)
      this.removeLockService(accessory)
      this.removeDoorService(accessory)
      this.removeFaucetService(accessory)
      this.removeOutletService(accessory)
      this.removeSwitchService(accessory)
      this.removeWindowService(accessory)
      this.removeWindowCoveringService(accessory)
      this.removeStatefulProgrammableSwitchService(accessory)
    } else if (this.botDeviceType === 'door') {
      // Set category
      accessory.category = this.hap.Categories.DOOR
      // Initialize Door Service
      accessory.context.Door = accessory.context.Door ?? {}
      this.Door = {
        Name: accessory.displayName,
        Service: accessory.getService(this.hap.Service.Door) ?? accessory.addService(this.hap.Service.Door) as Service,
      }
      accessory.context.Door = this.Door as object
      this.debugLog('Displaying as Door')
      // Initialize Door Characteristics
      this.Door.Service.setCharacteristic(this.hap.Characteristic.Name, this.Door.Name).setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED).getCharacteristic(this.hap.Characteristic.TargetPosition).setProps({
        validValues: [0, 100],
        minValue: 0,
        maxValue: 100,
        minStep: 100,
      }).onSet(this.OnSet.bind(this))
      // Remove other services
      this.removeFanService(accessory)
      this.removeLockService(accessory)
      this.removeOutletService(accessory)
      this.removeFaucetService(accessory)
      this.removeSwitchService(accessory)
      this.removeWindowService(accessory)
      this.removeGarageDoorService(accessory)
      this.removeWindowCoveringService(accessory)
      this.removeStatefulProgrammableSwitchService(accessory)
    } else if (this.botDeviceType === 'window') {
      // Set category
      accessory.category = this.hap.Categories.WINDOW
      // Initialize Window Service
      accessory.context.Window = accessory.context.Window ?? {}
      this.Window = {
        Name: accessory.displayName,
        Service: accessory.getService(this.hap.Service.Window) ?? accessory.addService(this.hap.Service.Window) as Service,
      }
      accessory.context.Window = this.Window as object
      this.debugLog('Displaying as Window')
      // Initialize Window Characteristics
      this.Window.Service.setCharacteristic(this.hap.Characteristic.Name, this.Window.Name).setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED).getCharacteristic(this.hap.Characteristic.TargetPosition).setProps({
        validValues: [0, 100],
        minValue: 0,
        maxValue: 100,
        minStep: 100,
      }).onSet(this.OnSet.bind(this))
      // Remove other services
      this.removeFanService(accessory)
      this.removeLockService(accessory)
      this.removeDoorService(accessory)
      this.removeOutletService(accessory)
      this.removeFaucetService(accessory)
      this.removeSwitchService(accessory)
      this.removeGarageDoorService(accessory)
      this.removeWindowCoveringService(accessory)
      this.removeStatefulProgrammableSwitchService(accessory)
    } else if (this.botDeviceType === 'windowcovering') {
      // Set category
      accessory.category = this.hap.Categories.WINDOW_COVERING
      // Initialize WindowCovering Service
      accessory.context.WindowCovering = accessory.context.WindowCovering ?? {}
      this.WindowCovering = {
        Name: accessory.displayName,
        Service: accessory.getService(this.hap.Service.WindowCovering) ?? accessory.addService(this.hap.Service.WindowCovering) as Service,
      }
      accessory.context.WindowCovering = this.WindowCovering as object
      this.debugLog('Displaying as Window Covering')
      // Initialize WindowCovering Characteristics
      this.WindowCovering.Service.setCharacteristic(this.hap.Characteristic.Name, this.WindowCovering.Name).setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED).getCharacteristic(this.hap.Characteristic.TargetPosition).setProps({
        validValues: [0, 100],
        minValue: 0,
        maxValue: 100,
        minStep: 100,
      }).onSet(this.OnSet.bind(this))
      // Remove other services
      this.removeFanService(accessory)
      this.removeLockService(accessory)
      this.removeDoorService(accessory)
      this.removeOutletService(accessory)
      this.removeFaucetService(accessory)
      this.removeSwitchService(accessory)
      this.removeWindowService(accessory)
      this.removeGarageDoorService(accessory)
      this.removeStatefulProgrammableSwitchService(accessory)
    } else if (this.botDeviceType === 'lock') {
      // Set category
      accessory.category = this.hap.Categories.DOOR_LOCK
      // Initialize Lock Service
      accessory.context.LockMechanism = accessory.context.LockMechanism ?? {}
      this.LockMechanism = {
        Name: accessory.displayName,
        Service: accessory.getService(this.hap.Service.LockMechanism) ?? accessory.addService(this.hap.Service.LockMechanism) as Service,
      }
      accessory.context.LockMechanism = this.LockMechanism as object
      this.debugLog('Displaying as Lock')
      // Initialize Lock Characteristics
      this.LockMechanism.Service.setCharacteristic(this.hap.Characteristic.Name, this.LockMechanism.Name).setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED).getCharacteristic(this.hap.Characteristic.LockTargetState).onSet(this.OnSet.bind(this))
      // Remove other services
      this.removeFanService(accessory)
      this.removeDoorService(accessory)
      this.removeOutletService(accessory)
      this.removeSwitchService(accessory)
      this.removeFaucetService(accessory)
      this.removeWindowService(accessory)
      this.removeGarageDoorService(accessory)
      this.removeWindowCoveringService(accessory)
      this.removeStatefulProgrammableSwitchService(accessory)
    } else if (this.botDeviceType === 'faucet') {
      // Set category
      accessory.category = this.hap.Categories.FAUCET
      // Initialize Faucet Service
      accessory.context.Faucet = accessory.context.Faucet ?? {}
      this.Faucet = {
        Name: accessory.displayName,
        Service: accessory.getService(this.hap.Service.Faucet) ?? accessory.addService(this.hap.Service.Faucet) as Service,
      }
      accessory.context.Faucet = this.Faucet as object
      this.debugLog('Displaying as Faucet')
      // Initialize Faucet Characteristics
      this.Faucet.Service.setCharacteristic(this.hap.Characteristic.Name, this.Faucet.Name).getCharacteristic(this.hap.Characteristic.Active).onSet(this.OnSet.bind(this))
      // Remove other services
      this.removeFanService(accessory)
      this.removeLockService(accessory)
      this.removeDoorService(accessory)
      this.removeOutletService(accessory)
      this.removeSwitchService(accessory)
      this.removeWindowService(accessory)
      this.removeGarageDoorService(accessory)
      this.removeWindowCoveringService(accessory)
      this.removeStatefulProgrammableSwitchService(accessory)
    } else if (this.botDeviceType === 'fan') {
      // Set category
      accessory.category = this.hap.Categories.FAN
      // Initialize Fan Service
      accessory.context.Fan = accessory.context.Fan ?? {}
      this.Fan = {
        Name: accessory.displayName,
        Service: accessory.getService(this.hap.Service.Fanv2) ?? accessory.addService(this.hap.Service.Fanv2) as Service,
      }
      accessory.context.Fan = this.Fan as object
      this.debugLog('Displaying as Fan')
      // Initialize Fan Characteristics
      this.Fan.Service.setCharacteristic(this.hap.Characteristic.Name, this.Fan.Name).getCharacteristic(this.hap.Characteristic.Active).onSet(this.OnSet.bind(this))
      // Remove other services
      this.removeLockService(accessory)
      this.removeDoorService(accessory)
      this.removeFaucetService(accessory)
      this.removeOutletService(accessory)
      this.removeSwitchService(accessory)
      this.removeWindowService(accessory)
      this.removeGarageDoorService(accessory)
      this.removeWindowCoveringService(accessory)
      this.removeStatefulProgrammableSwitchService(accessory)
    } else if (this.botDeviceType === 'stateful') {
      // Set category
      accessory.category = this.hap.Categories.PROGRAMMABLE_SWITCH
      // Initialize StatefulProgrammableSwitch Service
      accessory.context.StatefulProgrammableSwitch = accessory.context.StatefulProgrammableSwitch ?? {}
      this.StatefulProgrammableSwitch = {
        Name: accessory.displayName,
        Service: accessory.getService(this.hap.Service.StatefulProgrammableSwitch) ?? accessory.addService(this.hap.Service.StatefulProgrammableSwitch) as Service,
      }
      accessory.context.StatefulProgrammableSwitch = this.StatefulProgrammableSwitch as object
      this.debugLog('Displaying as Stateful Programmable Switch')
      // Initialize StatefulProgrammableSwitch Characteristics
      this.StatefulProgrammableSwitch.Service.setCharacteristic(this.hap.Characteristic.Name, this.StatefulProgrammableSwitch.Name).getCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState).onSet(this.OnSet.bind(this))
      // Remove other services
      this.removeFanService(accessory)
      this.removeLockService(accessory)
      this.removeDoorService(accessory)
      this.removeFaucetService(accessory)
      this.removeOutletService(accessory)
      this.removeSwitchService(accessory)
      this.removeWindowService(accessory)
      this.removeGarageDoorService(accessory)
      this.removeWindowCoveringService(accessory)
    } else if (this.botDeviceType === 'outlet') {
      // Set category
      accessory.category = this.hap.Categories.OUTLET
      // Initialize Switch property
      accessory.context.Outlet = accessory.context.Outlet ?? {}
      this.Outlet = {
        Name: accessory.displayName,
        Service: accessory.getService(this.hap.Service.Outlet) ?? accessory.addService(this.hap.Service.Outlet) as Service,
      }
      accessory.context.Outlet = this.Outlet as object
      this.debugLog('Displaying as Outlet')
      // Initialize Outlet Characteristics
      this.Outlet.Service.setCharacteristic(this.hap.Characteristic.Name, this.Outlet.Name).getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this))
      // Remove other services
      this.removeFanService(accessory)
      this.removeLockService(accessory)
      this.removeDoorService(accessory)
      this.removeFaucetService(accessory)
      this.removeSwitchService(accessory)
      this.removeWindowService(accessory)
      this.removeGarageDoorService(accessory)
      this.removeWindowCoveringService(accessory)
      this.removeStatefulProgrammableSwitchService(accessory)
    } else {
      this.errorLog('Device Type not set')
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
      .pipe(skipWhile(() => this.botUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus()
      })

    // Watch for Bot change events
    // We put in a debounce of 1000ms so we don't make duplicate calls
    this.doBotUpdate
      .pipe(
        tap(() => {
          this.botUpdateInProgress = true
        }),
        debounceTime(this.devicePushRate * 1000),
      )
      .subscribe(async () => {
        try {
          if (this.doublePress > 1) {
            interval(this.pushRatePress * 1000)
              .pipe(take(this.doublePress!))
              .subscribe(async () => {
                await this.pushChanges()
              })
          } else {
            await this.pushChanges()
          }
        } catch (e: any) {
          await this.apiError(e)
          await this.errorLog(`failed pushChanges with ${device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
        }
        this.botUpdateInProgress = false
      })
  }

  /**
   * Parse the device status from the SwitchBotBLE API
   */
  async BLEparseStatus(): Promise<void> {
    await this.debugLog('BLEparseStatus')
    await this.debugLog(`(power, battery, deviceMode) = BLE:(${this.serviceData.state}, ${this.serviceData.battery}, ${this.serviceData.mode}), current:(${this.accessory.context.On}, ${this.Battery.BatteryLevel}, ${this.botMode})`)

    // BLEmode (true if Switch Mode) | (false if Press Mode)
    this.On = this.serviceData.mode ? this.serviceData.state : false
    const mode = this.serviceData.mode ? 'Switch' : 'Press'
    await this.debugLog(`${mode} Mode, On: ${this.accessory.context.On}`)
    this.accessory.context.On = this.On

    // BatteryLevel
    this.Battery.BatteryLevel = this.serviceData.battery
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`)

    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`)
  }

  /**
   * Parse the device status from the SwitchBot OpenAPI
   */
  async openAPIparseStatus(): Promise<void> {
    await this.debugLog('openAPIparseStatus')
    await this.debugLog(`(power, battery, deviceMode) = API:(${this.deviceStatus.power}, ${this.deviceStatus.battery}, ${this.botMode}), current:(${this.accessory.context.On}, ${this.Battery.BatteryLevel}, ${this.botMode})`)

    // On
    this.On = this.botMode === 'press' ? false : this.deviceStatus.power === 'on'
    this.accessory.context.On = this.On
    await this.debugLog(`On: ${this.accessory.context.On}`)

    // Battery Level
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
      this.debugLog(`Firmware Version: ${version.replace(/^V|-.*$/g, '')}`)
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
    await this.debugLog(`(power, battery, deviceMode) = Webhook:(${this.webhookContext.power}, ${this.webhookContext.battery}, ${this.webhookContext.deviceMode}), current:(${this.On}, ${this.Battery.BatteryLevel}, ${this.botMode})`)

    // On
    this.On = this.webhookContext.power === 'on'
    await this.debugLog(`On: ${this.On}`)

    // BatteryLevel
    this.Battery.BatteryLevel = this.webhookContext.battery
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`)

    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`)

    // Mode
    this.botMode = this.webhookContext.deviceMode
    await this.debugLog(`Mode: ${this.botMode}`)
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
        const serviceData = await this.monitorAdvertisementPackets(switchbot) as botServiceData
        // Update HomeKit
        if (serviceData.model === SwitchBotBLEModel.Bot && serviceData.modelName === SwitchBotBLEModelName.Bot) {
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
        this.platform.bleEventHandler[this.device.bleMac] = async (context: botServiceData) => {
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
      this.platform.webhookEventHandler[this.device.deviceId] = async (context: botWebhookContext) => {
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
   * deviceType  commandType  Command    command parameter  Description
   * Bot         "command"    "turnOff"  "default"      =   set to OFF state
   * Bot         "command"    "turnOn"   "default"      =   set to ON state
   * Bot         "command"    "press"    "default"      =   trigger press
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
      .pipe(skipWhile(() => this.botUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus()
      })
  }

  async BLEpushChanges(): Promise<void> {
    await this.debugLog('BLEpushChanges')
    if (this.On !== this.accessory.context.On || this.allowPush) {
      await this.debugLog(`BLEpushChanges On: ${this.On} OnCached: ${this.accessory.context.On}`)
      const switchbot = await this.platform.connectBLE(this.accessory, this.device)
      try {
        const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
        this.device.bleMac = formattedDeviceId
        await this.debugLog(`bleMac: ${this.device.bleMac}`)
        // if (switchbot !== false) {
        await this.debugLog(`Bot Mode: ${this.botMode}`)
        if (this.botMode === 'press') {
          switchbot
            .discover({ model: 'H', quick: true, id: this.device.bleMac })
            .then(async (device_list: { press: (arg0: { id: string | undefined }) => any }[]) => {
              await this.infoLog(`On: ${this.On}`)
              return await device_list[0].press({ id: this.device.bleMac })
            })
            .then(async () => {
              await this.successLog(`On: ${this.On} sent over SwitchBot BLE,  sent successfully`)
              await this.updateHomeKitCharacteristics()
              setTimeout(async () => {
                this.On = false
                await this.updateHomeKitCharacteristics()
                this.debugLog(`On: ${this.On}, Switch Timeout`)
              }, 500)
            })
            .catch(async (e: any) => {
              await this.apiError(e)
              await this.errorLog(`failed BLEpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
              await this.BLEPushConnection()
            })
        } else if (this.botMode === 'switch') {
          switchbot
            .discover({ model: this.device.bleModel, quick: true, id: this.device.bleMac })
            .then(async (device_list: any) => {
              this.infoLog(`On: ${this.On}`)
              return await this.retryBLE({
                max: await this.maxRetryBLE(),
                fn: async () => {
                  if (this.On) {
                    return await device_list[0].turnOn({ id: this.device.bleMac })
                  } else {
                    return await device_list[0].turnOff({ id: this.device.bleMac })
                  }
                },
              })
            })
            .then(async () => {
              await this.successLog(`On: ${this.On} sent over SwitchBot BLE,  sent successfully`)
              await this.updateHomeKitCharacteristics()
            })
            .catch(async (e: any) => {
              await this.apiError(e)
              await this.errorLog(`failed BLEpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
              await this.BLEPushConnection()
            })
        } else {
          await this.errorLog(`Device Parameters not set for this Bot, please check the device configuration. Bot Mode: ${this.botMode}`)
        }
      } catch (error) {
        await this.errorLog(`failed to format device ID as MAC, Error: ${error}`)
      }
    } else {
      await this.debugLog(`No Changes (BLEpushChanges), On: ${this.On} OnCached: ${this.accessory.context.On}`)
    }
  }

  async openAPIpushChanges(): Promise<void> {
    await this.debugLog('openAPIpushChanges')
    if (this.multiPressCount > 0) {
      await this.debugLog(`${this.multiPressCount} request(s) queued.`)
    }
    if (this.On !== this.accessory.context.On || this.allowPush || this.multiPressCount > 0) {
      let command = ''
      if (this.botMode === 'switch') {
        command = this.On ? 'turnOn' : 'turnOff'
        await this.debugLog(`Switch Mode, Command: ${command}`)
      } else if (this.botMode === 'press' || this.botMode === 'multipress') {
        command = 'press'
        await this.debugLog('Press Mode')
        this.On = false
      } else {
        throw new Error('Device Parameters not set for this Bot.')
      }
      const bodyChange = JSON.stringify({
        command: `${command}`,
        parameter: 'default',
        commandType: 'command',
      })
      this.debugLog(`Sending request to SwitchBot API, body: ${bodyChange},`)
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
        if (this.device.bot?.mode === 'multipress') {
          this.multiPressCount--
          if (this.multiPressCount > 0) {
            await this.debugLog(`multiPressCount: ${this.multiPressCount}`)
            this.On = true
            await this.openAPIpushChanges()
          }
        }
      } catch (e: any) {
        await this.apiError(e)
        await this.errorLog(`failed openAPIpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
      }
    } else {
      await this.debugLog(`No Changes (openAPIpushChanges), On: ${this.On} OnCached: ${this.accessory.context.On}`)
    }
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    this.On = this.accessory.context.On ?? false
    this.accessory.context.On = this.On
    const deviceTypeActions: { [key: string]: () => Promise<void> } = {
      switch: async () => {
        if (this.Switch) {
          await this.debugLog(`Set On: ${value}`)
          this.On = value !== false
        }
      },
      garagedoor: async () => {
        if (this.GarageDoor) {
          await this.debugLog(`Set TargetDoorState: ${value}`)
          this.On = value !== this.hap.Characteristic.TargetDoorState.CLOSED
        }
      },
      door: async () => {
        if (this.Door) {
          await this.debugLog(`Set TargetPosition: ${value}`)
          this.On = value !== 0
        }
      },
      window: async () => {
        if (this.Window) {
          await this.debugLog(`Set TargetPosition: ${value}`)
          this.On = value !== 0
        }
      },
      windowcovering: async () => {
        if (this.WindowCovering) {
          await this.debugLog(`Set TargetPosition: ${value}`)
          this.On = value !== 0
        }
      },
      lock: async () => {
        if (this.LockMechanism) {
          await this.debugLog(`Set LockTargetState: ${value}`)
          this.On = value !== this.hap.Characteristic.LockTargetState.SECURED
        }
      },
      faucet: async () => {
        if (this.Faucet) {
          await this.debugLog(`Set Active: ${value}`)
          this.On = value !== this.hap.Characteristic.Active.INACTIVE
        }
      },
      stateful: async () => {
        if (this.StatefulProgrammableSwitch) {
          await this.debugLog(`Set ProgrammableSwitchOutputState: ${value}`)
          this.On = value !== 0
        }
      },
      default: async () => {
        if (this.Outlet) {
          await this.debugLog(`Set On: ${value}`)
          this.On = value !== false
        }
        if (this.device.bot?.mode === 'multipress' && this.On) {
          this.multiPressCount++
          await this.debugLog(`multiPressCount: ${this.multiPressCount}`)
        }
      },
    }
    const action = deviceTypeActions[this.botDeviceType] || deviceTypeActions.default
    await action()
    this.accessory.context.On = this.On
    this.doBotUpdate.next()
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    await this.debugLog('updateHomeKitCharacteristics')
    // BatteryLevel
    if (this.Battery.BatteryLevel === undefined) {
      await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`)
    } else {
      this.accessory.context.BatteryLevel = this.Battery.BatteryLevel
      this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, this.Battery.BatteryLevel)
      await this.debugLog(`updateCharacteristic BatteryLevel: ${this.Battery.BatteryLevel}`)
    }
    // StatusLowBattery
    if (this.Battery.StatusLowBattery === undefined) {
      await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`)
    } else {
      this.accessory.context.StatusLowBattery = this.Battery.StatusLowBattery
      this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, this.Battery.StatusLowBattery)
      await this.debugLog(`updateCharacteristic StatusLowBattery: ${this.Battery.StatusLowBattery}`)
    }
    // State
    if (this.botDeviceType === 'switch' && this.Switch) {
      if (this.On === undefined) {
        await this.debugLog(`On: ${this.On}`)
      } else {
        this.Switch.Service.updateCharacteristic(this.hap.Characteristic.On, this.On)
        await this.debugLog(`updateCharacteristic On: ${this.On}`)
      }
    } else if (this.botDeviceType === 'garagedoor' && this.GarageDoor) {
      if (this.On === undefined) {
        await this.debugLog(`On: ${this.On}`)
      } else {
        if (this.On) {
          this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, this.hap.Characteristic.TargetDoorState.OPEN)
          this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, this.hap.Characteristic.CurrentDoorState.OPEN)
          await this.debugLog(`updateCharacteristic TargetDoorState: Open, CurrentDoorState: Open (${this.On})`)
        } else {
          this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, this.hap.Characteristic.TargetDoorState.CLOSED)
          this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, this.hap.Characteristic.CurrentDoorState.CLOSED)
          await this.debugLog(`updateCharacteristicc TargetDoorState: Closed, CurrentDoorState: Closed (${this.On})`)
        }
      }
      await this.debugLog(`Garage Door On: ${this.On}`)
    } else if (this.botDeviceType === 'door' && this.Door) {
      if (this.On === undefined) {
        await this.debugLog(`On: ${this.On}`)
      } else {
        if (this.On) {
          this.Door.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100)
          this.Door.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100)
          this.Door.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED)
          await this.debugLog(`updateCharacteristicc TargetPosition: 100, CurrentPosition: 100 (${this.On})`)
        } else {
          this.Door.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0)
          this.Door.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0)
          this.Door.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED)
          await this.debugLog(`updateCharacteristicc TargetPosition: 0, CurrentPosition: 0 (${this.On})`)
        }
      }
      await this.debugLog(`Door On: ${this.On}`)
    } else if (this.botDeviceType === 'window' && this.Window) {
      if (this.On === undefined) {
        await this.debugLog(`On: ${this.On}`)
      } else {
        if (this.On) {
          this.Window.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100)
          this.Window.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100)
          this.Window.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED)
          await this.debugLog(`updateCharacteristicc TargetPosition: 100, CurrentPosition: 100 (${this.On})`)
        } else {
          this.Window.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0)
          this.Window.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0)
          this.Window.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED)
          await this.debugLog(`updateCharacteristicc TargetPosition: 0, CurrentPosition: 0 (${this.On})`)
        }
      }
      await this.debugLog(`Window On: ${this.On}`)
    } else if (this.botDeviceType === 'windowcovering' && this.WindowCovering) {
      if (this.On === undefined) {
        await this.debugLog(`On: ${this.On}`)
      } else {
        if (this.On) {
          this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100)
          this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100)
          this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED)
          await this.debugLog(`updateCharacteristicc TargetPosition: 100, CurrentPosition: 100 (${this.On})`)
        } else {
          this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0)
          this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0)
          this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED)
          await this.debugLog(`updateCharacteristicc TargetPosition: 0, CurrentPosition: 0 (${this.On})`)
        }
      }
      await this.debugLog(`Window Covering On: ${this.On}`)
    } else if (this.botDeviceType === 'lock' && this.LockMechanism) {
      if (this.On === undefined) {
        await this.debugLog(`On: ${this.On}`)
      } else {
        if (this.On) {
          this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState, this.hap.Characteristic.LockTargetState.UNSECURED)
          this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState, this.hap.Characteristic.LockCurrentState.UNSECURED)
          await this.debugLog(`updateCharacteristicc LockTargetState: UNSECURED, LockCurrentState: UNSECURED (${this.On})`)
        } else {
          this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState, this.hap.Characteristic.LockTargetState.SECURED)
          this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState, this.hap.Characteristic.LockCurrentState.SECURED)
          await this.debugLog(`updateCharacteristic LockTargetState: SECURED, LockCurrentState: SECURED  (${this.On})`)
        }
      }
      await this.debugLog(`Lock On: ${this.On}`)
    } else if (this.botDeviceType === 'faucet' && this.Faucet) {
      if (this.On === undefined) {
        await this.debugLog(`On: ${this.On}`)
      } else {
        if (this.On) {
          this.Faucet.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.ACTIVE)
          await this.debugLog(`updateCharacteristic Active: ${this.On}`)
        } else {
          this.Faucet.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.INACTIVE)
          await this.debugLog(`updateCharacteristic Active: ${this.On}`)
        }
      }
      await this.debugLog(`Faucet On: ${this.On}`)
    } else if (this.botDeviceType === 'fan' && this.Fan) {
      if (this.On === undefined) {
        await this.debugLog(`On: ${this.On}`)
      } else {
        if (this.On) {
          this.Fan.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.ACTIVE)
          await this.debugLog(`updateCharacteristic Active: ${this.On}`)
        } else {
          this.Fan.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.INACTIVE)
          await this.debugLog(`updateCharacteristic Active: ${this.On}`)
        }
      }
      await this.debugLog(`Fan On: ${this.On}`)
    } else if (this.botDeviceType === 'stateful' && this.StatefulProgrammableSwitch) {
      if (this.On === undefined) {
        await this.debugLog(`On: ${this.On}`)
      } else {
        if (this.On) {
          this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent, this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS)
          this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, 1)
          await this.debugLog(`updateCharacteristic ProgrammableSwitchEvent: ProgrammableSwitchOutputState: (${this.On})`)
        } else {
          this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent, this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS)
          this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, 0)
          await this.debugLog(`updateCharacteristic ProgrammableSwitchEvent: ProgrammableSwitchOutputState: (${this.On})`)
        }
      }
      await this.debugLog(`StatefulProgrammableSwitch On: ${this.On}`)
    } else if (this.botDeviceType === 'outlet' && this.Outlet) {
      if (this.On === undefined) {
        await this.debugLog(`On: ${this.On}`)
      } else {
        this.Outlet.Service.updateCharacteristic(this.hap.Characteristic.On, this.On)
        await this.debugLog(`updateCharacteristic On: ${this.On}`)
      }
    } else {
      await this.errorLog(`botDeviceType: ${this.botDeviceType}, On: ${this.On}`)
    }
  }

  async removeOutletService(accessory: PlatformAccessory): Promise<void> {
    // If outletService still present, then remove first
    accessory.context.Outlet = accessory.context.Outlet ?? {}
    this.Outlet = {
      Name: accessory.context.Outlet.Name ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service.Outlet) as Service,
    }
    accessory.context.Outlet = this.Outlet as object
    await this.debugWarnLog('Removing any leftover Outlet Service')
    accessory.removeService(this.Outlet.Service)
  }

  async removeGarageDoorService(accessory: PlatformAccessory): Promise<void> {
    // If garageDoorService still present, then remove first
    accessory.context.GarageDoor = accessory.context.GarageDoor ?? {}
    this.GarageDoor = {
      Name: accessory.context.GarageDoor.Name ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service.GarageDoorOpener) as Service,
    }
    accessory.context.GarageDoor = this.GarageDoor as object
    await this.debugWarnLog('Removing any leftover Garage Door Service')
    accessory.removeService(this.GarageDoor.Service)
  }

  async removeDoorService(accessory: PlatformAccessory): Promise<void> {
    // If doorService still present, then remove first
    accessory.context.Door = accessory.context.Door ?? {}
    this.Door = {
      Name: accessory.context.Door.Name ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service.Door) as Service,
    }
    accessory.context.Door = this.Door as object
    await this.debugWarnLog('Removing any leftover Door Service')
    accessory.removeService(this.Door.Service)
  }

  async removeLockService(accessory: PlatformAccessory): Promise<void> {
    // If lockService still present, then remove first
    accessory.context.LockMechanism = accessory.context.LockMechanism ?? {}
    this.LockMechanism = {
      Name: accessory.context.LockMechanism.Name ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service.LockMechanism) as Service,
    }
    accessory.context.LockMechanism = this.LockMechanism as object
    await this.debugWarnLog('Removing any leftover Lock Service')
    accessory.removeService(this.LockMechanism.Service)
  }

  async removeFaucetService(accessory: PlatformAccessory): Promise<void> {
    // If faucetService still present, then remove first
    accessory.context.Faucet = accessory.context.Faucet ?? {}
    this.Faucet = {
      Name: accessory.context.Faucet.Name ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service.Valve) as Service,
    }
    accessory.context.Faucet = this.Faucet as object
    await this.debugWarnLog('Removing any leftover Faucet Service')
    accessory.removeService(this.Faucet.Service)
  }

  async removeFanService(accessory: PlatformAccessory): Promise<void> {
    // If fanService still present, then remove first
    accessory.context.Fan = accessory.context.Fan ?? {}
    this.Fan = {
      Name: accessory.context.Fan.Name ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service.Fan) as Service,
    }
    accessory.context.Fan = this.Fan as object
    await this.debugWarnLog('Removing any leftover Fan Service')
    accessory.removeService(this.Fan.Service)
  }

  async removeWindowService(accessory: PlatformAccessory): Promise<void> {
    // If windowService still present, then remove first
    accessory.context.Window = accessory.context.Window ?? {}
    this.Window = {
      Name: accessory.context.Window.Name ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service.Window) as Service,
    }
    accessory.context.Window = this.Window as object
    await this.debugWarnLog('Removing any leftover Window Service')
    accessory.removeService(this.Window.Service)
  }

  async removeWindowCoveringService(accessory: PlatformAccessory): Promise<void> {
    // If windowCoveringService still present, then remove first
    accessory.context.WindowCovering = accessory.context.WindowCovering ?? {}
    this.WindowCovering = {
      Name: accessory.context.WindowCovering.Name ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service.WindowCovering) as Service,
    }
    accessory.context.WindowCovering = this.WindowCovering as object
    await this.debugWarnLog('Removing any leftover Window Covering Service')
    accessory.removeService(this.WindowCovering.Service)
  }

  async removeStatefulProgrammableSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If statefulProgrammableSwitchService still present, then remove first
    accessory.context.StatefulProgrammableSwitch = accessory.context.StatefulProgrammableSwitch ?? {}
    this.StatefulProgrammableSwitch = {
      Name: accessory.context.StatefulProgrammableSwitch.Name ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service.StatefulProgrammableSwitch) as Service,
    }
    accessory.context.StatefulProgrammableSwitch = this.StatefulProgrammableSwitch as object
    await this.debugWarnLog('Removing any leftover Stateful Programmable Switch Service')
    accessory.removeService(this.StatefulProgrammableSwitch.Service)
  }

  async removeSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If switchService still present, then remove first
    accessory.context.Switch = accessory.context.Switch ?? {}
    this.Switch = {
      Name: accessory.context.Switch.Name ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service.Switch) as Service,
    }
    accessory.context.Switch = this.Switch as object
    await this.debugWarnLog('Removing any leftover Switch Service')
    accessory.removeService(this.Switch.Service)
  }

  async getBotConfigSettings(device: device & devicesConfig) {
    // Bot Device Type
    this.botDeviceType = device.bot?.deviceType ?? 'outlet'
    const botDeviceType = device.bot?.deviceType
      ? `Using Device Type: ${this.botDeviceType}`
      : `No Device Type Set, deviceType: ${this.device.bot?.deviceType}, Using default deviceType: ${this.botDeviceType}`
    await this.debugWarnLog(botDeviceType)
    this.accessory.context.botDeviceType = this.botDeviceType
    // Bot Mode
    this.botMode = device.bot?.mode ?? 'switch'
    if (!device.bot?.mode) {
      this.botMode = 'switch'
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} does not have bot mode set in the Plugin's SwitchBot Device Settings, defaulting to "${this.botMode}" mode. You may experience issues.`)
    } else if (['switch', 'press', 'multipress'].includes(device.bot.mode)) {
      this.botMode = device.bot.mode
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Bot Mode: ${this.botMode}`)
    } else {
      throw new Error(`${this.device.deviceType}: ${this.accessory.displayName} Invalid Bot Mode: ${device.bot.mode}`)
    }
    const botModeLog = device.bot?.mode
      ? `Using Bot Mode: ${this.botMode}`
      : `No Bot Mode Set, Using default Bot Mode: ${this.botMode}`
    await this.debugWarnLog(botModeLog)
    this.accessory.context.botMode = this.botMode
    // Bot Double Press
    this.doublePress = device.bot?.doublePress ?? 1
    const doublePress = device.bot?.doublePress
      ? `Using Double Press: ${this.doublePress}`
      : `No Double Press Set, Using default Double Press: ${this.doublePress}`
    await this.debugWarnLog(doublePress)
    this.accessory.context.doublePress = this.doublePress
    // Bot Press PushRate
    this.pushRatePress = device.bot?.pushRatePress ?? 15
    const pushRatePress = device.bot?.pushRatePress
      ? `Using Bot Push Rate Press: ${this.pushRatePress}`
      : `No Push Rate Press Set, Using default Push Rate Press: ${this.pushRatePress}`
    await this.debugWarnLog(pushRatePress)
    this.accessory.context.pushRatePress = this.pushRatePress
    // Bot Allow Push
    this.allowPush = device.bot?.allowPush ?? false
    const allowPush = device.bot?.allowPush
      ? `Using Allow Push: ${this.allowPush}`
      : `No Allow Push Set, Using default Allow Push: ${this.allowPush}`
    await this.debugWarnLog(allowPush)
    this.accessory.context.allowPush = this.allowPush
    // Bot Multi Press Count
    this.multiPressCount = 0
    await this.debugWarnLog(`Multi Press Count: ${this.multiPressCount}`)
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
      if (this.botDeviceType === 'garagedoor') {
        if (this.GarageDoor) {
          this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, this.hap.Characteristic.TargetDoorState.CLOSED)
          this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, this.hap.Characteristic.CurrentDoorState.CLOSED)
          this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.ObstructionDetected, false)
        }
      } else if (this.botDeviceType === 'door') {
        if (this.Door) {
          this.Door.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0)
          this.Door.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0)
          this.Door.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED)
        }
      } else if (this.botDeviceType === 'window') {
        if (this.Window) {
          this.Window.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0)
          this.Window.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0)
          this.Window.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED)
        }
      } else if (this.botDeviceType === 'windowcovering') {
        if (this.WindowCovering) {
          this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0)
          this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0)
          this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED)
        }
      } else if (this.botDeviceType === 'lock') {
        if (this.LockMechanism) {
          this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState, this.hap.Characteristic.LockTargetState.SECURED)
          this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState, this.hap.Characteristic.LockCurrentState.SECURED)
        }
      } else if (this.botDeviceType === 'faucet') {
        if (this.Faucet) {
          this.Faucet.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.INACTIVE)
        }
      } else if (this.botDeviceType === 'fan') {
        if (this.Fan) {
          this.Fan.Service.updateCharacteristic(this.hap.Characteristic.On, false)
        }
      } else if (this.botDeviceType === 'stateful') {
        if (this.StatefulProgrammableSwitch) {
          this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent, this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS)
          this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, 0)
        }
      } else if (this.botDeviceType === 'switch') {
        if (this.Switch) {
          this.Switch.Service.updateCharacteristic(this.hap.Characteristic.On, false)
        }
      } else {
        if (this.Outlet) {
          this.Outlet.Service.updateCharacteristic(this.hap.Characteristic.On, false)
        }
      }
    }
  }

  async apiError(e: any): Promise<void> {
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e)
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e)
    if (this.botDeviceType === 'garagedoor') {
      if (this.GarageDoor) {
        this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, e)
        this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, e)
        this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.ObstructionDetected, e)
      }
    } else if (this.botDeviceType === 'door') {
      if (this.Door) {
        this.Door.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e)
        this.Door.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e)
        this.Door.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e)
      }
    } else if (this.botDeviceType === 'window') {
      if (this.Window) {
        this.Window.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e)
        this.Window.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e)
        this.Window.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e)
      }
    } else if (this.botDeviceType === 'windowcovering') {
      if (this.WindowCovering) {
        this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e)
        this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e)
        this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e)
      }
    } else if (this.botDeviceType === 'lock') {
      if (this.LockMechanism) {
        this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState, e)
        this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState, e)
      }
    } else if (this.botDeviceType === 'faucet') {
      if (this.Faucet) {
        this.Faucet.Service.updateCharacteristic(this.hap.Characteristic.Active, e)
      }
    } else if (this.botDeviceType === 'fan') {
      if (this.Fan) {
        this.Fan.Service.updateCharacteristic(this.hap.Characteristic.On, e)
      }
    } else if (this.botDeviceType === 'stateful') {
      if (this.StatefulProgrammableSwitch) {
        this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent, e)
        this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, e)
      }
    } else if (this.botDeviceType === 'switch') {
      if (this.Switch) {
        this.Switch.Service.updateCharacteristic(this.hap.Characteristic.On, e)
      }
    } else {
      if (this.Outlet) {
        this.Outlet.Service.updateCharacteristic(this.hap.Characteristic.On, e)
      }
    }
  }
}
