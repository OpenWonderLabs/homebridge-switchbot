import { AxiosResponse } from 'axios';
import { interval, Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { DeviceURL, device, devicesConfig, deviceStatusResponse, payload, deviceStatus, ad, serviceData, switchbot } from '../settings';
import { Context } from 'vm';

export class Plug {
  // Services
  outletService: Service;

  // Characteristic Values
  On!: CharacteristicValue;
  OnCached!: CharacteristicValue;

  // OpenAPI Others
  power: deviceStatus['power'];
  deviceStatus!: deviceStatusResponse;

  // BLE Others
  connected?: boolean;
  switchbot!: switchbot;
  SwitchToOpenAPI?: boolean;
  serviceData!: serviceData;
  address!: ad['address'];

  // Config
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;

  // Updates
  plugUpdateInProgress!: boolean;
  doPlugUpdate!: Subject<void>;
  state: serviceData['state'];
  delay: serviceData['delay'];
  timer: serviceData['timer'];
  syncUtcTime: serviceData['syncUtcTime'];
  wifiRssi: serviceData['wifiRssi'];
  overload: serviceData['overload'];
  currentPower: serviceData['currentPower'];

  constructor(private readonly platform: SwitchBotPlatform, private accessory: PlatformAccessory, public device: device & devicesConfig) {
    // default placeholders
    this.logs(device);
    this.scan(device);
    this.refreshRate(device);
    this.config(device);
    if (this.On === undefined) {
      this.On = false;
    } else {
      this.On = this.accessory.context.On;
    }

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

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Outlet

    // create handlers for required characteristics
    this.outletService.getCharacteristic(this.platform.Characteristic.On).onSet(this.handleOnSet.bind(this));

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
          this.errorLog(`Plug: ${this.accessory.displayName} failed pushChanges`);
          if (this.deviceLogging.includes('debug')) {
            this.errorLog(`Plug: ${this.accessory.displayName} failed pushChanges,` + ` Error Message: ${JSON.stringify(e.message)}`);
          }
          this.apiError(e);
        }
        this.plugUpdateInProgress = false;
      });
  }

  async parseStatus(): Promise<void> {
    if (this.SwitchToOpenAPI || !this.device.ble) {
      await this.openAPIparseStatus();
    } else {
      await this.BLEparseStatus();
    }
  }

  async BLEparseStatus(): Promise<void> {
    this.debugLog(`Plug: ${this.accessory.displayName} BLE parseStatus`);
    // State
    switch (this.state) {
      case 'on':
        this.On = true;
        break;
      default:
        this.On = false;
    }
    this.debugLog(`Plug: ${this.accessory.displayName} On: ${this.On}`);
  }

  async openAPIparseStatus() {
    switch (this.power) {
      case 'on':
        this.On = true;
        break;
      default:
        this.On = false;
    }
    this.debugLog(`Plug: ${this.accessory.displayName} On: ${this.On}`);
  }

  async refreshStatus(): Promise<void> {
    if (this.device.ble) {
      await this.BLERefreshStatus();
    } else {
      await this.openAPIRefreshStatus();
    }
  }

  async BLERefreshStatus(): Promise<void> {
    this.debugLog(`Plug: ${this.accessory.displayName} BLE refreshStatus`);
    const switchbot = await this.platform.connectBLE();
    // Convert to BLE Address
    this.device.bleMac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(':')
      .toLowerCase();
    this.debugLog(`Plug: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    this.getCustomBLEAddress(switchbot);
    // Start to monitor advertisement packets
    if (switchbot !== false) {
      switchbot
        .startScan({
          model: this.BLEmodel(),
          id: this.device.bleMac,
        })
        .then(() => {
          // Set an event hander
          switchbot.onadvertisement = (ad: any) => {
            this.address = ad.address;
            if (this.deviceLogging.includes('debug')) {
              this.infoLog(this.address);
              this.infoLog(this.device.bleMac);
              this.infoLog(`Plug: ${this.accessory.displayName} BLE Address Found: ${this.address}`);
              this.infoLog(`Plug: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac}`);
            }
            this.serviceData = ad.serviceData;
            this.state = ad.serviceData.state;
            this.delay = ad.serviceData.delay;
            this.timer = ad.serviceData.timer;
            this.syncUtcTime = ad.serviceData.syncUtcTime;
            this.wifiRssi = ad.serviceData.wifiRssi;
            this.overload = ad.serviceData.overload;
            this.currentPower = ad.serviceData.currentPower;
            this.debugLog(`Plug: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
            this.debugLog(
              `Plug: ${this.accessory.displayName} state: ${ad.serviceData.state}, ` +
                `delay: ${ad.serviceData.delay}, timer: ${ad.serviceData.timer}, syncUtcTime: ${ad.serviceData.syncUtcTime} ` +
                `wifiRssi: ${ad.serviceData.wifiRssi}, overload: ${ad.serviceData.overload}, currentPower: ${ad.serviceData.currentPower}`,
            );

            if (this.serviceData) {
              this.connected = true;
              this.debugLog(`Plug: ${this.accessory.displayName} connected: ${this.connected}`);
            } else {
              this.connected = false;
              this.debugLog(`Plug: ${this.accessory.displayName} connected: ${this.connected}`);
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
            await this.BLEconnection(switchbot);
          }
        })
        .catch(async (e: any) => {
          this.errorLog(`Plug: ${this.accessory.displayName} failed refreshStatus with BLE Connection`);
          if (this.deviceLogging.includes('debug')) {
            this.errorLog(
              `Plug: ${this.accessory.displayName} failed refreshStatus with BLE Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
            );
          }
          if (this.platform.config.credentials?.openToken) {
            this.warnLog(`Plug: ${this.accessory.displayName} Using OpenAPI Connection`);
            this.SwitchToOpenAPI = true;
            await this.openAPIRefreshStatus();
          }
          this.apiError(e);
        });
    } else {
      await this.BLEconnection(switchbot);
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
          this.warnLog(JSON.stringify(ad, null, '  '));
        };
        await switchbot.wait(10000);
        // Stop to monitor
        switchbot.stopScan();
      })();
    }
  }

  async BLEconnection(switchbot: any): Promise<void> {
    this.errorLog(`Plug: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchPlug: ${switchbot}`);
    if (this.platform.config.credentials?.openToken) {
      this.warnLog(`Plug: ${this.accessory.displayName} Using OpenAPI Connection`);
      this.SwitchToOpenAPI = true;
      await this.openAPIRefreshStatus();
    }
  }

  async openAPIRefreshStatus() {
    try {
      this.deviceStatus = (await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)).data;
      this.debugLog(`Plug: ${this.accessory.displayName} refreshStatus: ${JSON.stringify(this.deviceStatus)}`);
      this.power = this.deviceStatus.body.power;
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.errorLog(`Plug: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection`);
      if (this.deviceLogging.includes('debug')) {
        this.errorLog(
          `Plug: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      this.apiError(e);
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
    if (this.device.ble) {
      await this.BLEpushChanges();
    } else {
      await this.openAPIpushChanges();
    }
  }

  async BLEpushChanges(): Promise<void> {
    this.debugLog(`Plug: ${this.accessory.displayName} BLE pushChanges On: ${this.On} OnCached: ${this.OnCached}`);
    this.debugLog(`Plug: ${this.accessory.displayName} BLE pushChanges`);
    const switchbot = await this.platform.connectBLE();
    // Convert to BLE Address
    this.device.bleMac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(':')
      .toLowerCase();
    this.debugLog(`Plug: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    switchbot
      .discover({
        model: this.BLEmodel(),
        id: this.device.bleMac,
      })
      .then((device_list: any) => {
        this.infoLog(`Bot: ${this.accessory.displayName} On: ${this.On}`);
        return this.turnOnOff(device_list);
      })
      .then(() => {
        this.debugLog(`Plug: ${this.accessory.displayName} Done.`);
        this.On = false;
        this.OnCached = this.On;
        this.accessory.context.On = this.OnCached;
      })
      .catch(async (e: any) => {
        this.errorLog(`Plug: ${this.accessory.displayName} failed pushChanges with BLE Connection`);
        if (this.deviceLogging.includes('debug')) {
          this.errorLog(
            `Plug: ${this.accessory.displayName} failed pushChanges with BLE Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
          );
        }
        if (this.platform.debugMode) {
          this.errorLog(`Plug: ${this.accessory.displayName} failed pushChanges with BLE Connection,` + ` Error: ${JSON.stringify(e)}`);
        }
        if (this.platform.config.credentials?.openToken) {
          this.warnLog(`Plug: ${this.accessory.displayName} Using OpenAPI Connection`);
          await this.openAPIpushChanges();
        }
        this.apiError(e);
      });
    this.OnCached = this.On;
    this.accessory.context.On = this.OnCached;
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

  async openAPIpushChanges() {
    if (this.platform.config.credentials?.openToken) {
      if (this.On !== this.OnCached) {
        this.debugLog(`Bot: ${this.accessory.displayName} OpenAPI pushChanges`);
        const payload = {
          commandType: 'command',
          parameter: 'default',
        } as payload;

        if (this.On) {
          payload.command = 'turnOn';
        } else {
          payload.command = 'turnOff';
        }

        this.infoLog(
          `Plug: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},` +
            ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`,
        );

        // Make the API request
        const push: any = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
        this.debugLog(`Plug: ${this.accessory.displayName} pushchanges: ${JSON.stringify(push.data)}`);
        this.statusCode(push);
        this.OnCached = this.On;
        this.accessory.context.On = this.OnCached;
      }
      interval(5000)
        .pipe(take(1))
        .subscribe(async () => {
          await this.refreshStatus();
        });
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    if (this.On === undefined) {
      this.debugLog(`Plug: ${this.accessory.displayName} On: ${this.On}`);
    } else {
      this.outletService.updateCharacteristic(this.platform.Characteristic.On, this.On);
      this.debugLog(`Plug: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
    }
  }

  async apiError(e: any): Promise<void> {
    this.outletService.updateCharacteristic(this.platform.Characteristic.On, e);
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  async statusCode(push: AxiosResponse<{ statusCode: number }>): Promise<void> {
    switch (push.data.statusCode) {
      case 151:
        this.errorLog(`Plug: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.errorLog(`Plug: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.errorLog(`Plug: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.errorLog(`Plug: ${this.accessory.displayName} Device is offline.`);
        this.offlineOff();
        break;
      case 171:
        this.errorLog(`Plug: ${this.accessory.displayName} Hub Device is offline. Hub: ${this.device.hubDeviceId}`);
        this.offlineOff();
        break;
      case 190:
        this.errorLog(
          `Plug: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
            ` Or command: ${JSON.stringify(push.data)} format is invalid`,
        );
        break;
      case 100:
        this.debugLog(`Plug: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.debugLog(`Plug: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      this.On = false;
      this.outletService.getCharacteristic(this.platform.Characteristic.On).updateValue(this.On);
    }
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async handleOnSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`Plug: ${this.accessory.displayName} - Set On: ${value}`);

    this.On = value;
    this.doPlugUpdate.next();
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
    if (device.plug) {
      config = device.plug;
    }
    if (device.ble !== undefined) {
      config['ble'] = device.ble;
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
      this.infoLog(`Plug: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  async refreshRate(device: device & devicesConfig): Promise<void> {
    if (device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = device.refreshRate;
      this.debugLog(`Plug: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options!.refreshRate;
      this.debugLog(`Plug: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
    }
  }

  async scan(device: device & devicesConfig): Promise<void> {
    if (device.scanDuration) {
      this.scanDuration = this.accessory.context.scanDuration = device.scanDuration;
      if (device.ble) {
        this.debugLog(`Plug: ${this.accessory.displayName} Using Device Config scanDuration: ${this.scanDuration}`);
      }
    } else {
      this.scanDuration = this.accessory.context.scanDuration = 1;
      if (this.device.ble) {
        this.debugLog(`Plug: ${this.accessory.displayName} Using Default scanDuration: ${this.scanDuration}`);
      }
    }
  }

  async logs(device: device & devicesConfig): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugLog(`Plug: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(`Plug: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      this.debugLog(`Plug: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugLog(`Plug: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
    }
  }

  FirmwareRevision(accessory: PlatformAccessory<Context>, device: device & devicesConfig): CharacteristicValue {
    let FirmwareRevision: string;
    this.debugLog(`Plug: ${this.accessory.displayName} accessory.context.FirmwareRevision: ${accessory.context.FirmwareRevision}`);
    this.debugLog(`Plug: ${this.accessory.displayName} device.firmware: ${device.firmware}`);
    this.debugLog(`Plug: ${this.accessory.displayName} this.platform.version: ${this.platform.version}`);
    if (accessory.context.FirmwareRevision) {
      FirmwareRevision = accessory.context.FirmwareRevision;
    } else if (device.firmware) {
      FirmwareRevision = device.firmware;
    } else {
      FirmwareRevision = this.platform.version;
    }
    return FirmwareRevision;
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
