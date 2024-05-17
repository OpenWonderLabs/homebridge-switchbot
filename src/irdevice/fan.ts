/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * fan.ts: @switchbot/homebridge-switchbot.
 */
import { request } from 'undici';
import { irdeviceBase } from './irdevice.js';
import { SwitchBotPlatform } from '../platform.js';
import { Devices, irDevicesConfig, irdevice } from '../settings.js';
import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class IRFan extends irdeviceBase {
  // Services
  private Fan: {
    Service: Service;
    Active: CharacteristicValue;
    SwingMode: CharacteristicValue;
    RotationSpeed: CharacteristicValue;
    RotationDirection: CharacteristicValue;
  };

  // Config
  minStep?: number;
  minValue?: number;
  maxValue?: number;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device);

    // Initialize Switch property
    this.Fan = {
      Service: accessory.getService(this.hap.Service.Lightbulb)!,
      Active: accessory.context.Active || this.hap.Characteristic.Active.INACTIVE,
      SwingMode: accessory.context.SwingMode || this.hap.Characteristic.SwingMode.SWING_DISABLED,
      RotationSpeed: accessory.context.RotationSpeed || 0,
      RotationDirection: accessory.context.On || this.hap.Characteristic.RotationDirection.CLOCKWISE,
    };

    // get the Television service if it exists, otherwise create a new Television service
    // you can create multiple services for each accessory
    const FanService = `${accessory.displayName} Fan`;
    (this.Fan.Service = accessory.getService(this.hap.Service.Fanv2)
      || accessory.addService(this.hap.Service.Fanv2)), FanService;

    this.Fan.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);

    // handle on / off events using the Active characteristic
    this.Fan.Service.getCharacteristic(this.hap.Characteristic.Active).onSet(this.ActiveSet.bind(this));

    if (device.irfan?.rotation_speed) {
      if (device.irfan?.set_minStep) {
        this.minStep = device.irfan?.set_minStep;
      } else {
        this.minStep = 1;
      }
      if (device.irfan?.set_min) {
        this.minValue = device.irfan?.set_min;
      } else {
        this.minValue = 1;
      }
      if (device.irfan?.set_max) {
        this.maxValue = device.irfan?.set_max;
      } else {
        this.maxValue = 100;
      }
      // handle Rotation Speed events using the RotationSpeed characteristic
      this.Fan.Service
        .getCharacteristic(this.hap.Characteristic.RotationSpeed)
        .setProps({
          minStep: this.minStep,
          minValue: this.minValue,
          maxValue: this.maxValue,
        })
        .onSet(this.RotationSpeedSet.bind(this));
    } else if (this.Fan.Service.testCharacteristic(this.hap.Characteristic.RotationSpeed) && !device.irfan?.swing_mode) {
      const characteristic = this.Fan.Service.getCharacteristic(this.hap.Characteristic.RotationSpeed);
      this.Fan.Service.removeCharacteristic(characteristic);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Rotation Speed Characteristic was removed.`);
    } else {
      // eslint-disable-next-line max-len
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} RotationSpeed Characteristic was not removed/added, ` +
        `Clear Cache on ${this.accessory.displayName} to remove Chracteristic`,
      );
    }

    if (device.irfan?.swing_mode) {
      // handle Osolcation events using the SwingMode characteristic
      this.Fan.Service.getCharacteristic(this.hap.Characteristic.SwingMode).onSet(this.SwingModeSet.bind(this));
    } else if (this.Fan.Service.testCharacteristic(this.hap.Characteristic.SwingMode) && !device.irfan?.swing_mode) {
      const characteristic = this.Fan.Service.getCharacteristic(this.hap.Characteristic.SwingMode);
      this.Fan.Service.removeCharacteristic(characteristic);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Swing Mode Characteristic was removed.`);
    } else {
      // eslint-disable-next-line max-len
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} Swing Mode Characteristic was not removed/added, ` +
        `Clear Cache on ${this.accessory.displayName} To Remove Chracteristic`,
      );
    }
  }

  async SwingModeSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} SwingMode: ${value}`);
    if (value > this.Fan.SwingMode) {
      this.Fan.SwingMode = 1;
      await this.pushFanOnChanges();
      await this.pushFanSwingChanges();
    } else {
      this.Fan.SwingMode = 0;
      await this.pushFanOnChanges();
      await this.pushFanSwingChanges();
    }
    this.Fan.SwingMode = value;
    this.accessory.context.SwingMode = this.Fan.SwingMode;
  }

  async RotationSpeedSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} RotationSpeed: ${value}`);
    if (value > this.Fan.RotationSpeed) {
      this.Fan.RotationSpeed = 1;
      this.pushFanSpeedUpChanges();
      this.pushFanOnChanges();
    } else {
      this.Fan.RotationSpeed = 0;
      this.pushFanSpeedDownChanges();
    }
    this.Fan.RotationSpeed = value;
    this.accessory.context.RotationSpeed = this.Fan.RotationSpeed;
  }

  async ActiveSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Active: ${value}`);

    this.Fan.Active = value;
    if (this.Fan.Active === this.hap.Characteristic.Active.ACTIVE) {
      this.pushFanOnChanges();
    } else {
      this.pushFanOffChanges();
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	commandType     Command	          command parameter	         Description
   * Fan -        "command"       "swing"          "default"	        =        swing
   * Fan -        "command"       "timer"          "default"	        =        timer
   * Fan -        "command"       "lowSpeed"       "default"	        =        fan speed to low
   * Fan -        "command"       "middleSpeed"    "default"	        =        fan speed to medium
   * Fan -        "command"       "highSpeed"      "default"	        =        fan speed to high
   */
  async pushFanOnChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushFanOnChanges Active: ${this.Fan.Active},`
      + ` disablePushOn: ${this.disablePushOn}`);
    if (this.Fan.Active === this.hap.Characteristic.Active.ACTIVE && !this.disablePushOn) {
      const commandType: string = await this.commandType();
      const command: string = await this.commandOn();
      const bodyChange = JSON.stringify({
        command: command,
        parameter: 'default',
        commandType: commandType,
      });
      await this.pushChanges(bodyChange);
    }
  }

  async pushFanOffChanges(): Promise<void> {
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} pushLightOffChanges Active: ${this.Fan.Active},` +
      ` disablePushOff: ${this.disablePushOff}`,
    );
    if (this.Fan.Active === this.hap.Characteristic.Active.INACTIVE && !this.disablePushOff) {
      const commandType: string = await this.commandType();
      const command: string = await this.commandOff();
      const bodyChange = JSON.stringify({
        command: command,
        parameter: 'default',
        commandType: commandType,
      });
      await this.pushChanges(bodyChange);
    }
  }

  async pushFanSpeedUpChanges(): Promise<void> {
    const bodyChange = JSON.stringify({
      command: 'highSpeed',
      parameter: 'default',
      commandType: 'command',
    });
    await this.pushChanges(bodyChange);
  }

  async pushFanSpeedDownChanges(): Promise<void> {
    const bodyChange = JSON.stringify({
      command: 'lowSpeed',
      parameter: 'default',
      commandType: 'command',
    });
    await this.pushChanges(bodyChange);
  }

  async pushFanSwingChanges(): Promise<void> {
    const bodyChange = JSON.stringify({
      command: 'swing',
      parameter: 'default',
      commandType: 'command',
    });
    await this.pushChanges(bodyChange);
  }

  async pushChanges(bodyChange: any): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushChanges`);
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
          `${this.device.remoteType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType}` +
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
    if (this.Fan.Active === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Active: ${this.Fan.Active}`);
    } else {
      this.accessory.context.Active = this.Fan.Active;
      this.Fan.Service?.updateCharacteristic(this.hap.Characteristic.Active, this.Fan.Active);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.Fan.Active}`);
    }
    if (this.Fan.SwingMode === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} SwingMode: ${this.Fan.SwingMode}`);
    } else {
      this.accessory.context.SwingMode = this.Fan.SwingMode;
      this.Fan.Service?.updateCharacteristic(this.hap.Characteristic.SwingMode, this.Fan.SwingMode);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic SwingMode: ${this.Fan.SwingMode}`);
    }
    if (this.Fan.RotationSpeed === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} RotationSpeed: ${this.Fan.RotationSpeed}`);
    } else {
      this.accessory.context.RotationSpeed = this.Fan.RotationSpeed;
      this.Fan.Service?.updateCharacteristic(this.hap.Characteristic.RotationSpeed, this.Fan.RotationSpeed);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic RotationSpeed: ${this.Fan.RotationSpeed}`);
    }
  }

  async apiError(e: any): Promise<void> {
    this.Fan.Service.updateCharacteristic(this.hap.Characteristic.Active, e);
    this.Fan.Service.updateCharacteristic(this.hap.Characteristic.RotationSpeed, e);
    this.Fan.Service.updateCharacteristic(this.hap.Characteristic.SwingMode, e);
  }
}
