/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * airconditioners.ts: @switchbot/homebridge-switchbot.
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
export class AirConditioner extends irdeviceBase {
  // Services
  private HeaterCooler: {
    Name: CharacteristicValue
    Service: Service
    Active: CharacteristicValue
    CurrentHeaterCoolerState: CharacteristicValue
    TargetHeaterCoolerState: CharacteristicValue
    CurrentTemperature: CharacteristicValue
    ThresholdTemperature: CharacteristicValue
    RotationSpeed: CharacteristicValue
  }

  meter?: PlatformAccessory

  private HumiditySensor?: {
    Name: CharacteristicValue
    Service: Service
    CurrentRelativeHumidity: CharacteristicValue
  }

  // Others
  state!: string
  Busy: any
  Timeout: any = null
  CurrentMode!: number
  ValidValues: number[]
  CurrentFanSpeed!: number

  // Config
  hide_automode?: boolean
  set_max_heat?: number
  set_min_heat?: number
  set_max_cool?: number
  set_min_cool?: number

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device)
    // Set category
    accessory.category = this.hap.Categories.AIR_CONDITIONER

    // default placeholders
    this.getAirConditionerConfigSettings(accessory, device)

    this.ValidValues = this.hide_automode ? [1, 2] : [0, 1, 2]

    // Initialize HeaterCooler Service
    accessory.context.HeaterCooler = accessory.context.HeaterCooler ?? {}
    this.HeaterCooler = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.HeaterCooler) ?? accessory.addService(this.hap.Service.HeaterCooler) as Service,
      Active: accessory.context.Active ?? this.hap.Characteristic.Active.INACTIVE,
      CurrentHeaterCoolerState: accessory.context.CurrentHeaterCoolerState ?? this.hap.Characteristic.CurrentHeaterCoolerState.IDLE,
      TargetHeaterCoolerState: accessory.context.TargetHeaterCoolerState ?? this.hap.Characteristic.TargetHeaterCoolerState.AUTO,
      CurrentTemperature: accessory.context.CurrentTemperature ?? 24,
      ThresholdTemperature: accessory.context.ThresholdTemperature ?? 24,
      RotationSpeed: accessory.context.RotationSpeed ?? 4,
    }
    accessory.context.HeaterCooler = this.HeaterCooler as object

    this.HeaterCooler.Service.setCharacteristic(this.hap.Characteristic.Name, this.HeaterCooler.Name).getCharacteristic(this.hap.Characteristic.Active).onGet(() => {
      return this.HeaterCooler.Active
    }).onSet(this.ActiveSet.bind(this))

    this.HeaterCooler.Service.getCharacteristic(this.hap.Characteristic.CurrentTemperature).onGet(async () => {
      return await this.CurrentTemperatureGet()
    })

    this.HeaterCooler.Service.getCharacteristic(this.hap.Characteristic.TargetHeaterCoolerState).setProps({
      validValues: this.ValidValues,
    }).onGet(async () => {
      return await this.TargetHeaterCoolerStateGet()
    }).onSet(this.TargetHeaterCoolerStateSet.bind(this))

    this.HeaterCooler.Service.getCharacteristic(this.hap.Characteristic.CurrentHeaterCoolerState).onGet(async () => {
      return await this.CurrentHeaterCoolerStateGet()
    })

    this.HeaterCooler.Service.getCharacteristic(this.hap.Characteristic.HeatingThresholdTemperature).setProps({
      minValue: this.set_min_heat,
      maxValue: this.set_max_heat,
      minStep: 0.5,
    }).onGet(async () => {
      return await this.ThresholdTemperatureGet()
    }).onSet(this.ThresholdTemperatureSet.bind(this))

    this.HeaterCooler.Service.getCharacteristic(this.hap.Characteristic.CoolingThresholdTemperature).setProps({
      minValue: this.set_min_cool,
      maxValue: this.set_max_cool,
      minStep: 0.5,
    }).onGet(async () => {
      return await this.ThresholdTemperatureGet()
    }).onSet(this.ThresholdTemperatureSet.bind(this))

    this.HeaterCooler.Service.getCharacteristic(this.hap.Characteristic.RotationSpeed).setProps({
      format: 'int',
      minStep: 1,
      minValue: 1,
      maxValue: 4,
    }).onGet(async () => {
      return await this.RotationSpeedGet()
    }).onSet(this.RotationSpeedSet.bind(this))

    // Initialize HumiditySensor property

    if (this.device.irair?.meterType && this.device.irair?.meterId) {
      const meterUuid = this.platform.api.hap.uuid.generate(`${this.device.irair.meterId}-${this.device.irair.meterType}`)
      this.meter = this.platform.accessories.find(accessory => accessory.UUID === meterUuid)
      accessory.context.HumiditySensor = accessory.context.HumiditySensor ?? {}
      this.HumiditySensor = {
        Name: this.meter!.displayName,
        Service: this.meter!.getService(this.hap.Service.HumiditySensor) ?? this.meter!.addService(this.hap.Service.HumiditySensor) as Service,
        CurrentRelativeHumidity: this.meter!.context.CurrentRelativeHumidity || 0,
      }
      accessory.context.HumiditySensor = this.HumiditySensor as object
    }

    if (this.device.irair?.meterType && this.device.irair?.meterId) {
      const meterUuid = this.platform.api.hap.uuid.generate(`${this.device.irair.meterId}-${this.device.irair.meterType}`)
      this.meter = this.platform.accessories.find(accessory => accessory.UUID === meterUuid)
    }

    if (this.meter && this.HumiditySensor) {
      this.HumiditySensor.Service.setCharacteristic(this.hap.Characteristic.Name, this.HumiditySensor.Name).getCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity).onGet(async () => {
        return await this.CurrentRelativeHumidityGet()
      })
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType             commandType     Command            command parameter                    Description
   * AirConditioner:        "command"       "swing"            "default"                   =        swing
   * AirConditioner:        "command"       "timer"            "default"                   =        timer
   * AirConditioner:        "command"       "lowSpeed"         "default"                   =        fan speed to low
   * AirConditioner:        "command"       "middleSpeed"      "default"                   =        fan speed to medium
   * AirConditioner:        "command"       "highSpeed"        "default"                   =        fan speed to high
   */
  async pushAirConditionerOnChanges(): Promise<void> {
    await this.debugLog(`pushAirConditionerOnChanges Active: ${this.HeaterCooler.Active}, disablePushOn: ${this.disablePushOn}`)
    if (this.HeaterCooler.Active === this.hap.Characteristic.Active.ACTIVE && !this.disablePushOn) {
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

  async pushAirConditionerOffChanges(): Promise<void> {
    await this.debugLog(`pushAirConditionerOffChanges Active: ${this.HeaterCooler.Active}, disablePushOff: ${this.disablePushOff}`)
    if (this.HeaterCooler.Active === this.hap.Characteristic.Active.INACTIVE && !this.disablePushOff) {
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

  async pushAirConditionerStatusChanges(): Promise<void> {
    await this.debugLog(`pushAirConditionerStatusChanges Active: ${this.HeaterCooler.Active}, disablePushOff: ${this.disablePushOff},  disablePushOn: ${this.disablePushOn}`)
    if (!this.Busy) {
      this.Busy = true
      this.HeaterCooler.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.IDLE
    }
    clearTimeout(this.Timeout)

    // Make a new Timeout set to go off in 1000ms (1 second)
    this.Timeout = setTimeout(this.pushAirConditionerDetailsChanges.bind(this), 1500)
  }

  async pushAirConditionerDetailsChanges(): Promise<void> {
    await this.debugLog(`pushAirConditionerDetailsChanges Active: ${this.HeaterCooler.Active}, disablePushOff: ${this.disablePushOff},  disablePushOn: ${this.disablePushOn}`)
    // await this.deviceContext();
    if (this.CurrentMode === undefined) {
      this.CurrentMode = 1
    }
    if (this.CurrentFanSpeed === undefined) {
      this.CurrentFanSpeed = 1
    }
    if (this.HeaterCooler.Active === this.hap.Characteristic.Active.ACTIVE) {
      this.state = 'on'
    } else {
      this.state = 'off'
    }
    if (this.CurrentMode === 1) {
      // Remove or make configurable?
      this.HeaterCooler.ThresholdTemperature = 25
      await this.debugLog(`CurrentMode: ${this.CurrentMode}, ThresholdTemperature: ${this.HeaterCooler.ThresholdTemperature}`)
    }
    const parameter = `${this.HeaterCooler.ThresholdTemperature},${this.CurrentMode},${this.CurrentFanSpeed},${this.state}`

    await this.UpdateCurrentHeaterCoolerState()
    const bodyChange = JSON.stringify({
      command: 'setAll',
      parameter: `${parameter}`,
      commandType: 'command',
    })

    await this.pushChanges(bodyChange)
  }

  private async UpdateCurrentHeaterCoolerState() {
    if (this.HeaterCooler.Active === this.hap.Characteristic.Active.ACTIVE) {
      if (this.HeaterCooler.Active === undefined) {
        this.HeaterCooler.Active = this.hap.Characteristic.Active.INACTIVE
      } else {
        this.HeaterCooler.Active = this.HeaterCooler.Active ? this.HeaterCooler.Active : this.accessory.context.Active
      }

      if (this.HeaterCooler.CurrentTemperature === undefined && this.accessory.context.CurrentTemperature === undefined) {
        this.HeaterCooler.CurrentTemperature = 24
      } else {
        this.HeaterCooler.CurrentTemperature = this.HeaterCooler.CurrentTemperature || this.accessory.context.CurrentTemperature
      }

      if (this.HeaterCooler.ThresholdTemperature === undefined && this.accessory.context.ThresholdTemperature === undefined) {
        this.HeaterCooler.ThresholdTemperature = 24
      } else {
        this.HeaterCooler.ThresholdTemperature = this.HeaterCooler.ThresholdTemperature || this.accessory.context.ThresholdTemperature
      }

      if (this.HeaterCooler.RotationSpeed === undefined && this.accessory.context.RotationSpeed === undefined) {
        this.HeaterCooler.RotationSpeed = 4
      } else {
        this.HeaterCooler.RotationSpeed = this.HeaterCooler.RotationSpeed || this.accessory.context.RotationSpeed
      }

      if (this.device.irair?.hide_automode) {
        this.hide_automode = this.device.irair?.hide_automode
        this.accessory.context.hide_automode = this.hide_automode
      } else {
        this.hide_automode = this.device.irair?.hide_automode
        this.accessory.context.hide_automode = this.hide_automode
      }

      if (this.device.irair?.set_max_heat) {
        this.set_max_heat = this.device.irair?.set_max_heat
        this.accessory.context.set_max_heat = this.set_max_heat
      } else {
        this.set_max_heat = 35
        this.accessory.context.set_max_heat = this.set_max_heat
      }
      if (this.device.irair?.set_min_heat) {
        this.set_min_heat = this.device.irair?.set_min_heat
        this.accessory.context.set_min_heat = this.set_min_heat
      } else {
        this.set_min_heat = 0
        this.accessory.context.set_min_heat = this.set_min_heat
      }

      if (this.device.irair?.set_max_cool) {
        this.set_max_cool = this.device.irair?.set_max_cool
        this.accessory.context.set_max_cool = this.set_max_cool
      } else {
        this.set_max_cool = 35
        this.accessory.context.set_max_cool = this.set_max_cool
      }
      if (this.device.irair?.set_min_cool) {
        this.set_min_cool = this.device.irair?.set_min_cool
        this.accessory.context.set_min_cool = this.set_min_cool
      } else {
        this.set_min_cool = 0
        this.accessory.context.set_min_cool = this.set_min_cool
      }

      if (this.meter) {
        if (this.HumiditySensor!.CurrentRelativeHumidity === undefined && this.accessory.context.CurrentRelativeHumidity === undefined) {
          this.HumiditySensor!.CurrentRelativeHumidity = 0
        } else {
          this.HumiditySensor!.CurrentRelativeHumidity = this.HumiditySensor!.CurrentRelativeHumidity ?? this.accessory.context.CurrentRelativeHumidity
        }
      }
      if (this.HeaterCooler.ThresholdTemperature < this.HeaterCooler.CurrentTemperature
        && this.HeaterCooler.TargetHeaterCoolerState !== this.hap.Characteristic.TargetHeaterCoolerState.HEAT) {
        this.HeaterCooler.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.COOLING
      } else if (this.HeaterCooler.ThresholdTemperature > this.HeaterCooler.CurrentTemperature && this.HeaterCooler.TargetHeaterCoolerState !== this.hap.Characteristic.TargetHeaterCoolerState.COOL) {
        this.HeaterCooler.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.HEATING
      } else {
        this.HeaterCooler.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.IDLE
      }
    } else {
      this.HeaterCooler.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.INACTIVE
    }
  }

  async pushChanges(bodyChange: any): Promise<void> {
    await this.debugLog('pushChanges')
    if (this.device.connectionType === 'OpenAPI' && !this.disablePushDetail) {
      await this.infoLog(`Sending request to SwitchBot API, body: ${bodyChange},`)
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
      await this.debugLog(`Connection Type: ${this.device.connectionType}, disablePushDetails: ${this.disablePushDetail}`)
      await this.updateHomeKitCharacteristics()
    }
  }

  async CurrentTemperatureGet(): Promise<CharacteristicValue> {
    if (this.meter?.context?.CurrentTemperature) {
      this.accessory.context.CurrentTemperature = this.meter.context.CurrentTemperature
      await this.debugLog(`Using CurrentTemperature from ${this.meter.context.deviceType} (${this.meter.context.deviceId})`)
    }

    this.HeaterCooler.CurrentTemperature = this.accessory.context.CurrentTemperature || 24
    await this.debugLog(`Get CurrentTemperature: ${this.HeaterCooler.CurrentTemperature}`)
    return this.HeaterCooler.CurrentTemperature
  }

  async CurrentRelativeHumidityGet(): Promise<CharacteristicValue> {
    if (this.meter?.context?.CurrentRelativeHumidity) {
      this.accessory.context.CurrentRelativeHumidity = this.meter.context.CurrentRelativeHumidity
      await this.debugLog(`Using CurrentRelativeHumidity from ${this.meter.context.deviceType} (${this.meter.context.deviceId})`)
    }

    this.HumiditySensor!.CurrentRelativeHumidity = this.accessory.context.CurrentRelativeHumidity || 0
    await this.debugLog(`Get CurrentRelativeHumidity: ${this.HumiditySensor!.CurrentRelativeHumidity}`)
    return this.HumiditySensor!.CurrentRelativeHumidity as CharacteristicValue
  }

  async RotationSpeedGet(): Promise<number> {
    if (!this.CurrentFanSpeed || this.CurrentFanSpeed === 1) {
      this.HeaterCooler.RotationSpeed = 4
    } else {
      this.HeaterCooler.RotationSpeed = this.CurrentFanSpeed - 1
    }
    await this.debugLog(`Get RotationSpeed: ${this.HeaterCooler.RotationSpeed}`)
    return this.HeaterCooler.RotationSpeed
  }

  async RotationSpeedSet(value: CharacteristicValue): Promise<void> {
    if (value === 4) {
      this.CurrentFanSpeed = 1
    } else {
      this.CurrentFanSpeed = Number(value) + 1
    }
    this.HeaterCooler.RotationSpeed = value
    await this.debugLog(`Set RotationSpeed: ${this.HeaterCooler.RotationSpeed}, CurrentFanSpeed: ${this.CurrentFanSpeed}`)
    this.pushAirConditionerStatusChanges()
  }

  async ActiveSet(value: CharacteristicValue): Promise<void> {
    await this.debugLog(`Set Active: ${value}`)

    this.HeaterCooler.Active = value
    if (this.HeaterCooler.Active === this.hap.Characteristic.Active.ACTIVE) {
      await this.debugLog(`pushAirConditionerOnChanges, Active: ${this.HeaterCooler.Active}`)
      if (this.disablePushOn) {
        this.pushAirConditionerStatusChanges()
      } else {
        this.pushAirConditionerOnChanges()
      }
    } else {
      await this.debugLog(`pushAirConditionerOffChanges, Active: ${this.HeaterCooler.Active}`)
      this.pushAirConditionerOffChanges()
    }
  }

  async TargetHeaterCoolerStateGet(): Promise<CharacteristicValue> {
    const targetState = this.HeaterCooler.TargetHeaterCoolerState || this.accessory.context.TargetHeaterCoolerState
    this.HeaterCooler.TargetHeaterCoolerState = this.ValidValues.includes(targetState) ? targetState : this.ValidValues[0]
    await this.debugLog(`Get (${this.getTargetHeaterCoolerStateName()}) TargetHeaterCoolerState: ${this.HeaterCooler.TargetHeaterCoolerState}, ValidValues: ${this.ValidValues},  hide_automode: ${this.hide_automode}`)
    return this.HeaterCooler.TargetHeaterCoolerState
  }

  async TargetHeaterCoolerStateSet(value: CharacteristicValue): Promise<void> {
    if (!this.hide_automode && value === this.hap.Characteristic.TargetHeaterCoolerState.AUTO) {
      this.TargetHeaterCoolerStateAUTO()
    } else if (value === this.hap.Characteristic.TargetHeaterCoolerState.HEAT) {
      this.TargetHeaterCoolerStateHEAT()
    } else if (value === this.hap.Characteristic.TargetHeaterCoolerState.COOL) {
      this.TargetHeaterCoolerStateCOOL()
    } else {
      this.errorLog(`Set TargetHeaterCoolerState: ${this.HeaterCooler.TargetHeaterCoolerState}, hide_automode: ${this.hide_automode} `)
    }
    this.pushAirConditionerStatusChanges()
  }

  async TargetHeaterCoolerStateAUTO(): Promise<void> {
    this.HeaterCooler.TargetHeaterCoolerState = this.hap.Characteristic.TargetHeaterCoolerState.AUTO
    this.CurrentMode = 1
    await this.debugLog(`Set (AUTO) TargetHeaterCoolerState: ${this.HeaterCooler.TargetHeaterCoolerState}`)
    await this.debugLog(`Switchbot CurrentMode: ${this.CurrentMode}`)
  }

  async TargetHeaterCoolerStateCOOL(): Promise<void> {
    this.HeaterCooler.TargetHeaterCoolerState = this.hap.Characteristic.TargetHeaterCoolerState.COOL
    this.CurrentMode = 2
    await this.debugLog(`Set (COOL) TargetHeaterCoolerState: ${this.HeaterCooler.TargetHeaterCoolerState}`)
    await this.debugLog(`Switchbot CurrentMode: ${this.CurrentMode}`)
  }

  async TargetHeaterCoolerStateHEAT(): Promise<void> {
    this.HeaterCooler.TargetHeaterCoolerState = this.hap.Characteristic.TargetHeaterCoolerState.HEAT
    this.CurrentMode = 5
    await this.debugLog(`Set (HEAT) TargetHeaterCoolerState: ${this.HeaterCooler.TargetHeaterCoolerState}`)
    await this.debugLog(`Switchbot CurrentMode: ${this.CurrentMode}`)
  }

  async CurrentHeaterCoolerStateGet(): Promise<CharacteristicValue> {
    await this.UpdateCurrentHeaterCoolerState()
    await this.debugLog(`Get (${this.getTargetHeaterCoolerStateName()}) CurrentHeaterCoolerState: ${this.HeaterCooler.CurrentHeaterCoolerState}`)

    return this.HeaterCooler.CurrentHeaterCoolerState
  }

  private getTargetHeaterCoolerStateName(): string {
    switch (this.HeaterCooler.TargetHeaterCoolerState) {
      case this.hap.Characteristic.TargetHeaterCoolerState.AUTO:
        return 'AUTO'
      case this.hap.Characteristic.TargetHeaterCoolerState.HEAT:
        return 'HEAT'
      case this.hap.Characteristic.TargetHeaterCoolerState.COOL:
        return 'COOL'
      default:
        return this.HeaterCooler.TargetHeaterCoolerState.toString()
    }
  }

  async ThresholdTemperatureGet(): Promise<CharacteristicValue> {
    this.HeaterCooler.Active = this.HeaterCooler.Active === undefined
      ? this.hap.Characteristic.Active.INACTIVE
      : this.HeaterCooler.Active ?? this.accessory.context.Active

    this.HeaterCooler.CurrentTemperature = (this.HeaterCooler.CurrentTemperature === undefined && this.accessory.context.CurrentTemperature === undefined)
      ? 24
      : this.HeaterCooler.CurrentTemperature ?? this.accessory.context.CurrentTemperature

    this.HeaterCooler.ThresholdTemperature = this.HeaterCooler.ThresholdTemperature === undefined
      ? 24
      : this.HeaterCooler.ThresholdTemperature ?? this.accessory.context.ThresholdTemperature

    this.HeaterCooler.RotationSpeed = (this.HeaterCooler.RotationSpeed === undefined && this.accessory.context.RotationSpeed === undefined)
      ? 4
      : this.HeaterCooler.RotationSpeed ?? this.accessory.context.RotationSpeed

    await this.getAirConditionerConfigSettings(this.accessory, this.device)

    if (this.meter && this.HumiditySensor?.Service) {
      this.HumiditySensor.CurrentRelativeHumidity = (this.HumiditySensor.CurrentRelativeHumidity === undefined && this.accessory.context.CurrentRelativeHumidity === undefined)
        ? 0
        : this.HumiditySensor.CurrentRelativeHumidity ?? this.accessory.context.CurrentRelativeHumidity
    }
    await this.debugLog(`Get ThresholdTemperature: ${this.HeaterCooler.ThresholdTemperature}`)
    return this.HeaterCooler.ThresholdTemperature
  }

  async ThresholdTemperatureSet(value: CharacteristicValue): Promise<void> {
    this.HeaterCooler.ThresholdTemperature = value
    await this.debugLog(`Set ThresholdTemperature: ${this.HeaterCooler.ThresholdTemperature}, ThresholdTemperatureCached: ${this.accessory.context.ThresholdTemperature}`)
    this.pushAirConditionerStatusChanges()
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    await this.debugLog('updateHomeKitCharacteristics')
    // Active
    await this.updateCharacteristic(this.HeaterCooler.Service, this.hap.Characteristic.Active, this.HeaterCooler.Active, 'Active')
    // RotationSpeed
    await this.updateCharacteristic(this.HeaterCooler.Service, this.hap.Characteristic.RotationSpeed, this.HeaterCooler.RotationSpeed, 'RotationSpeed')
    // CurrentTemperature
    await this.updateCharacteristic(this.HeaterCooler.Service, this.hap.Characteristic.CurrentTemperature, this.HeaterCooler.CurrentTemperature, 'CurrentTemperature')
    // TargetHeaterCoolerState
    await this.updateCharacteristic(this.HeaterCooler.Service, this.hap.Characteristic.TargetHeaterCoolerState, this.HeaterCooler.TargetHeaterCoolerState, 'TargetHeaterCoolerState')
    // CurrentHeaterCoolerState
    await this.updateCharacteristic(this.HeaterCooler.Service, this.hap.Characteristic.CurrentHeaterCoolerState, this.HeaterCooler.CurrentHeaterCoolerState, 'CurrentHeaterCoolerState')
    // HeatingThresholdTemperature
    await this.updateCharacteristic(this.HeaterCooler.Service, this.hap.Characteristic.HeatingThresholdTemperature, this.HeaterCooler.ThresholdTemperature, 'ThresholdTemperature')
    // CoolingThresholdTemperature
    await this.updateCharacteristic(this.HeaterCooler.Service, this.hap.Characteristic.CoolingThresholdTemperature, this.HeaterCooler.ThresholdTemperature, 'ThresholdTemperature')
    if (this.meter && this.HumiditySensor?.Service) {
      // CurrentRelativeHumidity
      await this.updateCharacteristic(this.HumiditySensor.Service, this.hap.Characteristic.CurrentRelativeHumidity, this.HumiditySensor.CurrentRelativeHumidity, 'CurrentRelativeHumidity')
    }
  }

  async apiError(e: any): Promise<void> {
    this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.Active, e)
    this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.RotationSpeed, e)
    this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, e)
    this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity, e)
    this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.TargetHeaterCoolerState, e)
    this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.CurrentHeaterCoolerState, e)
    this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.HeatingThresholdTemperature, e)
    this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.CoolingThresholdTemperature, e)
  }

  async getAirConditionerConfigSettings(accessory: PlatformAccessory, device: irdevice & irDevicesConfig): Promise<void> {
    accessory.context.hide_automode = this.hide_automode = device.irair?.hide_automode
    accessory.context.set_max_heat = this.set_max_heat = device.irair?.set_max_heat ?? 35
    accessory.context.set_min_heat = this.set_min_heat = device.irair?.set_min_heat ?? 0
    accessory.context.set_max_cool = this.set_max_cool = device.irair?.set_max_cool ?? 35
    accessory.context.set_min_cool = this.set_min_cool = device.irair?.set_min_cool ?? 0
  }
}
