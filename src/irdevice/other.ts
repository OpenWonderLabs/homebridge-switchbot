import { CharacteristicValue, PlatformAccessory, Service, API, Logging, HAP } from 'homebridge';
import { request } from 'undici';
import { SwitchBotPlatform } from '../platform.js';
import { Devices, irDevicesConfig, irdevice, SwitchBotPlatformConfig } from '../settings.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Others {
  public readonly api: API;
  public readonly log: Logging;
  public readonly config!: SwitchBotPlatformConfig;
  protected readonly hap: HAP;
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
    this.api = this.platform.api;
    this.log = this.platform.log;
    this.config = this.platform.config;
    this.hap = this.api.hap;
    // default placeholders
    this.deviceLogs(device);
    this.deviceType(device);
    this.deviceContext();
    this.disablePushOnChanges(device);
    this.disablePushOffChanges(device);
    this.deviceConfig(device);

    // set accessory information
    accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.hap.Characteristic.Model, device.remoteType)
      .setCharacteristic(this.hap.Characteristic.SerialNumber, device.deviceId)
      .setCharacteristic(this.hap.Characteristic.FirmwareRevision, accessory.context.FirmwareRevision);

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
      const switchService = `${accessory.displayName} Switch`;
      (this.switchService = accessory.getService(this.hap.Service.Switch)
        || accessory.addService(this.hap.Service.Switch)), switchService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Switch`);

      this.switchService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      if (!this.switchService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.switchService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.switchService.getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this));
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

      // Add garageDoorService
      const garageDoorService = `${accessory.displayName} Garage Door Opener`;
      (this.garageDoorService = accessory.getService(this.hap.Service.GarageDoorOpener)
        || accessory.addService(this.hap.Service.GarageDoorOpener)), garageDoorService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Garage Door Opener`);

      this.garageDoorService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      if (!this.garageDoorService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.garageDoorService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.garageDoorService.getCharacteristic(this.hap.Characteristic.TargetDoorState).onSet(this.OnSet.bind(this));
      this.garageDoorService.setCharacteristic(this.hap.Characteristic.ObstructionDetected, false);
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

      // Add doorService
      const doorService = `${accessory.displayName} Door`;
      (this.doorService = accessory.getService(this.hap.Service.Door)
        || accessory.addService(this.hap.Service.Door)), doorService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Door`);

      this.doorService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      if (!this.doorService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.doorService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.doorService
        .getCharacteristic(this.hap.Characteristic.TargetPosition)
        .setProps({
          validValues: [0, 100],
          minValue: 0,
          maxValue: 100,
          minStep: 100,
        })
        .onSet(this.OnSet.bind(this));
      this.doorService.setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
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

      // Add windowService
      const windowService = `${accessory.displayName} Window`;
      (this.windowService = accessory.getService(this.hap.Service.Window)
        || accessory.addService(this.hap.Service.Window)), windowService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Window`);

      this.windowService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      if (!this.windowService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.windowService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.windowService
        .getCharacteristic(this.hap.Characteristic.TargetPosition)
        .setProps({
          validValues: [0, 100],
          minValue: 0,
          maxValue: 100,
          minStep: 100,
        })
        .onSet(this.OnSet.bind(this));
      this.windowService.setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
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

      // Add windowCoveringService
      const windowCoveringService = `${accessory.displayName} Window Covering`;
      (this.windowCoveringService = accessory.getService(this.hap.Service.WindowCovering)
        || accessory.addService(this.hap.Service.WindowCovering)), windowCoveringService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Window Covering`);

      this.windowCoveringService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      if (!this.windowCoveringService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.windowCoveringService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.windowCoveringService
        .getCharacteristic(this.hap.Characteristic.TargetPosition)
        .setProps({
          validValues: [0, 100],
          minValue: 0,
          maxValue: 100,
          minStep: 100,
        })
        .onSet(this.OnSet.bind(this));
      this.windowCoveringService.setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
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

      // Add lockService
      const lockService = `${accessory.displayName} Lock`;
      (this.lockService = accessory.getService(this.hap.Service.LockMechanism)
        || accessory.addService(this.hap.Service.LockMechanism)), lockService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Lock`);

      this.lockService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      if (!this.lockService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.lockService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.lockService.getCharacteristic(this.hap.Characteristic.LockTargetState).onSet(this.OnSet.bind(this));
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

      // Add faucetService
      const faucetService = `${accessory.displayName} Faucet`;
      (this.faucetService = accessory.getService(this.hap.Service.Faucet)
        || accessory.addService(this.hap.Service.Faucet)), faucetService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Faucet`);

      this.faucetService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      if (!this.faucetService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.faucetService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.faucetService.getCharacteristic(this.hap.Characteristic.Active).onSet(this.OnSet.bind(this));
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

      // Add fanService
      const fanService = `${accessory.displayName} Fan`;
      (this.fanService = accessory.getService(this.hap.Service.Fan)
        || accessory.addService(this.hap.Service.Fan)), fanService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Fan`);

      this.fanService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      if (!this.fanService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.fanService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.fanService.getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this));
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

      // Add statefulProgrammableSwitchService
      const statefulProgrammableSwitchService = `${accessory.displayName} Stateful Programmable Switch`;
      (this.statefulProgrammableSwitchService = accessory.getService(this.hap.Service.StatefulProgrammableSwitch)
        || accessory.addService(this.hap.Service.StatefulProgrammableSwitch)), statefulProgrammableSwitchService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Stateful Programmable Switch`);

      this.statefulProgrammableSwitchService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      if (!this.statefulProgrammableSwitchService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.statefulProgrammableSwitchService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.statefulProgrammableSwitchService
        .getCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState)
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
      const outletService = `${accessory.displayName} Outlet`;
      (this.outletService = accessory.getService(this.hap.Service.Outlet)
        || accessory.addService(this.hap.Service.Outlet)), outletService;
      this.debugWarnLog(`${this.device.remoteType}: ${accessory.displayName} Displaying as Outlet`);

      this.outletService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      if (!this.outletService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.outletService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.outletService.getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this));
    }
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    if (this.otherDeviceType === 'garagedoor') {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Set TargetDoorState: ${value}`);
      if (value === this.hap.Characteristic.TargetDoorState.CLOSED) {
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
      if (value === this.hap.Characteristic.LockTargetState.SECURED) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else if (this.otherDeviceType === 'faucet') {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Active: ${value}`);
      if (value === this.hap.Characteristic.Active.INACTIVE) {
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

    //pushChanges
    if (this.On) {
      await this.pushOnChanges();
    } else {
      await this.pushOffChanges();
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
            this.hap.Characteristic.TargetDoorState,
            this.hap.Characteristic.TargetDoorState.OPEN,
          );
          this.garageDoorService?.updateCharacteristic(
            this.hap.Characteristic.CurrentDoorState,
            this.hap.Characteristic.CurrentDoorState.OPEN,
          );
          this.debugLog(
            `${this.device.remoteType}: ` + `${this.accessory.displayName} updateCharacteristic TargetDoorState: Open, CurrentDoorState: Open`,
          );
        } else {
          this.garageDoorService?.updateCharacteristic(
            this.hap.Characteristic.TargetDoorState,
            this.hap.Characteristic.TargetDoorState.CLOSED,
          );
          this.garageDoorService?.updateCharacteristic(
            this.hap.Characteristic.CurrentDoorState,
            this.hap.Characteristic.CurrentDoorState.CLOSED,
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
          this.doorService?.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
          this.doorService?.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
          this.doorService?.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 100, CurrentPosition: 100`);
        } else {
          this.doorService?.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.doorService?.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.doorService?.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 0, CurrentPosition: 0`);
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Door On: ${this.On}`);
    } else if (this.otherDeviceType === 'window') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.windowService?.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
          this.windowService?.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
          this.windowService?.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 100, CurrentPosition: 100`);
        } else {
          this.windowService?.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.windowService?.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.windowService?.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 0, CurrentPosition: 0`);
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Window On: ${this.On}`);
    } else if (this.otherDeviceType === 'windowcovering') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.windowCoveringService?.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
          this.windowCoveringService?.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
          this.windowCoveringService?.updateCharacteristic(
            this.hap.Characteristic.PositionState,
            this.hap.Characteristic.PositionState.STOPPED,
          );
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 100, CurrentPosition: 100`);
        } else {
          this.windowCoveringService?.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.windowCoveringService?.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.windowCoveringService?.updateCharacteristic(
            this.hap.Characteristic.PositionState,
            this.hap.Characteristic.PositionState.STOPPED,
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
            this.hap.Characteristic.LockTargetState,
            this.hap.Characteristic.LockTargetState.UNSECURED,
          );
          this.lockService?.updateCharacteristic(
            this.hap.Characteristic.LockCurrentState,
            this.hap.Characteristic.LockCurrentState.UNSECURED,
          );
          this.debugLog(
            `${this.device.remoteType}: ` +
            `${this.accessory.displayName} updateCharacteristic LockTargetState: UNSECURED, LockCurrentState: UNSECURED`,
          );
        } else {
          this.lockService?.updateCharacteristic(this.hap.Characteristic.LockTargetState, this.hap.Characteristic.LockTargetState.SECURED);
          this.lockService?.updateCharacteristic(
            this.hap.Characteristic.LockCurrentState,
            this.hap.Characteristic.LockCurrentState.SECURED,
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
          this.faucetService?.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.ACTIVE);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.On}`);
        } else {
          this.faucetService?.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.INACTIVE);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.On}`);
        }
      }
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Faucet On: ${this.On}`);
    } else if (this.otherDeviceType === 'fan') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.fanService?.updateCharacteristic(this.hap.Characteristic.On, this.On);
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
        } else {
          this.fanService?.updateCharacteristic(this.hap.Characteristic.On, this.On);
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
            this.hap.Characteristic.ProgrammableSwitchEvent,
            this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
          );
          this.statefulProgrammableSwitchService?.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, 1);
          this.debugLog(
            `${this.device.remoteType}: ` +
            `${this.accessory.displayName} updateCharacteristic ProgrammableSwitchEvent: SINGLE, ProgrammableSwitchOutputState: 1`,
          );
        } else {
          this.statefulProgrammableSwitchService?.updateCharacteristic(
            this.hap.Characteristic.ProgrammableSwitchEvent,
            this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
          );
          this.statefulProgrammableSwitchService?.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, 0);
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
        this.switchService?.updateCharacteristic(this.hap.Characteristic.On, this.On);
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
      }
    } else {
      if (this.On === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        this.outletService?.updateCharacteristic(this.hap.Characteristic.On, this.On);
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
      }
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
    if (this.device.commandType && this.device.customize) {
      commandType = this.device.commandType;
    } else if (this.device.customize) {
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
      case 400:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Bad Request, The client has issued an invalid request. `
              + `This is commonly used to specify validation errors in a request payload, statusCode: ${statusCode}`);
        break;
      case 401:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Unauthorized,	Authorization for the API is required, `
              + `but the request has not been authenticated, statusCode: ${statusCode}`);
        break;
      case 403:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Forbidden,	The request has been authenticated but does not `
              + `have appropriate permissions, or a requested resource is not found, statusCode: ${statusCode}`);
        break;
      case 404:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Not Found,	Specifies the requested path does not exist, `
          + `statusCode: ${statusCode}`);
        break;
      case 406:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Not Acceptable,	The client has requested a MIME type via `
              + `the Accept header for a value not supported by the server, statusCode: ${statusCode}`);
        break;
      case 415:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Unsupported Media Type,	The client has defined a contentType `
              + `header that is not supported by the server, statusCode: ${statusCode}`);
        break;
      case 422:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Unprocessable Entity,	The client has made a valid request, but `
              + `the server cannot process it. This is often used for APIs for which certain limits have been exceeded, statusCode: ${statusCode}`);
        break;
      case 429:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Too Many Requests,	The client has exceeded the number of `
              + `requests allowed for a given time window, statusCode: ${statusCode}`);
        break;
      case 500:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Internal Server Error,	An unexpected error on the SmartThings `
              + `servers has occurred. These errors should be rare, statusCode: ${statusCode}`);
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
      this.garageDoorService?.updateCharacteristic(this.hap.Characteristic.TargetDoorState, e);
      this.garageDoorService?.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, e);
      this.garageDoorService?.updateCharacteristic(this.hap.Characteristic.ObstructionDetected, e);
    } else if (this.otherDeviceType === 'door') {
      this.doorService?.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
      this.doorService?.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
      this.doorService?.updateCharacteristic(this.hap.Characteristic.PositionState, e);
    } else if (this.otherDeviceType === 'window') {
      this.windowService?.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
      this.windowService?.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
      this.windowService?.updateCharacteristic(this.hap.Characteristic.PositionState, e);
    } else if (this.otherDeviceType === 'windowcovering') {
      this.windowCoveringService?.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
      this.windowCoveringService?.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
      this.windowCoveringService?.updateCharacteristic(this.hap.Characteristic.PositionState, e);
    } else if (this.otherDeviceType === 'lock') {
      this.doorService?.updateCharacteristic(this.hap.Characteristic.LockTargetState, e);
      this.doorService?.updateCharacteristic(this.hap.Characteristic.LockCurrentState, e);
    } else if (this.otherDeviceType === 'faucet') {
      this.faucetService?.updateCharacteristic(this.hap.Characteristic.Active, e);
    } else if (this.otherDeviceType === 'fan') {
      this.fanService?.updateCharacteristic(this.hap.Characteristic.On, e);
    } else if (this.otherDeviceType === 'stateful') {
      this.statefulProgrammableSwitchService?.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent, e);
      this.statefulProgrammableSwitchService?.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, e);
    } else if (this.otherDeviceType === 'switch') {
      this.switchService?.updateCharacteristic(this.hap.Characteristic.On, e);
    } else {
      this.outletService?.updateCharacteristic(this.hap.Characteristic.On, e);
    }
  }

  async removeOutletService(accessory: PlatformAccessory): Promise<void> {
    // If outletService still present, then remove first
    this.outletService = this.accessory.getService(this.hap.Service.Outlet);
    if (this.outletService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Outlet Service`);
    }
    accessory.removeService(this.outletService!);
  }

  async removeGarageDoorService(accessory: PlatformAccessory): Promise<void> {
    // If garageDoorService still present, then remove first
    this.garageDoorService = this.accessory.getService(this.hap.Service.GarageDoorOpener);
    if (this.garageDoorService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Garage Door Service`);
    }
    accessory.removeService(this.garageDoorService!);
  }

  async removeDoorService(accessory: PlatformAccessory): Promise<void> {
    // If doorService still present, then remove first
    this.doorService = this.accessory.getService(this.hap.Service.Door);
    if (this.doorService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Door Service`);
    }
    accessory.removeService(this.doorService!);
  }

  async removeLockService(accessory: PlatformAccessory): Promise<void> {
    // If lockService still present, then remove first
    this.lockService = this.accessory.getService(this.hap.Service.LockMechanism);
    if (this.lockService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Lock Service`);
    }
    accessory.removeService(this.lockService!);
  }

  async removeFaucetService(accessory: PlatformAccessory): Promise<void> {
    // If faucetService still present, then remove first
    this.faucetService = this.accessory.getService(this.hap.Service.Faucet);
    if (this.faucetService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Faucet Service`);
    }
    accessory.removeService(this.faucetService!);
  }

  async removeFanService(accessory: PlatformAccessory): Promise<void> {
    // If fanService still present, then remove first
    this.fanService = this.accessory.getService(this.hap.Service.Fan);
    if (this.fanService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Fan Service`);
    }
    accessory.removeService(this.fanService!);
  }

  async removeWindowService(accessory: PlatformAccessory): Promise<void> {
    // If windowService still present, then remove first
    this.windowService = this.accessory.getService(this.hap.Service.Window);
    if (this.windowService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Window Service`);
    }
    accessory.removeService(this.windowService!);
  }

  async removeWindowCoveringService(accessory: PlatformAccessory): Promise<void> {
    // If windowCoveringService still present, then remove first
    this.windowCoveringService = this.accessory.getService(this.hap.Service.WindowCovering);
    if (this.windowCoveringService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Window Covering Service`);
    }
    accessory.removeService(this.windowCoveringService!);
  }

  async removeStatefulProgrammableSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If statefulProgrammableSwitchService still present, then remove first
    this.statefulProgrammableSwitchService = this.accessory.getService(this.hap.Service.StatefulProgrammableSwitch);
    if (this.statefulProgrammableSwitchService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Stateful Programmable Switch Service`);
    }
    accessory.removeService(this.statefulProgrammableSwitchService!);
  }

  async removeSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If switchService still present, then remove first
    this.switchService = this.accessory.getService(this.hap.Service.Switch);
    if (this.switchService) {
      this.warnLog(`${this.device.remoteType}: ${accessory.displayName} Removing Leftover Switch Service`);
    }
    accessory.removeService(this.switchService!);
  }

  async deviceType(device: irdevice & irDevicesConfig): Promise<void> {
    if (!device.other?.deviceType && this.accessory.context.deviceType) {
      this.otherDeviceType = this.accessory.context.deviceType;
      this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Device Type: ${this.otherDeviceType}, from Accessory Cache.`);
    } else if (device.other?.deviceType) {
      this.accessory.context.deviceType = device.other.deviceType;
      this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} Accessory Cache: ${this.accessory.context.deviceType}`);
      this.otherDeviceType = this.accessory.context.deviceType;
      this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Device Type: ${this.otherDeviceType}`);
    } else {
      this.otherDeviceType = 'outlet';
      this.warnLog(`${this.device.remoteType}: ${this.accessory.displayName} no deviceType set, using default deviceType: ${this.otherDeviceType}`);
    }
  }

  async deviceContext() {
    if (this.On === undefined) {
      this.On = true;
    } else {
      this.On = this.accessory.context.On;
    }
    if (this.FirmwareRevision === undefined) {
      this.FirmwareRevision = this.platform.version;
      this.accessory.context.FirmwareRevision = this.FirmwareRevision;
    }
  }

  async deviceConfig(device: irdevice & irDevicesConfig): Promise<void> {
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

  async deviceLogs(device: irdevice & irDevicesConfig): Promise<void> {
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
