/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * airpurifier.ts: @switchbot/homebridge-switchbot.
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
export class AirPurifier extends irdeviceBase {
  // Services
  private AirPurifier: {
    Name: CharacteristicValue
    Service: Service
    Active: CharacteristicValue
    RotationSpeed: CharacteristicValue
    CurrentAirPurifierState: CharacteristicValue
    TargetAirPurifierState: CharacteristicValue
    CurrentHeaterCoolerState: CharacteristicValue
  }

  private TemperatureSensor: {
    Name: CharacteristicValue
    Service: Service
    CurrentTemperature: CharacteristicValue
  }

  // Characteristic Values
  APActive!: CharacteristicValue
  CurrentAPTemp!: CharacteristicValue
  CurrentAPMode!: CharacteristicValue
  CurrentAPFanSpeed!: CharacteristicValue

  // Others
  Busy: any
  Timeout: any = null
  static IDLE: number
  CurrentMode!: number
  static INACTIVE: number
  LastTemperature!: number
  CurrentFanSpeed!: number
  static PURIFYING_AIR: number

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device)
    // Set category
    accessory.category = this.hap.Categories.AIR_PURIFIER

    // Initialize AirPurifier Service
    accessory.context.AirPurifier = accessory.context.AirPurifier ?? {}
    this.AirPurifier = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.AirPurifier) ?? accessory.addService(this.hap.Service.AirPurifier) as Service,
      Active: accessory.context.Active ?? this.hap.Characteristic.Active.INACTIVE,
      RotationSpeed: accessory.context.RotationSpeed ?? 0,
      CurrentAirPurifierState: accessory.context.CurrentAirPurifierState ?? this.hap.Characteristic.CurrentAirPurifierState.INACTIVE,
      TargetAirPurifierState: accessory.context.TargetAirPurifierState ?? this.hap.Characteristic.TargetAirPurifierState.AUTO,
      CurrentHeaterCoolerState: accessory.context.CurrentHeaterCoolerState ?? this.hap.Characteristic.CurrentHeaterCoolerState.INACTIVE,
    }
    accessory.context.AirPurifier = this.AirPurifier as object

    this.AirPurifier.Service.setCharacteristic(this.hap.Characteristic.Name, this.AirPurifier.Name).getCharacteristic(this.hap.Characteristic.Active).onGet(() => {
      return this.AirPurifier.Active
    }).onSet(this.ActiveSet.bind(this))

    this.AirPurifier.Service.getCharacteristic(this.hap.Characteristic.CurrentAirPurifierState).onGet(() => {
      return this.CurrentAirPurifierStateGet()
    })

    this.AirPurifier.Service.getCharacteristic(this.hap.Characteristic.TargetAirPurifierState).onGet(() => {
      return this.AirPurifier.TargetAirPurifierState
    }).onSet(this.TargetAirPurifierStateSet.bind(this))

    // Initialize TemperatureSensor Service
    accessory.context.TemperatureSensor = accessory.context.TemperatureSensor ?? {}
    this.TemperatureSensor = {
      Name: `${accessory.displayName} Temperature Sensor`,
      Service: accessory.getService(this.hap.Service.TemperatureSensor) ?? accessory.addService(this.hap.Service.TemperatureSensor) as Service,
      CurrentTemperature: accessory.context.CurrentTemperature || 24,
    }
    accessory.context.TemperatureSensor = this.TemperatureSensor as object

    this.TemperatureSensor.Service.setCharacteristic(this.hap.Characteristic.Name, this.TemperatureSensor.Name).getCharacteristic(this.hap.Characteristic.CurrentTemperature).onGet(() => {
      return this.TemperatureSensor.CurrentTemperature
    })
  }

  async ActiveSet(value: CharacteristicValue): Promise<void> {
    await this.debugLog(`Set Active: ${value}`)

    this.AirPurifier.Active = value
    if (this.AirPurifier.Active === this.hap.Characteristic.Active.ACTIVE) {
      this.pushAirPurifierOnChanges()
    } else {
      this.pushAirPurifierOffChanges()
    }
  }

  async TargetAirPurifierStateSet(value: CharacteristicValue): Promise<void> {
    switch (value) {
      case this.hap.Characteristic.CurrentAirPurifierState.PURIFYING_AIR:
        this.CurrentMode = AirPurifier.PURIFYING_AIR
        break
      case this.hap.Characteristic.CurrentAirPurifierState.IDLE:
        this.CurrentMode = AirPurifier.IDLE
        break
      case this.hap.Characteristic.CurrentAirPurifierState.INACTIVE:
        this.CurrentMode = AirPurifier.INACTIVE
        break
      default:
        break
    }
  }

  async CurrentAirPurifierStateGet(): Promise<number> {
    if (this.AirPurifier.Active === 1) {
      this.AirPurifier.CurrentAirPurifierState = this.hap.Characteristic.CurrentAirPurifierState.PURIFYING_AIR
    } else {
      this.AirPurifier.CurrentAirPurifierState = this.hap.Characteristic.CurrentAirPurifierState.INACTIVE
    }
    return this.AirPurifier.CurrentAirPurifierState
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType          commandType     Command          command parameter          Description
   * AirPurifier:        "command"       "turnOn"         "default"         =        every home appliance can be turned on by default
   * AirPurifier:        "command"       "turnOff"        "default"         =        every home appliance can be turned off by default
   * AirPurifier:        "command"       "swing"          "default"         =        swing
   * AirPurifier:        "command"       "timer"          "default"         =        timer
   * AirPurifier:        "command"       "lowSpeed"       "default"         =        fan speed to low
   * AirPurifier:        "command"       "middleSpeed"    "default"         =        fan speed to medium
   * AirPurifier:        "command"       "highSpeed"      "default"         =        fan speed to high
   */
  async pushAirPurifierOnChanges(): Promise<void> {
    await this.debugLog(`pushAirPurifierOnChanges Active: ${this.AirPurifier.Active}, disablePushOn: ${this.disablePushOn}`)
    if (this.AirPurifier.Active === this.hap.Characteristic.Active.ACTIVE && !this.disablePushOn) {
      const commandType: string = await this.commandType()
      const command: string = await this.commandOn()
      const bodyChange = JSON.stringify({
        command,
        parameter: 'default',
        commandType,
      })
      await this.pushChanges(bodyChange)
    }
  }

  async pushAirPurifierOffChanges(): Promise<void> {
    await this.debugLog(`pushAirPurifierOffChanges Active: ${this.AirPurifier.Active}, disablePushOff: ${this.disablePushOff}`)
    if (this.AirPurifier.Active === this.hap.Characteristic.Active.INACTIVE && !this.disablePushOn) {
      const commandType: string = await this.commandType()
      const command: string = await this.commandOff()
      const bodyChange = JSON.stringify({
        command,
        parameter: 'default',
        commandType,
      })
      await this.pushChanges(bodyChange)
    }
  }

  async pushAirPurifierStatusChanges(): Promise<void> {
    await this.debugLog(`pushAirPurifierStatusChanges Active: ${this.AirPurifier.Active}, disablePushOff: ${this.disablePushOff},  disablePushOn: ${this.disablePushOn}`)
    if (!this.Busy) {
      this.Busy = true
      this.AirPurifier.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.IDLE
    }
    clearTimeout(this.Timeout)

    // Make a new Timeout set to go off in 1000ms (1 second)
    this.Timeout = setTimeout(this.pushAirPurifierDetailsChanges.bind(this), 1500)
  }

  async pushAirPurifierDetailsChanges(): Promise<void> {
    await this.debugLog(`pushAirPurifierDetailsChanges Active: ${this.AirPurifier.Active}, disablePushOff: ${this.disablePushOff},  disablePushOn: ${this.disablePushOn}`)
    this.CurrentAPTemp = this.TemperatureSensor!.CurrentTemperature ?? 24
    this.CurrentAPMode = this.CurrentMode ?? 1
    this.CurrentAPFanSpeed = this.CurrentFanSpeed ?? 1
    this.APActive = this.AirPurifier.Active === 1 ? 'on' : 'off'
    const parameter = `${this.CurrentAPTemp},${this.CurrentAPMode},${this.CurrentAPFanSpeed},${this.APActive}`
    const bodyChange = JSON.stringify({
      command: 'setAll',
      parameter: `${parameter}`,
      commandType: 'command',
    })
    if (this.AirPurifier.Active === 1) {
      if ((Number(this.TemperatureSensor!.CurrentTemperature) || 24) < (this.LastTemperature || 30)) {
        this.AirPurifier.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.COOLING
      } else {
        this.AirPurifier.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.HEATING
      }
    } else {
      this.AirPurifier.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.INACTIVE
    }
    await this.pushChanges(bodyChange)
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
      this.warnLog(`Connection Type: ${this.device.connectionType}, commands will not be sent to OpenAPI`)
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    await this.debugLog('updateHomeKitCharacteristics')
    // Active
    await this.updateCharacteristic(this.AirPurifier.Service, this.hap.Characteristic.Active, this.AirPurifier.Active, 'Active')
    // CurrentAirPurifierState
    await this.updateCharacteristic(this.AirPurifier.Service, this.hap.Characteristic.CurrentAirPurifierState, this.AirPurifier.CurrentAirPurifierState, 'CurrentAirPurifierState')
    // CurrentHeaterCoolerState
    await this.updateCharacteristic(this.AirPurifier.Service, this.hap.Characteristic.CurrentHeaterCoolerState, this.AirPurifier.CurrentHeaterCoolerState, 'CurrentHeaterCoolerState')
    // CurrentTemperature
    await this.updateCharacteristic(this.TemperatureSensor.Service, this.hap.Characteristic.CurrentTemperature, this.TemperatureSensor.CurrentTemperature, 'CurrentTemperature')
  }

  async apiError(e: any): Promise<void> {
    this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.Active, e)
    this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.TargetAirPurifierState, e)
    this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentAirPurifierState, e)
    this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentHeaterCoolerState, e)
    this.TemperatureSensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, e)
  }
}
