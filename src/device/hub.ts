import { connectAsync } from 'async-mqtt';
import { CharacteristicValue, PlatformAccessory, Service, Units } from 'homebridge';
import { MqttClient } from 'mqtt';
import { hostname } from 'os';
import { interval } from 'rxjs';
import { request } from 'undici';
import { Context } from 'vm';
import { SwitchBotPlatform } from '../platform';
import { Devices, device, deviceStatus, devicesConfig } from '../settings';

export class Hub {
  // Services
  lightSensorService?: Service;
  humidityService?: Service;
  temperatureService?: Service;

  // Characteristic Values
  FirmwareRevision!: CharacteristicValue;
  CurrentTemperature!: CharacteristicValue;
  CurrentRelativeHumidity!: CharacteristicValue;
  CurrentAmbientLightLevel!: CharacteristicValue;

  // OpenAPI Status
  OpenAPI_FirmwareRevision: deviceStatus['version'];
  OpenAPI_CurrentTemperature: deviceStatus['temperature'];
  OpenAPI_CurrentRelativeHumidity: deviceStatus['humidity'];
  OpenAPI_CurrentAmbientLightLevel!: deviceStatus['brightness'];

  // OpenAPI Others
  spaceBetweenLevels!: number;

  //MQTT stuff
  mqttClient: MqttClient | null = null;

  // EVE history service handler
  historyService?: any;

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
    this.context(accessory, device);
    this.setupHistoryService(device);
    this.setupMqtt(device);
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
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!);

    if (accessory.context.FirmwareRevision) {
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName}`
        + ` accessory.context.FirmwareRevision: ${accessory.context.FirmwareRevision}`);
      accessory
        .getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.FirmwareRevision)
        .updateCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.FirmwareRevision)
        .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
        .updateValue(accessory.context.FirmwareRevision);
    } else {
      this.setFirmwareRevision(accessory, device);
    }

    // Temperature Sensor Service
    if (device.hub?.hide_temperature) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Temperature Sensor Service`);
      this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor);
      accessory.removeService(this.temperatureService!);
    } else if (!this.temperatureService) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Temperature Sensor Service`);
      (this.temperatureService =
        this.accessory.getService(this.platform.Service.TemperatureSensor) || this.accessory.addService(this.platform.Service.TemperatureSensor)),
      `${accessory.displayName} Temperature Sensor`;

      this.temperatureService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Temperature Sensor`);
      if (!this.temperatureService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
        this.temperatureService.addCharacteristic(this.platform.Characteristic.ConfiguredName, `${accessory.displayName} Temperature Sensor`);
      }
      this.temperatureService
        .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .setProps({
          unit: Units['CELSIUS'],
          validValueRanges: [-273.15, 100],
          minValue: -273.15,
          maxValue: 100,
          minStep: 0.1,
        })
        .onGet(() => {
          return this.CurrentTemperature!;
        });
    } else {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Temperature Sensor Service Not Added`);
    }

    // Humidity Sensor Service
    if (device.hub?.hide_humidity) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Humidity Sensor Service`);
      this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor);
      accessory.removeService(this.humidityService!);
    } else if (!this.humidityService) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Humidity Sensor Service`);
      (this.humidityService =
        this.accessory.getService(this.platform.Service.HumiditySensor) || this.accessory.addService(this.platform.Service.HumiditySensor)),
      `${accessory.displayName} Humidity Sensor`;

      this.humidityService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Humidity Sensor`);
      if (!this.humidityService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
        this.humidityService.addCharacteristic(this.platform.Characteristic.ConfiguredName, `${accessory.displayName} Humidity Sensor`);
      }
      this.humidityService
        .getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .setProps({
          minStep: 0.1,
        })
        .onGet(() => {
          return this.CurrentRelativeHumidity;
        });
    } else {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Humidity Sensor Service Not Added`);
    }

    // Light Sensor Service
    if (device.hub?.hide_lightsensor) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Light Sensor Service`);
      this.lightSensorService = this.accessory.getService(this.platform.Service.LightSensor);
      accessory.removeService(this.lightSensorService!);
    } else if (!this.lightSensorService) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Light Sensor Service`);
      (this.lightSensorService =
        this.accessory.getService(this.platform.Service.LightSensor) || this.accessory.addService(this.platform.Service.LightSensor)),
      `${accessory.displayName} Light Sensor`;

      this.lightSensorService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Light Sensor`);
      this.lightSensorService.setCharacteristic(this.platform.Characteristic.ConfiguredName, `${accessory.displayName} Light Sensor`);
    } else {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Light Sensor Service Not Added`);
    }

    // Retrieve initial values and update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .subscribe(async () => {
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
    // CurrentRelativeHumidity
    if (!this.device.hub?.hide_humidity) {
      this.CurrentRelativeHumidity = Number(this.OpenAPI_CurrentRelativeHumidity);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Humidity: ${this.CurrentRelativeHumidity}%`);
    }

    // CurrentTemperature
    if (!this.device.hub?.hide_temperature) {
      this.CurrentTemperature = Number(this.OpenAPI_CurrentTemperature);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Temperature: ${this.CurrentTemperature}°c`);
    }

    // Brightness
    if (!this.device.hub?.hide_lightsensor) {
      if (!this.device.curtain?.hide_lightsensor) {
        this.set_minLux = this.minLux();
        this.set_maxLux = this.maxLux();
        this.spaceBetweenLevels = 19;
        switch (this.OpenAPI_CurrentAmbientLightLevel) {
          case 1:
            this.CurrentAmbientLightLevel = this.set_minLux;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel}`);
            break;
          case 2:
            this.CurrentAmbientLightLevel = (this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels;
            this.debugLog(
              `${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel},` +
              ` Calculation: ${(this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels}`,
            );
            break;
          case 3:
            this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 2;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel}`);
            break;
          case 4:
            this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 3;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel}`);
            break;
          case 5:
            this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 4;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel}`);
            break;
          case 6:
            this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 5;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel}`);
            break;
          case 7:
            this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 6;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel}`);
            break;
          case 8:
            this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 7;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel}`);
            break;
          case 9:
            this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 8;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel}`);
            break;
          case 10:
            this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 9;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel}`);
            break;
          case 11:
            this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 10;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel}`);
            break;
          case 12:
            this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 11;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel}`);
            break;
          case 13:
            this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 12;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel}`);
            break;
          case 14:
            this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 13;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel}`);
            break;
          case 15:
            this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 14;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel}`);
            break;
          case 16:
            this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 15;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel}`);
            break;
          case 17:
            this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 16;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel}`);
            break;
          case 18:
            this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 17;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel}`);
            break;
          case 19:
            this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 18;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel}`);
            break;
          case 20:
          default:
            this.CurrentAmbientLightLevel = this.set_maxLux;
            this.debugLog();
        }
        this.debugLog(
          `${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.OpenAPI_CurrentAmbientLightLevel},` +
          ` CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`,
        );
      }
      if (!this.device.hub?.hide_lightsensor) {
        this.lightSensorService?.setCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, this.CurrentAmbientLightLevel);
      }
    }

    // FirmwareRevision
    this.FirmwareRevision = this.OpenAPI_FirmwareRevision!;
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
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} body: ${JSON.stringify(body)}`);
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} headers: ${JSON.stringify(headers)}`);
      const deviceStatus: any = await body.json();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus body: ${JSON.stringify(deviceStatus.body)}`);
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
      if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
        this.debugErrorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
        this.OpenAPI_CurrentTemperature = deviceStatus.body.temperature;
        this.OpenAPI_CurrentRelativeHumidity = deviceStatus.body.humidity;
        this.OpenAPI_CurrentAmbientLightLevel = deviceStatus.body.lightLevel;
        this.OpenAPI_FirmwareRevision = deviceStatus.body.version;
        this.openAPIparseStatus();
        this.updateHomeKitCharacteristics();
      } else {
        this.statusCode(statusCode);
        this.statusCode(deviceStatus.statusCode);
      }
    } catch (e: any) {
      this.apiError(e);
      this.errorLog(
        `${this.device.deviceType}: ${this.accessory.displayName} failed openAPIRefreshStatus with ${this.device.connectionType}` +
        ` Connection, Error Message: ${JSON.stringify(e.message)}`,
      );
    }
  }

  /**
   * Handle requests to set the value of the "Target Position" characteristic
   */

  async updateHomeKitCharacteristics(): Promise<void> {
    const mqttmessage: string[] = [];
    const entry = { time: Math.round(new Date().valueOf() / 1000) };

    // CurrentRelativeHumidity
    if (!this.device.hub?.hide_humidity) {
      if (this.CurrentRelativeHumidity === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
      } else {
        if (this.device.mqttURL) {
          mqttmessage.push(`"humidity": ${this.CurrentRelativeHumidity}`);
        }
        if (this.device.history) {
          entry['humidity'] = this.CurrentRelativeHumidity;
        }
        this.accessory.context.CurrentRelativeHumidity = this.CurrentRelativeHumidity;
        this.humidityService?.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `updateCharacteristic CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
      }
    }

    // CurrentTemperature
    if (!this.device.hub?.hide_temperature) {
      if (this.CurrentTemperature === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
      } else {
        if (this.device.mqttURL) {
          mqttmessage.push(`"temperature": ${this.CurrentTemperature}`);
        }
        if (this.device.history) {
          entry['temp'] = this.CurrentTemperature;
        }
        this.accessory.context.CurrentTemperature = this.CurrentTemperature;
        this.temperatureService?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`);
      }
    }
    if (!this.device.hub?.hide_lightsensor) {
      if (this.CurrentAmbientLightLevel === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
      } else {
        this.accessory.context.CurrentAmbientLightLevel = this.CurrentAmbientLightLevel;
        this.lightSensorService?.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, this.CurrentAmbientLightLevel);
        this.debugLog(
          `${this.device.deviceType}: ${this.accessory.displayName} `
          + `updateCharacteristic CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`,
        );
      }
    }

    // FirmwareRevision
    if (this.FirmwareRevision === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} FirmwareRevision: ${this.FirmwareRevision}`);
    } else {
      this.accessory.context.FirmwareRevision = this.FirmwareRevision;

      if (!this.device.hub?.hide_humidity) {
        this.humidityService!.updateCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision);
      }
      if (!this.device.hub?.hide_temperature) {
        this.temperatureService!.updateCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision);
      }
      if (!this.device.hub?.hide_lightsensor) {
        this.lightSensorService!.updateCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision);
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} `
        + `updateCharacteristic FirmwareRevision: ${this.FirmwareRevision}`);
    }

    // MQTT
    if (this.device.mqttURL) {
      this.mqttPublish(`{${mqttmessage.join(',')}}`);
    }
    if (Number(this.CurrentRelativeHumidity) > 0) {
      // reject unreliable data
      if (this.device.history) {
        this.historyService?.addEntry(entry);
      }
    }
  }

  /*
   * Publish MQTT message for topics of
   * 'homebridge-switchbot/meter/xx:xx:xx:xx:xx:xx'
   */
  mqttPublish(message: any) {
    const mac = this.device.deviceId
      ?.toLowerCase()
      .match(/[\s\S]{1,2}/g)
      ?.join(':');
    const options = this.device.mqttPubOptions || {};
    this.mqttClient?.publish(`homebridge-switchbot/meter/${mac}`, `${message}`, options);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} MQTT message: ${message} options:${JSON.stringify(options)}`);
  }

  /*
   * Setup MQTT hadler if URL is specifed.
   */
  async setupMqtt(device: device & devicesConfig): Promise<void> {
    if (device.mqttURL) {
      try {
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

  async statusCode(statusCode: number): Promise<void> {
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
        this.offlineOff();
        break;
      case 171:
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} Hub Device is offline, statusCode: ${statusCode}. ` +
          `Hub: ${this.device.hubDeviceId}`,
        );
        this.offlineOff();
        break;
      case 190:
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
          ` Or command format is invalid, statusCode: ${statusCode}`,
        );
        break;
      case 100:
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Command successfully sent, statusCode: ${statusCode}`);
        break;
      case 200:
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Request successful, statusCode: ${statusCode}`);
        break;
      default:
        this.infoLog(
          `${this.device.deviceType}: ${this.accessory.displayName} Unknown statusCode: ` +
          `${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`,
        );
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      await this.context(this.accessory, this.device);
      await this.updateHomeKitCharacteristics();
    }
  }

  async apiError(e: any): Promise<void> {
    if (!this.device.hub?.hide_temperature) {
      this.temperatureService?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, e);
    }
    if (!this.device.hub?.hide_humidity) {
      this.humidityService?.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, e);
    }
    if (!this.device.hub?.hide_lightsensor) {
      this.lightSensorService?.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, e);
    }
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

  async setFirmwareRevision(accessory: PlatformAccessory<Context>, device: device & devicesConfig) {
    await this.refreshStatus();
    if (device.firmware) {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} device.firmware: ${device.firmware}`);
      accessory.context.FirmwareRevision = device.firmware;
      this.FirmwareRevision = accessory.context.FirmwareRevision;
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} device.firmware, FirmwareRevision: ${this.FirmwareRevision}`);
    } else {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} device.version: ${device.version}`);
      accessory.context.FirmwareRevision = device.version;
      this.FirmwareRevision = accessory.context.FirmwareRevision;
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} device.version, FirmwareRevision: ${this.FirmwareRevision}`);
    }
    this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} setFirmwareRevision: ${this.FirmwareRevision}`);
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .updateCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.FirmwareRevision)
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
      .updateValue(this.FirmwareRevision);
  }

  async context(accessory, device) {
    if (this.CurrentRelativeHumidity === undefined) {
      this.CurrentRelativeHumidity = 0;
    } else {
      this.CurrentRelativeHumidity = this.accessory.context.CurrentRelativeHumidity;
    }
    if (this.CurrentTemperature === undefined) {
      this.CurrentTemperature = 0;
    } else {
      this.CurrentTemperature = this.accessory.context.CurrentTemperature;
    }
    if (this.FirmwareRevision === undefined) {
      this.FirmwareRevision = this.platform.version;
    } else {
      this.setFirmwareRevision(accessory, device);
      this.FirmwareRevision = this.accessory.context.FirmwareRevision;
    }
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
