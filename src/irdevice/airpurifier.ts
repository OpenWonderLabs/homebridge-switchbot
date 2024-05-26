/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * airpurifier.ts: @switchbot/homebridge-switchbot.
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
export class AirPurifier extends irdeviceBase {
  // Services
  private AirPurifier: {
    Name: CharacteristicValue;
    Service: Service;
    Active: CharacteristicValue;
    RotationSpeed: CharacteristicValue;
    CurrentAirPurifierState: CharacteristicValue;
    TargetAirPurifierState: CharacteristicValue;
  };

  private TemperatureSensor: {
    Name: CharacteristicValue;
    Service: Service;
    CurrentTemperature: CharacteristicValue;
  };

  // Characteristic Values
  APActive!: CharacteristicValue;
  CurrentAPTemp!: CharacteristicValue;
  CurrentAPMode!: CharacteristicValue;
  CurrentAPFanSpeed!: CharacteristicValue;
  CurrentHeaterCoolerState!: CharacteristicValue;

  // Others
  Busy: any;
  Timeout: any = null;
  static IDLE: number;
  CurrentMode!: number;
  static INACTIVE: number;
  LastTemperature!: number;
  CurrentFanSpeed!: number;
  static PURIFYING_AIR: number;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device);

    // Initialize AirPurifier Service
    accessory.context.AirPurifier = accessory.context.AirPurifier ?? {};
    this.AirPurifier = {
      Name: accessory.context.AirPurifier.Name ?? `${accessory.displayName} Air Purifier`,
      Service: accessory.getService(this.hap.Service.AirPurifier) ?? accessory.addService(this.hap.Service.AirPurifier) as Service,
      Active: accessory.context.Active ?? this.hap.Characteristic.Active.INACTIVE,
      RotationSpeed: accessory.context.RotationSpeed ?? 0,
      CurrentAirPurifierState: accessory.context.CurrentAirPurifierState ?? this.hap.Characteristic.CurrentAirPurifierState.INACTIVE,
      TargetAirPurifierState: accessory.context.TargetAirPurifierState ?? this.hap.Characteristic.TargetAirPurifierState.AUTO,
    };
    accessory.context.AirPurifier = this.AirPurifier as object;

    this.AirPurifier.Service
      .setCharacteristic(this.hap.Characteristic.Name, this.AirPurifier.Name)
      .getCharacteristic(this.hap.Characteristic.Active)
      .onGet(() => {
        return this.AirPurifier.Active;
      })
      .onSet(this.ActiveSet.bind(this));

    this.AirPurifier.Service
      .getCharacteristic(this.hap.Characteristic.CurrentAirPurifierState)
      .onGet(() => {
        return this.CurrentAirPurifierStateGet();
      });

    this.AirPurifier.Service
      .getCharacteristic(this.hap.Characteristic.TargetAirPurifierState)
      .onGet(() => {
        return this.AirPurifier.TargetAirPurifierState;
      })
      .onSet(this.TargetAirPurifierStateSet.bind(this));

    // Initialize TemperatureSensor Service
    accessory.context.TemperatureSensor = accessory.context.TemperatureSensor ?? {};
    this.TemperatureSensor = {
      Name: accessory.context.TemperatureSensor.Name ?? `${accessory.displayName} Temperature Sensor`,
      Service: accessory.getService(this.hap.Service.TemperatureSensor) ?? accessory.addService(this.hap.Service.TemperatureSensor) as Service,
      CurrentTemperature: accessory.context.CurrentTemperature || 24,
    };
    accessory.context.TemperatureSensor = this.TemperatureSensor as object;

    this.TemperatureSensor.Service
      .setCharacteristic(this.hap.Characteristic.Name, this.TemperatureSensor.Name)
      .getCharacteristic(this.hap.Characteristic.CurrentTemperature)
      .onGet(() => {
        return this.TemperatureSensor.CurrentTemperature;
      });
  }

  async ActiveSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Active: ${value}`);

    this.AirPurifier.Active = value;
    if (this.AirPurifier.Active === this.hap.Characteristic.Active.ACTIVE) {
      this.pushAirPurifierOnChanges();
    } else {
      this.pushAirPurifierOffChanges();
    }
  }

  async TargetAirPurifierStateSet(value: CharacteristicValue): Promise<void> {
    switch (value) {
      case this.hap.Characteristic.CurrentAirPurifierState.PURIFYING_AIR:
        this.CurrentMode = AirPurifier.PURIFYING_AIR;
        break;
      case this.hap.Characteristic.CurrentAirPurifierState.IDLE:
        this.CurrentMode = AirPurifier.IDLE;
        break;
      case this.hap.Characteristic.CurrentAirPurifierState.INACTIVE:
        this.CurrentMode = AirPurifier.INACTIVE;
        break;
      default:
        break;
    }
  }

  async CurrentAirPurifierStateGet(): Promise<number> {
    if (this.AirPurifier.Active === 1) {
      this.AirPurifier.CurrentAirPurifierState = this.hap.Characteristic.CurrentAirPurifierState.PURIFYING_AIR;
    } else {
      this.AirPurifier.CurrentAirPurifierState = this.hap.Characteristic.CurrentAirPurifierState.INACTIVE;
    }
    return this.AirPurifier.CurrentAirPurifierState;
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType				commandType     Command	          command parameter	         Description
   * AirPurifier:        "command"       "turnOn"         "default"	        =        every home appliance can be turned on by default
   * AirPurifier:        "command"       "turnOff"        "default"	        =        every home appliance can be turned off by default
   * AirPurifier:        "command"       "swing"          "default"	        =        swing
   * AirPurifier:        "command"       "timer"          "default"	        =        timer
   * AirPurifier:        "command"       "lowSpeed"       "default"	        =        fan speed to low
   * AirPurifier:        "command"       "middleSpeed"    "default"	        =        fan speed to medium
   * AirPurifier:        "command"       "highSpeed"      "default"	        =        fan speed to high
   */
  async pushAirPurifierOnChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushAirPurifierOnChanges Active: ${this.AirPurifier.Active},`
      + ` disablePushOn: ${this.disablePushOn}`);
    if (this.AirPurifier.Active === this.hap.Characteristic.Active.ACTIVE && !this.disablePushOn) {
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

  async pushAirPurifierOffChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushAirPurifierOffChanges Active: ${this.AirPurifier.Active},`
      + ` disablePushOff: ${this.disablePushOff}`);
    if (this.AirPurifier.Active === this.hap.Characteristic.Active.INACTIVE && !this.disablePushOn) {
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

  async pushAirPurifierStatusChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushAirPurifierStatusChanges Active: ${this.AirPurifier.Active},`
      + ` disablePushOff: ${this.disablePushOff},  disablePushOn: ${this.disablePushOn}`);
    if (!this.Busy) {
      this.Busy = true;
      this.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.IDLE;
    }
    clearTimeout(this.Timeout);

    // Make a new Timeout set to go off in 1000ms (1 second)
    this.Timeout = setTimeout(this.pushAirPurifierDetailsChanges.bind(this), 1500);
  }

  async pushAirPurifierDetailsChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushAirPurifierDetailsChanges Active: ${this.AirPurifier.Active},`
      + ` disablePushOff: ${this.disablePushOff},  disablePushOn: ${this.disablePushOn}`);
    this.CurrentAPTemp = this.TemperatureSensor!.CurrentTemperature ?? 24;
    this.CurrentAPMode = this.CurrentMode ?? 1;
    this.CurrentAPFanSpeed = this.CurrentFanSpeed ?? 1;
    this.APActive = this.AirPurifier.Active === 1 ? 'on' : 'off';
    const parameter = `${this.CurrentAPTemp},${this.CurrentAPMode},${this.CurrentAPFanSpeed},${this.APActive}`;
    const bodyChange = JSON.stringify({
      command: 'setAll',
      parameter: `${parameter}`,
      commandType: 'command',
    });
    if (this.AirPurifier.Active === 1) {
      if ((Number(this.TemperatureSensor!.CurrentTemperature) || 24) < (this.LastTemperature || 30)) {
        this.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.COOLING;
      } else {
        this.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.HEATING;
      }
    } else {
      this.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }
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
            + ` request to SwitchBot API, body: ${JSON.stringify(JSON.parse(bodyChange))} sent successfully`);
          this.updateHomeKitCharacteristics();
        } else {
          this.statusCode(statusCode);
          this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType}`
          + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
      }
    } else {
      this.warnLog(`${this.device.remoteType}: ${this.accessory.displayName}`
        + ` Connection Type: ${this.device.connectionType}, commands will not be sent to OpenAPI`);
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    // Active
    if (this.AirPurifier.Active === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Active: ${this.AirPurifier.Active}`);
    } else {
      this.accessory.context.Active = this.AirPurifier.Active;
      this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.Active, this.AirPurifier.Active);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.AirPurifier.Active}`);
    }
    // CurrentAirPurifierState
    if (this.AirPurifier.CurrentAirPurifierState === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} CurrentAirPurifierState: ${this.AirPurifier.CurrentAirPurifierState}`);
    } else {
      this.accessory.context.CurrentAirPurifierState = this.AirPurifier.CurrentAirPurifierState;
      this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentAirPurifierState, this.AirPurifier.CurrentAirPurifierState);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
        + ` CurrentAirPurifierState: ${this.AirPurifier.CurrentAirPurifierState}`);
    }
    // CurrentHeaterCoolerState
    if (this.CurrentHeaterCoolerState === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`);
    } else {
      this.accessory.context.CurrentHeaterCoolerState = this.CurrentHeaterCoolerState;
      this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentHeaterCoolerState, this.CurrentHeaterCoolerState);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
        + ` CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`);
    }
    // CurrentTemperature
    if (this.TemperatureSensor.CurrentTemperature === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} CurrentTemperature: ${this.TemperatureSensor.CurrentTemperature}`);
    } else {
      this.accessory.context.CurrentTemperature = this.TemperatureSensor.CurrentTemperature;
      this.TemperatureSensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, this.TemperatureSensor.CurrentTemperature);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
        + ` CurrentTemperature: ${this.TemperatureSensor.CurrentTemperature}`);
    }
  }

  async apiError(e: any): Promise<void> {
    this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentHeaterCoolerState, e);
    this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentAirPurifierState, e);
    this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.TargetAirPurifierState, e);
    this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.Active, e);
    this.TemperatureSensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, e);
  }
}
