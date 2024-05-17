/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * bot.ts: @switchbot/homebridge-switchbot.
 */
import { request } from 'undici';
import { deviceBase } from './device.js';
import { interval, Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform.js';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { device, devicesConfig, serviceData, deviceStatus, Devices } from '../settings.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Bot extends deviceBase {
  // Services
  private Battery!: {
    Service: Service;
    BatteryLevel: CharacteristicValue;
    StatusLowBattery: CharacteristicValue;
  };

  private Switch?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private GarageDoor?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private Door?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private Window?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private WindowCovering?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private Lock?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private Faucet?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private Fan?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private StatefulProgrammableSwitch?: {
    Service: Service;
    On: CharacteristicValue;
  };

  private Outlet?: {
    Service: Service;
    On: CharacteristicValue;
  };

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

    // Initialize Battery property
    this.Battery = {
      Service: accessory.getService(this.hap.Service.Battery)!,
      BatteryLevel: accessory.context.BatteryLevel || 100,
      StatusLowBattery: accessory.context.StatusLowBattery || this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
    };

    // deviceType
    if (this.botDeviceType === 'switch') {
      // Initialize Switch property
      this.Switch = {
        Service: accessory.getService(this.hap.Service.Switch)!,
        On: accessory.context.On || false,
      };
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
      (this.Switch!.Service = accessory.getService(this.hap.Service.Switch)
        || accessory.addService(this.hap.Service.Switch)), switchService;
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Switch`);

      this.Switch!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.Switch!.Service.getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this));
    } else if (this.botDeviceType === 'garagedoor') {
      // Initialize Switch property
      this.GarageDoor = {
        Service: accessory.getService(this.hap.Service.GarageDoorOpener)!,
        On: accessory.context.On || false,
      };
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
      (this.GarageDoor!.Service = accessory.getService(this.hap.Service.GarageDoorOpener)
        || accessory.addService(this.hap.Service.GarageDoorOpener)), garageDoorService;
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Garage Door Opener`);

      this.GarageDoor!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.GarageDoor!.Service.getCharacteristic(this.hap.Characteristic.TargetDoorState).onSet(this.OnSet.bind(this));
      this.GarageDoor!.Service.setCharacteristic(this.hap.Characteristic.ObstructionDetected, false);
    } else if (this.botDeviceType === 'door') {
      // Initialize Switch property
      this.Door = {
        Service: accessory.getService(this.hap.Service.Door)!,
        On: accessory.context.On || false,
      };
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
      (this.Door!.Service = accessory.getService(this.hap.Service.Door)
        || accessory.addService(this.hap.Service.Door)), doorService;
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Door`);

      this.Door!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.Door!.Service
        .getCharacteristic(this.hap.Characteristic.TargetPosition)
        .setProps({
          validValues: [0, 100],
          minValue: 0,
          maxValue: 100,
          minStep: 100,
        })
        .onSet(this.OnSet.bind(this));
      this.Door!.Service.setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
    } else if (this.botDeviceType === 'window') {
      // Initialize Switch property
      this.Window = {
        Service: accessory.getService(this.hap.Service.Window)!,
        On: accessory.context.On || false,
      };
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
      (this.Window!.Service = accessory.getService(this.hap.Service.Window)
        || accessory.addService(this.hap.Service.Window)), windowService;
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Window`);

      this.Window!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.Window!.Service
        .getCharacteristic(this.hap.Characteristic.TargetPosition)
        .setProps({
          validValues: [0, 100],
          minValue: 0,
          maxValue: 100,
          minStep: 100,
        })
        .onSet(this.OnSet.bind(this));
      this.Window!.Service.setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
    } else if (this.botDeviceType === 'windowcovering') {
      // Initialize Switch property
      this.WindowCovering = {
        Service: accessory.getService(this.hap.Service.WindowCovering)!,
        On: accessory.context.On || false,
      };
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
      (this.WindowCovering!.Service = accessory.getService(this.hap.Service.WindowCovering)
        || accessory.addService(this.hap.Service.WindowCovering)), windowCoveringService;
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Window Covering`);

      this.WindowCovering!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.WindowCovering!.Service
        .getCharacteristic(this.hap.Characteristic.TargetPosition)
        .setProps({
          validValues: [0, 100],
          minValue: 0,
          maxValue: 100,
          minStep: 100,
        })
        .onSet(this.OnSet.bind(this));
      this.WindowCovering!.Service.setCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
    } else if (this.botDeviceType === 'lock') {
      // Initialize Switch property
      this.Lock = {
        Service: accessory.getService(this.hap.Service.LockMechanism)!,
        On: accessory.context.On || false,
      };
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
      (this.Lock!.Service = accessory.getService(this.hap.Service.LockMechanism)
        || accessory.addService(this.hap.Service.LockMechanism)), lockService;
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Lock`);

      this.Lock!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.Lock!.Service.getCharacteristic(this.hap.Characteristic.LockTargetState).onSet(this.OnSet.bind(this));
    } else if (this.botDeviceType === 'faucet') {
      // Initialize Switch property
      this.Faucet = {
        Service: accessory.getService(this.hap.Service.Faucet)!,
        On: accessory.context.On || false,
      };
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
      (this.Faucet!.Service = accessory.getService(this.hap.Service.Faucet)
        || accessory.addService(this.hap.Service.Faucet)), faucetService;
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Faucet`);

      this.Faucet!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.Faucet!.Service.getCharacteristic(this.hap.Characteristic.Active).onSet(this.OnSet.bind(this));
    } else if (this.botDeviceType === 'fan') {
      // Initialize Switch property
      this.Fan = {
        Service: accessory.getService(this.hap.Service.Fanv2)!,
        On: accessory.context.On || false,
      };
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
      (this.Fan!.Service = accessory.getService(this.hap.Service.Fanv2)
        || accessory.addService(this.hap.Service.Fanv2)), fanService;
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Fan`);

      this.Fan!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.Fan!.Service.getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this));
    } else if (this.botDeviceType === 'stateful') {
      // Initialize Switch property
      this.StatefulProgrammableSwitch = {
        Service: accessory.getService(this.hap.Service.StatefulProgrammableSwitch)!,
        On: accessory.context.On || false,
      };
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
      (this.StatefulProgrammableSwitch!.Service = accessory.getService(this.hap.Service.StatefulProgrammableSwitch) ||
        accessory.addService(this.hap.Service.StatefulProgrammableSwitch)), statefulProgrammableSwitchService;
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Stateful Programmable Switch`);

      this.StatefulProgrammableSwitch!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.StatefulProgrammableSwitch!.Service
        .getCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState)
        .onSet(this.OnSet.bind(this));
    } else {
      // Initialize Switch property
      this.Outlet = {
        Service: accessory.getService(this.hap.Service.Outlet)!,
        On: accessory.context.On || false,
      };
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
      (this.Outlet!.Service = accessory.getService(this.hap.Service.Outlet)
        || accessory.addService(this.hap.Service.Outlet)), outletService;
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Outlet`);

      this.Outlet!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      this.Outlet!.Service.getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this));
    }

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // batteryService
    const batteryService = `${accessory.displayName} Battery`;
    (this.Battery.Service = this.accessory.getService(this.hap.Service.Battery)
      || accessory.addService(this.hap.Service.Battery)), batteryService;

    this.Battery.Service.setCharacteristic(this.hap.Characteristic.Name, `${accessory.displayName} Battery`);
    this.Battery.Service.setCharacteristic(this.hap.Characteristic.ChargingState, this.hap.Characteristic.ChargingState.NOT_CHARGEABLE);

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.botUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    //regisiter webhook event handler
    if (device.webhook) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} is listening webhook.`);
      this.platform.webhookEventHandler[this.device.deviceId] = async (context) => {
        try {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} received Webhook: ${JSON.stringify(context)}`);
          const { power, battery, deviceMode } = context;
          const { botMode } = this;
          const On = await this.getOn();
          const { BatteryLevel } = this.Battery;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ` +
            '(power, battery, deviceMode) = ' +
            `Webhook:(${power}, ${battery}, ${deviceMode}), ` +
            `current:(${On}, ${BatteryLevel}, ${botMode})`);
          await this.setOn(power);
          this.Battery.BatteryLevel = battery;
          this.botMode = deviceMode;
          this.updateHomeKitCharacteristics();
        } catch (e: any) {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`);
        }
      };
    }

    // Watch for Bot change events
    // We put in a debounce of 1000ms so we don't make duplicate calls
    this.doBotUpdate
      .pipe(
        tap(() => {
          this.botUpdateInProgress = true;
        }),
        debounceTime(this.platform.config.options!.pushRate! * 1000),
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
          this.apiError(e);
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType} Connection,` +
            ` Error Message: ${JSON.stringify(e.message)}`,
          );
        }
        this.botUpdateInProgress = false;
      });
  }

  /**
   * Parse the device status from the SwitchBotBLE API
   */
  async BLEparseStatus(serviceData: serviceData): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);
    // BLEmode (true if Switch Mode) | (false if Press Mode)
    if (serviceData.mode) {
      this.accessory.context.On = await this.getOn();
      if (this.getOn() === undefined) {
        this.setOn(Boolean(serviceData.state));
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Switch Mode,`
        + ` mode: ${serviceData.mode}, On: ${this.accessory.context.On}`);
    } else {
      this.setOn(false);
      this.accessory.context.On = await this.getOn();
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Press Mode,`
        + ` mode: ${serviceData.mode}, On: ${this.accessory.context.On}`);
    }

    this.Battery.BatteryLevel = Number(serviceData.battery);
    if (this.Battery.BatteryLevel < 10) {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    if (Number.isNaN(this.Battery.BatteryLevel)) {
      this.Battery.BatteryLevel = 100;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel},`
      + ` StatusLowBattery: ${this.Battery.StatusLowBattery}`);
  }


  /**
   * Parse the device status from the SwitchBot OpenAPI
   */
  async openAPIparseStatus(deviceStatus: deviceStatus): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
    if (this.botMode === 'press') {
      this.setOn(false);
      this.accessory.context.On = await this.getOn();
    } else {
      this.accessory.context.On = await this.getOn();
      if (this.getOn() === undefined) {
        this.setOn(false);
      }
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.accessory.context.On}`);

    // Battery
    this.Battery.BatteryLevel = Number(deviceStatus.body.battery);
    if (this.Battery.BatteryLevel < 10) {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    if (Number.isNaN(this.Battery.BatteryLevel)) {
      this.Battery.BatteryLevel = 100;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel},`
      + ` StatusLowBattery: ${this.Battery.StatusLowBattery}`);

    // FirmwareRevision
    if (deviceStatus.body.version) {
      this.accessory.context.FirmwareRevision = deviceStatus.body.version;
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.hap.Characteristic.FirmwareRevision, this.accessory.context.FirmwareRevision)
        .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
        .updateValue(this.accessory.context.FirmwareRevision);
    }
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} refreshStatus enableCloudService: ${this.device.enableCloudService}`);
    } else if (this.BLE) {
      await this.BLERefreshStatus();
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIRefreshStatus();
    } else {
      await this.offlineOff();
      this.debugWarnLog(
        `${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` +
        ` ${this.device.connectionType}, refreshStatus will not happen.`,
      );
    }
  }

  async BLERefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLERefreshStatus`);
    const switchbot = await this.platform.connectBLE();
    // Convert to BLE Address
    this.device.bleMac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(':')
      .toLowerCase();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    this.getCustomBLEAddress(switchbot);
    // Start to monitor advertisement packets
    (async () => {
      // Start to monitor advertisement packets
      await switchbot.startScan({ model: this.device.bleModel, id: this.device.bleMac });
      // Set an event handler
      switchbot.onadvertisement = (ad: any) => {
        if (this.device.bleMac === ad.address && ad.model === this.device.bleModel) {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ${JSON.stringify(ad, null, '  ')}`);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} address: ${ad.address}, model: ${ad.model}`);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        } else {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        }
      };
      // Wait 10 seconds
      await switchbot.wait(this.scanDuration * 1000);
      // Stop to monitor
      await switchbot.stopScan();
      // Update HomeKit
      await this.BLEparseStatus(switchbot.onadvertisement.serviceData);
      await this.updateHomeKitCharacteristics();
    })();
    if (switchbot === undefined) {
      await this.BLERefreshConnection(switchbot);
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode } = await this.platform.retryRequest(this.deviceMaxRetries, this.deviceDelayBetweenRetries,
        `${Devices}/${this.device.deviceId}/status`, { headers: this.platform.generateHeaders() });
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
      const deviceStatus: any = await body.json();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
      if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
        this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
        this.openAPIparseStatus(deviceStatus);
        this.updateHomeKitCharacteristics();
      } else {
        this.statusCode(statusCode);
        this.statusCode(deviceStatus.statusCode);
      }
    } catch (e: any) {
      this.apiError(e);
      this.errorLog(
        `${this.device.deviceType}: ${this.accessory.displayName} failed openAPIRefreshStatus with ${this.device.connectionType}` +
        ` Connection, Error Message: ${JSON.stringify(e.message)}`,
      );
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
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} pushChanges enableCloudService: ${this.device.enableCloudService}`);
    } else if (this.BLE) {
      await this.BLEpushChanges();
    } else if (this.OpenAPI) {
      await this.openAPIpushChanges();
    } else {
      await this.offlineOff();
      this.debugWarnLog(
        `${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` + ` ${this.device.connectionType}, pushChanges will not happen.`,
      );
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
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges`);
    const On = await this.getOn();
    if (On !== this.accessory.context.On || this.allowPush) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges On: ${On} OnCached: ${this.accessory.context.On}`);
      const switchbot = await this.platform.connectBLE();
      // Convert to BLE Address
      this.device.bleMac = this.device
        .deviceId!.match(/.{1,2}/g)!
        .join(':')
        .toLowerCase();
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
      //if (switchbot !== false) {
      if (this.botMode === 'press') {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Bot Mode: ${this.botMode}`);
        switchbot
          .discover({ model: 'H', quick: true, id: this.device.bleMac })
          .then(async (device_list: { press: (arg0: { id: string | undefined }) => any }[]) => {
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${On}`);
            return await device_list[0].press({ id: this.device.bleMac });
          })
          .then(() => {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
            this.successLog(`${this.device.deviceType}: ${this.accessory.displayName} `
              + `On: ${On} sent over BLE,  sent successfully`);
            this.accessory.context.On = On;
            setTimeout(() => {
              if (this.botDeviceType === 'switch') {
                this.Switch!.Service.getCharacteristic(this.hap.Characteristic.On).updateValue(On);
              } else {
                this.Outlet!.Service.getCharacteristic(this.hap.Characteristic.On).updateValue(On);
              }
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${On}, Switch Timeout`);
            }, 500);
          })
          .catch(async (e: any) => {
            this.apiError(e);
            this.errorLog(
              `${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}` +
              ` Connection & botMode: ${this.botMode}, Error Message: ${JSON.stringify(e.message)}`,
            );
            await this.BLEPushConnection();
          });
      } else if (this.botMode === 'switch') {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Press Mode: ${this.botMode}`);
        switchbot
          .discover({ model: 'H', quick: true, id: this.device.bleMac })
          .then(async (device_list: any) => {
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${On}`);
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
          .then(() => {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
            this.accessory.context.On = On;
          })
          .catch(async (e: any) => {
            this.apiError(e);
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}`
              + ` Connection & botMode: ${this.botMode}, Error Message: ${JSON.stringify(e.message)}`);
            await this.BLEPushConnection();
          });
      } else {
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Bot Mode: ${this.botMode}`);
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No BLEpushChanges, On: ${On}, OnCached: ${this.accessory.context.On}`);
    }
  }

  async openAPIpushChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);
    let On = await this.getOn();
    if (this.multiPressCount > 0) {
      this.debugLog(`${this.device.deviceType}: ${this.multiPressCount} request(s) queued.`);
      On = true;
    }
    if (On !== this.accessory.context.On || this.allowPush || this.multiPressCount > 0) {
      let command = '';
      if (this.botMode === 'switch' && On) {
        command = 'turnOn';
        On = true;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Switch Mode, Turning ${On}`);
      } else if (this.botMode === 'switch' && !On) {
        command = 'turnOff';
        On = false;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Switch Mode, Turning ${On}`);
      } else if (this.botMode === 'press' || this.botMode === 'multipress') {
        command = 'press';
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Press Mode`);
        On = false;
      } else {
        throw new Error(`${this.device.deviceType}: ${this.accessory.displayName} Device Parameters not set for this Bot.`);
      }
      const bodyChange = JSON.stringify({
        command: `${command}`,
        parameter: 'default',
        commandType: 'command',
      });
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
        const deviceStatus: any = await body.json();
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus body: ${JSON.stringify(deviceStatus.body)}`);
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
          this.successLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `request to SwitchBot API, body: ${JSON.stringify(bodyChange)} sent successfully`);
        } else {
          this.statusCode(statusCode);
          this.statusCode(deviceStatus.statusCode);
        }
        if (this.device.bot?.mode === 'multipress') {
          this.multiPressCount--;
          if (this.multiPressCount > 0) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Multi Press Count: ${this.multiPressCount}`);
            On = true;
            this.openAPIpushChanges();
          }
        }
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIpushChanges with ${this.device.connectionType}`
          + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No openAPIpushChanges,`
        + ` On: ${On}, OnCached: ${this.accessory.context.On}`);
    }
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    if (this.botDeviceType === 'garagedoor') {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set TargetDoorState: ${value}`);
      if (value === this.hap.Characteristic.TargetDoorState.CLOSED) {
        await this.setOn(false);
        this.GarageDoor!.On = false;
      } else {
        await this.setOn(true);
        this.GarageDoor!.On = true;
      }
    } else if (this.botDeviceType === 'door') {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set TargetPosition: ${value}`);
      if (value === 0) {
        await this.setOn(false);
        this.Door!.On = false;
      } else {
        await this.setOn(true);
        this.Door!.On = true;
      }
    } else if (this.botDeviceType === 'window') {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set TargetPosition: ${value}`);
      if (value === 0) {
        await this.setOn(false);
        this.Window!.On = false;
      } else {
        await this.setOn(true);
        this.Window!.On = true;
      }
    } else if (this.botDeviceType === 'windowcovering') {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set TargetPosition: ${value}`);
      if (value === 0) {
        await this.setOn(false);
        this.WindowCovering!.On = false;
      } else {
        await this.setOn(true);
        this.WindowCovering!.On = true;
      }
    } else if (this.botDeviceType === 'lock') {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set LockTargetState: ${value}`);
      if (value === this.hap.Characteristic.LockTargetState.SECURED) {
        await this.setOn(false);
        this.Lock!.On = false;
      } else {
        await this.setOn(true);
        this.Lock!.On = true;
      }
    } else if (this.botDeviceType === 'faucet') {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Active: ${value}`);
      if (value === this.hap.Characteristic.Active.INACTIVE) {
        await this.setOn(false);
        this.Faucet!.On = false;
      } else {
        await this.setOn(true);
        this.Faucet!.On = true;
      }
    } else if (this.botDeviceType === 'stateful') {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set ProgrammableSwitchOutputState: ${value}`);
      if (value === 0) {
        await this.setOn(false);
        this.StatefulProgrammableSwitch!.On = false;
      } else {
        await this.setOn(true);
        this.StatefulProgrammableSwitch!.On = true;
      }
    } else if (this.botDeviceType === 'switch') {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set ProgrammableSwitchOutputState: ${value}`);
      if (value === 0) {
        await this.setOn(false);
        this.Switch!.On = false;
      } else {
        await this.setOn(true);
        this.Switch!.On = true;
      }
    } else {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set On: ${value}`);
      await this.setOn(Boolean(value));
      this.Outlet!.On = value;
    }
    if (this.device.bot?.mode === 'multipress') {
      if (value === true) {
        this.multiPressCount++;
        this.debugLog(`${this.device.deviceType} set to Multi-Press. Multi-Press count: ${this.multiPressCount}`);
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
      if (this.GarageDoor!.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.GarageDoor!.On}`);
      } else {
        if (this.GarageDoor!.On) {
          this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, this.hap.Characteristic.TargetDoorState.OPEN);
          this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, this.hap.Characteristic.CurrentDoorState.OPEN);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
            + ` TargetDoorState: Open, CurrentDoorState: Open (${this.GarageDoor!.On})`);
        } else {
          this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, this.hap.Characteristic.TargetDoorState.CLOSED);
          this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, this.hap.Characteristic.CurrentDoorState.CLOSED);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristicc`
            + ` TargetDoorState: Open, CurrentDoorState: Open (${this.GarageDoor!.On})`);
        }
      }
      await this.setOn(Boolean(this.GarageDoor!.On));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Garage Door On: ${this.GarageDoor!.On}`);
    } else if (this.botDeviceType === 'door') {
      if (this.Door!.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.Door!.On}`);
      } else {
        if (this.Door!.On) {
          this.Door!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
          this.Door!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
          this.Door!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristicc`
            + ` TargetPosition: 100, CurrentPosition: 100 (${this.Door!.On})`);
        } else {
          this.Door!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.Door!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.Door!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristicc`
            + ` TargetPosition: 0, CurrentPosition: 0 (${this.Door!.On})`);
        }
      }
      await this.setOn(Boolean(this.Door!.On));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Door On: ${this.Door!.On}`);
    } else if (this.botDeviceType === 'window') {
      if (this.Window!.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.Window!.On}`);
      } else {
        if (this.Window!.On) {
          this.Window!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
          this.Window!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
          this.Window!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristicc`
            + ` TargetPosition: 100, CurrentPosition: 100 (${this.Window!.On})`);
        } else {
          this.Window!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.Window!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.Window!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristicc`
            + ` TargetPosition: 0, CurrentPosition: 0 (${this.Window!.On})`);
        }
      }
      await this.setOn(Boolean(this.Window!.On));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Window On: ${this.Window!.On}`);
    } else if (this.botDeviceType === 'windowcovering') {
      if (this.WindowCovering!.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.WindowCovering!.On}`);
      } else {
        if (this.WindowCovering!.On) {
          this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
          this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
          this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristicc`
            + ` TargetPosition: 100, CurrentPosition: 100 (${this.WindowCovering!.On})`);
        } else {
          this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristicc`
            + ` TargetPosition: 0, CurrentPosition: 0 (${this.WindowCovering!.On})`);
        }
      }
      await this.setOn(Boolean(this.WindowCovering!.On));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Window Covering On: ${this.WindowCovering!.On}`);
    } else if (this.botDeviceType === 'lock') {
      if (this.Lock!.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.Lock!.On}`);
      } else {
        if (this.Lock!.On) {
          this.Lock!.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState, this.hap.Characteristic.LockTargetState.UNSECURED);
          this.Lock!.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState, this.hap.Characteristic.LockCurrentState.UNSECURED);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristicc`
            + ` LockTargetState: UNSECURED, LockCurrentState: UNSECURED (${this.Lock!.On})`);
        } else {
          this.Lock!.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState, this.hap.Characteristic.LockTargetState.SECURED);
          this.Lock!.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState, this.hap.Characteristic.LockCurrentState.SECURED);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
            + ` LockTargetState: SECURED, LockCurrentState: SECURED  (${this.Lock!.On})`);
        }
      }
      await this.setOn(Boolean(this.Lock!.On));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Lock On: ${this.Lock!.On}`);
    } else if (this.botDeviceType === 'faucet') {
      if (this.Faucet!.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.Faucet!.On}`);
      } else {
        if (this.Faucet!.On) {
          this.Faucet!.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.ACTIVE);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.Faucet!.On}`);
        } else {
          this.Faucet!.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.INACTIVE);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.Faucet!.On}`);
        }
      }
      await this.setOn(Boolean(this.Faucet!.On));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Faucet On: ${this.Faucet!.On}`);
    } else if (this.botDeviceType === 'fan') {
      if (this.Fan!.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.Fan!.On}`);
      } else {
        if (this.Fan!.On) {
          this.Fan!.Service.updateCharacteristic(this.hap.Characteristic.On, this.Fan!.On);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic On: ${this.Fan!.On}`);
        } else {
          this.Fan!.Service.updateCharacteristic(this.hap.Characteristic.On, this.Fan!.On);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic On: ${this.Fan!.On}`);
        }
      }
      await this.setOn(Boolean(this.Fan!.On));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Fan On: ${this.Fan!.On}`);
    } else if (this.botDeviceType === 'stateful') {
      if (this.StatefulProgrammableSwitch!.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.StatefulProgrammableSwitch!.On}`);
      } else {
        if (this.StatefulProgrammableSwitch!.On) {
          this.StatefulProgrammableSwitch!.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent,
            this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
          this.StatefulProgrammableSwitch!.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, 1);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
            + ` ProgrammableSwitchEvent: SINGLE, ProgrammableSwitchOutputState: 1 (${this.StatefulProgrammableSwitch!.On})`);
        } else {
          this.StatefulProgrammableSwitch!.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent,
            this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
          this.StatefulProgrammableSwitch!.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, 0);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
            + ` ProgrammableSwitchEvent: SINGLE, ProgrammableSwitchOutputState: 0 (${this.StatefulProgrammableSwitch!.On})`);
        }
      }
      await this.setOn(Boolean(this.StatefulProgrammableSwitch!.On));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatefulProgrammableSwitch On: ${this.StatefulProgrammableSwitch!.On}`);
    } else if (this.botDeviceType === 'switch') {
      if (this.Switch!.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.Switch!.On}`);
      } else {
        this.Switch!.Service.updateCharacteristic(this.hap.Characteristic.On, this.Switch!.On);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic On: ${this.Switch!.On}`);
        await this.setOn(Boolean(this.Switch!.On));
      }
    } else {
      if (this.Outlet!.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.Outlet!.On}`);
      } else {
        this.Outlet!.Service.updateCharacteristic(this.hap.Characteristic.On, this.Outlet!.On);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic On: ${this.Outlet!.On}`);
      }
    }
    await this.setOn(Boolean(this.Outlet!.On));
    this.accessory.context.On = await this.getOn();
    // BatteryLevel
    if (this.Battery.BatteryLevel === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel}`);
    } else {
      this.accessory.context.BatteryLevel = this.Battery.BatteryLevel;
      this.Battery!.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, this.Battery.BatteryLevel);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.Battery.BatteryLevel}`);
    }
    // StatusLowBattery
    if (this.Battery.StatusLowBattery === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatusLowBattery: ${this.Battery.StatusLowBattery}`);
    } else {
      this.accessory.context.StatusLowBattery = this.Battery.StatusLowBattery;
      this.Battery!.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, this.Battery.StatusLowBattery);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` StatusLowBattery: ${this.Battery.StatusLowBattery}`);
    }
  }

  async removeOutletService(accessory: PlatformAccessory): Promise<void> {
    // If outletService still present, then remove first
    if (this.Outlet?.Service) {
      this.Outlet!.Service = this.accessory.getService(this.hap.Service.Outlet) as Service;
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Outlet Service`);
      accessory.removeService(this.Outlet!.Service);
    }
  }

  async removeGarageDoorService(accessory: PlatformAccessory): Promise<void> {
    // If garageDoorService still present, then remove first
    if (this.GarageDoor?.Service) {
      this.GarageDoor!.Service = this.accessory.getService(this.hap.Service.GarageDoorOpener) as Service;
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Garage Door Service`);
      accessory.removeService(this.GarageDoor!.Service);
    }
  }

  async removeDoorService(accessory: PlatformAccessory): Promise<void> {
    // If doorService still present, then remove first
    if (this.Door?.Service) {
      this.Door!.Service = this.accessory.getService(this.hap.Service.Door) as Service;
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Door Service`);
      accessory.removeService(this.Door!.Service);
    }
  }

  async removeLockService(accessory: PlatformAccessory): Promise<void> {
    // If lockService still present, then remove first
    if (this.Lock?.Service) {
      this.Lock!.Service = this.accessory.getService(this.hap.Service.LockMechanism) as Service;
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Lock Service`);
      accessory.removeService(this.Lock!.Service);
    }
  }

  async removeFaucetService(accessory: PlatformAccessory): Promise<void> {
    // If faucetService still present, then remove first
    if (this.Faucet?.Service) {
      this.Faucet!.Service = this.accessory.getService(this.hap.Service.Faucet) as Service;
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Faucet Service`);
      accessory.removeService(this.Faucet!.Service);
    }
  }

  async removeFanService(accessory: PlatformAccessory): Promise<void> {
    // If fanService still present, then remove first
    if (this.Fan?.Service) {
      this.Fan!.Service = this.accessory.getService(this.hap.Service.Fanv2) as Service;
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Fan Service`);
      accessory.removeService(this.Fan!.Service);
    }
  }

  async removeWindowService(accessory: PlatformAccessory): Promise<void> {
    // If windowService still present, then remove first
    if (this.Window?.Service) {
      this.Window!.Service = this.accessory.getService(this.hap.Service.Window) as Service;
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Window Service`);
      accessory.removeService(this.Window!.Service);
    }
  }

  async removeWindowCoveringService(accessory: PlatformAccessory): Promise<void> {
    // If windowCoveringService still present, then remove first
    if (this.WindowCovering?.Service) {
      this.WindowCovering!.Service = this.accessory.getService(this.hap.Service.WindowCovering) as Service;
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Window Covering Service`);
      accessory.removeService(this.WindowCovering!.Service);
    }
  }

  async removeStatefulProgrammableSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If statefulProgrammableSwitchService still present, then remove first
    if (this.StatefulProgrammableSwitch?.Service) {
      this.StatefulProgrammableSwitch!.Service = this.accessory.getService(this.hap.Service.StatefulProgrammableSwitch) as Service;
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Stateful Programmable Switch Service`);
      accessory.removeService(this.StatefulProgrammableSwitch!.Service);
    }
  }

  async removeSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If switchService still present, then remove first
    if (this.Switch?.Service) {
      this.Switch!.Service = this.accessory.getService(this.hap.Service.Switch) as Service;
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Switch Service`);
      accessory.removeService(this.Switch!.Service);
    }
  }

  async getOn(): Promise<boolean> {
    let On: boolean;
    if (this.botDeviceType === 'garagedoor') {
      On = this.GarageDoor!.On ? true : false;
    } else if (this.botDeviceType === 'door') {
      On = this.Door!.On ? true : false;
    } else if (this.botDeviceType === 'window') {
      On = this.Window!.On ? true : false;
    } else if (this.botDeviceType === 'windowcovering') {
      On = this.WindowCovering!.On ? true : false;
    } else if (this.botDeviceType === 'lock') {
      On = this.Lock!.On ? true : false;
    } else if (this.botDeviceType === 'faucet') {
      On = this.Faucet!.On ? true : false;
    } else if (this.botDeviceType === 'fan') {
      On = this.Fan!.On ? true : false;
    } else if (this.botDeviceType === 'stateful') {
      On = this.StatefulProgrammableSwitch!.On ? true : false;
    } else if (this.botDeviceType === 'switch') {
      On = this.Switch!.On ? true : false;
    } else {
      On = this.Outlet!.On ? true : false;
    }
    return On;
  }

  async setOn(On: boolean): Promise<void> {
    if (this.botDeviceType === 'garagedoor') {
      this.GarageDoor!.On = On;
    } else if (this.botDeviceType === 'door') {
      this.Door!.On = On;
    } else if (this.botDeviceType === 'window') {
      this.Window!.On = On;
    } else if (this.botDeviceType === 'windowcovering') {
      this.WindowCovering!.On = On;
    } else if (this.botDeviceType === 'lock') {
      this.Lock!.On = On;
    } else if (this.botDeviceType === 'faucet') {
      this.Faucet!.On = On;
    } else if (this.botDeviceType === 'fan') {
      this.Fan!.On = On;
    } else if (this.botDeviceType === 'stateful') {
      this.StatefulProgrammableSwitch!.On = On;
    } else if (this.botDeviceType === 'switch') {
      this.Switch!.On = On;
    } else {
      this.Outlet!.On = On;
    }
  }

  async getBotConfigSettings(device: device & devicesConfig) {
    //Bot Device Type
    if (!device.bot?.deviceType && this.accessory.context.deviceType) {
      this.botDeviceType = this.accessory.context.deviceType;
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Type: ${this.botDeviceType}, from Accessory Cache.`);
    } else if (device.bot?.deviceType) {
      this.accessory.context.deviceType = device.bot.deviceType;
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Accessory Cache: ${this.accessory.context.deviceType}`);
      this.botDeviceType = this.accessory.context.deviceType;
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Type: ${this.botDeviceType}`);
    } else {
      this.botDeviceType = 'outlet';
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} No Device Type Set, deviceType: ${this.device.bot?.deviceType}`);
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using default deviceType: ${this.botDeviceType}`);
    }
    // Bot Mode
    if (!device.bot?.mode) {
      this.botMode = 'switch';
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} does not have bot mode set in the Plugin's SwitchBot Device Settings,`);
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} is defaulting to "${this.botMode}" mode, you may experience issues.`);
    } else if (device.bot?.mode === 'switch') {
      this.botMode = 'switch';
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Bot Mode: ${this.botMode}`);
    } else if (device.bot?.mode === 'press') {
      this.botMode = 'press';
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Bot Mode: ${this.botMode}`);
    } else if (device.bot?.mode === 'multipress') {
      this.botMode = 'multipress';
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Bot Mode: ${this.botMode}`);
    } else {
      throw new Error(`${this.device.deviceType}: ${this.accessory.displayName} Bot Mode: ${this.botMode}`);
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
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config Bot pushRatePress: ${this.pushRatePress}`);
    } else {
      this.pushRatePress = 15;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Default Bot pushRatePress: ${this.pushRatePress}`);
    }

    // Bot Allow Push
    if (device.bot?.allowPush) {
      this.allowPush = true;
    } else {
      this.allowPush = false;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Allowing Push Changes: ${this.allowPush}`);
    // Bot Multi Press Count
    this.multiPressCount = 0;
  }

  async BLEPushConnection() {
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Push Changes`);
      await this.openAPIpushChanges();
    }
  }

  async BLERefreshConnection(switchbot: any): Promise<void> {
    this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot:`
      + ` ${JSON.stringify(switchbot)}`);
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Refresh Status`);
      await this.openAPIRefreshStatus();
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      if (this.botDeviceType === 'garagedoor') {
        this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, this.hap.Characteristic.TargetDoorState.CLOSED);
        this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, this.hap.Characteristic.CurrentDoorState.CLOSED);
        this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.ObstructionDetected, false);
      } else if (this.botDeviceType === 'door') {
        this.Door!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
        this.Door!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
        this.Door!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
      } else if (this.botDeviceType === 'window') {
        this.Window!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
        this.Window!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
        this.Window!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
      } else if (this.botDeviceType === 'windowcovering') {
        this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
        this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
        this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
      } else if (this.botDeviceType === 'lock') {
        this.Door!.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState, this.hap.Characteristic.LockTargetState.SECURED);
        this.Door!.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState, this.hap.Characteristic.LockCurrentState.SECURED);
      } else if (this.botDeviceType === 'faucet') {
        this.Faucet!.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.INACTIVE);
      } else if (this.botDeviceType === 'fan') {
        this.Fan!.Service.updateCharacteristic(this.hap.Characteristic.On, false);
      } else if (this.botDeviceType === 'stateful') {
        this.StatefulProgrammableSwitch!.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent,
          this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
        this.StatefulProgrammableSwitch!.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, 0);
      } else if (this.botDeviceType === 'switch') {
        this.Switch!.Service.updateCharacteristic(this.hap.Characteristic.On, false);
      } else {
        this.Outlet!.Service.updateCharacteristic(this.hap.Characteristic.On, false);
      }
    }
  }

  async apiError(e: any): Promise<void> {
    if (this.botDeviceType === 'garagedoor') {
      this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.TargetDoorState, e);
      this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, e);
      this.GarageDoor!.Service.updateCharacteristic(this.hap.Characteristic.ObstructionDetected, e);
    } else if (this.botDeviceType === 'door') {
      this.Door!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
      this.Door!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
      this.Door!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e);
    } else if (this.botDeviceType === 'window') {
      this.Window!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
      this.Window!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
      this.Window!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e);
    } else if (this.botDeviceType === 'windowcovering') {
      this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
      this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
      this.WindowCovering!.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e);
    } else if (this.botDeviceType === 'lock') {
      this.Door!.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState, e);
      this.Door!.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState, e);
    } else if (this.botDeviceType === 'faucet') {
      this.Faucet!.Service.updateCharacteristic(this.hap.Characteristic.Active, e);
    } else if (this.botDeviceType === 'fan') {
      this.Fan!.Service.updateCharacteristic(this.hap.Characteristic.On, e);
    } else if (this.botDeviceType === 'stateful') {
      this.StatefulProgrammableSwitch!.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent, e);
      this.StatefulProgrammableSwitch!.Service.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, e);
    } else if (this.botDeviceType === 'switch') {
      this.Switch!.Service.updateCharacteristic(this.hap.Characteristic.On, e);
    } else {
      this.Outlet!.Service.updateCharacteristic(this.hap.Characteristic.On, e);
    }
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e);
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e);
  }
}
