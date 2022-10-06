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
  SwitchToOpenAPI?: boolean;
  serviceData!: serviceData;
  address!: ad['address'];
  mode!: serviceData['mode'];
  state!: serviceData['state'];
  battery!: serviceData['battery'];

  // Config
  botMode!: string;
  allowPush?: boolean;
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;
  OpenAPI?: boolean;

  // Others
  doublePress!: number;

  // Updates
  botUpdateInProgress!: boolean;
  doBotUpdate!: Subject<void>;

  constructor(private readonly platform: SwitchBotPlatform, private accessory: PlatformAccessory, public device: device & devicesConfig) {
    // default placeholders
    this.logs(device);
    this.openAPI();
    this.scan(device);
    this.refreshRate(device);
    this.PressOrSwitch(device);
    this.allowPushChanges(device);
    this.config(device);
    if (this.On === undefined) {
      this.On = false;
      this.accessory.context.On = this.On;
    } else {
      this.On = this.accessory.context.On;
    }
    if (device.bot?.doublePress) {
      this.doublePress = device.bot?.doublePress;
      this.accessory.context.doublePress = this.doublePress;
    } else {
      this.doublePress = 1;
    }
    this.BatteryLevel = 100;
    this.StatusLowBattery = 0;

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
      this.switchService.getCharacteristic(this.platform.Characteristic.On).onSet(this.handleOnSet.bind(this));
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
      this.garageDoorService.getCharacteristic(this.platform.Characteristic.TargetDoorState).onSet(this.handleOnSet.bind(this));
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
        .onSet(this.handleOnSet.bind(this));
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
        .onSet(this.handleOnSet.bind(this));
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
        .onSet(this.handleOnSet.bind(this));
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
      this.lockService.getCharacteristic(this.platform.Characteristic.LockTargetState).onSet(this.handleOnSet.bind(this));
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
      this.faucetService.getCharacteristic(this.platform.Characteristic.Active).onSet(this.handleOnSet.bind(this));
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
      this.fanService.getCharacteristic(this.platform.Characteristic.On).onSet(this.handleOnSet.bind(this));
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
        .onSet(this.handleOnSet.bind(this));
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
      this.outletService.getCharacteristic(this.platform.Characteristic.On).onSet(this.handleOnSet.bind(this));
    }

    // Battery Service
    if (!device.ble) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Battery Service`);
      this.batteryService = this.accessory.getService(this.platform.Service.Battery);
      accessory.removeService(this.batteryService!);
    } else if (device.ble && !this.batteryService) {
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
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doBotUpdate
      .pipe(
        tap(() => {
          this.botUpdateInProgress = true;
        }),
        debounceTime(100),
      )
      .subscribe(async () => {
        try {
          interval(100)
            .pipe(take(this.doublePress!))
            .subscribe(async () => {
              await this.pushChanges();
            });
        } catch (e: any) {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges`);
          if (this.deviceLogging.includes('debug')) {
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges,`
            + ` Error Message: ${superStringify(e.message)}`);
          }
          if (this.platform.debugMode) {
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges,` + ` Error: ${superStringify(e)}`);
          }
        }
        this.botUpdateInProgress = false;
      });
  }

  /**
   * Parse the device status from the SwitchBot api
   */
  async parseStatus(): Promise<void> {
    if (this.SwitchToOpenAPI || !this.device.ble) {
      await this.openAPIparseStatus();
    } else {
      await this.BLEparseStatus();
    }
  }

  async BLEparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE parseStatus`);
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
    if (this.device.ble) {
      this.SwitchToOpenAPI = false;
    }
    if (this.platform.config.credentials?.token) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} OpenAPI parseStatus`);
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
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus(): Promise<void> {
    if (this.device.ble) {
      await this.BLERefreshStatus();
    } else {
      await this.openAPIRefreshStatus();
    }
  }

  async BLERefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE refreshStatus`);
    const switchbot = await this.platform.connectBLE();
    // Convert to BLE Address
    this.device.bleMac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(':')
      .toLowerCase();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    this.getCustomBLEAddress(switchbot);
    // Start to monitor advertisement packets
    if (switchbot === false) {
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection: ${switchbot}`);
    }
    switchbot
      .startScan({
        model: 'H',
        id: this.device.bleMac,
      })
      .then(() => {
        // Set an event hander
        switchbot.onadvertisement = (ad: ad) => {
          this.address = ad.address;
          if (this.deviceLogging.includes('debug')) {
            this.infoLog(this.address);
            this.infoLog(this.device.bleMac);
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address Found: ${this.address}`);
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac}`);
          }
          this.serviceData = ad.serviceData;
          this.mode = ad.serviceData.mode;
          this.state = ad.serviceData.state;
          this.battery = ad.serviceData.battery;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${superStringify(ad.serviceData)}`);
          this.debugLog(
            `${this.device.deviceType}: ${this.accessory.displayName}, model: ${ad.serviceData.model}, modelName: ${ad.serviceData.modelName},` +
              ` mode: ${ad.serviceData.mode}, state: ${ad.serviceData.state}, battery: ${ad.serviceData.battery}`,
          );

          if (this.serviceData) {
            this.connected = true;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.connected}`);
          } else {
            this.connected = false;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.connected}`);
          }
        };
        // Wait 2 seconds
        return switchbot.wait(this.scanDuration * 1000);
      })
      .then(async () => {
        // Stop to monitor
        switchbot.stopScan();
        if (this.connected) {
          this.parseStatus();
          this.updateHomeKitCharacteristics();
        } else {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection`);
          if (this.platform.config.credentials?.token) {
            this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection`);
            this.SwitchToOpenAPI = true;
            await this.openAPIRefreshStatus();
          }
        }
      })
      .catch(async (e: any) => {
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed refreshStatus with BLE Connection`);
        if (this.deviceLogging.includes('debug')) {
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed refreshStatus with BLE Connection,`
            + ` Error Message: ${superStringify(e.message)}`,
          );
        }
        if (this.platform.config.credentials?.token) {
          this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection`);
          this.SwitchToOpenAPI = true;
          await this.openAPIRefreshStatus();
        }
        this.apiError(e);
      });
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

  async openAPIRefreshStatus(): Promise<void> {
    if (this.platform.config.credentials?.token && this.OpenAPI) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} OpenAPI refreshStatus`);
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
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Refresh statusCode: ${res.statusCode}`);
          let rawData = '';
          res.on('data', (d) => {
            rawData += d;
            this.debugLog(`d: ${d}`);
          });
          res.on('end', () => {
            try {
              this.deviceStatus = JSON.parse(rawData);
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} refreshStatus: ${superStringify(this.deviceStatus)}`);
              this.power = this.deviceStatus.body.power;
              this.parseStatus();
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
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection`);
        if (this.deviceLogging.includes('debug')) {
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,`
            + ` Error Message: ${superStringify(e.message)}`,
          );
        }
        if (this.platform.debugMode) {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,`
          + ` Error: ${superStringify(e)}`);
        }
        this.apiError(e);
      }
    } else {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} OpenAPI is disabled, commands will not be sent.`);
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
    if (this.device.ble) {
      await this.BLEpushChanges();
    } else {
      await this.openAPIpushChanges();
    }
    interval(5000)
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus();
      });
  }

  async BLEpushChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE pushChanges On: ${this.On} OnCached: ${this.accessory.context.On}`);
    if (this.On !== this.accessory.context.On || this.allowPush) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE pushChanges`);
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
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with BLE Connection`);
            if (this.deviceLogging.includes('debug')) {
              this.errorLog(
                `${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with BLE Connection,`
                + ` Error Message: ${superStringify(e.message)}`,
              );
            }
            if (this.platform.debugMode) {
              this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with BLE Connection,`
              + ` Error: ${superStringify(e)}`);
            }
            if (this.platform.config.credentials?.token) {
              this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection`);
              await this.openAPIpushChanges();
            }
            this.apiError(e);
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
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with BLE Connection`);
            if (this.deviceLogging.includes('debug')) {
              this.errorLog(
                `${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with BLE Connection,`
                + ` Error Message: ${superStringify(e.message)}`,
              );
            }
            if (this.platform.debugMode) {
              this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with BLE Connection,`
              + ` Error: ${superStringify(e)}`);
            }
            if (this.platform.config.credentials?.token) {
              this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection`);
              await this.openAPIpushChanges();
            }
            this.apiError(e);
          });
      } else {
        throw new Error(`${this.device.deviceType}: ${this.accessory.displayName} Bot Mode: ${this.botMode}`);
      }
    }
    this.accessory.context.On = this.On;
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

  async openAPIpushChanges(): Promise<void> {
    if (this.platform.config.credentials?.token && this.OpenAPI) {
      try {
        if (this.On !== this.accessory.context.On || this.allowPush) {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} OpenAPI pushChanges`);
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
          this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API. body: ${body},`);
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
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${res.statusCode}`);
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
          this.accessory.context.On = this.On;
        }
      } catch (e: any) {
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection`);
        if (this.deviceLogging.includes('debug')) {
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,`
            + ` Error Message: ${superStringify(e.message)}`,
          );
        }
        if (this.platform.debugMode) {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,`
          + ` Error: ${superStringify(e)}`);
        }
        this.apiError(e);
      }
    } else {
      if (this.deviceLogging.includes('debug')) {
        this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} OpenAPI is disabled, device status will not be sent.`);
      }
    }
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
    if (this.device.ble) {
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
    if (this.device.ble) {
      this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, e);
      this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, e);
    }
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
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
        this.offlineOff();
        break;
      case 171:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Hub Device is offline. Hub: ${this.device.hubDeviceId}`);
        this.offlineOff();
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
      this.On = false;
      if (this.device.bot?.deviceType === 'switch') {
        this.switchService?.getCharacteristic(this.platform.Characteristic.On).updateValue(this.On);
      } else {
        this.outletService?.getCharacteristic(this.platform.Characteristic.On).updateValue(this.On);
      }
    }
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  async handleOnSet(value: CharacteristicValue): Promise<void> {
    if (this.device.bot?.deviceType === 'garagedoor') {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} TargetDoorState: ${value}`);
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
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} TargetPosition: ${value}`);
      if (value === 0) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else if (this.device.bot?.deviceType === 'lock') {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LockTargetState: ${value}`);
      if (value === this.platform.Characteristic.LockTargetState.SECURED) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else if (this.device.bot?.deviceType === 'faucet') {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Active: ${value}`);
      if (value === this.platform.Characteristic.Active.INACTIVE) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else if (this.device.bot?.deviceType === 'stateful') {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ProgrammableSwitchOutputState: ${value}`);
      if (value === 0) {
        this.On = false;
      } else {
        this.On = true;
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${value}`);
      this.On = value;
    }
    this.doBotUpdate.next();
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

  async config(device: device & devicesConfig): Promise<void> {
    let config = {};
    if (device.bot) {
      config = device.bot;
    }
    if (device.ble) {
      config['ble'] = device.ble;
    }
    if (device.openAPI !== undefined) {
      config['openAPI'] = device.openAPI;
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

  async refreshRate(device: device & devicesConfig): Promise<void> {
    if (device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = device.refreshRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options!.refreshRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
    }
  }

  async openAPI() {
    if (!this.device.openAPI) {
      this.OpenAPI = true;
    } else {
      this.OpenAPI = this.device.openAPI;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI: ${this.OpenAPI}`);
  }

  async scan(device: device & devicesConfig): Promise<void> {
    if (device.scanDuration) {
      this.scanDuration = this.accessory.context.scanDuration = device.scanDuration;
      if (device.ble) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config scanDuration: ${this.scanDuration}`);
      }
    } else {
      this.scanDuration = this.accessory.context.scanDuration = 1;
      if (this.device.ble) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Default scanDuration: ${this.scanDuration}`);
      }
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

  errorLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.error(String(...log));
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
