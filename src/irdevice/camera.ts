/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * camera.ts: @switchbot/homebridge-switchbot.
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
export class Camera extends irdeviceBase {
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
    accessory.category = this.hap.Categories.CAMERA

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

    this.Switch.On = value
    if (this.Switch.On) {
      this.pushOnChanges()
    } else {
      this.pushOffChanges()
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType    commandType     Command           command parameter           Description
   * Camera -        "command"       "turnOff"         "default"          =        set to OFF state
   * Camera -        "command"       "turnOn"          "default"          =        set to ON state
   * Camera -        "command"       "volumeAdd"       "default"          =        volume up
   * Camera -        "command"       "volumeSub"       "default"          =        volume down
   * Camera -        "command"       "channelAdd"      "default"          =        next channel
   * Camera -        "command"       "channelSub"      "default"          =        previous channel
   */
  async pushOnChanges(): Promise<void> {
    await this.debugLog(`pushOnChanges On: ${this.Switch.On}, disablePushOn: ${this.disablePushOn}`)
    if (this.Switch.On && !this.disablePushOn) {
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

  async pushOffChanges(): Promise<void> {
    await this.debugLog(`pushOffChanges On: ${this.Switch.On}, disablePushOff: ${this.disablePushOff}`)
    if (!this.Switch.On && !this.disablePushOff) {
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
    await this.updateCharacteristic(this.Switch.Service, this.hap.Characteristic.On, this.Switch.On, 'On')
  }

  async apiError(e: any): Promise<void> {
    this.Switch.Service.updateCharacteristic(this.hap.Characteristic.On, e)
  }
}
