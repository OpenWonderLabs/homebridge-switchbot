import https from 'https';
import crypto from 'crypto';
import { Context } from 'vm';
import { IncomingMessage } from 'http';
import { interval, Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { device, devicesConfig, payload, deviceStatus, HostDomain, DevicePath } from '../settings';

export class Lock {
  // Services
  lockService: Service;
  contactSensorService?: Service;

  // Characteristic Values
  ContactSensorState!: CharacteristicValue;
  LockCurrentState!: CharacteristicValue;
  LockTargetState!: CharacteristicValue;

  // OpenAPI Others
  doorState!: deviceStatus['doorState'];
  lockState!: deviceStatus['lockState'];
  deviceStatus!: any; //deviceStatusResponse;

  // Config
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;

  // Updates
  lockUpdateInProgress!: boolean;
  doLockUpdate!: Subject<void>;

  constructor(private readonly platform: SwitchBotPlatform, private accessory: PlatformAccessory, public device: device & devicesConfig) {
    // default placeholders
    this.logs(device);
    this.scan(device);
    this.refreshRate(device);
    this.config(device);
    if (this.LockTargetState === undefined) {
      this.LockTargetState = false;
    } else {
      this.LockTargetState = this.accessory.context.On;
    }

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doLockUpdate = new Subject();
    this.lockUpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'W1601700')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision(accessory, device))
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
      .updateValue(this.FirmwareRevision(accessory, device));

    // get the LockMechanism service if it exists, otherwise create a new LockMechanism service
    // you can create multiple services for each accessory
    (this.lockService = accessory.getService(this.platform.Service.LockMechanism) || accessory.addService(this.platform.Service.LockMechanism)),
    `${device.deviceName} ${device.deviceType}`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.LockMechanism, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.lockService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/LockMechanism

    // create handlers for required characteristics
    this.lockService.getCharacteristic(this.platform.Characteristic.LockTargetState).onSet(this.LockTargetStateSet.bind(this));

    // Contact Sensor Service
    if (device.lock?.hide_contactsensor) {
      this.debugLog(`Lock: ${accessory.displayName} Removing Contact Sensor Service`);
      this.contactSensorService = this.accessory.getService(this.platform.Service.ContactSensor);
      accessory.removeService(this.contactSensorService!);
    } else if (!this.contactSensorService) {
      this.debugLog(`Lock: ${accessory.displayName} Add Contact Sensor Service`);
      (this.contactSensorService =
        this.accessory.getService(this.platform.Service.ContactSensor) || this.accessory.addService(this.platform.Service.ContactSensor)),
      `${accessory.displayName} Contact Sensor`;

      this.contactSensorService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Contact Sensor`);
    } else {
      this.debugLog(`Lock: ${accessory.displayName} Contact Sensor Service Not Added`);
    }

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.lockUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    // Watch for Lock change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doLockUpdate
      .pipe(
        tap(() => {
          this.lockUpdateInProgress = true;
        }),
        debounceTime(this.platform.config.options!.pushRate! * 1000),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges();
        } catch (e: any) {
          this.errorLog(`Lock: ${this.accessory.displayName} failed pushChanges`);
          if (this.deviceLogging.includes('debug')) {
            this.errorLog(`Lock: ${this.accessory.displayName} failed pushChanges,` + ` Error Message: ${JSON.stringify(e.message)}`);
          }
          this.apiError(e);
        }
        this.lockUpdateInProgress = false;
      });
  }

  //{"deviceId":"DBDC23B53139","deviceType":"Smart Lock","hubDeviceId":"E68B14109DA2","lockState":"locked","doorState":"opened","calibrate":true}

  async parseStatus(): Promise<void> {
    switch (this.lockState) {
      case 'locked':
        this.LockCurrentState = this.platform.Characteristic.LockCurrentState.SECURED;
        this.LockTargetState = this.platform.Characteristic.LockTargetState.SECURED;
        break;
      default:
        this.LockCurrentState = this.platform.Characteristic.LockCurrentState.UNSECURED;
        this.LockTargetState = this.platform.Characteristic.LockTargetState.UNSECURED;
    }
    switch (this.doorState) {
      case 'opened':
        this.ContactSensorState = this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
        break;
      default:
        this.ContactSensorState = this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;
    }
    this.debugLog(`Lock: ${this.accessory.displayName} On: ${this.LockTargetState}`);
  }

  async refreshStatus(): Promise<void> {
    try {
      const t = Date.now();
      const nonce = 'requestID';
      const data = this.platform.config.credentials?.token + t + nonce;
      const signTerm = crypto.createHmac('sha256', this.platform.config.credentials?.secret).update(Buffer.from(data, 'utf-8')).digest();
      const sign = signTerm.toString('base64');
      this.debugLog(`Lock: ${this.accessory.displayName} sign: ${sign}`);
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
        this.debugLog(`Lock: ${this.accessory.displayName} statusCode: ${res.statusCode}`);
        let rawData = '';
        res.on('data', (d) => {
          rawData += d;
          this.debugLog(`Lock: ${this.accessory.displayName} d: ${d}`);
        });
        res.on('end', () => {
          try {
            this.deviceStatus = JSON.parse(rawData);
            this.debugLog(`Lock: ${this.accessory.displayName} refreshStatus: ${JSON.stringify(this.deviceStatus)}`);
            this.lockState = this.deviceStatus.body.lockState;
            this.doorState = this.deviceStatus.body.doorState;
            this.parseStatus();
            this.updateHomeKitCharacteristics();
          } catch (e: any) {
            this.errorLog(`Lock: ${this.accessory.displayName} error message: ${e.message}`);
          }
        });
      });
      req.on('error', (e: any) => {
        this.errorLog(`Lock: ${this.accessory.displayName} error message: ${e.message}`);
      });
      req.end();
    } catch (e: any) {
      this.errorLog(`Lock: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection`);
      if (this.deviceLogging.includes('debug')) {
        this.errorLog(
          `Lock: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      this.apiError(e);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	commandType	  Command	    command parameter	  Description
   * Lock   -    "command"     "lock"     "default"	 =        set to ???? state
   * Lock   -    "command"     "unlock"   "default"	 =        set to ???? state - LockCurrentState
   */
  async pushChanges(): Promise<void> {
    const payload = {
      commandType: 'command',
      parameter: 'default',
    } as payload;

    if (this.LockTargetState) {
      payload.command = 'lock';
    } else {
      payload.command = 'unlock';
    }

    this.infoLog(
      `Lock: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},` +
        ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`,
    );

    // Make the API request
    const t = Date.now();
    const nonce = 'requestID';
    const data = this.platform.config.credentials?.token + t + nonce;
    const signTerm = crypto.createHmac('sha256', this.platform.config.credentials?.secret).update(Buffer.from(data, 'utf-8')).digest();
    const sign = signTerm.toString('base64');
    this.debugLog(`Lock: ${this.accessory.displayName} sign: ${sign}`);
    const options = {
      hostname: 'api.switch-bot.com',
      port: 443,
      path: `/v1.1/devices/${this.device.deviceId}/commands`,
      method: 'POST',
      headers: {
        Authorization: this.platform.config.credentials?.token,
        sign: sign,
        nonce: nonce,
        t: t,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      this.debugLog(`Lock: ${this.accessory.displayName} statusCode: ${res.statusCode}`);
      this.statusCode({ res });
      res.on('data', (d) => {
        this.debugLog(`Lock: ${this.accessory.displayName} d: ${d}`);
      });
    });

    req.on('error', (error) => {
      this.errorLog(`Lock: ${this.accessory.displayName} error: ${error}`);
    });

    req.write(payload);
    req.end();

    this.debugLog(`Lock: ${this.accessory.displayName} pushchanges: ${JSON.stringify(req)}`);
    this.accessory.context.On = this.LockTargetState;
    interval(5000)
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus();
      });
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    if (!this.device.lock?.hide_contactsensor) {
      if (this.ContactSensorState === undefined) {
        this.debugLog(`Lock: ${this.accessory.displayName} ContactSensorState: ${this.ContactSensorState}`);
      } else {
        this.contactSensorService?.updateCharacteristic(this.platform.Characteristic.ContactSensorState, this.ContactSensorState);
        this.debugLog(`Lock: ${this.accessory.displayName} updateCharacteristic ContactSensorState: ${this.ContactSensorState}`);
      }
    }
    if (this.LockTargetState === undefined) {
      this.debugLog(`Lock: ${this.accessory.displayName} LockTargetState: ${this.LockTargetState}`);
    } else {
      this.lockService.updateCharacteristic(this.platform.Characteristic.LockTargetState, this.LockTargetState);
      this.debugLog(`Lock: ${this.accessory.displayName} updateCharacteristic LockTargetState: ${this.LockTargetState}`);
    }
    if (this.LockCurrentState === undefined) {
      this.debugLog(`Lock: ${this.accessory.displayName} LockCurrentState: ${this.LockCurrentState}`);
    } else {
      this.lockService.updateCharacteristic(this.platform.Characteristic.LockCurrentState, this.LockCurrentState);
      this.debugLog(`Lock: ${this.accessory.displayName} updateCharacteristic LockCurrentState: ${this.LockCurrentState}`);
    }
  }

  async apiError(e: any): Promise<void> {
    if (!this.device.lock?.hide_contactsensor) {
      this.contactSensorService?.updateCharacteristic(this.platform.Characteristic.ContactSensorState, e);
    }
    this.lockService.updateCharacteristic(this.platform.Characteristic.LockTargetState, e);
    this.lockService.updateCharacteristic(this.platform.Characteristic.LockCurrentState, e);
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  async statusCode({ res }: { res: IncomingMessage }): Promise<void> {
    switch (res.statusCode) {
      case 151:
        this.errorLog(`Lock: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.errorLog(`Lock: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.errorLog(`Lock: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.errorLog(`Lock: ${this.accessory.displayName} Device is offline.`);
        break;
      case 171:
        this.errorLog(`Lock: ${this.accessory.displayName} Hub Device is offline. Hub: ${this.device.hubDeviceId}`);
        break;
      case 190:
        this.errorLog(
          `Lock: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
            ` Or command: ${JSON.stringify(res)} format is invalid`,
        );
        break;
      case 100:
        this.debugLog(`Lock: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.debugLog(`Lock: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async LockTargetStateSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`Lock: ${this.accessory.displayName} Set LockTargetState: ${value}`);

    this.LockTargetState = value;
    this.doLockUpdate.next();
  }

  async config(device: device & devicesConfig): Promise<void> {
    let config = {};
    if (device.lock) {
      config = device.lock;
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
    if (Object.entries(config).length !== 0) {
      this.infoLog(`Lock: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  async refreshRate(device: device & devicesConfig): Promise<void> {
    if (device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = device.refreshRate;
      this.debugLog(`Lock: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options!.refreshRate;
      this.debugLog(`Lock: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
    }
  }

  async scan(device: device & devicesConfig): Promise<void> {
    if (device.scanDuration) {
      this.scanDuration = this.accessory.context.scanDuration = device.scanDuration;
      if (device.ble) {
        this.debugLog(`Lock: ${this.accessory.displayName} Using Device Config scanDuration: ${this.scanDuration}`);
      }
    } else {
      this.scanDuration = this.accessory.context.scanDuration = 1;
      if (this.device.ble) {
        this.debugLog(`Lock: ${this.accessory.displayName} Using Default scanDuration: ${this.scanDuration}`);
      }
    }
  }

  async logs(device: device & devicesConfig): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugLog(`Lock: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(`Lock: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      this.debugLog(`Lock: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugLog(`Lock: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
    }
  }

  FirmwareRevision(accessory: PlatformAccessory<Context>, device: device & devicesConfig): CharacteristicValue {
    let FirmwareRevision: string;
    this.debugLog(`Lock: ${this.accessory.displayName} accessory.context.FirmwareRevision: ${accessory.context.FirmwareRevision}`);
    this.debugLog(`Lock: ${this.accessory.displayName} device.firmware: ${device.firmware}`);
    this.debugLog(`Lock: ${this.accessory.displayName} this.platform.version: ${this.platform.version}`);
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
