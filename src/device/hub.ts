import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { interval } from 'rxjs';
import { request } from 'undici';
import { Context } from 'vm';
import { SwitchBotPlatform } from '../platform';
import { Devices, device, deviceStatus, devicesConfig } from '../settings';
import { StatusCodeDescription, sleep } from '../utils';

export class Hub {
  // Services
  hubTemperatureSensor: Service;
  hubHumiditySensor: Service;
  hubLightSensor: Service;

  // Characteristic Values
  CurrentRelativeHumidity!: number;
  CurrentTemperature!: number;
  CurrentAmbientLightLevel!: number;

  // OpenAPI Others
  Version: deviceStatus['version'];
  deviceStatus!: any; //deviceStatusResponse;
  lightLevel!: number;
  spaceBetweenLevels!: number;

  // Config
  set_minStep!: number;
  updateRate!: number;
  set_minLux!: number;
  set_maxLux!: number;
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;

  // Connection
  private readonly BLE = this.device.connectionType === 'BLE' || this.device.connectionType === 'BLE/OpenAPI';
  private readonly OpenAPI = this.device.connectionType === 'OpenAPI' || this.device.connectionType === 'BLE/OpenAPI';

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device & devicesConfig,
  ) {
    // default placeholders
    this.logs(device);
    this.refreshRate(device);
    this.config(device);

    this.CurrentRelativeHumidity = accessory.context.CurrentRelativeHumidity;
    this.CurrentTemperature = accessory.context.CurrentTemperature;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, accessory.context.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision(accessory, device))
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
      .updateValue(this.FirmwareRevision(accessory, device));

    // get the WindowCovering service if it exists, otherwise create a new WindowCovering service
    // you can create multiple services for each accessory
    (this.hubTemperatureSensor =
      accessory.getService(this.platform.Service.TemperatureSensor) || accessory.addService(this.platform.Service.TemperatureSensor)),
    `${device.deviceName} ${device.deviceType}`;

    (this.hubHumiditySensor =
      accessory.getService(this.platform.Service.HumiditySensor) || accessory.addService(this.platform.Service.HumiditySensor)),
    `${device.deviceName} ${device.deviceType}`;

    (this.hubLightSensor = accessory.getService(this.platform.Service.LightSensor) || accessory.addService(this.platform.Service.LightSensor)),
    `${device.deviceName} ${device.deviceType}`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.WindowCovering, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.hubTemperatureSensor.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
    if (!this.hubTemperatureSensor.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
      this.hubTemperatureSensor.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
    }

    this.hubHumiditySensor.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
    if (!this.hubHumiditySensor.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
      this.hubHumiditySensor.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
    }

    this.hubLightSensor.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
    if (!this.hubLightSensor.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
      this.hubLightSensor.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
    }

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/WindowCovering

    // Temperature Sensor Service
    if (device.hub?.hide_temperature) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Temperature Sensor Service`);
      this.hubTemperatureSensor = this.hubTemperatureSensor.setCharacteristic(this.platform.Characteristic.CurrentTemperature, false);
      accessory.removeService(this.hubTemperatureSensor!);
    } else if (!this.hubTemperatureSensor) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Temperature Sensor Service`);
      (this.hubTemperatureSensor =
        accessory.getService(this.platform.Service.TemperatureSensor) || accessory.addService(this.platform.Service.TemperatureSensor)),
      `${device.deviceName} ${device.deviceType}`;

      this.hubTemperatureSensor.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Temperature Sensor`);
      this.hubTemperatureSensor.setCharacteristic(this.platform.Characteristic.ConfiguredName, `${accessory.displayName} Temperature Sensor`);
    } else {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Temperature Sensor Service Not Added`);
    }

    // Humidity Sensor Service
    if (device.hub?.hide_humidity) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Humidity Sensor Service`);
      this.hubHumiditySensor = this.hubHumiditySensor.setCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, false);
      accessory.removeService(this.hubHumiditySensor!);
    } else if (!this.hubHumiditySensor) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Humidity Sensor Service`);
      (this.hubHumiditySensor =
        accessory.getService(this.platform.Service.HumiditySensor) || accessory.addService(this.platform.Service.HumiditySensor)),
      `${device.deviceName} ${device.deviceType}`;

      this.hubHumiditySensor.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Humidity Sensor`);
      this.hubHumiditySensor.setCharacteristic(this.platform.Characteristic.ConfiguredName, `${accessory.displayName} Humidity Sensor`);
    } else {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Humidity Sensor Service Not Added`);
    }

    // Humidity Sensor Service
    if (device.hub?.hide_lightsensor) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Light Sensor Service`);
      this.hubLightSensor = this.hubLightSensor.setCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, false);
      accessory.removeService(this.hubLightSensor!);
    } else if (!this.hubLightSensor) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Light Sensor Service`);
      (this.hubLightSensor = accessory.getService(this.platform.Service.LightSensor) || accessory.addService(this.platform.Service.LightSensor)),
      `${device.deviceName} ${device.deviceType}`;

      this.hubLightSensor.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Light Sensor`);
      this.hubLightSensor.setCharacteristic(this.platform.Characteristic.ConfiguredName, `${accessory.displayName} Light Sensor`);
    } else {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Light Sensor Service Not Added`);
    }

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000).subscribe(async () => {
      await this.refreshStatus();
    });
  }

  /**
   * Parse the device status from the SwitchBot api
   */
  async parseStatus(): Promise<void> {
    if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIparseStatus();
    } else {
      await this.offlineOff();
      this.debugWarnLog(
        `${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` + ` ${this.device.connectionType}, parseStatus will not happen.`,
      );
    }
  }

  async openAPIparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
    this.infoLog(`update temperature and humidity for ${this.accessory.displayName}`);
    // this.infoLog(`temp: ${this.CurrentTemperature}, humidity: ${this.CurrentRelativeHumidity}`);
    this.hubTemperatureSensor.setCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
    this.hubHumiditySensor.setCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);

    if (!this.device.curtain?.hide_lightsensor) {
      this.set_minLux = this.minLux();
      this.set_maxLux = this.maxLux();
      this.spaceBetweenLevels = 19;

      // Brightness
      switch (this.lightLevel) {
        case 1:
          this.CurrentAmbientLightLevel = this.set_minLux;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 2:
          this.CurrentAmbientLightLevel = (this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels;
          this.debugLog(
            `${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel},` +
            ` Calculation: ${(this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels}`,
          );
          break;
        case 3:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 2;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 4:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 3;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 5:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 4;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 6:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 5;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 7:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 6;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 8:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 7;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 9:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 8;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 10:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 9;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 11:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 10;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 12:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 11;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 13:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 12;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 14:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 13;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 15:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 14;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 16:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 15;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 17:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 16;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 18:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 17;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 19:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 18;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 20:
        default:
          this.CurrentAmbientLightLevel = this.set_maxLux;
          this.debugLog();
      }
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel},` +
        ` CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`,
      );
    }

    this.hubLightSensor.setCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, this.CurrentAmbientLightLevel);
  }

  async refreshStatus(): Promise<void> {
    if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIRefreshStatus();
    } else {
      await this.offlineOff();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type: OpenAPI, refreshStatus will not happen.`);
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode, headers } = await request(`${Devices}/${this.device.deviceId}/status`, {
        headers: this.platform.generateHeaders(),
      });
      await this.statusCode(statusCode);
      const deviceStatus: any = await body.json();
      await this.statusCode(deviceStatus.statusCode);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Devices: ${JSON.stringify(deviceStatus.body)}`);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Headers: ${JSON.stringify(headers)}`);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} refreshStatus: ${JSON.stringify(deviceStatus)}`);
      this.CurrentTemperature = deviceStatus.body.temperature;
      this.CurrentRelativeHumidity = deviceStatus.body.humidity;
      this.lightLevel = deviceStatus.body.lightLevel;
      this.openAPIparseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.apiError(e);
      this.errorLog(
        `${this.device.deviceType}: ${this.accessory.displayName} failed openAPIRefreshStatus with ${this.device.connectionType}` +
        ` Connection, Error Message: ${JSON.stringify(e.message)}`,
      );
    }
  }

  async retry({ max, fn }: { max: number; fn: { (): any; (): Promise<any> } }): Promise<null> {
    return fn().catch(async (e: any) => {
      if (max === 0) {
        throw e;
      }
      this.infoLog(e);
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Retrying`);
      await sleep(1000);
      return this.retry({ max: max - 1, fn });
    });
  }

  maxRetry(): number {
    if (this.device.maxRetry) {
      return this.device.maxRetry;
    } else {
      return 5;
    }
  }

  /**
   * Handle requests to set the value of the "Target Position" characteristic
   */

  async updateHomeKitCharacteristics(): Promise<void> {
    if (this.CurrentTemperature === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
    } else {
      this.accessory.context.CurrentTemperature = this.CurrentTemperature;
      this.hubTemperatureSensor?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`);
    }
    if (this.CurrentRelativeHumidity === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    } else {
      this.accessory.context.CurrentRelativeHumidity = this.CurrentRelativeHumidity;
      this.hubHumiditySensor?.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} ` + `updateCharacteristic CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`,
      );
    }
    if (this.CurrentAmbientLightLevel === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
    } else {
      this.accessory.context.CurrentAmbientLightLevel = this.CurrentAmbientLightLevel;
      this.hubLightSensor?.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, this.CurrentAmbientLightLevel);
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} ` +
        `updateCharacteristic CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`,
      );
    }
  }

  /**
   * Logs the status code and throws an error if the status code is invalid.
   *
   * @param statusCode - The status code to be validated.
   * @returns {Promise<void>} - Resolves if the status code is valid, otherwise rejects with an error.
   * @throws {Error} If the provided status code is not valid.
   */
  async statusCode(statusCode: number): Promise<void> {
    let statusMsg = `${this.device.deviceType}: ${this.accessory.displayName} ${StatusCodeDescription(statusCode)}`;

    if (statusCode === 100 || statusCode === 200) {
      this.debugLog(statusMsg);
    } else {
      if (statusCode === 161 || statusCode === 171) {
        statusMsg =`${statusMsg}, Hub: ${this.device.hubDeviceId}`;
        this.offlineOff();
      }
      this.errorLog(statusMsg);
      return Promise.reject(new Error(`Invalid Status Code: ${statusCode}`));
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      await this.updateHomeKitCharacteristics();
    }
  }

  async apiError(e: any): Promise<void> {
    this.hubTemperatureSensor?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, e);
    this.hubHumiditySensor?.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, e);
    this.hubLightSensor?.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, e);
  }

  minLux(): number {
    if (this.device.curtain?.set_minLux) {
      this.set_minLux = this.device.curtain?.set_minLux;
    } else {
      this.set_minLux = 1;
    }
    return this.set_minLux;
  }

  maxLux(): number {
    if (this.device.curtain?.set_maxLux) {
      this.set_maxLux = this.device.curtain?.set_maxLux;
    } else {
      this.set_maxLux = 6001;
    }
    return this.set_maxLux;
  }

  FirmwareRevision(accessory: PlatformAccessory<Context>, device: device & devicesConfig): CharacteristicValue {
    let FirmwareRevision: string;
    this.debugLog(
      `${this.device.deviceType}: ${this.accessory.displayName}` + ` accessory.context.FirmwareRevision: ${accessory.context.FirmwareRevision}`,
    );
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} device.firmware: ${device.firmware}`);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} this.platform.version: ${this.platform.version}`);
    if (device.firmware) {
      FirmwareRevision = device.firmware;
    } else if (device.version) {
      FirmwareRevision = JSON.stringify(device.version);
    } else if (accessory.context.FirmwareRevision) {
      FirmwareRevision = accessory.context.FirmwareRevision;
    } else {
      FirmwareRevision = this.platform.version;
    }
    return FirmwareRevision;
  }

  async refreshRate(device: device & devicesConfig): Promise<void> {
    // refreshRate
    if (device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = device.refreshRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options!.refreshRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
    }
    // updateRate
    if (device?.curtain?.updateRate) {
      this.updateRate = device?.curtain?.updateRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config Curtain updateRate: ${this.updateRate}`);
    } else {
      this.updateRate = 7;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Default Curtain updateRate: ${this.updateRate}`);
    }
  }

  async config(device: device & devicesConfig): Promise<void> {
    let config = {};
    if (device.hub) {
      config = device.hub;
    }
    if (device.connectionType !== undefined) {
      config['connectionType'] = device.connectionType;
    }
    if (device.external !== undefined) {
      config['external'] = device.external;
    }
    if (device.logging !== undefined) {
      config['logging'] = device.logging;
    }
    if (device.refreshRate !== undefined) {
      config['refreshRate'] = device.refreshRate;
    }
    if (Object.entries(config).length !== 0) {
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  async logs(device: device & devicesConfig): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
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
