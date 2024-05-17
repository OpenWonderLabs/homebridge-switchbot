/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * waterheater.ts: @switchbot/homebridge-switchbot.
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
export class WaterHeater extends irdeviceBase {
  // Services
  private Valve: {
    Service: Service;
    Active: CharacteristicValue;
  };

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device);

    // Initialize Valve property
    this.Valve = {
      Service: accessory.getService(this.hap.Service.Valve)!,
      Active: accessory.context.Active || this.hap.Characteristic.Active.INACTIVE,
    };

    // get the Television service if it exists, otherwise create a new Television service
    // you can create multiple services for each accessory
    const ValveService = `${accessory.displayName} ${device.remoteType}`;
    (this.Valve.Service = accessory.getService(this.hap.Service.Valve)
      || accessory.addService(this.hap.Service.Valve)), ValveService;

    this.Valve.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);

    // set sleep discovery characteristic
    this.Valve.Service.setCharacteristic(this.hap.Characteristic.ValveType, this.hap.Characteristic.ValveType.GENERIC_VALVE);

    // handle on / off events using the Active characteristic
    this.Valve.Service.getCharacteristic(this.hap.Characteristic.Active).onSet(this.ActiveSet.bind(this));
  }

  async ActiveSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Active: ${value}`);

    this.Valve.Active = value;
    if (this.Valve.Active === this.hap.Characteristic.Active.ACTIVE) {
      await this.pushWaterHeaterOnChanges();
      this.Valve.Service.setCharacteristic(this.hap.Characteristic.InUse, this.hap.Characteristic.InUse.IN_USE);
    } else {
      await this.pushWaterHeaterOffChanges();
      this.Valve.Service.setCharacteristic(this.hap.Characteristic.InUse, this.hap.Characteristic.InUse.NOT_IN_USE);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	     Command Type    Command	         Parameter	       Description
   * WaterHeater     "command"       "turnOff"         "default"	       set to OFF state
   * WaterHeater     "command"       "turnOn"          "default"	       set to ON state
   */
  async pushWaterHeaterOnChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushWaterHeaterOnChanges Active: ${this.Valve.Active},`
      + ` disablePushOn: ${this.disablePushOn}`);
    if (this.Valve.Active === this.hap.Characteristic.Active.ACTIVE && !this.disablePushOn) {
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

  async pushWaterHeaterOffChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushWaterHeaterOffChanges Active: ${this.Valve.Active},`
      + ` disablePushOff: ${this.disablePushOff}`);
    if (this.Valve.Active === this.hap.Characteristic.Active.INACTIVE && !this.disablePushOff) {
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
    if (this.Valve.Active === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Active: ${this.Valve.Active}`);
    } else {
      this.accessory.context.Active = this.Valve.Active;
      this.Valve.Service?.updateCharacteristic(this.hap.Characteristic.Active, this.Valve.Active);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.Valve.Active}`);
    }
  }

  async apiError({ e }: { e: any }): Promise<void> {
    this.Valve.Service.updateCharacteristic(this.hap.Characteristic.Active, e);
  }
}
