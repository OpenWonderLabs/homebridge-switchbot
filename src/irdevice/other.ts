import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { request } from 'undici';
import { SwitchBotPlatform } from '../platform';
import { Devices, irDevicesConfig, irdevice } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Others {
  // Services
  fanService?: Service;
  doorService?: Service;
  lockService?: Service;
  faucetService?: Service;
  windowService?: Service;
  switchService?: Service;
  outletService?: Service;
  garageDoorService?: Service;
  windowCoveringService?: Service;
  statefulProgrammableSwitchService?: Service;

  // Characteristic Values
  On?: CharacteristicValue;
  FirmwareRevision!: CharacteristicValue;

  // Config
  deviceLogging!: string;
  disablePushOn?: boolean;
  otherDeviceType?: string;
  disablePushOff?: boolean;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: irdevice & irDevicesConfig,
  ) {
    // default placeholders
    this.logs(device);
    this.deviceType(device);
    this.context();
    this.disablePushOnChanges(device);
    this.disablePushOffChanges(device);
    this.config(device);

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, device.remoteType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.setFirmwareRevision(accessory, device))
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
      .updateValue(this.setFirmwareRevision(accessory, device));

    // deviceType
    if (this.otherDeviceType === 'switch') {
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeFaucetService(accessory);
      this.removeOutletService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);

      // Add switchService
      (this.switchService = accessory.getService(this.platform.Service.Switch) || accessory.addService(this.platform.Service.Switch)),
      `${accessory.displayName} Switch`;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Switch`);

      this.switchService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
      if (!this.switchService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
        this.switchService.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.switchService.getCharacteristic(this.platform.Characteristic.On).onSet(this.OnSet.bind(this));
    } else if (this.otherDeviceType === 'garagedoor') {
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeFaucetService(accessory);
      this.removeOutletService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);

      // Add switchService
      (this.garageDoorService =
    accessory.getService(this.platform.Service.GarageDoorOpener) || accessory.addService(this.platform.Service.GarageDoorOpener)),
      `${accessory.displayName} Garage Door Opener`;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Garage Door Opener`);

      this.garageDoorService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
      if (!this.garageDoorService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
        this.garageDoorService.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.garageDoorService.getCharacteristic(this.platform.Characteristic.TargetDoorState).onSet(this.OnSet.bind(this));
      this.garageDoorService.setCharacteristic(this.platform.Characteristic.ObstructionDetected, false);
    } else if (this.otherDeviceType === 'door') {
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeOutletService(accessory);
      this.removeFaucetService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);

      // Add switchService
      (this.doorService = accessory.getService(this.platform.Service.Door) || accessory.addService(this.platform.Service.Door)),
      `${accessory.displayName} Door`;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Door`);

      this.doorService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
      if (!this.doorService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
        this.doorService.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.doorService
        .getCharacteristic(this.platform.Characteristic.TargetPosition)
        .setProps({
          validValues: [0, 100],
          minValue: 0,
          maxValue: 100,
          minStep: 100,
        })
        .onSet(this.OnSet.bind(this));
      this.doorService.setCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.STOPPED);
    } else if (this.otherDeviceType === 'window') {
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeOutletService(accessory);
      this.removeFaucetService(accessory);
      this.removeSwitchService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);

      // Add switchService
      (this.windowService = accessory.getService(this.platform.Service.Window) || accessory.addService(this.platform.Service.Window)),
      `${accessory.displayName} Window`;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Window`);

      this.windowService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
      if (!this.windowService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
        this.windowService.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.windowService
        .getCharacteristic(this.platform.Characteristic.TargetPosition)
        .setProps({
          validValues: [0, 100],
          minValue: 0,
          maxValue: 100,
          minStep: 100,
        })
        .onSet(this.OnSet.bind(this));
      this.windowService.setCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.STOPPED);
    } else if (this.otherDeviceType === 'windowcovering') {
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeOutletService(accessory);
      this.removeFaucetService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);

      // Add switchService
      (this.windowCoveringService =
    accessory.getService(this.platform.Service.WindowCovering) || accessory.addService(this.platform.Service.WindowCovering)),
      `${accessory.displayName} Window Covering`;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Window Covering`);

      this.windowCoveringService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
      if (!this.windowCoveringService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
        this.windowCoveringService.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.windowCoveringService
        .getCharacteristic(this.platform.Characteristic.TargetPosition)
        .setProps({
          validValues: [0, 100],
          minValue: 0,
          maxValue: 100,
          minStep: 100,
        })
        .onSet(this.OnSet.bind(this));
      this.windowCoveringService.setCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.STOPPED);
    } else if (this.otherDeviceType === 'lock') {
      this.removeFanService(accessory);
      this.removeDoorService(accessory);
      this.removeOutletService(accessory);
      this.removeSwitchService(accessory);
      this.removeFaucetService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);

      // Add switchService
      (this.lockService = accessory.getService(this.platform.Service.LockMechanism) || accessory.addService(this.platform.Service.LockMechanism)),
      `${accessory.displayName} Lock`;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Lock`);

      this.lockService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
      if (!this.lockService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
        this.lockService.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.lockService.getCharacteristic(this.platform.Characteristic.LockTargetState).onSet(this.OnSet.bind(this));
    } else if (this.otherDeviceType === 'faucet') {
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeOutletService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);

      // Add switchService
      (this.faucetService = accessory.getService(this.platform.Service.Faucet) || accessory.addService(this.platform.Service.Faucet)),
      `${accessory.displayName} Faucet`;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Faucet`);

      this.faucetService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
      if (!this.faucetService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
        this.faucetService.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.faucetService.getCharacteristic(this.platform.Characteristic.Active).onSet(this.OnSet.bind(this));
    } else if (this.otherDeviceType === 'fan') {
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeFaucetService(accessory);
      this.removeOutletService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);

      // Add switchService
      (this.fanService = accessory.getService(this.platform.Service.Fan) || accessory.addService(this.platform.Service.Fan)),
      `${accessory.displayName} Fan`;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Fan`);

      this.fanService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
      if (!this.fanService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
        this.fanService.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.fanService.getCharacteristic(this.platform.Characteristic.On).onSet(this.OnSet.bind(this));
    } else if (this.otherDeviceType === 'stateful') {
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeFaucetService(accessory);
      this.removeOutletService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);

      // Add switchService
      (this.statefulProgrammableSwitchService =
    accessory.getService(this.platform.Service.StatefulProgrammableSwitch) ||
    accessory.addService(this.platform.Service.StatefulProgrammableSwitch)),
      `${accessory.displayName} Stateful Programmable Switch`;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Stateful Programmable Switch`);

      this.statefulProgrammableSwitchService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
      if (!this.statefulProgrammableSwitchService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
        this.statefulProgrammableSwitchService.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.statefulProgrammableSwitchService
        .getCharacteristic(this.platform.Characteristic.ProgrammableSwitchOutputState)
        .onSet(this.OnSet.bind(this));
    } else {
      this.removeFanService(accessory);
      this.removeLockService(accessory);
      this.removeDoorService(accessory);
      this.removeFaucetService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeGarageDoorService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);

      // Add outletService
      (this.outletService = accessory.getService(this.platform.Service.Outlet) || accessory.addService(this.platform.Service.Outlet)),
      `${accessory.displayName} Outlet`;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Outlet`);

      this.outletService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
      if (!this.outletService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
        this.outletService.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.outletService.getCharacteristic(this.platform.Characteristic.On).onSet(this.OnSet.bind(this));
    }
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    if (this.otherDeviceType === 'garagedoor') {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Set TargetDoorState: ${value}`);
      if (value === this.platform.Characteristic.TargetDoorState.CLOSED) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else if (
      this.otherDeviceType === 'door' ||
      this.otherDeviceType === 'window' ||
      this.otherDeviceType === 'windowcovering'
    ) {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Set TargetPosition: ${value}`);
      if (value === 0) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else if (this.otherDeviceType === 'lock') {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Set LockTargetState: ${value}`);
      if (value === this.platform.Characteristic.LockTargetState.SECURED) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else if (this.otherDeviceType === 'faucet') {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Active: ${value}`);
      if (value === this.platform.Characteristic.Active.INACTIVE) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else if (this.otherDeviceType === 'stateful') {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Set ProgrammableSwitchOutputState: ${value}`);
      if (value === 0) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Set On: ${value}`);
      this.On = value;
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
  async pushOnChanges(): Promise<void> {
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} pushOnChanges On: ${this.On},` +
      ` disablePushOn: ${this.disablePushOn}, customize: ${this.device.customize}, customOn: ${this.device.customOn}`,
    );
    if (this.device.customize) {
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
    } else {
      this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} On Command not set`);
    }
  }

  async pushOffChanges(): Promise<void> {
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} pushOffChanges On: ${this.On},` +
      ` disablePushOff: ${this.disablePushOff}, customize: ${this.device.customize}, customOff: ${this.device.customOff}`,
    );
    if (this.device.customize) {
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
    } else {
      this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Off Command not set.`);
    }
  }

  async pushChanges(bodyChange: any): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushChanges`);
    if (this.device.connectionType === 'OpenAPI') {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode, headers } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} body: ${JSON.stringify(body)}`);
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} headers: ${JSON.stringify(headers)}`);
        const deviceStatus: any = await body.json();
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} deviceStatus body: ${JSON.stringify(deviceStatus.body)}`);
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          this.debugErrorLog(`${this.device.remoteType}: ${this.accessory.displayName} `
            + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
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
    if (this.otherDeviceType === 'garagedoor') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.garageDoorService?.updateCharacteristic(
            this.platform.Characteristic.TargetDoorState,
            this.platform.Characteristic.TargetDoorState.OPEN,
          );
          this.garageDoorService?.updateCharacteristic(
            this.platform.Characteristic.CurrentDoorState,
            this.platform.Characteristic.CurrentDoorState.OPEN,
          );
          this.debugLog(
            `${this.device.remoteType}: ` + `${this.accessory.displayName} updateCharacteristic TargetDoorState: Open, CurrentDoorState: Open`,
          );
        } else {
          this.garageDoorService?.updateCharacteristic(
            this.platform.Characteristic.TargetDoorState,
            this.platform.Characteristic.TargetDoorState.CLOSED,
          );
          this.garageDoorService?.updateCharacteristic(
            this.platform.Characteristic.CurrentDoorState,
            this.platform.Characteristic.CurrentDoorState.CLOSED,
          );
          this.debugLog(
            `${this.device.remoteType}: ` + `${this.accessory.displayName} updateCharacteristic TargetDoorState: Open, CurrentDoorState: Open`,
          );
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Garage Door On: ${this.On}`);
    } else if (this.otherDeviceType === 'door') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.doorService?.updateCharacteristic(this.platform.Characteristic.TargetPosition, 100);
          this.doorService?.updateCharacteristic(this.platform.Characteristic.CurrentPosition, 100);
          this.doorService?.updateCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 100, CurrentPosition: 100`);
        } else {
          this.doorService?.updateCharacteristic(this.platform.Characteristic.TargetPosition, 0);
          this.doorService?.updateCharacteristic(this.platform.Characteristic.CurrentPosition, 0);
          this.doorService?.updateCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 0, CurrentPosition: 0`);
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Door On: ${this.On}`);
    } else if (this.otherDeviceType === 'window') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.windowService?.updateCharacteristic(this.platform.Characteristic.TargetPosition, 100);
          this.windowService?.updateCharacteristic(this.platform.Characteristic.CurrentPosition, 100);
          this.windowService?.updateCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 100, CurrentPosition: 100`);
        } else {
          this.windowService?.updateCharacteristic(this.platform.Characteristic.TargetPosition, 0);
          this.windowService?.updateCharacteristic(this.platform.Characteristic.CurrentPosition, 0);
          this.windowService?.updateCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 0, CurrentPosition: 0`);
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Window On: ${this.On}`);
    } else if (this.otherDeviceType === 'windowcovering') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.windowCoveringService?.updateCharacteristic(this.platform.Characteristic.TargetPosition, 100);
          this.windowCoveringService?.updateCharacteristic(this.platform.Characteristic.CurrentPosition, 100);
          this.windowCoveringService?.updateCharacteristic(
            this.platform.Characteristic.PositionState,
            this.platform.Characteristic.PositionState.STOPPED,
          );
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 100, CurrentPosition: 100`);
        } else {
          this.windowCoveringService?.updateCharacteristic(this.platform.Characteristic.TargetPosition, 0);
          this.windowCoveringService?.updateCharacteristic(this.platform.Characteristic.CurrentPosition, 0);
          this.windowCoveringService?.updateCharacteristic(
            this.platform.Characteristic.PositionState,
            this.platform.Characteristic.PositionState.STOPPED,
          );
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 0, CurrentPosition: 0`);
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Window Covering On: ${this.On}`);
    } else if (this.otherDeviceType === 'lock') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.lockService?.updateCharacteristic(
            this.platform.Characteristic.LockTargetState,
            this.platform.Characteristic.LockTargetState.UNSECURED,
          );
          this.lockService?.updateCharacteristic(
            this.platform.Characteristic.LockCurrentState,
            this.platform.Characteristic.LockCurrentState.UNSECURED,
          );
          this.debugLog(
            `${this.device.remoteType}: ` +
            `${this.accessory.displayName} updateCharacteristic LockTargetState: UNSECURED, LockCurrentState: UNSECURED`,
          );
        } else {
          this.lockService?.updateCharacteristic(this.platform.Characteristic.LockTargetState, this.platform.Characteristic.LockTargetState.SECURED);
          this.lockService?.updateCharacteristic(
            this.platform.Characteristic.LockCurrentState,
            this.platform.Characteristic.LockCurrentState.SECURED,
          );
          this.debugLog(
            `${this.device.remoteType}: ` + `${this.accessory.displayName} updateCharacteristic LockTargetState: SECURED, LockCurrentState: SECURED`,
          );
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Lock On: ${this.On}`);
    } else if (this.otherDeviceType === 'faucet') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.faucetService?.updateCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.On}`);
        } else {
          this.faucetService?.updateCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.INACTIVE);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.On}`);
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Faucet On: ${this.On}`);
    } else if (this.otherDeviceType === 'fan') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.fanService?.updateCharacteristic(this.platform.Characteristic.On, this.On);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
        } else {
          this.fanService?.updateCharacteristic(this.platform.Characteristic.On, this.On);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Fan On: ${this.On}`);
    } else if (this.otherDeviceType === 'stateful') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.statefulProgrammableSwitchService?.updateCharacteristic(
            this.platform.Characteristic.ProgrammableSwitchEvent,
            this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
          );
          this.statefulProgrammableSwitchService?.updateCharacteristic(this.platform.Characteristic.ProgrammableSwitchOutputState, 1);
          this.debugLog(
            `${this.device.remoteType}: ` +
            `${this.accessory.displayName} updateCharacteristic ProgrammableSwitchEvent: SINGLE, ProgrammableSwitchOutputState: 1`,
          );
        } else {
          this.statefulProgrammableSwitchService?.updateCharacteristic(
            this.platform.Characteristic.ProgrammableSwitchEvent,
            this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
          );
          this.statefulProgrammableSwitchService?.updateCharacteristic(this.platform.Characteristic.ProgrammableSwitchOutputState, 0);
          this.debugLog(
            `${this.device.remoteType}: ` +
            `${this.accessory.displayName} updateCharacteristic ProgrammableSwitchEvent: SINGLE, ProgrammableSwitchOutputState: 0`,
          );
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} StatefulProgrammableSwitch On: ${this.On}`);
    } else if (this.otherDeviceType === 'switch') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        this.switchService?.updateCharacteristic(this.platform.Characteristic.On, this.On);
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
      }
    } else {
      if (this.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        this.outletService?.updateCharacteristic(this.platform.Characteristic.On, this.On);
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
      }
    }
    // FirmwareRevision
    if (this.FirmwareRevision === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} FirmwareRevision: ${this.FirmwareRevision}`);
    } else {
      this.accessory.context.FirmwareRevision = this.FirmwareRevision;
      this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .updateCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} `
        + `updateCharacteristic FirmwareRevision: ${this.FirmwareRevision}`);
    }
  }

  async disablePushOnChanges(device: irdevice & irDevicesConfig): Promise<void> {
    if (device.disablePushOn === undefined) {
      this.disablePushOn = false;
    } else {
      this.disablePushOn = device.disablePushOn;
    }
  }

  async disablePushOffChanges(device: irdevice & irDevicesConfig): Promise<void> {
    if (device.disablePushOff === undefined) {
      this.disablePushOff = false;
    } else {
      this.disablePushOff = device.disablePushOff;
    }
  }

  async commandType(): Promise<string> {
    let commandType: string;
    if (this.device.customize) {
      commandType = 'customize';
    } else {
      commandType = 'command';
    }
    return commandType;
  }

  async commandOn(): Promise<string> {
    let command: string;
    if (this.device.customize && this.device.customOn) {
      command = this.device.customOn;
    } else {
      command = 'turnOn';
    }
    return command;
  }

  async commandOff(): Promise<string> {
    let command: string;
    if (this.device.customize && this.device.customOff) {
      command = this.device.customOff;
    } else {
      command = 'turnOff';
    }
    return command;
  }

  async statusCode(statusCode: number): Promise<void> {
    switch (statusCode) {
      case 151:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Command not supported by this deviceType, statusCode: ${statusCode}`);
        break;
      case 152:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Device not found, statusCode: ${statusCode}`);
        break;
      case 160:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Command is not supported, statusCode: ${statusCode}`);
        break;
      case 161:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Device is offline, statusCode: ${statusCode}`);
        break;
      case 171:
        this.errorLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Hub Device is offline, statusCode: ${statusCode}. ` +
          `Hub: ${this.device.hubDeviceId}`,
        );
        break;
      case 190:
        this.errorLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
          ` Or command format is invalid, statusCode: ${statusCode}`,
        );
        break;
      case 100:
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Command successfully sent, statusCode: ${statusCode}`);
        break;
      case 200:
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Request successful, statusCode: ${statusCode}`);
        break;
      default:
        this.infoLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Unknown statusCode: ` +
          `${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`,
        );
    }
  }

  async apiError(e: any): Promise<void> {
    if (this.otherDeviceType === 'garagedoor') {
      this.garageDoorService?.updateCharacteristic(this.platform.Characteristic.TargetDoorState, e);
      this.garageDoorService?.updateCharacteristic(this.platform.Characteristic.CurrentDoorState, e);
      this.garageDoorService?.updateCharacteristic(this.platform.Characteristic.ObstructionDetected, e);
    } else if (this.otherDeviceType === 'door') {
      this.doorService?.updateCharacteristic(this.platform.Characteristic.TargetPosition, e);
      this.doorService?.updateCharacteristic(this.platform.Characteristic.CurrentPosition, e);
      this.doorService?.updateCharacteristic(this.platform.Characteristic.PositionState, e);
    } else if (this.otherDeviceType === 'window') {
      this.windowService?.updateCharacteristic(this.platform.Characteristic.TargetPosition, e);
      this.windowService?.updateCharacteristic(this.platform.Characteristic.CurrentPosition, e);
      this.windowService?.updateCharacteristic(this.platform.Characteristic.PositionState, e);
    } else if (this.otherDeviceType === 'windowcovering') {
      this.windowCoveringService?.updateCharacteristic(this.platform.Characteristic.TargetPosition, e);
      this.windowCoveringService?.updateCharacteristic(this.platform.Characteristic.CurrentPosition, e);
      this.windowCoveringService?.updateCharacteristic(this.platform.Characteristic.PositionState, e);
    } else if (this.otherDeviceType === 'lock') {
      this.doorService?.updateCharacteristic(this.platform.Characteristic.LockTargetState, e);
      this.doorService?.updateCharacteristic(this.platform.Characteristic.LockCurrentState, e);
    } else if (this.otherDeviceType === 'faucet') {
      this.faucetService?.updateCharacteristic(this.platform.Characteristic.Active, e);
    } else if (this.otherDeviceType === 'fan') {
      this.fanService?.updateCharacteristic(this.platform.Characteristic.On, e);
    } else if (this.otherDeviceType === 'stateful') {
      this.statefulProgrammableSwitchService?.updateCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent, e);
      this.statefulProgrammableSwitchService?.updateCharacteristic(this.platform.Characteristic.ProgrammableSwitchOutputState, e);
    } else if (this.otherDeviceType === 'switch') {
      this.switchService?.updateCharacteristic(this.platform.Characteristic.On, e);
    } else {
      this.outletService?.updateCharacteristic(this.platform.Characteristic.On, e);
    }
  }

  async removeOutletService(accessory: PlatformAccessory): Promise<void> {
    // If outletService still pressent, then remove first
    this.outletService = this.accessory.getService(this.platform.Service.Outlet);
    if (this.outletService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Outlet Service`);
    }
    accessory.removeService(this.outletService!);
  }

  async removeGarageDoorService(accessory: PlatformAccessory): Promise<void> {
    // If garageDoorService still pressent, then remove first
    this.garageDoorService = this.accessory.getService(this.platform.Service.GarageDoorOpener);
    if (this.garageDoorService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Garage Door Service`);
    }
    accessory.removeService(this.garageDoorService!);
  }

  async removeDoorService(accessory: PlatformAccessory): Promise<void> {
    // If doorService still pressent, then remove first
    this.doorService = this.accessory.getService(this.platform.Service.Door);
    if (this.doorService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Door Service`);
    }
    accessory.removeService(this.doorService!);
  }

  async removeLockService(accessory: PlatformAccessory): Promise<void> {
    // If lockService still pressent, then remove first
    this.lockService = this.accessory.getService(this.platform.Service.LockMechanism);
    if (this.lockService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Lock Service`);
    }
    accessory.removeService(this.lockService!);
  }

  async removeFaucetService(accessory: PlatformAccessory): Promise<void> {
    // If faucetService still pressent, then remove first
    this.faucetService = this.accessory.getService(this.platform.Service.Faucet);
    if (this.faucetService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Faucet Service`);
    }
    accessory.removeService(this.faucetService!);
  }

  async removeFanService(accessory: PlatformAccessory): Promise<void> {
    // If fanService still pressent, then remove first
    this.fanService = this.accessory.getService(this.platform.Service.Fan);
    if (this.fanService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Fan Service`);
    }
    accessory.removeService(this.fanService!);
  }

  async removeWindowService(accessory: PlatformAccessory): Promise<void> {
    // If windowService still pressent, then remove first
    this.windowService = this.accessory.getService(this.platform.Service.Window);
    if (this.windowService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Window Service`);
    }
    accessory.removeService(this.windowService!);
  }

  async removeWindowCoveringService(accessory: PlatformAccessory): Promise<void> {
    // If windowCoveringService still pressent, then remove first
    this.windowCoveringService = this.accessory.getService(this.platform.Service.WindowCovering);
    if (this.windowCoveringService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Window Covering Service`);
    }
    accessory.removeService(this.windowCoveringService!);
  }

  async removeStatefulProgrammableSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If statefulProgrammableSwitchService still pressent, then remove first
    this.statefulProgrammableSwitchService = this.accessory.getService(this.platform.Service.StatefulProgrammableSwitch);
    if (this.statefulProgrammableSwitchService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Stateful Programmable Switch Service`);
    }
    accessory.removeService(this.statefulProgrammableSwitchService!);
  }

  async removeSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If switchService still pressent, then remove first
    this.switchService = this.accessory.getService(this.platform.Service.Switch);
    if (this.switchService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Switch Service`);
    }
    accessory.removeService(this.switchService!);
  }

  async deviceType(device: irdevice & irDevicesConfig): Promise<void> {
    if (device.other?.deviceType) {
      this.otherDeviceType = this.accessory.context.deviceType = device.other.deviceType;
      if (this.deviceLogging.includes('debug') || this.deviceLogging === 'standard') {
        this.warnLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Device Type: ${this.otherDeviceType}`);
      }
    } else {
      this.otherDeviceType = 'outlet';
      this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} No Device Type Set, deviceType: ${this.device.other?.deviceType}`);
      this.warnLog(`${this.device.remoteType}: ${this.accessory.displayName} Using default deviceType: ${this.otherDeviceType}`);
    }
  }

  setFirmwareRevision(accessory: PlatformAccessory, device: irdevice & irDevicesConfig): string {
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName}` + ` accessory.context.FirmwareRevision: ${accessory.context.FirmwareRevision}`,
    );
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} device.firmware: ${device.firmware}`);
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} this.platform.version: ${this.platform.version}`);
    if (accessory.context.FirmwareRevision) {
      this.FirmwareRevision = accessory.context.FirmwareRevision;
    } else if (device.firmware) {
      this.FirmwareRevision = device.firmware;
    } else {
      this.FirmwareRevision = this.platform.version!;
    }
    this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} setFirmwareRevision: ${this.FirmwareRevision}`);
    return JSON.stringify(this.FirmwareRevision);
  }

  async context() {
    if (this.On === undefined) {
      this.On = true;
    } else {
      this.On = this.accessory.context.On;
    }
  }

  async config(device: irdevice & irDevicesConfig): Promise<void> {
    let config = {};
    if (device.other) {
      config = device.other;
    }
    if (device.logging !== undefined) {
      config['logging'] = device.logging;
    }
    if (device.connectionType !== undefined) {
      config['connectionType'] = device.connectionType;
    }
    if (device.external !== undefined) {
      config['external'] = device.external;
    }
    if (device.customOn !== undefined) {
      config['customOn'] = device.customOn;
    }
    if (device.customOff !== undefined) {
      config['customOff'] = device.customOff;
    }
    if (device.customize !== undefined) {
      config['customize'] = device.customize;
    }
    if (device.disablePushOn !== undefined) {
      config['disablePushOn'] = device.disablePushOn;
    }
    if (device.disablePushOff !== undefined) {
      config['disablePushOff'] = device.disablePushOff;
    }
    if (Object.entries(config).length !== 0) {
      this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  async logs(device: irdevice & irDevicesConfig): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
    }
  }

  /**
   * Logging for Device
   */
  infoLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.info(String(...log));
    }
  }

  warnLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.warn(String(...log));
    }
  }

  debugWarnLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging?.includes('debug')) {
        this.platform.log.warn('[DEBUG]', String(...log));
      }
    }
  }

  errorLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.error(String(...log));
    }
  }

  debugErrorLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging?.includes('debug')) {
        this.platform.log.error('[DEBUG]', String(...log));
      }
    }
  }

  debugLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging === 'debug') {
        this.platform.log.info('[DEBUG]', String(...log));
      } else {
        this.platform.log.debug(String(...log));
      }
    }
  }

  enablingDeviceLogging(): boolean {
    return this.deviceLogging.includes('debug') || this.deviceLogging === 'standard';
  }
}
