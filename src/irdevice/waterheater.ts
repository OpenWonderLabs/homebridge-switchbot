/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * waterheater.ts: @switchbot/homebridge-switchbot.
 */
import { irdeviceBase } from './irdevice.js';

import type { SwitchBotPlatform } from '../platform.js';
import type { irDevicesConfig, irdevice } from '../settings.js';
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class WaterHeater extends irdeviceBase {
  // Services
  private Valve: {
    Name: CharacteristicValue;
    Service: Service;
    Active: CharacteristicValue;
  };

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device);

    // Initialize Switch Service
    accessory.context.Valve = accessory.context.Valve ?? {};
    this.Valve = {
      Name: accessory.context.Valve.Name ?? `${accessory.displayName} ${device.remoteType}`,
      Service: accessory.getService(this.hap.Service.Valve) ?? accessory.addService(this.hap.Service.Valve) as Service,
      Active: accessory.context.Active ?? this.hap.Characteristic.Active.INACTIVE,
    };
    accessory.context.Valve = this.Valve as object;

    this.Valve.Service
      .setCharacteristic(this.hap.Characteristic.Name, accessory.displayName)
      .setCharacteristic(this.hap.Characteristic.ValveType, this.hap.Characteristic.ValveType.GENERIC_VALVE)
      .getCharacteristic(this.hap.Characteristic.Active)
      .onGet(() => {
        return this.Valve.Active;
      })
      .onSet(this.ActiveSet.bind(this));
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
        const { body, statusCode } = await this.pushChangeRequest(bodyChange);
        const deviceStatus: any = await body.json();
        await this.pushStatusCodes(statusCode, deviceStatus);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          await this.successfulPushChange(statusCode, deviceStatus, bodyChange);
          await this.updateHomeKitCharacteristics();
        } else {
          await this.statusCode(statusCode);
          await this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        await this.apiError(e);
        await this.pushChangeError(e);
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
      this.Valve.Service.updateCharacteristic(this.hap.Characteristic.Active, this.Valve.Active);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.Valve.Active}`);
    }
  }

  async apiError({ e }: { e: any }): Promise<void> {
    this.Valve.Service.updateCharacteristic(this.hap.Characteristic.Active, e);
  }
}
