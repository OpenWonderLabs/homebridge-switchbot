import { Bot } from './device/bot';
import { Plug } from './device/plug';
import { Lock } from './device/lock';
import { Meter } from './device/meter';
import { Motion } from './device/motion';
import { Contact } from './device/contact';
import { Curtain } from './device/curtain';
import { MeterPlus } from './device/meterplus';
import { ColorBulb } from './device/colorbulb';
import { CeilingLight } from './device/ceilinglight';
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
import { queueScheduler } from 'rxjs';
import fakegato from 'fakegato-history';
import superStringify from 'super-stringify';
import { readFileSync, writeFileSync } from 'fs';
import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, Service, Characteristic } from 'homebridge';
import {
  PLATFORM_NAME, PLUGIN_NAME, irdevice, device, SwitchBotPlatformConfig, devicesConfig, DevicePath, HostDomain, irDevicesConfig } from './settings';
import { IncomingMessage } from 'http';

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

  version = process.env.npm_package_version || '2.1.1';
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
      this.warnLog('This plugin has not been tested under HOOBS, it is highly recommended that you switch to Homebridge: '
      + 'https://tinyurl.com/HOOBS2Homebridge');
    }

    // verify the config
    try {
      this.verifyConfig();
      this.debugLog('Config OK');
    } catch (e: any) {
      this.errorLog(`Verify Config, Error Message: ${e.message}, Submit Bugs Here: ` + 'https://tinyurl.com/SwitchBotBug');
      this.debugErrorLog(`Verify Config, Error: ${e}`);
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
        } else if (this.config.credentials?.token && !this.config.credentials?.secret) {
          // eslint-disable-next-line no-useless-escape
          this.errorLog('\"secret\" config is not populated, you must populate then please restart Homebridge.');
        } else {
          this.discoverDevices();
        }
      } catch (e: any) {
        this.errorLog(`Failed to Discover, Error Message: ${e.message}, Submit Bugs Here: ` + 'https://tinyurl.com/SwitchBotBug');
        this.debugErrorLog(`Failed to Discover, Error: ${e}`);
      }
    });
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
    if (this.config.options.logging && this.config.options.refreshRate) {
      platformConfig['refreshRate'] = this.config.options.refreshRate;
    }
    if (this.config.options.logging && this.config.options.pushRate) {
      platformConfig['pushRate'] = this.config.options.pushRate;
    }
    if (Object.entries(platformConfig).length !== 0) {
      this.infoLog(`Platform Config: ${superStringify(platformConfig)}`);
    }

    if (this.config.options) {
      // Device Config
      if (this.config.options.devices) {
        for (const deviceConfig of this.config.options.devices) {
          if (!deviceConfig.hide_device) {
            if (!deviceConfig.deviceId) {
              throw new Error('The devices config section is missing the *Device ID* in the config. Please check your config.');
            }
            if (!deviceConfig.configDeviceType && deviceConfig.connectionType) {
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
      this.debugWarnLog('Using Default Refresh Rate (2 minutes).');
    }

    if (!this.config.options.pushRate) {
        // default 100 milliseconds
        this.config.options!.pushRate! = 0.1;
        this.debugWarnLog('Using Default Push Rate.');
    }

    if (!this.config.credentials && !this.config.options) {
      this.debugWarnLog('Missing Credentials');
    } else if (this.config.credentials && !this.config.credentials.notice) {
      if (!this.config.credentials?.token) {
        this.debugErrorLog('Missing token');
        this.debugWarnLog('Cloud Enabled SwitchBot Devices & IR Devices will not work');
      }
      if (this.config.credentials?.token) {
        if (!this.config.credentials?.secret) {
          this.debugErrorLog('Missing secret');
          this.debugWarnLog('Cloud Enabled SwitchBot Devices & IR Devices will not work');
        }
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
      if (!this.config.credentials.secret){
        // eslint-disable-next-line no-useless-escape, max-len
        this.warnLog('This plugin has been updated to use OpenAPI v1.1, config is set with openToken, \"openToken\" cconfig has been moved to the \"token\" config' );
        // eslint-disable-next-line no-useless-escape
        this.errorLog('\"secret\" config is not populated, you must populate then please restart Homebridge.');
      } else {
        // eslint-disable-next-line no-useless-escape, max-len
        this.warnLog('This plugin has been updated to use OpenAPI v1.1, config is set with openToken, \"openToken\" config has been moved to the \"token\" config, please restart Homebridge.');
      }

      // set the refresh token
      pluginConfig.credentials.token = this.config.credentials?.openToken;
      if (pluginConfig.credentials.token) {
        pluginConfig.credentials.openToken = undefined;
      }

      this.debugWarnLog(`token: ${pluginConfig.credentials.token}`);

      // save the config, ensuring we maintain pretty json
      writeFileSync(this.api.user.configPath(), JSON.stringify(currentConfig, null, 4));
      this.verifyConfig();
    } catch (e: any) {
      this.errorLog(`Update Token: ${e}`);
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
        this.debugLog(`sing: ${sign}`);
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
        const req = https.request(options, async (res) => {
          this.debugLog(`statusCode: ${res.statusCode}`);
          await this.statusCode({ res });
          this.debugLog(`headers: ${superStringify(res.headers)}`);
          let rawData = '';
          res.on('data', (d) => {
            rawData += d;
            this.debugLog(`d: ${d}`);
          });
          res.on('end', () => {
            try {
              const devicesAPI = JSON.parse(rawData);
              this.debugLog(`devicesAPI: ${superStringify(devicesAPI.body)}`);
              // SwitchBot Devices
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
                this.debugLog(`SwitchBot Device Config Set: ${superStringify(this.config.options?.devices)}`);
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
                this.debugLog(`SwitchBot Devices: ${superStringify(devices)}`);
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
              if (devicesAPI.body.deviceList.length !== 0) {
                this.infoLog(`Total SwitchBot Devices Found: ${devicesAPI.body.deviceList.length}`);
              } else {
                this.debugLog(`Total SwitchBot Devices Found: ${devicesAPI.body.deviceList.length}`);
              }

              // IR Devices
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
                this.debugLog(`IR Device Config Set: ${superStringify(this.config.options?.irdevices)}`);
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
                this.debugLog(`IR Devices: ${superStringify(devices)}`);
                for (const device of devices) {
                  this.createIRDevice(device);
                }
              }
              if (devicesAPI.body.infraredRemoteList.length !== 0) {
                this.infoLog(`Total IR Devices Found: ${devicesAPI.body.infraredRemoteList.length}`);
              } else {
                this.debugLog(`Total IR Devices Found: ${devicesAPI.body.infraredRemoteList.length}`);
              }
            } catch (e:any) {
              this.errorLog(`API Request: ${e}, Submit Bugs Here: ` + 'https://tinyurl.com/SwitchBotBug');
            }
          });
        });
        req.on('error', (e: any) => {
          this.errorLog(`req: ${e}, Submit Bugs Here: ` + 'https://tinyurl.com/SwitchBotBug');
        });
        req.end();
      } else if (!this.config.credentials?.token && this.config.options?.devices) {
        this.debugLog(`SwitchBot Device Manual Config Set: ${superStringify(this.config.options?.devices)}`);
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
      this.debugErrorLog(`Failed to Discover Devices, Error Message: ${superStringify(e.message)}, Submit Bugs Here: `
      + 'https://tinyurl.com/SwitchBotBug');
      this.debugErrorLog(`Failed to Discover Devices, Error: ${e}`);
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
        this.debugLog(`Discovered ${device.deviceType} ${device.deviceName}: ${device.deviceId}`);
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
      case 'Ceiling Light':
      case 'Ceiling Light Pro':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createCeilingLight(device);
        break;
      case 'Strip Light':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createStripLight(device);
        break;
      case 'Indoor Cam':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.warnLog(`Device: ${device.deviceName} with Device Type: ${device.deviceType}, is currently not supported.`);
        break;
      case 'Remote':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId} is Not Supported.`);
        break;
      default:
        this.warnLog(`Device: ${device.deviceName} with Device Type: ${device.deviceType}, is currently not supported.`);
        // eslint-disable-next-line max-len
        this.warnLog('Submit Feature Requests Here: ' + 'https://tinyurl.com/SwitchBotFeatureRequest');
    }
  }

  private createIRDevice(device: irdevice & devicesConfig) {
    if (device.connectionType === undefined) {
      device.connectionType = 'OpenAPI';
    }
    switch (device.remoteType) {
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
        if (device.external === undefined) {
          device.external = true;
          this.createTV(device);
        } else {
          this.createTV(device);
        }
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
        this.debugLog(`Unsupported Device: ${superStringify(device)}`);
        this.warnLog(`Device: ${device.deviceName} with Device Type: ${device.remoteType}, is currently not supported.`);
        this.warnLog('Submit Feature Requests Here: ' + 'https://tinyurl.com/SwitchBotFeatureRequest');
    }
  }

  private async createHumidifier(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Humidifier(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
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
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Humidifier(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createBot(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Bot(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
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
      accessory.context.connectionType = await this.connectionType(device);
      // accessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Bot(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createMeter(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Meter(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
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
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Meter(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createMeterPlus(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new MeterPlus(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
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
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new MeterPlus(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createMotion(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Motion(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
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
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Motion(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createContact(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Contact(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
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
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Contact(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createCurtain(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Curtain(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
      }

      if (device.group && !device.curtain?.disable_group) {
        this.debugLog('Your Curtains are grouped, '
        + `, Secondary curtain automatically hidden. Main Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
      } else {
        if (device.master) {
          this.warnLog(`Main Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
        } else {
          this.errorLog(`Secondary Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
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
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Curtain(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createPlug(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Plug(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
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
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Plug(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createLock(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Lock(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
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
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Lock(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createColorBulb(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new ColorBulb(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
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
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new ColorBulb(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createCeilingLight(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new CeilingLight(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
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
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new CeilingLight(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createStripLight(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new StripLight(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
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
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new StripLight(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createTV(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (!device.hide_device && existingAccessory) {
      // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
      existingAccessory.context.model = device.remoteType;
      existingAccessory.context.deviceID = device.deviceId;
      existingAccessory.displayName = device.configDeviceName || device.deviceName;
      existingAccessory.context.firmwareRevision = device.firmware;
      existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
      this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
      existingAccessory.context.connectionType = device.connectionType;
      this.api.updatePlatformAccessories([existingAccessory]);
      // create the accessory handler for the restored accessory
      // this is imported from `platformAccessory.ts`
      new TV(this, existingAccessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.connectionType = device.connectionType;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new TV(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
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
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
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
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.connectionType = device.connectionType;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Fan(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
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
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
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
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.connectionType = device.connectionType;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Light(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
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
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
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
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.connectionType = device.connectionType;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new AirConditioner(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
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
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
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
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.connectionType = device.connectionType;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new AirPurifier(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
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
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
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
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.connectionType = device.connectionType;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new WaterHeater(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
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
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
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
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.connectionType = device.connectionType;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new VacuumCleaner(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
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
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
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
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.connectionType = device.connectionType;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Camera(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
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
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        existingAccessory.context.firmwareRevision = device.firmware;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
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
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = device.firmware;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.connectionType = device.connectionType;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Others(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
    }
  }

  async registerCurtains(device: device & devicesConfig) {
    this.debugWarnLog(`deviceName: ${device.deviceName} deviceId: ${device.deviceId}, curtainDevicesIds: ${device.curtainDevicesIds}, master: ` +
    `${device.master}, group: ${device.group}, disable_group: ${device.curtain?.disable_group}, connectionType: ${device.connectionType}`);

    let registerCurtain: boolean;
    if (device.master && device.group) {
      // OpenAPI: Master Curtains in Group
      registerCurtain = true;
      this.debugLog(`deviceName: ${device.deviceName} [Curtain Config] device.master: ${device.master}, device.group: ${device.group}`
      + ` connectionType; ${device.connectionType}`);
      this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`);
    } else if (!device.master && device.curtain?.disable_group) { //!device.group && device.connectionType === 'BLE'
      // OpenAPI: Non-Master Curtain that has Disable Grouping Checked
      registerCurtain = true;
      this.debugLog(`deviceName: ${device.deviceName} [Curtain Config] device.master: ${device.master}, disable_group: `
      + `${device.curtain?.disable_group}, connectionType; ${device.connectionType}`);
      this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`);
    } else if (device.master && !device.group) {
      // OpenAPI: Master Curtains not in Group
      registerCurtain = true;
      this.debugLog(`deviceName: ${device.deviceName} [Curtain Config] device.master: ${device.master}, device.group: ${device.group}`
      + ` connectionType; ${device.connectionType}`);
      this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`);
    } else if (device.connectionType === 'BLE') {
      // BLE: Curtains
      registerCurtain = true;
      this.debugLog(`deviceName: ${device.deviceName} [Curtain Config] connectionType: ${device.connectionType}, group: ${device.group}`);
      this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`);
    } else {
      registerCurtain = false;
      this.debugErrorLog(`deviceName: ${device.deviceName} [Curtain Config] disable_group: ${device.curtain?.disable_group},`
      + ` device.master: ${device.master}, device.group: ${device.group}`);
      this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}, device.connectionType: ${device.connectionType}`);
    }
    return registerCurtain;
  }

  async connectionType(device: device & devicesConfig): Promise<any> {
    let connectionType: string;
    if (!device.connectionType && this.config.credentials?.token && this.config.credentials.secret) {
      connectionType = 'OpenAPI';
    } else {
      connectionType = device.connectionType!;
    }
    return connectionType;
  }

  async registerDevice(device: device & devicesConfig) {
    device.connectionType = await this.connectionType(device);
    let registerDevice: boolean;
    if (!device.hide_device && device.connectionType === 'BLE/OpenAPI') {
      if (device.deviceType === 'Curtain') {
        registerDevice = await this.registerCurtains(device);
        this.debugWarnLog(`Device: ${device.deviceName} Curtain registerDevice: ${registerDevice}`);
      } else {
        registerDevice = true;
        this.debugWarnLog(`Device: ${device.deviceName} registerDevice: ${registerDevice}`);
      }
      this.debugWarnLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will display in HomeKit`);
    } else if (!device.hide_device && device.deviceId && device.configDeviceType && device.configDeviceName
      && device.connectionType === 'BLE') {
      if (device.deviceType === 'Curtain') {
        registerDevice = await this.registerCurtains(device);
        this.debugWarnLog(`Device: ${device.deviceName} Curtain registerDevice: ${registerDevice}`);
      } else {
        registerDevice = true;
        this.debugWarnLog(`Device: ${device.deviceName} registerDevice: ${registerDevice}`);
      }
      this.debugWarnLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will display in HomeKit`);
    } else if (!device.hide_device && device.connectionType === 'OpenAPI') {
      if (device.deviceType === 'Curtain') {
        registerDevice = await this.registerCurtains(device);
        this.debugWarnLog(`Device: ${device.deviceName} Curtain registerDevice: ${registerDevice}`);
      } else {
        registerDevice = true;
        this.debugWarnLog(`Device: ${device.deviceName} registerDevice: ${registerDevice}`);
      }
      this.debugWarnLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will display in HomeKit`);
    } else if (!device.hide_device && device.connectionType === 'Disabled') {
      if (device.deviceType === 'Curtain') {
        registerDevice = await this.registerCurtains(device);
        this.debugWarnLog(`Device: ${device.deviceName} Curtain registerDevice: ${registerDevice}`);
      } else {
        registerDevice = true;
        this.debugWarnLog(`Device: ${device.deviceName} registerDevice: ${registerDevice}`);
      }
      this.debugWarnLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will continue to display in HomeKit`);
    } else if (!device.connectionType && !device.hide_device) {
      registerDevice = false;
      this.debugErrorLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will not display in HomeKit`);
    } else if (device.hide_device){
      registerDevice = false;
      this.debugErrorLog(`Device: ${device.deviceName} hide_device: ${device.hide_device}, will not display in HomeKit`);
    } else {
      registerDevice = false;
      this.debugErrorLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, hide_device: `
      + `${device.hide_device},  will not display in HomeKit`);
    }
    return registerDevice;
  }

  public async externalOrPlatformIR(device: device & irDevicesConfig, accessory: PlatformAccessory) {
    /**
       * Publish as external accessory
       * Only one TV can exist per bridge, to bypass this limitation, you should
       * publish your TV as an external accessory.
       */
    if (device.external) {
      this.debugWarnLog(`${accessory.displayName} External Accessory Mode`);
      this.externalAccessory(accessory);
    } else {
      this.debugLog(`${accessory.displayName} External Accessory Mode: ${device.external}`);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  public async externalOrPlatform(device: device & devicesConfig, accessory: PlatformAccessory) {
    if (device.external) {
      this.debugWarnLog(`${accessory.displayName} External Accessory Mode`);
      this.externalAccessory(accessory);
    } else {
      this.debugLog(`${accessory.displayName} External Accessory Mode: ${device.external}`);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  public async externalAccessory(accessory: PlatformAccessory) {
    this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
  }

  public unregisterPlatformAccessories(existingAccessory: PlatformAccessory) {
    // remove platform accessories when no longer present
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
    this.warnLog(`Removing existing accessory from cache: ${existingAccessory.displayName}`);
  }

  async statusCode({ res }: { res: IncomingMessage }): Promise<void> {
    switch (res.statusCode) {
      case 151:
        this.errorLog('Command not supported by this device type, Submit Feature Request Here: ' + 'https://tinyurl.com/SwitchBotFeatureRequest');
        break;
      case 152:
        this.errorLog('Device not found.');
        break;
      case 160:
        this.errorLog('Command is not supported, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug');
        break;
      case 161:
        this.errorLog('Device is offline.');
        break;
      case 171:
        this.errorLog('is offline');
        break;
      case 190:
        this.errorLog('Requests reached the daily limit');
        break;
      case 100:
        if (this.debugMode) {
          this.debugLog('Command successfully sent.');
        }
        break;
      default:
        if (this.debugMode) {
          this.debugLog('Unknown statusCode, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug');
        }
    }
  }



  // BLE Connection
  connectBLE() {
    let Switchbot: new () => any;
    let switchbot: any;
    try {
      Switchbot = require('node-switchbot');
      queueScheduler.schedule(() =>
        switchbot = new Switchbot(),
      );
    } catch (e: any) {
      switchbot = false;
      this.errorLog(`Was 'node-switchbot' found: ${switchbot}`);
    }
    return switchbot;
  }

  logs() {
    this.debugMode = process.argv.includes('-D') || process.argv.includes('--debug');
    if (this.config.options?.logging === 'debug' || this.config.options?.logging === 'standard' || this.config.options?.logging === 'none') {
      this.platformLogging = this.config.options!.logging;
      this.debugWarnLog(`Using Config Logging: ${this.platformLogging}`);
    } else if (this.debugMode) {
      this.platformLogging = 'debugMode';
      this.debugWarnLog(`Using ${this.platformLogging} Logging`);
    } else {
      this.platformLogging = 'standard';
      this.debugWarnLog(`Using ${this.platformLogging} Logging`);
    }
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

  debugWarnLog(...log: any[]): void {
    if (this.enablingPlatfromLogging()) {
      if (this.platformLogging?.includes('debug')) {
        this.log.warn('[DEBUG]', String(...log));
      }
    }
  }

  errorLog(...log: any[]): void {
    if (this.enablingPlatfromLogging()) {
      this.log.error(String(...log));
    }
  }

  debugErrorLog(...log: any[]): void {
    if (this.enablingPlatfromLogging()) {
      if (this.platformLogging?.includes('debug')) {
        this.log.error('[DEBUG]', String(...log));
      }
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
