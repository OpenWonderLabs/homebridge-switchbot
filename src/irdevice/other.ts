/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * other.ts: @switchbot/homebridge-switchbot.
 */
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { SwitchBotPlatform } from '../platform.js'
import type { irDevicesConfig } from '../settings.js'
import type { irdevice } from '../types/irdevicelist.js'

import { irdeviceBase } from './irdevice.js'

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Others extends irdeviceBase {
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

  // Config
  otherDeviceType?: string

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device)

    // default placeholders
    this.getOtherConfigSettings(accessory, device)

    // deviceType
    if (this.otherDeviceType === 'switch') {
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
    } else if (this.otherDeviceType === 'garagedoor') {
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
    } else if (this.otherDeviceType === 'door') {
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
    } else if (this.otherDeviceType === 'window') {
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
    } else if (this.otherDeviceType === 'windowcovering') {
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
    } else if (this.otherDeviceType === 'lock') {
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
    } else if (this.otherDeviceType === 'faucet') {
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
    } else if (this.otherDeviceType === 'fan') {
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
    } else if (this.otherDeviceType === 'stateful') {
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
    } else if (this.otherDeviceType === 'outlet') {
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
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    if (this.otherDeviceType === 'switch') {
      if (this.Switch) {
        await this.debugLog(`Set On: ${value}`)
        this.On = value !== false
      }
    } else if (this.otherDeviceType === 'garagedoor') {
      if (this.GarageDoor) {
        await this.debugLog(`Set TargetDoorState: ${value}`)
        this.On = value !== this.hap.Characteristic.TargetDoorState.CLOSED
      }
    } else if (this.otherDeviceType === 'door') {
      if (this.Door) {
        await this.debugLog(`Set TargetPosition: ${value}`)
        this.On = value !== 0
      }
    } else if (this.otherDeviceType === 'window') {
      if (this.Window) {
        await this.debugLog(`Set TargetPosition: ${value}`)
        this.On = value !== 0
      }
    } else if (this.otherDeviceType === 'windowcovering') {
      if (this.WindowCovering) {
        await this.debugLog(`Set TargetPosition: ${value}`)
        this.On = value !== 0
      }
    } else if (this.otherDeviceType === 'lock') {
      if (this.LockMechanism) {
        await this.debugLog(`Set LockTargetState: ${value}`)
        this.On = value !== this.hap.Characteristic.LockTargetState.SECURED
      }
    } else if (this.otherDeviceType === 'faucet') {
      if (this.Faucet) {
        await this.debugLog(`Set Active: ${value}`)
        this.On = value !== this.hap.Characteristic.Active.INACTIVE
      }
    } else if (this.otherDeviceType === 'stateful') {
      if (this.StatefulProgrammableSwitch) {
        await this.debugLog(`Set ProgrammableSwitchOutputState: ${value}`)
        this.On = value !== 0
      }
    } else {
      if (this.Outlet) {
        await this.debugLog(`Set On: ${value}`)
        this.On = value !== false
      }
    }
    // pushChanges
    if (this.On === true) {
      await this.pushOnChanges(this.On)
    } else {
      await this.pushOffChanges(this.On)
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType    commandType     Command           command parameter           Description
   * Other -       "command"       "turnOff"         "default"          =        set to OFF state
   * Other -       "command"       "turnOn"          "default"          =        set to ON state
   * Other -       "command"       "volumeAdd"       "default"          =        volume up
   * Other -       "command"       "volumeSub"       "default"          =        volume down
   * Other -       "command"       "channelAdd"      "default"          =        next channel
   * Other -       "command"       "channelSub"      "default"          =        previous channel
   */
  async pushOnChanges(On: boolean): Promise<void> {
    await this.debugLog(`pushOnChanges On: ${On}, disablePushOn: ${this.disablePushOn}, customize: ${this.device.customize}, customOn: ${this.device.customOn}`)
    if (this.device.customize) {
      if (On === true && !this.disablePushOn) {
        const commandType: string = await this.commandType()
        const command: string = await this.commandOn()
        const bodyChange = JSON.stringify({
          command,
          parameter: 'default',
          commandType,
        })
        await this.pushChanges(bodyChange)
      }
    } else {
      this.errorLog('On Command not set')
    }
  }

  async pushOffChanges(On: boolean): Promise<void> {
    await this.debugLog(`pushOffChanges On: ${On}, disablePushOff: ${this.disablePushOff}, customize: ${this.device.customize}, customOff: ${this.device.customOff}`)
    if (this.device.customize) {
      if (On === false && !this.disablePushOff) {
        const commandType: string = await this.commandType()
        const command: string = await this.commandOff()
        const bodyChange = JSON.stringify({
          command,
          parameter: 'default',
          commandType,
        })
        await this.pushChanges(bodyChange)
      }
    } else {
      this.errorLog('Off Command not set.')
    }
  }

  async pushChanges(bodyChange: any): Promise<void> {
    await this.debugLog('pushChanges')
    if (this.device.connectionType === 'OpenAPI') {
      this.infoLog(`Sending request to SwitchBot API, body: ${bodyChange},`)
      try {
        const { body, statusCode } = await this.pushChangeRequest(bodyChange)
        const deviceStatus: any = await body.json()
        await this.pushStatusCodes(statusCode, deviceStatus)
        if (await this.successfulStatusCodes(statusCode, deviceStatus)) {
          await this.successfulPushChange(statusCode, deviceStatus, bodyChange)
          await this.updateHomeKitCharacteristics()
        } else {
          await this.statusCode(statusCode)
          await this.statusCode(deviceStatus.statusCode)
        }
      } catch (e: any) {
        await this.apiError(e)
        await this.pushChangeError(e)
      }
    } else {
      await this.warnLog(`Connection Type: ${this.device.connectionType}, commands will not be sent to OpenAPI`)
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    await this.debugLog('updateHomeKitCharacteristics')
    // State
    if (this.otherDeviceType === 'switch' && this.Switch) {
      if (this.On === undefined) {
        await this.debugLog(`On: ${this.On}`)
      } else {
        this.Switch.Service.updateCharacteristic(this.hap.Characteristic.On, this.On)
        await this.debugLog(`updateCharacteristic On: ${this.On}`)
      }
    } else if (this.otherDeviceType === 'garagedoor' && this.GarageDoor) {
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
    } else if (this.otherDeviceType === 'door' && this.Door) {
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
    } else if (this.otherDeviceType === 'window' && this.Window) {
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
    } else if (this.otherDeviceType === 'windowcovering' && this.WindowCovering) {
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
    } else if (this.otherDeviceType === 'lock' && this.LockMechanism) {
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
    } else if (this.otherDeviceType === 'faucet' && this.Faucet) {
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
    } else if (this.otherDeviceType === 'fan' && this.Fan) {
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
    } else if (this.otherDeviceType === 'stateful' && this.StatefulProgrammableSwitch) {
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
    } else if (this.otherDeviceType === 'outlet' && this.Outlet) {
      if (this.On === undefined) {
        await this.debugLog(`On: ${this.On}`)
      } else {
        this.Outlet.Service.updateCharacteristic(this.hap.Characteristic.On, this.On)
        await this.debugLog(`updateCharacteristic On: ${this.On}`)
      }
    } else {
      await this.errorLog(`otherDeviceType: ${this.otherDeviceType}, On: ${this.On}`)
    }
  }

  async apiError(e: any): Promise<void> {
    if (this.otherDeviceType === 'garagedoor') {
      if (this.GarageDoor) {
        this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, e)
        this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, e)
        this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.ObstructionDetected, e)
      }
    } else if (this.otherDeviceType === 'door') {
      if (this.Door) {
        this.Door.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e)
        this.Door.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e)
        this.Door.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e)
      }
    } else if (this.otherDeviceType === 'window') {
      if (this.Window) {
        this.Window.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e)
        this.Window.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e)
        this.Window.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e)
      }
    } else if (this.otherDeviceType === 'windowcovering') {
      if (this.WindowCovering) {
        this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e)
        this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e)
        this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e)
      }
    } else if (this.otherDeviceType === 'lock') {
      if (this.LockMechanism) {
        this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState, e)
        this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState, e)
      }
    } else if (this.otherDeviceType === 'faucet') {
      if (this.Faucet) {
        this.Faucet.Service.updateCharacteristic(this.hap.Characteristic.Active, e)
      }
    } else if (this.otherDeviceType === 'fan') {
      if (this.Fan) {
        this.Fan.Service.updateCharacteristic(this.hap.Characteristic.On, e)
      }
    } else if (this.otherDeviceType === 'stateful') {
      if (this.StatefulProgrammableSwitch) {
        this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent, e)
        this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, e)
      }
    } else if (this.otherDeviceType === 'switch') {
      if (this.Switch) {
        this.Switch.Service.updateCharacteristic(this.hap.Characteristic.On, e)
      }
    } else {
      if (this.Outlet) {
        this.Outlet.Service.updateCharacteristic(this.hap.Characteristic.On, e)
      }
    }
  }

  async removeOutletService(accessory: PlatformAccessory): Promise<void> {
    // If Outlet.Service still present, then remove first
    accessory.context.Outlet = accessory.context.Outlet ?? {}
    this.Outlet = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.Outlet) as Service,
    }
    accessory.context.Outlet = this.Outlet as object
    this.warnLog('Removing any leftover Outlet Service')
    accessory.removeService(this.Outlet.Service)
  }

  async removeGarageDoorService(accessory: PlatformAccessory): Promise<void> {
    // If GarageDoor.Service still present, then remove first
    accessory.context.GarageDoor = accessory.context.GarageDoor ?? {}
    this.GarageDoor = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.GarageDoorOpener) as Service,
    }
    accessory.context.GarageDoor = this.GarageDoor as object
    this.warnLog('Removing any leftover Garage Door Service')
    accessory.removeService(this.GarageDoor.Service)
  }

  async removeDoorService(accessory: PlatformAccessory): Promise<void> {
    // If Door.Service still present, then remove first
    accessory.context.Door = accessory.context.Door ?? {}
    this.Door = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.Door) as Service,
    }
    accessory.context.Door = this.Door as object
    this.warnLog('Removing any leftover Door Service')
    accessory.removeService(this.Door.Service)
  }

  async removeLockService(accessory: PlatformAccessory): Promise<void> {
    // If Lock.Service still present, then remove first
    accessory.context.LockMechanism = accessory.context.LockMechanism ?? {}
    this.LockMechanism = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.LockMechanism) as Service,
    }
    accessory.context.LockMechanism = this.LockMechanism as object
    this.warnLog('Removing any leftover Lock Service')
    accessory.removeService(this.LockMechanism.Service)
  }

  async removeFaucetService(accessory: PlatformAccessory): Promise<void> {
    // If Faucet.Service still present, then remove first
    accessory.context.Faucet = accessory.context.Faucet ?? {}
    this.Faucet = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.Faucet) as Service,
    }
    accessory.context.Faucet = this.Faucet as object
    this.warnLog('Removing any leftover Faucet Service')
    accessory.removeService(this.Faucet.Service)
  }

  async removeFanService(accessory: PlatformAccessory): Promise<void> {
    // If Fan Service still present, then remove first
    accessory.context.Fan = accessory.context.Fan ?? {}
    this.Fan = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.Fanv2) as Service,
    }
    accessory.context.Fan = this.Fan as object
    this.warnLog('Removing any leftover Fan Service')
    accessory.removeService(this.Fan.Service)
  }

  async removeWindowService(accessory: PlatformAccessory): Promise<void> {
    // If Window.Service still present, then remove first
    accessory.context.Window = accessory.context.Window ?? {}
    this.Window = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.Window) as Service,
    }
    accessory.context.Window = this.Window as object
    this.warnLog('Removing any leftover Window Service')
    accessory.removeService(this.Window.Service)
  }

  async removeWindowCoveringService(accessory: PlatformAccessory): Promise<void> {
    // If WindowCovering.Service still present, then remove first
    accessory.context.WindowCovering = accessory.context.WindowCovering ?? {}
    this.WindowCovering = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.WindowCovering) as Service,
    }
    accessory.context.WindowCovering = this.WindowCovering as object
    this.warnLog('Removing any leftover Window Covering Service')
    accessory.removeService(this.WindowCovering.Service)
  }

  async removeStatefulProgrammableSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If StatefulProgrammableSwitch.Service still present, then remove first
    accessory.context.StatefulProgrammableSwitch = accessory.context.StatefulProgrammableSwitch ?? {}
    this.StatefulProgrammableSwitch = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.StatefulProgrammableSwitch) as Service,
    }
    accessory.context.StatefulProgrammableSwitch = this.StatefulProgrammableSwitch as object
    this.warnLog('Removing any leftover Stateful Programmable Switch Service')
    accessory.removeService(this.StatefulProgrammableSwitch.Service)
  }

  async removeSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If Switch.Service still present, then remove first
    accessory.context.Switch = accessory.context.Switch ?? {}
    this.Switch = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.Switch) as Service,
    }
    accessory.context.Switch = this.Switch as object
    this.warnLog('Removing any leftover Switch Service')
    accessory.removeService(this.Switch.Service)
  }

  async getOtherConfigSettings(accessory: PlatformAccessory, device: irdevice & irDevicesConfig): Promise<void> {
    this.otherDeviceType = accessory.context.otherDeviceType
      ? accessory.context.otherDeviceType
      : device.other?.deviceType ? device.other.deviceType : 'outlet'
    const deviceType = accessory.context.otherDeviceType ? 'Accessory Cache' : device.other?.deviceType ? 'Device Config' : 'Default'
    await this.debugLog(`Use ${deviceType} Type: ${this.otherDeviceType}`)
  }
}
