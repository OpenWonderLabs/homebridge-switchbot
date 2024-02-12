import { request } from 'undici';
import { sleep } from '../utils.js';
import { interval, Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform.js';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue, API, Logging, HAP } from 'homebridge';
import { device, devicesConfig, deviceStatus, serviceData, Devices, SwitchBotPlatformConfig } from '../settings.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Bot {
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
  batteryService: Service;
  garageDoorService?: Service;
  windowCoveringService?: Service;
  statefulProgrammableSwitchService?: Service;

  // Characteristic Values
  On!: CharacteristicValue;
  BatteryLevel!: CharacteristicValue;
  FirmwareRevision!: CharacteristicValue;
  StatusLowBattery!: CharacteristicValue;

  // OpenAPI Status
  OpenAPI_On: deviceStatus['power'];
  OpenAPI_BatteryLevel: deviceStatus['battery'];
  OpenAPI_FirmwareRevision: deviceStatus['version'];

  // BLE Status
  BLE_On!: serviceData['state'];
  BLE_Mode!: serviceData['mode'];
  BLE_BatteryLevel!: serviceData['battery'];

  //BLE Others
  BLE_IsConnected?: boolean;

  // Config
  botMode!: string;
  allowPush?: boolean;
  doublePress!: number;
  scanDuration!: number;
  botDeviceType!: string;
  pushRatePress!: number;
  deviceLogging!: string;
  multiPressCount!: number;
  deviceRefreshRate!: number;

  // Updates
  botUpdateInProgress!: boolean;
  doBotUpdate!: Subject<void>;

  // Connection
  private readonly OpenAPI: boolean;
  private readonly BLE: boolean;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device & devicesConfig,
  ) {
    this.api = this.platform.api;
    this.log = this.platform.log;
    this.config = this.platform.config;
    this.hap = this.api.hap;
    // Connection
    this.BLE = this.device.connectionType === 'BLE' || this.device.connectionType === 'BLE/OpenAPI';
    this.OpenAPI = this.device.connectionType === 'OpenAPI' || this.device.connectionType === 'BLE/OpenAPI';
    // default placeholders
    this.deviceLogs(device);
    this.deviceType(device);
    this.scan(device);
    this.refreshRate(device);
    this.PressOrSwitch(device);
    this.allowPushChanges(device);
    this.deviceContext();
    this.DoublePress(device);
    this.deviceConfig(device);

    this.multiPressCount = 0;

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doBotUpdate = new Subject();
    this.botUpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.hap.Characteristic.Model, 'SWITCHBOT-BOT-S1')
      .setCharacteristic(this.hap.Characteristic.SerialNumber, device.deviceId)
      .setCharacteristic(this.hap.Characteristic.FirmwareRevision, accessory.context.FirmwareRevision);

    // deviceType
    if (this.botDeviceType === 'switch') {
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
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Switch`);

      this.switchService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      if (!this.switchService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.switchService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.switchService.getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this));
    } else if (this.botDeviceType === 'garagedoor') {
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
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Garage Door Opener`);

      this.garageDoorService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      if (!this.garageDoorService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.garageDoorService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.garageDoorService.getCharacteristic(this.hap.Characteristic.TargetDoorState).onSet(this.OnSet.bind(this));
      this.garageDoorService.setCharacteristic(this.hap.Characteristic.ObstructionDetected, false);
    } else if (this.botDeviceType === 'door') {
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
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Door`);

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
    } else if (this.botDeviceType === 'window') {
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
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Window`);

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
    } else if (this.botDeviceType === 'windowcovering') {
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
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Window Covering`);

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
    } else if (this.botDeviceType === 'lock') {
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
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Lock`);

      this.lockService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      if (!this.lockService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.lockService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.lockService.getCharacteristic(this.hap.Characteristic.LockTargetState).onSet(this.OnSet.bind(this));
    } else if (this.botDeviceType === 'faucet') {
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
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Faucet`);

      this.faucetService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      if (!this.faucetService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.faucetService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.faucetService.getCharacteristic(this.hap.Characteristic.Active).onSet(this.OnSet.bind(this));
    } else if (this.botDeviceType === 'fan') {
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
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Fan`);

      this.fanService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      if (!this.fanService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.fanService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.fanService.getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this));
    } else if (this.botDeviceType === 'stateful') {
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
      (this.statefulProgrammableSwitchService = accessory.getService(this.hap.Service.StatefulProgrammableSwitch) ||
        accessory.addService(this.hap.Service.StatefulProgrammableSwitch)), statefulProgrammableSwitchService;
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Stateful Programmable Switch`);

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
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Outlet`);

      this.outletService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
      if (!this.outletService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.outletService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
      }
      this.outletService.getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this));
    }

    // batteryService
    const batteryService = `${accessory.displayName} Battery`;
    (this.batteryService = this.accessory.getService(this.hap.Service.Battery)
      || accessory.addService(this.hap.Service.Battery)), batteryService;

    this.batteryService.setCharacteristic(this.hap.Characteristic.Name, `${accessory.displayName} Battery`);
    if (!this.batteryService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
      this.batteryService.addCharacteristic(this.hap.Characteristic.ConfiguredName, `${accessory.displayName} Battery`);
    }
    this.batteryService.setCharacteristic(this.hap.Characteristic.ChargingState, this.hap.Characteristic.ChargingState.NOT_CHARGEABLE);

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.botUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    //regisiter webhook event handler
    if (this.device.webhook) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} is listening webhook.`);
      this.platform.webhookEventHandler[this.device.deviceId] = async (context) => {
        try {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} received Webhook: ${JSON.stringify(context)}`);
          const { power, battery, deviceMode } = context;
          const { On, BatteryLevel, botMode } = this;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ` +
            '(power, battery, deviceMode) = ' +
            `Webhook:(${power}, ${battery}, ${deviceMode}), ` +
            `current:(${On}, ${BatteryLevel}, ${botMode})`);
          this.On = power;
          this.BatteryLevel = battery;
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
   * Parse the device status from the SwitchBot api
   */
  async parseStatus(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} parseStatus enableCloudService: ${this.device.enableCloudService}`);
    } else if (this.BLE) {
      await this.BLEparseStatus();
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIparseStatus();
    } else {
      await this.offlineOff();
      this.debugWarnLog(
        `${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` + ` ${this.device.connectionType}, parseStatus will not happen.`,
      );
    }
  }

  async BLEparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);
    // BLEmode (true if Switch Mode) | (false if Press Mode)
    if (this.BLE_Mode) {
      this.accessory.context.On = this.On;
      if (this.On === undefined) {
        this.On = Boolean(this.BLE_On);
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Switch Mode, mode: ${this.BLE_Mode}, On: ${this.On}`);
    } else {
      this.On = false;
      this.accessory.context.On = this.On;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Press Mode, mode: ${this.BLE_Mode}, On: ${this.On}`);
    }

    this.BatteryLevel = Number(this.BLE_BatteryLevel);
    if (this.BatteryLevel < 10) {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    if (Number.isNaN(this.BatteryLevel)) {
      this.BatteryLevel = 100;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel},`
      + ` StatusLowBattery: ${this.StatusLowBattery}`);
  }

  async openAPIparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
    if (this.botMode === 'press') {
      this.On = false;
      this.accessory.context.On = this.On;
    } else {
      this.accessory.context.On = this.On;
      if (this.On === undefined) {
        this.On = false;
      }
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);

    // Battery
    this.BatteryLevel = Number(this.OpenAPI_BatteryLevel);
    if (this.BatteryLevel < 10) {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    if (Number.isNaN(this.BatteryLevel)) {
      this.BatteryLevel = 100;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel},`
      + ` StatusLowBattery: ${this.StatusLowBattery}`);

    // FirmwareRevision
    this.FirmwareRevision = this.OpenAPI_FirmwareRevision!;
    this.accessory.context.FirmwareRevision = this.FirmwareRevision;
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
      await switchbot.startScan({
        model: 'H',
        id: this.device.bleMac,
      });
      // Set an event handler
      switchbot.onadvertisement = (ad: any) => {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ${JSON.stringify(ad, null, '  ')}`);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} address: ${ad.address}, model: ${ad.model}`);
        if (this.device.bleMac === ad.address && ad.model === 'H') {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
          this.BLE_Mode = ad.serviceData.mode;
          this.BLE_On = ad.serviceData.state;
          this.BLE_BatteryLevel = ad.serviceData.battery;
        } else {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        }
      };
      // Wait 1 seconds
      await switchbot.wait(this.scanDuration * 1000);
      // Stop to monitor
      await switchbot.stopScan();
      // Update HomeKit
      await this.BLEparseStatus();
      await this.updateHomeKitCharacteristics();
    })();
    /*if (switchbot !== false) {
      switchbot
        .startScan({
          model: 'H',
          id: this.device.bleMac,
        })
        .then(async () => {
          // Set an event handler
          switchbot.onadvertisement = async (ad: ad) => {
            this.debugLog(
              `${this.device.deviceType}: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac},` +
              ` BLE Address Found: ${ad.address}`,
            );
            this.BLE_Mode = ad.serviceData.mode;
            this.BLE_On = ad.serviceData.state;
            this.BLE_BatteryLevel = ad.serviceData.battery;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
            this.debugLog(
              `${this.device.deviceType}: ${this.accessory.displayName}, model: ${ad.serviceData.model}, modelName: ` +
              `${ad.serviceData.modelName}, mode: ${ad.serviceData.mode}, state: ${ad.serviceData.state}, battery: ${ad.serviceData.battery}`,
            );

            if (ad.serviceData) {
              this.BLE_IsConnected = true;
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.BLE_IsConnected}`);
              await this.stopScanning(switchbot);
            } else {
              this.BLE_IsConnected = false;
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.BLE_IsConnected}`);
            }
          };
          // Wait
          return await sleep(this.scanDuration * 1000);
        })
        .then(async () => {
          // Stop to monitor
          await this.stopScanning(switchbot);
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed BLERefreshStatus with ${this.device.connectionType}` +
            ` Connection, Error Message: ${JSON.stringify(e.message)}`,
          );
          await this.BLERefreshConnection(switchbot);
        });
    } else {
      await this.BLERefreshConnection(switchbot);
    }*/
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode } = await request(`${Devices}/${this.device.deviceId}/status`, {
        headers: this.platform.generateHeaders(),
      });
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
      const deviceStatus: any = await body.json();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
      if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
        this.debugErrorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
        this.OpenAPI_On = deviceStatus.body.power;
        this.OpenAPI_BatteryLevel = deviceStatus.body.battery;
        this.OpenAPI_FirmwareRevision = deviceStatus.body.version;
        this.openAPIparseStatus();
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
    if (this.On !== this.accessory.context.On || this.allowPush) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges On: ${this.On} OnCached: ${this.accessory.context.On}`);
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
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
            return await device_list[0].press({ id: this.device.bleMac });
          })
          .then(() => {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
            this.accessory.context.On = this.On;
            setTimeout(() => {
              if (this.botDeviceType === 'switch') {
                this.switchService?.getCharacteristic(this.hap.Characteristic.On).updateValue(this.On);
              } else {
                this.outletService?.getCharacteristic(this.hap.Characteristic.On).updateValue(this.On);
              }
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}, Switch Timeout`);
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
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
            return await this.retry({
              max: this.maxRetry(),
              fn: async () => {
                if (this.On) {
                  return await device_list[0].turnOn({ id: this.device.bleMac });
                } else {
                  return await device_list[0].turnOff({ id: this.device.bleMac });
                }
              },
            });
          })
          .then(() => {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
            this.accessory.context.On = this.On;
          })
          .catch(async (e: any) => {
            this.apiError(e);
            this.errorLog(
              `${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}` +
              ` Connection & botMode: ${this.botMode}, Error Message: ${JSON.stringify(e.message)}`,
            );
            await this.BLEPushConnection();
          });
      } else {
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Bot Mode: ${this.botMode}`);
      }
    } else {
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} No BLEpushChanges.` + `On: ${this.On}, ` + `OnCached: ${this.accessory.context.On}`,
      );
    }
  }

  async openAPIpushChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);
    if (this.multiPressCount > 0) {
      this.debugLog(`${this.device.deviceType}: ${this.multiPressCount} request(s) queued.`);
      this.On = true;
    }
    if (this.On !== this.accessory.context.On || this.allowPush || this.multiPressCount > 0) {
      let command = '';
      if (this.botMode === 'switch' && this.On) {
        command = 'turnOn';
        this.On = true;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Switch Mode, Turning ${this.On}`);
      } else if (this.botMode === 'switch' && !this.On) {
        command = 'turnOff';
        this.On = false;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Switch Mode, Turning ${this.On}`);
      } else if (this.botMode === 'press' || this.botMode === 'multipress') {
        command = 'press';
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Press Mode`);
        this.On = false;
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
          this.debugErrorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
        } else {
          this.statusCode(statusCode);
          this.statusCode(deviceStatus.statusCode);
        }
        if (this.device.bot?.mode === 'multipress') {
          this.multiPressCount--;
          if (this.multiPressCount > 0) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Multi Press Count: ${this.multiPressCount}`);
            this.On = true;
            this.openAPIpushChanges();
          }
        }
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} failed openAPIpushChanges with ${this.device.connectionType}` +
          ` Connection, Error Message: ${JSON.stringify(e.message)}`,
        );
      }
    } else {
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} No openAPIpushChanges.` +
        `On: ${this.On}, ` +
        `OnCached: ${this.accessory.context.On}`,
      );
    }
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    if (this.botDeviceType === 'garagedoor') {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set TargetDoorState: ${value}`);
      if (value === this.hap.Characteristic.TargetDoorState.CLOSED) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else if (
      this.botDeviceType === 'door' ||
      this.botDeviceType === 'window' ||
      this.botDeviceType === 'windowcovering'
    ) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set TargetPosition: ${value}`);
      if (value === 0) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else if (this.botDeviceType === 'lock') {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set LockTargetState: ${value}`);
      if (value === this.hap.Characteristic.LockTargetState.SECURED) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else if (this.botDeviceType === 'faucet') {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Active: ${value}`);
      if (value === this.hap.Characteristic.Active.INACTIVE) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else if (this.botDeviceType === 'stateful') {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set ProgrammableSwitchOutputState: ${value}`);
      if (value === 0) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set On: ${value}`);
      if (this.device.bot?.mode === 'multipress') {
        if (value === true) {
          this.multiPressCount++;
          this.debugLog(`${this.device.deviceType} set to Multi-Press. Multi-Press count: ${this.multiPressCount}`);
        }
      }
      this.On = value;
    }
    this.doBotUpdate.next();
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    // State
    if (this.botDeviceType === 'garagedoor') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
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
            `${this.device.deviceType}: ` + `${this.accessory.displayName} updateCharacteristic TargetDoorState: Open, CurrentDoorState: Open`,
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
            `${this.device.deviceType}: ` + `${this.accessory.displayName} updateCharacteristic TargetDoorState: Open, CurrentDoorState: Open`,
          );
        }
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Garage Door On: ${this.On}`);
    } else if (this.botDeviceType === 'door') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.doorService?.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
          this.doorService?.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
          this.doorService?.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 100, CurrentPosition: 100`);
        } else {
          this.doorService?.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.doorService?.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.doorService?.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 0, CurrentPosition: 0`);
        }
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Door On: ${this.On}`);
    } else if (this.botDeviceType === 'window') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.windowService?.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
          this.windowService?.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
          this.windowService?.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 100, CurrentPosition: 100`);
        } else {
          this.windowService?.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.windowService?.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.windowService?.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 0, CurrentPosition: 0`);
        }
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Window On: ${this.On}`);
    } else if (this.botDeviceType === 'windowcovering') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.windowCoveringService?.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
          this.windowCoveringService?.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
          this.windowCoveringService?.updateCharacteristic(
            this.hap.Characteristic.PositionState,
            this.hap.Characteristic.PositionState.STOPPED,
          );
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 100, CurrentPosition: 100`);
        } else {
          this.windowCoveringService?.updateCharacteristic(this.hap.Characteristic.TargetPosition, 0);
          this.windowCoveringService?.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 0);
          this.windowCoveringService?.updateCharacteristic(
            this.hap.Characteristic.PositionState,
            this.hap.Characteristic.PositionState.STOPPED,
          );
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 0, CurrentPosition: 0`);
        }
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Window Covering On: ${this.On}`);
    } else if (this.botDeviceType === 'lock') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
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
            `${this.device.deviceType}: ` +
            `${this.accessory.displayName} updateCharacteristic LockTargetState: UNSECURED, LockCurrentState: UNSECURED`,
          );
        } else {
          this.lockService?.updateCharacteristic(this.hap.Characteristic.LockTargetState, this.hap.Characteristic.LockTargetState.SECURED);
          this.lockService?.updateCharacteristic(
            this.hap.Characteristic.LockCurrentState,
            this.hap.Characteristic.LockCurrentState.SECURED,
          );
          this.debugLog(
            `${this.device.deviceType}: ` + `${this.accessory.displayName} updateCharacteristic LockTargetState: SECURED, LockCurrentState: SECURED`,
          );
        }
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Lock On: ${this.On}`);
    } else if (this.botDeviceType === 'faucet') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.faucetService?.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.ACTIVE);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.On}`);
        } else {
          this.faucetService?.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.INACTIVE);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.On}`);
        }
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Faucet On: ${this.On}`);
    } else if (this.botDeviceType === 'fan') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.fanService?.updateCharacteristic(this.hap.Characteristic.On, this.On);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
        } else {
          this.fanService?.updateCharacteristic(this.hap.Characteristic.On, this.On);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
        }
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Fan On: ${this.On}`);
    } else if (this.botDeviceType === 'stateful') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.statefulProgrammableSwitchService?.updateCharacteristic(
            this.hap.Characteristic.ProgrammableSwitchEvent,
            this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
          );
          this.statefulProgrammableSwitchService?.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, 1);
          this.debugLog(
            `${this.device.deviceType}: ` +
            `${this.accessory.displayName} updateCharacteristic ProgrammableSwitchEvent: SINGLE, ProgrammableSwitchOutputState: 1`,
          );
        } else {
          this.statefulProgrammableSwitchService?.updateCharacteristic(
            this.hap.Characteristic.ProgrammableSwitchEvent,
            this.hap.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
          );
          this.statefulProgrammableSwitchService?.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, 0);
          this.debugLog(
            `${this.device.deviceType}: ` +
            `${this.accessory.displayName} updateCharacteristic ProgrammableSwitchEvent: SINGLE, ProgrammableSwitchOutputState: 0`,
          );
        }
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatefulProgrammableSwitch On: ${this.On}`);
    } else if (this.botDeviceType === 'switch') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        this.switchService?.updateCharacteristic(this.hap.Characteristic.On, this.On);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
      }
    } else {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        this.outletService?.updateCharacteristic(this.hap.Characteristic.On, this.On);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
      }
    }
    this.accessory.context.On = this.On;
    // BatteryLevel
    if (this.BatteryLevel === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
    } else {
      this.accessory.context.BatteryLevel = this.BatteryLevel;
      this.batteryService?.updateCharacteristic(this.hap.Characteristic.BatteryLevel, this.BatteryLevel);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
    }
    // StatusLowBattery
    if (this.StatusLowBattery === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
    } else {
      this.accessory.context.StatusLowBattery = this.StatusLowBattery;
      this.batteryService?.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, this.StatusLowBattery);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
    }
  }

  async removeOutletService(accessory: PlatformAccessory): Promise<void> {
    // If outletService still present, then remove first
    this.outletService = this.accessory.getService(this.hap.Service.Outlet);
    if (this.outletService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Outlet Service`);
    }
    accessory.removeService(this.outletService!);
  }

  async removeGarageDoorService(accessory: PlatformAccessory): Promise<void> {
    // If garageDoorService still present, then remove first
    this.garageDoorService = this.accessory.getService(this.hap.Service.GarageDoorOpener);
    if (this.garageDoorService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Garage Door Service`);
    }
    accessory.removeService(this.garageDoorService!);
  }

  async removeDoorService(accessory: PlatformAccessory): Promise<void> {
    // If doorService still present, then remove first
    this.doorService = this.accessory.getService(this.hap.Service.Door);
    if (this.doorService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Door Service`);
    }
    accessory.removeService(this.doorService!);
  }

  async removeLockService(accessory: PlatformAccessory): Promise<void> {
    // If lockService still present, then remove first
    this.lockService = this.accessory.getService(this.hap.Service.LockMechanism);
    if (this.lockService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Lock Service`);
    }
    accessory.removeService(this.lockService!);
  }

  async removeFaucetService(accessory: PlatformAccessory): Promise<void> {
    // If faucetService still present, then remove first
    this.faucetService = this.accessory.getService(this.hap.Service.Faucet);
    if (this.faucetService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Faucet Service`);
    }
    accessory.removeService(this.faucetService!);
  }

  async removeFanService(accessory: PlatformAccessory): Promise<void> {
    // If fanService still present, then remove first
    this.fanService = this.accessory.getService(this.hap.Service.Fan);
    if (this.fanService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Fan Service`);
    }
    accessory.removeService(this.fanService!);
  }

  async removeWindowService(accessory: PlatformAccessory): Promise<void> {
    // If windowService still present, then remove first
    this.windowService = this.accessory.getService(this.hap.Service.Window);
    if (this.windowService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Window Service`);
    }
    accessory.removeService(this.windowService!);
  }

  async removeWindowCoveringService(accessory: PlatformAccessory): Promise<void> {
    // If windowCoveringService still present, then remove first
    this.windowCoveringService = this.accessory.getService(this.hap.Service.WindowCovering);
    if (this.windowCoveringService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Window Covering Service`);
    }
    accessory.removeService(this.windowCoveringService!);
  }

  async removeStatefulProgrammableSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If statefulProgrammableSwitchService still present, then remove first
    this.statefulProgrammableSwitchService = this.accessory.getService(this.hap.Service.StatefulProgrammableSwitch);
    if (this.statefulProgrammableSwitchService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Stateful Programmable Switch Service`);
    }
    accessory.removeService(this.statefulProgrammableSwitchService!);
  }

  async removeSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If switchService still present, then remove first
    this.switchService = this.accessory.getService(this.hap.Service.Switch);
    if (this.switchService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Switch Service`);
    }
    accessory.removeService(this.switchService!);
  }

  private DoublePress(device: device & devicesConfig) {
    if (device.bot?.doublePress) {
      this.doublePress = device.bot?.doublePress;
      this.accessory.context.doublePress = this.doublePress;
    } else {
      this.doublePress = 1;
    }
  }

  async stopScanning(switchbot: any) {
    switchbot.stopScan();
    if (this.BLE_IsConnected) {
      await this.BLEparseStatus();
      await this.updateHomeKitCharacteristics();
    } else {
      await this.BLERefreshConnection(switchbot);
    }
  }

  async getCustomBLEAddress(switchbot: any) {
    if (this.device.customBLEaddress && this.deviceLogging.includes('debug')) {
      (async () => {
        // Start to monitor advertisement packets
        await switchbot.startScan({
          model: 'H',
        });
        // Set an event handler
        switchbot.onadvertisement = (ad: any) => {
          this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} ad: ${JSON.stringify(ad, null, '  ')}`);
        };
        await sleep(10000);
        // Stop to monitor
        switchbot.stopScan();
      })();
    }
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

  async retry({ max, fn }: { max: number; fn: { (): any; (): Promise<any> } }): Promise<null> {
    return fn().catch(async (e: any) => {
      if (max === 0) {
        throw e;
      }
      this.infoLog(e);
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Retrying`);
      await sleep(1000);
      return this.retry({ max: max - 1, fn });
    });
  }

  maxRetry(): number {
    if (this.device.maxRetry) {
      return this.device.maxRetry;
    } else {
      return 5;
    }
  }

  async PressOrSwitch(device: device & devicesConfig): Promise<void> {
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
  }

  async allowPushChanges(device: device & devicesConfig): Promise<void> {
    if (device.bot?.allowPush) {
      this.allowPush = true;
    } else {
      this.allowPush = false;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Allowing Push Changes: ${this.allowPush}`);
  }

  async scan(device: device & devicesConfig): Promise<void> {
    if (device.scanDuration) {
      this.scanDuration = this.accessory.context.scanDuration = device.scanDuration;
      if (this.BLE) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config scanDuration: ${this.scanDuration}`);
      }
    } else {
      this.scanDuration = this.accessory.context.scanDuration = 1;
      if (this.BLE) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Default scanDuration: ${this.scanDuration}`);
      }
    }
  }

  async statusCode(statusCode: number): Promise<void> {
    switch (statusCode) {
      case 151:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Command not supported by this deviceType, statusCode: ${statusCode}`);
        break;
      case 152:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Device not found, statusCode: ${statusCode}`);
        break;
      case 160:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Command is not supported, statusCode: ${statusCode}`);
        break;
      case 161:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Device is offline, statusCode: ${statusCode}`);
        this.offlineOff();
        break;
      case 171:
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} Hub Device is offline, statusCode: ${statusCode}. ` +
          `Hub: ${this.device.hubDeviceId}`,
        );
        this.offlineOff();
        break;
      case 190:
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
          ` Or command format is invalid, statusCode: ${statusCode}`,
        );
        break;
      case 100:
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Command successfully sent, statusCode: ${statusCode}`);
        break;
      case 200:
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Request successful, statusCode: ${statusCode}`);
        break;
      case 400:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Bad Request, The client has issued an invalid request. `
            + `This is commonly used to specify validation errors in a request payload, statusCode: ${statusCode}`);
        break;
      case 401:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Unauthorized,	Authorization for the API is required, `
            + `but the request has not been authenticated, statusCode: ${statusCode}`);
        break;
      case 403:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Forbidden,	The request has been authenticated but does not `
            + `have appropriate permissions, or a requested resource is not found, statusCode: ${statusCode}`);
        break;
      case 404:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Not Found,	Specifies the requested path does not exist, `
        + `statusCode: ${statusCode}`);
        break;
      case 406:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Not Acceptable,	The client has requested a MIME type via `
            + `the Accept header for a value not supported by the server, statusCode: ${statusCode}`);
        break;
      case 415:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Unsupported Media Type,	The client has defined a contentType `
            + `header that is not supported by the server, statusCode: ${statusCode}`);
        break;
      case 422:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Unprocessable Entity,	The client has made a valid request, `
            + `but the server cannot process it. This is often used for APIs for which certain limits have been exceeded, statusCode: ${statusCode}`);
        break;
      case 429:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Too Many Requests,	The client has exceeded the number of `
            + `requests allowed for a given time window, statusCode: ${statusCode}`);
        break;
      case 500:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Internal Server Error,	An unexpected error on the SmartThings `
            + `servers has occurred. These errors should be rare, statusCode: ${statusCode}`);
        break;
      default:
        this.infoLog(
          `${this.device.deviceType}: ${this.accessory.displayName} Unknown statusCode: ` +
          `${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`,
        );
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      await this.deviceContext();
      await this.updateHomeKitCharacteristics();
    }
  }

  async apiError(e: any): Promise<void> {
    if (this.botDeviceType === 'garagedoor') {
      this.garageDoorService?.updateCharacteristic(this.hap.Characteristic.TargetDoorState, e);
      this.garageDoorService?.updateCharacteristic(this.hap.Characteristic.CurrentDoorState, e);
      this.garageDoorService?.updateCharacteristic(this.hap.Characteristic.ObstructionDetected, e);
    } else if (this.botDeviceType === 'door') {
      this.doorService?.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
      this.doorService?.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
      this.doorService?.updateCharacteristic(this.hap.Characteristic.PositionState, e);
    } else if (this.botDeviceType === 'window') {
      this.windowService?.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
      this.windowService?.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
      this.windowService?.updateCharacteristic(this.hap.Characteristic.PositionState, e);
    } else if (this.botDeviceType === 'windowcovering') {
      this.windowCoveringService?.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
      this.windowCoveringService?.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
      this.windowCoveringService?.updateCharacteristic(this.hap.Characteristic.PositionState, e);
    } else if (this.botDeviceType === 'lock') {
      this.doorService?.updateCharacteristic(this.hap.Characteristic.LockTargetState, e);
      this.doorService?.updateCharacteristic(this.hap.Characteristic.LockCurrentState, e);
    } else if (this.botDeviceType === 'faucet') {
      this.faucetService?.updateCharacteristic(this.hap.Characteristic.Active, e);
    } else if (this.botDeviceType === 'fan') {
      this.fanService?.updateCharacteristic(this.hap.Characteristic.On, e);
    } else if (this.botDeviceType === 'stateful') {
      this.statefulProgrammableSwitchService?.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchEvent, e);
      this.statefulProgrammableSwitchService?.updateCharacteristic(this.hap.Characteristic.ProgrammableSwitchOutputState, e);
    } else if (this.botDeviceType === 'switch') {
      this.switchService?.updateCharacteristic(this.hap.Characteristic.On, e);
    } else {
      this.outletService?.updateCharacteristic(this.hap.Characteristic.On, e);
    }
    this.batteryService?.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e);
    this.batteryService?.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e);
  }

  async deviceType(device: device & devicesConfig): Promise<void> {
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
  }

  async deviceContext() {
    if (this.On === undefined) {
      this.On = false;
      this.accessory.context.On = this.On;
    } else {
      this.On = this.accessory.context.On;
    }
    if (this.BatteryLevel === undefined) {
      this.BatteryLevel = 100;
    } else {
      this.BatteryLevel = this.accessory.context.BatteryLevel;
    }
    if (this.StatusLowBattery === undefined) {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
      this.accessory.context.StatusLowBattery = this.StatusLowBattery;
    } else {
      this.StatusLowBattery = this.accessory.context.StatusLowBattery;
    }
    if (this.FirmwareRevision === undefined) {
      this.FirmwareRevision = this.platform.version;
      this.accessory.context.FirmwareRevision = this.FirmwareRevision;
    }
  }

  async refreshRate(device: device & devicesConfig): Promise<void> {
    if (device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = device.refreshRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options!.refreshRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
    }
    // pushRatePress
    if (device?.bot?.pushRatePress) {
      this.pushRatePress = device?.bot?.pushRatePress;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config Bot pushRatePress: ${this.pushRatePress}`);
    } else {
      this.pushRatePress = 15;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Default Bot pushRatePress: ${this.pushRatePress}`);
    }
  }

  async deviceConfig(device: device & devicesConfig): Promise<void> {
    let config = {};
    if (device.bot) {
      config = device.bot;
    }
    if (device.connectionType !== undefined) {
      config['connectionType'] = device.connectionType;
    }
    if (device.external !== undefined) {
      config['external'] = device.external;
    }
    if (device.logging !== undefined) {
      config['logging'] = device.logging;
    }
    if (device.refreshRate !== undefined) {
      config['refreshRate'] = device.refreshRate;
    }
    if (device.scanDuration !== undefined) {
      config['scanDuration'] = device.scanDuration;
    }
    if (device.offline !== undefined) {
      config['offline'] = device.offline;
    }
    if (device.maxRetry !== undefined) {
      config['maxRetry'] = device.maxRetry;
    }
    if (device.webhook !== undefined) {
      config['webhook'] = device.webhook;
    }
    if (Object.entries(config).length !== 0) {
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  async deviceLogs(device: device & devicesConfig): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
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
