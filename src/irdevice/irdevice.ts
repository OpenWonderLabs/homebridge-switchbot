/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * device.ts: @switchbot/homebridge-switchbot.
 */
import type { SwitchBotPlatform } from '../platform.js';
import type { API, HAP, Logging, PlatformAccessory } from 'homebridge';
import type { SwitchBotPlatformConfig, irDevicesConfig, irdevice } from '../settings.js';

export abstract class irdeviceBase {
  public readonly api: API;
  public readonly log: Logging;
  public readonly config!: SwitchBotPlatformConfig;
  protected readonly hap: HAP;

  // Config
  protected deviceLogging!: string;
  protected disablePushOn!: boolean;
  protected disablePushOff!: boolean;
  protected disablePushDetail?: boolean;

  constructor(
    protected readonly platform: SwitchBotPlatform,
    protected accessory: PlatformAccessory,
    protected device: irdevice & irDevicesConfig,
  ) {
    this.api = this.platform.api;
    this.log = this.platform.log;
    this.config = this.platform.config;
    this.hap = this.api.hap;

    this.getDeviceLogSettings(device);
    this.getDeviceConfigSettings(device);
    this.getDeviceContext(accessory, device);
    this.disablePushOnChanges(device);
    this.disablePushOffChanges(device);

    // Set accessory information
    accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.hap.Characteristic.AppMatchingIdentifier, 'id1087374760')
      .setCharacteristic(this.hap.Characteristic.Name, accessory.context.name ?? accessory.displayName)
      .setCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.context.name ?? accessory.displayName)
      .setCharacteristic(this.hap.Characteristic.Model, accessory.context.model ?? 'Unknown')
      .setCharacteristic(this.hap.Characteristic.ProductData, accessory.context.deviceId)
      .setCharacteristic(this.hap.Characteristic.SerialNumber, accessory.context.deviceId);
  }

  async getDeviceLogSettings(device: irdevice & irDevicesConfig): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.config.logging) {
      this.deviceLogging = this.accessory.context.logging = this.config.logging;
      this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
    }
  }

  async getDeviceConfigSettings(device: irdevice & irDevicesConfig): Promise<void> {
    const deviceConfig = {};
    if (device.logging !== 'standard') {
      deviceConfig['logging'] = device.logging;
    }
    if (device.connectionType !== '') {
      deviceConfig['connectionType'] = device.connectionType;
    }
    if (device.external === true) {
      deviceConfig['external'] = device.external;
    }
    if (device.customize === true) {
      deviceConfig['customize'] = device.customize;
    }
    if (device.commandType !== '') {
      deviceConfig['commandType'] = device.commandType;
    }
    if (device.customOn !== '') {
      deviceConfig['customOn'] = device.customOn;
    }
    if (device.customOff !== '') {
      deviceConfig['customOff'] = device.customOff;
    }
    if (device.disablePushOn === true) {
      deviceConfig['disablePushOn'] = device.disablePushOn;
    }
    if (device.disablePushOff === true) {
      deviceConfig['disablePushOff'] = device.disablePushOff;
    }
    if (device.disablePushDetail === true) {
      deviceConfig['disablePushDetail'] = device.disablePushDetail;
    }
    let irairConfig = {};
    if (device.irair) {
      irairConfig = device.irair;
    }
    let irpurConfig = {};
    if (device.irpur) {
      irpurConfig = device.irpur;
    }
    let ircamConfig = {};
    if (device.ircam) {
      ircamConfig = device.ircam;
    }
    let irfanConfig = {};
    if (device.irfan) {
      irfanConfig = device.irfan;
    }
    let irlightConfig = {};
    if (device.irlight) {
      irlightConfig = device.irlight;
    }
    let otherConfig = {};
    if (device.other) {
      otherConfig = device.other;
    }
    let irtvConfig = {};
    if (device.irtv) {
      irtvConfig = device.irtv;
    }
    let irvcConfig = {};
    if (device.irvc) {
      irvcConfig = device.irvc;
    }
    let irwhConfig = {};
    if (device.irwh) {
      irwhConfig = device.irwh;
    }
    const config = Object.assign({}, deviceConfig, irairConfig, irpurConfig, ircamConfig, irfanConfig, irlightConfig, otherConfig,
      irtvConfig, irvcConfig, irwhConfig);
    if (Object.entries(config).length !== 0) {
      this.debugSuccessLog(`${this.device.remoteType}: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  async getDeviceContext(accessory: PlatformAccessory, device: irdevice & irDevicesConfig): Promise<void> {
    accessory.context.name = device.deviceName;
    accessory.context.model = device.remoteType;
    accessory.context.deviceId = device.deviceId;
    accessory.context.remoteType = device.remoteType;
    if (device.firmware) {
      accessory.context.firmware = device.firmware;
    } else if (device.firmware === undefined || accessory.context.firmware === undefined) {
      device.firmware = this.platform.version;
      accessory.context.firmware = device.firmware;
    } else {
      accessory.context.firmware = 'Unknown';
    }

    // Firmware Version
    let deviceFirmwareVersion: string;
    if (device.firmware) {
      deviceFirmwareVersion = device.firmware;
      this.debugSuccessLog(`${device.remoteType}: ${accessory.displayName} 1 FirmwareRevision: ${device.firmware}`);
    } else if (accessory.context.deviceVersion) {
      deviceFirmwareVersion = accessory.context.deviceVersion;
      this.debugSuccessLog(`${device.remoteType}: ${accessory.displayName} 2 FirmwareRevision: ${accessory.context.deviceVersion}`);
    } else {
      deviceFirmwareVersion = this.platform.version ?? '0.0.0';
      if (this.platform.version) {
        this.debugSuccessLog(`${device.remoteType}: ${accessory.displayName} 3 FirmwareRevision: ${this.platform.version}`);
      } else {
        this.debugSuccessLog(`${device.remoteType}: ${accessory.displayName} 4 FirmwareRevision: ${deviceFirmwareVersion}`);
      }
    }
    const version = deviceFirmwareVersion.toString();
    this.debugLog(`${this.device.remoteType}: ${accessory.displayName} Firmware Version: ${version?.replace(/^V|-.*$/g, '')}`);
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
    this.debugSuccessLog(`${device.remoteType}: ${accessory.displayName} deviceVersion: ${accessory.context.deviceVersion}`);
  }

  async disablePushOnChanges(device: irdevice & irDevicesConfig): Promise<void> {
    if (device.disablePushOn === undefined) {
      this.disablePushOn = false;
    } else {
      this.disablePushOn = device.disablePushOn;
    }
  }

  async disablePushOffChanges(device: irdevice & irDevicesConfig): Promise<void> {
    if (device.disablePushOff === undefined) {
      this.disablePushOff = false;
    } else {
      this.disablePushOff = device.disablePushOff;
    }
  }

  async disablePushDetailChanges(device: irdevice & irDevicesConfig): Promise<void> {
    if (device.disablePushDetail === undefined) {
      this.disablePushDetail = false;
    } else {
      this.disablePushDetail = device.disablePushDetail;
    }
  }

  async commandType(): Promise<string> {
    let commandType: string;
    if (this.device.commandType && this.device.customize) {
      commandType = this.device.commandType;
    } else if (this.device.customize) {
      commandType = 'customize';
    } else {
      commandType = 'command';
    }
    return commandType;
  }

  async commandOn(): Promise<string> {
    let command: string;
    if (this.device.customize && this.device.customOn) {
      command = this.device.customOn;
    } else {
      command = 'turnOn';
    }
    return command;
  }

  async commandOff(): Promise<string> {
    let command: string;
    if (this.device.customize && this.device.customOff) {
      command = this.device.customOff;
    } else {
      command = 'turnOff';
    }
    return command;
  }

  async statusCode(statusCode: number): Promise<void> {
    switch (statusCode) {
      case 151:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Command not supported by this deviceType, statusCode: ${statusCode}`);
        break;
      case 152:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Device not found, statusCode: ${statusCode}`);
        break;
      case 160:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Command is not supported, statusCode: ${statusCode}`);
        break;
      case 161:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Device is offline, statusCode: ${statusCode}`);
        break;
      case 171:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Hub Device is offline, statusCode: ${statusCode}. `
          + `Hub: ${this.device.hubDeviceId}`);
        break;
      case 190:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Device internal error due to device states not synchronized with`
          + ` server, Or command format is invalid, statusCode: ${statusCode}`);
        break;
      case 100:
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Command successfully sent, statusCode: ${statusCode}`);
        break;
      case 200:
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Request successful, statusCode: ${statusCode}`);
        break;
      case 400:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Bad Request, The client has issued an invalid request. `
          + `This is commonly used to specify validation errors in a request payload, statusCode: ${statusCode}`);
        break;
      case 401:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Unauthorized,	Authorization for the API is required, `
          + `but the request has not been authenticated, statusCode: ${statusCode}`);
        break;
      case 403:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Forbidden,	The request has been authenticated but does not `
          + `have appropriate permissions, or a requested resource is not found, statusCode: ${statusCode}`);
        break;
      case 404:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Not Found,	Specifies the requested path does not exist, `
          + `statusCode: ${statusCode}`);
        break;
      case 406:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Not Acceptable,	The client has requested a MIME type via `
          + `the Accept header for a value not supported by the server, statusCode: ${statusCode}`);
        break;
      case 415:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Unsupported Media Type,	The client has defined a contentType `
          + `header that is not supported by the server, statusCode: ${statusCode}`);
        break;
      case 422:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Unprocessable Entity,	The client has made a valid request, `
          + `but the server cannot process it. This is often used for APIs for which certain limits have been exceeded, statusCode: ${statusCode}`);
        break;
      case 429:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Too Many Requests,	The client has exceeded the number of `
          + `requests allowed for a given time window, statusCode: ${statusCode}`);
        break;
      case 500:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Internal Server Error,	An unexpected error on the SmartThings `
          + `servers has occurred. These errors should be rare, statusCode: ${statusCode}`);
        break;
      default:
        this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Unknown statusCode: `
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
      this.platform.log.success(String(...log));
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