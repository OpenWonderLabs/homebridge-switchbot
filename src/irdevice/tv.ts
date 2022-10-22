import https from 'https';
import crypto from 'crypto';
import { IncomingMessage } from 'http';
import superStringify from 'super-stringify';
import { SwitchBotPlatform } from '../platform';
import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { irdevice, irDevicesConfig, HostDomain, DevicePath, body } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class TV {
  // Services
  tvService!: Service;
  speakerService: Service;

  // Characteristic Values
  Active!: CharacteristicValue;
  ActiveIdentifier!: CharacteristicValue;

  // Others
  deviceStatus!: any;

  // Config
  disablePushOn?: boolean;
  disablePushOff?: boolean;
  deviceLogging!: string;

  constructor(private readonly platform: SwitchBotPlatform, private accessory: PlatformAccessory, public device: irdevice & irDevicesConfig) {
    // default placeholders
    this.logs(device);
    this.config(device);
    this.context();
    this.disablePushOnChanges({ device });
    this.disablePushOffChanges({ device });

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Name, `${device.deviceName} ${device.remoteType}`)
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, device.remoteType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision(accessory, device))
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
      .updateValue(this.FirmwareRevision(accessory, device));

    // set the accessory category
    switch (device.remoteType) {
      case 'Speaker':
      case 'DIY Speaker':
        accessory.category = this.platform.api.hap.Categories.SPEAKER;
        (this.tvService = accessory.getService(this.platform.Service.Television) || accessory.addService(this.platform.Service.Television)),
        `${accessory.displayName} ${device.remoteType}`;
        break;
      case 'IPTV':
      case 'DIY IPTV':
        accessory.category = this.platform.api.hap.Categories.TV_STREAMING_STICK;
        (this.tvService = accessory.getService(this.platform.Service.Television) || accessory.addService(this.platform.Service.Television)),
        `${accessory.displayName} ${device.remoteType}`;
        break;
      case 'DVD':
      case 'DIY DVD':
      case 'Set Top Box':
      case 'DIY Set Top Box':
        accessory.category = this.platform.api.hap.Categories.TV_SET_TOP_BOX;
        (this.tvService = accessory.getService(this.platform.Service.Television) || accessory.addService(this.platform.Service.Television)),
        `${accessory.displayName} ${device.remoteType}`;
        break;
      default:
        accessory.category = this.platform.api.hap.Categories.TELEVISION;

        // get the Television service if it exists, otherwise create a new Television service
        // you can create multiple services for each accessory
        (this.tvService = accessory.getService(this.platform.Service.Television) || accessory.addService(this.platform.Service.Television)),
        `${accessory.displayName} ${device.remoteType}`;
    }

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Outlet, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.tvService.getCharacteristic(this.platform.Characteristic.ConfiguredName);

    // set sleep discovery characteristic
    this.tvService.setCharacteristic(
      this.platform.Characteristic.SleepDiscoveryMode,
      this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE,
    );

    // handle on / off events using the Active characteristic
    this.tvService.getCharacteristic(this.platform.Characteristic.Active).onSet(this.ActiveSet.bind(this));

    this.tvService.setCharacteristic(this.platform.Characteristic.ActiveIdentifier, 1);

    // handle input source changes
    this.tvService.getCharacteristic(this.platform.Characteristic.ActiveIdentifier).onSet(this.ActiveIdentifierSet.bind(this));

    // handle remote control input
    this.tvService.getCharacteristic(this.platform.Characteristic.RemoteKey).onSet(this.RemoteKeySet.bind(this));

    /**
     * Create a speaker service to allow volume control
     */
    // create a new Television Speaker service
    (this.speakerService =
      accessory.getService(this.platform.Service.TelevisionSpeaker) || accessory.addService(this.platform.Service.TelevisionSpeaker)),
    `${accessory.displayName} Speaker`;

    this.speakerService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Speaker`);

    this.speakerService
      .setCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE)
      .setCharacteristic(this.platform.Characteristic.VolumeControlType, this.platform.Characteristic.VolumeControlType.ABSOLUTE);

    // handle volume control
    this.speakerService.getCharacteristic(this.platform.Characteristic.VolumeSelector).onSet(this.VolumeSelectorSet.bind(this));
  }

  async VolumeSelectorSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} VolumeSelector: ${value}`);
    if (value === this.platform.Characteristic.VolumeSelector.INCREMENT) {
      this.pushVolumeUpChanges();
    } else {
      this.pushVolumeDownChanges();
    }
  }

  async RemoteKeySet(value: CharacteristicValue): Promise<void> {
    switch (value) {
      case this.platform.Characteristic.RemoteKey.REWIND: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: REWIND`);
        break;
      }
      case this.platform.Characteristic.RemoteKey.FAST_FORWARD: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: FAST_FORWARD`);
        break;
      }
      case this.platform.Characteristic.RemoteKey.NEXT_TRACK: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: NEXT_TRACK`);
        break;
      }
      case this.platform.Characteristic.RemoteKey.PREVIOUS_TRACK: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: PREVIOUS_TRACK`);
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_UP: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: ARROW_UP`);
        //this.pushUpChanges();
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_DOWN: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: ARROW_DOWN`);
        //this.pushDownChanges();
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_LEFT: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: ARROW_LEFT`);
        //this.pushLeftChanges();
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_RIGHT: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: ARROW_RIGHT`);
        //this.pushRightChanges();
        break;
      }
      case this.platform.Characteristic.RemoteKey.SELECT: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: SELECT`);
        //this.pushOkChanges();
        break;
      }
      case this.platform.Characteristic.RemoteKey.BACK: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: BACK`);
        //this.pushBackChanges();
        break;
      }
      case this.platform.Characteristic.RemoteKey.EXIT: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: EXIT`);
        break;
      }
      case this.platform.Characteristic.RemoteKey.PLAY_PAUSE: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: PLAY_PAUSE`);
        break;
      }
      case this.platform.Characteristic.RemoteKey.INFORMATION: {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: INFORMATION`);
        //this.pushMenuChanges();
        break;
      }
    }
  }

  async ActiveIdentifierSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} ActiveIdentifier: ${value}`);
    this.ActiveIdentifier = value;
  }

  async ActiveSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Active (value): ${value}`);

    this.Active = value;
    if (this.Active === this.platform.Characteristic.Active.ACTIVE) {
      await this.pushTvOnChanges();
    } else {
      await this.pushTvOffChanges();
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	  commandType     Command           Parameter	        Description
   * TV           "command"       "turnOff"         "default"	        set to OFF state
   * TV           "command"       "turnOn"          "default"	        set to ON state
   * TV           "command"       "volumeAdd"       "default"	        volume up
   * TV           "command"       "volumeSub"       "default"	        volume down
   * TV           "command"       "channelAdd"      "default"	        next channel
   * TV           "command"       "channelSub"      "default"	        previous channel
   */
  async pushTvOnChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushTvOnChanges Active: ${this.Active},`
    + ` disablePushOn: ${this.disablePushOn}`);
    if (this.Active === this.platform.Characteristic.Active.ACTIVE && !this.disablePushOn) {
      const commandType: string = await this.commandType();
      const command: string = await this.commandOn();
      const body = superStringify({
        'command': command,
        'parameter': 'default',
        'commandType': commandType,
      });
      await this.pushTVChanges(body);
    }
  }

  async pushTvOffChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushTvOffChanges Active: ${this.Active},`
    + ` disablePushOff: ${this.disablePushOff}`);
    if (this.Active === this.platform.Characteristic.Active.INACTIVE && !this.disablePushOff) {
      const commandType: string = await this.commandType();
      const command: string = await this.commandOff();
      const body = superStringify({
        'command': command,
        'parameter': 'default',
        'commandType': commandType,
      });
      await this.pushTVChanges(body);
    }
  }

  async pushOkChanges(): Promise<void> {
    const body = superStringify({
      'command': 'Ok',
      'parameter': 'default',
      'commandType': 'command',
    });
    await this.pushTVChanges(body);
  }

  async pushBackChanges(): Promise<void> {
    const body = superStringify({
      'command': 'Back',
      'parameter': 'default',
      'commandType': 'command',
    });
    await this.pushTVChanges(body);
  }

  async pushMenuChanges(): Promise<void> {
    const body = superStringify({
      'command': 'Menu',
      'parameter': 'default',
      'commandType': 'command',
    });
    await this.pushTVChanges(body);
  }

  async pushUpChanges(): Promise<void> {
    const body = superStringify({
      'command': 'Up',
      'parameter': 'default',
      'commandType': 'command',
    });
    await this.pushTVChanges(body);
  }

  async pushDownChanges(): Promise<void> {
    const body = superStringify({
      'command': 'Down',
      'parameter': 'default',
      'commandType': 'command',
    });
    await this.pushTVChanges(body);
  }

  async pushRightChanges(): Promise<void> {
    const body = superStringify({
      'command': 'Right',
      'parameter': 'default',
      'commandType': 'command',
    });
    await this.pushTVChanges(body);
  }

  async pushLeftChanges(): Promise<void> {
    const body = superStringify({
      'command': 'Left',
      'parameter': 'default',
      'commandType': 'command',
    });
    await this.pushTVChanges(body);
  }

  async pushVolumeUpChanges(): Promise<void> {
    const body = superStringify({
      'command': 'volumeAdd',
      'parameter': 'default',
      'commandType': 'command',
    });
    await this.pushTVChanges(body);
  }

  async pushVolumeDownChanges(): Promise<void> {
    const body = superStringify({
      'command': 'volumeSub',
      'parameter': 'default',
      'commandType': 'command',
    });
    await this.pushTVChanges(body);
  }

  async pushTVChanges(body: Array<body>): Promise<void> {
    if (this.device.connectionType === 'OpenAPI') {
      {
        try {
          // Make Push On request to the API
          const t = Date.now();
          const nonce = 'requestID';
          const data = this.platform.config.credentials?.token + t + nonce;
          const signTerm = crypto.createHmac('sha256', this.platform.config.credentials?.secret)
            .update(Buffer.from(data, 'utf-8'))
            .digest();
          const sign = signTerm.toString('base64');
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} sign: ${sign}`);
          this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Sending request to SwitchBot API. body: ${body},`);
          const options = {
            hostname: HostDomain,
            port: 443,
            path: `${DevicePath}/${this.device.deviceId}/commands`,
            method: 'POST',
            headers: {
              'Authorization': this.platform.config.credentials?.token,
              'sign': sign,
              'nonce': nonce,
              't': t,
              'Content-Type': 'application/json',
              'Content-Length': body.length,
            },
          };
          const req = https.request(options, res => {
            this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushchanges statusCode: ${res.statusCode}`);
            this.statusCode({ res });
            res.on('data', d => {
              this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} d: ${d}`);
            });
          });
          req.on('error', (e: any) => {
            this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} error message: ${e.message}`);
          });
          req.write(body);
          req.end();
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushchanges: ${superStringify(req)}`);
          this.updateHomeKitCharacteristics();
        } catch (e: any) {
          this.apiError(e);
          this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType} Connection,`
            + ` Error Message: ${superStringify(e.message)}`,
          );
        }
      }
    } else {
      this.warnLog(`${this.device.remoteType}: ${this.accessory.displayName}`
      + ` Connection Type: ${this.device.connectionType}, commands will not be sent to OpenAPI`);
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    if (this.Active === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Active: ${this.Active}`);
    } else {
      this.accessory.context.Active = this.Active;
      this.tvService?.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`);
    }
    if (this.ActiveIdentifier === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} ActiveIdentifier: ${this.ActiveIdentifier}`);
    } else {
      this.accessory.context.ActiveIdentifier = this.ActiveIdentifier;
      this.tvService?.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, this.ActiveIdentifier);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName}` + ` updateCharacteristic ActiveIdentifier: ${this.ActiveIdentifier}`);
    }
  }

  async disablePushOnChanges({ device }: { device: irdevice & irDevicesConfig; }): Promise<void> {
    if (device.disablePushOn === undefined) {
      this.disablePushOn = false;
    } else {
      this.disablePushOn = device.disablePushOn;
    }
  }

  async disablePushOffChanges({ device }: { device: irdevice & irDevicesConfig; }): Promise<void> {
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

  async statusCode({ res }: { res: IncomingMessage }): Promise<void> {
    switch (res.statusCode) {
      case 151:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Device is offline.`);
        break;
      case 171:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Hub Device is offline. Hub: ${this.device.hubDeviceId}`);
        break;
      case 190:
        this.errorLog(
          `${this.device.remoteType}: ` +
            `${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
            ` Or command: ${superStringify(res)} format is invalid`,
        );
        break;
      case 100:
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  async apiError(e: any): Promise<void> {
    this.tvService.updateCharacteristic(this.platform.Characteristic.Active, e);
    this.tvService.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, e);
  }

  FirmwareRevision(accessory: PlatformAccessory, device: irdevice & irDevicesConfig): string {
    let FirmwareRevision: string;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName}`
    + ` accessory.context.FirmwareRevision: ${accessory.context.FirmwareRevision}`);
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} device.firmware: ${device.firmware}`);
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} this.platform.version: ${this.platform.version}`);
    if (accessory.context.FirmwareRevision) {
      FirmwareRevision = accessory.context.FirmwareRevision;
    } else if (device.firmware) {
      FirmwareRevision = device.firmware;
    } else {
      FirmwareRevision = this.platform.version;
    }
    return FirmwareRevision;
  }

  async context() {
    if (this.Active === undefined) {
      this.Active = this.platform.Characteristic.Active.INACTIVE;
    } else {
      this.Active = this.accessory.context.Active;
    }
    if (this.ActiveIdentifier === undefined) {
      this.ActiveIdentifier = 1;
    } else {
      this.ActiveIdentifier = this.accessory.context.ActiveIdentifier;
    }
  }

  async config(device: irdevice & irDevicesConfig): Promise<void> {
    let config = {};
    if (device.irtv) {
      config = device.irtv;
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
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Config: ${superStringify(config)}`);
    }
  }

  async logs(device: irdevice & irDevicesConfig): Promise<void> {
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
