/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * tv.ts: @switchbot/homebridge-switchbot.
 */
import { request } from 'undici';
import { Devices } from '../settings.js';
import { irdeviceBase } from './irdevice.js';

import type { SwitchBotPlatform } from '../platform.js';
import type { irDevicesConfig, irdevice } from '../settings.js';
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class TV extends irdeviceBase {
  // Services
  private Television: {
    Name: CharacteristicValue;
    ConfiguredName: CharacteristicValue;
    Service: Service;
    Active: CharacteristicValue;
    ActiveIdentifier: CharacteristicValue;
    SleepDiscoveryMode: CharacteristicValue;
    RemoteKey: CharacteristicValue;
  };

  private TelevisionSpeaker: {
    Name: CharacteristicValue;
    Service: Service;
    Active: CharacteristicValue;
    VolumeControlType: CharacteristicValue;
    VolumeSelector: CharacteristicValue;
  };

  // Characteristic Values

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device);

    // Initialize Television Service
    if (!accessory.context.Television) {
      accessory.context.Television = {};
    }
    this.Television = {
      Name: accessory.context.Television.Name ?? `${accessory.displayName} ${device.remoteType}`,
      ConfiguredName: accessory.context.Television.ConfiguredName ?? `${accessory.displayName} ${device.remoteType}`,
      Service: accessory.getService(this.hap.Service.Television) ?? accessory.addService(this.hap.Service.Television) as Service,
      Active: accessory.context.Active ?? this.hap.Characteristic.Active.INACTIVE,
      ActiveIdentifier: accessory.context.ActiveIdentifier ?? 1,
      SleepDiscoveryMode: accessory.context.SleepDiscoveryMode ?? this.hap.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE,
      RemoteKey: accessory.context.RemoteKey ?? this.hap.Characteristic.RemoteKey.EXIT,
    };

    switch (device.remoteType) {
      case 'Speaker':
      case 'DIY Speaker':
        accessory.category = this.platform.api.hap.Categories.SPEAKER;
        break;
      case 'IPTV':
      case 'DIY IPTV':
        accessory.category = this.platform.api.hap.Categories.TV_STREAMING_STICK;
        break;
      case 'DVD':
      case 'DIY DVD':
      case 'Set Top Box':
      case 'DIY Set Top Box':
        accessory.category = this.platform.api.hap.Categories.TV_SET_TOP_BOX;
        break;
      default:
        accessory.category = this.platform.api.hap.Categories.TELEVISION;
    }

    this.Television.Service
      .setCharacteristic(this.hap.Characteristic.SleepDiscoveryMode, this.hap.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE)
      .setCharacteristic(this.hap.Characteristic.ConfiguredName, this.Television.ConfiguredName)
      .getCharacteristic(this.hap.Characteristic.ConfiguredName);

    this.Television.Service
      .setCharacteristic(this.hap.Characteristic.ActiveIdentifier, 1)
      .getCharacteristic(this.hap.Characteristic.Active)
      .onGet(() => {
        return this.Television.Active;
      })
      .onSet(this.ActiveSet.bind(this));

    this.Television.Service
      .getCharacteristic(this.hap.Characteristic.ActiveIdentifier)
      .onGet(() => {
        return this.Television.ActiveIdentifier;
      })
      .onSet(this.ActiveIdentifierSet.bind(this));

    this.Television.Service
      .getCharacteristic(this.hap.Characteristic.RemoteKey)
      .onGet(() => {
        return this.Television.RemoteKey;
      })
      .onSet(this.RemoteKeySet.bind(this));
    accessory.context.Television.Name = this.Television.Name;

    // Initialize TelevisionSpeaker Service
    if (!accessory.context.TelevisionSpeaker) {
      accessory.context.TelevisionSpeaker = {};
    }
    this.TelevisionSpeaker = {
      Name: accessory.context.TelevisionSpeaker.Name ?? `${accessory.displayName} ${device.remoteType} Speaker`,
      Service: accessory.getService(this.hap.Service.TelevisionSpeaker) ?? accessory.addService(this.hap.Service.TelevisionSpeaker) as Service,
      Active: accessory.context.Active ?? false,
      VolumeControlType: accessory.context.VolumeControlType ?? this.hap.Characteristic.VolumeControlType.ABSOLUTE,
      VolumeSelector: accessory.context.VolumeSelector ?? this.hap.Characteristic.VolumeSelector.INCREMENT,
    };

    this.TelevisionSpeaker.Service
      .setCharacteristic(this.hap.Characteristic.Name, this.TelevisionSpeaker.Name)
      .setCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.ACTIVE)
      .setCharacteristic(this.hap.Characteristic.VolumeControlType, this.hap.Characteristic.VolumeControlType.ABSOLUTE)
      .getCharacteristic(this.hap.Characteristic.VolumeSelector)
      .onGet(() => {
        return this.TelevisionSpeaker.VolumeSelector;
      })
      .onSet(this.VolumeSelectorSet.bind(this));
    accessory.context.TelevisionSpeaker.Name = this.TelevisionSpeaker.Name;
  }

  async VolumeSelectorSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} VolumeSelector: ${value}`);
    if (value === this.hap.Characteristic.VolumeSelector.INCREMENT) {
      this.pushVolumeUpChanges();
    } else {
      this.pushVolumeDownChanges();
    }
  }

  async RemoteKeySet(value: CharacteristicValue): Promise<void> {
    switch (value) {
      case this.hap.Characteristic.RemoteKey.REWIND: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: REWIND`);
        break;
      }
      case this.hap.Characteristic.RemoteKey.FAST_FORWARD: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: FAST_FORWARD`);
        break;
      }
      case this.hap.Characteristic.RemoteKey.NEXT_TRACK: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: NEXT_TRACK`);
        break;
      }
      case this.hap.Characteristic.RemoteKey.PREVIOUS_TRACK: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: PREVIOUS_TRACK`);
        break;
      }
      case this.hap.Characteristic.RemoteKey.ARROW_UP: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: ARROW_UP`);
        //this.pushUpChanges();
        break;
      }
      case this.hap.Characteristic.RemoteKey.ARROW_DOWN: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: ARROW_DOWN`);
        //this.pushDownChanges();
        break;
      }
      case this.hap.Characteristic.RemoteKey.ARROW_LEFT: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: ARROW_LEFT`);
        //this.pushLeftChanges();
        break;
      }
      case this.hap.Characteristic.RemoteKey.ARROW_RIGHT: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: ARROW_RIGHT`);
        //this.pushRightChanges();
        break;
      }
      case this.hap.Characteristic.RemoteKey.SELECT: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: SELECT`);
        //this.pushOkChanges();
        break;
      }
      case this.hap.Characteristic.RemoteKey.BACK: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: BACK`);
        //this.pushBackChanges();
        break;
      }
      case this.hap.Characteristic.RemoteKey.EXIT: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: EXIT`);
        break;
      }
      case this.hap.Characteristic.RemoteKey.PLAY_PAUSE: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: PLAY_PAUSE`);
        break;
      }
      case this.hap.Characteristic.RemoteKey.INFORMATION: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: INFORMATION`);
        //this.pushMenuChanges();
        break;
      }
    }
  }

  async ActiveIdentifierSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} ActiveIdentifier: ${value}`);
    this.Television.ActiveIdentifier = value;
  }

  async ActiveSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Active (value): ${value}`);

    this.Television.Active = value;
    if (this.Television.Active === this.hap.Characteristic.Active.ACTIVE) {
      await this.pushTvOnChanges();
    } else {
      await this.pushTvOffChanges();
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	  commandType     Command           Parameter	        Description
   * TV           "command"       "turnOff"         "default"	        set to OFF state
   * TV           "command"       "turnOn"          "default"	        set to ON state
   * TV           "command"       "volumeAdd"       "default"	        volume up
   * TV           "command"       "volumeSub"       "default"	        volume down
   * TV           "command"       "channelAdd"      "default"	        next channel
   * TV           "command"       "channelSub"      "default"	        previous channel
   */
  async pushTvOnChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushTvOnChanges`
      + ` Active: ${this.Television.Active}, disablePushOn: ${this.disablePushOn}`);
    if (this.Television.Active === this.hap.Characteristic.Active.ACTIVE && !this.disablePushOn) {
      const commandType: string = await this.commandType();
      const command: string = await this.commandOn();
      const bodyChange = JSON.stringify({
        command: command,
        parameter: 'default',
        commandType: commandType,
      });
      await this.pushTVChanges(bodyChange);
    }
  }

  async pushTvOffChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushTvOffChanges`
      + ` Active: ${this.Television.Active}, disablePushOff: ${this.disablePushOff}`);
    if (this.Television.Active === this.hap.Characteristic.Active.INACTIVE && !this.disablePushOff) {
      const commandType: string = await this.commandType();
      const command: string = await this.commandOff();
      const bodyChange = JSON.stringify({
        command: command,
        parameter: 'default',
        commandType: commandType,
      });
      await this.pushTVChanges(bodyChange);
    }
  }

  async pushOkChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushOkChanges disablePushDetail: ${this.disablePushDetail}`);
    if (!this.disablePushDetail) {
      const bodyChange = JSON.stringify({
        command: 'Ok',
        parameter: 'default',
        commandType: 'command',
      });
      await this.pushTVChanges(bodyChange);
    }
  }

  async pushBackChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushBackChanges disablePushDetail: ${this.disablePushDetail}`);
    if (!this.disablePushDetail) {
      const bodyChange = JSON.stringify({
        command: 'Back',
        parameter: 'default',
        commandType: 'command',
      });
      await this.pushTVChanges(bodyChange);
    }
  }

  async pushMenuChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushMenuChanges disablePushDetail: ${this.disablePushDetail}`);
    if (!this.disablePushDetail) {
      const bodyChange = JSON.stringify({
        command: 'Menu',
        parameter: 'default',
        commandType: 'command',
      });
      await this.pushTVChanges(bodyChange);
    }
  }

  async pushUpChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushUpChanges disablePushDetail: ${this.disablePushDetail}`);
    if (!this.disablePushDetail) {
      const bodyChange = JSON.stringify({
        command: 'Up',
        parameter: 'default',
        commandType: 'command',
      });
      await this.pushTVChanges(bodyChange);
    }
  }

  async pushDownChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushDownChanges disablePushDetail: ${this.disablePushDetail}`);
    if (!this.disablePushDetail) {
      const bodyChange = JSON.stringify({
        command: 'Down',
        parameter: 'default',
        commandType: 'command',
      });
      await this.pushTVChanges(bodyChange);
    }
  }

  async pushRightChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushRightChanges disablePushDetail: ${this.disablePushDetail}`);
    if (!this.disablePushDetail) {
      const bodyChange = JSON.stringify({
        command: 'Right',
        parameter: 'default',
        commandType: 'command',
      });
      await this.pushTVChanges(bodyChange);
    }
  }

  async pushLeftChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushLeftChanges disablePushDetail: ${this.disablePushDetail}`);
    if (!this.disablePushDetail) {
      const bodyChange = JSON.stringify({
        command: 'Left',
        parameter: 'default',
        commandType: 'command',
      });
      await this.pushTVChanges(bodyChange);
    }
  }

  async pushVolumeUpChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushVolumeUpChanges disablePushDetail: ${this.disablePushDetail}`);
    if (!this.disablePushDetail) {
      const bodyChange = JSON.stringify({
        command: 'volumeAdd',
        parameter: 'default',
        commandType: 'command',
      });
      await this.pushTVChanges(bodyChange);
    }
  }

  async pushVolumeDownChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushVolumeDownChanges disablePushDetail: ${this.disablePushDetail}`);
    if (!this.disablePushDetail) {
      const bodyChange = JSON.stringify({
        command: 'volumeSub',
        parameter: 'default',
        commandType: 'command',
      });
      await this.pushTVChanges(bodyChange);
    }
  }

  async pushTVChanges(bodyChange: any): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushTVChanges`);
    if (this.device.connectionType === 'OpenAPI') {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
        const deviceStatus: any = await body.json();
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          this.debugSuccessLog(`${this.device.remoteType}: ${this.accessory.displayName} `
            + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
          this.successLog(`${this.device.remoteType}: ${this.accessory.displayName}`
            + ` request to SwitchBot API, body: ${JSON.stringify(bodyChange)} sent successfully`);
          this.updateHomeKitCharacteristics();
        } else {
          this.statusCode(statusCode);
          this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(
          `${this.device.remoteType}: ${this.accessory.displayName} failed pushTVChanges with ${this.device.connectionType}` +
          ` Connection, Error Message: ${JSON.stringify(e.message)}`,
        );
      }
    } else {
      this.warnLog(
        `${this.device.remoteType}: ${this.accessory.displayName}` +
        ` Connection Type: ${this.device.connectionType}, commands will not be sent to OpenAPI`,
      );
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    // Active
    if (this.Television.Active === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Active: ${this.Television.Active}`);
    } else {
      this.accessory.context.Active = this.Television.Active;
      this.Television.Service.updateCharacteristic(this.hap.Characteristic.Active, this.Television.Active);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.Television.Active}`);
    }
    // ActiveIdentifier
    if (this.Television.ActiveIdentifier === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} ActiveIdentifier: ${this.Television.ActiveIdentifier}`);
    } else {
      this.accessory.context.ActiveIdentifier = this.Television.ActiveIdentifier;
      this.Television.Service.updateCharacteristic(this.hap.Characteristic.ActiveIdentifier, this.Television.ActiveIdentifier);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
        + ` ActiveIdentifier: ${this.Television.ActiveIdentifier}`);
    }
  }

  async apiError(e: any): Promise<void> {
    this.Television.Service.updateCharacteristic(this.hap.Characteristic.Active, e);
    this.Television.Service.updateCharacteristic(this.hap.Characteristic.ActiveIdentifier, e);
  }
}
