import { CharacteristicValue, PlatformAccessory, Service, API, Logging, HAP } from 'homebridge';
import { request } from 'undici';
import { SwitchBotPlatform } from '../platform.js';
import { Devices, irDevicesConfig, irdevice, SwitchBotPlatformConfig } from '../settings.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Camera {
  public readonly api: API;
  public readonly log: Logging;
  public readonly config!: SwitchBotPlatformConfig;
  protected readonly hap: HAP;
  // Services
  switchService!: Service;

  // Characteristic Values
  On!: CharacteristicValue;
  FirmwareRevision!: CharacteristicValue;

  // Config
  deviceLogging!: string;
  disablePushOn?: boolean;
  disablePushOff?: boolean;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: irdevice & irDevicesConfig,
  ) {
    this.api = this.platform.api;
    this.log = this.platform.log;
    this.config = this.platform.config;
    this.hap = this.api.hap;
    // default placeholders
    this.deviceLogs(device);
    this.deviceContext();
    this.disablePushOnChanges(device);
    this.disablePushOffChanges(device);
    this.deviceConfig(device);

    // set accessory information
    accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.hap.Characteristic.Model, device.remoteType)
      .setCharacteristic(this.hap.Characteristic.SerialNumber, device.deviceId)
      .setCharacteristic(this.hap.Characteristic.FirmwareRevision, accessory.context.FirmwareRevision);

    // get the Television service if it exists, otherwise create a new Television service
    // you can create multiple services for each accessory
    const switchService = `${accessory.displayName} Camera`;
    (this.switchService = accessory.getService(this.hap.Service.Switch)
      || accessory.addService(this.hap.Service.Switch)), switchService;

    this.switchService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
    if (!this.switchService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
      this.switchService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
    }

    // handle on / off events using the On characteristic
    this.switchService.getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this));
  }

  async OnSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${value}`);

    this.On = value;
    if (this.On) {
      this.pushOnChanges();
    } else {
      this.pushOffChanges();
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	commandType     Command	          command parameter	         Description
   * Camera -        "command"       "turnOff"         "default"	        =        set to OFF state
   * Camera -        "command"       "turnOn"          "default"	        =        set to ON state
   * Camera -        "command"       "volumeAdd"       "default"	        =        volume up
   * Camera -        "command"       "volumeSub"       "default"	        =        volume down
   * Camera -        "command"       "channelAdd"      "default"	        =        next channel
   * Camera -        "command"       "channelSub"      "default"	        =        previous channel
   */
  async pushOnChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushOnChanges On: ${this.On},` + ` disablePushOn: ${this.disablePushOn}`);
    if (this.On && !this.disablePushOn) {
      const commandType: string = await this.commandType();
      const command: string = await this.commandOn();
      const bodyChange = JSON.stringify({
        command: command,
        parameter: 'default',
        commandType: commandType,
      });
      await this.pushChanges(bodyChange);
    }
  }

  async pushOffChanges(): Promise<void> {
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} pushOffChanges On: ${this.On},` + ` disablePushOff: ${this.disablePushOff}`,
    );
    if (!this.On && !this.disablePushOff) {
      const commandType: string = await this.commandType();
      const command: string = await this.commandOff();
      const bodyChange = JSON.stringify({
        command: command,
        parameter: 'default',
        commandType: commandType,
      });
      await this.pushChanges(bodyChange);
    }
  }

  async pushChanges(bodyChange: any): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushChanges`);
    if (this.device.connectionType === 'OpenAPI') {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
        const deviceStatus: any = await body.json();
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          this.debugErrorLog(`${this.device.remoteType}: ${this.accessory.displayName} `
            + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
          this.updateHomeKitCharacteristics();
        } else {
          this.statusCode(statusCode);
          this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(
          `${this.device.remoteType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType}` +
          ` Connection, Error Message: ${JSON.stringify(e.message)}`,
        );
      }
    } else {
      this.warnLog(
        `${this.device.remoteType}: ${this.accessory.displayName}` +
        ` Connection Type: ${this.device.connectionType}, commands will not be sent to OpenAPI`,
      );
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    // On
    if (this.On === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.On}`);
    } else {
      this.accessory.context.On = this.On;
      this.switchService?.updateCharacteristic(this.hap.Characteristic.On, this.On);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
    }
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

  async commandType(): Promise<string> {
    let commandType: string;
    if (this.device.customize) {
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
        this.errorLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Hub Device is offline, statusCode: ${statusCode}. ` +
          `Hub: ${this.device.hubDeviceId}`,
        );
        break;
      case 190:
        this.errorLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
          ` Or command format is invalid, statusCode: ${statusCode}`,
        );
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
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Unprocessable Entity,	The client has made a valid request, but `
              + `the server cannot process it. This is often used for APIs for which certain limits have been exceeded, statusCode: ${statusCode}`);
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
        this.infoLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Unknown statusCode: ` +
          `${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`,
        );
    }
  }

  async apiError(e: any): Promise<void> {
    this.switchService.updateCharacteristic(this.hap.Characteristic.On, e);
  }

  async deviceContext() {
    if (this.On === undefined) {
      this.On = false;
    } else {
      this.On = this.accessory.context.On;
    }
    if (this.FirmwareRevision === undefined) {
      this.FirmwareRevision = this.platform.version;
      this.accessory.context.FirmwareRevision = this.FirmwareRevision;
    }
  }

  async deviceConfig(device: irdevice & irDevicesConfig): Promise<void> {
    let config = {};
    if (device.ircam) {
      config = device.ircam;
    }
    if (device.logging !== undefined) {
      config['logging'] = device.logging;
    }
    if (device.connectionType !== undefined) {
      config['connectionType'] = device.connectionType;
    }
    if (device.external !== undefined) {
      config['external'] = device.external;
    }
    if (device.customOn !== undefined) {
      config['customOn'] = device.customOn;
    }
    if (device.customOff !== undefined) {
      config['customOff'] = device.customOff;
    }
    if (device.customize !== undefined) {
      config['customize'] = device.customize;
    }
    if (device.disablePushOn !== undefined) {
      config['disablePushOn'] = device.disablePushOn;
    }
    if (device.disablePushOff !== undefined) {
      config['disablePushOff'] = device.disablePushOff;
    }
    if (Object.entries(config).length !== 0) {
      this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  async deviceLogs(device: irdevice & irDevicesConfig): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
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

  debugWarnLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging?.includes('debug')) {
        this.platform.log.warn('[DEBUG]', String(...log));
      }
    }
  }

  errorLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.error(String(...log));
    }
  }

  debugErrorLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging?.includes('debug')) {
        this.platform.log.error('[DEBUG]', String(...log));
      }
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
