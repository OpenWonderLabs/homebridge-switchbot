/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * light.ts: @switchbot/homebridge-switchbot.
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
export class Light extends irdeviceBase {
  // Services
  private LightBulb?: {
    Name: CharacteristicValue;
    Service: Service;
    On: CharacteristicValue;
  };

  private ProgrammableSwitchOn?: {
    Name: CharacteristicValue;
    Service: Service;
    ProgrammableSwitchEvent: CharacteristicValue;
    ProgrammableSwitchOutputState: CharacteristicValue;
  };

  private ProgrammableSwitchOff?: {
    Name: CharacteristicValue;
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
      // Initialize LightBulb Service
      accessory.context.LightBulb = accessory.context.LightBulb ?? {};
      this.LightBulb = {
        Name: accessory.context.LightBulb.Name ?? `${accessory.displayName} ${device.remoteType}`,
        Service: accessory.getService(this.hap.Service.Lightbulb) ?? accessory.addService(this.hap.Service.Lightbulb) as Service,
        On: accessory.context.On || false,
      };
      accessory.context.LightBulb = this.LightBulb as object;

      this.LightBulb.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.LightBulb.Name)
        .getCharacteristic(this.hap.Characteristic.On)
        .onGet(() => {
          return this.LightBulb!.On;
        })
        .onSet(this.OnSet.bind(this));
    } else {
      // Initialize ProgrammableSwitchOn Service
      accessory.context.ProgrammableSwitchOn = accessory.context.ProgrammableSwitchOn ?? {};
      this.ProgrammableSwitchOn = {
        Name: accessory.context.ProgrammableSwitchOn.Name ?? `${accessory.displayName} ${device.remoteType} On`,
        Service: accessory.getService(this.hap.Service.StatefulProgrammableSwitch)
        ?? accessory.addService(this.hap.Service.StatefulProgrammableSwitch) as Service,
        ProgrammableSwitchEvent: accessory.context.ProgrammableSwitchEvent ?? this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
        ProgrammableSwitchOutputState: accessory.context.ProgrammableSwitchOutputState ?? 0,
      };
      accessory.context.ProgrammableSwitchOn = this.ProgrammableSwitchOn as object;

      // Initialize ProgrammableSwitchOn Characteristics
      this.ProgrammableSwitchOn?.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.ProgrammableSwitchOn.Name)
        .getCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent).setProps({
          validValueRanges: [0, 0],
          minValue: 0,
          maxValue: 0,
          validValues: [0],
        })
        .onGet(() => {
          return this.ProgrammableSwitchOn!.ProgrammableSwitchEvent;
        });

      this.ProgrammableSwitchOn?.Service
        .getCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState)
        .onGet(() => {
          return this.ProgrammableSwitchOn!.ProgrammableSwitchOutputState;
        })
        .onSet(this.ProgrammableSwitchOutputStateSetOn.bind(this));

      // Initialize ProgrammableSwitchOff Service
      accessory.context.ProgrammableSwitchOff = accessory.context.ProgrammableSwitchOff ?? {};
      this.ProgrammableSwitchOff = {
        Name: accessory.context.ProgrammableSwitchOff.Name ?? `${accessory.displayName} ${device.remoteType} Off`,
        Service: accessory.getService(this.hap.Service.StatefulProgrammableSwitch)
        ?? accessory.addService(this.hap.Service.StatefulProgrammableSwitch) as Service,
        ProgrammableSwitchEvent: accessory.context.ProgrammableSwitchEvent ?? this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
        ProgrammableSwitchOutputState: accessory.context.ProgrammableSwitchOutputState ?? 0,
      };
      accessory.context.ProgrammableSwitchOff = this.ProgrammableSwitchOff as object;

      // Initialize ProgrammableSwitchOff Characteristics
      this.ProgrammableSwitchOff?.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.ProgrammableSwitchOff.Name)
        .getCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent).setProps({
          validValueRanges: [0, 0],
          minValue: 0,
          maxValue: 0,
          validValues: [0],
        })
        .onGet(() => {
          return this.ProgrammableSwitchOff!.ProgrammableSwitchEvent;
        });

      this.ProgrammableSwitchOff?.Service
        .getCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState)
        .onGet(() => {
          return this.ProgrammableSwitchOff!.ProgrammableSwitchOutputState;
        })
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
        const { body, statusCode } = await this.pushChangeRequest(bodyChange);
        const deviceStatus: any = await body.json();
        await this.pushStatusCodes(statusCode, deviceStatus);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          await this.successfulPushChange(statusCode, deviceStatus, bodyChange);
          this.accessory.context.On = On;
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
