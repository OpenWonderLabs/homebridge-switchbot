import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { request } from 'undici';
import { SwitchBotPlatform } from '../platform';
import { Devices, irDevicesConfig, irdevice } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Fan {
  // Services
  fanService!: Service;

  // Characteristic Values
  Active!: CharacteristicValue;
  SwingMode!: CharacteristicValue;
  RotationSpeed!: CharacteristicValue;
  FirmwareRevision!: CharacteristicValue;
  ActiveIdentifier!: CharacteristicValue;
  RotationDirection!: CharacteristicValue;

  // Config
  minStep?: number;
  minValue?: number;
  maxValue?: number;
  deviceLogging!: string;
  disablePushOn?: boolean;
  disablePushOff?: boolean;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: irdevice & irDevicesConfig,
  ) {
    // default placeholders
    this.logs(device);
    this.context();
    this.disablePushOnChanges(device);
    this.disablePushOffChanges(device);
    this.config(device);

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, device.remoteType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.FirmwareRevision);

    // get the Television service if it exists, otherwise create a new Television service
    // you can create multiple services for each accessory
    (this.fanService = accessory.getService(this.platform.Service.Fanv2) || accessory.addService(this.platform.Service.Fanv2)),
    `${accessory.displayName} Fan`;

    this.fanService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
    if (!this.fanService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
      this.fanService.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
    }

    // handle on / off events using the Active characteristic
    this.fanService.getCharacteristic(this.platform.Characteristic.Active).onSet(this.ActiveSet.bind(this));

    if (device.irfan?.rotation_speed) {
      if (device.irfan?.set_minStep) {
        this.minStep = device.irfan?.set_minStep;
      } else {
        this.minStep = 1;
      }
      if (device.irfan?.set_min) {
        this.minValue = device.irfan?.set_min;
      } else {
        this.minValue = 1;
      }
      if (device.irfan?.set_max) {
        this.maxValue = device.irfan?.set_max;
      } else {
        this.maxValue = 100;
      }
      // handle Roation Speed events using the RotationSpeed characteristic
      this.fanService
        .getCharacteristic(this.platform.Characteristic.RotationSpeed)
        .setProps({
          minStep: this.minStep,
          minValue: this.minValue,
          maxValue: this.maxValue,
        })
        .onSet(this.RotationSpeedSet.bind(this));
    } else if (this.fanService.testCharacteristic(this.platform.Characteristic.RotationSpeed) && !device.irfan?.swing_mode) {
      const characteristic = this.fanService.getCharacteristic(this.platform.Characteristic.RotationSpeed);
      this.fanService.removeCharacteristic(characteristic);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Rotation Speed Characteristic was removed.`);
    } else {
      // eslint-disable-next-line max-len
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} RotationSpeed Characteristic was not removed/added, ` +
        `Clear Cache on ${this.accessory.displayName} to remove Chracteristic`,
      );
    }

    if (device.irfan?.swing_mode) {
      // handle Osolcation events using the SwingMode characteristic
      this.fanService.getCharacteristic(this.platform.Characteristic.SwingMode).onSet(this.SwingModeSet.bind(this));
    } else if (this.fanService.testCharacteristic(this.platform.Characteristic.SwingMode) && !device.irfan?.swing_mode) {
      const characteristic = this.fanService.getCharacteristic(this.platform.Characteristic.SwingMode);
      this.fanService.removeCharacteristic(characteristic);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Swing Mode Characteristic was removed.`);
    } else {
      // eslint-disable-next-line max-len
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} Swing Mode Characteristic was not removed/added, ` +
        `Clear Cache on ${this.accessory.displayName} To Remove Chracteristic`,
      );
    }
  }

  async SwingModeSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} SwingMode: ${value}`);
    if (value > this.SwingMode) {
      this.SwingMode = 1;
      await this.pushFanOnChanges();
      await this.pushFanSwingChanges();
    } else {
      this.SwingMode = 0;
      await this.pushFanOnChanges();
      await this.pushFanSwingChanges();
    }
    this.SwingMode = value;
    this.accessory.context.SwingMode = this.SwingMode;
  }

  async RotationSpeedSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} RotationSpeed: ${value}`);
    if (value > this.RotationSpeed) {
      this.RotationSpeed = 1;
      this.pushFanSpeedUpChanges();
      this.pushFanOnChanges();
    } else {
      this.RotationSpeed = 0;
      this.pushFanSpeedDownChanges();
    }
    this.RotationSpeed = value;
    this.accessory.context.RotationSpeed = this.RotationSpeed;
  }

  async ActiveSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Active: ${value}`);

    this.Active = value;
    if (this.Active === this.platform.Characteristic.Active.ACTIVE) {
      this.pushFanOnChanges();
    } else {
      this.pushFanOffChanges();
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	commandType     Command	          command parameter	         Description
   * Fan -        "command"       "swing"          "default"	        =        swing
   * Fan -        "command"       "timer"          "default"	        =        timer
   * Fan -        "command"       "lowSpeed"       "default"	        =        fan speed to low
   * Fan -        "command"       "middleSpeed"    "default"	        =        fan speed to medium
   * Fan -        "command"       "highSpeed"      "default"	        =        fan speed to high
   */
  async pushFanOnChanges(): Promise<void> {
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} pushFanOnChanges Active: ${this.Active},` + ` disablePushOn: ${this.disablePushOn}`,
    );
    if (this.Active === this.platform.Characteristic.Active.ACTIVE && !this.disablePushOn) {
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

  async pushFanOffChanges(): Promise<void> {
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} pushLightOffChanges Active: ${this.Active},` +
      ` disablePushOff: ${this.disablePushOff}`,
    );
    if (this.Active === this.platform.Characteristic.Active.INACTIVE && !this.disablePushOff) {
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

  async pushFanSpeedUpChanges(): Promise<void> {
    const bodyChange = JSON.stringify({
      command: 'highSpeed',
      parameter: 'default',
      commandType: 'command',
    });
    await this.pushChanges(bodyChange);
  }

  async pushFanSpeedDownChanges(): Promise<void> {
    const bodyChange = JSON.stringify({
      command: 'lowSpeed',
      parameter: 'default',
      commandType: 'command',
    });
    await this.pushChanges(bodyChange);
  }

  async pushFanSwingChanges(): Promise<void> {
    const bodyChange = JSON.stringify({
      command: 'swing',
      parameter: 'default',
      commandType: 'command',
    });
    await this.pushChanges(bodyChange);
  }

  async pushChanges(bodyChange: any): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushChanges`);
    if (this.device.connectionType === 'OpenAPI') {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode, headers } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} body: ${JSON.stringify(body)}`);
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} headers: ${JSON.stringify(headers)}`);
        const deviceStatus: any = await body.json();
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} deviceStatus body: ${JSON.stringify(deviceStatus.body)}`);
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
    if (this.Active === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Active: ${this.Active}`);
    } else {
      this.accessory.context.Active = this.Active;
      this.fanService?.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`);
    }
    if (this.SwingMode === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} SwingMode: ${this.SwingMode}`);
    } else {
      this.accessory.context.SwingMode = this.SwingMode;
      this.fanService?.updateCharacteristic(this.platform.Characteristic.SwingMode, this.SwingMode);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic SwingMode: ${this.SwingMode}`);
    }
    if (this.RotationSpeed === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} RotationSpeed: ${this.RotationSpeed}`);
    } else {
      this.accessory.context.RotationSpeed = this.RotationSpeed;
      this.fanService?.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.RotationSpeed);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic RotationSpeed: ${this.RotationSpeed}`);
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
      default:
        this.infoLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Unknown statusCode: ` +
          `${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`,
        );
    }
  }

  async apiError(e: any): Promise<void> {
    this.fanService.updateCharacteristic(this.platform.Characteristic.Active, e);
    this.fanService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, e);
    this.fanService.updateCharacteristic(this.platform.Characteristic.SwingMode, e);
  }

  async context() {
    if (this.Active === undefined) {
      this.Active = this.platform.Characteristic.Active.INACTIVE;
    } else {
      this.Active = this.accessory.context.Active;
    }
    if (this.FirmwareRevision === undefined) {
      this.FirmwareRevision = this.platform.version;
      this.accessory.context.FirmwareRevision = this.FirmwareRevision;
    }
  }

  async config(device: irdevice & irDevicesConfig): Promise<void> {
    let config = {};
    if (device.irfan) {
      config = device.irfan;
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
