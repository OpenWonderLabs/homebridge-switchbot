import { Bot } from './device/bot';
import { Plug } from './device/plug';
import { Lock } from './device/lock';
import { Meter } from './device/meter';
import { Motion } from './device/motion';
import { Contact } from './device/contact';
import { Curtain } from './device/curtain';
import { MeterPlus } from './device/meterplus';
import { ColorBulb } from './device/colorbulb';
import { StripLight } from './device/striplight';
import { Humidifier } from './device/humidifier';
import { TV } from './irdevice/tv';
import { Fan } from './irdevice/fan';
import { Light } from './irdevice/light';
import { Others } from './irdevice/other';
import { Camera } from './irdevice/camera';
import { AirPurifier } from './irdevice/airpurifier';
import { WaterHeater } from './irdevice/waterheater';
import { VacuumCleaner } from './irdevice/vacuumcleaner';
import { AirConditioner } from './irdevice/airconditioner';
import https from 'https';
import crypto from 'crypto';
import { Buffer } from 'buffer';
import fakegato from 'fakegato-history';
import { readFileSync, writeFileSync } from 'fs';
import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME, irdevice, device, SwitchBotPlatformConfig, devicesConfig, DevicePath, HostDomain } from './settings';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class SwitchBotPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  version = require('../package.json').version || '1.12.8'; // eslint-disable-line @typescript-eslint/no-var-requires
  deviceStatus!: any;
  registeringDevice!: boolean;
  debugMode!: boolean;
  platformLogging?: string;

  public readonly fakegatoAPI: any;

  constructor(public readonly log: Logger, public readonly config: SwitchBotPlatformConfig, public readonly api: API) {
    this.logs();

    this.debugLog('Finished initializing platform:', this.config.name);
    // only load if configured
    if (!this.config) {
      return;
    }

    // HOOBS notice
    if (__dirname.includes('hoobs')) {
      this.log.warn('This plugin has not been tested under HOOBS, it is highly recommended that you switch to Homebridge: https://git.io/Jtxb0');
    }

    // verify the config
    try {
      this.verifyConfig();
      this.debugLog('Config OK');
    } catch (e: any) {
      this.errorLog(JSON.stringify(e.message));
      if (this.platformLogging?.includes('debug')) {
        this.errorLog(JSON.stringify(e));
      }
      return;
    }

    // import fakegato-history module
    this.fakegatoAPI = fakegato(api);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', async () => {
      this.debugLog('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      try {
        if (this.config.credentials?.openToken && !this.config.credentials.token) {
          await this.updateToken();
        } else {
          this.discoverDevices();
        }
      } catch (e: any) {
        this.errorLog('Failed to Discover Devices.', JSON.stringify(e.message));
        if (this.platformLogging?.includes('debug')) {
          this.errorLog(JSON.stringify(e));
        }
      }
    });
  }

  logs() {
    this.debugMode = process.argv.includes('-D') || process.argv.includes('--debug');
    if (this.config.options?.logging === 'debug' || this.config.options?.logging === 'standard' || this.config.options?.logging === 'none') {
      this.platformLogging = this.config.options!.logging;
      if (this.platformLogging.includes('debug')) {
        this.log.warn(`Using Config Logging: ${this.platformLogging}`);
      }
    } else if (this.debugMode) {
      this.platformLogging = 'debugMode';
      if (this.platformLogging?.includes('debug')) {
        this.log.warn(`Using ${this.platformLogging} Logging`);
      }
    } else {
      this.platformLogging = 'standard';
      if (this.platformLogging?.includes('debug')) {
        this.log.warn(`Using ${this.platformLogging} Logging`);
      }
    }
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.debugLog(`Loading accessory from cache: ${accessory.displayName}`);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * Verify the config passed to the plugin is valid
   */
  async verifyConfig() {
    this.config.options = this.config.options || {};

    const platformConfig = {};
    if (this.config.options.logging) {
      platformConfig['logging'] = this.config.options.logging;
    }
    if (this.config.options.logging) {
      platformConfig['refreshRate'] = this.config.options.refreshRate;
    }
    if (this.config.options.logging) {
      platformConfig['pushRate'] = this.config.options.pushRate;
    }
    if (Object.entries(platformConfig).length !== 0) {
      this.infoLog(`Platform Config: ${JSON.stringify(platformConfig)}`);
    }

    if (this.config.options) {
      // Device Config
      if (this.config.options.devices) {
        for (const deviceConfig of this.config.options.devices) {
          if (!deviceConfig.hide_device) {
            if (!deviceConfig.deviceId) {
              throw new Error('The devices config section is missing the *Device ID* in the config. Please check your config.');
            }
            if (!deviceConfig.configDeviceType && deviceConfig.ble) {
              throw new Error('The devices config section is missing the *Device Type* in the config. Please check your config.');
            }
          }
        }
      }

      // IR Device Config
      if (this.config.options.irdevices) {
        for (const irDeviceConfig of this.config.options.irdevices) {
          if (!irDeviceConfig.hide_device) {
            if (!irDeviceConfig.deviceId) {
              this.errorLog('The devices config section is missing the *Device ID* in the config. Please check your config.');
            }
            if (!irDeviceConfig.deviceId && !irDeviceConfig.configRemoteType) {
              this.errorLog('The devices config section is missing the *Device Type* in the config. Please check your config.');
            }
          }
        }
      }
    }

    if (this.config.options!.refreshRate! < 5) {
      throw new Error('Refresh Rate must be above 5 (5 seconds).');
    }

    if (!this.config.options.refreshRate) {
      // default 120 seconds (2 minutes)
      this.config.options!.refreshRate! = 120;
      if (this.platformLogging?.includes('debug')) {
        this.debugLog('Using Default Refresh Rate (2 minutes).');
      }
    }

    if (!this.config.options.pushRate) {
        // default 100 milliseconds
        this.config.options!.pushRate! = 0.1;
        if (this.platformLogging?.includes('debug')) {
          this.warnLog('Using Default Push Rate.');
        }
    }

    if (!this.config.credentials) {
      if (this.platformLogging?.includes('debug')) {
        this.debugLog('Missing Credentials');
      }
    }
    if (!this.config.credentials?.token) {
      if (this.platformLogging?.includes('debug')) {
        this.errorLog('Missing token');
        this.warnLog('Cloud Enabled SwitchBot Devices & IR Devices will not work');
      }
    }
    if (this.config.credentials?.token) {
      if (!this.config.credentials?.secret) {
        if (this.platformLogging?.includes('debug')) {
          this.errorLog('Missing secret');
          this.warnLog('Cloud Enabled SwitchBot Devices & IR Devices will not work');
        }
        throw Error('Missing secret');
      }
    }
  }

  /**
   * The openToken was old config.
   * This method saves the openToken as the token in the config.json file
   * @param this.config.credentials.openToken
   */
  async updateToken() {
    try {
      // check the new token was provided
      if (!this.config.credentials?.openToken) {
        throw new Error('New token not provided');
      }

      // load in the current config
      const currentConfig = JSON.parse(readFileSync(this.api.user.configPath(), 'utf8'));

      // check the platforms section is an array before we do array things on it
      if (!Array.isArray(currentConfig.platforms)) {
        throw new Error('Cannot find platforms array in config');
      }

      // find this plugins current config
      const pluginConfig = currentConfig.platforms.find((x: { platform: string }) => x.platform === PLATFORM_NAME);

      if (!pluginConfig) {
        throw new Error(`Cannot find config for ${PLATFORM_NAME} in platforms array`);
      }

      // check the .credentials is an object before doing object things with it
      if (typeof pluginConfig.credentials !== 'object') {
        throw new Error('pluginConfig.credentials is not an object');
      }
      // Move openToken to token
      this.warnLog('This plugin has been updated to use OpenAPI v1.1, config is set with openToken.');
      this.warnLog('`openToken` config has been moved to the `token` config, Please restart Homebridge.');

      // set the refresh token
      pluginConfig.credentials.token = this.config.credentials?.openToken;
      pluginConfig.credentials.openToken = 'Delete';

      if (this.platformLogging?.includes('debug')) {
        this.warnLog(`Token: ${pluginConfig.credentials.token}`);
      }
      // save the config, ensuring we maintain pretty json
      writeFileSync(this.api.user.configPath(), JSON.stringify(currentConfig, null, 4));
      this.verifyConfig();
    } catch (e: any) {
      this.errorLog(e);
    }
  }

  /**
   * this method discovers devices
   */
  async discoverDevices() {
    try {
      if (this.config.credentials?.token) {
        const t = Date.now();
        const nonce = 'requestID';
        const data = this.config.credentials?.token + t + nonce;
        const signTerm = crypto.createHmac('sha256', this.config.credentials?.secret).update(Buffer.from(data, 'utf-8')).digest();
        const sign = signTerm.toString('base64');
        this.debugLog(sign);
        const options = {
          hostname: HostDomain,
          port: 443,
          path: DevicePath,
          method: 'GET',
          headers: {
            'Authorization': this.config.credentials?.token,
            'sign': sign,
            'nonce': nonce,
            't': t,
            'Content-Type': 'application/json',
          },
        };
        const req = https.request(options, (res) => {
          this.debugLog(`statusCode: ${res.statusCode}`);
          this.debugLog(`headers: ${JSON.stringify(res.headers)}`);
          let rawData = '';
          res.on('data', (d) => {
            rawData += d;
            this.debugLog(`d: ${d}`);
          });
          res.on('end', () => {
            try {
              const devicesAPI = JSON.parse(rawData);
              this.debugLog(`devicesAPI: ${JSON.stringify(devicesAPI.body)}`);

              // SwitchBot Devices
              if (devicesAPI.body.deviceList.length !== 0) {
                this.infoLog(`Total SwitchBot Devices Found: ${devicesAPI.body.deviceList.length}`);
              } else {
                this.debugLog(`Total SwitchBot Devices Found: ${devicesAPI.body.deviceList.length}`);
              }
              const deviceLists = devicesAPI.body.deviceList;
              if (!this.config.options?.devices) {
                this.debugLog(`SwitchBot Device Config Not Set: ${JSON.stringify(this.config.options?.devices)}`);
                const devices = deviceLists.map((v: any) => v);
                for (const device of devices) {
                  if (device.deviceType) {
                    if (device.configDeviceName) {
                      device.deviceName = device.configDeviceName;
                    }
                    this.createDevice(device);
                  }
                }
              } else if (this.config.credentials?.token && this.config.options.devices) {
                this.debugLog(`SwitchBot Device Config Set: ${JSON.stringify(this.config.options?.devices)}`);
                const deviceConfigs = this.config.options?.devices;

                const mergeBydeviceId = (a1: { deviceId: string }[], a2: any[]) =>
                  a1.map((itm: { deviceId: string }) => ({
                    ...a2.find(
                      (item: { deviceId: string }) =>
                        item.deviceId.toUpperCase().replace(/[^A-Z0-9]+/g, '') === itm.deviceId.toUpperCase().replace(/[^A-Z0-9]+/g, '') && item,
                    ),
                    ...itm,
                  }));

                const devices = mergeBydeviceId(deviceLists, deviceConfigs);
                this.debugLog(`SwitchBot Devices: ${JSON.stringify(devices)}`);
                for (const device of devices) {
                  if (device.deviceType) {
                    if (device.configDeviceName) {
                      device.deviceName = device.configDeviceName;
                    }
                    this.createDevice(device);
                  }
                }
              } else {
                this.errorLog('SwitchBot Token Supplied, Issue with Auth.');
              }

              // IR Devices
              if (devicesAPI.body.infraredRemoteList.length !== 0) {
                this.infoLog(`Total IR Devices Found: ${devicesAPI.body.infraredRemoteList.length}`);
              } else {
                this.debugLog(`Total IR Devices Found: ${devicesAPI.body.infraredRemoteList.length}`);
              }
              const irDeviceLists = devicesAPI.body.infraredRemoteList;
              if (!this.config.options?.irdevices) {
                this.debugLog(`IR Device Config Not Set: ${JSON.stringify(this.config.options?.irdevices)}`);
                const devices = irDeviceLists.map((v: any) => v);
                for (const device of devices) {
                  if (device.remoteType) {
                    this.createIRDevice(device);
                  }
                }
              } else {
                this.debugLog(`IR Device Config Set: ${JSON.stringify(this.config.options?.irdevices)}`);
                const irDeviceConfig = this.config.options?.irdevices;

                const mergeIRBydeviceId = (a1: { deviceId: string }[], a2: any[]) =>
                  a1.map((itm: { deviceId: string }) => ({
                    ...a2.find(
                      (item: { deviceId: string }) =>
                        item.deviceId.toUpperCase().replace(/[^A-Z0-9]+/g, '') === itm.deviceId.toUpperCase().replace(/[^A-Z0-9]+/g, '') && item,
                    ),
                    ...itm,
                  }));

                const devices = mergeIRBydeviceId(irDeviceLists, irDeviceConfig);
                this.debugLog(`IR Devices: ${JSON.stringify(devices)}`);
                for (const device of devices) {
                  if (device.remoteType) {
                    this.createIRDevice(device);
                  }
                }
              }
            } catch (e:any) {
              this.errorLog(e.message);
            }
          });
        });
        req.on('error', (error) => {
          this.errorLog(error);
        });
        req.end();
      } else if (!this.config.credentials?.token && this.config.options?.devices) {
        this.debugLog(`SwitchBot Device Manual Config Set: ${JSON.stringify(this.config.options?.devices)}`);
        const deviceConfigs = this.config.options?.devices;
        const devices = deviceConfigs.map((v: any) => v);
        for (const device of devices) {
          device.deviceType = device.configDeviceType;
          device.deviceName = device.configDeviceName;
          if (device.deviceType) {
            this.createDevice(device);
          }
        }
      } else {
        this.errorLog('Neither SwitchBot Token or Device Config are not set.');
      }
    } catch (e: any) {
      this.deviceError(e);
    }
  }

  deviceError(e: any) {
    if (e.message.includes('400')) {
      this.errorLog('Failed to Discover Devices: Bad Request');
      this.debugLog('The client has issued an invalid request. This is commonly used to specify validation errors in a request payload.');
    } else if (e.message.includes('401')) {
      this.errorLog('Failed to Discover Devices: Unauthorized Request');
      this.debugLog('Authorization for the API is required, but the request has not been authenticated.');
    } else if (e.message.includes('403')) {
      this.errorLog('Failed to Discover Devices: Forbidden Request');
      this.debugLog('The request has been authenticated but does not have appropriate permissions, or a requested resource is not found.');
    } else if (e.message.includes('404')) {
      this.errorLog('Failed to Discover Devices: Requst Not Found');
      this.debugLog('Specifies the requested path does not exist.');
    } else if (e.message.includes('406')) {
      this.errorLog('Failed to Discover Devices: Request Not Acceptable');
      this.debugLog('The client has requested a MIME type via the Accept header for a value not supported by the server.');
    } else if (e.message.includes('415')) {
      this.errorLog('Failed to Discover Devices: Unsupported Requst Header');
      this.debugLog('The client has defined a contentType header that is not supported by the server.');
    } else if (e.message.includes('422')) {
      this.errorLog('Failed to Discover Devices: Unprocessable Entity');
      this.debugLog(
        'The client has made a valid request, but the server cannot process it.' +
          ' This is often used for APIs for which certain limits have been exceeded.',
      );
    } else if (e.message.includes('429')) {
      this.errorLog('Failed to Discover Devices: Too Many Requests');
      this.debugLog('The client has exceeded the number of requests allowed for a given time window.');
    } else if (e.message.includes('500')) {
      this.errorLog('Failed to Discover Devices: Internal Server Error');
      this.debugLog('An unexpected error on the SmartThings servers has occurred. These errors should be rare.');
    } else {
      this.errorLog('Failed to Discover Devices');
    }
    if (this.platformLogging === 'debug') {
      this.errorLog(`Failed to Discover Devices, Error Message: ${JSON.stringify(e.message)}`);
    }
    if (this.platformLogging === 'debugMode') {
      this.errorLog(`Failed to Discover Devices, Error: ${JSON.stringify(e)}`);
    }
  }

  private createDevice(device: device & devicesConfig) {
    switch (device.deviceType!) {
      case 'Humidifier':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createHumidifier(device);
        break;
      case 'Hub Mini':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        break;
      case 'Hub Plus':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        break;
      case 'Bot':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createBot(device);
        break;
      case 'Meter':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createMeter(device);
        break;
      case 'MeterPlus':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createMeterPlus(device);
        break;
      case 'Motion Sensor':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createMotion(device);
        break;
      case 'Contact Sensor':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createContact(device);
        break;
      case 'Curtain':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createCurtain(device);
        break;
      case 'Plug':
      case 'Plug Mini (US)':
      case 'Plug Mini (JP)':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createPlug(device);
        break;
      case 'Smart Lock':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createLock(device);
        break;
      case 'Color Bulb':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createColorBulb(device);
        break;
      case 'Strip Light':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createStripLight(device);
        break;
      case 'Indoor Cam':
        this.deviceInfo(device);
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.warnLog(`Device: ${device.deviceName} with Device Type: ${device.deviceType}, is currently not supported.`);
        break;
      case 'Remote':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId} is Not Supported.`);
        break;
      default:
        this.deviceInfo(device);
        this.warnLog(`Device: ${device.deviceName} with Device Type: ${device.deviceType}, is currently not supported.`);
        this.warnLog('Submit Feature Requests Here: https://git.io/JL14Z');
    }
  }

  private createIRDevice(device: irdevice & devicesConfig) {
    switch (device.remoteType!) {
      case 'TV':
      case 'DIY TV':
      case 'Projector':
      case 'DIY Projector':
      case 'Set Top Box':
      case 'DIY Set Top Box':
      case 'IPTV':
      case 'DIY IPTV':
      case 'DVD':
      case 'DIY DVD':
      case 'Speaker':
      case 'DIY Speaker':
        this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createTV(device);
        break;
      case 'Fan':
      case 'DIY Fan':
        this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createFan(device);
        break;
      case 'Air Conditioner':
      case 'DIY Air Conditioner':
        this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createAirConditioner(device);
        break;
      case 'Light':
      case 'DIY Light':
        this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createLight(device);
        break;
      case 'Air Purifier':
      case 'DIY Air Purifier':
        this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createAirPurifier(device);
        break;
      case 'Water Heater':
      case 'DIY Water Heater':
        this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createWaterHeater(device);
        break;
      case 'Vacuum Cleaner':
      case 'DIY Vacuum Cleaner':
        this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createVacuumCleaner(device);
        break;
      case 'Camera':
      case 'DIY Camera':
        this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createCamera(device);
        break;
      case 'Others':
        this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createOthers(device);
        break;
      default:
        this.deviceInfo(device);
        this.warnLog(`Device: ${device.deviceName} with Device Type: ${device.remoteType}, is currently not supported.`);
        this.warnLog('Submit Feature Requests Here: https://git.io/JL14Z');
    }
  }

  private registerDevice(device: device & devicesConfig) {
    if (!device.hide_device && device.enableCloudService && device.ble) {
      this.registeringDevice = true;
      this.debugLog(`Device: ${device.deviceName} Both OpenAPI and BLE Connections Enabled`);
    } else if (!device.hide_device && device.deviceId && device.configDeviceType && device.configDeviceName
      && !device.enableCloudService) {
      this.registeringDevice = true;
      this.debugLog(`Device: ${device.deviceName} BLE Connection Enabled`);
    } else if (!device.hide_device && device.enableCloudService && !device.ble) {
      this.registeringDevice = true;
      this.debugLog(`Device: ${device.deviceName} OpenAPI Connection Enabled`);
    } else {
      this.registeringDevice = false;
      this.debugLog(`Device: ${device.deviceName} OpenAPI and BLE Are Not Enabled`);
    }
    return this.registeringDevice;
  }

  private async createHumidifier(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (this.registerDevice(device)) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        //existingAccessory.context.firmwareRevision = firmware;
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Humidifier(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Humidifier(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private async createBot(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (this.registerDevice(device)) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        this.debugLog(JSON.stringify(device.bot?.mode));

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Bot(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);

      this.debugLog(JSON.stringify(device.bot?.mode));

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      await this.connectionTypeNewAccessory(device, accessory);
      // accessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Bot(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private async createMeter(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (this.registerDevice(device)) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Meter(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Meter(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private async createMeterPlus(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (this.registerDevice(device)) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new MeterPlus(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new MeterPlus(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private async createMotion(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (this.registerDevice(device)) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Motion(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Motion(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private async createContact(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (this.registerDevice(device)) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Contact(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Contact(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private async createCurtain(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (this.isCurtainGrouped(device)) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Curtain(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (this.isCurtainGrouped(device)) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);

      if (device.group && !device.curtain?.disable_group) {
        this.debugLog(`Your Curtains are grouped
        , Secondary curtain automatically hidden. Main Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
      } else {
        if (device.master) {
          this.debugLog(`Main Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
        } else {
          this.debugLog(`Secondary Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
        }
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Curtain(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private isCurtainGrouped(device: device & devicesConfig) {
    this.debugLog(
      `deviceId: ${device.deviceId}, curtainDevicesIds: ${device.curtainDevicesIds},` +
        ` master: ${device.master}, group: ${device.group}, disable_group: ${device.curtain?.disable_group}`,
    );

    if (device.group && !device.curtain?.disable_group) {
      this.debugLog(`[Curtain Config] disable_group: ${device.curtain?.disable_group}`);
      return device.master && this.registerDevice(device);
    } else {
      this.debugLog(`[Curtain Config] disable_group: ${device.curtain?.disable_group}, UnGrouping ${device.master}`);
      return this.registerDevice(device);
    }
  }

  private async createPlug(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (this.registerDevice(device)) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Plug(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Plug(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private async createLock(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (this.registerDevice(device)) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Lock(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Lock(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private async createColorBulb(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (this.registerDevice(device)) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new ColorBulb(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new ColorBulb(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private async createStripLight(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (this.registerDevice(device)) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new StripLight(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new StripLight(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private async createTV(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (!device.hide_device && existingAccessory) {
      this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

      // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
      existingAccessory.context.model = device.remoteType;
      existingAccessory.context.deviceID = device.deviceId;
      existingAccessory.displayName = device.deviceName;
      existingAccessory.context.firmwareRevision = device.firmware;
      existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
      await this.connectionTypeExistingIRAccessory(existingAccessory);
      this.api.updatePlatformAccessories([existingAccessory]);
      // create the accessory handler for the restored accessory
      // this is imported from `platformAccessory.ts`
      new TV(this, existingAccessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      await this.connectionTypeNewIRAccessory(accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new TV(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      /**
       * Publish as external accessory
       * Only one TV can exist per bridge, to bypass this limitation, you should
       * publish your TV as an external accessory.
       */
      this.externalAccessory(accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.remoteType} - ${device.deviceId}`);
    }
  }

  private async createFan(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:

        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        await this.connectionTypeExistingIRAccessory(existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Fan(this, existingAccessory, device);
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      await this.connectionTypeNewIRAccessory(accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Fan(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.remoteType} - ${device.deviceId}`);
    }
  }

  private async createLight(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        await this.connectionTypeExistingIRAccessory(existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Light(this, existingAccessory, device);
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      await this.connectionTypeNewIRAccessory(accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Light(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.remoteType} - ${device.deviceId}`);
    }
  }

  private async createAirConditioner(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        await this.connectionTypeExistingIRAccessory(existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new AirConditioner(this, existingAccessory, device);
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      await this.connectionTypeNewIRAccessory(accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new AirConditioner(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.remoteType} - ${device.deviceId}`);
    }
  }

  private async createAirPurifier(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        await this.connectionTypeExistingIRAccessory(existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new AirPurifier(this, existingAccessory, device);
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      await this.connectionTypeNewIRAccessory(accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new AirPurifier(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.remoteType} - ${device.deviceId}`);
    }
  }

  private async createWaterHeater(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        await this.connectionTypeExistingIRAccessory(existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new WaterHeater(this, existingAccessory, device);
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      await this.connectionTypeNewIRAccessory(accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new WaterHeater(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.remoteType} - ${device.deviceId}`);
    }
  }

  private async createVacuumCleaner(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        await this.connectionTypeExistingIRAccessory(existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new VacuumCleaner(this, existingAccessory, device);
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      await this.connectionTypeNewIRAccessory(accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new VacuumCleaner(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.remoteType} - ${device.deviceId}`);
    }
  }

  private async createCamera(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        await this.connectionTypeExistingIRAccessory(existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Camera(this, existingAccessory, device);
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      await this.connectionTypeNewIRAccessory(accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Camera(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.remoteType} - ${device.deviceId}`);
    }
  }

  private async createOthers(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        await this.connectionTypeExistingIRAccessory(existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Others(this, existingAccessory, device);
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      await this.connectionTypeNewIRAccessory(accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Others(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Unable to Register new device: ${device.deviceName} ${device.remoteType} - ${device.deviceId}`);
    }
  }

  public async externalOrPlatform(device: device & devicesConfig, accessory: PlatformAccessory) {
    this.errorLog(device.external);
    if (device.external) {
      this.warnLog(`${accessory.displayName} External Accessory Mode`);
      this.externalAccessory(accessory);
    } else {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  public async externalAccessory(accessory: PlatformAccessory) {
    this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
  }

  public async connectionTypeNewAccessory(device: device & devicesConfig, accessory: PlatformAccessory) {
    if (device.ble) {
      accessory.context.connectionType = 'BLE';
    } else {
      accessory.context.connectionType = 'OpenAPI';
    }
  }

  public async connectionTypeExistingAccessory(device: device & devicesConfig, existingAccessory: PlatformAccessory) {
    if (device.ble) {
      existingAccessory.context.connectionType = 'BLE';
    } else {
      existingAccessory.context.connectionType = 'OpenAPI';
    }
  }

  public async connectionTypeNewIRAccessory(accessory: PlatformAccessory) {
    accessory.context.connectionType = 'IR wirth OpenAPI';
  }

  public async connectionTypeExistingIRAccessory(existingAccessory: PlatformAccessory) {
    existingAccessory.context.connectionType = 'IR with OpenAPI';
  }

  public unregisterPlatformAccessories(existingAccessory: PlatformAccessory) {
    // remove platform accessories when no longer present
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
    this.warnLog(`Removing existing accessory from cache: ${existingAccessory.displayName}`);
  }

  public deviceListInfo(devices) {
    if (this.platformLogging?.includes('debug')) {
      this.warnLog(`deviceListInfoStatus: ${JSON.stringify(devices)}`);
    }
  }

  public async deviceInfo(device: (irdevice & devicesConfig) | (device & devicesConfig)) {
    if (this.platformLogging?.includes('debug')) {
      this.warnLog(JSON.stringify(device));

      const t = Date.now();
      const nonce = 'requestID';
      const data = this.config.credentials?.token + t + nonce;
      const signTerm = crypto.createHmac('sha256', this.config.credentials?.secret).update(Buffer.from(data, 'utf-8')).digest();
      const sign = signTerm.toString('base64');
      this.debugLog(sign);
      const options = {
        hostname: HostDomain,
        port: 443,
        path: `${DevicePath}/${device.deviceId}/status`,
        method: 'GET',
        headers: {
          Authorization: this.config.credentials?.token,
          sign: sign,
          nonce: nonce,
          t: t,
          'Content-Type': 'application/json',
        },
      };
      const req = https.request(options, (res) => {
        this.debugLog(`statusCode: ${res.statusCode}`);
        res.on('data', (d) => {
          process.stdout.write(d);
        });
      });
      req.on('error', (error) => {
        this.errorLog(error);
      });
      req.end();

      this.deviceStatus = req;
      if (this.deviceStatus.message === 'success') {
        this.warnLog(`${device.deviceName} deviceInfoStatus: ${JSON.stringify(this.deviceStatus)}`);
      } else {
        this.warnLog(`${device.deviceName} deviceInfoStatus: ${JSON.stringify(this.deviceStatus.message)}`);
        this.warnLog('Unable to retreive deviceInfoStatus.');
      }
    }
  }

  // BLE Connection
  connectBLE() {
    let Switchbot: new () => any;
    let switchbot: any;
    try {
      Switchbot = require('node-switchbot');
      switchbot = new Switchbot();
    } catch (e) {
      switchbot = false;
      this.errorLog(`Was 'node-switchbot' found: ${switchbot}`);
    }
    return switchbot;
  }

  /**
   * If device level logging is turned on, log to log.warn
   * Otherwise send debug logs to log.debug
   */
  infoLog(...log: any[]): void {
    if (this.enablingPlatfromLogging()) {
      this.log.info(String(...log));
    }
  }

  warnLog(...log: any[]): void {
    if (this.enablingPlatfromLogging()) {
      this.log.warn(String(...log));
    }
  }

  errorLog(...log: any[]): void {
    if (this.enablingPlatfromLogging()) {
      this.log.error(String(...log));
    }
  }

  debugLog(...log: any[]): void {
    if (this.enablingPlatfromLogging()) {
      if (this.platformLogging === 'debugMode') {
        this.log.debug(String(...log));
      } else if (this.platformLogging === 'debug') {
        this.log.info('[DEBUG]', String(...log));
      }
    }
  }

  enablingPlatfromLogging(): boolean {
    return this.platformLogging?.includes('debug') || this.platformLogging === 'standard';
  }
}
