/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * fan.ts: @switchbot/homebridge-switchbot.
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
export class IRFan extends irdeviceBase {
  // Services
  private Fan: {
    Name: CharacteristicValue
    Service: Service
    Active: CharacteristicValue
    SwingMode: CharacteristicValue
    RotationSpeed: CharacteristicValue
    RotationDirection: CharacteristicValue
  }

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device)
    // Set category
    accessory.category = this.hap.Categories.FAN

    // Initialize Switch Service
    accessory.context.Fan = accessory.context.Fan ?? {}
    this.Fan = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.Fanv2) ?? accessory.addService(this.hap.Service.Fanv2) as Service,
      Active: accessory.context.Active ?? this.hap.Characteristic.Active.INACTIVE,
      SwingMode: accessory.context.SwingMode ?? this.hap.Characteristic.SwingMode.SWING_DISABLED,
      RotationSpeed: accessory.context.RotationSpeed ?? 0,
      RotationDirection: accessory.context.RotationDirection ?? this.hap.Characteristic.RotationDirection.CLOCKWISE,
    }
    accessory.context.Fan = this.Fan as object

    this.Fan.Service.setCharacteristic(this.hap.Characteristic.Name, this.Fan.Name).getCharacteristic(this.hap.Characteristic.Active).onGet(() => {
      return this.Fan.Active
    }).onSet(this.ActiveSet.bind(this))

    if (device.irfan?.rotation_speed) {
      // handle Rotation Speed events using the RotationSpeed characteristic
      this.Fan.Service.getCharacteristic(this.hap.Characteristic.RotationSpeed).setProps({
        minStep: device.irfan?.set_minStep ?? 1,
        minValue: device.irfan?.set_min ?? 1,
        maxValue: device.irfan?.set_max ?? 100,
      }).onGet(() => {
        return this.Fan.RotationSpeed
      }).onSet(this.RotationSpeedSet.bind(this))
    } else if (this.Fan.Service.testCharacteristic(this.hap.Characteristic.RotationSpeed) && !device.irfan?.swing_mode) {
      const characteristic = this.Fan.Service.getCharacteristic(this.hap.Characteristic.RotationSpeed)
      this.Fan.Service.removeCharacteristic(characteristic)
      this.debugLog('Rotation Speed Characteristic was removed.')
    } else {
      this.debugLog(`RotationSpeed Characteristic was not removed/added, Clear Cache on ${this.accessory.displayName} to remove Chracteristic`)
    }

    if (device.irfan?.swing_mode) {
      // handle Osolcation events using the SwingMode characteristic
      this.Fan.Service.getCharacteristic(this.hap.Characteristic.SwingMode).onGet(() => {
        return this.Fan.SwingMode
      }).onSet(this.SwingModeSet.bind(this))
    } else if (this.Fan.Service.testCharacteristic(this.hap.Characteristic.SwingMode) && !device.irfan?.swing_mode) {
      const characteristic = this.Fan.Service.getCharacteristic(this.hap.Characteristic.SwingMode)
      this.Fan.Service.removeCharacteristic(characteristic)
      this.debugLog('Swing Mode Characteristic was removed.')
    } else {
      this.debugLog(`Swing Mode Characteristic was not removed/added, Clear Cache on ${this.accessory.displayName} To Remove Chracteristic`)
    }
  }

  async SwingModeSet(value: CharacteristicValue): Promise<void> {
    await this.debugLog(`SwingMode: ${value}`)
    if (value > this.Fan.SwingMode) {
      this.Fan.SwingMode = 1
      await this.pushFanOnChanges()
      await this.pushFanSwingChanges()
    } else {
      this.Fan.SwingMode = 0
      await this.pushFanOnChanges()
      await this.pushFanSwingChanges()
    }
    this.Fan.SwingMode = value
    this.accessory.context.SwingMode = this.Fan.SwingMode
  }

  async RotationSpeedSet(value: CharacteristicValue): Promise<void> {
    await this.debugLog(`RotationSpeed: ${value}`)
    if (value > this.Fan.RotationSpeed) {
      this.Fan.RotationSpeed = 1
      this.pushFanSpeedUpChanges()
      this.pushFanOnChanges()
    } else {
      this.Fan.RotationSpeed = 0
      this.pushFanSpeedDownChanges()
    }
    this.Fan.RotationSpeed = value
    this.accessory.context.RotationSpeed = this.Fan.RotationSpeed
  }

  async ActiveSet(value: CharacteristicValue): Promise<void> {
    await this.debugLog(`Active: ${value}`)

    this.Fan.Active = value
    if (this.Fan.Active === this.hap.Characteristic.Active.ACTIVE) {
      this.pushFanOnChanges()
    } else {
      this.pushFanOffChanges()
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType  commandType     Command           command parameter           Description
   * Fan -        "command"       "swing"          "default"          =        swing
   * Fan -        "command"       "timer"          "default"          =        timer
   * Fan -        "command"       "lowSpeed"       "default"          =        fan speed to low
   * Fan -        "command"       "middleSpeed"    "default"          =        fan speed to medium
   * Fan -        "command"       "highSpeed"      "default"          =        fan speed to high
   */
  async pushFanOnChanges(): Promise<void> {
    await this.debugLog(`pushFanOnChanges Active: ${this.Fan.Active}, disablePushOn: ${this.disablePushOn}`)
    if (this.Fan.Active === this.hap.Characteristic.Active.ACTIVE && !this.disablePushOn) {
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

  async pushFanOffChanges(): Promise<void> {
    await this.debugLog(`pushLightOffChanges Active: ${this.Fan.Active}, disablePushOff: ${this.disablePushOff}`)
    if (this.Fan.Active === this.hap.Characteristic.Active.INACTIVE && !this.disablePushOff) {
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

  async pushFanSpeedUpChanges(): Promise<void> {
    const bodyChange = JSON.stringify({
      command: 'highSpeed',
      parameter: 'default',
      commandType: 'command',
    })
    await this.pushChanges(bodyChange)
  }

  async pushFanSpeedDownChanges(): Promise<void> {
    const bodyChange = JSON.stringify({
      command: 'lowSpeed',
      parameter: 'default',
      commandType: 'command',
    })
    await this.pushChanges(bodyChange)
  }

  async pushFanSwingChanges(): Promise<void> {
    const bodyChange = JSON.stringify({
      command: 'swing',
      parameter: 'default',
      commandType: 'command',
    })
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
      await this.warnLog(`Connection Type: ${this.device.connectionType}, commands will not be sent to OpenAPI`)
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    await this.debugLog('updateHomeKitCharacteristics')
    // Active
    await this.updateCharacteristic(this.Fan.Service, this.hap.Characteristic.Active, this.Fan.Active, 'Active')
    // SwingMode
    await this.updateCharacteristic(this.Fan.Service, this.hap.Characteristic.SwingMode, this.Fan.SwingMode, 'SwingMode')
    // RotationSpeed
    await this.updateCharacteristic(this.Fan.Service, this.hap.Characteristic.RotationSpeed, this.Fan.RotationSpeed, 'RotationSpeed')
  }

  async apiError(e: any): Promise<void> {
    this.Fan.Service.updateCharacteristic(this.hap.Characteristic.Active, e)
    this.Fan.Service.updateCharacteristic(this.hap.Characteristic.RotationSpeed, e)
    this.Fan.Service.updateCharacteristic(this.hap.Characteristic.SwingMode, e)
  }
}
