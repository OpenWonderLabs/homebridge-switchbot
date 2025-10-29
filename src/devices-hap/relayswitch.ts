/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * bot.ts: @switchbot/homebridge-switchbot.
 */
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'
import type { bodyChange, device, relaySwitch1Context, relaySwitch1PMContext, relaySwitch1PMServiceData, relaySwitch1PMStatus, relaySwitch1ServiceData, relaySwitch1Status, SwitchBotBLE, SwitchbotDevice, WoRelaySwitch1, WoRelaySwitch1PM } from 'node-switchbot'

import type { SwitchBotHAPPlatform } from '../platform-hap.js'
import type { devicesConfig, relaySwitch1Config, relaySwitch1PMConfig } from '../settings.js'

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
export class RelaySwitch extends deviceBase {
  // Services
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
  deviceStatus!: relaySwitch1Status | relaySwitch1PMStatus

  // Webhook
  webhookContext!: relaySwitch1Context | relaySwitch1PMContext

  // BLE
  serviceData!: relaySwitch1ServiceData | relaySwitch1PMServiceData

  // Config
  allowPush?: boolean
  relaySwitchDeviceType!: string

  // Updates
  relaySwitchUpdateInProgress!: boolean
  doRelaySwitchUpdate!: Subject<void>

  /**
   * Constructs a new instance of the RelaySwitch device.
   *
   * @param {SwitchBotPlatform} platform - The platform instance.
   * @param {PlatformAccessory} accessory - The platform accessory.
   * @param {device & devicesConfig} device - The device configuration.
   *
   * Initializes the RelaySwitch device, sets up the battery service, maps the device type to the appropriate HomeKit service,
   * removes unnecessary services, retrieves initial values, registers event handlers, and starts update intervals.
   *
   * @constructor
   */
  constructor(
    readonly platform: SwitchBotHAPPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device)

    this.getRelaySwitchConfigSettings(device)

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doRelaySwitchUpdate = new Subject()
    this.relaySwitchUpdateInProgress = false

    /**
     * A mapping of device types to their corresponding HomeKit categories, services, and characteristics.
     *
     * Each key represents a device type and maps to an object containing:
     * - `category`: The HomeKit category for the device.
     * - `service`: The HomeKit service associated with the device.
     * - `characteristic`: The HomeKit characteristic for the device.
     */
    const deviceTypeMap: { [key: string]: { category: number, service: any, characteristic: any } } = {
      switch: { category: this.hap.Categories.SWITCH, service: this.hap.Service.Switch, characteristic: this.hap.Characteristic.On },
      garagedoor: { category: this.hap.Categories.GARAGE_DOOR_OPENER, service: this.hap.Service.GarageDoorOpener, characteristic: this.hap.Characteristic.TargetDoorState },
      door: { category: this.hap.Categories.DOOR, service: this.hap.Service.Door, characteristic: this.hap.Characteristic.TargetPosition },
      window: { category: this.hap.Categories.WINDOW, service: this.hap.Service.Window, characteristic: this.hap.Characteristic.TargetPosition },
      windowcovering: { category: this.hap.Categories.WINDOW_COVERING, service: this.hap.Service.WindowCovering, characteristic: this.hap.Characteristic.TargetPosition },
      lock: { category: this.hap.Categories.DOOR_LOCK, service: this.hap.Service.LockMechanism, characteristic: this.hap.Characteristic.LockTargetState },
      faucet: { category: this.hap.Categories.FAUCET, service: this.hap.Service.Faucet, characteristic: this.hap.Characteristic.Active },
      fan: { category: this.hap.Categories.FAN, service: this.hap.Service.Fanv2, characteristic: this.hap.Characteristic.Active },
      stateful: { category: this.hap.Categories.PROGRAMMABLE_SWITCH, service: this.hap.Service.StatefulProgrammableSwitch, characteristic: this.hap.Characteristic.ProgrammableSwitchOutputState },
      outlet: { category: this.hap.Categories.OUTLET, service: this.hap.Service.Outlet, characteristic: this.hap.Characteristic.On },
    }

    /**
     * The type of the device, determined by mapping the relaySwitchDeviceType to a value in the deviceTypeMap.
     */
    const deviceType = deviceTypeMap[this.relaySwitchDeviceType]

    if (deviceType) {
      // Set category
      accessory.category = deviceType.category
      // Initialize Service
      const contextKey = this.relaySwitchDeviceType.charAt(0).toUpperCase() + this.relaySwitchDeviceType.slice(1)
      accessory.context[contextKey] = accessory.context[contextKey] ?? {}
      this[this.relaySwitchDeviceType.charAt(0).toUpperCase() + this.relaySwitchDeviceType.slice(1)] = {
        Name: accessory.displayName,
        Service: accessory.getService(deviceType.service) ?? accessory.addService(deviceType.service) as Service,
      }
      accessory.context[contextKey] = this[this.relaySwitchDeviceType.charAt(0).toUpperCase() + this.relaySwitchDeviceType.slice(1)] as object
      this.debugLog(`Displaying as ${contextKey}`)
      // Initialize Characteristics
      this[this.relaySwitchDeviceType.charAt(0).toUpperCase() + this.relaySwitchDeviceType.slice(1)].Service.setCharacteristic(this.hap.Characteristic.Name, this[this.relaySwitchDeviceType.charAt(0).toUpperCase() + this.relaySwitchDeviceType.slice(1)].Name).getCharacteristic(deviceType.characteristic).onSet(this.OnSet.bind(this))
    } else {
      this.errorLog('Device Type not set')
    }

    /**
     * An array of service removal functions that should be executed based on the current state of the device.
     * Each element in the array is a function that removes a specific service if the corresponding condition is met.
     */
    const servicesToRemove = [
      !this.StatefulProgrammableSwitch && this.removeStatefulProgrammableSwitchService,
      !this.Outlet && this.removeOutletService,
      !this.Window && this.removeWindowService,
      !this.GarageDoor && this.removeGarageDoorService,
      this.WindowCovering && this.removeWindowCoveringService,
      !this.Switch && this.removeSwitchService,
      !this.Faucet && this.removeFaucetService,
      !this.Door && this.removeDoorService,
      !this.LockMechanism && this.removeLockService,
      !this.Fan && this.removeFanService,
    ].filter(Boolean)

    for (const removeService of servicesToRemove) {
      if (typeof removeService === 'function') {
        removeService.call(this, accessory)
      }
    }

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
      .pipe(skipWhile(() => this.relaySwitchUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus()
      })

    // Watch for RelaySwitch change events
    // We put in a debounce of 1000ms so we don't make duplicate calls
    this.doRelaySwitchUpdate
      .pipe(
        tap(() => {
          this.relaySwitchUpdateInProgress = true
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
        this.relaySwitchUpdateInProgress = false
      })
  }

  /**
   * Parse the device status from the SwitchBotBLE API
   */
  async BLEparseStatus(): Promise<void> {
    this.debugLog('BLEparseStatus')
    this.debugLog(`(power, battery, deviceMode) = BLE:(${this.serviceData.state}), current:(${this.accessory.context.On})`)

    // BLEmode (true if Switch Mode) | (false if Press Mode)
    this.On = this.serviceData.mode ? this.serviceData.state : false
    const mode = this.serviceData.mode ? 'Switch' : 'Press'
    this.debugLog(`${mode} Mode, On: ${this.On}`)
    this.accessory.context.On = this.On
  }

  /**
   * Parse the device status from the SwitchBot OpenAPI
   */
  async openAPIparseStatus(): Promise<void> {
    this.debugLog('openAPIparseStatus')
    this.debugLog(`(power, battery, deviceMode) = API:(${this.deviceStatus.switchStatus}), current:(${this.accessory.context.On})`)

    // On
    this.On = this.deviceStatus.switchStatus !== 0
    this.debugLog(`On: ${this.On}`)
    this.accessory.context.On = this.On

    // Firmware Version
    if (this.deviceStatus.version) {
      const version = this.deviceStatus.version as string
      this.debugLog(`Firmware Version: ${version.replace(/^V|-.*$/g, '')}`)
      const deviceVersion = version.replace(/^V|-.*$/g, '') ?? '0.0.0'
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
        .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
        .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
        .updateValue(deviceVersion)
      this.accessory.context.version = deviceVersion
      this.debugLog(`version: ${deviceVersion}`)
    }
  }

  async parseStatusWebhook(): Promise<void> {
    this.debugLog('parseStatusWebhook')
    this.debugLog(`(power, battery, deviceMode) = Webhook:(${this.webhookContext.switchStatus}), current:(${this.On})`)

    // On
    this.On = this.webhookContext.switchStatus !== 0
    this.debugLog(`On: ${this.On}`)
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus(): Promise<void> {
    if (this.BLE) {
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
        const serviceData = await this.monitorAdvertisementPackets(switchBotBLE) as relaySwitch1ServiceData | relaySwitch1PMServiceData
        // Update HomeKit
        if ((serviceData.model === SwitchBotBLEModel.RelaySwitch1PM && serviceData.modelName === SwitchBotBLEModelName.RelaySwitch1PM) ?? (serviceData.model === SwitchBotBLEModel.RelaySwitch1 && serviceData.modelName === SwitchBotBLEModelName.RelaySwitch1)) {
          this.serviceData = serviceData
          if (serviceData !== undefined && serviceData !== null) {
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
        this.platform.bleEventHandler[this.device.bleMac] = async (context: relaySwitch1ServiceData | relaySwitch1PMServiceData) => {
          try {
            this.serviceData = context
            if (context !== undefined && context !== null) {
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
      const deviceStatus = await this.deviceRefreshStatus<relaySwitch1Status | relaySwitch1PMStatus>()
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
      this.platform.webhookEventHandler[this.device.deviceId] = async (context: relaySwitch1Context | relaySwitch1PMContext) => {
        try {
          this.webhookContext = context
          if (context !== undefined && context !== null) {
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
   * Pushes the requested changes to the SwitchBot API
   * deviceType  commandType  Command    command parameter  Description
   * RelaySwitch         "command"    "turnOff"  "default"      =   set to OFF state
   * RelaySwitch         "command"    "turnOn"   "default"      =   set to ON state
   */
  async pushChanges(): Promise<void> {
    if (this.BLE) {
      await this.BLEpushChanges()
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges()
    } else {
      await this.offlineOff()
      this.debugWarnLog(`Connection Type: ${this.device.connectionType}, pushChanges will not happen.`)
    }
    // Refresh the status from the API
    interval(15000)
      .pipe(skipWhile(() => this.relaySwitchUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus()
      })
  }

  async BLEpushChanges(): Promise<void> {
    this.debugLog('BLEpushChanges')
    if ((this.On !== this.accessory.context.On) || this.allowPush) {
      this.debugLog(`BLEpushChanges On: ${this.On} OnCached: ${this.accessory.context.On}`)
      const switchBotBLE = this.platform.switchBotBLE
      try {
        const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
        this.device.bleMac = formattedDeviceId
        this.debugLog(`bleMac: ${this.device.bleMac}`)
        switchBotBLE
          .discover({ model: this.device.bleModel, quick: true, id: this.device.bleMac })
          .then(async (device_list: SwitchbotDevice[]) => {
            const deviceList = device_list as WoRelaySwitch1[] | WoRelaySwitch1PM[]
            this.infoLog(`On: ${this.On}`)
            this.warnLog(`device_list: ${JSON.stringify(device_list)}`)
            return await this.retryBLE({
              max: this.maxRetryBLE(),
              fn: async () => {
                if (deviceList.length > 0) {
                  if (this.On) {
                    return await deviceList[0].turnOn()
                  } else {
                    return await deviceList[0].turnOff()
                  }
                } else {
                  throw new Error('No device found')
                }
              },
            })
          })
          .then(async () => {
            this.successLog(`On: ${this.On} sent over SwitchBot BLE, sent successfully`)
            await this.updateHomeKitCharacteristics()
          })
          .catch(async (e: any) => {
            await this.apiError(e)
            this.errorLog(`failed BLEpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
            await this.BLEPushConnection()
          })
      } catch (error) {
        this.errorLog(`failed to format device ID as MAC, Error: ${error}`)
      }
    } else {
      this.debugLog(`No Changes (BLEpushChanges), On: ${this.On} OnCached: ${this.accessory.context.On}`)
    }
  }

  async openAPIpushChanges(): Promise<void> {
    this.debugLog('openAPIpushChanges')
    if ((this.On !== this.accessory.context.On) || this.allowPush) {
      const bodyChange: bodyChange = {
        command: this.On ? 'turnOn' : 'turnOff',
        parameter: 'default',
        commandType: 'command',
      }
      this.debugLog(`SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`)
      try {
        const deviceStatus = await this.pushChangeRequest(bodyChange)
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
      this.debugLog(`No Changes (openAPIpushChanges), On: ${this.On} OnCached: ${this.accessory.context.On}`)
    }
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`value: ${value}`)
    const deviceTypeActions: { [key: string]: () => void } = {
      switch: () => this.On = value !== false,
      garagedoor: () => this.On = value !== this.hap.Characteristic.TargetDoorState.CLOSED,
      door: () => this.On = value !== 0,
      window: () => this.On = value !== 0,
      windowcovering: () => this.On = value !== 0,
      lock: () => this.On = value !== this.hap.Characteristic.LockTargetState.SECURED,
      faucet: () => this.On = value !== this.hap.Characteristic.Active.INACTIVE,
      fan: () => this.On = value !== 0,
      stateful: () => this.On = value !== 0,
      default: () => this.On = value !== false,
    }
    const action = deviceTypeActions[this.relaySwitchDeviceType] || deviceTypeActions.default
    action()
    this.doRelaySwitchUpdate.next()
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    this.debugLog('updateHomeKitCharacteristics')
    // State
    const updateCharacteristic = async (service: Service, characteristic: any, value: any, logMessage: string) => {
      service.updateCharacteristic(characteristic, value)
      this.debugLog(logMessage)
    }

    const stateActions: { [key: string]: () => Promise<void> } = {
      switch: async () => this.Switch && await updateCharacteristic(this.Switch.Service, this.hap.Characteristic.On, this.On, `updateCharacteristic On: ${this.On}`),
      garagedoor: async () => {
        if (this.GarageDoor) {
          const targetState = this.On ? this.hap.Characteristic.TargetDoorState.OPEN : this.hap.Characteristic.TargetDoorState.CLOSED
          const currentState = this.On ? this.hap.Characteristic.CurrentDoorState.OPEN : this.hap.Characteristic.CurrentDoorState.CLOSED
          await updateCharacteristic(this.GarageDoor.Service, this.hap.Characteristic.TargetDoorState, targetState, `updateCharacteristic TargetDoorState: ${targetState}, CurrentDoorState: ${currentState} (${this.On})`)
          await updateCharacteristic(this.GarageDoor.Service, this.hap.Characteristic.CurrentDoorState, currentState, '')
        }
      },
      door: async () => {
        if (this.Door) {
          const position = this.On ? 100 : 0
          await updateCharacteristic(this.Door.Service, this.hap.Characteristic.TargetPosition, position, `updateCharacteristic TargetPosition: ${position}, CurrentPosition: ${position} (${this.On})`)
          await updateCharacteristic(this.Door.Service, this.hap.Characteristic.CurrentPosition, position, '')
          await updateCharacteristic(this.Door.Service, this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED, '')
        }
      },
      window: async () => {
        if (this.Window) {
          const position = this.On ? 100 : 0
          await updateCharacteristic(this.Window.Service, this.hap.Characteristic.TargetPosition, position, `updateCharacteristic TargetPosition: ${position}, CurrentPosition: ${position} (${this.On})`)
          await updateCharacteristic(this.Window.Service, this.hap.Characteristic.CurrentPosition, position, '')
          await updateCharacteristic(this.Window.Service, this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED, '')
        }
      },
      windowcovering: async () => {
        if (this.WindowCovering) {
          const position = this.On ? 100 : 0
          await updateCharacteristic(this.WindowCovering.Service, this.hap.Characteristic.TargetPosition, position, `updateCharacteristic TargetPosition: ${position}, CurrentPosition: ${position} (${this.On})`)
          await updateCharacteristic(this.WindowCovering.Service, this.hap.Characteristic.CurrentPosition, position, '')
          await updateCharacteristic(this.WindowCovering.Service, this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED, '')
        }
      },
      lock: async () => {
        if (this.LockMechanism) {
          const targetState = this.On ? this.hap.Characteristic.LockTargetState.UNSECURED : this.hap.Characteristic.LockTargetState.SECURED
          const currentState = this.On ? this.hap.Characteristic.LockCurrentState.UNSECURED : this.hap.Characteristic.LockCurrentState.SECURED
          await updateCharacteristic(this.LockMechanism.Service, this.hap.Characteristic.LockTargetState, targetState, `updateCharacteristic LockTargetState: ${targetState}, LockCurrentState: ${currentState} (${this.On})`)
          await updateCharacteristic(this.LockMechanism.Service, this.hap.Characteristic.LockCurrentState, currentState, '')
        }
      },
      faucet: async () => this.Faucet && await updateCharacteristic(this.Faucet.Service, this.hap.Characteristic.Active, this.On ? this.hap.Characteristic.Active.ACTIVE : this.hap.Characteristic.Active.INACTIVE, `updateCharacteristic Active: ${this.On}`),
      fan: async () => this.Fan && await updateCharacteristic(this.Fan.Service, this.hap.Characteristic.Active, this.On ? this.hap.Characteristic.Active.ACTIVE : this.hap.Characteristic.Active.INACTIVE, `updateCharacteristic Active: ${this.On}`),
      stateful: async () => {
        if (this.StatefulProgrammableSwitch) {
          await updateCharacteristic(this.StatefulProgrammableSwitch.Service, this.hap.Characteristic.ProgrammableSwitchEvent, this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS, `updateCharacteristic ProgrammableSwitchEvent: SINGLE_PRESS (${this.On})`)
          await updateCharacteristic(this.StatefulProgrammableSwitch.Service, this.hap.Characteristic.ProgrammableSwitchOutputState, this.On ? 1 : 0, `updateCharacteristic ProgrammableSwitchOutputState: ${this.On ? 1 : 0}`)
        }
      },
      outlet: async () => this.Outlet && await updateCharacteristic(this.Outlet.Service, this.hap.Characteristic.On, this.On, `updateCharacteristic On: ${this.On}`),
      default: async () => this.errorLog(`relaySwitchDeviceType: ${this.relaySwitchDeviceType}, On: ${this.On}`),
    }

    const action = stateActions[this.relaySwitchDeviceType] || stateActions.default
    await action()
  }

  async removeService(accessory: PlatformAccessory, serviceType: string, serviceName: string): Promise<void> {
    const contextKey = serviceName.charAt(0).toUpperCase() + serviceName.slice(1)
    accessory.context[contextKey] = accessory.context[contextKey] ?? {}
    this[contextKey] = {
      Name: accessory.context[contextKey].Name ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service[serviceType]) as Service,
    }
    accessory.context[contextKey] = this[contextKey] as object
    this.debugWarnLog(`Removing any leftover ${contextKey} Service`)
    accessory.removeService(this[contextKey].Service)
  }

  async removeOutletService(accessory: PlatformAccessory): Promise<void> {
    await this.removeService(accessory, 'Outlet', 'outlet')
  }

  async removeGarageDoorService(accessory: PlatformAccessory): Promise<void> {
    await this.removeService(accessory, 'GarageDoorOpener', 'garageDoor')
  }

  async removeDoorService(accessory: PlatformAccessory): Promise<void> {
    await this.removeService(accessory, 'Door', 'door')
  }

  async removeLockService(accessory: PlatformAccessory): Promise<void> {
    await this.removeService(accessory, 'LockMechanism', 'lockMechanism')
  }

  async removeFaucetService(accessory: PlatformAccessory): Promise<void> {
    await this.removeService(accessory, 'Valve', 'faucet')
  }

  async removeFanService(accessory: PlatformAccessory): Promise<void> {
    await this.removeService(accessory, 'Fan', 'fan')
  }

  async removeWindowService(accessory: PlatformAccessory): Promise<void> {
    await this.removeService(accessory, 'Window', 'window')
  }

  async removeWindowCoveringService(accessory: PlatformAccessory): Promise<void> {
    await this.removeService(accessory, 'WindowCovering', 'windowCovering')
  }

  async removeStatefulProgrammableSwitchService(accessory: PlatformAccessory): Promise<void> {
    await this.removeService(accessory, 'StatefulProgrammableSwitch', 'statefulProgrammableSwitch')
  }

  async removeSwitchService(accessory: PlatformAccessory): Promise<void> {
    await this.removeService(accessory, 'Switch', 'switch')
  }

  async getRelaySwitchConfigSettings(device: device & devicesConfig) {
    // RelaySwitch Device Type
    this.relaySwitchDeviceType = (device as relaySwitch1Config | relaySwitch1PMConfig).type ?? 'Outlet'
    const relaySwitchDeviceType = (device as relaySwitch1Config | relaySwitch1PMConfig).type ? 'Device Config' : 'Default'
    this.debugWarnLog(`Use ${relaySwitchDeviceType} Device Type: ${this.relaySwitchDeviceType}`)
    // RelaySwitch Allow Push
    this.allowPush = (device as relaySwitch1Config | relaySwitch1PMConfig).allowPush ?? false
    const allowPush = (device as relaySwitch1Config | relaySwitch1PMConfig).allowPush
      ? `Using Allow Push: ${this.allowPush}`
      : `No Allow Push Set, Using default Allow Push: ${this.allowPush}`
    this.debugWarnLog(allowPush)
  }

  async BLEPushConnection() {
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog('Using OpenAPI Connection to Push Changes')
      await this.openAPIpushChanges()
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
      const updateCharacteristics = (service: Service, characteristics: { [key: string]: any }) => {
        for (const [characteristic, value] of Object.entries(characteristics)) {
          service.updateCharacteristic(this.hap.Characteristic[characteristic], value)
        }
      }

      const characteristicsMap: { [key: string]: { [key: string]: any } } = {
        garagedoor: { TargetDoorState: 'CLOSED', CurrentDoorState: 'CLOSED', ObstructionDetected: false },
        door: { TargetPosition: 0, CurrentPosition: 0, PositionState: 'STOPPED' },
        window: { TargetPosition: 0, CurrentPosition: 0, PositionState: 'STOPPED' },
        windowcovering: { TargetPosition: 0, CurrentPosition: 0, PositionState: 'STOPPED' },
        lock: { LockTargetState: 'SECURED', LockCurrentState: 'SECURED' },
        faucet: { Active: 'INACTIVE' },
        fan: { On: false },
        stateful: { ProgrammableSwitchEvent: 'SINGLE_PRESS', ProgrammableSwitchOutputState: 0 },
        switch: { On: false },
        outlet: { On: false },
      }

      const service = this[this.relaySwitchDeviceType.charAt(0).toUpperCase() + this.relaySwitchDeviceType.slice(1)]?.Service
      if (service) {
        updateCharacteristics(service, characteristicsMap[this.relaySwitchDeviceType])
      }
    }
  }

  async apiError(e: any): Promise<void> {
    const updateCharacteristics = (service: Service, characteristics: { [key: string]: any }) => {
      for (const [characteristic] of Object.entries(characteristics)) {
        service.updateCharacteristic(this.hap.Characteristic[characteristic], e)
      }
    }

    const characteristicsMap: { [key: string]: { [key: string]: any } } = {
      garagedoor: { TargetDoorState: e, CurrentDoorState: e, ObstructionDetected: e },
      door: { TargetPosition: e, CurrentPosition: e, PositionState: e },
      window: { TargetPosition: e, CurrentPosition: e, PositionState: e },
      windowcovering: { TargetPosition: e, CurrentPosition: e, PositionState: e },
      lock: { LockTargetState: e, LockCurrentState: e },
      faucet: { Active: e },
      fan: { On: e },
      stateful: { ProgrammableSwitchEvent: e, ProgrammableSwitchOutputState: e },
      switch: { On: e },
      outlet: { On: e },
    }

    const service = this[this.relaySwitchDeviceType.charAt(0).toUpperCase() + this.relaySwitchDeviceType.slice(1)]?.Service
    if (service) {
      updateCharacteristics(service, characteristicsMap[this.relaySwitchDeviceType])
    }
  }
}
