/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * light.ts: @switchbot/homebridge-switchbot.
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
export class Light extends irdeviceBase {
  // Services
  private LightBulb?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private ProgrammableSwitchOn?: {
    Service: Service;
    ProgrammableSwitchEvent: CharacteristicValue;
    ProgrammableSwitchOutputState: CharacteristicValue;
  };

  private ProgrammableSwitchOff?: {
    Service: Service;
    ProgrammableSwitchEvent: CharacteristicValue;
    ProgrammableSwitchOutputState: CharacteristicValue;
  };

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device);

    if (!device.irlight?.stateless) {
      // Initialize LightBulb property
      this.LightBulb = {
        Service: accessory.getService(this.hap.Service.Lightbulb)! as Service,
        On: accessory.context.On || false,
      };
      // get the Light service if it exists, otherwise create a new Light service
      // you can create multiple services for each accessory
      const LightBulbService = `${accessory.displayName} ${device.remoteType}`;
      (this.LightBulb.Service = accessory.getService(this.hap.Service.Lightbulb)
        || accessory.addService(this.hap.Service.Lightbulb)), LightBulbService;


      this.LightBulb.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);

      // handle on / off events using the On characteristic
      this.LightBulb.Service.getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this));
    } else {

      // create a new Stateful Programmable Switch On service
      const ProgrammableSwitchOn = `${accessory.displayName} ${device.remoteType} On`;
      (this.ProgrammableSwitchOn!.Service = accessory.getService(this.hap.Service.StatefulProgrammableSwitch)
        || accessory.addService(this.hap.Service.StatefulProgrammableSwitch)), ProgrammableSwitchOn;


      this.ProgrammableSwitchOn?.Service.setCharacteristic(this.hap.Characteristic.Name, `${accessory.displayName} On`);

      this.ProgrammableSwitchOn?.Service.getCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent).setProps({
        validValueRanges: [0, 0],
        minValue: 0,
        maxValue: 0,
        validValues: [0],
      })
        .onGet(() => {
          return this.ProgrammableSwitchOn!.ProgrammableSwitchEvent;
        });

      this.ProgrammableSwitchOn?.Service.getCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState)
        .onSet(this.ProgrammableSwitchOutputStateSetOn.bind(this));



      // create a new Stateful Programmable Switch Off service
      const ProgrammableSwitchOff = `${accessory.displayName} ${device.remoteType} Off`;
      (this.ProgrammableSwitchOff!.Service = accessory.getService(this.hap.Service.StatefulProgrammableSwitch)
        || accessory.addService(this.hap.Service.StatefulProgrammableSwitch)), ProgrammableSwitchOff;


      this.ProgrammableSwitchOff?.Service.setCharacteristic(this.hap.Characteristic.Name, `${accessory.displayName} Off`);

      this.ProgrammableSwitchOff?.Service.getCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent).setProps({
        validValueRanges: [0, 0],
        minValue: 0,
        maxValue: 0,
        validValues: [0],
      })
        .onGet(() => {
          return this.ProgrammableSwitchOff!.ProgrammableSwitchEvent;
        });

      this.ProgrammableSwitchOff?.Service.getCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState)
        .onSet(this.ProgrammableSwitchOutputStateSetOff.bind(this));
    }

  }

  async OnSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${value}`);

    this.LightBulb!.On = value;
    if (this.LightBulb?.On) {
      const On = true;
      await this.pushLightOnChanges(On);
    } else {
      const On = false;
      await this.pushLightOffChanges(On);
    }
    /**
     * pushLightOnChanges and pushLightOffChanges above assume they are measuring the state of the accessory BEFORE
     * they are updated, so we are only updating the accessory state after calling the above.
     */
  }

  async ProgrammableSwitchOutputStateSetOn(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${value}`);

    this.ProgrammableSwitchOn!.ProgrammableSwitchOutputState = value;
    if (this.ProgrammableSwitchOn?.ProgrammableSwitchOutputState === 1) {
      const On = true;
      await this.pushLightOnChanges(On);
    }
    /**
     * pushLightOnChanges and pushLightOffChanges above assume they are measuring the state of the accessory BEFORE
     * they are updated, so we are only updating the accessory state after calling the above.
     */
  }

  async ProgrammableSwitchOutputStateSetOff(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${value}`);

    this.ProgrammableSwitchOff!.ProgrammableSwitchOutputState = value;
    if (this.ProgrammableSwitchOff?.ProgrammableSwitchOutputState === 1) {
      const On = false;
      await this.pushLightOffChanges(On);
    }
    /**
     * pushLightOnChanges and pushLightOffChanges above assume they are measuring the state of the accessory BEFORE
     * they are updated, so we are only updating the accessory state after calling the above.
     */
  }



  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	commandType     Command	          command parameter	         Description
   * Light -        "command"       "turnOff"         "default"	        =        set to OFF state
   * Light -       "command"       "turnOn"          "default"	        =        set to ON state
   * Light -       "command"       "volumeAdd"       "default"	        =        volume up
   * Light -       "command"       "volumeSub"       "default"	        =        volume down
   * Light -       "command"       "channelAdd"      "default"	        =        next channel
   * Light -       "command"       "channelSub"      "default"	        =        previous channel
   */
  async pushLightOnChanges(On: boolean): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushLightOnChanges On: ${On}, disablePushOn: ${this.disablePushOn}`);
    if (On === true && this.disablePushOn === false) {
      const commandType: string = await this.commandType();
      const command: string = await this.commandOn();
      const bodyChange = JSON.stringify({
        command: command,
        parameter: 'default',
        commandType: commandType,
      });
      await this.pushChanges(bodyChange, On);
    }
  }

  async pushLightOffChanges(On: boolean): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushLightOffChanges On: ${On}, disablePushOff: ${this.disablePushOff}`);
    if (On === false && this.disablePushOff === false) {
      const commandType: string = await this.commandType();
      const command: string = await this.commandOff();
      const bodyChange = JSON.stringify({
        command: command,
        parameter: 'default',
        commandType: commandType,
      });
      await this.pushChanges(bodyChange, On);
    }
  }

  async pushChanges(bodyChange: any, On: boolean): Promise<void> {
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
          this.accessory.context.On = On;
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
      this.warnLog(`${this.device.remoteType}: ${this.accessory.displayName} Connection Type: `
      + `${this.device.connectionType}, commands will not be sent to OpenAPI`);
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    if (!this.device.irlight?.stateless) {
      // On
      if (this.LightBulb?.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.LightBulb?.On}`);
      } else {
        this.accessory.context.On = this.LightBulb.On;
        this.LightBulb?.Service.updateCharacteristic(this.hap.Characteristic.On, this.LightBulb.On);
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic On: ${this.LightBulb.On}`);
      }
    } else {
      // On Stateful Programmable Switch
      if (this.ProgrammableSwitchOn?.ProgrammableSwitchOutputState === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName}`
          + ` ProgrammableSwitchOutputStateOn: ${this.ProgrammableSwitchOn?.ProgrammableSwitchOutputState}`);
      } else {
        this.accessory.context.ProgrammableSwitchOutputStateOn = this.ProgrammableSwitchOn.ProgrammableSwitchOutputState;
        this.ProgrammableSwitchOn?.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState,
          this.ProgrammableSwitchOn.ProgrammableSwitchOutputState);
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
          + ` ProgrammableSwitchOutputStateOn: ${this.ProgrammableSwitchOn.ProgrammableSwitchOutputState}`);
      }
      // Off Stateful Programmable Switch
      if (this.ProgrammableSwitchOff?.ProgrammableSwitchOutputState === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName}`
          + ` ProgrammableSwitchOutputStateOff: ${this.ProgrammableSwitchOff?.ProgrammableSwitchOutputState}`);
      } else {
        this.accessory.context.ProgrammableSwitchOutputStateOff = this.ProgrammableSwitchOff.ProgrammableSwitchOutputState;
        this.ProgrammableSwitchOff.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState,
          this.ProgrammableSwitchOff.ProgrammableSwitchOutputState);
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
          + ` ProgrammableSwitchOutputStateOff: ${this.ProgrammableSwitchOff?.ProgrammableSwitchOutputState}`);
      }
    }
  }

  async apiError(e: any): Promise<void> {
    if (!this.device.irlight?.stateless) {
      this.LightBulb?.Service.updateCharacteristic(this.hap.Characteristic.On, e);
    } else {
      this.ProgrammableSwitchOn?.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent, e);
      this.ProgrammableSwitchOn?.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, e);
      this.ProgrammableSwitchOff?.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent, e);
      this.ProgrammableSwitchOff?.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, e);
    }
  }
}
