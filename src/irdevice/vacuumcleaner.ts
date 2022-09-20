import https from 'https';
import crypto from 'crypto';
import { IncomingMessage } from 'http';
import { SwitchBotPlatform } from '../platform';
import { irDevicesConfig, irdevice, HostDomain, DevicePath } from '../settings';
import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class VacuumCleaner {
  // Services
  switchService!: Service;

  // Characteristic Values
  On!: CharacteristicValue;
  OnCached!: CharacteristicValue;

  // Config
  deviceLogging!: string;

  constructor(private readonly platform: SwitchBotPlatform, private accessory: PlatformAccessory, public device: irdevice & irDevicesConfig) {
    // default placeholders
    this.logs(device);
    this.config(device);
    if (this.On === undefined) {
      this.On = false;
    } else {
      this.On = this.accessory.context.On;
    }

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, device.remoteType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!);

    // get the Television service if it exists, otherwise create a new Television service
    // you can create multiple services for each accessory
    (this.switchService = accessory.getService(this.platform.Service.Switch) || accessory.addService(this.platform.Service.Switch)),
    `${accessory.displayName} Vacuum`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Outlet, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.switchService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // handle on / off events using the On characteristic
    this.switchService.getCharacteristic(this.platform.Characteristic.On).onSet(this.OnSet.bind(this));
  }

  async OnSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`Vacuum Cleaner: ${this.accessory.displayName} On: ${value}`);
    this.On = value;
    if (this.On) {
      await this.pushOnChanges();
    } else {
      await this.pushOffChanges();
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    if (this.On === undefined) {
      this.debugLog(`Vacuum Cleaner: ${this.accessory.displayName} On: ${this.On}`);
    } else {
      this.switchService?.updateCharacteristic(this.platform.Characteristic.On, this.On);
      this.debugLog(`Vacuum Cleaner: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	commandType     Command	          command parameter	         Description
   * Light:        "command"       "turnOff"         "default"	        =        set to OFF state
   * Light:        "command"       "turnOn"          "default"	        =        set to ON state
   * Light:        "command"       "volumeAdd"       "default"	        =        volume up
   * Light:        "command"       "volumeSub"       "default"	        =        volume down
   * Light:        "command"       "channelAdd"      "default"	        =        next channel
   * Light:        "command"       "channelSub"      "default"	        =        previous channel
   */
  async pushOnChanges(): Promise<void> {
    if (this.On) {
      const body = JSON.stringify({
        'command': 'turnOn',
        'parameter': 'default',
        'commandType': 'command',
      });
      await this.pushChanges(body);
    }
  }

  async pushOffChanges(): Promise<void> {
    if (!this.On) {
      const body = JSON.stringify({
        'command': 'turnOff',
        'parameter': 'default',
        'commandType': 'command',
      });
      await this.pushChanges(body);
    }
  }

  async pushChanges(body): Promise<void> {
    try {
      // Make Push On request to the API
      const t = Date.now();
      const nonce = 'requestID';
      const data = this.platform.config.credentials?.token + t + nonce;
      const signTerm = crypto.createHmac('sha256', this.platform.config.credentials?.secret)
        .update(Buffer.from(data, 'utf-8'))
        .digest();
      const sign = signTerm.toString('base64');
      this.debugLog(`Vacuum Cleaner: ${this.accessory.displayName} sign: ${sign}`);
      this.infoLog(`Vacuum Cleaner: ${this.accessory.displayName} Sending request to SwitchBot API. body: ${body},`);
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
        this.debugLog(`Vacuum Cleaner: ${this.accessory.displayName} statusCode: ${res.statusCode}`);
        this.statusCode({ res });
        res.on('data', d => {
          this.debugLog(`Vacuum Cleaner: ${this.accessory.displayName} d: ${d}`);
        });
      });
      req.on('error', (e: any) => {
        this.errorLog(`Vacuum Cleaner: ${this.accessory.displayName} error message: ${e.message}`);
      });
      req.write(body);
      req.end();
      this.debugLog(`Vacuum Cleaner: ${this.accessory.displayName} pushchanges: ${JSON.stringify(req)}`);
      this.OnCached = this.On;
      this.accessory.context.On = this.OnCached;
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.errorLog(`Vacuum Cleaner: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection`);
      if (this.deviceLogging.includes('debug')) {
        this.errorLog(
          `Vacuum Cleaner: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` +
            ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      this.apiError(e);
    }
  }

  async statusCode({ res }: { res: IncomingMessage }): Promise<void> {
    switch (res.statusCode) {
      case 151:
        this.errorLog(`Vacuum Cleaner: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.errorLog(`Vacuum Cleaner: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.errorLog(`Vacuum Cleaner: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.errorLog(`Vacuum Cleaner: ${this.accessory.displayName} Device is offline.`);
        break;
      case 171:
        this.errorLog(`Vacuum Cleaner: ${this.accessory.displayName} Hub Device is offline. Hub: ${this.device.hubDeviceId}`);
        break;
      case 190:
        this.errorLog(
          `Vacuum Cleaner: ${this.accessory.displayName} Device internal error due to device states not synchronized` +
            ` with server, Or command: ${JSON.stringify(res)} format is invalid`,
        );
        break;
      case 100:
        this.debugLog(`Vacuum Cleaner: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.debugLog(`Vacuum Cleaner: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  async apiError(e: any): Promise<void> {
    this.switchService.updateCharacteristic(this.platform.Characteristic.On, e);
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  async config(device: irdevice & irDevicesConfig): Promise<void> {
    let config = {};
    if (device.irvc) {
      config = device.irvc;
    }
    if (device.logging !== undefined) {
      config['logging'] = device.logging;
    }
    if (Object.entries(config).length !== 0) {
      this.infoLog(`Vacuum Cleaner: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  async logs(device: irdevice & irDevicesConfig): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugLog(`Vacuum Cleaner: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(`Vacuum Cleaner: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      this.debugLog(`Vacuum Cleaner: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugLog(`Vacuum Cleaner: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
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
