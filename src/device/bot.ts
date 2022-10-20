import https from 'https';
import crypto from 'crypto';
import { Context } from 'vm';
import { IncomingMessage } from 'http';
import { interval, Subject } from 'rxjs';
import superStringify from 'super-stringify';
import { SwitchBotPlatform } from '../platform';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { device, devicesConfig, deviceStatus, ad, serviceData, switchbot, HostDomain, DevicePath } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Bot {
  // Services
  fanService?: Service;
  doorService?: Service;
  lockService?: Service;
  faucetService?: Service;
  windowService?: Service;
  switchService?: Service;
  outletService?: Service;
  batteryService?: Service;
  garageDoorService?: Service;
  windowCoveringService?: Service;
  statefulProgrammableSwitchService?: Service;

  // Characteristic Values
  On!: CharacteristicValue;
  BatteryLevel!: CharacteristicValue;
  StatusLowBattery!: CharacteristicValue;

  // OpenAPI Others
  power: deviceStatus['power'];
  deviceStatus!: any; //deviceStatusResponse;

  // BLE Others
  connected?: boolean;
  switchbot!: switchbot;
  serviceData!: serviceData;
  address!: ad['address'];
  mode!: serviceData['mode'];
  state!: serviceData['state'];
  battery!: serviceData['battery'];

  // Config
  botMode!: string;
  allowPush?: boolean;
  doublePress!: number;
  pushRatePress!: number;
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;

  // Updates
  botUpdateInProgress!: boolean;
  doBotUpdate!: Subject<void>;

  // Connection
  private readonly BLE = (this.device.connectionType === 'BLE' || this.device.connectionType === 'BLE/OpenAPI');
  private readonly OpenAPI = (this.device.connectionType === 'OpenAPI' || this.device.connectionType === 'BLE/OpenAPI');

  constructor(private readonly platform: SwitchBotPlatform, private accessory: PlatformAccessory, public device: device & devicesConfig) {
    // default placeholders
    this.logs(device);
    this.scan(device);
    this.refreshRate(device);
    this.PressOrSwitch(device);
    this.allowPushChanges(device);
    this.config(device);
    this.context();
    this.DoublePress(device);

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doBotUpdate = new Subject();
    this.botUpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'SWITCHBOT-BOT-S1')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision(accessory, device))
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
      .updateValue(this.FirmwareRevision(accessory, device));

    // get the service if it exists, otherwise create a new service
    // you can create multiple services for each accessory
    if (device.bot?.deviceType === 'switch') {
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
      this.infoLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Switch`);

      this.switchService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
      this.switchService.getCharacteristic(this.platform.Characteristic.On).onSet(this.OnSet.bind(this));
    } else if (device.bot?.deviceType === 'garagedoor') {
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
      this.infoLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Garage Door Opener`);

      this.garageDoorService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
      this.garageDoorService.getCharacteristic(this.platform.Characteristic.TargetDoorState).onSet(this.OnSet.bind(this));
      this.garageDoorService.setCharacteristic(this.platform.Characteristic.ObstructionDetected, false);
    } else if (device.bot?.deviceType === 'door') {
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
      this.infoLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Door`);

      this.doorService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
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
    } else if (device.bot?.deviceType === 'window') {
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
      this.infoLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Window`);

      this.windowService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
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
    } else if (device.bot?.deviceType === 'windowcovering') {
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
      this.infoLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Window Covering`);

      this.windowCoveringService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
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
    } else if (device.bot?.deviceType === 'lock') {
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
      this.infoLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Lock`);

      this.lockService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
      this.lockService.getCharacteristic(this.platform.Characteristic.LockTargetState).onSet(this.OnSet.bind(this));
    } else if (device.bot?.deviceType === 'faucet') {
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
      this.infoLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Faucet`);

      this.faucetService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
      this.faucetService.getCharacteristic(this.platform.Characteristic.Active).onSet(this.OnSet.bind(this));
    } else if (device.bot?.deviceType === 'fan') {
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
      this.infoLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Fan`);

      this.fanService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
      this.fanService.getCharacteristic(this.platform.Characteristic.On).onSet(this.OnSet.bind(this));
    } else if (device.bot?.deviceType === 'stateful') {
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
      this.infoLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Stateful Programmable Switch`);

      this.statefulProgrammableSwitchService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
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
      this.infoLog(`${this.device.deviceType}: ${accessory.displayName} Displaying as Outlet`);

      this.outletService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
      this.outletService.getCharacteristic(this.platform.Characteristic.On).onSet(this.OnSet.bind(this));
    }

    // Battery Service
    if (!this.BLE) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Battery Service`);
      this.batteryService = this.accessory.getService(this.platform.Service.Battery);
      accessory.removeService(this.batteryService!);
    } else if (this.BLE && !this.batteryService) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Battery Service`);
      (this.batteryService = this.accessory.getService(this.platform.Service.Battery) || this.accessory.addService(this.platform.Service.Battery)),
      `${accessory.displayName} Battery`;

      this.batteryService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Battery`);
    } else {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Battery Service Not Added`);
    }

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

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
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType} Connection,`
              + ` Error Message: ${superStringify(e.message)}`);
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
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:`
      + ` ${this.device.connectionType}, parseStatus will not happen.`);
    }
  }

  async BLEparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);
    // BLEmode (true if Switch Mode) | (false if Press Mode)
    if (this.mode) {
      this.accessory.context.On = this.On;
      if (this.On === undefined) {
        this.On = Boolean(this.state);
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Switch Mode, mode: ${this.mode}, On: ${this.On}`);
    } else {
      this.On = false;
      this.accessory.context.On = this.On;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Press Mode, mode: ${this.mode}, On: ${this.On}`);
    }

    this.BatteryLevel = Number(this.battery);
    if (this.BatteryLevel < 10) {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    if (Number.isNaN(this.BatteryLevel)) {
      this.BatteryLevel = 100;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
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
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:`
      + ` ${this.device.connectionType}, refreshStatus will not happen.`);
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
    if (switchbot !== false) {
      switchbot
        .startScan({
          model: 'H',
          id: this.device.bleMac,
        })
        .then(async () => {
        // Set an event hander
          switchbot.onadvertisement = async (ad: ad) => {
            this.address = ad.address;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac},`
            + ` BLE Address Found: ${this.address}`);
            this.serviceData = ad.serviceData;
            this.mode = ad.serviceData.mode;
            this.state = ad.serviceData.state;
            this.battery = ad.serviceData.battery;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${superStringify(ad.serviceData)}`);
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}, model: ${ad.serviceData.model}, modelName: `
            + `${ad.serviceData.modelName}, mode: ${ad.serviceData.mode}, state: ${ad.serviceData.state}, battery: ${ad.serviceData.battery}`);

            if (this.serviceData) {
              this.connected = true;
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.connected}`);
              await this.stopScanning(switchbot);
            } else {
              this.connected = false;
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.connected}`);
            }
          };
          // Wait
          return await switchbot.wait(this.scanDuration * 1000);
        })
        .then(async () => {
        // Stop to monitor
          await this.stopScanning(switchbot);
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLERefreshStatus with ${this.device.connectionType}`
              + ` Connection, Error Message: ${superStringify(e.message)}`);
          await this.BLERefreshConnection(switchbot);
        });
    } else {
      await this.BLERefreshConnection(switchbot);
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const t = Date.now();
      const nonce = 'requestID';
      const data = this.platform.config.credentials?.token + t + nonce;
      const signTerm = crypto.createHmac('sha256', this.platform.config.credentials?.secret).update(Buffer.from(data, 'utf-8')).digest();
      const sign = signTerm.toString('base64');
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} sign: ${sign}`);
      const options = {
        hostname: HostDomain,
        port: 443,
        path: `${DevicePath}/${this.device.deviceId}/status`,
        method: 'GET',
        headers: {
          Authorization: this.platform.config.credentials?.token,
          sign: sign,
          nonce: nonce,
          t: t,
          'Content-Type': 'application/json',
        },
      };
      const req = https.request(options, (res) => {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus statusCode: ${res.statusCode}`);
        let rawData = '';
        res.on('data', (d) => {
          rawData += d;
          this.debugLog(`d: ${d}`);
        });
        res.on('end', () => {
          try {
            this.deviceStatus = JSON.parse(rawData);
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus: ${superStringify(this.deviceStatus)}`);
            this.power = this.deviceStatus.body.power;
            this.openAPIparseStatus();
            this.updateHomeKitCharacteristics();
          } catch (e: any) {
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} error message: ${e.message}`);
          }
        });
      });
      req.on('error', (e: any) => {
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} error message: ${e.message}`);
      });
      req.end();
    } catch (e: any) {
      this.apiError(e);
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIRefreshStatus with ${this.device.connectionType}`
            + ` Connection, Error Message: ${superStringify(e.message)}`);
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
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:`
      + ` ${this.device.connectionType}, pushChanges will not happen.`);
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
          .then((device_list: { press: (arg0: { id: string | undefined }) => any }[]) => {
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
            return device_list[0].press({ id: this.device.bleMac });
          })
          .then(() => {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
            this.accessory.context.On = this.On;
            setTimeout(() => {
              if (this.device.bot?.deviceType === 'switch') {
                this.switchService?.getCharacteristic(this.platform.Characteristic.On).updateValue(this.On);
              } else {
                this.outletService?.getCharacteristic(this.platform.Characteristic.On).updateValue(this.On);
              }
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}, Switch Timeout`);
            }, 500);
          })
          .catch(async (e: any) => {
            this.apiError(e);
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}`
          + ` Connection & botMode: ${this.botMode}, Error Message: ${superStringify(e.message)}`);
            await this.BLEPushConnection();
          });
      } else if (this.botMode === 'switch') {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Press Mode: ${this.botMode}`);
        switchbot
          .discover({ model: 'H', quick: true, id: this.device.bleMac })
          .then((device_list: any) => {
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
            return this.turnOnOff(device_list);
          })
          .then(() => {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
            this.accessory.context.On = this.On;
          })
          .catch(async (e: any) => {
            this.apiError(e);
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}`
          + ` Connection & botMode: ${this.botMode}, Error Message: ${superStringify(e.message)}`);
            await this.BLEPushConnection();
          });
      } else {
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Bot Mode: ${this.botMode}`);
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No BLEpushChanges.` + `On: ${this.On}, `
        +`OnCached: ${this.accessory.context.On}`);
    }
  }

  async openAPIpushChanges(): Promise<void> {
    try {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);
      if (this.On !== this.accessory.context.On || this.allowPush) {
        // Make Push On request to the API
        const t = Date.now();
        const nonce = 'requestID';
        const data = this.platform.config.credentials?.token + t + nonce;
        const signTerm = crypto.createHmac('sha256', this.platform.config.credentials?.secret)
          .update(Buffer.from(data, 'utf-8'))
          .digest();
        const sign = signTerm.toString('base64');
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} sign: ${sign}`);
        let command = '';
        if (this.botMode === 'switch' && this.On) {
          command = 'turnOn';
          this.On = true;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Switch Mode, Turning ${this.On}`);
        } else if (this.botMode === 'switch' && !this.On) {
          command = 'turnOff';
          this.On = false;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Switch Mode, Turning ${this.On}`);
        } else if (this.botMode === 'press') {
          command = 'press';
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Press Mode`);
          this.On = false;
        } else {
          throw new Error(`${this.device.deviceType}: ${this.accessory.displayName} Device Paramters not set for this Bot.`);
        }
        const body = superStringify({
          'command': `${command}`,
          'parameter': 'default',
          'commandType': 'command',
        });
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${body},`);
        const options = {
          hostname: HostDomain,
          port: 443,
          path: `${DevicePath}/${this.device.deviceId}/commands`,
          method: 'POST',
          headers: {
            'Authorization': this.platform.config.credentials?.token,
            'sign': sign,
            'nonce': nonce,
            't': t,
            'Content-Type': 'application/json',
            'Content-Length': body.length,
          },
        };
        const req = https.request(options, res => {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges statusCode: ${res.statusCode}`);
          this.statusCode({ res });
          res.on('data', d => {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} d: ${d}`);
          });
        });
        req.on('error', (e: any) => {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} error message: ${e.message}`);
        });
        req.write(body);
        req.end();
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges: ${superStringify(req)}`);
      } else {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No openAPIpushChanges.` + `On: ${this.On}, `
          +`OnCached: ${this.accessory.context.On}`);
      }
    } catch (e: any) {
      this.apiError(e);
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIpushChanges with ${this.device.connectionType}`
            + ` Connection, Error Message: ${superStringify(e.message)}`,
      );
    }
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    if (this.device.bot?.deviceType === 'garagedoor') {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set TargetDoorState: ${value}`);
      if (value === this.platform.Characteristic.TargetDoorState.CLOSED) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else if (
      this.device.bot?.deviceType === 'door' ||
      this.device.bot?.deviceType === 'window' ||
      this.device.bot?.deviceType === 'windowcovering'
    ) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set TargetPosition: ${value}`);
      if (value === 0) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else if (this.device.bot?.deviceType === 'lock') {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set LockTargetState: ${value}`);
      if (value === this.platform.Characteristic.LockTargetState.SECURED) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else if (this.device.bot?.deviceType === 'faucet') {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Active: ${value}`);
      if (value === this.platform.Characteristic.Active.INACTIVE) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else if (this.device.bot?.deviceType === 'stateful') {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set ProgrammableSwitchOutputState: ${value}`);
      if (value === 0) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set On: ${value}`);
      this.On = value;
    }
    this.doBotUpdate.next();
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    if (this.device.bot?.deviceType === 'garagedoor') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
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
          this.debugLog(`${this.device.deviceType}: `
          + `${this.accessory.displayName} updateCharacteristic TargetDoorState: Open, CurrentDoorState: Open`);
        } else {
          this.garageDoorService?.updateCharacteristic(
            this.platform.Characteristic.TargetDoorState,
            this.platform.Characteristic.TargetDoorState.CLOSED,
          );
          this.garageDoorService?.updateCharacteristic(
            this.platform.Characteristic.CurrentDoorState,
            this.platform.Characteristic.CurrentDoorState.CLOSED,
          );
          this.debugLog(`${this.device.deviceType}: `
          +`${this.accessory.displayName} updateCharacteristic TargetDoorState: Open, CurrentDoorState: Open`);
        }
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Garage Door On: ${this.On}`);
    } else if (this.device.bot?.deviceType === 'door') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.doorService?.updateCharacteristic(this.platform.Characteristic.TargetPosition, 100);
          this.doorService?.updateCharacteristic(this.platform.Characteristic.CurrentPosition, 100);
          this.doorService?.updateCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 100, CurrentPosition: 100`);
        } else {
          this.doorService?.updateCharacteristic(this.platform.Characteristic.TargetPosition, 0);
          this.doorService?.updateCharacteristic(this.platform.Characteristic.CurrentPosition, 0);
          this.doorService?.updateCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 0, CurrentPosition: 0`);
        }
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Door On: ${this.On}`);
    } else if (this.device.bot?.deviceType === 'window') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.windowService?.updateCharacteristic(this.platform.Characteristic.TargetPosition, 100);
          this.windowService?.updateCharacteristic(this.platform.Characteristic.CurrentPosition, 100);
          this.windowService?.updateCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 100, CurrentPosition: 100`);
        } else {
          this.windowService?.updateCharacteristic(this.platform.Characteristic.TargetPosition, 0);
          this.windowService?.updateCharacteristic(this.platform.Characteristic.CurrentPosition, 0);
          this.windowService?.updateCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.STOPPED);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 0, CurrentPosition: 0`);
        }
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Window On: ${this.On}`);
    } else if (this.device.bot?.deviceType === 'windowcovering') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.windowCoveringService?.updateCharacteristic(this.platform.Characteristic.TargetPosition, 100);
          this.windowCoveringService?.updateCharacteristic(this.platform.Characteristic.CurrentPosition, 100);
          this.windowCoveringService?.updateCharacteristic(
            this.platform.Characteristic.PositionState,
            this.platform.Characteristic.PositionState.STOPPED,
          );
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 100, CurrentPosition: 100`);
        } else {
          this.windowCoveringService?.updateCharacteristic(this.platform.Characteristic.TargetPosition, 0);
          this.windowCoveringService?.updateCharacteristic(this.platform.Characteristic.CurrentPosition, 0);
          this.windowCoveringService?.updateCharacteristic(
            this.platform.Characteristic.PositionState,
            this.platform.Characteristic.PositionState.STOPPED,
          );
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: 0, CurrentPosition: 0`);
        }
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Window Covering On: ${this.On}`);
    } else if (this.device.bot?.deviceType === 'lock') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
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
          this.debugLog(`${this.device.deviceType}: `
          + `${this.accessory.displayName} updateCharacteristic LockTargetState: UNSECURED, LockCurrentState: UNSECURED`);
        } else {
          this.lockService?.updateCharacteristic(this.platform.Characteristic.LockTargetState, this.platform.Characteristic.LockTargetState.SECURED);
          this.lockService?.updateCharacteristic(
            this.platform.Characteristic.LockCurrentState,
            this.platform.Characteristic.LockCurrentState.SECURED,
          );
          this.debugLog(`${this.device.deviceType}: `
          + `${this.accessory.displayName} updateCharacteristic LockTargetState: SECURED, LockCurrentState: SECURED`);
        }
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Lock On: ${this.On}`);
    } else if (this.device.bot?.deviceType === 'faucet') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.faucetService?.updateCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.On}`);
        } else {
          this.faucetService?.updateCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.INACTIVE);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.On}`);
        }
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Faucet On: ${this.On}`);
    } else if (this.device.bot?.deviceType === 'fan') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.fanService?.updateCharacteristic(this.platform.Characteristic.On, this.On);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
        } else {
          this.fanService?.updateCharacteristic(this.platform.Characteristic.On, this.On);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
        }
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Fan On: ${this.On}`);
    } else if (this.device.bot?.deviceType === 'stateful') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        if (this.On) {
          this.statefulProgrammableSwitchService?.updateCharacteristic(
            this.platform.Characteristic.ProgrammableSwitchEvent,
            this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
          );
          this.statefulProgrammableSwitchService?.updateCharacteristic(this.platform.Characteristic.ProgrammableSwitchOutputState, 1);
          this.debugLog(`${this.device.deviceType}: `
          + `${this.accessory.displayName} updateCharacteristic ProgrammableSwitchEvent: SINGLE, ProgrammableSwitchOutputState: 1`);
        } else {
          this.statefulProgrammableSwitchService?.updateCharacteristic(
            this.platform.Characteristic.ProgrammableSwitchEvent,
            this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
          );
          this.statefulProgrammableSwitchService?.updateCharacteristic(this.platform.Characteristic.ProgrammableSwitchOutputState, 0);
          this.debugLog(`${this.device.deviceType}: `
          + `${this.accessory.displayName} updateCharacteristic ProgrammableSwitchEvent: SINGLE, ProgrammableSwitchOutputState: 0`);
        }
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatefulProgrammableSwitch On: ${this.On}`);
    } else if (this.device.bot?.deviceType === 'switch') {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        this.switchService?.updateCharacteristic(this.platform.Characteristic.On, this.On);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
      }
    } else {
      if (this.On === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
      } else {
        this.outletService?.updateCharacteristic(this.platform.Characteristic.On, this.On);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
      }
    }
    this.accessory.context.On = this.On;
    if (this.BLE) {
      if (this.BatteryLevel === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
      } else {
        this.accessory.context.BatteryLevel = this.BatteryLevel;
        this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
      }
      if (this.StatusLowBattery === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
      } else {
        this.accessory.context.StatusLowBattery = this.StatusLowBattery;
        this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
      }
    }
  }

  async removeOutletService(accessory: PlatformAccessory): Promise<void> {
    // If outletService still pressent, then remove first
    this.outletService = this.accessory.getService(this.platform.Service.Outlet);
    if (this.outletService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Outlet Service`);
    }
    accessory.removeService(this.outletService!);
  }

  async removeGarageDoorService(accessory: PlatformAccessory): Promise<void> {
    // If garageDoorService still pressent, then remove first
    this.garageDoorService = this.accessory.getService(this.platform.Service.GarageDoorOpener);
    if (this.garageDoorService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Garage Door Service`);
    }
    accessory.removeService(this.garageDoorService!);
  }

  async removeDoorService(accessory: PlatformAccessory): Promise<void> {
    // If doorService still pressent, then remove first
    this.doorService = this.accessory.getService(this.platform.Service.Door);
    if (this.doorService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Door Service`);
    }
    accessory.removeService(this.doorService!);
  }

  async removeLockService(accessory: PlatformAccessory): Promise<void> {
    // If lockService still pressent, then remove first
    this.lockService = this.accessory.getService(this.platform.Service.LockMechanism);
    if (this.lockService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Lock Service`);
    }
    accessory.removeService(this.lockService!);
  }

  async removeFaucetService(accessory: PlatformAccessory): Promise<void> {
    // If faucetService still pressent, then remove first
    this.faucetService = this.accessory.getService(this.platform.Service.Faucet);
    if (this.faucetService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Faucet Service`);
    }
    accessory.removeService(this.faucetService!);
  }

  async removeFanService(accessory: PlatformAccessory): Promise<void> {
    // If fanService still pressent, then remove first
    this.fanService = this.accessory.getService(this.platform.Service.Fan);
    if (this.fanService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Fan Service`);
    }
    accessory.removeService(this.fanService!);
  }

  async removeWindowService(accessory: PlatformAccessory): Promise<void> {
    // If windowService still pressent, then remove first
    this.windowService = this.accessory.getService(this.platform.Service.Window);
    if (this.windowService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Window Service`);
    }
    accessory.removeService(this.windowService!);
  }

  async removeWindowCoveringService(accessory: PlatformAccessory): Promise<void> {
    // If windowCoveringService still pressent, then remove first
    this.windowCoveringService = this.accessory.getService(this.platform.Service.WindowCovering);
    if (this.windowCoveringService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Window Covering Service`);
    }
    accessory.removeService(this.windowCoveringService!);
  }

  async removeStatefulProgrammableSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If statefulProgrammableSwitchService still pressent, then remove first
    this.statefulProgrammableSwitchService = this.accessory.getService(this.platform.Service.StatefulProgrammableSwitch);
    if (this.statefulProgrammableSwitchService) {
      this.warnLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leftover Stateful Programmable Switch Service`);
    }
    accessory.removeService(this.statefulProgrammableSwitchService!);
  }

  async removeSwitchService(accessory: PlatformAccessory): Promise<void> {
    // If switchService still pressent, then remove first
    this.switchService = this.accessory.getService(this.platform.Service.Switch);
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
    await switchbot.stopScan();
    if (this.connected) {
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
          this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} ad: ${superStringify(ad, null, '  ')}`);
        };
        await switchbot.wait(10000);
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
    this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`);
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Refresh Status`);
      await this.openAPIRefreshStatus();
    }
  }

  async turnOnOff(device_list: any): Promise<any> {
    return await this.retry({
      max: await this.maxRetry(),
      fn: () => {
        if (this.On) {
          return device_list[0].turnOn({ id: this.device.bleMac });
        } else {
          return device_list[0].turnOff({ id: this.device.bleMac });
        }
      },
    });
  }

  async retry({ max, fn }: { max: number; fn: { (): any; (): Promise<any> } }): Promise<null> {
    return fn().catch(async (err: any) => {
      if (max === 0) {
        throw err;
      }
      this.infoLog(err);
      this.infoLog('Retrying');
      await this.switchbot.wait(1000);
      return this.retry({ max: max - 1, fn });
    });
  }

  async maxRetry(): Promise<number> {
    let maxRetry: number;
    if (this.device.bot?.maxRetry) {
      maxRetry = this.device.bot?.maxRetry;
    } else {
      maxRetry = 5;
    }
    return maxRetry;
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

  async statusCode({ res }: { res: IncomingMessage }): Promise<void> {
    switch (res.statusCode) {
      case 151:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Device is offline.`);
        await this.offlineOff();
        break;
      case 171:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Hub Device is offline. Hub: ${this.device.hubDeviceId}`);
        await this.offlineOff();
        break;
      case 190:
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
            ` Or command: ${superStringify(res)} format is invalid`,
        );
        break;
      case 100:
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      await this.context();
      await this.updateHomeKitCharacteristics();
    }
  }

  async apiError(e: any): Promise<void> {
    if (this.device.bot?.deviceType === 'garagedoor') {
      this.garageDoorService?.updateCharacteristic(this.platform.Characteristic.TargetDoorState, e);
      this.garageDoorService?.updateCharacteristic(this.platform.Characteristic.CurrentDoorState, e);
      this.garageDoorService?.updateCharacteristic(this.platform.Characteristic.ObstructionDetected, e);
    } else if (this.device.bot?.deviceType === 'door') {
      this.doorService?.updateCharacteristic(this.platform.Characteristic.TargetPosition, e);
      this.doorService?.updateCharacteristic(this.platform.Characteristic.CurrentPosition, e);
      this.doorService?.updateCharacteristic(this.platform.Characteristic.PositionState, e);
    } else if (this.device.bot?.deviceType === 'window') {
      this.windowService?.updateCharacteristic(this.platform.Characteristic.TargetPosition, e);
      this.windowService?.updateCharacteristic(this.platform.Characteristic.CurrentPosition, e);
      this.windowService?.updateCharacteristic(this.platform.Characteristic.PositionState, e);
    } else if (this.device.bot?.deviceType === 'windowcovering') {
      this.windowCoveringService?.updateCharacteristic(this.platform.Characteristic.TargetPosition, e);
      this.windowCoveringService?.updateCharacteristic(this.platform.Characteristic.CurrentPosition, e);
      this.windowCoveringService?.updateCharacteristic(this.platform.Characteristic.PositionState, e);
    } else if (this.device.bot?.deviceType === 'lock') {
      this.doorService?.updateCharacteristic(this.platform.Characteristic.LockTargetState, e);
      this.doorService?.updateCharacteristic(this.platform.Characteristic.LockCurrentState, e);
    } else if (this.device.bot?.deviceType === 'faucet') {
      this.faucetService?.updateCharacteristic(this.platform.Characteristic.Active, e);
    } else if (this.device.bot?.deviceType === 'fan') {
      this.fanService?.updateCharacteristic(this.platform.Characteristic.On, e);
    } else if (this.device.bot?.deviceType === 'stateful') {
      this.statefulProgrammableSwitchService?.updateCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent, e);
      this.statefulProgrammableSwitchService?.updateCharacteristic(this.platform.Characteristic.ProgrammableSwitchOutputState, e);
    } else if (this.device.bot?.deviceType === 'switch') {
      this.switchService?.updateCharacteristic(this.platform.Characteristic.On, e);
    } else {
      this.outletService?.updateCharacteristic(this.platform.Characteristic.On, e);
    }
    if (this.BLE) {
      this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, e);
      this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, e);
    }
  }

  FirmwareRevision(accessory: PlatformAccessory<Context>, device: device & devicesConfig): CharacteristicValue {
    let FirmwareRevision: string;
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
    + ` accessory.context.FirmwareRevision: ${accessory.context.FirmwareRevision}`);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} device.firmware: ${device.firmware}`);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} this.platform.version: ${this.platform.version}`);
    if (accessory.context.FirmwareRevision) {
      FirmwareRevision = accessory.context.FirmwareRevision;
    } else if (device.firmware) {
      FirmwareRevision = device.firmware;
    } else {
      FirmwareRevision = this.platform.version;
    }
    return FirmwareRevision;
  }

  async context() {
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
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
      this.accessory.context.StatusLowBattery = this.StatusLowBattery;
    } else {
      this.StatusLowBattery = this.accessory.context.StatusLowBattery;
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

  async config(device: device & devicesConfig): Promise<void> {
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
    if (Object.entries(config).length !== 0) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Config: ${superStringify(config)}`);
    }
  }

  async logs(device: device & devicesConfig): Promise<void> {
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
