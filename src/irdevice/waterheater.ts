/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * waterheater.ts: @switchbot/homebridge-switchbot.
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
export class WaterHeater extends irdeviceBase {
  // Services
  private Valve: {
    Name: CharacteristicValue
    Service: Service
    Active: CharacteristicValue
  }

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device)
    // Set category
    accessory.category = this.hap.Categories.FAUCET

    // Initialize Switch Service
    accessory.context.Valve = accessory.context.Valve ?? {}
    this.Valve = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.Valve) ?? accessory.addService(this.hap.Service.Valve) as Service,
      Active: accessory.context.Active ?? this.hap.Characteristic.Active.INACTIVE,
    }
    accessory.context.Valve = this.Valve as object

    this.Valve.Service.setCharacteristic(this.hap.Characteristic.Name, this.Valve.Name).setCharacteristic(this.hap.Characteristic.ValveType, this.hap.Characteristic.ValveType.GENERIC_VALVE).getCharacteristic(this.hap.Characteristic.Active).onGet(() => {
      return this.Valve.Active
    }).onSet(this.ActiveSet.bind(this))
  }

  async ActiveSet(value: CharacteristicValue): Promise<void> {
    await this.debugLog(`Active: ${value}`)

    this.Valve.Active = value
    if (this.Valve.Active === this.hap.Characteristic.Active.ACTIVE) {
      await this.pushWaterHeaterOnChanges()
      this.Valve.Service.setCharacteristic(this.hap.Characteristic.InUse, this.hap.Characteristic.InUse.IN_USE)
    } else {
      await this.pushWaterHeaterOffChanges()
      this.Valve.Service.setCharacteristic(this.hap.Characteristic.InUse, this.hap.Characteristic.InUse.NOT_IN_USE)
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType      Command Type    Command           Parameter           Description
   * WaterHeater     "command"       "turnOff"         "default"         set to OFF state
   * WaterHeater     "command"       "turnOn"          "default"         set to ON state
   */
  async pushWaterHeaterOnChanges(): Promise<void> {
    await this.debugLog(`pushWaterHeaterOnChanges Active: ${this.Valve.Active}, disablePushOn: ${this.disablePushOn}`)
    if (this.Valve.Active === this.hap.Characteristic.Active.ACTIVE && !this.disablePushOn) {
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

  async pushWaterHeaterOffChanges(): Promise<void> {
    await this.debugLog(`pushWaterHeaterOffChanges Active: ${this.Valve.Active}, disablePushOff: ${this.disablePushOff}`)
    if (this.Valve.Active === this.hap.Characteristic.Active.INACTIVE && !this.disablePushOff) {
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
    await this.updateCharacteristic(this.Valve.Service, this.hap.Characteristic.Active, this.Valve.Active, 'Active')
  }

  async apiError({ e }: { e: any }): Promise<void> {
    this.Valve.Service.updateCharacteristic(this.hap.Characteristic.Active, e)
  }
}
