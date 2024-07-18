/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * device.ts: @switchbot/homebridge-switchbot.
 */

import { hostname } from 'os';
import { request } from 'undici';
import { Devices } from '../settings.js';
import { BlindTiltMappingMode, sleep } from '../utils.js';
import { SwitchBotModel, SwitchBotBLEModel, SwitchBotBLEModelName, SwitchBotBLEModelFriendlyName } from 'node-switchbot';

import type { MqttClient } from 'mqtt';
import type { device } from '../types/devicelist.js';
import type { ad } from '../types/bledevicestatus.js';
import type { SwitchBotPlatform } from '../platform.js';
import type { SwitchBotPlatformConfig, devicesConfig } from '../settings.js';
import type { API, CharacteristicValue, HAP, Logging, PlatformAccessory, Service } from 'homebridge';

export abstract class deviceBase {
  public readonly api: API;
  public readonly log: Logging;
  public readonly config!: SwitchBotPlatformConfig;
  protected readonly hap: HAP;

  // Config
  protected deviceLogging!: string;
  protected deviceRefreshRate!: number;
  protected deviceUpdateRate!: number;
  protected devicePushRate!: number;
  protected deviceMaxRetries!: number;
  protected deviceDelayBetweenRetries!: number;

  // Connection
  protected readonly BLE: boolean;
  protected readonly OpenAPI: boolean;

  // Accsrroy Information
  protected deviceModel!: SwitchBotModel;
  protected deviceBLEModel!: SwitchBotBLEModel;

  // MQTT
  protected deviceMqttURL!: string;
  protected deviceMqttOptions!: any;
  protected deviceMqttPubOptions!: any;

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

    this.getDeviceLogSettings(accessory, device);
    this.getDeviceRateSettings(accessory, device);
    this.getDeviceRetry(device);
    this.getDeviceConfigSettings(device);
    this.getDeviceContext(accessory, device);
    this.getDeviceScanDuration(accessory, device);
    this.getMqttSettings(device);

    // Set accessory information
    accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.hap.Characteristic.AppMatchingIdentifier, 'id1087374760')
      .setCharacteristic(this.hap.Characteristic.Name, accessory.displayName)
      .setCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName)
      .setCharacteristic(this.hap.Characteristic.Model, device.model)
      .setCharacteristic(this.hap.Characteristic.ProductData, device.deviceId)
      .setCharacteristic(this.hap.Characteristic.SerialNumber, device.deviceId);
  }

  async getDeviceLogSettings(accessory: PlatformAccessory, device: device & devicesConfig): Promise<void> {
    this.deviceLogging = this.platform.debugMode ? 'debugMode' : device.logging ?? this.config.logging ?? 'standard';
    const logging = this.platform.debugMode ? 'Debug Mode' : device.logging ? 'Device Config' : this.config.logging ? 'Platform Config' : 'Default';
    accessory.context.deviceLogging = this.deviceLogging;
    await this.debugLog(`Using ${logging} Logging: ${this.deviceLogging}`);
  }

  async getDeviceRateSettings(accessory: PlatformAccessory, device: device & devicesConfig): Promise<void> {
    // refreshRate
    this.deviceRefreshRate = device.refreshRate ?? this.config.options?.refreshRate ?? 5;
    accessory.context.deviceRefreshRate = this.deviceRefreshRate;
    const refreshRate = device.refreshRate ? 'Device Config' : this.config.options?.refreshRate ? 'Platform Config' : 'Default';
    // updateRate
    this.deviceUpdateRate = device.updateRate ?? this.config.options?.updateRate ?? 5;
    accessory.context.deviceUpdateRate = this.deviceUpdateRate;
    const updateRate = device.updateRate ? 'Device Config' : this.config.options?.updateRate ? 'Platform Config' : 'Default';
    // pushRate
    this.devicePushRate = device.pushRate ?? this.config.options?.pushRate ?? 1;
    accessory.context.devicePushRate = this.devicePushRate;
    const pushRate = device.pushRate ? 'Device Config' : this.config.options?.pushRate ? 'Platform Config' : 'Default';
    await this.debugLog(`Using ${refreshRate} refreshRate: ${this.deviceRefreshRate}, ${updateRate} updateRate: ${this.deviceUpdateRate},`
      + ` ${pushRate} pushRate: ${this.devicePushRate}`);
  }

  async getDeviceRetry(device: device & devicesConfig): Promise<void> {
    this.deviceMaxRetries = device.maxRetries ?? 5;
    const maxRetries = device.maxRetries ? 'Device' : 'Default';
    this.deviceDelayBetweenRetries = device.delayBetweenRetries ? (device.delayBetweenRetries * 1000) : 3000;
    const delayBetweenRetries = device.delayBetweenRetries ? 'Device' : 'Default';
    await this.debugLog(`Using ${maxRetries} Max Retries: ${this.deviceMaxRetries},`
      + ` ${delayBetweenRetries} Delay Between Retries: ${this.deviceDelayBetweenRetries}`);
  }

  async retryBLE({ max, fn }: { max: number; fn: { (): any; (): Promise<any> } }): Promise<null> {
    return fn().catch(async (e: any) => {
      if (max === 0) {
        throw e;
      }
      await this.warnLog(e);
      await this.infoLog('Retrying');
      await sleep(1000);
      return this.retryBLE({ max: max - 1, fn });
    });
  }

  async maxRetryBLE(): Promise<number> {
    return this.device.maxRetry ? this.device.maxRetry : 5;
  }

  async getDeviceScanDuration(accessory: PlatformAccessory, device: device & devicesConfig): Promise<void> {
    this.scanDuration = device.scanDuration ? (this.deviceUpdateRate > device.scanDuration) ? this.deviceUpdateRate : device.scanDuration
      ? (this.deviceUpdateRate > 1) ? this.deviceUpdateRate : 1 : this.deviceUpdateRate : 1;
    if (device.scanDuration) {
      if (this.deviceUpdateRate > device.scanDuration) {
        this.scanDuration = this.deviceUpdateRate;
        if (this.BLE) {
          this.warnLog('scanDuration is less than updateRate, overriding scanDuration with updateRate');
        }
      } else {
        this.scanDuration = accessory.context.scanDuration = device.scanDuration;
      }
      if (this.BLE) {
        this.debugLog(`Using Device Config scanDuration: ${this.scanDuration}`);
      }
    } else {
      if (this.deviceUpdateRate > 1) {
        this.scanDuration = this.deviceUpdateRate;
      } else {
        this.scanDuration = accessory.context.scanDuration = 1;
      }
      if (this.BLE) {
        this.debugLog(`Using Default scanDuration: ${this.scanDuration}`);
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
    if (device.mqttOptions) {
      deviceConfig['mqttOptions'] = device.mqttOptions;
    }
    if (device.mqttPubOptions) {
      deviceConfig['mqttPubOptions'] = device.mqttPubOptions;
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
      this.debugSuccessLog(`Config: ${JSON.stringify(config)}`);
    }
  }

  /**
   * Get the current ambient light level based on the light level, set_minLux, set_maxLux, and spaceBetweenLevels.
   * @param lightLevel: number
   * @param set_minLux: number
   * @param set_maxLux: number
   * @param spaceBetweenLevels: number
   * @returns CurrentAmbientLightLevel
   */
  async getLightLevel(lightLevel: number, set_minLux: number, set_maxLux: number, spaceBetweenLevels: number): Promise<number> {
    const numberOfLevels = spaceBetweenLevels + 1;
    this.debugLog(`LightLevel: ${lightLevel}, set_minLux: ${set_minLux}, set_maxLux: ${set_maxLux}, spaceBetweenLevels: ${spaceBetweenLevels},`
      + ` numberOfLevels: ${numberOfLevels}`);
    const CurrentAmbientLightLevel = lightLevel === 1 ? set_minLux : lightLevel = numberOfLevels
      ? set_maxLux : ((set_maxLux - set_minLux) / spaceBetweenLevels) * (Number(lightLevel) - 1);
    await this.debugLog(`CurrentAmbientLightLevel: ${CurrentAmbientLightLevel}, LightLevel: ${lightLevel}, set_minLux: ${set_minLux},`
      + ` set_maxLux: ${set_maxLux}`);
    return CurrentAmbientLightLevel;
  }

  /*
   * Publish MQTT message for topics of
   * 'homebridge-switchbot/${this.device.deviceType}/xx:xx:xx:xx:xx:xx'
   */
  async mqttPublish(message: string, topic?: string) {
    const mac = this.device.deviceId?.toLowerCase().match(/[\s\S]{1,2}/g)?.join(':');
    const options = this.deviceMqttPubOptions ?? {};
    const mqttTopic = topic ? `/${topic}` : '';
    const mqttMessageTopic = topic ? `${topic}/` : '';
    this.mqttClient?.publish(`homebridge-switchbot/${this.device.deviceType}/${mac}${mqttTopic}`, `${message}`, options);
    this.debugLog(`MQTT message: ${mqttMessageTopic}${message} options:${JSON.stringify(options)}`);
  }

  /*
   * MQTT Settings
   */
  async getMqttSettings(device: device & devicesConfig): Promise<void> {
    // mqttURL
    this.deviceMqttURL = device.mqttURL ?? this.config.options?.mqttURL ?? '';
    const mqttURL = device.mqttURL ? 'Device Config' : this.config.options?.mqttURL ? 'Platform Config' : 'Default';
    // mqttOptions
    this.deviceMqttOptions = device.mqttOptions ?? this.config.options?.mqttOptions ?? {};
    const mqttOptions = device.mqttOptions ? 'Device Config' : this.config.options?.mqttOptions ? 'Platform Config' : 'Default';
    // mqttPubOptions
    this.deviceMqttPubOptions = device.mqttPubOptions ?? this.config.options?.mqttPubOptions ?? {};
    const mqttPubOptions = device.mqttPubOptions ? 'Device Config' : this.config.options?.mqttPubOptions ? 'Platform Config' : 'Default';
    await this.debugLog(`Using ${mqttURL} MQTT URL: ${this.deviceMqttURL}, ${mqttOptions} mqttOptions: ${JSON.stringify(this.deviceMqttOptions)},`
      + ` ${mqttPubOptions} mqttPubOptions: ${JSON.stringify(this.deviceMqttPubOptions)}`);
  }

  /*
   * Setup EVE history graph feature if enabled.
   */
  async setupHistoryService(accessory: PlatformAccessory, device: device & devicesConfig): Promise<void> {
    const mac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(':')
      .toLowerCase();
    this.historyService = device.history
      ? new this.platform.fakegatoAPI('room', accessory, {
        log: this.platform.log,
        storage: 'fs',
        filename: `${hostname().split('.')[0]}_${mac}_persist.json`,
      })
      : null;
  }

  async switchbotBLE(): Promise<any> {
    const switchbot = await this.platform.connectBLE(this.accessory, this.device);
    // Convert to BLE Address
    await this.convertBLEAddress();
    await this.getCustomBLEAddress(switchbot);
    return switchbot;
  }

  async convertBLEAddress() {
    this.device.bleMac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(':')
      .toLowerCase();
    await this.debugLog(`BLE Address: ${this.device.bleMac}`);
  }

  async monitorAdvertisementPackets(switchbot: any) {
    await this.debugLog(`Scanning for ${this.device.bleModelName} devices...`);
    await switchbot.startScan({ model: this.device.bleModel, id: this.device.bleMac });
    // Set an event handler
    let serviceData = { model: this.device.bleModel, modelName: this.device.bleModelName } as ad['serviceData'];
    switchbot.onadvertisement = async (ad: ad) => {
      if (this.device.bleMac === ad.address && ad.serviceData.model === this.device.bleModel) {
        this.debugLog(`${JSON.stringify(ad, null, '  ')}`);
        this.debugLog(`address: ${ad.address}, model: ${ad.serviceData.model}`);
        this.debugLog(`serviceData: ${JSON.stringify(ad.serviceData)}`);
        serviceData = ad.serviceData;
      } else {
        serviceData = { model: '', modelName: '' } as ad['serviceData'];
        this.debugLog(`serviceData: ${JSON.stringify(ad.serviceData)}`);
      }
    };
    // Wait
    await switchbot.wait(this.scanDuration * 1000);
    // Stop to monitor
    await switchbot.stopScan();
    return serviceData;
  }

  async getCustomBLEAddress(switchbot: any): Promise<void> {
    if (this.device.customBLEaddress && this.deviceLogging.includes('debug')) {
      this.debugLog(`customBLEaddress: ${this.device.customBLEaddress}`);
      (async () => {
        // Start to monitor advertisement packets
        await switchbot.startScan({ model: this.device.bleModel });
        // Set an event handler
        switchbot.onadvertisement = async (ad: ad) => {
          this.warnLog(`ad: ${JSON.stringify(ad, null, '  ')}`);
        };
        await sleep(10000);
        // Stop to monitor
        switchbot.stopScan();
      })();
    }
  }

  async pushChangeRequest(bodyChange: string): Promise<{ body: any; statusCode: any; }> {
    return await request(`${Devices}/${this.device.deviceId}/commands`, {
      body: bodyChange,
      method: 'POST',
      headers: this.platform.generateHeaders(),
    });
  }

  async deviceRefreshStatus(): Promise<{ body: any; statusCode: any; }> {
    return await this.platform.retryRequest(this.deviceMaxRetries, this.deviceDelayBetweenRetries,
      `${Devices}/${this.device.deviceId}/status`, { headers: this.platform.generateHeaders() });
  }

  async successfulStatusCodes(statusCode: any, deviceStatus: any) {
    return (statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100);
  }

  /**
  * Update the characteristic value and log the change.
  *
  * @param Service: Service
  * @param Characteristic: Characteristic
  * @param CharacteristicValue: CharacteristicValue | undefined
  * @param CharacteristicName: string
  * @param history: object
  * @return: void
  *
  */
  async updateCharacteristic(Service: Service, Characteristic: any,
    CharacteristicValue: CharacteristicValue | undefined, CharacteristicName: string, history?: object): Promise<void> {
    if (CharacteristicValue === undefined) {
      this.debugLog(`${CharacteristicName}: ${CharacteristicValue}`);
    } else {
      await this.mqtt(CharacteristicName, CharacteristicValue);
      if (this.device.history) {
        this.historyService?.addEntry(history);
      }
      Service.updateCharacteristic(Characteristic, CharacteristicValue);
      this.debugLog(`updateCharacteristic ${CharacteristicName}: ${CharacteristicValue}`);
      this.debugWarnLog(`${CharacteristicName} context before: ${this.accessory.context[CharacteristicName]}`);
      this.accessory.context[CharacteristicName] = CharacteristicValue;
      this.debugWarnLog(`${CharacteristicName} context after: ${this.accessory.context[CharacteristicName]}`);
    }
  }

  async mqtt(CharacteristicName: string, CharacteristicValue: CharacteristicValue) {
    if (this.device.mqttURL) {
      this.mqttPublish(CharacteristicName, CharacteristicValue.toString());
    }
  }

  async getDeviceContext(accessory: PlatformAccessory, device: device & devicesConfig): Promise<void> {
    // Set the accessory context
    switch (device.deviceType) {
      case 'Humidifier':
        device.model = SwitchBotModel.Humidifier;
        device.bleModel = SwitchBotBLEModel.Humidifier;
        device.bleModelName = SwitchBotBLEModelName.Humidifier;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Humidifier;
        break;
      case 'Hub Mini':
        device.model = SwitchBotModel.HubMini;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Unknown;
        break;
      case 'Hub Plus':
        device.model = SwitchBotModel.HubPlus;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Unknown;
        break;
      case 'Hub 2':
        device.model = SwitchBotModel.Hub2;
        device.bleModel = SwitchBotBLEModel.Hub2;
        device.bleModelName = SwitchBotBLEModelName.Hub2;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Hub2;
        break;
      case 'Bot':
        device.model = SwitchBotModel.Bot;
        device.bleModel = SwitchBotBLEModel.Bot;
        device.bleModelName = SwitchBotBLEModelName.Bot;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Bot;
        break;
      case 'Meter':
        device.model = SwitchBotModel.Meter;
        device.bleModel = SwitchBotBLEModel.Meter;
        device.bleModelName = SwitchBotBLEModelName.Meter;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Meter;
        break;
      case 'MeterPlus':
        device.model = SwitchBotModel.MeterPlusUS;
        device.bleModel = SwitchBotBLEModel.MeterPlus;
        device.bleModelName = SwitchBotBLEModelName.MeterPlus;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.MeterPlus;
        break;
      case 'Meter Plus (JP)':
        device.model = SwitchBotModel.MeterPlusJP;
        device.bleModel = SwitchBotBLEModel.MeterPlus;
        device.bleModelName = SwitchBotBLEModelName.MeterPlus;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.MeterPlus;
        break;
      case 'WoIOSensor':
        device.model = SwitchBotModel.OutdoorMeter;
        device.bleModel = SwitchBotBLEModel.OutdoorMeter;
        device.bleModelName = SwitchBotBLEModelName.OutdoorMeter;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.OutdoorMeter;
        break;
      case 'Water Detector':
        device.model = SwitchBotModel.WaterDetector;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Unknown;
        break;
      case 'Motion Sensor':
        device.model = SwitchBotModel.MotionSensor;
        device.bleModel = SwitchBotBLEModel.MotionSensor;
        device.bleModelName = SwitchBotBLEModelName.MotionSensor;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.MotionSensor;
        break;
      case 'Contact Sensor':
        device.model = SwitchBotModel.ContactSensor;
        device.bleModel = SwitchBotBLEModel.ContactSensor;
        device.bleModelName = SwitchBotBLEModelName.ContactSensor;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.ContactSensor;
        break;
      case 'Curtain':
        device.model = SwitchBotModel.Curtain;
        device.bleModel = SwitchBotBLEModel.Curtain;
        device.bleModelName = SwitchBotBLEModelName.Curtain;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Curtain;
        break;
      case 'Curtain3':
        device.model = SwitchBotModel.Curtain3;
        device.bleModel = SwitchBotBLEModel.Curtain3;
        device.bleModelName = SwitchBotBLEModelName.Curtain3;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Curtain3;
        break;
      case 'Blind Tilt':
        device.model = SwitchBotModel.BlindTilt;
        device.bleModel = SwitchBotBLEModel.BlindTilt;
        device.bleModelName = SwitchBotBLEModelName.BlindTilt;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.BlindTilt;
        break;
      case 'Plug':
        device.model = SwitchBotModel.Plug;
        device.bleModel = SwitchBotBLEModel.PlugMiniUS;
        device.bleModelName = SwitchBotBLEModelName.PlugMini;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.PlugMini;
        break;
      case 'Plug Mini (US)':
        device.model = SwitchBotModel.PlugMiniUS;
        device.bleModel = SwitchBotBLEModel.PlugMiniUS;
        device.bleModelName = SwitchBotBLEModelName.PlugMini;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.PlugMini;
        break;
      case 'Plug Mini (JP)':
        device.model = SwitchBotModel.PlugMiniJP;
        device.bleModel = SwitchBotBLEModel.PlugMiniJP;
        device.bleModelName = SwitchBotBLEModelName.PlugMini;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.PlugMini;
        break;
      case 'Smart Lock':
        device.model = SwitchBotModel.Lock;
        device.bleModel = SwitchBotBLEModel.Lock;
        device.bleModelName = SwitchBotBLEModelName.Lock;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Lock;
        break;
      case 'Smart Lock Pro':
        device.model = SwitchBotModel.LockPro;
        device.bleModel = SwitchBotBLEModel.LockPro;
        device.bleModelName = SwitchBotBLEModelName.LockPro;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.LockPro;
        break;
      case 'Color Bulb':
        device.model = SwitchBotModel.ColorBulb;
        device.bleModel = SwitchBotBLEModel.ColorBulb;
        device.bleModelName = SwitchBotBLEModelName.ColorBulb;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.ColorBulb;
        break;
      case 'K10+':
        device.model = SwitchBotModel.K10;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Unknown;
        break;
      case 'WoSweeper':
        device.model = SwitchBotModel.WoSweeper;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Unknown;
        break;
      case 'WoSweeperMini':
        device.model = SwitchBotModel.WoSweeperMini;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Unknown;
        break;
      case 'Robot Vacuum Cleaner S1':
        device.model = SwitchBotModel.RobotVacuumCleanerS1;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Unknown;
        break;
      case 'Robot Vacuum Cleaner S1 Plus':
        device.model = SwitchBotModel.RobotVacuumCleanerS1Plus;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Unknown;
        break;
      case 'Robot Vacuum Cleaner S10':
        device.model = SwitchBotModel.RobotVacuumCleanerS10;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Unknown;
        break;
      case 'Ceiling Light':
        device.model = SwitchBotModel.CeilingLight;
        device.bleModel = SwitchBotBLEModel.CeilingLight;
        device.bleModelName = SwitchBotBLEModelName.CeilingLight;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.CeilingLight;
        break;
      case 'Ceiling Light Pro':
        device.model = SwitchBotModel.CeilingLightPro;
        device.bleModel = SwitchBotBLEModel.CeilingLightPro;
        device.bleModelName = SwitchBotBLEModelName.CeilingLightPro;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.CeilingLightPro;
        break;
      case 'Strip Light':
        device.model = SwitchBotModel.StripLight;
        device.bleModel = SwitchBotBLEModel.StripLight;
        device.bleModelName = SwitchBotBLEModelName.StripLight;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.StripLight;
        break;
      case 'Indoor Cam':
        device.model = SwitchBotModel.IndoorCam;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Unknown;
        break;
      case 'Remote':
        device.model = SwitchBotModel.Remote;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Unknown;
        break;
      case 'remote with screen+':
        device.model = SwitchBotModel.UniversalRemote;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Unknown;
        break;
      case 'Battery Circulator Fan':
        device.model = SwitchBotModel.BatteryCirculatorFan;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Unknown;
        break;
      default:
        device.model = SwitchBotModel.Unknown;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        device.bleModelFriednlyName = SwitchBotBLEModelFriendlyName.Unknown;
    }
    await this.debugLog(`Model: ${device.model}, BLE Model: ${device.bleModel}, BLE Model Name: ${device.bleModelName}, `
      + `BLE Model Friendly Name: ${device.bleModelFriednlyName}`);
    accessory.context.model = device.model;
    accessory.context.bleModel = device.bleModel;
    accessory.context.bleModelName = device.bleModelName;
    accessory.context.bleModelFriednlyName = device.bleModelFriednlyName;

    const deviceFirmwareVersion = device.firmware ?? device.version ?? accessory.context.version ?? this.platform.version ?? '0.0.0';
    const version = deviceFirmwareVersion.toString();
    this.debugLog(`Firmware Version: ${version.replace(/^V|-.*$/g, '')}`);
    let deviceVersion: string;
    if (version?.includes('.') === false) {
      const replace = version?.replace(/^V|-.*$/g, '');
      const match = replace?.match(/.{1,1}/g);
      const validVersion = match?.join('.');
      deviceVersion = validVersion ?? '0.0.0';
    } else {
      deviceVersion = version.replace(/^V|-.*$/g, '') ?? '0.0.0';
    }
    accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
      .setCharacteristic(this.hap.Characteristic.SoftwareRevision, deviceVersion)
      .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
      .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
      .updateValue(deviceVersion);
    accessory.context.version = deviceVersion;
    this.debugSuccessLog(`version: ${accessory.context.version}`);
  }

  async statusCode(statusCode: number): Promise<void> {
    if (statusCode === 171) {
      const previousStatusCode = statusCode;
      if (this.device.hubDeviceId === this.device.deviceId) {
        statusCode = 161;
      }
      if (this.device.hubDeviceId === '000000000000') {
        statusCode = 161;
      }
      this.debugErrorLog(`statusCode: ${previousStatusCode} is now statusCode: ${statusCode}, because the hubDeviceId: ${this.device.hubDeviceId}`
          + ` is set to the same as the deviceId: ${this.device.deviceId}, meaning the device is it's own hub.`);
    }
    switch (statusCode) {
      case 151:
        this.errorLog(`Command not supported by this deviceType, statusCode: ${statusCode}`);
        break;
      case 152:
        this.errorLog(`Device not found, statusCode: ${statusCode}`);
        break;
      case 160:
        this.errorLog(`Command is not supported, statusCode: ${statusCode}`);
        break;
      case 161:
        this.errorLog(`Device is offline, statusCode: ${statusCode}`);
        break;
      case 171:
        this.errorLog(`Hub Device is offline, statusCode: ${statusCode}. Hub: ${this.device.hubDeviceId}`);
        break;
      case 190:
        this.errorLog('Device internal error due to device states not synchronized with server, or command format is invalid,'
          + ` statusCode: ${statusCode}`);
        break;
      case 100:
        this.debugLog(`Command successfully sent, statusCode: ${statusCode}`);
        break;
      case 200:
        this.debugLog(`Request successful, statusCode: ${statusCode}`);
        break;
      case 400:
        this.errorLog(`Bad Request, an invalid payload request, statusCode: ${statusCode}`);
        break;
      case 401:
        this.errorLog(`Unauthorized, Authorization for the API is required, but the request has not been authenticated, statusCode: ${statusCode}`);
        break;
      case 403:
        this.errorLog('Forbidden,	The request has been authenticated but does not have appropriate permissions,'
          + ` or a requested resource is not found, statusCode: ${statusCode}`);
        break;
      case 404:
        this.errorLog(`Not Found,	Specifies the requested path does not exist, statusCode: ${statusCode}`);
        break;
      case 406:
        this.errorLog('Not Acceptable, a MIME type has been requested via the Accept header for a value not supported by the server,'
          + ` statusCode: ${statusCode}`);
        break;
      case 415:
        this.errorLog(`Unsupported Media Type, a contentType header has been defined that is not supported by the server, statusCode: ${statusCode}`);
        break;
      case 422:
        this.errorLog('Unprocessable Entity, a valid request has been made, but the server cannot process it. '
          + `This is often used for APIs for which certain limits have been exceeded, statusCode: ${statusCode}`);
        break;
      case 429:
        this.errorLog(`Too Many Requests,	exceeded the number of requests allowed for a given time window, statusCode: ${statusCode}`);
        break;
      case 500:
        this.errorLog(`Internal Server Error,	An unexpected error occurred. These errors should be rare, statusCode: ${statusCode}`);
        break;
      default:
        this.infoLog(`Unknown statusCode: ${statusCode}, Submit Bugs Here: https://tinyurl.com/SwitchBotBug`);
    }
  }

  /**
   * Logging for Device
   */
  async infoLog(...log: any[]): Promise<void> {
    if (await this.enablingDeviceLogging()) {
      this.log.info(`${this.device.deviceType}: ${this.accessory.displayName}`, String(...log));
    }
  }

  async successLog(...log: any[]): Promise<void> {
    if (await this.enablingDeviceLogging()) {
      this.log.success(`${this.device.deviceType}: ${this.accessory.displayName}`, String(...log));
    }
  }

  async debugSuccessLog(...log: any[]): Promise<void> {
    if (await this.enablingDeviceLogging()) {
      if (await this.loggingIsDebug()) {
        this.log.success(`[DEBUG] ${this.device.deviceType}: ${this.accessory.displayName}`, String(...log));
      }
    }
  }

  async warnLog(...log: any[]): Promise<void> {
    if (await this.enablingDeviceLogging()) {
      this.log.warn(`${this.device.deviceType}: ${this.accessory.displayName}`, String(...log));
    }
  }

  async debugWarnLog(...log: any[]): Promise<void> {
    if (await this.enablingDeviceLogging()) {
      if (await this.loggingIsDebug()) {
        this.log.warn(`[DEBUG] ${this.device.deviceType}: ${this.accessory.displayName}`, String(...log));
      }
    }
  }

  async errorLog(...log: any[]): Promise<void> {
    if (await this.enablingDeviceLogging()) {
      this.log.error(`${this.device.deviceType}: ${this.accessory.displayName}`, String(...log));
    }
  }

  async debugErrorLog(...log: any[]): Promise<void> {
    if (await this.enablingDeviceLogging()) {
      if (await this.loggingIsDebug()) {
        this.log.error(`[DEBUG] ${this.device.deviceType}: ${this.accessory.displayName}`, String(...log));
      }
    }
  }

  async debugLog(...log: any[]): Promise<void> {
    if (await this.enablingDeviceLogging()) {
      if (this.deviceLogging === 'debug') {
        this.log.info(`[DEBUG] ${this.device.deviceType}: ${this.accessory.displayName}`, String(...log));
      } else if (this.deviceLogging === 'debugMode') {
        this.log.debug(`${this.device.deviceType}: ${this.accessory.displayName}`, String(...log));
      }
    }
  }

  async loggingIsDebug(): Promise<boolean> {
    return this.deviceLogging === 'debugMode' || this.deviceLogging === 'debug';
  }

  async enablingDeviceLogging(): Promise<boolean> {
    return this.deviceLogging === 'debugMode' || this.deviceLogging === 'debug' || this.deviceLogging === 'standard';
  }
}
