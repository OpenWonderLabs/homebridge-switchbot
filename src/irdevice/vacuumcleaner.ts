/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * vacuumcleaner.ts: @switchbot/homebridge-switchbot.
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
export class VacuumCleaner extends irdeviceBase {
  // Services
  private Switch: {
    Service: Service;
    On: CharacteristicValue;
  };

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device);

    // Initialize Switch property
    this.Switch = {
      Service: accessory.getService(this.hap.Service.Switch)!,
      On: accessory.context.On || false,
    };

    // get the Switch service if it exists, otherwise create a new Switch service
    const SwitchService = `${accessory.displayName} ${device.remoteType}`;
    (this.Switch.Service = accessory.getService(this.hap.Service.Switch)
      || accessory.addService(this.hap.Service.Switch)), SwitchService;

    this.Switch.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);

    // handle on / off events using the On characteristic
    this.Switch.Service.getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this));
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
          this.successLog(`${this.device.remoteType}: ${this.accessory.displayName} request to SwitchBot API, body: ${bodyChange} sent successfully`);
          this.updateHomeKitCharacteristics();
        } else {
          this.statusCode(statusCode);
          this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} failed pushChange`
          + ` with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`);
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
      this.Switch.Service?.updateCharacteristic(this.hap.Characteristic.On, this.Switch.On);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic On: ${this.Switch.On}`);
    }
  }

  async apiError(e: any): Promise<void> {
    this.Switch.Service.updateCharacteristic(this.hap.Characteristic.On, e);
  }
}
