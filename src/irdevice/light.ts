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
export class Light {
  // Services
  lightBulbService!: Service;

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
    (this.lightBulbService = accessory.getService(this.platform.Service.Lightbulb) || accessory.addService(this.platform.Service.Lightbulb)),
    `${accessory.displayName} Light Bulb`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Outlet, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.lightBulbService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // handle on / off events using the On characteristic
    this.lightBulbService.getCharacteristic(this.platform.Characteristic.On).onSet(this.OnSet.bind(this));

    // handle Brightness events using the Brightness characteristic
    /* this.service
      .getCharacteristic(this.platform.Characteristic.Brightness)
      .on(CharacteristicEventTypes.SET, (value: any, callback: CharacteristicGetCallback) => {
        this.debugLog(`${this.device.remoteType} ${this.accessory.displayName} Set Brightness: ${value}`);
        this.Brightness = value;
        if (value > this.Brightness) {
          this.pushLightBrightnessUpChanges();
        } else {
          this.pushLightBrightnessDownChanges();
        }
        this.service.updateCharacteristic(this.platform.Characteristic.Active, this.Brightness);
        callback(null);
      });*/
  }

  async OnSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`Light: ${this.accessory.displayName} On: ${value}`);
    this.On = value;
    if (this.On) {
      await this.pushLightOnChanges();
    } else {
      await this.pushLightOffChanges();
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    if (this.On === undefined) {
      this.debugLog(`Light: ${this.accessory.displayName} On: ${this.On}`);
    } else {
      this.lightBulbService?.updateCharacteristic(this.platform.Characteristic.On, this.On);
      this.debugLog(`Light: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
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
  async pushLightOnChanges(): Promise<void> {
    if (this.On) {
      const payload = {
        commandType: 'command',
        parameter: 'default',
        command: 'turnOn',
      };
      await this.pushChanges(payload);
    }
  }

  async pushLightOffChanges(): Promise<void> {
    if (!this.On) {
      const payload = {
        commandType: 'command',
        parameter: 'default',
        command: 'turnOff',
      };
      await this.pushChanges(payload);
    }
  }

  async pushLightBrightnessUpChanges(): Promise<void> {
    const payload = {
      commandType: 'command',
      parameter: 'default',
      command: 'brightnessUp',
    };
    await this.pushChanges(payload);
  }

  async pushLightBrightnessDownChanges(): Promise<void> {
    const payload = {
      commandType: 'command',
      parameter: 'default',
      command: 'brightnessDown',
    };
    await this.pushChanges(payload);
  }

  async pushChanges(payload): Promise<void> {
    try {
      this.infoLog(
        `Light: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},` +
          ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`,
      );

      // Make the API request
      const t = Date.now();
      const nonce = 'requestID';
      const data = this.platform.config.credentials?.token + t + nonce;
      const signTerm = crypto.createHmac('sha256', this.platform.config.credentials?.secret).update(Buffer.from(data, 'utf-8')).digest();
      const sign = signTerm.toString('base64');
      this.debugLog(`Light: ${this.accessory.displayName} sign: ${sign}`);
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
        this.debugLog(`Light: ${this.accessory.displayName} statusCode: ${res.statusCode}`);
        this.statusCode({ res });
        res.on('data', (d) => {
          this.debugLog(`Light: ${this.accessory.displayName} d: ${d}`);
        });
      });

      req.on('error', (error) => {
        this.errorLog(`Light: ${this.accessory.displayName} error: ${error}`);
      });

      req.write(payload);
      req.end();

      this.debugLog(`Light: ${this.accessory.displayName} pushchanges: ${JSON.stringify(req)}`);
      this.OnCached = this.On;
      this.accessory.context.On = this.OnCached;
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.errorLog(`Light: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection`);
      if (this.deviceLogging.includes('debug')) {
        this.errorLog(
          `Light: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      this.apiError(e);
    }
  }

  async statusCode({ res }: { res: IncomingMessage }): Promise<void> {
    switch (res.statusCode) {
      case 151:
        this.errorLog(`Light: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.errorLog(`Light: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.errorLog(`Light: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.errorLog(`Light: ${this.accessory.displayName} Device is offline.`);
        break;
      case 171:
        this.errorLog(`Light: ${this.accessory.displayName} Hub Device is offline. Hub: ${this.device.hubDeviceId}`);
        break;
      case 190:
        this.errorLog(
          `Light: ${this.accessory.displayName} Device internal error due to device states not synchronized` +
            ` with server, Or command: ${JSON.stringify(res)} format is invalid`,
        );
        break;
      case 100:
        this.debugLog(`Light: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.debugLog(`Light: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  async apiError(e: any): Promise<void> {
    this.lightBulbService.updateCharacteristic(this.platform.Characteristic.On, e);
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  async config(device: irdevice & irDevicesConfig): Promise<void> {
    let config = {};
    if (device.irlight) {
      config = device.irlight;
    }
    if (device.logging !== undefined) {
      config['logging'] = device.logging;
    }
    if (Object.entries(config).length !== 0) {
      this.infoLog(`Light: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  async logs(device: irdevice & irDevicesConfig): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugLog(`Light: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(`Light: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      this.debugLog(`Light: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugLog(`Light: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
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
