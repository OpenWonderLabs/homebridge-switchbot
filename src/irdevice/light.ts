/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * light.ts: @switchbot/homebridge-switchbot.
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
export class Light extends irdeviceBase {
  // Services
  private LightBulb!: {
    Service: Service;
    On: CharacteristicValue;
  };

  ProgrammableSwitchServiceOn?: Service;
  ProgrammableSwitchServiceOff?: Service;

  // Characteristic Values
  On!: CharacteristicValue;
  ProgrammableSwitchEventOn?: CharacteristicValue;
  ProgrammableSwitchOutputStateOn?: CharacteristicValue;
  ProgrammableSwitchEventOff?: CharacteristicValue;
  ProgrammableSwitchOutputStateOff?: CharacteristicValue;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device);

    if (!device.irlight?.stateless) {
      // Initialize LightBulb property
      this.LightBulb = {
        Service: accessory.getService(this.hap.Service.Lightbulb) as Service,
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
      const ProgrammableSwitchServiceOn = `${accessory.displayName} ${device.remoteType} On`;
      (this.ProgrammableSwitchServiceOn = accessory.getService(this.hap.Service.StatefulProgrammableSwitch)
        || accessory.addService(this.hap.Service.StatefulProgrammableSwitch)), ProgrammableSwitchServiceOn;


      this.ProgrammableSwitchServiceOn.setCharacteristic(this.hap.Characteristic.Name, `${accessory.displayName} On`);

      this.ProgrammableSwitchServiceOn.getCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent).setProps({
        validValueRanges: [0, 0],
        minValue: 0,
        maxValue: 0,
        validValues: [0],
      })
        .onGet(() => {
          return this.ProgrammableSwitchEventOn!;
        });

      this.ProgrammableSwitchServiceOn.getCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState)
        .onSet(this.ProgrammableSwitchOutputStateSetOn.bind(this));



      // create a new Stateful Programmable Switch Off service
      const ProgrammableSwitchServiceOff = `${accessory.displayName} ${device.remoteType} Off`;
      (this.ProgrammableSwitchServiceOff = accessory.getService(this.hap.Service.StatefulProgrammableSwitch)
        || accessory.addService(this.hap.Service.StatefulProgrammableSwitch)), ProgrammableSwitchServiceOff;


      this.ProgrammableSwitchServiceOff.setCharacteristic(this.hap.Characteristic.Name, `${accessory.displayName} Off`);

      this.ProgrammableSwitchServiceOff.getCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent).setProps({
        validValueRanges: [0, 0],
        minValue: 0,
        maxValue: 0,
        validValues: [0],
      })
        .onGet(() => {
          return this.ProgrammableSwitchEventOff!;
        });

      this.ProgrammableSwitchServiceOff.getCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState)
        .onSet(this.ProgrammableSwitchOutputStateSetOff.bind(this));
    }

  }

  async OnSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${value}`);

    this.On = value;
    if (this.On) {
      await this.pushLightOnChanges();
    } else {
      await this.pushLightOffChanges();
    }
    /**
     * pushLightOnChanges and pushLightOffChanges above assume they are measuring the state of the accessory BEFORE
     * they are updated, so we are only updating the accessory state after calling the above.
     */
  }

  async ProgrammableSwitchOutputStateSetOn(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${value}`);

    this.ProgrammableSwitchOutputStateOn = value;
    if (this.ProgrammableSwitchOutputStateOn === 1) {
      this.On = true;
      await this.pushLightOnChanges();
    }
    /**
     * pushLightOnChanges and pushLightOffChanges above assume they are measuring the state of the accessory BEFORE
     * they are updated, so we are only updating the accessory state after calling the above.
     */
  }

  async ProgrammableSwitchOutputStateSetOff(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${value}`);

    this.ProgrammableSwitchOutputStateOff = value;
    if (this.ProgrammableSwitchOutputStateOff === 1) {
      this.On = false;
      await this.pushLightOffChanges();
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
  async pushLightOnChanges(): Promise<void> {
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} pushLightOnChanges On: ${this.On},` + ` disablePushOn: ${this.disablePushOn}`,
    );
    if (this.On && !this.disablePushOn) {
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

  async pushLightOffChanges(): Promise<void> {
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} pushLightOffChanges On: ${this.On},` + ` disablePushOff: ${this.disablePushOff}`,
    );
    if (!this.On && !this.disablePushOff) {
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

  /*async pushLightBrightnessUpChanges(): Promise<void> {
    const bodyChange = JSON.stringify({
      command: 'brightnessUp',
      parameter: 'default',
      commandType: 'command',
    });
    await this.pushChanges(bodyChange);
  }

  async pushLightBrightnessDownChanges(): Promise<void> {
    const bodyChange = JSON.stringify({
      command: 'brightnessDown',
      parameter: 'default',
      commandType: 'command',
    });
    await this.pushChanges(bodyChange);
  }*/

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
          this.accessory.context.On = this.On;
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
    if (this.device.irlight?.stateless) {
      // On
      if (this.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        this.accessory.context.On = this.On;
        this.LightBulb.Service?.updateCharacteristic(this.hap.Characteristic.On, this.On);
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
      }
    } else {
      // On Stateful Programmable Switch
      if (this.ProgrammableSwitchOutputStateOn === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName}`
          + ` ProgrammableSwitchOutputStateOn: ${this.ProgrammableSwitchOutputStateOn}`);
      } else {
        this.accessory.context.ProgrammableSwitchOutputStateOn = this.ProgrammableSwitchOutputStateOn;
        this.ProgrammableSwitchServiceOn?.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState,
          this.ProgrammableSwitchOutputStateOn);
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
          + ` ProgrammableSwitchOutputStateOn: ${this.ProgrammableSwitchOutputStateOn}`);
      }
      // Off Stateful Programmable Switch
      if (this.ProgrammableSwitchOutputStateOff === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName}`
          + ` ProgrammableSwitchOutputStateOff: ${this.ProgrammableSwitchOutputStateOff}`);
      } else {
        this.accessory.context.ProgrammableSwitchOutputStateOff = this.ProgrammableSwitchOutputStateOff;
        this.ProgrammableSwitchServiceOff?.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState,
          this.ProgrammableSwitchOutputStateOff);
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
          + ` ProgrammableSwitchOutputStateOff: ${this.ProgrammableSwitchOutputStateOff}`);
      }
    }
  }

  async apiError(e: any): Promise<void> {
    if (this.device.irlight?.stateless) {
      this.LightBulb.Service?.updateCharacteristic(this.hap.Characteristic.On, e);
    } else {
      this.ProgrammableSwitchServiceOn?.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent, e);
      this.ProgrammableSwitchServiceOn?.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, e);
      this.ProgrammableSwitchServiceOff?.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent, e);
      this.ProgrammableSwitchServiceOff?.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, e);
    }
  }
}
