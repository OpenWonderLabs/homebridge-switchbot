/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * device.ts: @switchbot/homebridge-switchbot.
 */

import { hostname } from 'os';
import asyncmqtt from 'async-mqtt';
import { BlindTiltMappingMode, SwitchBotModel, SwitchBotBLEModel, sleep } from '../utils.js';

import type { MqttClient } from 'mqtt';
import type { SwitchBotPlatform } from '../platform.js';
import type { API, HAP, Logging, PlatformAccessory } from 'homebridge';
import type { SwitchBotPlatformConfig, device, devicesConfig } from '../settings.js';

export abstract class deviceBase {
  public readonly api: API;
  public readonly log: Logging;
  public readonly config!: SwitchBotPlatformConfig;
  protected readonly hap: HAP;

  // Config
  protected deviceLogging!: string;
  protected deviceUpdateRate!: number;
  protected deviceRefreshRate!: number;
  protected deviceMaxRetries!: number;
  protected deviceDelayBetweenRetries!: number;

  // Connection
  protected readonly BLE: boolean;
  protected readonly OpenAPI: boolean;

  // Accsrroy Information
  protected deviceModel!: SwitchBotModel;
  protected deviceBLEModel!: SwitchBotBLEModel;

  // BLE
  protected scanDuration!: number;

  // EVE history service handler
  protected historyService?: any = null;

  //MQTT stuff
  protected mqttClient: MqttClient | null = null;

  constructor(
    protected readonly platform: SwitchBotPlatform,
    protected accessory: PlatformAccessory,
    protected device: device & devicesConfig,
  ) {
    this.api = this.platform.api;
    this.log = this.platform.log;
    this.config = this.platform.config;
    this.hap = this.api.hap;

    // Connection
    this.BLE = this.device.connectionType === 'BLE' || this.device.connectionType === 'BLE/OpenAPI';
    this.OpenAPI = this.device.connectionType === 'OpenAPI' || this.device.connectionType === 'BLE/OpenAPI';

    this.getDeviceLogSettings(device);
    this.getDeviceRefreshRateSettings(device);
    this.getDeviceRetry(device);
    this.getDeviceConfigSettings(device);
    this.getDeviceContext(accessory, device);
    this.setupMqtt(device);
    this.scan(device);

    // Set accessory information
    accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.hap.Characteristic.Name, device.deviceName)
      .setCharacteristic(this.hap.Characteristic.ConfiguredName, device.deviceName)
      .setCharacteristic(this.hap.Characteristic.Model, device.model!)
      .setCharacteristic(this.hap.Characteristic.SerialNumber, device.deviceId);
  }

  async getDeviceLogSettings(device: device & devicesConfig): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.config.logging) {
      this.deviceLogging = this.accessory.context.logging = this.config.logging;
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
    }
  }

  async getDeviceRefreshRateSettings(device: device & devicesConfig): Promise<void> {
    // refreshRate
    if (device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = device.refreshRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options!.refreshRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
    }
    // updateRate
    if (device.updateRate) {
      this.deviceUpdateRate = device.updateRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config updateRate: ${this.deviceUpdateRate}`);
    } else {
      this.deviceUpdateRate = 5;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Default updateRate: ${this.deviceUpdateRate}`);
    }
  }

  async getDeviceRetry(device: device & devicesConfig): Promise<void> {
    if (device.maxRetries) {
      this.deviceMaxRetries = device.maxRetries;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Max Retries: ${this.deviceMaxRetries}`);
    } else {
      this.deviceMaxRetries = 5; // Maximum number of retries
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Max Retries Not Set, Using: ${this.deviceMaxRetries}`);
    }
    if (device.delayBetweenRetries) {
      this.deviceDelayBetweenRetries = device.delayBetweenRetries * 1000;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Delay Between Retries: ${this.deviceDelayBetweenRetries}`);
    } else {
      this.deviceDelayBetweenRetries = 3000; // Delay between retries in milliseconds
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Delay Between Retries Not Set,`
        + ` Using: ${this.deviceDelayBetweenRetries}`);
    }
  }

  async retryBLE({ max, fn }: { max: number; fn: { (): any; (): Promise<any> } }): Promise<null> {
    return fn().catch(async (e: any) => {
      if (max === 0) {
        throw e;
      }
      this.infoLog(e);
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Retrying`);
      await sleep(1000);
      return this.retryBLE({ max: max - 1, fn });
    });
  }

  async maxRetryBLE(): Promise<number> {
    if (this.device.maxRetry) {
      return this.device.maxRetry;
    } else {
      return 5;
    }
  }


  async scan(device: device & devicesConfig): Promise<void> {
    if (device.scanDuration) {
      if (this.deviceUpdateRate > device.scanDuration) {
        this.scanDuration = this.deviceUpdateRate;
        if (this.BLE) {
          this.warnLog(
            `${this.device.deviceType}: ` +
            `${this.accessory.displayName} scanDuration is less than updateRate, overriding scanDuration with updateRate`,
          );
        }
      } else {
        this.scanDuration = this.accessory.context.scanDuration = device.scanDuration;
      }
      if (this.BLE) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config scanDuration: ${this.scanDuration}`);
      }
    } else {
      if (this.deviceUpdateRate > 1) {
        this.scanDuration = this.deviceUpdateRate;
      } else {
        this.scanDuration = this.accessory.context.scanDuration = 1;
      }
      if (this.BLE) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Default scanDuration: ${this.scanDuration}`);
      }
    }
  }

  async getDeviceConfigSettings(device: device & devicesConfig): Promise<void> {
    const deviceConfig = {};
    if (device.logging !== 'standard') {
      deviceConfig['logging'] = device.logging;
    }
    if (device.refreshRate !== 0) {
      deviceConfig['refreshRate'] = device.refreshRate;
    }
    if (device.updateRate !== 0) {
      deviceConfig['updateRate'] = device.updateRate;
    }
    if (device.scanDuration !== 0) {
      deviceConfig['scanDuration'] = device.scanDuration;
    }
    if (device.offline === true) {
      deviceConfig['offline'] = device.offline;
    }
    if (device.maxRetry !== 0) {
      deviceConfig['maxRetry'] = device.maxRetry;
    }
    if (device.webhook === true) {
      deviceConfig['webhook'] = device.webhook;
    }
    if (device.connectionType !== '') {
      deviceConfig['connectionType'] = device.connectionType;
    }
    if (device.external === true) {
      deviceConfig['external'] = device.external;
    }
    if (device.mqttURL !== '') {
      deviceConfig['mqttURL'] = device.mqttURL;
    }
    if (device.maxRetries !== 0) {
      deviceConfig['maxRetries'] = device.maxRetries;
    }
    if (device.delayBetweenRetries !== 0) {
      deviceConfig['delayBetweenRetries'] = device.delayBetweenRetries;
    }
    let botConfig = {};
    if (device.bot) {
      botConfig = device.bot;
    }
    let lockConfig = {};
    if (device.lock) {
      lockConfig = device.lock;
    }
    let ceilinglightConfig = {};
    if (device.ceilinglight) {
      ceilinglightConfig = device.ceilinglight;
    }
    let colorbulbConfig = {};
    if (device.colorbulb) {
      colorbulbConfig = device.colorbulb;
    }
    let contactConfig = {};
    if (device.contact) {
      contactConfig = device.contact;
    }
    let motionConfig = {};
    if (device.motion) {
      motionConfig = device.motion;
    }
    let curtainConfig = {};
    if (device.curtain) {
      curtainConfig = device.curtain;
    }
    let hubConfig = {};
    if (device.hub) {
      hubConfig = device.hub;
    }
    let waterdetectorConfig = {};
    if (device.waterdetector) {
      waterdetectorConfig = device.waterdetector;
    }
    let humidifierConfig = {};
    if (device.humidifier) {
      humidifierConfig = device.humidifier;
    }
    let meterConfig = {};
    if (device.meter) {
      meterConfig = device.meter;
    }
    let iosensorConfig = {};
    if (device.iosensor) {
      iosensorConfig = device.iosensor;
    }
    let striplightConfig = {};
    if (device.striplight) {
      striplightConfig = device.striplight;
    }
    let plugConfig = {};
    if (device.plug) {
      plugConfig = device.plug;
    }
    let blindTiltConfig = {};
    if (device.blindTilt) {
      if (device.blindTilt?.mode === undefined) {
        blindTiltConfig['mode'] = BlindTiltMappingMode.OnlyUp;
      }
      blindTiltConfig = device.blindTilt;
    }
    const config = Object.assign({}, deviceConfig, botConfig, curtainConfig, waterdetectorConfig, striplightConfig, plugConfig, iosensorConfig,
      meterConfig, humidifierConfig, hubConfig, lockConfig, ceilinglightConfig, colorbulbConfig, contactConfig, motionConfig, blindTiltConfig);
    if (Object.entries(config).length !== 0) {
      this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  /*
   * Publish MQTT message for topics of
   * 'homebridge-switchbot/${this.device.deviceType}/xx:xx:xx:xx:xx:xx'
   */
  mqttPublish(message: string, topic?: string) {
    const mac = this.device.deviceId
      ?.toLowerCase()
      .match(/[\s\S]{1,2}/g)
      ?.join(':');
    const options = this.device.mqttPubOptions || {};
    let mqttTopic: string;
    let mqttMessageTopic: string;
    if (topic) {
      mqttTopic = `/${topic}`;
      mqttMessageTopic = `${topic}/`;
    } else {
      mqttTopic = '';
      mqttMessageTopic = '';
    }
    this.mqttClient?.publish(`homebridge-switchbot/${this.device.deviceType}/${mac}${mqttTopic}`, `${message}`, options);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
      + ` MQTT message: ${mqttMessageTopic}${message} options:${JSON.stringify(options)}`);
  }

  /*
   * Setup MQTT hadler if URL is specified.
   */
  async setupMqtt(device: device & devicesConfig): Promise<void> {
    if (device.mqttURL) {
      try {
        const { connectAsync } = asyncmqtt;
        this.mqttClient = await connectAsync(device.mqttURL, device.mqttOptions || {});
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} MQTT connection has been established successfully.`);
        this.mqttClient.on('error', (e: Error) => {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Failed to publish MQTT messages. ${e}`);
        });
      } catch (e) {
        this.mqttClient = null;
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Failed to establish MQTT connection. ${e}`);
      }
    }
  }

  /*
   * Setup EVE history graph feature if enabled.
   */
  async setupHistoryService(device: device & devicesConfig): Promise<void> {
    const mac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(':')
      .toLowerCase();
    this.historyService = device.history
      ? new this.platform.fakegatoAPI('room', this.accessory, {
        log: this.platform.log,
        storage: 'fs',
        filename: `${hostname().split('.')[0]}_${mac}_persist.json`,
      })
      : null;
  }

  async getCustomBLEAddress(switchbot: any) {
    if (this.device.customBLEaddress && this.deviceLogging.includes('debug')) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} customBLEaddress: ${this.device.customBLEaddress}`);
      (async () => {
        // Start to monitor advertisement packets
        await switchbot.startScan({ model: this.device.bleModel });
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

  async getDeviceContext(accessory: PlatformAccessory, device: device & devicesConfig): Promise<void> {
    // Set the accessory context
    switch (device.deviceType) {
      case 'Humidifier':
        device.model = SwitchBotModel.Humidifier;
        device.bleModel = SwitchBotBLEModel.Humidifier;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Hub Mini':
        device.model = SwitchBotModel.HubMini;
        device.bleModel = SwitchBotBLEModel.Unknown;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Hub Plus':
        device.model = SwitchBotModel.HubPlus;
        device.bleModel = SwitchBotBLEModel.Unknown;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Hub 2':
        device.model = SwitchBotModel.Hub2;
        device.bleModel = SwitchBotBLEModel.Unknown;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Bot':
        device.model = SwitchBotModel.Bot;
        device.bleModel = SwitchBotBLEModel.Bot;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Meter':
        device.model = SwitchBotModel.Meter;
        device.bleModel = SwitchBotBLEModel.Meter;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'MeterPlus':
        device.model = SwitchBotModel.MeterPlusUS;
        device.bleModel = SwitchBotBLEModel.MeterPlus;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Meter Plus (JP)':
        device.model = SwitchBotModel.MeterPlusJP;
        device.bleModel = SwitchBotBLEModel.MeterPlus;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'WoIOSensor':
        device.model = SwitchBotModel.OutdoorMeter;
        device.bleModel = SwitchBotBLEModel.OutdoorMeter;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Water Detector':
        device.model = SwitchBotModel.WaterDetector;
        device.bleModel = SwitchBotBLEModel.Unknown;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Motion Sensor':
        device.model = SwitchBotModel.MotionSensor;
        device.bleModel = SwitchBotBLEModel.MotionSensor;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Contact Sensor':
        device.model = SwitchBotModel.ContactSensor;
        device.bleModel = SwitchBotBLEModel.ContactSensor;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Curtain':
        device.model = SwitchBotModel.Curtain;
        device.bleModel = SwitchBotBLEModel.Curtain;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Curtain3':
        device.model = SwitchBotModel.Curtain3;
        device.bleModel = SwitchBotBLEModel.Curtain3;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Blind Tilt':
        device.model = SwitchBotModel.BlindTilt;
        device.bleModel = SwitchBotBLEModel.BlindTilt;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Plug':
        device.model = SwitchBotModel.Plug;
        device.bleModel = SwitchBotBLEModel.PlugMiniUS;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Plug Mini (US)':
        device.model = SwitchBotModel.PlugMiniUS;
        device.bleModel = SwitchBotBLEModel.PlugMiniUS;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Plug Mini (JP)':
        device.model = SwitchBotModel.PlugMiniJP;
        device.bleModel = SwitchBotBLEModel.PlugMiniJP;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Smart Lock':
        device.model = SwitchBotModel.Lock;
        device.bleModel = SwitchBotBLEModel.Lock;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Smart Lock Pro':
        device.model = SwitchBotModel.LockPro;
        device.bleModel = SwitchBotBLEModel.Unknown;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Color Bulb':
        device.model = SwitchBotModel.ColorBulb;
        device.bleModel = SwitchBotBLEModel.ColorBulb;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'K10+':
        device.model = SwitchBotModel.K10;
        device.bleModel = SwitchBotBLEModel.Unknown;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'WoSweeper':
        device.model = SwitchBotModel.WoSweeper;
        device.bleModel = SwitchBotBLEModel.Unknown;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'WoSweeperMini':
        device.model = SwitchBotModel.WoSweeperMini;
        device.bleModel = SwitchBotBLEModel.Unknown;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Robot Vacuum Cleaner S1':
        device.model = SwitchBotModel.RobotVacuumCleanerS1;
        device.bleModel = SwitchBotBLEModel.Unknown;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Robot Vacuum Cleaner S1 Plus':
        device.model = SwitchBotModel.RobotVacuumCleanerS1Plus;
        device.bleModel = SwitchBotBLEModel.Unknown;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Robot Vacuum Cleaner S10':
        device.model = SwitchBotModel.RobotVacuumCleanerS10;
        device.bleModel = SwitchBotBLEModel.Unknown;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Ceiling Light':
        device.model = SwitchBotModel.CeilingLight;
        device.bleModel = SwitchBotBLEModel.CeilingLight;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Ceiling Light Pro':
        device.model = SwitchBotModel.CeilingLightPro;
        device.bleModel = SwitchBotBLEModel.CeilingLightPro;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Strip Light':
        device.model = SwitchBotModel.StripLight;
        device.bleModel = SwitchBotBLEModel.StripLight;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Indoor Cam':
        device.model = SwitchBotModel.IndoorCam;
        device.bleModel = SwitchBotBLEModel.Unknown;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Remote':
        device.model = SwitchBotModel.Remote;
        device.bleModel = SwitchBotBLEModel.Remote;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'remote with screen+':
        device.model = SwitchBotModel.UniversalRemote;
        device.bleModel = SwitchBotBLEModel.Unknown;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Battery Circulator Fan':
        device.model = SwitchBotModel.BatteryCirculatorFan;
        device.bleModel = SwitchBotBLEModel.Unknown;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      default:
        device.model = SwitchBotModel.Unknown;
        device.bleModel = SwitchBotBLEModel.Unknown;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
    }
    accessory.context.model = device.model;

    let deviceFirmwareVersion: string;
    if (device.firmware) {
      deviceFirmwareVersion = device.firmware;
      this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} 1 FirmwareRevision: ${device.firmware}`);
    } else if (device.version) {
      deviceFirmwareVersion = device.version;
      this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} 2 FirmwareRevision: ${device.version}`);
    } else if (accessory.context.deviceVersion) {
      deviceFirmwareVersion = accessory.context.deviceVersion;
      this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} 3 FirmwareRevision: ${accessory.context.deviceVersion}`);
    } else {
      deviceFirmwareVersion = this.platform.version ?? '0.0.0';
      if (this.platform.version) {
        this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} 4 FirmwareRevision: ${this.platform.version}`);
      } else {
        this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} 5 FirmwareRevision: ${deviceFirmwareVersion}`);
      }
    }

    // Firmware Version
    const version = deviceFirmwareVersion.toString();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Firmware Version: ${version?.replace(/^V|-.*$/g, '')}`);
    let deviceVersion: string;
    if (version?.includes('.') === false) {
      const replace = version?.replace(/^V|-.*$/g, '');
      const match = replace?.match(/.{1,1}/g);
      const blindTiltVersion = match?.join('.') ?? '0.0.0';
      deviceVersion = blindTiltVersion;
    } else {
      deviceVersion = version?.replace(/^V|-.*$/g, '') ?? '0.0.0';
    }
    this.accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
      .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
      .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
      .updateValue(deviceVersion);
    this.accessory.context.deviceVersion = deviceVersion;
    this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceVersion: ${this.accessory.context.deviceVersion}`);
  }

  async statusCode(statusCode: number): Promise<void> {
    if (statusCode === 171) {
      if (this.device.deviceId === this.device.hubDeviceId) {
        statusCode = 161;
      }
      if (this.device.deviceId === '000000000000') {
        statusCode = 161;
      }
    }
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
        break;
      case 171:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Hub Device is offline, statusCode: ${statusCode}. ` +
          `Hub: ${this.device.hubDeviceId}`);
        break;
      case 190:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Device internal error due to device states not synchronized with` +
          ` server, Or command format is invalid, statusCode: ${statusCode}`);
        break;
      case 100:
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Command successfully sent, statusCode: ${statusCode}`);
        break;
      case 200:
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Request successful, statusCode: ${statusCode}`);
        break;
      case 400:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Bad Request, The client has issued an invalid request. `
          + `This is commonly used to specify validation errors in a request payload, statusCode: ${statusCode}`);
        break;
      case 401:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Unauthorized,	Authorization for the API is required, `
          + `but the request has not been authenticated, statusCode: ${statusCode}`);
        break;
      case 403:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Forbidden,	The request has been authenticated but does not `
          + `have appropriate permissions, or a requested resource is not found, statusCode: ${statusCode}`);
        break;
      case 404:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Not Found,	Specifies the requested path does not exist, `
          + `statusCode: ${statusCode}`);
        break;
      case 406:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Not Acceptable,	The client has requested a MIME type via `
          + `the Accept header for a value not supported by the server, statusCode: ${statusCode}`);
        break;
      case 415:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Unsupported Media Type,	The client has defined a contentType `
          + `header that is not supported by the server, statusCode: ${statusCode}`);
        break;
      case 422:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Unprocessable Entity,	The client has made a valid request, `
          + `but the server cannot process it. This is often used for APIs for which certain limits have been exceeded, statusCode: ${statusCode}`);
        break;
      case 429:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Too Many Requests,	The client has exceeded the number of `
          + `requests allowed for a given time window, statusCode: ${statusCode}`);
        break;
      case 500:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Internal Server Error,	An unexpected error on the SmartThings `
          + `servers has occurred. These errors should be rare, statusCode: ${statusCode}`);
        break;
      default:
        this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Unknown statusCode: `
          + `${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`);
    }
  }

  /**
   * Logging for Device
   */
  infoLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.log.info(String(...log));
    }
  }

  successLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.log.success(String(...log));
    }
  }

  debugSuccessLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging?.includes('debug')) {
        this.log.success('[DEBUG]', String(...log));
      }
    }
  }

  warnLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.log.warn(String(...log));
    }
  }

  debugWarnLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging?.includes('debug')) {
        this.log.warn('[DEBUG]', String(...log));
      }
    }
  }

  errorLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.log.error(String(...log));
    }
  }

  debugErrorLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging?.includes('debug')) {
        this.log.error('[DEBUG]', String(...log));
      }
    }
  }

  debugLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging === 'debug') {
        this.log.info('[DEBUG]', String(...log));
      } else {
        this.log.debug(String(...log));
      }
    }
  }

  enablingDeviceLogging(): boolean {
    return this.deviceLogging.includes('debug') || this.deviceLogging === 'standard';
  }
}