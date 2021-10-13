import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, Service, Characteristic } from 'homebridge';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import {
  PLATFORM_NAME,
  PLUGIN_NAME,
  DeviceURL,
  irdevice,
  device,
  SwitchBotPlatformConfig,
  deviceResponses,
  deviceStatusResponse,
} from './settings';
import { Bot } from './devices/bots';
import { Plug } from './devices/plugs';
import { Meter } from './devices/meters';
import { Motion } from './devices/motion';
import { Contact } from './devices/contact';
import { Curtain } from './devices/curtains';
import { IndoorCam } from './devices/indoorcam';
import { Humidifier } from './devices/humidifiers';
import { TV } from './irdevices/tvs';
import { Fan } from './irdevices/fans';
import { Light } from './irdevices/lights';
import { Camera } from './irdevices/cameras';
import { Others } from './irdevices/others';
import { WaterHeater } from './irdevices/waterheaters';
import { VacuumCleaner } from './irdevices/vacuumcleaners';
import { AirConditioner } from './irdevices/airconditioners';
import { AirPurifier } from './irdevices/airpurifiers';

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

  public axios: AxiosInstance = axios.create({
    responseType: 'json',
  });

  // debugMode!: boolean;
  version = require('../package.json').version; // eslint-disable-line @typescript-eslint/no-var-requires
  deviceStatus!: deviceStatusResponse;

  constructor(public readonly log: Logger, public readonly config: SwitchBotPlatformConfig, public readonly api: API) {
    this.log.debug('Finished initializing platform:', this.config.name);
    // only load if configured
    if (!this.config) {
      return;
    }

    // HOOBS notice
    if (__dirname.includes('hoobs')) {
      this.log.warn('This plugin has not been tested under HOOBS, it is highly recommended that ' +
        'you switch to Homebridge: https://git.io/Jtxb0');
    }

    // verify the config
    try {
      this.verifyConfig();
      this.log.debug('Config OK');
    } catch (e: any) {
      this.log.error(JSON.stringify(e.message));
      this.log.debug(JSON.stringify(e));
      return;
    }

    //this.debugMode = process.argv.includes('-D') || process.argv.includes('--debug');

    // setup axios interceptor to add headers / api key to each request
    this.axios.interceptors.request.use((request: AxiosRequestConfig) => {
      request.headers!.Authorization = this.config.credentials?.openToken;
      request.headers!['Content-Type'] = 'application/json; charset=utf8';
      return request;
    });

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', async () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      try {
        this.discoverDevices();
      } catch (e: any) {
        this.log.error('Failed to Discover Devices.', JSON.stringify(e.message));
        this.log.debug(JSON.stringify(e));
      }
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    //accessory.context.timeout = this.apiError(accessory);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  apiError(accessory: PlatformAccessory) {
    this.log.debug('API Error:', accessory.displayName);
  }

  /**
   * Verify the config passed to the plugin is valid
   */
  verifyConfig() {
    /**
     * Hidden Device Discovery Option
     * This will disable adding any device and will just output info.
     */
    this.config.options = this.config.options || {};

    //Enable BLE for Device
    this.config.options.ble;

    // Hide Devices by DeviceID
    this.config.options.hide_device = this.config.options.hide_device || [];

    // Meter Config Options
    this.config.options.bot = this.config.options.bot || {};
    this.config.options.bot.device_press;
    this.config.options.bot.device_switch;

    // Meter Config Options
    this.config.options.meter = this.config.options.meter || {};
    this.config.options.meter.hide_temperature;
    this.config.options.meter.hide_humidity;

    // Humidifier Config Options
    this.config.options.humidifier = this.config.options.humidifier || {};
    this.config.options.humidifier.set_minStep;
    this.config.options.humidifier.hide_temperature;


    // Curtain Config Options
    this.config.options.curtain = this.config.options.curtain || {};
    this.config.options.curtain.disable_group;
    if (!this.config.options.curtain.refreshRate) {
      this.config.options!.curtain!.refreshRate! = 5;
      if (this.config.options.debug) {
        this.log.warn('Using Default Curtain Refresh Rate.');
      }
    }
    this.config.options.curtain.set_minStep;
    this.config.options.curtain.set_min;
    this.config.options.curtain.set_max;

    // Fan Config Options
    this.config.options.fan = this.config.options.fan || {};
    this.config.options.fan.swing_mode;
    this.config.options.fan.rotation_speed;
    this.config.options.fan.set_minStep;
    this.config.options.fan.set_min;
    this.config.options.fan.set_max;


    // AirConditioner Config Options
    this.config.options.irair = this.config.options.irair || {};
    this.config.options.irair.hide_automode;


    // Others Config Options
    this.config.options.other = this.config.options.other || {};
    this.config.options.other.deviceType;
    this.config.options.other.commandOn;
    this.config.options.other.commandOff;

    if (this.config.options!.refreshRate! < 120) {
      throw new Error('Refresh Rate must be above 120 (2 minutes).');
    }

    if (!this.config.options.refreshRate) {
      // default 600 seconds (15 minutes)
      this.config.options!.refreshRate! = 1000;
      this.log.warn('Using Default Refresh Rate.');
    }

    if (!this.config.options.pushRate) {
      // default 100 milliseconds
      this.config.options!.pushRate! = 0.1;
      this.log.warn('Using Default Push Rate.');
    }

    if (!this.config.credentials) {
      throw new Error('Missing Credentials');
    }
    if (!this.config.credentials.openToken) {
      throw new Error('Missing openToken');
    }
  }



  /**
 * this method discovers the Locations
 */
  async discoverDevices() {
    try {
      const devices: any = (await this.axios.get(DeviceURL)).data;

      this.deviceListInfo(devices);
      this.debug(JSON.stringify(devices));
      this.log.info('Total SwitchBot Devices Found:', devices.body.deviceList.length);
      this.log.info('Total IR Devices Found:', devices.body.infraredRemoteList.length);
      for (const device of devices.body.deviceList) {
        this.deviceInfo(device);
        this.debug(JSON.stringify(device));
        // For Future Devices
        switch (device.deviceType) {
          case 'Humidifier':
            this.debug(`Discovered ${device.deviceType}: ${device.deviceId}`);
            this.createHumidifier(device);
            break;
          case 'Hub Mini':
            this.debug(`Discovered ${device.deviceType}: ${device.deviceId}`);
            break;
          case 'Hub Plus':
            this.debug(`Discovered ${device.deviceType}: ${device.deviceId}`);
            break;
          case 'Bot':
            this.debug(`Discovered ${device.deviceType}: ${device.deviceId}`);
            this.createBot(device);
            break;
          case 'Meter':
            this.debug(`Discovered ${device.deviceType}: ${device.deviceId}`);
            this.createMeter(device);
            break;
          case 'Motion Sensor':
            this.debug(`Discovered ${device.deviceType}: ${device.deviceId}`);
            this.createMotion(device);
            break;
          case 'Contact Sensor':
            this.debug(`Discovered ${device.deviceType}: ${device.deviceId}`);
            this.createContact(device);
            break;
          case 'Curtain':
            this.debug(`Discovered ${device.deviceType}: ${device.deviceId}`);
            this.createCurtain(device);
            break;
          case 'Plug':
            this.debug(`Discovered ${device.deviceType}: ${device.deviceId}`);
            this.createPlug(device);
            break;
          case 'IndoorCam':
            this.debug(`Discovered ${device.deviceType}: ${device.deviceId}`);
            this.createIndoorCam(device);
            break;
          case 'Remote':
            this.debug(`Discovered ${device.deviceType}: ${device.deviceId} is Not Supported.`);
            break;
          default:
            // eslint-disable-next-line max-len
            this.log.info(`Device: ${device.deviceName} with Device Type: ${device.deviceType}, is currently not supported.`);
            this.log.info('Submit Feature Requests Here: https://git.io/JL14Z');
        }
      }
      for (const device of devices.body.infraredRemoteList) {
        this.deviceInfo(device);
        this.debug(JSON.stringify(device));
        // For Future Devices
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
            this.debug(`Discovered ${device.remoteType}: ${device.deviceId}`);
            this.createTV(device);
            break;
          case 'Fan':
          case 'DIY Fan':
            this.debug(`Discovered ${device.remoteType}: ${device.deviceId}`);
            this.createFan(device);
            break;
          case 'Air Conditioner':
          case 'DIY Air Conditioner':
            this.debug(`Discovered ${device.remoteType}: ${device.deviceId}`);
            this.createAirConditioner(device);
            break;
          case 'Light':
          case 'DIY Light':
            this.debug(`Discovered ${device.remoteType}: ${device.deviceId}`);
            this.createLight(device);
            break;
          case 'Air Purifier':
          case 'DIY Air Purifier':
            this.debug(`Discovered ${device.remoteType}: ${device.deviceId}`);
            this.createAirPurifier(device);
            break;
          case 'Water Heater':
          case 'DIY Water Heater':
            this.debug(`Discovered ${device.remoteType}: ${device.deviceId}`);
            this.createWaterHeater(device);
            break;
          case 'Vacuum Cleaner':
          case 'DIY Vacuum Cleaner':
            this.debug(`Discovered ${device.remoteType}: ${device.deviceId}`);
            this.createVacuumCleaner(device);
            break;
          case 'Camera':
          case 'DIY Camera':
            this.debug(`Discovered ${device.remoteType}: ${device.deviceId}`);
            this.createCamera(device);
            break;
          case 'Others':
            this.debug(`Discovered ${device.remoteType}: ${device.deviceId}`);
            this.createOthers(device);
            break;
          default:
            // eslint-disable-next-line max-len
            this.log.info(`Device: ${device.deviceName} with Device Type: ${device.remoteType}, is currently not supported.`);
            this.log.info('Submit Feature Requests Here: https://git.io/JL14Z');
        }
      }
    } catch (e: any) {
      this.log.error('Failed to Discover Devices.', JSON.stringify(e.message));
      this.debug(JSON.stringify(e));
    }
  }

  private async createHumidifier(device: device) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options?.hide_device.includes(device.deviceId!) && device.enableCloudService) {
        this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        //existingAccessory.context.firmwareRevision = firmware;
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.context.firmwareRevision = this.version;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Humidifier(this, existingAccessory, device);
        this.debug(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!this.config.options?.hide_device.includes(device.deviceId!) && device.enableCloudService) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.deviceName} ${device.deviceType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = this.version;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Humidifier(this, accessory, device);
      this.debug(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      this.device(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private async createBot(device: device) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options?.hide_device.includes(device.deviceId!) && device.enableCloudService) {
        this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.context.firmwareRevision = this.version;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Bot(this, existingAccessory, device);
        this.debug(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!this.config.options?.hide_device.includes(device.deviceId!) && device.enableCloudService) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);

      if (!this.config.options?.bot?.device_press && !this.config.options?.bot?.device_switch) {
        this.log.error('You must set your Bot to Press or Switch Mode');
      }
      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.deviceName} ${device.deviceType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = this.version;
      await this.connectionTypeNewAccessory(device, accessory);
      // accessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Bot(this, accessory, device);
      this.debug(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      this.device(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private async createMeter(device: device) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options?.hide_device.includes(device.deviceId!) && device.enableCloudService) {
        this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.context.firmwareRevision = this.version;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Meter(this, existingAccessory, device);
        this.debug(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!this.config.options?.hide_device.includes(device.deviceId!) && device.enableCloudService) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.deviceName} ${device.deviceType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = this.version;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Meter(this, accessory, device);
      this.debug(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      this.device(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private async createMotion(device: device) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options?.hide_device.includes(device.deviceId) && device.enableCloudService) {
        this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.context.firmwareRevision = this.version;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Motion(this, existingAccessory, device);
        this.debug(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!this.config.options?.hide_device.includes(device.deviceId) && device.enableCloudService) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.deviceName} ${device.deviceType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = this.version;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Motion(this, accessory, device);
      this.debug(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      this.device(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private async createContact(device: device) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options?.hide_device.includes(device.deviceId) && device.enableCloudService) {
        this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.context.firmwareRevision = this.version;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Contact(this, existingAccessory, device);
        this.debug(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!this.config.options?.hide_device.includes(device.deviceId) && device.enableCloudService) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.deviceName} ${device.deviceType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = this.version;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Contact(this, accessory, device);
      this.debug(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      this.device(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private async createCurtain(device: device) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (this.isCurtainGrouped(device)) {
        this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.context.firmwareRevision = this.version;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Curtain(this, existingAccessory, device);
        this.debug(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (this.isCurtainGrouped(device)) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
      if (device.group && !this.config.options?.curtain?.disable_group) {
        this.device(`Your Curtains are grouped
        , Secondary curtain automatically hidden. Main Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
      } else {
        if (device.master) {
          this.device(`Main Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
        } else {
          this.device(`Secondary Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
        }
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.deviceName} ${device.deviceType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = this.version;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Curtain(this, accessory, device);
      this.debug(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      this.device(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private isCurtainGrouped(device: device) {
    if (device.group && !this.config.options?.curtain?.disable_group) {
      return device.master && !this.config.options?.hide_device.includes(device.deviceId!) && device.enableCloudService;
    } else {
      return !this.config.options?.hide_device.includes(device.deviceId!) && device.enableCloudService;
    }
  }

  private async createPlug(device: device) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options?.hide_device.includes(device.deviceId!) && device.enableCloudService) {
        this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.context.firmwareRevision = this.version;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Plug(this, existingAccessory, device);
        this.debug(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!this.config.options?.hide_device.includes(device.deviceId!) && device.enableCloudService) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.deviceName} ${device.deviceType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = this.version;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Plug(this, accessory, device);
      this.debug(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      this.device(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private async createIndoorCam(device: device) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options?.hide_device.includes(device.deviceId!) && device.enableCloudService) {
        this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.context.firmwareRevision = this.version;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new IndoorCam(this, existingAccessory, device);
        this.debug(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!this.config.options?.hide_device.includes(device.deviceId!) && device.enableCloudService) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.deviceName} ${device.deviceType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = this.version;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new IndoorCam(this, accessory, device);
      this.debug(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      this.device(`Unable to Register new device: ${device.deviceName} ${device.deviceType} - ${device.deviceId}`);
    }
  }

  private async createTV(device: irdevice) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory && !this.config.options?.hide_device.includes(device.deviceId)) {
      this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

      // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
      existingAccessory.context.model = device.remoteType;
      existingAccessory.context.deviceID = device.deviceId;
      existingAccessory.context.firmwareRevision = this.version;
      await this.connectionTypeExistingAccessory(device, existingAccessory);
      this.api.updatePlatformAccessories([existingAccessory]);
      // create the accessory handler for the restored accessory
      // this is imported from `platformAccessory.ts`
      new TV(this, existingAccessory, device);
      this.debug(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}`);
    } else if (!this.config.options?.hide_device.includes(device.deviceId)) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.deviceName} ${device.remoteType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = this.version;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new TV(this, accessory, device);
      this.debug(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}`);

      /**
     * Publish as external accessory
     * Only one TV can exist per bridge, to bypass this limitation, you should
     * publish your TV as an external accessory.
     */
      this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      this.device(`Unable to Register new device: ${device.deviceName} ${device.remoteType} - ${device.deviceId}`);
    }
  }

  private async createFan(device: irdevice) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options?.hide_device.includes(device.deviceId)) {
        this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:

        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.context.firmwareRevision = this.version;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Fan(this, existingAccessory, device);
        this.debug(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!this.config.options?.hide_device.includes(device.deviceId)) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.deviceName} ${device.remoteType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = this.version;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Fan(this, accessory, device);
      this.debug(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      this.device(`Unable to Register new device: ${device.deviceName} ${device.remoteType} - ${device.deviceId}`);
    }
  }

  private async createLight(device: irdevice) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options?.hide_device.includes(device.deviceId)) {
        this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.context.firmwareRevision = this.version;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Light(this, existingAccessory, device);
        this.debug(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!this.config.options?.hide_device.includes(device.deviceId)) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.deviceName} ${device.remoteType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = this.version;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Light(this, accessory, device);
      this.debug(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      this.device(`Unable to Register new device: ${device.deviceName} ${device.remoteType} - ${device.deviceId}`);
    }
  }

  private async createAirConditioner(device: irdevice) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options?.hide_device.includes(device.deviceId)) {
        this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.context.firmwareRevision = this.version;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new AirConditioner(this, existingAccessory, device);
        this.debug(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!this.config.options?.hide_device.includes(device.deviceId)) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.deviceName} ${device.remoteType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = this.version;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new AirConditioner(this, accessory, device);
      this.debug(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      this.device(`Unable to Register new device: ${device.deviceName} ${device.remoteType} - ${device.deviceId}`);
    }
  }

  private async createAirPurifier(device: irdevice) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options?.hide_device.includes(device.deviceId)) {
        this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.context.firmwareRevision = this.version;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new AirPurifier(this, existingAccessory, device);
        this.debug(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!this.config.options?.hide_device.includes(device.deviceId)) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.deviceName} ${device.remoteType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = this.version;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new AirPurifier(this, accessory, device);
      this.debug(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      this.device(`Unable to Register new device: ${device.deviceName} ${device.remoteType} - ${device.deviceId}`);
    }
  }

  private async createWaterHeater(device: irdevice) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options?.hide_device.includes(device.deviceId)) {
        this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.context.firmwareRevision = this.version;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new WaterHeater(this, existingAccessory, device);
        this.debug(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!this.config.options?.hide_device.includes(device.deviceId)) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.deviceName} ${device.remoteType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = this.version;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new WaterHeater(this, accessory, device);
      this.debug(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      this.device(`Unable to Register new device: ${device.deviceName} ${device.remoteType} - ${device.deviceId}`);
    }
  }

  private async createVacuumCleaner(device: irdevice) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options?.hide_device.includes(device.deviceId)) {
        this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.context.firmwareRevision = this.version;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new VacuumCleaner(this, existingAccessory, device);
        this.debug(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!this.config.options?.hide_device.includes(device.deviceId)) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.deviceName} ${device.remoteType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = this.version;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new VacuumCleaner(this, accessory, device);
      this.debug(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      this.device(`Unable to Register new device: ${device.deviceName} ${device.remoteType} - ${device.deviceId}`);
    }
  }

  private async createCamera(device: irdevice) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options?.hide_device.includes(device.deviceId)) {
        this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.context.firmwareRevision = this.version;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Camera(this, existingAccessory, device);
        this.debug(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!this.config.options?.hide_device.includes(device.deviceId)) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.deviceName} ${device.remoteType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = this.version;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Camera(this, accessory, device);
      this.debug(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      this.device(`Unable to Register new device: ${device.deviceName} ${device.remoteType} - ${device.deviceId}`);
    }
  }

  private async createOthers(device: irdevice) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!this.config.options?.hide_device.includes(device.deviceId)) {
        this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.context.firmwareRevision = this.version;
        await this.connectionTypeExistingAccessory(device, existingAccessory);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Others(this, existingAccessory, device);
        this.debug(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!this.config.options?.hide_device.includes(device.deviceId)) {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`${device.deviceName} ${device.remoteType}`, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      accessory.context.firmwareRevision = this.version;
      await this.connectionTypeNewAccessory(device, accessory);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Others(this, accessory, device);
      this.debug(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}`);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    } else {
      this.device(`Unable to Register new device: ${device.deviceName} ${device.remoteType} - ${device.deviceId}`);
    }
  }

  public async connectionTypeNewAccessory(
    device: device | irdevice,
    accessory: PlatformAccessory) {
    if (this.config.options?.ble?.includes(device.deviceId!)) {
      accessory.context.connectionType = 'BLE';
    } else {
      accessory.context.connectionType = 'OpenAPI';
    }
  }

  public async connectionTypeExistingAccessory(
    device: device | irdevice,
    existingAccessory: PlatformAccessory,
  ) {
    if (this.config.options?.ble?.includes(device.deviceId!)) {
      existingAccessory.context.connectionType = 'BLE';
    } else {
      existingAccessory.context.connectionType = 'OpenAPI';
    }
  }

  public unregisterPlatformAccessories(existingAccessory: PlatformAccessory) {
    // remove platform accessories when no longer present
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
    this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
  }

  public deviceListInfo(devices: deviceResponses) {
    this.device(JSON.stringify(devices));
  }

  public async deviceInfo(device: irdevice | device) {
    if (this.config.options?.debug === 'device') {
      this.device(JSON.stringify(device));
      this.deviceStatus = await this.axios.get(`${DeviceURL}/${device.deviceId}/status`);
      if (this.deviceStatus.message === 'success') {
        this.device(`${device.deviceName} deviceStatus - ${JSON.stringify(this.deviceStatus)}`);
      } else {
        this.device(`${device.deviceName} deviceStatus - ${JSON.stringify(this.deviceStatus.message)}`);
        this.device('Unable to retreive device status.');
      }
    }
  }

  /**
   * If debug level logging is turned on, log to log.info
   * Otherwise send debug logs to log.debug
   */
  debug(...log: any[]) {
    if (this.config.options!.debug === 'debug') {
      this.log.info('[DEBUG]', String(...log));
    } else {
      this.log.debug(String(...log));
    }
  }

  /**
   * If debug level logging is turned on, log to log.info
   * Otherwise send debug logs to log.debug
   */
  device(...log: any[]) {
    if (this.config.options!.debug === 'device') {
      this.log.warn('[DEVICE]', String(...log));
    } else {
      this.log.debug(String(...log));
    }
  }
}
