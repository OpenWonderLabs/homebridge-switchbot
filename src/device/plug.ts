import { Context } from 'vm';
import { request } from 'undici';
import { sleep } from '../utils';
import { interval, Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { device, devicesConfig, deviceStatus, ad, serviceData, switchbot, Devices } from '../settings';

export class Plug {
  // Services
  outletService: Service;

  // Characteristic Values
  On!: CharacteristicValue;

  // OpenAPI Others
  power: deviceStatus['power'];
  deviceStatus!: any; //deviceStatusResponse;

  // BLE Others
  connected?: boolean;
  switchbot!: switchbot;
  address!: ad['address'];
  serviceData!: serviceData;
  state: serviceData['state'];
  delay: serviceData['delay'];
  timer: serviceData['timer'];
  wifiRssi: serviceData['wifiRssi'];
  overload: serviceData['overload'];
  syncUtcTime: serviceData['syncUtcTime'];
  currentPower: serviceData['currentPower'];

  // Config
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;

  // Updates
  plugUpdateInProgress!: boolean;
  doPlugUpdate!: Subject<void>;

  // Connection
  private readonly BLE = (this.device.connectionType === 'BLE' || this.device.connectionType === 'BLE/OpenAPI');
  private readonly OpenAPI = (this.device.connectionType === 'OpenAPI' || this.device.connectionType === 'BLE/OpenAPI');

  constructor(private readonly platform: SwitchBotPlatform, private accessory: PlatformAccessory, public device: device & devicesConfig) {
    // default placeholders
    this.logs(device);
    this.scan(device);
    this.refreshRate(device);
    this.config(device);
    this.context();

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doPlugUpdate = new Subject();
    this.plugUpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, this.model(device))
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision(accessory, device))
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
      .updateValue(this.FirmwareRevision(accessory, device));

    // get the Outlet service if it exists, otherwise create a new Outlet service
    // you can create multiple services for each accessory
    (this.outletService = accessory.getService(this.platform.Service.Outlet) || accessory.addService(this.platform.Service.Outlet)),
    `${device.deviceName} ${device.deviceType}`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Outlet, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.outletService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
    if (!this.outletService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
      this.outletService.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
    }
    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Outlet

    // create handlers for required characteristics
    this.outletService.getCharacteristic(this.platform.Characteristic.On).onSet(this.OnSet.bind(this));

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.plugUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    // Watch for Plug change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doPlugUpdate
      .pipe(
        tap(() => {
          this.plugUpdateInProgress = true;
        }),
        debounceTime(this.platform.config.options!.pushRate! * 1000),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges();
        } catch (e: any) {
          this.apiError(e);
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType} Connection,`
            + ` Error Message: ${JSON.stringify(e.message)}`);
        }
        this.plugUpdateInProgress = false;
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
    // State
    switch (this.state) {
      case 'on':
        this.On = true;
        break;
      default:
        this.On = false;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
  }

  async openAPIparseStatus() {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
    switch (this.power) {
      case 'on':
        this.On = true;
        break;
      default:
        this.On = false;
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
          model: this.BLEmodel(),
          id: this.device.bleMac,
        })
        .then(async () => {
          // Set an event hander
          switchbot.onadvertisement = async (ad: any) => {
            this.address = ad.address;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac},`
              + ` BLE Address Found: ${this.address}`);
            this.serviceData = ad.serviceData;
            this.state = ad.serviceData.state;
            this.delay = ad.serviceData.delay;
            this.timer = ad.serviceData.timer;
            this.syncUtcTime = ad.serviceData.syncUtcTime;
            this.wifiRssi = ad.serviceData.wifiRssi;
            this.overload = ad.serviceData.overload;
            this.currentPower = ad.serviceData.currentPower;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
            this.debugLog(
              `${this.device.deviceType}: ${this.accessory.displayName} state: ${ad.serviceData.state}, ` +
              `delay: ${ad.serviceData.delay}, timer: ${ad.serviceData.timer}, syncUtcTime: ${ad.serviceData.syncUtcTime} ` +
              `wifiRssi: ${ad.serviceData.wifiRssi}, overload: ${ad.serviceData.overload}, currentPower: ${ad.serviceData.currentPower}`,
            );

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
          return await sleep(this.scanDuration * 1000);
        })
        .then(async () => {
          // Stop to monitor
          await this.stopScanning(switchbot);
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLERefreshStatus with ${this.device.connectionType}`
            + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
          await this.BLERefreshConnection(switchbot);
        });
    } else {
      await this.BLERefreshConnection(switchbot);
    }
  }

  async openAPIRefreshStatus() {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode, headers } = await request(`${Devices}/${this.device.deviceId}/status`, {
        headers: this.platform.generateHeaders(),
      });
      const deviceStatus = await body.json();
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Devices: ${JSON.stringify(deviceStatus.body)}`);
      this.statusCode(statusCode);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Headers: ${JSON.stringify(headers)}`);
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName
        } refreshStatus: ${JSON.stringify(deviceStatus)}`,
      );
      this.power = deviceStatus.body.power;
      this.openAPIparseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.apiError(e);
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIRefreshStatus with ${this.device.connectionType}`
        + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	commandType	  Command	    command parameter	  Description
   * Plug               -    "command"     "turnOff"   "default"	  =        set to OFF state
   * Plug               -    "command"     "turnOn"    "default"	  =        set to ON state
   * Plug Mini (US/JP)  -    "command"      turnOn      default     =        set to ON state
   * Plug Mini (US/JP)  -    "command"      turnOff     default     =        set to OFF state
   * Plug Mini (US/JP)  -    "command"      toggle      default     =        toggle state
   */

  async pushChanges(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} pushChanges enableCloudService: ${this.device.enableCloudService}`);
    } else if (this.BLE) {
      await this.BLEpushChanges();
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges();
    } else {
      await this.offlineOff();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:`
        + ` ${this.device.connectionType}, pushChanges will not happen.`);
    }
    // Refresh the status from the API
    interval(15000)
      .pipe(skipWhile(() => this.plugUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus();
      });
  }

  async BLEpushChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges`);
    if (this.On !== this.accessory.context.On) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges On: ${this.On} OnCached: ${this.accessory.context.On}`);
      const switchbot = await this.platform.connectBLE();
      // Convert to BLE Address
      this.device.bleMac = this.device
        .deviceId!.match(/.{1,2}/g)!
        .join(':')
        .toLowerCase();
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
      switchbot
        .discover({
          model: this.BLEmodel(),
          id: this.device.bleMac,
        })
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
          this.On = false;
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}`
            + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
          await this.BLEPushConnection();
        });
    } else {
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} No BLEpushChanges.` + `On: ${this.On}, `
        + `OnCached: ${this.accessory.context.On}`,
      );
    }
  }

  async openAPIpushChanges() {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);
    if (this.On !== this.accessory.context.On) {
      let command = '';
      if (this.On) {
        command = 'turnOn';
      } else {
        command = 'turnOff';
      }
      const bodyChange = JSON.stringify({
        'command': `${command}`,
        'parameter': 'default',
        'commandType': 'command',
      });
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode, headers } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        const deviceStatus = await body.json();
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Devices: ${JSON.stringify(deviceStatus.body)}`);
        this.statusCode(statusCode);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Headers: ${JSON.stringify(headers)}`);
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIpushChanges with ${this.device.connectionType}`
          + ` Connection, Error Message: ${JSON.stringify(e.message)}`,
        );
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No openAPIpushChanges.` + `On: ${this.On}, `
        + `OnCached: ${this.accessory.context.On}`);
    }
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    if (this.On === this.accessory.context.On) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set On: ${value}`);
    } else {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set On: ${value}`);
    }

    this.On = value;
    this.doPlugUpdate.next();
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    if (this.On === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
    } else {
      this.accessory.context.On = this.On;
      this.outletService.updateCharacteristic(this.platform.Characteristic.On, this.On);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
    }
  }

  async stopScanning(switchbot: any) {
    switchbot.stopScan();
    if (this.connected) {
      await this.BLEparseStatus();
      await this.updateHomeKitCharacteristics();
    } else {
      await this.BLERefreshConnection(switchbot);
    }
  }

  BLEmodel(): 'g' | 'j' {
    if (this.device.deviceType === 'Plug Mini (US)') {
      return 'g';
    } else {
      return 'j';
    }
  }

  async getCustomBLEAddress(switchbot: any) {
    if (this.device.customBLEaddress && this.deviceLogging.includes('debug')) {
      (async () => {
        // Start to monitor advertisement packets
        await switchbot.startScan({
          model: this.BLEmodel(),
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
    this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`);
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

  model(device: device & devicesConfig): string {
    let model: string;
    if (device.deviceType === 'Plug Mini (US)') {
      model = 'W1901400';
    } else if (device.deviceType === 'Plug Mini (JP)') {
      model = 'W2001400';
    } else {
      model = 'SP11';
    }
    return model;
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
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Hub Device is offline, statusCode: ${statusCode}. `
          + `Hub: ${this.device.hubDeviceId}`);
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
      default:
        this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Unknown statusCode: `
          + `${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`);
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      await this.context();
      await this.updateHomeKitCharacteristics();
    }
  }

  async apiError(e: any): Promise<void> {
    this.outletService.updateCharacteristic(this.platform.Characteristic.On, e);
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
    } else {
      this.On = this.accessory.context.On;
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

  async config(device: device & devicesConfig): Promise<void> {
    let config = {};
    if (device.plug) {
      config = device.plug;
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
    if (Object.entries(config).length !== 0) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
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
