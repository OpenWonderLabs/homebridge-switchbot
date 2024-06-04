/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * device.ts: @switchbot/homebridge-switchbot.
 */

import { hostname } from 'os';
import { request } from 'undici';
import asyncmqtt from 'async-mqtt';
import { Devices } from '../settings.js';
import { BlindTiltMappingMode, SwitchBotModel, SwitchBotBLEModel, SwitchBotBLEModelName, sleep } from '../utils.js';

import type { MqttClient } from 'mqtt';
import type { SwitchBotPlatform } from '../platform.js';
import type { API, CharacteristicValue, HAP, Logging, PlatformAccessory, Service } from 'homebridge';
import type { ad, device, serviceData, SwitchBotPlatformConfig, devicesConfig, deviceStatus } from '../settings.js';

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
    this.getDeviceRetry(accessory, device);
    this.getDeviceConfigSettings(accessory, device);
    this.getDeviceContext(accessory, device);
    this.setupMqtt(accessory, device);
    this.scan(accessory, device);

    // Set accessory information
    accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.hap.Characteristic.AppMatchingIdentifier, 'id1087374760')
      .setCharacteristic(this.hap.Characteristic.Name, device.deviceName ?? accessory.displayName)
      .setCharacteristic(this.hap.Characteristic.ConfiguredName, device.deviceName ?? accessory.displayName)
      .setCharacteristic(this.hap.Characteristic.Model, device.model ?? accessory.context.model)
      .setCharacteristic(this.hap.Characteristic.ProductData, device.deviceId ?? accessory.context.deviceId)
      .setCharacteristic(this.hap.Characteristic.SerialNumber, device.deviceId);
  }

  async getDeviceLogSettings(accessory: PlatformAccessory, device: device & devicesConfig): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = accessory.context.logging = 'debugMode';
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = accessory.context.logging = device.logging;
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.config.logging) {
      this.deviceLogging = accessory.context.logging = this.config.logging;
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = accessory.context.logging = 'standard';
      this.debugWarnLog(`${this.device.deviceType}: ${accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
    }
  }

  async getDeviceRateSettings(accessory: PlatformAccessory, device: device & devicesConfig): Promise<void> {
    // refreshRate
    if (device.refreshRate) {
      this.deviceRefreshRate = device.refreshRate;
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
    } else if (this.config.options?.refreshRate) {
      this.deviceRefreshRate = this.config.options.refreshRate;
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
    } else {
      this.deviceRefreshRate = 5;
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Using Default refreshRate: ${this.deviceRefreshRate}`);
    }
    accessory.context.deviceRefreshRate = this.deviceRefreshRate;
    // updateRate
    if (device.updateRate) {
      this.deviceUpdateRate = device.updateRate;
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Using Device Config updateRate: ${this.deviceUpdateRate}`);
    } else if (this.config.options?.updateRate) {
      this.deviceUpdateRate = this.config.options.updateRate;
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Using Platform Config updateRate: ${this.deviceUpdateRate}`);
    } else {
      this.deviceUpdateRate = 5;
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Using Default updateRate: ${this.deviceUpdateRate}`);
    }
    accessory.context.deviceUpdateRate = this.deviceUpdateRate;
    // pushRate
    if (device.pushRate) {
      this.devicePushRate = device.pushRate;
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Using Device Config pushRate: ${this.deviceUpdateRate}`);
    } else if (this.config.options?.pushRate) {
      this.devicePushRate = this.config.options.pushRate;
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Using Platform Config pushRate: ${this.deviceUpdateRate}`);
    } else {
      this.devicePushRate = 1;
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Using Default pushRate: ${this.deviceUpdateRate}`);
    }
    accessory.context.devicePushRate = this.devicePushRate;
  }

  async getDeviceRetry(accessory: PlatformAccessory, device: device & devicesConfig): Promise<void> {
    if (device.maxRetries) {
      this.deviceMaxRetries = device.maxRetries;
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Using Device Max Retries: ${this.deviceMaxRetries}`);
    } else {
      this.deviceMaxRetries = 5; // Maximum number of retries
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Max Retries Not Set, Using: ${this.deviceMaxRetries}`);
    }
    if (device.delayBetweenRetries) {
      this.deviceDelayBetweenRetries = device.delayBetweenRetries * 1000;
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Using Device Delay Between Retries: ${this.deviceDelayBetweenRetries}`);
    } else {
      this.deviceDelayBetweenRetries = 3000; // Delay between retries in milliseconds
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Delay Between Retries Not Set,`
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

  async scan(accessory: PlatformAccessory, device: device & devicesConfig): Promise<void> {
    if (device.scanDuration) {
      if (this.deviceUpdateRate > device.scanDuration) {
        this.scanDuration = this.deviceUpdateRate;
        if (this.BLE) {
          this.warnLog(
            `${this.device.deviceType}: `
            + `${accessory.displayName} scanDuration is less than updateRate, overriding scanDuration with updateRate`);
        }
      } else {
        this.scanDuration = accessory.context.scanDuration = device.scanDuration;
      }
      if (this.BLE) {
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Using Device Config scanDuration: ${this.scanDuration}`);
      }
    } else {
      if (this.deviceUpdateRate > 1) {
        this.scanDuration = this.deviceUpdateRate;
      } else {
        this.scanDuration = accessory.context.scanDuration = 1;
      }
      if (this.BLE) {
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Using Default scanDuration: ${this.scanDuration}`);
      }
    }
  }

  async getDeviceConfigSettings(accessory: PlatformAccessory, device: device & devicesConfig): Promise<void> {
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
      this.debugSuccessLog(`${this.device.deviceType}: ${accessory.displayName} Config: ${JSON.stringify(config)}`);
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
  async setupMqtt(accessory: PlatformAccessory, device: device & devicesConfig): Promise<void> {
    if (device.mqttURL) {
      try {
        const { connectAsync } = asyncmqtt;
        this.mqttClient = await connectAsync(device.mqttURL, device.mqttOptions || {});
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} MQTT connection has been established successfully.`);
        this.mqttClient.on('error', (e: Error) => {
          this.errorLog(`${this.device.deviceType}: ${accessory.displayName} Failed to publish MQTT messages. ${e}`);
        });
      } catch (e) {
        this.mqttClient = null;
        this.errorLog(`${this.device.deviceType}: ${accessory.displayName} Failed to establish MQTT connection. ${e}`);
      }
    }
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

  async switchbotBLE() {
    const switchbot = await this.platform.connectBLE();
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
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
  }

  async monitorAdvertisementPackets(switchbot: any) {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Scanning for ${this.device.bleModelName} devices...`);
    await switchbot.startScan({ model: this.device.bleModel, id: this.device.bleMac });
    // Set an event handler
    let serviceData: serviceData = { model: this.device.bleModel, modelName: this.device.bleModelName } as serviceData;
    switchbot.onadvertisement = async (ad: ad) => {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} ad: ${JSON.stringify(ad, null, '  ')}`);
      if (this.device.bleMac === ad.address && ad.serviceData.model === this.device.bleModel) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ${JSON.stringify(ad, null, '  ')}`);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} address: ${ad.address}, model: ${ad.serviceData.model}`);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        serviceData = ad.serviceData;
      } else {
        serviceData = { model: '', modelName: '' } as serviceData;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
      }
    };
    // Wait 10 seconds
    await switchbot.wait(this.scanDuration * 1000);
    // Stop to monitor
    await switchbot.stopScan();
    return serviceData;
  }

  async getCustomBLEAddress(switchbot: any): Promise<void> {
    if (this.device.customBLEaddress && this.deviceLogging.includes('debug')) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} customBLEaddress: ${this.device.customBLEaddress}`);
      (async () => {
        // Start to monitor advertisement packets
        await switchbot.startScan({ model: this.device.bleModel });
        // Set an event handler
        switchbot.onadvertisement = async (ad: ad) => {
          this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} ad: ${JSON.stringify(ad, null, '  ')}`);
        };
        await sleep(10000);
        // Stop to monitor
        switchbot.stopScan();
      })();
    }
  }

  async successfulPushChange_BLE(Characteristic: string, CharacteristicValue: CharacteristicValue, Connection: string) {
    this.successLog(`${this.device.deviceType}: ${this.accessory.displayName} ${Characteristic}: ${CharacteristicValue}`
      + ` sent over ${Connection}, sent successfully`);
  }

  async successfulPushChange(statusCode: any, deviceStatus: any, bodyChange: string) {
    this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode} & deviceStatus`
      + ` StatusCode: ${deviceStatus.statusCode}`);
    this.successLog(`${this.device.deviceType}: ${this.accessory.displayName} request to SwitchBot API,`
      + ` body: ${JSON.stringify(JSON.parse(bodyChange))} sent successfully`);
  }

  async failedBLEChanges(e: Error): Promise<void> {
    this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}`
      + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
  }

  async bodyChange(bodyChange: string, Connection: string) {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to ${Connection}, body: ${bodyChange},`);
  }

  async pushChangeDisabled() {
    this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:`
      + ` ${this.device.connectionType}, pushChanges will not happen.`);
  }

  async pushChangeRequest(bodyChange: string): Promise<{ body: any; statusCode: any; }> {
    return await request(`${Devices}/${this.device.deviceId}/commands`, {
      body: bodyChange,
      method: 'POST',
      headers: this.platform.generateHeaders(),
    });
  }

  async pushChange(pushChange: string) {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ${pushChange}`);
  }

  async pushChangeError(Change: string, e: Error) {
    this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed ${Change} with ${this.device.connectionType}`
      + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
  }

  async noChanges(Change: string, CharacteristicValue: CharacteristicValue, CharacteristicValueCached: CharacteristicValue) {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, ${Change}: ${CharacteristicValue}, `
      + `${Change}Cached: ${CharacteristicValueCached}`);
  }

  async successfulRefreshStatus(statusCode: any, deviceStatus: any) {
    this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} `
      + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
  }

  async openAPIRefreshError(e: Error) {
    this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIRefreshStatus with ${this.device.connectionType}`
      + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
  }

  async statusCodes(statusCode: any, deviceStatus: any) {
    this.statusCode(statusCode);
    this.statusCode(deviceStatus.statusCode);
  }

  async refreshStatusCodes(statusCode: number, deviceStatus: deviceStatus): Promise<void> {
    this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
    this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
    this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
  }

  async pushStatusCodes(statusCode: number, deviceStatus: any) {
    this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
    this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
    this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus body: ${JSON.stringify(deviceStatus.body)}`);
    this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
  }

  async deviceRefreshStatus(): Promise<{ body: any; statusCode: any; }> {
    return await this.platform.retryRequest(this.deviceMaxRetries, this.deviceDelayBetweenRetries,
      `${Devices}/${this.device.deviceId}/status`, { headers: this.platform.generateHeaders() });
  }

  /**
  * Update the characteristic value and log the change.
  * params: Service, Characteristic, CharacteristicValue, CharacteristicName, history
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
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ${CharacteristicName}: ${CharacteristicValue}`);
    } else {
      await this.mqtt(CharacteristicName, CharacteristicValue);
      if (this.device.history) {
        this.historyService?.addEntry(history);
      }
      Service.updateCharacteristic(Characteristic, CharacteristicValue);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` ${CharacteristicName}: ${CharacteristicValue}`);
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} context before: ${this.accessory.context[CharacteristicName]}`);
      this.accessory.context[CharacteristicName] = CharacteristicValue;
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} context after: ${this.accessory.context[CharacteristicName]}`);
    }
  }

  async mqtt(CharacteristicName: string, CharacteristicValue: CharacteristicValue) {
    if (this.device.mqttURL) {
      this.mqttPublish(CharacteristicName, CharacteristicValue.toString());
    }
  }

  async noChangeSet(value: CharacteristicValue, CharacteristicName: string) {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set ${CharacteristicName}: ${value}`);
  }

  async changeSet(value: CharacteristicValue, CharacteristicName: string) {
    this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set ${CharacteristicName}: ${value}`);
  }

  async getDeviceContext(accessory: PlatformAccessory, device: device & devicesConfig): Promise<void> {
    // Set the accessory context
    switch (device.deviceType) {
      case 'Humidifier':
        device.model = SwitchBotModel.Humidifier;
        device.bleModel = SwitchBotBLEModel.Humidifier;
        device.bleModelName = SwitchBotBLEModelName.Humidifier;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Hub Mini':
        device.model = SwitchBotModel.HubMini;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Hub Plus':
        device.model = SwitchBotModel.HubPlus;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Hub 2':
        device.model = SwitchBotModel.Hub2;
        device.bleModel = SwitchBotBLEModel.Hub2;
        device.bleModelName = SwitchBotBLEModelName.Hub2;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Bot':
        device.model = SwitchBotModel.Bot;
        device.bleModel = SwitchBotBLEModel.Bot;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Meter':
        device.model = SwitchBotModel.Meter;
        device.bleModel = SwitchBotBLEModel.Meter;
        device.bleModelName = SwitchBotBLEModelName.Meter;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'MeterPlus':
        device.model = SwitchBotModel.MeterPlusUS;
        device.bleModel = SwitchBotBLEModel.MeterPlus;
        device.bleModelName = SwitchBotBLEModelName.MeterPlus;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Meter Plus (JP)':
        device.model = SwitchBotModel.MeterPlusJP;
        device.bleModel = SwitchBotBLEModel.MeterPlus;
        device.bleModelName = SwitchBotBLEModelName.MeterPlus;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'WoIOSensor':
        device.model = SwitchBotModel.OutdoorMeter;
        device.bleModel = SwitchBotBLEModel.OutdoorMeter;
        device.bleModelName = SwitchBotBLEModelName.OutdoorMeter;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Water Detector':
        device.model = SwitchBotModel.WaterDetector;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Motion Sensor':
        device.model = SwitchBotModel.MotionSensor;
        device.bleModel = SwitchBotBLEModel.MotionSensor;
        device.bleModelName = SwitchBotBLEModelName.MotionSensor;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Contact Sensor':
        device.model = SwitchBotModel.ContactSensor;
        device.bleModel = SwitchBotBLEModel.ContactSensor;
        device.bleModelName = SwitchBotBLEModelName.ContactSensor;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Curtain':
        device.model = SwitchBotModel.Curtain;
        device.bleModel = SwitchBotBLEModel.Curtain;
        device.bleModelName = SwitchBotBLEModelName.Curtain;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Curtain3':
        device.model = SwitchBotModel.Curtain3;
        device.bleModel = SwitchBotBLEModel.Curtain3;
        device.bleModelName = SwitchBotBLEModelName.Curtain3;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Blind Tilt':
        device.model = SwitchBotModel.BlindTilt;
        device.bleModel = SwitchBotBLEModel.BlindTilt;
        device.bleModelName = SwitchBotBLEModelName.BlindTilt;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Plug':
        device.model = SwitchBotModel.Plug;
        device.bleModel = SwitchBotBLEModel.PlugMiniUS;
        device.bleModelName = SwitchBotBLEModelName.PlugMini;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Plug Mini (US)':
        device.model = SwitchBotModel.PlugMiniUS;
        device.bleModel = SwitchBotBLEModel.PlugMiniUS;
        device.bleModelName = SwitchBotBLEModelName.PlugMini;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Plug Mini (JP)':
        device.model = SwitchBotModel.PlugMiniJP;
        device.bleModel = SwitchBotBLEModel.PlugMiniJP;
        device.bleModelName = SwitchBotBLEModelName.PlugMini;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Smart Lock':
        device.model = SwitchBotModel.Lock;
        device.bleModel = SwitchBotBLEModel.Lock;
        device.bleModelName = SwitchBotBLEModelName.Lock;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Smart Lock Pro':
        device.model = SwitchBotModel.LockPro;
        device.bleModel = SwitchBotBLEModel.Lock;
        device.bleModelName = SwitchBotBLEModelName.Lock;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Color Bulb':
        device.model = SwitchBotModel.ColorBulb;
        device.bleModel = SwitchBotBLEModel.ColorBulb;
        device.bleModelName = SwitchBotBLEModelName.ColorBulb;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'K10+':
        device.model = SwitchBotModel.K10;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'WoSweeper':
        device.model = SwitchBotModel.WoSweeper;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'WoSweeperMini':
        device.model = SwitchBotModel.WoSweeperMini;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Robot Vacuum Cleaner S1':
        device.model = SwitchBotModel.RobotVacuumCleanerS1;
        device.bleModel = SwitchBotBLEModel.Unknown;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Robot Vacuum Cleaner S1 Plus':
        device.model = SwitchBotModel.RobotVacuumCleanerS1Plus;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Robot Vacuum Cleaner S10':
        device.model = SwitchBotModel.RobotVacuumCleanerS10;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Ceiling Light':
        device.model = SwitchBotModel.CeilingLight;
        device.bleModel = SwitchBotBLEModel.CeilingLight;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Ceiling Light Pro':
        device.model = SwitchBotModel.CeilingLightPro;
        device.bleModel = SwitchBotBLEModel.CeilingLightPro;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Strip Light':
        device.model = SwitchBotModel.StripLight;
        device.bleModel = SwitchBotBLEModel.StripLight;
        device.bleModelName = SwitchBotBLEModelName.StripLight;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Indoor Cam':
        device.model = SwitchBotModel.IndoorCam;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Remote':
        device.model = SwitchBotModel.Remote;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'remote with screen+':
        device.model = SwitchBotModel.UniversalRemote;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      case 'Battery Circulator Fan':
        device.model = SwitchBotModel.BatteryCirculatorFan;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
        break;
      default:
        device.model = SwitchBotModel.Unknown;
        device.bleModel = SwitchBotBLEModel.Unknown;
        device.bleModelName = SwitchBotBLEModelName.Unknown;
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Model: ${device.model}, BLE Model: ${device.bleModel}`);
    }
    accessory.context.model = device.model;

    // Firmware Version
    let deviceFirmwareVersion: string;
    if (device.firmware) {
      deviceFirmwareVersion = device.firmware;
      this.debugSuccessLog(`${device.deviceType}: ${accessory.displayName} 1 FirmwareRevision: ${device.firmware}`);
    } else if (device.version) {
      deviceFirmwareVersion = device.version;
      this.debugSuccessLog(`${device.deviceType}: ${accessory.displayName} 2 FirmwareRevision: ${device.version}`);
    } else if (accessory.context.deviceVersion) {
      deviceFirmwareVersion = accessory.context.deviceVersion;
      this.debugSuccessLog(`${device.deviceType}: ${accessory.displayName} 3 FirmwareRevision: ${accessory.context.deviceVersion}`);
    } else {
      deviceFirmwareVersion = this.platform.version ?? '0.0.0';
      if (this.platform.version) {
        this.debugSuccessLog(`${device.deviceType}: ${accessory.displayName} 4 FirmwareRevision: ${this.platform.version}`);
      } else {
        this.debugSuccessLog(`${device.deviceType}: ${accessory.displayName} 5 FirmwareRevision: ${deviceFirmwareVersion}`);
      }
    }
    const version = deviceFirmwareVersion.toString();
    this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Firmware Version: ${version?.replace(/^V|-.*$/g, '')}`);
    let deviceVersion: string;
    if (version?.includes('.') === false) {
      const replace = version?.replace(/^V|-.*$/g, '');
      const match = replace?.match(/.{1,1}/g);
      const validVersion = match?.join('.');
      deviceVersion = validVersion ?? '0.0.0';
    } else {
      deviceVersion = version?.replace(/^V|-.*$/g, '') ?? '0.0.0';
    }
    accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
      .setCharacteristic(this.hap.Characteristic.SoftwareRevision, deviceVersion)
      .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
      .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
      .updateValue(deviceVersion);
    accessory.context.deviceVersion = deviceVersion;
    this.debugSuccessLog(`${device.deviceType}: ${accessory.displayName} deviceVersion: ${accessory.context.deviceVersion}`);
  }

  async statusCode(statusCode: number): Promise<void> {
    if (statusCode === 171) {
      const previousStatusCode = statusCode;
      if (this.device.hubDeviceId === this.device.deviceId) {
        statusCode = 161;
        this.debugErrorLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${previousStatusCode} is now statusCode: `
          + `${statusCode}, because the hubDeviceId: ${this.device.hubDeviceId} is set to the same as the deviceId: `
          + `${this.device.deviceId}, meaning the device is it's own hub.`);
      }
      if (this.device.hubDeviceId === '000000000000') {
        statusCode = 161;
        this.debugErrorLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${previousStatusCode} is now statusCode: `
          + `${statusCode}, because the hubDeviceId: ${this.device.hubDeviceId} is set to the same as the deviceId: `
          + `${this.device.deviceId}, meaning the device is it's own hub.`);
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
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Hub Device is offline, statusCode: ${statusCode}. `
          + `Hub: ${this.device.hubDeviceId}`);
        break;
      case 190:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Device internal error due to device states not synchronized with`
          + ` server, Or command format is invalid, statusCode: ${statusCode}`);
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
          + `${statusCode}, Submit Bugs Here: https://tinyurl.com/SwitchBotBug`);
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