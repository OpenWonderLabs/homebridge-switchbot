/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * bot.ts: @switchbot/homebridge-switchbot.
 */
import { deviceBase } from './device.js';
import { SwitchBotBLEModel, SwitchBotBLEModelName } from 'node-switchbot';
import { Subject, debounceTime, interval, skipWhile, take, tap } from 'rxjs';

import type { devicesConfig } from '../settings.js';
import type { device } from '../types/devicelist.js';
import type { SwitchBotPlatform } from '../platform.js';
import type { botServiceData } from '../types/bledevicestatus.js';
import type { botStatus } from '../types/devicestatus.js';
import type { botWebhookContext } from '../types/devicewebhookstatus.js';
import type { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Bot extends deviceBase {
  // Services
  private Battery: {
    Name: CharacteristicValue;
    Service: Service;
    BatteryLevel: CharacteristicValue;
    StatusLowBattery: CharacteristicValue;
  };

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

  // OpenAPI
  deviceStatus!: botStatus;

  //Webhook
  webhookContext!: botWebhookContext;

  // BLE
  serviceData!: botServiceData;

  // Config
  botMode!: string;
  allowPush?: boolean;
  doublePress!: number;
  botDeviceType!: string;
  pushRatePress!: number;
  multiPressCount!: number;

  // Updates
  botUpdateInProgress!: boolean;
  doBotUpdate!: Subject<void>;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device);

    // default placeholders
    this.getBotConfigSettings(device);

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doBotUpdate = new Subject();
    this.botUpdateInProgress = false;

    accessory.context.Battery = accessory.context.Battery ?? {};
    // Initialize Battery property
    this.Battery = {
      Name: accessory.context.Battery.Name ?? `${accessory.displayName} Battery`,
      Service: accessory.getService(this.hap.Service.Battery) ?? accessory.addService(this.hap.Service.Battery) as Service,
      BatteryLevel: accessory.context.BatteryLevel ?? 100,
      StatusLowBattery: accessory.context.StatusLowBattery ?? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
    };
    accessory.context.Battery = this.Battery as object;

    // Initialize Battery Characteristics
    this.Battery.Service
      .setCharacteristic(this.hap.Characteristic.Name, this.Battery.Name)
      .setCharacteristic(this.hap.Characteristic.StatusLowBattery, this.Battery.StatusLowBattery)
      .setCharacteristic(this.hap.Characteristic.ChargingState, this.hap.Characteristic.ChargingState.NOT_CHARGEABLE);

    // deviceType
    if (this.botDeviceType === 'switch') {
      // Set category
      accessory.category = this.hap.Categories.SWITCH
      ;
      // Initialize Switch Service
      accessory.context.Switch = accessory.context.Switch ?? {};
      this.Switch = {
        Name: accessory.context.Switch.Name ?? accessory.displayName,
        Service: accessory.getService(this.hap.Service.Switch) ?? accessory.addService(this.hap.Service.Switch) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.Switch = this.Switch as object;
      this.debugLog('Displaying as Switch');

      // Initialize Switch Characteristics
      this.Switch.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.Switch.Name)
        .setCharacteristic(this.hap.Characteristic.On, this.Switch.On)
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
    } else if (this.botDeviceType === 'garagedoor') {
      // Set category
      accessory.category = this.hap.Categories.GARAGE_DOOR_OPENER;

      // Initialize GarageDoor Service
      accessory.context.GarageDoor = accessory.context.GarageDoor ?? {};
      this.GarageDoor = {
        Name: accessory.context.GarageDoor.Name ?? accessory.displayName,
        Service: accessory.getService(this.hap.Service.GarageDoorOpener) ?? accessory.addService(this.hap.Service.GarageDoorOpener) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.GarageDoor = this.GarageDoor as object;
      this.debugLog('Displaying as Garage Door Opener');

      // Initialize GarageDoor Characteristics
      this.GarageDoor.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.GarageDoor.Name)
        .setCharacteristic(this.hap.Characteristic.ObstructionDetected, false)
        .getCharacteristic(this.hap.Characteristic.TargetDoorState).setProps({
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
      this.removeFaucetService(accessory);
      this.removeOutletService(accessory);
      this.removeSwitchService(accessory);
      this.removeWindowService(accessory);
      this.removeWindowCoveringService(accessory);
      this.removeStatefulProgrammableSwitchService(accessory);
    } else if (this.botDeviceType === 'door') {
      // Set category
      accessory.category = this.hap.Categories.DOOR;

      // Initialize Door Service
      accessory.context.Door = accessory.context.Door ?? {};
      this.Door = {
        Name: accessory.context.Door.Name ?? accessory.displayName,
        Service: accessory.getService(this.hap.Service.Door) ?? accessory.addService(this.hap.Service.Door) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.Door = this.Door as object;
      this.debugLog('Displaying as Door');

      // Initialize Door Characteristics
      this.Door.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.Door.Name)
        .setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED)
        .getCharacteristic(this.hap.Characteristic.TargetPosition).setProps({
          validValues: [0, 100],
          minValue: 0,
          maxValue: 100,
          minStep: 100,
        })
        .onGet(() => {
          return this.Door!.On;
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
    } else if (this.botDeviceType === 'window') {
      // Set category
      accessory.category = this.hap.Categories.WINDOW;

      // Initialize Window Service
      accessory.context.Window = accessory.context.Window ?? {};
      this.Window = {
        Name: accessory.context.Window.Name ?? accessory.displayName,
        Service: accessory.getService(this.hap.Service.Window) ?? accessory.addService(this.hap.Service.Window) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.Window = this.Window as object;
      this.debugLog('Displaying as Window');

      // Initialize Window Characteristics
      this.Window.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.Window.Name)
        .setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED)
        .getCharacteristic(this.hap.Characteristic.TargetPosition).setProps({
          validValues: [0, 100],
          minValue: 0,
          maxValue: 100,
          minStep: 100,
        })
        .onGet(() => {
          return this.Window!.On;
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
    } else if (this.botDeviceType === 'windowcovering') {
      // Set category
      accessory.category = this.hap.Categories.WINDOW_COVERING;

      // Initialize WindowCovering Service
      accessory.context.WindowCovering = accessory.context.WindowCovering ?? {};
      this.WindowCovering = {
        Name: accessory.context.WindowCovering.Name ?? accessory.displayName,
        Service: accessory.getService(this.hap.Service.WindowCovering) ?? accessory.addService(this.hap.Service.WindowCovering) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.WindowCovering = this.WindowCovering as object;
      this.debugLog('Displaying as Window Covering');

      // Initialize WindowCovering Characteristics
      this.WindowCovering.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.WindowCovering.Name)
        .setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED)
        .getCharacteristic(this.hap.Characteristic.TargetPosition).setProps({
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
    } else if (this.botDeviceType === 'lock') {
      // Set category
      accessory.category = this.hap.Categories.DOOR_LOCK;

      // Initialize Lock Service
      accessory.context.LockMechanism = accessory.context.LockMechanism ?? {};
      this.LockMechanism = {
        Name: accessory.context.LockMechanism.Name ?? accessory.displayName,
        Service: accessory.getService(this.hap.Service.LockMechanism) ?? accessory.addService(this.hap.Service.LockMechanism) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.LockMechanism = this.LockMechanism as object;
      this.debugLog('Displaying as Lock');

      // Initialize Lock Characteristics
      this.LockMechanism.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.LockMechanism.Name)
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
    } else if (this.botDeviceType === 'faucet') {
      // Set category
      accessory.category = this.hap.Categories.FAUCET;

      // Initialize Faucet Service
      accessory.context.Faucet = accessory.context.Faucet ?? {};
      this.Faucet = {
        Name: accessory.context.Faucet.Name ?? accessory.displayName,
        Service: accessory.getService(this.hap.Service.Faucet) ?? accessory.addService(this.hap.Service.Faucet) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.Faucet = this.Faucet as object;
      this.debugLog('Displaying as Faucet');

      // Initialize Faucet Characteristics
      this.Faucet.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.Faucet.Name)
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
    } else if (this.botDeviceType === 'fan') {
      // Set category
      accessory.category = this.hap.Categories.FAN;

      // Initialize Fan Service
      accessory.context.Fan = accessory.context.Fan ?? {};
      this.Fan = {
        Name: accessory.context.Fan.Name ?? accessory.displayName,
        Service: accessory.getService(this.hap.Service.Fanv2) ?? accessory.addService(this.hap.Service.Fanv2) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.Fan = this.Fan as object;
      this.debugLog('Displaying as Fan');

      // Initialize Fan Characteristics
      this.Fan.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.Fan.Name)
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
    } else if (this.botDeviceType === 'stateful') {
      // Set category
      accessory.category = this.hap.Categories.PROGRAMMABLE_SWITCH;

      // Initialize StatefulProgrammableSwitch Service
      accessory.context.StatefulProgrammableSwitch = accessory.context.StatefulProgrammableSwitch ?? {};
      this.StatefulProgrammableSwitch = {
        Name: accessory.context.StatefulProgrammableSwitch.Name ?? accessory.displayName,
        Service: accessory.getService(this.hap.Service.StatefulProgrammableSwitch)
          ?? accessory.addService(this.hap.Service.StatefulProgrammableSwitch) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.StatefulProgrammableSwitch = this.StatefulProgrammableSwitch as object;
      this.debugLog('Displaying as Stateful Programmable Switch');

      // Initialize StatefulProgrammableSwitch Characteristics
      this.StatefulProgrammableSwitch.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.StatefulProgrammableSwitch.Name)
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
      // Set category
      accessory.category = this.hap.Categories.OUTLET;

      // Initialize Switch property
      accessory.context.Outlet = accessory.context.Outlet ?? {};
      this.Outlet = {
        Name: accessory.context.Outlet.Name ?? accessory.displayName,
        Service: accessory.getService(this.hap.Service.Outlet) ?? accessory.addService(this.hap.Service.Outlet) as Service,
        On: accessory.context.On ?? false,
      };
      accessory.context.Outlet = this.Outlet as object;
      this.debugLog('Displaying as Outlet');

      // Initialize Outlet Characteristics
      this.Outlet.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.Outlet.Name)
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

    // Retrieve initial values and updateHomekit
    this.debugLog('Retrieve initial values and update Homekit');
    this.refreshStatus();

    //regisiter webhook event handler
    this.debugLog('Registering Webhook Event Handler');
    this.registerWebhook();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.botUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    // Watch for Bot change events
    // We put in a debounce of 1000ms so we don't make duplicate calls
    this.doBotUpdate
      .pipe(
        tap(() => {
          this.botUpdateInProgress = true;
        }),
        debounceTime(this.devicePushRate * 1000),
      )
      .subscribe(async () => {
        try {
          if (this.doublePress > 1) {
            interval(this.pushRatePress * 1000)
              .pipe(take(this.doublePress!))
              .subscribe(async () => {
                await this.pushChanges();
              });
          } else {
            await this.pushChanges();
          }
        } catch (e: any) {
          await this.apiError(e);
          await this.errorLog(`failed pushChanges with ${device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`);
        }
        this.botUpdateInProgress = false;
      });
  }

  /**
   * Parse the device status from the SwitchBotBLE API
   */
  async BLEparseStatus(): Promise<void> {
    await this.debugLog('BLEparseStatus');
    await this.debugLog(`(power, battery, deviceMode) = BLE:(${this.serviceData.state}, ${this.serviceData.battery}, ${this.serviceData.mode}),`
      + ` current:(${this.accessory.context.On}, ${this.Battery.BatteryLevel}, ${this.botMode})`);

    // BLEmode (true if Switch Mode) | (false if Press Mode)
    if (this.serviceData.mode) {
      this.accessory.context.On = await this.getOn();
      if (this.getOn() === undefined) {
        this.setOn(Boolean(this.serviceData.state));
      }
      this.debugLog(`Switch Mode, mode: ${this.serviceData.mode}, On: ${this.accessory.context.On}`);
    } else {
      this.setOn(false);
      this.accessory.context.On = await this.getOn();
      this.debugLog(`Press Mode, mode: ${this.serviceData.mode}, On: ${this.accessory.context.On}`);
    }

    // BatteryLevel
    this.Battery.BatteryLevel = this.serviceData.battery;
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`);

    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`);
  }


  /**
   * Parse the device status from the SwitchBot OpenAPI
   */
  async openAPIparseStatus(): Promise<void> {
    await this.debugLog('openAPIparseStatus');
    await this.debugLog(`(power, battery, deviceMode) = API:(${this.deviceStatus.power}, ${this.deviceStatus.battery}, ${this.botMode}),`
      + ` current:(${this.accessory.context.On}, ${this.Battery.BatteryLevel}, ${this.botMode})`);

    // On
    if (this.botMode === 'press') {
      this.setOn(false);
      this.accessory.context.On = await this.getOn();
    } else {
      this.accessory.context.On = await this.getOn();
      if (this.getOn() === undefined) {
        this.setOn(false);
      }
    }
    await this.debugLog(`On: ${this.accessory.context.On}`);

    // Battery Level
    this.Battery.BatteryLevel = this.deviceStatus.battery;
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`);

    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`);

    // Firmware Version
    if (this.deviceStatus.version) {
      const version = this.deviceStatus.version.toString();
      this.debugLog(`Firmware Version: ${version.replace(/^V|-.*$/g, '')}`);
      const deviceVersion = version.replace(/^V|-.*$/g, '') ?? '0.0.0';
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
        .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
        .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
        .updateValue(deviceVersion);
      this.accessory.context.version = deviceVersion;
      await this.debugLog(`version: ${this.accessory.context.version}`);
    }
  }

  async parseStatusWebhook(): Promise<void> {
    await this.debugLog('parseStatusWebhook');
    const getOn = await this.getOn();
    await this.debugLog(`(power, battery, deviceMode) = Webhook:(${this.webhookContext.power}, ${this.webhookContext.battery},`
      + ` ${this.webhookContext.deviceMode}), current:(${getOn}, ${this.Battery.BatteryLevel}, ${this.botMode})`);

    // On
    const setOn = this.webhookContext.power === 'on' ? true : false;
    await this.setOn(setOn);
    await this.debugLog(`On: ${setOn}`);

    // BatteryLevel
    this.Battery.BatteryLevel = this.webhookContext.battery;
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`);

    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`);

    // Mode
    this.botMode = this.webhookContext.deviceMode;
    await this.debugLog(`Mode: ${this.botMode}`);
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      await this.errorLog(`refreshStatus enableCloudService: ${this.device.enableCloudService}`);
    } else if (this.BLE) {
      await this.BLERefreshStatus();
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIRefreshStatus();
    } else {
      await this.offlineOff();
      await this.debugWarnLog(`Connection Type: ${this.device.connectionType}, refreshStatus will not happen.`);
    }
  }

  async BLERefreshStatus(): Promise<void> {
    await this.debugLog('BLERefreshStatus');
    const switchbot = await this.switchbotBLE();

    if (switchbot === undefined) {
      await this.BLERefreshConnection(switchbot);
    } else {
    // Start to monitor advertisement packets
      (async () => {
      // Start to monitor advertisement packets
        const serviceData = await this.monitorAdvertisementPackets(switchbot) as botServiceData;
        // Update HomeKit
        if (serviceData.model === SwitchBotBLEModel.Bot && serviceData.modelName === SwitchBotBLEModelName.Bot) {
          this.serviceData = serviceData;
          await this.BLEparseStatus();
          await this.updateHomeKitCharacteristics();
        } else {
          await this.errorLog(`failed to get serviceData, serviceData: ${serviceData}`);
          await this.BLERefreshConnection(switchbot);
        }
      })();
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    await this.debugLog('openAPIRefreshStatus');
    try {
      const { body, statusCode } = await this.deviceRefreshStatus();
      const deviceStatus: any = await body.json();
      await this.debugLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`);;
      if (await this.successfulStatusCodes(statusCode, deviceStatus)) {
        await this.debugSuccessLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`);
        this.deviceStatus = deviceStatus.body;
        await this.openAPIparseStatus();
        await this.updateHomeKitCharacteristics();
      } else {
        await this.debugWarnLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`);
        await this.debugWarnLog(statusCode, deviceStatus);
      }
    } catch (e: any) {
      await this.apiError(e);
      await this.errorLog(`failed openAPIRefreshStatus with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`);
    }
  }

  async registerWebhook() {
    if (this.device.webhook) {
      await this.debugLog('is listening webhook.');
      this.platform.webhookEventHandler[this.device.deviceId] = async (context: botWebhookContext) => {
        try {
          await this.debugLog(`received Webhook: ${JSON.stringify(context)}`);
          this.webhookContext = context;
          await this.parseStatusWebhook();
          await this.updateHomeKitCharacteristics();
        } catch (e: any) {
          await this.errorLog(`failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`);
        }
      };
    } else {
      await this.debugLog('is not listening webhook.');
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	commandType	  Command	    command parameter	  Description
   * Bot   -    "command"     "turnOff"   "default"	  =        set to OFF state
   * Bot   -    "command"     "turnOn"    "default"	  =        set to ON state
   * Bot   -    "command"     "press"     "default"	  =        trigger press
   */
  async pushChanges(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      await this.errorLog(`pushChanges enableCloudService: ${this.device.enableCloudService}`);
    } else if (this.BLE) {
      await this.BLEpushChanges();
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges();
    } else {
      await this.offlineOff();
      await this.debugWarnLog(`Connection Type: ${this.device.connectionType}, pushChanges will not happen.`);
    }
    // Refresh the status from the API
    interval(15000)
      .pipe(skipWhile(() => this.botUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus();
      });
  }

  async BLEpushChanges(): Promise<void> {
    await this.debugLog('BLEpushChanges');
    const On = await this.getOn();
    if (On !== this.accessory.context.On || this.allowPush) {
      this.debugLog(`BLEpushChanges On: ${On} OnCached: ${this.accessory.context.On}`);
      const switchbot = await this.platform.connectBLE(this.accessory, this.device);
      await this.convertBLEAddress();
      //if (switchbot !== false) {
      if (this.botMode === 'press') {
        this.debugLog(`Bot Mode: ${this.botMode}`);
        switchbot
          .discover({ model: 'H', quick: true, id: this.device.bleMac })
          .then(async (device_list: { press: (arg0: { id: string | undefined }) => any }[]) => {
            this.infoLog(`On: ${On}`);
            return await device_list[0].press({ id: this.device.bleMac });
          })
          .then(async () => {
            await this.successLog(`On: ${On} sent over SwitchBot BLE,  sent successfully`);
            await this.updateHomeKitCharacteristics();
            setTimeout(() => {
              if (this.botDeviceType === 'switch') {
                this.Switch?.Service.getCharacteristic(this.hap.Characteristic.On).updateValue(On);
              } else {
                this.Outlet?.Service.getCharacteristic(this.hap.Characteristic.On).updateValue(On);
              }
              this.debugLog(`On: ${On}, Switch Timeout`);
            }, 500);
          })
          .catch(async (e: any) => {
            await this.apiError(e);
            await this.errorLog(`failed BLEpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`);
            await this.BLEPushConnection();
          });
      } else if (this.botMode === 'switch') {
        this.debugLog(`Press Mode: ${this.botMode}`);
        switchbot
          .discover({ model: this.device.bleModel, quick: true, id: this.device.bleMac })
          .then(async (device_list: any) => {
            this.infoLog(`On: ${On}`);
            return await this.retryBLE({
              max: await this.maxRetryBLE(),
              fn: async () => {
                if (On) {
                  return await device_list[0].turnOn({ id: this.device.bleMac });
                } else {
                  return await device_list[0].turnOff({ id: this.device.bleMac });
                }
              },
            });
          })
          .then(async () => {
            await this.successLog(`On: ${On} sent over SwitchBot BLE,  sent successfully`);
            await this.updateHomeKitCharacteristics();
          })
          .catch(async (e: any) => {
            await this.apiError(e);
            await this.errorLog(`failed BLEpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`);
            await this.BLEPushConnection();
          });
      } else {
        await this.errorLog(`Device Parameters not set for this Bot, please check the device configuration. Bot Mode: ${this.botMode}`);
      }
    } else {
      await this.debugLog(`No Changes (BLEpushChanges), On: ${On} OnCached: ${this.accessory.context.On}`);
    }
  }

  async openAPIpushChanges(): Promise<void> {
    await this.debugLog('openAPIpushChanges');
    let On = await this.getOn();
    if (this.multiPressCount > 0) {
      await this.debugLog(`${this.multiPressCount} request(s) queued.`);
      On = true;
    }
    if (On !== this.accessory.context.On || this.allowPush || this.multiPressCount > 0) {
      let command = '';
      if (this.botMode === 'switch' && On) {
        command = 'turnOn';
        On = true;
        await this.debugLog(`Switch Mode, Turning ${On}`);
      } else if (this.botMode === 'switch' && !On) {
        command = 'turnOff';
        On = false;
        await this.debugLog(`Switch Mode, Turning ${On}`);
      } else if (this.botMode === 'press' || this.botMode === 'multipress') {
        command = 'press';
        await this.debugLog('Press Mode');
        On = false;
      } else {
        throw new Error('Device Parameters not set for this Bot.');
      }
      const bodyChange = JSON.stringify({
        command: `${command}`,
        parameter: 'default',
        commandType: 'command',
      });
      this.debugLog(`Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await this.pushChangeRequest(bodyChange);
        const deviceStatus: any = await body.json();
        await this.debugLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`);
        if (await this.successfulStatusCodes(statusCode, deviceStatus)) {
          await this.debugSuccessLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`);
          await this.updateHomeKitCharacteristics();
        } else {
          await this.statusCode(statusCode);
          await this.statusCode(deviceStatus.statusCode);
        }
        if (this.device.bot?.mode === 'multipress') {
          this.multiPressCount--;
          if (this.multiPressCount > 0) {
            await this.debugLog(`multiPressCount: ${this.multiPressCount}`);
            On = true;
            await this.openAPIpushChanges();
          }
        }
      } catch (e: any) {
        await this.apiError(e);
        await this.errorLog(`failed openAPIpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`);
      }
    } else {
      await this.debugLog(`No Changes (openAPIpushChanges), On: ${On} OnCached: ${this.accessory.context.On}`);
    }
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    if (this.botDeviceType === 'garagedoor') {
      if (this.GarageDoor) {
        await this.debugLog(`Set TargetDoorState: ${value}`);
        this.infoLog(`Set TargetDoorState: ${value}`);
        if (value === this.hap.Characteristic.TargetDoorState.CLOSED) {
          await this.setOn(false);
          this.GarageDoor.On = false;
        } else {
          await this.setOn(true);
          this.GarageDoor.On = true;
        }
      }
    } else if (this.botDeviceType === 'door') {
      if (this.Door) {
        await this.debugLog(`Set TargetPosition: ${value}`);
        if (value === 0) {
          await this.setOn(false);
          this.Door.On = false;
        } else {
          await this.setOn(true);
          this.Door.On = true;
        }
      }
    } else if (this.botDeviceType === 'window') {
      if (this.Window) {
        await this.debugLog(`Set TargetPosition: ${value}`);
        if (value === 0) {
          await this.setOn(false);
          this.Window.On = false;
        } else {
          await this.setOn(true);
          this.Window.On = true;
        }
      }
    } else if (this.botDeviceType === 'windowcovering') {
      if (this.WindowCovering) {
        await this.debugLog(`Set TargetPosition: ${value}`);
        if (value === 0) {
          await this.setOn(false);
          this.WindowCovering.On = false;
        } else {
          await this.setOn(true);
          this.WindowCovering.On = true;
        }
      }
    } else if (this.botDeviceType === 'lock') {
      if (this.LockMechanism) {
        await this.debugLog(`Set LockTargetState: ${value}`);
        if (value === this.hap.Characteristic.LockTargetState.SECURED) {
          await this.setOn(false);
          this.LockMechanism.On = false;
        } else {
          await this.setOn(true);
          this.LockMechanism.On = true;
        }
      }
    } else if (this.botDeviceType === 'faucet') {
      if (this.Faucet) {
        await this.debugLog(`Set Active: ${value}`);
        if (value === this.hap.Characteristic.Active.INACTIVE) {
          await this.setOn(false);
          this.Faucet.On = false;
        } else {
          await this.setOn(true);
          this.Faucet.On = true;
        }
      }
    } else if (this.botDeviceType === 'stateful') {
      if (this.StatefulProgrammableSwitch) {
        await this.debugLog(`Set ProgrammableSwitchOutputState: ${value}`);
        if (value === 0) {
          await this.setOn(false);
          this.StatefulProgrammableSwitch.On = false;
        } else {
          await this.setOn(true);
          this.StatefulProgrammableSwitch.On = true;
        }
      }
    } else if (this.botDeviceType === 'switch') {
      if (this.Switch) {
        await this.debugLog(`Set ProgrammableSwitchOutputState: ${value}`);
        if (value === 0) {
          await this.setOn(false);
          this.Switch.On = false;
        } else {
          await this.setOn(true);
          this.Switch.On = true;
        }
      }
    } else {
      if (this.Outlet) {
        await this.debugLog(`Set On: ${value}`);
        await this.setOn(Boolean(value));
        this.Outlet.On = value;
      }
    }
    if (this.device.bot?.mode === 'multipress') {
      if (value === true) {
        this.multiPressCount++;
        await this.debugLog(`multiPressCount: ${this.multiPressCount}`);
      }
    }
    this.doBotUpdate.next();
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    // State
    if (this.botDeviceType === 'garagedoor') {
      if (this.GarageDoor?.On === undefined) {
        await this.debugLog(`On: ${this.GarageDoor?.On}`);
      } else {
        if (this.GarageDoor.On) {
          this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, this.hap.Characteristic.TargetDoorState.OPEN);
          this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, this.hap.Characteristic.CurrentDoorState.OPEN);
          await this.debugLog(`updateCharacteristic TargetDoorState: Open, CurrentDoorState: Open (${this.GarageDoor.On})`);
        } else {
          this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, this.hap.Characteristic.TargetDoorState.CLOSED);
          this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, this.hap.Characteristic.CurrentDoorState.CLOSED);
          await this.debugLog(`updateCharacteristicc TargetDoorState: Open, CurrentDoorState: Open (${this.GarageDoor.On})`);
        }
      }
      await this.setOn(Boolean(this.GarageDoor?.On));
      await this.debugLog(`Garage Door On: ${this.GarageDoor?.On}`);
    } else if (this.botDeviceType === 'door') {
      if (this.Door?.On === undefined) {
        await this.debugLog(`On: ${this.Door?.On}`);
      } else {
        if (this.Door.On) {
          this.Door.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
          this.Door.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
          this.Door.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          await this.debugLog(`updateCharacteristicc TargetPosition: 100, CurrentPosition: 100 (${this.Door.On})`);
        } else {
          this.Door.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.Door.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.Door.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          await this.debugLog(`updateCharacteristicc TargetPosition: 0, CurrentPosition: 0 (${this.Door.On})`);
        }
      }
      await this.setOn(Boolean(this.Door?.On));
      await this.debugLog(`Door On: ${this.Door?.On}`);
    } else if (this.botDeviceType === 'window') {
      if (this.Window?.On === undefined) {
        await this.debugLog(`On: ${this.Window?.On}`);
      } else {
        if (this.Window.On) {
          this.Window.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
          this.Window.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
          this.Window.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          await this.debugLog(`updateCharacteristicc TargetPosition: 100, CurrentPosition: 100 (${this.Window.On})`);
        } else {
          this.Window.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.Window.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.Window.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          await this.debugLog(`updateCharacteristicc TargetPosition: 0, CurrentPosition: 0 (${this.Window.On})`);
        }
      }
      await this.setOn(Boolean(this.Window?.On));
      await this.debugLog(`Window On: ${this.Window?.On}`);
    } else if (this.botDeviceType === 'windowcovering') {
      if (this.WindowCovering?.On === undefined) {
        await this.debugLog(`On: ${this.WindowCovering?.On}`);
      } else {
        if (this.WindowCovering.On) {
          this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
          this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
          this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          await this.debugLog(`updateCharacteristicc TargetPosition: 100, CurrentPosition: 100 (${this.WindowCovering.On})`);
        } else {
          this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          await this.debugLog(`updateCharacteristicc TargetPosition: 0, CurrentPosition: 0 (${this.WindowCovering.On})`);
        }
      }
      await this.setOn(Boolean(this.WindowCovering?.On));
      await this.debugLog(`Window Covering On: ${this.WindowCovering?.On}`);
    } else if (this.botDeviceType === 'lock') {
      if (this.LockMechanism?.On === undefined) {
        await this.debugLog(`On: ${this.LockMechanism?.On}`);
      } else {
        if (this.LockMechanism.On) {
          this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState,
            this.hap.Characteristic.LockTargetState.UNSECURED);
          this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState,
            this.hap.Characteristic.LockCurrentState.UNSECURED);
          await this.debugLog(`updateCharacteristicc LockTargetState: UNSECURED, LockCurrentState: UNSECURED (${this.LockMechanism.On})`);
        } else {
          this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState,
            this.hap.Characteristic.LockTargetState.SECURED);
          this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState,
            this.hap.Characteristic.LockCurrentState.SECURED);
          await this.debugLog(`updateCharacteristic LockTargetState: SECURED, LockCurrentState: SECURED  (${this.LockMechanism.On})`);
        }
      }
      await this.setOn(Boolean(this.LockMechanism?.On));
      await this.debugLog(`Lock On: ${this.LockMechanism?.On}`);
    } else if (this.botDeviceType === 'faucet') {
      if (this.Faucet?.On === undefined) {
        await this.debugLog(`On: ${this.Faucet?.On}`);
      } else {
        if (this.Faucet.On) {
          this.Faucet.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.ACTIVE);
          await this.debugLog(`updateCharacteristic Active: ${this.Faucet.On}`);
        } else {
          this.Faucet.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.INACTIVE);
          await this.debugLog(`updateCharacteristic Active: ${this.Faucet.On}`);
        }
      }
      await this.setOn(Boolean(this.Faucet?.On));
      await this.debugLog(`Faucet On: ${this.Faucet?.On}`);
    } else if (this.botDeviceType === 'fan') {
      if (this.Fan?.On === undefined) {
        await this.debugLog(`On: ${this.Fan?.On}`);
      } else {
        if (this.Fan.On) {
          this.Fan.Service.updateCharacteristic(this.hap.Characteristic.On, this.Fan.On);
          await this.debugLog(`updateCharacteristic On: ${this.Fan.On}`);
        } else {
          this.Fan.Service.updateCharacteristic(this.hap.Characteristic.On, this.Fan.On);
          await this.debugLog(`updateCharacteristic On: ${this.Fan.On}`);
        }
      }
      await this.setOn(Boolean(this.Fan?.On));
      await this.debugLog(`Fan On: ${this.Fan?.On}`);
    } else if (this.botDeviceType === 'stateful') {
      if (this.StatefulProgrammableSwitch?.On === undefined) {
        await this.debugLog(`On: ${this.StatefulProgrammableSwitch?.On}`);
      } else {
        if (this.StatefulProgrammableSwitch.On) {
          this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent,
            this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
          this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, 1);
          await this.debugLog(`updateCharacteristic ProgrammableSwitchEvent: ProgrammableSwitchOutputState: (${this.StatefulProgrammableSwitch.On})`);
        } else {
          this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent,
            this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
          this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, 0);
          await this.debugLog(`updateCharacteristic ProgrammableSwitchEvent: ProgrammableSwitchOutputState: (${this.StatefulProgrammableSwitch.On})`);
        }
      }
      await this.setOn(Boolean(this.StatefulProgrammableSwitch?.On));
      await this.debugLog(`StatefulProgrammableSwitch On: ${this.StatefulProgrammableSwitch?.On}`);
    } else if (this.botDeviceType === 'switch') {
      if (this.Switch?.On === undefined) {
        await this.debugLog(`On: ${this.Switch?.On}`);
      } else {
        this.Switch.Service.updateCharacteristic(this.hap.Characteristic.On, this.Switch.On);
        await this.debugLog(`updateCharacteristic On: ${this.Switch.On}`);
      }
      await this.setOn(Boolean(this.Switch?.On));
    } else {
      if (this.Outlet?.On === undefined) {
        await this.debugLog(`On: ${this.Outlet?.On}`);
      } else {
        this.Outlet.Service.updateCharacteristic(this.hap.Characteristic.On, this.Outlet.On);
        await this.debugLog(`updateCharacteristic On: ${this.Outlet.On}`);
      }
      await this.setOn(Boolean(this.Outlet?.On));
    }
    this.accessory.context.On = await this.getOn();
    // BatteryLevel
    if (this.Battery.BatteryLevel === undefined) {
      await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`);
    } else {
      this.accessory.context.BatteryLevel = this.Battery.BatteryLevel;
      this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, this.Battery.BatteryLevel);
      await this.debugLog(`updateCharacteristic BatteryLevel: ${this.Battery.BatteryLevel}`);
    }
    // StatusLowBattery
    if (this.Battery.StatusLowBattery === undefined) {
      await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`);
    } else {
      this.accessory.context.StatusLowBattery = this.Battery.StatusLowBattery;
      this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, this.Battery.StatusLowBattery);
      await this.debugLog(`updateCharacteristic StatusLowBattery: ${this.Battery.StatusLowBattery}`);
    }
  }

  async removeOutletService(accessory: PlatformAccessory): Promise<void> {
    // If outletService still present, then remove first
    if (this.Outlet?.Service) {
      this.Outlet.Service = this.accessory.getService(this.hap.Service.Outlet) as Service;
      await this.warnLog('Removing Leftover Outlet Service');
      accessory.removeService(this.Outlet.Service);
    }
  }

  async removeGarageDoorService(accessory: PlatformAccessory): Promise<void> {
    // If garageDoorService still present, then remove first
    if (this.GarageDoor?.Service) {
      this.GarageDoor.Service = this.accessory.getService(this.hap.Service.GarageDoorOpener) as Service;
      await this.warnLog('Removing Leftover Garage Door Service');
      accessory.removeService(this.GarageDoor.Service);
    }
  }

  async removeDoorService(accessory: PlatformAccessory): Promise<void> {
    // If doorService still present, then remove first
    if (this.Door?.Service) {
      this.Door.Service = this.accessory.getService(this.hap.Service.Door) as Service;
      await this.warnLog('Removing Leftover Door Service');
      accessory.removeService(this.Door.Service);
    }
  }

  async removeLockService(accessory: PlatformAccessory): Promise<void> {
    // If lockService still present, then remove first
    if (this.LockMechanism?.Service) {
      this.LockMechanism.Service = this.accessory.getService(this.hap.Service.LockMechanism) as Service;
      this.warnLog('Removing Leftover Lock Service');
      accessory.removeService(this.LockMechanism.Service);
    }
  }

  async removeFaucetService(accessory: PlatformAccessory): Promise<void> {
    // If faucetService still present, then remove first
    if (this.Faucet?.Service) {
      this.Faucet.Service = this.accessory.getService(this.hap.Service.Faucet) as Service;
      await this.warnLog('Removing Leftover Faucet Service');
      accessory.removeService(this.Faucet.Service);
    }
  }

  async removeFanService(accessory: PlatformAccessory): Promise<void> {
    // If fanService still present, then remove first
    if (this.Fan?.Service) {
      this.Fan.Service = this.accessory.getService(this.hap.Service.Fanv2) as Service;
      this.warnLog('Removing Leftover Fan Service');
      accessory.removeService(this.Fan.Service);
    }
  }

  async removeWindowService(accessory: PlatformAccessory): Promise<void> {
    // If windowService still present, then remove first
    if (this.Window?.Service) {
      this.Window.Service = this.accessory.getService(this.hap.Service.Window) as Service;
      await this.warnLog('Removing Leftover Window Service');
      accessory.removeService(this.Window.Service);
    }
  }

  async removeWindowCoveringService(accessory: PlatformAccessory): Promise<void> {
    // If windowCoveringService still present, then remove first
    if (this.WindowCovering?.Service) {
      this.WindowCovering.Service = this.accessory.getService(this.hap.Service.WindowCovering) as Service;
      await this.warnLog('Removing Leftover Window Covering Service');
      accessory.removeService(this.WindowCovering.Service);
    }
  }

  async removeStatefulProgrammableSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If statefulProgrammableSwitchService still present, then remove first
    if (this.StatefulProgrammableSwitch?.Service) {
      this.StatefulProgrammableSwitch.Service = this.accessory.getService(this.hap.Service.StatefulProgrammableSwitch) as Service;
      await this.warnLog('Removing Leftover Stateful Programmable Switch Service');
      accessory.removeService(this.StatefulProgrammableSwitch.Service);
    }
  }

  async removeSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If switchService still present, then remove first
    if (this.Switch?.Service) {
      this.Switch.Service = this.accessory.getService(this.hap.Service.Switch) as Service;
      await this.warnLog('Removing Leftover Switch Service');
      accessory.removeService(this.Switch.Service);
    }
  }

  async getOn(): Promise<boolean> {
    let On: boolean;
    if (this.botDeviceType === 'garagedoor') {
      On = this.GarageDoor?.On ? true : false;
    } else if (this.botDeviceType === 'door') {
      On = this.Door?.On ? true : false;
    } else if (this.botDeviceType === 'window') {
      On = this.Window?.On ? true : false;
    } else if (this.botDeviceType === 'windowcovering') {
      On = this.WindowCovering?.On ? true : false;
    } else if (this.botDeviceType === 'lock') {
      On = this.LockMechanism?.On ? true : false;
    } else if (this.botDeviceType === 'faucet') {
      On = this.Faucet?.On ? true : false;
    } else if (this.botDeviceType === 'fan') {
      On = this.Fan?.On ? true : false;
    } else if (this.botDeviceType === 'stateful') {
      On = this.StatefulProgrammableSwitch?.On ? true : false;
    } else if (this.botDeviceType === 'switch') {
      On = this.Switch?.On ? true : false;
    } else {
      On = this.Outlet?.On ? true : false;
    }
    return On;
  }

  async setOn(On: boolean): Promise<void> {
    if (this.botDeviceType === 'garagedoor') {
      if (this.GarageDoor) {
        this.GarageDoor.On = On;
      }
    } else if (this.botDeviceType === 'door') {
      if (this.Door) {
        this.Door.On = On;
      }
    } else if (this.botDeviceType === 'window') {
      if (this.Window) {
        this.Window.On = On;
      }
    } else if (this.botDeviceType === 'windowcovering') {
      if (this.WindowCovering) {
        this.WindowCovering.On = On;
      }
    } else if (this.botDeviceType === 'lock') {
      if (this.LockMechanism) {
        this.LockMechanism.On = On;
      }
    } else if (this.botDeviceType === 'faucet') {
      if (this.Faucet) {
        this.Faucet.On = On;
      }
    } else if (this.botDeviceType === 'fan') {
      if (this.Fan) {
        this.Fan.On = On;
      }
    } else if (this.botDeviceType === 'stateful') {
      if (this.StatefulProgrammableSwitch) {
        this.StatefulProgrammableSwitch.On = On;
      }
    } else if (this.botDeviceType === 'switch') {
      if (this.Switch) {
        this.Switch.On = On;
      }
    } else {
      if (this.Outlet) {
        this.Outlet.On = On;
      }
    }
  }

  async getBotConfigSettings(device: device & devicesConfig) {
    //Bot Device Type
    if (!device.bot?.deviceType && this.accessory.context.deviceType) {
      this.botDeviceType = this.accessory.context.deviceType;
      await this.debugWarnLog(`Using Device Type: ${this.botDeviceType}, from Accessory Cache.`);
    } else if (device.bot?.deviceType) {
      this.accessory.context.deviceType = device.bot.deviceType;
      await this.debugWarnLog(`Accessory Cache: ${this.accessory.context.deviceType}`);
      this.botDeviceType = this.accessory.context.deviceType;
      await this.debugWarnLog(`Using Device Type: ${this.botDeviceType}`);
    } else {
      this.botDeviceType = 'outlet';
      await this.errorLog(`No Device Type Set, deviceType: ${this.device.bot?.deviceType}`);
      await this.warnLog(`Using default deviceType: ${this.botDeviceType}`);
    }
    // Bot Mode
    if (!device.bot?.mode) {
      this.botMode = 'switch';
      await this.warnLog('does not have bot mode set in the Plugin\'s SwitchBot Device Settings,');
      await this.warnLog(`is defaulting to "${this.botMode}" mode, you may experience issues.`);
    } else if (device.bot?.mode === 'switch') {
      this.botMode = 'switch';
      await this.debugLog(`Using Bot Mode: ${this.botMode}`);
    } else if (device.bot?.mode === 'press') {
      this.botMode = 'press';
      await this.debugLog(`Using Bot Mode: ${this.botMode}`);
    } else if (device.bot?.mode === 'multipress') {
      this.botMode = 'multipress';
      await this.debugLog(`Using Bot Mode: ${this.botMode}`);
    } else {
      throw new Error(`Bot Mode: ${this.botMode}`);
    }

    // Bot Double Press
    if (device.bot?.doublePress) {
      this.doublePress = device.bot?.doublePress;
      this.accessory.context.doublePress = this.doublePress;
    } else {
      this.doublePress = 1;
    }

    // Bot Press PushRate
    if (device?.bot?.pushRatePress) {
      this.pushRatePress = device?.bot?.pushRatePress;
      await this.debugLog(`Using Device Config Bot pushRatePress: ${this.pushRatePress}`);
    } else {
      this.pushRatePress = 15;
      await this.debugLog(`Using Default Bot pushRatePress: ${this.pushRatePress}`);
    }

    // Bot Allow Push
    if (device.bot?.allowPush) {
      this.allowPush = true;
    } else {
      this.allowPush = false;
    }
    await this.debugLog(`Allowing Push Changes: ${this.allowPush}`);
    // Bot Multi Press Count
    this.multiPressCount = 0;
  }

  async BLEPushConnection() {
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      await this.warnLog('Using OpenAPI Connection to Push Changes');
      await this.openAPIpushChanges();
    }
  }

  async BLERefreshConnection(switchbot: any): Promise<void> {
    await this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`);
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      await this.warnLog('Using OpenAPI Connection to Refresh Status');
      await this.openAPIRefreshStatus();
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      if (this.botDeviceType === 'garagedoor') {
        if (this.GarageDoor) {
          this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, this.hap.Characteristic.TargetDoorState.CLOSED);
          this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, this.hap.Characteristic.CurrentDoorState.CLOSED);
          this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.ObstructionDetected, false);
        }
      } else if (this.botDeviceType === 'door') {
        if (this.Door) {
          this.Door.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.Door.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.Door.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
        }
      } else if (this.botDeviceType === 'window') {
        if (this.Window) {
          this.Window.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.Window.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.Window.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
        }
      } else if (this.botDeviceType === 'windowcovering') {
        if (this.WindowCovering) {
          this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
        }
      } else if (this.botDeviceType === 'lock') {
        if (this.LockMechanism) {
          this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState, this.hap.Characteristic.LockTargetState.SECURED);
          this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState, this.hap.Characteristic.LockCurrentState.SECURED);
        }
      } else if (this.botDeviceType === 'faucet') {
        if (this.Faucet) {
          this.Faucet.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.INACTIVE);
        }
      } else if (this.botDeviceType === 'fan') {
        if (this.Fan) {
          this.Fan.Service.updateCharacteristic(this.hap.Characteristic.On, false);
        }
      } else if (this.botDeviceType === 'stateful') {
        if (this.StatefulProgrammableSwitch) {
          this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent,
            this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
          this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, 0);
        }
      } else if (this.botDeviceType === 'switch') {
        if (this.Switch) {
          this.Switch.Service.updateCharacteristic(this.hap.Characteristic.On, false);
        }
      } else {
        if (this.Outlet) {
          this.Outlet.Service.updateCharacteristic(this.hap.Characteristic.On, false);
        }
      }
    }
  }

  async apiError(e: any): Promise<void> {
    if (this.botDeviceType === 'garagedoor') {
      if (this.GarageDoor) {
        this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, e);
        this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, e);
        this.GarageDoor.Service.updateCharacteristic(this.hap.Characteristic.ObstructionDetected, e);
      }
    } else if (this.botDeviceType === 'door') {
      if (this.Door) {
        this.Door.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
        this.Door.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
        this.Door.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e);
      }
    } else if (this.botDeviceType === 'window') {
      if (this.Window) {
        this.Window.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
        this.Window.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
        this.Window.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e);
      }
    } else if (this.botDeviceType === 'windowcovering') {
      if (this.WindowCovering) {
        this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
        this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
        this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e);
      }
    } else if (this.botDeviceType === 'lock') {
      if (this.LockMechanism) {
        this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState, e);
        this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState, e);
      }
    } else if (this.botDeviceType === 'faucet') {
      if (this.Faucet) {
        this.Faucet.Service.updateCharacteristic(this.hap.Characteristic.Active, e);
      }
    } else if (this.botDeviceType === 'fan') {
      if (this.Fan) {
        this.Fan.Service.updateCharacteristic(this.hap.Characteristic.On, e);
      }
    } else if (this.botDeviceType === 'stateful') {
      if (this.StatefulProgrammableSwitch) {
        this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent, e);
        this.StatefulProgrammableSwitch.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, e);
      }
    } else if (this.botDeviceType === 'switch') {
      if (this.Switch) {
        this.Switch.Service.updateCharacteristic(this.hap.Characteristic.On, e);
      }
    } else {
      if (this.Outlet) {
        this.Outlet.Service.updateCharacteristic(this.hap.Characteristic.On, e);
      }
    }
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e);
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e);
  }
}
