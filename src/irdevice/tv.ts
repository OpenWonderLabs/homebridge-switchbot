/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * tv.ts: @switchbot/homebridge-switchbot.
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
export class TV extends irdeviceBase {
  // Services
  private Television: {
    Name: CharacteristicValue
    ConfiguredName: CharacteristicValue
    Service: Service
    Active: CharacteristicValue
    ActiveIdentifier: CharacteristicValue
    SleepDiscoveryMode: CharacteristicValue
    RemoteKey: CharacteristicValue
  }

  private TelevisionSpeaker: {
    Name: CharacteristicValue
    Service: Service
    Active: CharacteristicValue
    VolumeControlType: CharacteristicValue
    VolumeSelector: CharacteristicValue
  }

  // Characteristic Values

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device)

    // Initialize Television Service
    accessory.context.Television = accessory.context.Television ?? {}
    this.Television = {
      Name: accessory.displayName,
      ConfiguredName: accessory.displayName,
      Service: accessory.getService(this.hap.Service.Television) ?? accessory.addService(this.hap.Service.Television) as Service,
      Active: accessory.context.Active ?? this.hap.Characteristic.Active.INACTIVE,
      ActiveIdentifier: accessory.context.ActiveIdentifier ?? 1,
      SleepDiscoveryMode: accessory.context.SleepDiscoveryMode ?? this.hap.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE,
      RemoteKey: accessory.context.RemoteKey ?? this.hap.Characteristic.RemoteKey.EXIT,
    }
    accessory.context.Television = this.Television as object

    switch (device.remoteType) {
      case 'Speaker':
      case 'DIY Speaker':
        accessory.category = this.hap.Categories.SPEAKER
        break
      case 'IPTV':
      case 'DIY IPTV':
        accessory.category = this.hap.Categories.TV_STREAMING_STICK
        break
      case 'DVD':
      case 'DIY DVD':
      case 'Set Top Box':
      case 'DIY Set Top Box':
        accessory.category = this.hap.Categories.TV_SET_TOP_BOX
        break
      default:
        accessory.category = this.hap.Categories.TELEVISION
    }

    this.Television.Service.setCharacteristic(this.hap.Characteristic.SleepDiscoveryMode, this.hap.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE).setCharacteristic(this.hap.Characteristic.ConfiguredName, this.Television.ConfiguredName).getCharacteristic(this.hap.Characteristic.ConfiguredName)

    this.Television.Service.setCharacteristic(this.hap.Characteristic.ActiveIdentifier, 1).getCharacteristic(this.hap.Characteristic.Active).onGet(() => {
      return this.Television.Active
    }).onSet(this.ActiveSet.bind(this))

    this.Television.Service.getCharacteristic(this.hap.Characteristic.ActiveIdentifier).onGet(() => {
      return this.Television.ActiveIdentifier
    }).onSet(this.ActiveIdentifierSet.bind(this))

    this.Television.Service.getCharacteristic(this.hap.Characteristic.RemoteKey).onGet(() => {
      return this.Television.RemoteKey
    }).onSet(this.RemoteKeySet.bind(this))

    // Initialize TelevisionSpeaker Service
    accessory.context.TelevisionSpeaker = accessory.context.TelevisionSpeaker ?? {}
    this.TelevisionSpeaker = {
      Name: `${accessory.displayName} Speaker`,
      Service: accessory.getService(this.hap.Service.TelevisionSpeaker) ?? accessory.addService(this.hap.Service.TelevisionSpeaker) as Service,
      Active: accessory.context.Active ?? false,
      VolumeControlType: accessory.context.VolumeControlType ?? this.hap.Characteristic.VolumeControlType.ABSOLUTE,
      VolumeSelector: accessory.context.VolumeSelector ?? this.hap.Characteristic.VolumeSelector.INCREMENT,
    }
    accessory.context.TelevisionSpeaker = this.TelevisionSpeaker as object

    this.TelevisionSpeaker.Service.setCharacteristic(this.hap.Characteristic.Name, this.TelevisionSpeaker.Name).setCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.ACTIVE).setCharacteristic(this.hap.Characteristic.VolumeControlType, this.hap.Characteristic.VolumeControlType.ABSOLUTE).getCharacteristic(this.hap.Characteristic.VolumeSelector).onGet(() => {
      return this.TelevisionSpeaker.VolumeSelector
    }).onSet(this.VolumeSelectorSet.bind(this))
  }

  async VolumeSelectorSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`VolumeSelector: ${value}`)
    if (value === this.hap.Characteristic.VolumeSelector.INCREMENT) {
      this.pushVolumeUpChanges()
    } else {
      this.pushVolumeDownChanges()
    }
  }

  async RemoteKeySet(value: CharacteristicValue): Promise<void> {
    switch (value) {
      case this.hap.Characteristic.RemoteKey.REWIND: {
        this.debugLog('Set Remote Key Pressed: REWIND')
        break
      }
      case this.hap.Characteristic.RemoteKey.FAST_FORWARD: {
        this.debugLog('Set Remote Key Pressed: FAST_FORWARD')
        break
      }
      case this.hap.Characteristic.RemoteKey.NEXT_TRACK: {
        this.debugLog('Set Remote Key Pressed: NEXT_TRACK')
        break
      }
      case this.hap.Characteristic.RemoteKey.PREVIOUS_TRACK: {
        this.debugLog('Set Remote Key Pressed: PREVIOUS_TRACK')
        break
      }
      case this.hap.Characteristic.RemoteKey.ARROW_UP: {
        this.debugLog('Set Remote Key Pressed: ARROW_UP')
        // this.pushUpChanges();
        break
      }
      case this.hap.Characteristic.RemoteKey.ARROW_DOWN: {
        this.debugLog('Set Remote Key Pressed: ARROW_DOWN')
        // this.pushDownChanges();
        break
      }
      case this.hap.Characteristic.RemoteKey.ARROW_LEFT: {
        this.debugLog('Set Remote Key Pressed: ARROW_LEFT')
        // this.pushLeftChanges();
        break
      }
      case this.hap.Characteristic.RemoteKey.ARROW_RIGHT: {
        this.debugLog('Set Remote Key Pressed: ARROW_RIGHT')
        // this.pushRightChanges();
        break
      }
      case this.hap.Characteristic.RemoteKey.SELECT: {
        this.debugLog('Set Remote Key Pressed: SELECT')
        // this.pushOkChanges();
        break
      }
      case this.hap.Characteristic.RemoteKey.BACK: {
        this.debugLog('Set Remote Key Pressed: BACK')
        // this.pushBackChanges();
        break
      }
      case this.hap.Characteristic.RemoteKey.EXIT: {
        this.debugLog('Set Remote Key Pressed: EXIT')
        break
      }
      case this.hap.Characteristic.RemoteKey.PLAY_PAUSE: {
        this.debugLog('Set Remote Key Pressed: PLAY_PAUSE')
        break
      }
      case this.hap.Characteristic.RemoteKey.INFORMATION: {
        this.debugLog('Set Remote Key Pressed: INFORMATION')
        // this.pushMenuChanges();
        break
      }
    }
  }

  async ActiveIdentifierSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`ActiveIdentifier: ${value}`)
    this.Television.ActiveIdentifier = value
  }

  async ActiveSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`Active (value): ${value}`)

    this.Television.Active = value
    if (this.Television.Active === this.hap.Characteristic.Active.ACTIVE) {
      await this.pushTvOnChanges()
    } else {
      await this.pushTvOffChanges()
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType    commandType     Command           Parameter          Description
   * TV           "command"       "turnOff"         "default"          set to OFF state
   * TV           "command"       "turnOn"          "default"          set to ON state
   * TV           "command"       "volumeAdd"       "default"          volume up
   * TV           "command"       "volumeSub"       "default"          volume down
   * TV           "command"       "channelAdd"      "default"          next channel
   * TV           "command"       "channelSub"      "default"          previous channel
   */
  async pushTvOnChanges(): Promise<void> {
    this.debugLog(`pushTvOnChanges Active: ${this.Television.Active}, disablePushOn: ${this.disablePushOn}`)
    if (this.Television.Active === this.hap.Characteristic.Active.ACTIVE && !this.disablePushOn) {
      const commandType: string = await this.commandType()
      const command: string = await this.commandOn()
      const bodyChange: bodyChange = {
        command,
        parameter: 'default',
        commandType,
      }
      await this.pushTVChanges(bodyChange)
    }
  }

  async pushTvOffChanges(): Promise<void> {
    this.debugLog(`pushTvOffChanges Active: ${this.Television.Active}, disablePushOff: ${this.disablePushOff}`)
    if (this.Television.Active === this.hap.Characteristic.Active.INACTIVE && !this.disablePushOff) {
      const commandType: string = await this.commandType()
      const command: string = await this.commandOff()
      const bodyChange: bodyChange = {
        command,
        parameter: 'default',
        commandType,
      }
      await this.pushTVChanges(bodyChange)
    }
  }

  async pushOkChanges(): Promise<void> {
    this.debugLog(`pushOkChanges disablePushDetail: ${this.disablePushDetail}`)
    if (!this.disablePushDetail) {
      const bodyChange: bodyChange = {
        command: 'Ok',
        parameter: 'default',
        commandType: 'command',
      }
      await this.pushTVChanges(bodyChange)
    }
  }

  async pushBackChanges(): Promise<void> {
    this.debugLog(`pushBackChanges disablePushDetail: ${this.disablePushDetail}`)
    if (!this.disablePushDetail) {
      const bodyChange: bodyChange = {
        command: 'Back',
        parameter: 'default',
        commandType: 'command',
      }
      await this.pushTVChanges(bodyChange)
    }
  }

  async pushMenuChanges(): Promise<void> {
    this.debugLog(`pushMenuChanges disablePushDetail: ${this.disablePushDetail}`)
    if (!this.disablePushDetail) {
      const bodyChange: bodyChange = {
        command: 'Menu',
        parameter: 'default',
        commandType: 'command',
      }
      await this.pushTVChanges(bodyChange)
    }
  }

  async pushUpChanges(): Promise<void> {
    this.debugLog(`pushUpChanges disablePushDetail: ${this.disablePushDetail}`)
    if (!this.disablePushDetail) {
      const bodyChange: bodyChange = {
        command: 'Up',
        parameter: 'default',
        commandType: 'command',
      }
      await this.pushTVChanges(bodyChange)
    }
  }

  async pushDownChanges(): Promise<void> {
    this.debugLog(`pushDownChanges disablePushDetail: ${this.disablePushDetail}`)
    if (!this.disablePushDetail) {
      const bodyChange: bodyChange = {
        command: 'Down',
        parameter: 'default',
        commandType: 'command',
      }
      await this.pushTVChanges(bodyChange)
    }
  }

  async pushRightChanges(): Promise<void> {
    this.debugLog(`pushRightChanges disablePushDetail: ${this.disablePushDetail}`)
    if (!this.disablePushDetail) {
      const bodyChange: bodyChange = {
        command: 'Right',
        parameter: 'default',
        commandType: 'command',
      }
      await this.pushTVChanges(bodyChange)
    }
  }

  async pushLeftChanges(): Promise<void> {
    this.debugLog(`pushLeftChanges disablePushDetail: ${this.disablePushDetail}`)
    if (!this.disablePushDetail) {
      const bodyChange: bodyChange = {
        command: 'Left',
        parameter: 'default',
        commandType: 'command',
      }
      await this.pushTVChanges(bodyChange)
    }
  }

  async pushVolumeUpChanges(): Promise<void> {
    this.debugLog(`pushVolumeUpChanges disablePushDetail: ${this.disablePushDetail}`)
    if (!this.disablePushDetail) {
      const bodyChange: bodyChange = {
        command: 'volumeAdd',
        parameter: 'default',
        commandType: 'command',
      }
      await this.pushTVChanges(bodyChange)
    }
  }

  async pushVolumeDownChanges(): Promise<void> {
    this.debugLog(`pushVolumeDownChanges disablePushDetail: ${this.disablePushDetail}`)
    if (!this.disablePushDetail) {
      const bodyChange: bodyChange = {
        command: 'volumeSub',
        parameter: 'default',
        commandType: 'command',
      }
      await this.pushTVChanges(bodyChange)
    }
  }

  async pushTVChanges(bodyChange: any): Promise<void> {
    this.debugLog('pushTVChanges')
    if (this.device.connectionType === 'OpenAPI') {
      this.infoLog(`Sending request to SwitchBot API, body: ${JSON.stringify(bodyChange)}`)
      try {
        const response = await this.pushChangeRequest(bodyChange)
        const deviceStatus: any = response.body
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
      this.warnLog(`Connection Type: ${this.device.connectionType}, commands will not be sent to OpenAPI`)
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    this.debugLog('updateHomeKitCharacteristics')
    // Active
    await this.updateCharacteristic(this.Television.Service, this.hap.Characteristic.Active, this.Television.Active, 'Active')
    // ActiveIdentifier
    await this.updateCharacteristic(this.Television.Service, this.hap.Characteristic.ActiveIdentifier, this.Television.ActiveIdentifier, 'ActiveIdentifier')
  }

  async apiError(e: any): Promise<void> {
    this.Television.Service.updateCharacteristic(this.hap.Characteristic.Active, e)
    this.Television.Service.updateCharacteristic(this.hap.Characteristic.ActiveIdentifier, e)
  }
}
