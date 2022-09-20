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
export class Others {
  // Services
  fanService?: Service;

  // Characteristic Values
  Active!: CharacteristicValue;
  ActiveCached!: CharacteristicValue;

  // Config
  deviceLogging!: string;
  otherDeviceType?: string;

  constructor(private readonly platform: SwitchBotPlatform, private accessory: PlatformAccessory, public device: irdevice & irDevicesConfig) {
    // default placeholders
    this.logs(device);
    this.deviceType(device);
    this.config(device);
    if (this.Active === undefined) {
      this.Active = this.platform.Characteristic.Active.INACTIVE;
    } else {
      this.Active = this.accessory.context.Active;
    }

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, device.remoteType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!);

    // get the Television service if it exists, otherwise create a new Television service
    // you can create multiple services for each accessory
    if (this.otherDeviceType !== 'Fan') {
      this.debugLog(`Other: ${accessory.displayName} Removing Fanv2 Service`);

      if (this.otherDeviceType === undefined) {
        this.errorLog(`Other: ${this.accessory.displayName} No Device Type Set, deviceType: ${device.other?.deviceType}`);
      }
      this.fanService = this.accessory.getService(this.platform.Service.Fanv2);
      accessory.removeService(this.fanService!);
    } else if (!this.fanService && this.otherDeviceType === 'Fan') {
      this.debugLog(`Other: ${accessory.displayName} Add Fanv2 Service`);
      (this.fanService = this.accessory.getService(this.platform.Service.Fanv2) || this.accessory.addService(this.platform.Service.Fanv2)),
      `${accessory.displayName} Fan`;

      this.fanService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Fan`);

      this.fanService.getCharacteristic(this.platform.Characteristic.Active).onSet(this.ActiveSet.bind(this));
    } else {
      this.debugLog(`Other: ${accessory.displayName} Fanv2 Service Not Added, deviceType: ${device.other?.deviceType}`);
    }
  }

  async ActiveSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`Other: ${this.accessory.displayName} On: ${value}`);
    if (value) {
      await this.pushOnChanges();
    } else {
      await this.pushOffChanges();
    }
    this.Active = value;
    this.ActiveCached = this.Active;
    this.accessory.context.Active = this.ActiveCached;
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    if (this.Active === undefined) {
      this.debugLog(`Other: ${this.accessory.displayName} Active: ${this.Active}`);
    } else {
      this.fanService?.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
      this.debugLog(`Other: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`);
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
    if (this.platform.config.options) {
      if (this.device.other) {
        if (this.device.other.commandOn) {
          if (!this.Active) {
            const payload = {
              commandType: 'customize',
              parameter: 'default',
              command: `${this.device.other.commandOn}`,
            };
            await this.pushChanges(payload);
          }
        } else {
          this.errorLog(`Other: ${this.accessory.displayName} On Command not set, commandOn: ${this.device.other.commandOn}`);
        }
      } else {
        this.errorLog(`Other: ${this.accessory.displayName} On Command not set, other: ${this.device.other}`);
      }
    } else {
      this.errorLog(`Other: ${this.accessory.displayName} On Command not set`);
    }
  }

  async pushOffChanges(): Promise<void> {
    if (this.platform.config.options) {
      if (this.device.other) {
        if (this.device.other.commandOff) {
          if (this.Active) {
            const payload = {
              commandType: 'customize',
              parameter: 'default',
              command: `${this.device.other.commandOff}`,
            };
            await this.pushChanges(payload);
          }
        } else {
          this.errorLog(`Other: ${this.accessory.displayName} Off Command not set, commandOff: ${this.device.other.commandOff}`);
        }
      } else {
        this.errorLog(`Other: ${this.accessory.displayName} Off Command not set, other: ${this.device.other}`);
      }
    } else {
      this.errorLog(`Other: ${this.accessory.displayName} Off Command not set.`);
    }
  }

  async pushChanges(payload): Promise<void> {
    try {
      this.infoLog(
        `Other: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},` +
          ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`,
      );

      // Make the API request
      const t = Date.now();
      const nonce = 'requestID';
      const data = this.platform.config.credentials?.token + t + nonce;
      const signTerm = crypto.createHmac('sha256', this.platform.config.credentials?.secret).update(Buffer.from(data, 'utf-8')).digest();
      const sign = signTerm.toString('base64');
      this.debugLog(`Other: ${this.accessory.displayName} sign: ${sign}`);
      const options = {
        hostname: HostDomain,
        port: 443,
        path: `${DevicePath}/${this.device.deviceId}/commands`,
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
        this.debugLog(`Other: ${this.accessory.displayName} statusCode: ${res.statusCode}`);
        this.statusCode({ res });
        res.on('data', (d) => {
          this.debugLog(`Other: ${this.accessory.displayName} d: ${d}`);
        });
      });

      req.on('error', (error) => {
        this.errorLog(`Other: ${this.accessory.displayName} error: ${error}`);
      });

      req.write(payload);
      req.end();

      this.debugLog(`Other: ${this.accessory.displayName} pushchanges: ${JSON.stringify(req)}`);
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.errorLog(`Other: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection`);
      if (this.deviceLogging.includes('debug')) {
        this.errorLog(
          `Other: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      this.apiError(e);
    }
  }

  async statusCode({ res }: { res: IncomingMessage }): Promise<void> {
    switch (res.statusCode) {
      case 151:
        this.errorLog(`Other: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.errorLog(`Other: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.errorLog(`Other: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.errorLog(`Other: ${this.accessory.displayName} Device is offline.`);
        break;
      case 171:
        this.errorLog(`Other: ${this.accessory.displayName} Hub Device is offline. Hub: ${this.device.hubDeviceId}`);
        break;
      case 190:
        this.errorLog(
          `Other: ${this.accessory.displayName} Device internal error due to device states not synchronized` +
            ` with server, Or command: ${JSON.stringify(res)} format is invalid`,
        );
        break;
      case 100:
        this.debugLog(`Other: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.debugLog(`Other: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  async apiError(e: any): Promise<void> {
    this.fanService?.updateCharacteristic(this.platform.Characteristic.Active, e);
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  async deviceType(device: irdevice & irDevicesConfig): Promise<void> {
    if (device.other?.deviceType) {
      this.otherDeviceType = this.accessory.context.deviceType = device.other.deviceType;
      if (this.deviceLogging.includes('debug') || this.deviceLogging === 'standard') {
        this.warnLog(`Other: ${this.accessory.displayName} Using Device Type: ${this.otherDeviceType}`);
      }
    } else {
      this.errorLog(`Other: ${this.accessory.displayName} No Device Type Set, deviceType: ${this.device.other?.deviceType}`);
    }
  }

  async config(device: irdevice & irDevicesConfig): Promise<void> {
    let config = {};
    if (device.other) {
      config = device.other;
    }
    if (device.logging !== undefined) {
      config['logging'] = device.logging;
    }
    if (Object.entries(config).length !== 0) {
      this.infoLog(`Other: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  async logs(device: irdevice & irDevicesConfig): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugLog(`Other: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(`Other: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      this.debugLog(`Other: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugLog(`Other: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
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
