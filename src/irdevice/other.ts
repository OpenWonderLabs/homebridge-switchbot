/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * other.ts: @switchbot/homebridge-switchbot.
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
export class Others extends irdeviceBase {
  // Services
  private Switch?: {
    Name: CharacteristicValue;
    Service: Service;
    On: CharacteristicValue;
  };

  private GarageDoor?: {
    Name: CharacteristicValue;
    Service: Service;
    On: CharacteristicValue;
  };

  private Door?: {
    Name: CharacteristicValue;
    Service: Service;
    On: CharacteristicValue;
  };

  private Window?: {
    Name: CharacteristicValue;
    Service: Service;
    On: CharacteristicValue;
  };

  private WindowCovering?: {
    Name: CharacteristicValue;
    Service: Service;
    On: CharacteristicValue;
  };

  private LockMechanism?: {
    Name: CharacteristicValue;
    Service: Service;
    On: CharacteristicValue;
  };

  private Faucet?: {
    Name: CharacteristicValue;
    Service: Service;
    On: CharacteristicValue;
  };

  private Fan?: {
    Name: CharacteristicValue;
    Service: Service;
    On: CharacteristicValue;
  };

  private StatefulProgrammableSwitch?: {
    Name: CharacteristicValue;
    Service: Service;
    On: CharacteristicValue;
  };

  private Outlet?: {
    Name: CharacteristicValue;
    Service: Service;
    On: CharacteristicValue;
  };

  // Config
  otherDeviceType?: string;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device);

    // default placeholders
    this.getOtherConfigSettings(device);

    // deviceType
    if (this.otherDeviceType === 'switch') {
      // Initialize Switch Service
      accessory.context.Switch = accessory.context.Switch ?? {};
      this.Switch = {
        Name: accessory.context.Switch.Name ?? `${accessory.displayName} Switch`,
        Service: accessory.getService(this.hap.Service.Switch) ?? accessory.addService(this.hap.Service.Switch) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.Switch = this.Switch as object;
      this.debugWarnLog('Displaying as Switch');

      this.Switch.Service
        .setCharacteristic(this.hap.Characteristic.Name, accessory.displayName)
        .getCharacteristic(this.hap.Characteristic.On)
        .onGet(() => {
          return this.Switch!.On;
        })
        .onSet(this.OnSet.bind(this));

      // Remove other services
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeFaucetService(accessory);
      this.removeOutletService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);
    } else if (this.otherDeviceType === 'garagedoor') {
      // Initialize Garage Door Service
      accessory.context.GarageDoor = accessory.context.GarageDoor ?? {};
      this.GarageDoor = {
        Name: accessory.context.GarageDoor.Name ?? `${accessory.displayName} Garage Door`,
        Service: accessory.getService(this.hap.Service.GarageDoorOpener) ?? accessory.addService(this.hap.Service.GarageDoorOpener) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.GarageDoor = this.GarageDoor as object;
      this.debugWarnLog('Displaying as Garage Door Opener');

      this.GarageDoor.Service
        .setCharacteristic(this.hap.Characteristic.Name, accessory.displayName)
        .setCharacteristic(this.hap.Characteristic.ObstructionDetected, false)
        .getCharacteristic(this.hap.Characteristic.TargetDoorState)
        .onGet(() => {
          return this.GarageDoor!.On;
        })
        .onSet(this.OnSet.bind(this));

      // Remove other services
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeFaucetService(accessory);
      this.removeOutletService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);
    } else if (this.otherDeviceType === 'door') {
      // Initialize Door Service
      accessory.context.Door = accessory.context.Door ?? {};
      this.Door = {
        Name: accessory.context.Door.Name ?? `${accessory.displayName} Door`,
        Service: accessory.getService(this.hap.Service.Door) ?? accessory.addService(this.hap.Service.Door) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.Door = this.Door as object;
      this.debugWarnLog('Displaying as Door');

      this.Door!.Service
        .setCharacteristic(this.hap.Characteristic.Name, accessory.displayName)
        .setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED)
        .getCharacteristic(this.hap.Characteristic.TargetPosition)
        .setProps({
          validValues: [0, 100],
          minValue: 0,
          maxValue: 100,
          minStep: 100,
        })
        .onGet(() => {
          return this.GarageDoor!.On;
        })
        .onSet(this.OnSet.bind(this));

      // Remove other services
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeOutletService(accessory);
      this.removeFaucetService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);
    } else if (this.otherDeviceType === 'window') {
      // Initialize Window Service
      accessory.context.Window = accessory.context.Window ?? {};
      this.Window = {
        Name: accessory.context.Window.Name ?? `${accessory.displayName} Window`,
        Service: accessory.getService(this.hap.Service.Window) ?? accessory.addService(this.hap.Service.Window) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.Window = this.Window as object;
      this.debugWarnLog('Displaying as Window');

      this.Window!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName)
        .setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED)
        .getCharacteristic(this.hap.Characteristic.TargetPosition)
        .setProps({
          validValues: [0, 100],
          minValue: 0,
          maxValue: 100,
          minStep: 100,
        })
        .onGet(() => {
          return this.GarageDoor!.On;
        })
        .onSet(this.OnSet.bind(this));

      // Remove other services
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeOutletService(accessory);
      this.removeFaucetService(accessory);
      this.removeSwitchService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);
    } else if (this.otherDeviceType === 'windowcovering') {
      // Initialize WindowCovering Service
      accessory.context.WindowCovering = accessory.context.WindowCovering ?? {};
      this.WindowCovering = {
        Name: accessory.context.WindowCovering.Name ?? `${accessory.displayName} Window Covering`,
        Service: accessory.getService(this.hap.Service.WindowCovering) ?? accessory.addService(this.hap.Service.WindowCovering) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.WindowCovering = this.WindowCovering as object;
      this.debugWarnLog('Displaying as Window Covering');

      this.WindowCovering.Service
        .setCharacteristic(this.hap.Characteristic.Name, accessory.displayName)
        .setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED)
        .getCharacteristic(this.hap.Characteristic.TargetPosition)
        .setProps({
          validValues: [0, 100],
          minValue: 0,
          maxValue: 100,
          minStep: 100,
        })
        .onGet(() => {
          return this.WindowCovering!.On;
        })
        .onSet(this.OnSet.bind(this));

      // Remove other services
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeOutletService(accessory);
      this.removeFaucetService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);
    } else if (this.otherDeviceType === 'lock') {
      // Initialize LockMechanism Service
      accessory.context.LockMechanism = accessory.context.LockMechanism ?? {};
      this.LockMechanism = {
        Name: accessory.context.LockMechanism.Name ?? `${accessory.displayName} Lock`,
        Service: accessory.getService(this.hap.Service.LockMechanism) ?? accessory.addService(this.hap.Service.LockMechanism) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.LockMechanism = this.LockMechanism as object;
      this.debugWarnLog('Displaying as Lock');

      this.LockMechanism.Service
        .setCharacteristic(this.hap.Characteristic.Name, accessory.displayName)
        .getCharacteristic(this.hap.Characteristic.LockTargetState)
        .onGet(() => {
          return this.LockMechanism!.On;
        })
        .onSet(this.OnSet.bind(this));

      // Remove other services
      this.removeFanService(accessory);
      this.removeDoorService(accessory);
      this.removeOutletService(accessory);
      this.removeSwitchService(accessory);
      this.removeFaucetService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);
    } else if (this.otherDeviceType === 'faucet') {
      // Initialize Faucet Service
      accessory.context.Faucet = accessory.context.Faucet ?? {};
      this.Faucet = {
        Name: accessory.context.Faucet.Name ?? `${accessory.displayName} Faucet`,
        Service: accessory.getService(this.hap.Service.Faucet) ?? accessory.addService(this.hap.Service.Faucet) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.Faucet = this.Faucet as object;
      this.debugWarnLog('Displaying as Faucet');

      this.Faucet.Service
        .setCharacteristic(this.hap.Characteristic.Name, accessory.displayName)
        .getCharacteristic(this.hap.Characteristic.Active)
        .onGet(() => {
          return this.Faucet!.On;
        })
        .onSet(this.OnSet.bind(this));

      // Remove other services
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeOutletService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);
    } else if (this.otherDeviceType === 'fan') {
      // Initialize Fan Service
      accessory.context.Fan = accessory.context.Fan ?? {};
      this.Fan = {
        Name: accessory.context.Fan.Name ?? `${accessory.displayName} Fan`,
        Service: accessory.getService(this.hap.Service.Fanv2) ?? accessory.addService(this.hap.Service.Fanv2) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.Fan = this.Fan as object;
      this.debugWarnLog('Displaying as Fan');

      this.Fan.Service
        .setCharacteristic(this.hap.Characteristic.Name, accessory.displayName)
        .getCharacteristic(this.hap.Characteristic.On)
        .onGet(() => {
          return this.Fan!.On;
        })
        .onSet(this.OnSet.bind(this));

      // Remove other services
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeFaucetService(accessory);
      this.removeOutletService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);
    } else if (this.otherDeviceType === 'stateful') {
      // Initialize StatefulProgrammableSwitch Service
      accessory.context.StatefulProgrammableSwitch = accessory.context.StatefulProgrammableSwitch ?? {};
      this.StatefulProgrammableSwitch = {
        Name: accessory.context.StatefulProgrammableSwitch.Name ?? `${accessory.displayName} Stateful Programmable Switch`,
        Service: accessory.getService(this.hap.Service.StatefulProgrammableSwitch)
        ?? accessory.addService(this.hap.Service.StatefulProgrammableSwitch) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.StatefulProgrammableSwitch = this.StatefulProgrammableSwitch as object;
      this.debugWarnLog('Displaying as Stateful Programmable Switch');

      this.StatefulProgrammableSwitch.Service
        .setCharacteristic(this.hap.Characteristic.Name, accessory.displayName)
        .getCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState)
        .onGet(() => {
          return this.StatefulProgrammableSwitch!.On;
        })
        .onSet(this.OnSet.bind(this));

      // Remove other services
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeFaucetService(accessory);
      this.removeOutletService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
    } else {
      // Initialize Outlet Service
      accessory.context.Outlet = accessory.context.Outlet ?? {};
      this.Outlet = {
        Name: accessory.context.Outlet.Name ?? `${accessory.displayName} Outlet`,
        Service: accessory.getService(this.hap.Service.Outlet) ?? accessory.addService(this.hap.Service.Outlet) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.Outlet = this.Outlet as object;
      this.debugWarnLog('Displaying as Outlet');

      this.Outlet.Service
        .setCharacteristic(this.hap.Characteristic.Name, accessory.displayName)
        .getCharacteristic(this.hap.Characteristic.On)
        .onGet(() => {
          return this.Outlet!.On;
        })
        .onSet(this.OnSet.bind(this));

      // Remove other services
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeFaucetService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);
    }
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    let On: boolean;
    if (this.otherDeviceType === 'garagedoor') {
      this.infoLog(`Set TargetDoorState: ${value}`);
      if (value === this.hap.Characteristic.TargetDoorState.CLOSED) {
        this.GarageDoor!.On = false;
      } else {
        this.GarageDoor!.On = true;
      }
      On = this.GarageDoor!.On;
    } else if (this.otherDeviceType === 'door') {
      this.infoLog(`Set TargetPosition: ${value}`);
      if (value === 0) {
        this.Door!.On = false;
      } else {
        this.Door!.On = true;
      }
      On = this.Door!.On;
    } else if (this.otherDeviceType === 'window') {
      this.infoLog(`Set TargetPosition: ${value}`);
      if (value === 0) {
        this.Window!.On = false;
      } else {
        this.Window!.On = true;
      }
      On = this.Window!.On;
    } else if (this.otherDeviceType === 'windowcovering') {
      this.infoLog(`Set TargetPosition: ${value}`);
      if (value === 0) {
        this.WindowCovering!.On = false;
      } else {
        this.WindowCovering!.On = true;
      }
      On = this.WindowCovering!.On;
    } else if (this.otherDeviceType === 'lock') {
      this.infoLog(`Set LockTargetState: ${value}`);
      if (value === this.hap.Characteristic.LockTargetState.SECURED) {
        this.LockMechanism!.On = false;
      } else {
        this.LockMechanism!.On = true;
      }
      On = this.LockMechanism!.On;
    } else if (this.otherDeviceType === 'faucet') {
      this.infoLog(`Set Active: ${value}`);
      if (value === this.hap.Characteristic.Active.INACTIVE) {
        this.Faucet!.On = false;
      } else {
        this.Faucet!.On = true;
      }
      On = this.Faucet!.On;
    } else if (this.otherDeviceType === 'stateful') {
      this.infoLog(`Set ProgrammableSwitchOutputState: ${value}`);
      if (value === 0) {
        this.StatefulProgrammableSwitch!.On = false;
      } else {
        this.StatefulProgrammableSwitch!.On = true;
      }

      On = this.StatefulProgrammableSwitch!.On;
    } else {
      this.infoLog(`Set On: ${value}`);
      this.Outlet!.On = value;
      On = this.Outlet!.On ? true : false;
    }

    //pushChanges
    if (On === true) {
      await this.pushOnChanges(On);
    } else {
      await this.pushOffChanges(On);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	commandType     Command	          command parameter	         Description
   * Other -        "command"       "turnOff"         "default"	        =        set to OFF state
   * Other -       "command"       "turnOn"          "default"	        =        set to ON state
   * Other -       "command"       "volumeAdd"       "default"	        =        volume up
   * Other -       "command"       "volumeSub"       "default"	        =        volume down
   * Other -       "command"       "channelAdd"      "default"	        =        next channel
   * Other -       "command"       "channelSub"      "default"	        =        previous channel
   */
  async pushOnChanges(On: boolean): Promise<void> {
    await this.debugLog(`pushOnChanges On: ${On},`
      + ` disablePushOn: ${this.disablePushOn}, customize: ${this.device.customize}, customOn: ${this.device.customOn}`);
    if (this.device.customize) {
      if (On === true && !this.disablePushOn) {
        const commandType: string = await this.commandType();
        const command: string = await this.commandOn();
        const bodyChange = JSON.stringify({
          command: command,
          parameter: 'default',
          commandType: commandType,
        });
        await this.pushChanges(bodyChange);
      }
    } else {
      this.errorLog('On Command not set');
    }
  }

  async pushOffChanges(On: boolean): Promise<void> {
    await this.debugLog(`pushOffChanges On: ${On},`
      + ` disablePushOff: ${this.disablePushOff}, customize: ${this.device.customize}, customOff: ${this.device.customOff}`);
    if (this.device.customize) {
      if (On === false && !this.disablePushOff) {
        const commandType: string = await this.commandType();
        const command: string = await this.commandOff();
        const bodyChange = JSON.stringify({
          command: command,
          parameter: 'default',
          commandType: commandType,
        });
        await this.pushChanges(bodyChange);
      }
    } else {
      this.errorLog('Off Command not set.');
    }
  }

  async pushChanges(bodyChange: any): Promise<void> {
    await this.debugLog('pushChanges');
    if (this.device.connectionType === 'OpenAPI') {
      this.infoLog(`Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await this.pushChangeRequest(bodyChange);
        const deviceStatus: any = await body.json();
        await this.pushStatusCodes(statusCode, deviceStatus);
        if (await this.successfulStatusCodes(statusCode, deviceStatus)) {
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
      await this.warnLog(`Connection Type: ${this.device.connectionType}, commands will not be sent to OpenAPI`);
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    await this.debugLog('updateHomeKitCharacteristics');
    if (this.otherDeviceType === 'garagedoor') {
      if (this.GarageDoor!.On === undefined) {
        await this.debugLog(`On: ${this.GarageDoor!.On}`);
      } else {
        if (this.GarageDoor!.On) {
          this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, this.hap.Characteristic.TargetDoorState.OPEN);
          this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, this.hap.Characteristic.CurrentDoorState.OPEN);
          await this.debugLog('updateCharacteristic'
            + ` TargetDoorState: Open, CurrentDoorState: Open (${this.GarageDoor!.On})`);
        } else {
          this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, this.hap.Characteristic.TargetDoorState.CLOSED);
          this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, this.hap.Characteristic.CurrentDoorState.CLOSED);
          await this.debugLog('updateCharacteristic'
            + ` TargetDoorState: Closed, CurrentDoorState: Closed (${this.GarageDoor!.On})`);
        }
      }
      await this.debugLog(`Garage Door On: ${this.GarageDoor!.On}`);
    } else if (this.otherDeviceType === 'door') {
      if (this.Door!.On === undefined) {
        await this.debugLog(`On: ${this.Door!.On}`);
      } else {
        if (this.Door!.On) {
          this.Door!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
          this.Door!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
          this.Door!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          await this.debugLog('updateCharacteristic'
            + ` TargetPosition: 100, CurrentPosition: 100 (${this.Door!.On})`);
        } else {
          this.Door!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.Door!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.Door!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          await this.debugLog('updateCharacteristic'
            + ` TargetPosition: 0, CurrentPosition: 0 (${this.Door!.On})`);
        }
      }
      await this.debugLog(`Door On: ${this.Door!.On}`);
    } else if (this.otherDeviceType === 'window') {
      if (this.Window!.On === undefined) {
        await this.debugLog(`On: ${this.Window!.On}`);
      } else {
        if (this.Window!.On) {
          this.Window!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
          this.Window!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
          this.Window!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          await this.debugLog('updateCharacteristic'
            + ` TargetPosition: 100, CurrentPosition: 100 (${this.Window!.On})`);
        } else {
          this.Window!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.Window!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.Window!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          await this.debugLog('updateCharacteristic'
            + ` TargetPosition: 0, CurrentPosition: 0 (${this.Window!.On})`);
        }
      }
      await this.debugLog(`Window On: ${this.Window!.On}`);
    } else if (this.otherDeviceType === 'windowcovering') {
      if (this.WindowCovering!.On === undefined) {
        await this.debugLog(`On: ${this.WindowCovering!.On}`);
      } else {
        if (this.WindowCovering!.On) {
          this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
          this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
          this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          await this.debugLog('updateCharacteristic'
            + ` TargetPosition: 100, CurrentPosition: 100 (${this.WindowCovering!.On})`);
        } else {
          this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          await this.debugLog('updateCharacteristic'
            + ` TargetPosition: 0, CurrentPosition: 0 (${this.WindowCovering!.On})`);
        }
      }
      await this.debugLog(`Window Covering On: ${this.WindowCovering!.On}`);
    } else if (this.otherDeviceType === 'lock') {
      if (this.LockMechanism?.On === undefined) {
        await this.debugLog(`On: ${this.LockMechanism?.On}`);
      } else {
        if (this.LockMechanism.On) {
          this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState,
            this.hap.Characteristic.LockTargetState.UNSECURED);
          this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState,
            this.hap.Characteristic.LockCurrentState.UNSECURED);
          await this.debugLog('updateCharacteristic'
            + ` LockTargetState: UNSECURED, LockCurrentState: UNSECURE (${this.LockMechanism.On})`);
        } else {
          this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState,
            this.hap.Characteristic.LockTargetState.SECURED);
          this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState,
            this.hap.Characteristic.LockCurrentState.SECURED);
          await this.debugLog('updateCharacteristic'
            + ` LockTargetState: SECURED, LockCurrentState: SECURED (${this.LockMechanism.On})`);
        }
      }
      await this.debugLog(`Lock On: ${this.LockMechanism?.On}`);
    } else if (this.otherDeviceType === 'faucet') {
      if (this.Faucet!.On === undefined) {
        await this.debugLog(`On: ${this.Faucet!.On}`);
      } else {
        if (this.Faucet!.On) {
          this.Faucet!.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.ACTIVE);
          await this.debugLog(`updateCharacteristic Active: ${this.Faucet!.On}`);
        } else {
          this.Faucet!.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.INACTIVE);
          await this.debugLog(`updateCharacteristic Active: ${this.Faucet!.On}`);
        }
      }
      await this.debugLog(`Faucet On: ${this.Faucet!.On}`);
    } else if (this.otherDeviceType === 'fan') {
      if (this.Fan!.On === undefined) {
        await this.debugLog(`On: ${this.Fan!.On}`);
      } else {
        if (this.Fan!.On) {
          this.Fan!.Service.updateCharacteristic(this.hap.Characteristic.On, this.Fan!.On);
          await this.debugLog(`updateCharacteristic On: ${this.Fan!.On}`);
        } else {
          this.Fan!.Service.updateCharacteristic(this.hap.Characteristic.On, this.Fan!.On);
          await this.debugLog(`updateCharacteristic On: ${this.Fan!.On}`);
        }
      }
      await this.debugLog(`Fan On: ${this.Fan!.On}`);
    } else if (this.otherDeviceType === 'stateful') {
      if (this.StatefulProgrammableSwitch!.On === undefined) {
        await this.debugLog(`On: ${this.StatefulProgrammableSwitch!.On}`);
      } else {
        if (this.StatefulProgrammableSwitch!.On) {
          this.StatefulProgrammableSwitch!.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent,
            this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
          this.StatefulProgrammableSwitch!.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, 1);
          await this.debugLog('updateCharacteristic'
            + ` ProgrammableSwitchEvent: SINGLE, ProgrammableSwitchOutputState: 1 (${this.StatefulProgrammableSwitch!.On})`);
        } else {
          this.StatefulProgrammableSwitch!.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent,
            this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
          this.StatefulProgrammableSwitch!.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, 0);
          await this.debugLog('updateCharacteristic'
            + ` ProgrammableSwitchEvent: SINGLE, ProgrammableSwitchOutputState: 0 (${this.StatefulProgrammableSwitch!.On})`);
        }
      }
      await this.debugLog(`StatefulProgrammableSwitch On: ${this.StatefulProgrammableSwitch!.On}`);
    } else if (this.otherDeviceType === 'switch') {
      if (this.Switch!.On === undefined) {
        await this.debugLog(`On: ${this.Switch!.On}`);
      } else {
        this.Switch!.Service.updateCharacteristic(this.hap.Characteristic.On, this.Switch!.On);
        await this.debugLog(`updateCharacteristic On: ${this.Switch!.On}`);
      }
    } else {
      if (this.Outlet!.On === undefined) {
        await this.debugLog(`On: ${this.Outlet!.On}`);
      } else {
        this.Outlet!.Service.updateCharacteristic(this.hap.Characteristic.On, this.Outlet!.On);
        await this.debugLog(`updateCharacteristic On: ${this.Outlet!.On}`);
      }
    }
  }

  async apiError(e: any): Promise<void> {
    if (this.otherDeviceType === 'garagedoor') {
      if (this.GarageDoor) {
        this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, e);
        this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, e);
        this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.ObstructionDetected, e);
      }
    } else if (this.otherDeviceType === 'door') {
      if (this.Door) {
        this.Door.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
        this.Door.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
        this.Door.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e);
      }
    } else if (this.otherDeviceType === 'window') {
      if (this.Window) {
        this.Window.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
        this.Window.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
        this.Window.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e);
      }
    } else if (this.otherDeviceType === 'windowcovering') {
      if (this.WindowCovering) {
        this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
        this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
        this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e);
      }
    } else if (this.otherDeviceType === 'lock') {
      if (this.LockMechanism) {
        this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState, e);
        this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState, e);
      }
    } else if (this.otherDeviceType === 'faucet') {
      if (this.Faucet) {
        this.Faucet.Service.updateCharacteristic(this.hap.Characteristic.Active, e);
      }
    } else if (this.otherDeviceType === 'fan') {
      if (this.Fan) {
        this.Fan.Service.updateCharacteristic(this.hap.Characteristic.On, e);
      }
    } else if (this.otherDeviceType === 'stateful') {
      if (this.StatefulProgrammableSwitch) {
        this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent, e);
        this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, e);
      }
    } else if (this.otherDeviceType === 'switch') {
      if (this.Switch) {
        this.Switch.Service.updateCharacteristic(this.hap.Characteristic.On, e);
      }
    } else {
      if (this.Outlet) {
        this.Outlet.Service.updateCharacteristic(this.hap.Characteristic.On, e);
      }
    }
  }

  async removeOutletService(accessory: PlatformAccessory): Promise<void> {
    // If Outlet.Service still present, then remove first
    if (this.Outlet?.Service) {
      this.Outlet.Service = this.accessory.getService(this.hap.Service.Outlet) as Service;
      this.warnLog('Removing Leftover Outlet Service');
      accessory.removeService(this.Outlet.Service);
    }
  }

  async removeGarageDoorService(accessory: PlatformAccessory): Promise<void> {
    // If GarageDoor.Service still present, then remove first
    if (this.GarageDoor?.Service) {
      this.GarageDoor.Service = this.accessory.getService(this.hap.Service.GarageDoorOpener) as Service;
      this.warnLog('Removing Leftover Garage Door Service');
      accessory.removeService(this.GarageDoor.Service);
    }
  }

  async removeDoorService(accessory: PlatformAccessory): Promise<void> {
    // If Door.Service still present, then remove first
    if (this.Door?.Service) {
      this.Door.Service = this.accessory.getService(this.hap.Service.Door) as Service;
      this.warnLog('Removing Leftover Door Service');
      accessory.removeService(this.Door.Service);
    }
  }

  async removeLockService(accessory: PlatformAccessory): Promise<void> {
    // If Lock.Service still present, then remove first
    if (this.LockMechanism?.Service) {
      this.LockMechanism.Service = this.accessory.getService(this.hap.Service.LockMechanism) as Service;
      this.warnLog('Removing Leftover Lock Service');
      accessory.removeService(this.LockMechanism.Service);
    }
  }

  async removeFaucetService(accessory: PlatformAccessory): Promise<void> {
    // If Faucet.Service still present, then remove first
    if (this.Faucet?.Service) {
      this.Faucet.Service = this.accessory.getService(this.hap.Service.Faucet) as Service;
      this.warnLog('Removing Leftover Faucet Service');
      accessory.removeService(this.Faucet.Service);
    }
  }

  async removeFanService(accessory: PlatformAccessory): Promise<void> {
    // If Fan Service still present, then remove first
    if (this.Fan?.Service) {
      this.Fan.Service = this.accessory.getService(this.hap.Service.Fan) as Service;
      this.warnLog('Removing Leftover Fan Service');
      accessory.removeService(this.Fan.Service);
    }
  }

  async removeWindowService(accessory: PlatformAccessory): Promise<void> {
    // If Window.Service still present, then remove first
    if (this.Window?.Service) {
      this.Window.Service = this.accessory.getService(this.hap.Service.Window) as Service;
      this.warnLog('Removing Leftover Window Service');
      accessory.removeService(this.Window.Service);
    }
  }

  async removeWindowCoveringService(accessory: PlatformAccessory): Promise<void> {
    // If WindowCovering.Service still present, then remove first
    if (this.WindowCovering?.Service) {
      this.WindowCovering.Service = this.accessory.getService(this.hap.Service.WindowCovering) as Service;
      this.warnLog('Removing Leftover Window Covering Service');
      accessory.removeService(this.WindowCovering.Service);
    }
  }

  async removeStatefulProgrammableSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If StatefulProgrammableSwitch.Service still present, then remove first
    if (this.StatefulProgrammableSwitch?.Service) {
      this.StatefulProgrammableSwitch.Service = this.accessory.getService(this.hap.Service.StatefulProgrammableSwitch) as Service;
      this.warnLog('Removing Leftover Stateful Programmable Switch Service');
      accessory.removeService(this.StatefulProgrammableSwitch.Service);
    }
  }

  async removeSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If Switch.Service still present, then remove first
    if (this.Switch?.Service) {
      this.Switch.Service = this.accessory.getService(this.hap.Service.Switch) as Service;
      this.warnLog('Removing Leftover Switch Service');
      accessory.removeService(this.Switch.Service);
    }
  }

  async getOtherConfigSettings(device: irdevice & irDevicesConfig): Promise<void> {
    if (!device.other?.deviceType && this.accessory.context.deviceType) {
      this.otherDeviceType = this.accessory.context.deviceType;
      await this.debugWarnLog(`Using Device Type: ${this.otherDeviceType}, from Accessory Cache.`);
    } else if (device.other?.deviceType) {
      this.accessory.context.deviceType = device.other.deviceType;
      await this.debugWarnLog(`Accessory Cache: ${this.accessory.context.deviceType}`);
      this.otherDeviceType = this.accessory.context.deviceType;
      await this.debugWarnLog(`Using Device Type: ${this.otherDeviceType}`);
    } else {
      this.otherDeviceType = 'outlet';
      this.warnLog(`no deviceType set, using default deviceType: ${this.otherDeviceType}`);
    }
  }
}
