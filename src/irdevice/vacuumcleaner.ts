/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * vacuumcleaner.ts: @switchbot/homebridge-switchbot.
 */
import { irdeviceBase } from './irdevice.js';

import type { SwitchBotPlatform } from '../platform.js';
import type { irDevicesConfig } from '../settings.js';
import type { irdevice } from '../types/irdevicelist.js';
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class VacuumCleaner extends irdeviceBase {
  // Services
  private Switch: {
    Name: CharacteristicValue;
    Service: Service;
    On: CharacteristicValue;
  };

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device);

    // Initialize Switch Service
    accessory.context.Switch = accessory.context.Switch ?? {};
    this.Switch = {
      Name: accessory.context.Switch.Name ?? `${accessory.displayName} ${device.remoteType}`,
      Service: accessory.getService(this.hap.Service.Switch) ?? accessory.addService(this.hap.Service.Switch) as Service,
      On: accessory.context.On ?? false,
    };
    accessory.context.Switch = this.Switch as object;

    this.Switch.Service
      .setCharacteristic(this.hap.Characteristic.Name, this.Switch.Name)
      .getCharacteristic(this.hap.Characteristic.On)
      .onGet(() => {
        return this.Switch.On;
      })
      .onSet(this.OnSet.bind(this));
  }

  async OnSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${value}`);

    // Set the requested state
    this.Switch.On = value;
    if (this.Switch.On) {
      await this.pushOnChanges();
    } else {
      await this.pushOffChanges();
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	       CommandType     Command	      Parameter       Description
   * Vacuum Cleaner    "command"       "turnOff"      "default"	      set to OFF state
   * Vacuum Cleaner    "command"       "turnOn"       "default"	      set to ON state
   */
  async pushOnChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushOnChanges`
      + ` On: ${this.Switch.On}, disablePushOn: ${this.disablePushOn}`);
    if (this.Switch.On && !this.disablePushOn) {
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

  async pushOffChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushOffChanges`
      + ` On: ${this.Switch.On}, disablePushOff: ${this.disablePushOff}`);
    if (!this.Switch.On && !this.disablePushOff) {
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
    // On
    if (this.Switch.On === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.Switch.On}`);
    } else {
      this.accessory.context.On = this.Switch.On;
      this.Switch.Service.updateCharacteristic(this.hap.Characteristic.On, this.Switch.On);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic On: ${this.Switch.On}`);
    }
  }

  async apiError(e: any): Promise<void> {
    this.Switch.Service.updateCharacteristic(this.hap.Characteristic.On, e);
  }
}
