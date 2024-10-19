/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * vacuumcleaner.ts: @switchbot/homebridge-switchbot.
 */
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'
import type { bodyChange, irdevice } from 'node-switchbot'

import type { SwitchBotPlatform } from '../platform.js'
import type { irDevicesConfig } from '../settings.js'

import { irdeviceBase } from './irdevice.js'

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class VacuumCleaner extends irdeviceBase {
  // Services
  private Switch: {
    Name: CharacteristicValue
    Service: Service
    On: CharacteristicValue
  }

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device)
    // Set category
    accessory.category = this.hap.Categories.OTHER

    // Initialize Switch Service
    accessory.context.Switch = accessory.context.Switch ?? {}
    this.Switch = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.Switch) ?? accessory.addService(this.hap.Service.Switch) as Service,
      On: accessory.context.On ?? false,
    }
    accessory.context.Switch = this.Switch as object

    this.Switch.Service.setCharacteristic(this.hap.Characteristic.Name, this.Switch.Name).getCharacteristic(this.hap.Characteristic.On).onGet(() => {
      return this.Switch.On
    }).onSet(this.OnSet.bind(this))
  }

  async OnSet(value: CharacteristicValue): Promise<void> {
    await this.debugLog(`On: ${value}`)

    // Set the requested state
    this.Switch.On = value
    if (this.Switch.On) {
      await this.pushOnChanges()
    } else {
      await this.pushOffChanges()
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType        CommandType     Command        Parameter       Description
   * Vacuum Cleaner    "command"       "turnOff"      "default"       set to OFF state
   * Vacuum Cleaner    "command"       "turnOn"       "default"       set to ON state
   */
  async pushOnChanges(): Promise<void> {
    await this.debugLog(`pushOnChanges On: ${this.Switch.On}, disablePushOn: ${this.disablePushOn}`)
    if (this.Switch.On && !this.disablePushOn) {
      const commandType: string = await this.commandType()
      const command: string = await this.commandOn()
      const bodyChange: bodyChange = {
        command,
        parameter: 'default',
        commandType,
      }
      await this.pushChanges(bodyChange)
    }
  }

  async pushOffChanges(): Promise<void> {
    await this.debugLog(`pushOffChanges On: ${this.Switch.On}, disablePushOff: ${this.disablePushOff}`)
    if (!this.Switch.On && !this.disablePushOff) {
      const commandType: string = await this.commandType()
      const command: string = await this.commandOff()
      const bodyChange: bodyChange = {
        command,
        parameter: 'default',
        commandType,
      }
      await this.pushChanges(bodyChange)
    }
  }

  async pushChanges(bodyChange: any): Promise<void> {
    await this.debugLog('pushChanges')
    if (this.device.connectionType === 'OpenAPI') {
      await this.infoLog(`Sending request to SwitchBot API, body: ${JSON.stringify(bodyChange)}`)
      try {
        const { body } = await this.pushChangeRequest(bodyChange)
        const deviceStatus: any = await body
        await this.pushStatusCodes(deviceStatus)
        if (await this.successfulStatusCodes(deviceStatus)) {
          await this.successfulPushChange(deviceStatus, bodyChange)
          await this.updateHomeKitCharacteristics()
        } else {
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
    // On
    await this.updateCharacteristic(this.Switch.Service, this.hap.Characteristic.On, this.Switch.On, 'On')
  }

  async apiError(e: any): Promise<void> {
    this.Switch.Service.updateCharacteristic(this.hap.Characteristic.On, e)
  }
}
