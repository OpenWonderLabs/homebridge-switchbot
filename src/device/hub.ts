/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * hub.ts: @switchbot/homebridge-switchbot.
 */
import { Units } from 'homebridge';
import { deviceBase } from './device.js';
import { convertUnits } from '../utils.js';
import { Subject, interval, skipWhile } from 'rxjs';

import type { SwitchBotPlatform } from '../platform.js';
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { device, devicesConfig, serviceData, deviceStatus } from '../settings.js';

export class Hub extends deviceBase {
  // Services
  private LightSensor?: {
    Name: CharacteristicValue;
    Service: Service;
    CurrentAmbientLightLevel: CharacteristicValue;
  };

  private HumiditySensor?: {
    Name: CharacteristicValue;
    Service: Service;
    CurrentRelativeHumidity: CharacteristicValue;
  };

  private TemperatureSensor?: {
    Name: CharacteristicValue;
    Service: Service;
    CurrentTemperature: CharacteristicValue;
  };

  // Updates
  hubUpdateInProgress!: boolean;
  doHubUpdate!: Subject<void>;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device);
    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doHubUpdate = new Subject();
    this.hubUpdateInProgress = false;

    // Initialize Temperature Sensor Service
    if (device.hub?.hide_temperature) {
      if (this.TemperatureSensor) {
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Temperature Sensor Service`);
        this.TemperatureSensor.Service = this.accessory.getService(this.hap.Service.TemperatureSensor) as Service;
        accessory.removeService(this.TemperatureSensor.Service);
      }
    } else {
      accessory.context.TemperatureSensor = accessory.context.TemperatureSensor ?? {};
      this.TemperatureSensor = {
        Name: accessory.context.TemperatureSensor.Name ?? `${accessory.displayName} Temperature Sensor`,
        Service: accessory.getService(this.hap.Service.TemperatureSensor) ?? this.accessory.addService(this.hap.Service.TemperatureSensor) as Service,
        CurrentTemperature: accessory.context.CurrentTemperature ?? 0,
      };
      accessory.context.TemperatureSensor = this.TemperatureSensor as object;

      // Initialize Temperature Sensor Characteristic
      this.TemperatureSensor.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.TemperatureSensor.Name)
        .getCharacteristic(this.hap.Characteristic.CurrentTemperature)
        .setProps({
          unit: Units['CELSIUS'],
          validValueRanges: [-273.15, 100],
          minValue: -273.15,
          maxValue: 100,
          minStep: 0.1,
        })
        .onGet(() => {
          return this.TemperatureSensor!.CurrentTemperature;
        });
    }

    // Initialize Humidity Sensor Service
    if (device.hub?.hide_humidity) {
      if (this.HumiditySensor) {
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Humidity Sensor Service`);
        this.HumiditySensor.Service = this.accessory.getService(this.hap.Service.HumiditySensor) as Service;
        accessory.removeService(this.HumiditySensor.Service);
      }
    } else {
      accessory.context.HumiditySensor = accessory.context.HumiditySensor ?? {};
      this.HumiditySensor = {
        Name: accessory.context.HumiditySensor.Name ?? `${accessory.displayName} Humidity Sensor`,
        Service: accessory.getService(this.hap.Service.HumiditySensor) ?? this.accessory.addService(this.hap.Service.HumiditySensor) as Service,
        CurrentRelativeHumidity: accessory.context.CurrentRelativeHumidity ?? 0,
      };
      accessory.context.HumiditySensor = this.HumiditySensor as object;

      // Initialize Humidity Sensor Characteristics
      this.HumiditySensor!.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.HumiditySensor.Name)
        .getCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity)
        .setProps({
          minStep: 0.1,
        })
        .onGet(() => {
          return this.HumiditySensor!.CurrentRelativeHumidity;
        });
    }

    // Initialize Light Sensor Service
    if (device.hub?.hide_lightsensor) {
      if (this.LightSensor) {
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Light Sensor Service`);
        this.LightSensor.Service = this.accessory.getService(this.hap.Service.LightSensor) as Service;
        accessory.removeService(this.LightSensor.Service);
      }
    } else {
      accessory.context.LightSensor = accessory.context.LightSensor ?? {};
      this.LightSensor = {
        Name: accessory.context.LightSensor.Name ?? `${accessory.displayName} Light Sensor`,
        Service: accessory.getService(this.hap.Service.LightSensor) ?? this.accessory.addService(this.hap.Service.LightSensor) as Service,
        CurrentAmbientLightLevel: accessory.context.CurrentAmbientLightLevel ?? 0.0001,
      };
      accessory.context.LightSensor = this.LightSensor as object;

      // Initialize Light Sensor Characteristics
      this.LightSensor!.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.LightSensor.Name)
        .getCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel)
        .setProps({
          minStep: 1,
        })
        .onGet(() => {
          return this.LightSensor!.CurrentAmbientLightLevel;
        });
    }

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // Retrieve initial values and update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.hubUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    //regisiter webhook event handler
    this.registerWebhook(accessory, device);

  }

  async BLEparseStatus(serviceData: serviceData): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(serviceData)}`);
  }

  async openAPIparseStatus(deviceStatus: deviceStatus): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
    // CurrentRelativeHumidity
    if (!this.device.hub?.hide_humidity) {
      this.HumiditySensor!.CurrentRelativeHumidity = Number(deviceStatus.body.humidity);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Humidity: ${this.HumiditySensor!.CurrentRelativeHumidity}%`);
    }

    // CurrentTemperature
    if (!this.device.hub?.hide_temperature) {
      this.TemperatureSensor!.CurrentTemperature = Number(deviceStatus.body.temperature);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Temperature: ${this.TemperatureSensor!.CurrentTemperature}°c`);
    }

    // Brightness
    if (!this.device.hub?.hide_lightsensor) {
      if (!this.device.curtain?.hide_lightsensor) {
        const set_minLux = this.device.curtain?.set_minLux ?? 1;
        const set_maxLux = this.device.curtain?.set_maxLux ?? 6001;
        const spaceBetweenLevels = 19;
        const lightLevel = deviceStatus.body.lightLevel;
        await this.getLightLevel(lightLevel, set_minLux, set_maxLux, spaceBetweenLevels);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${deviceStatus.body.lightLevel},`
          + ` CurrentAmbientLightLevel: ${this.LightSensor!.CurrentAmbientLightLevel}`);
      }
      if (!this.device.hub?.hide_lightsensor) {
        this.LightSensor!.Service.setCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, this.LightSensor!.CurrentAmbientLightLevel);
      }
    }

    // Firmware Version
    const version = deviceStatus.body.version?.toString();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Firmware Version: ${version?.replace(/^V|-.*$/g, '')}`);
    if (deviceStatus.body.version) {
      const deviceVersion = version?.replace(/^V|-.*$/g, '') ?? '0.0.0';
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
        .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
        .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
        .updateValue(deviceVersion);
      this.accessory.context.deviceVersion = deviceVersion;
      this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceVersion: ${this.accessory.context.deviceVersion}`);
    }
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} refreshStatus enableCloudService: ${this.device.enableCloudService}`);
    } else if (this.BLE) {
      await this.BLERefreshStatus();
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIRefreshStatus();
    } else {
      await this.offlineOff();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:`
        + ` ${this.device.connectionType}, refreshStatus will not happen.`);
    }
  }

  async BLERefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLERefreshStatus`);
    const switchbot = await this.switchbotBLE();

    if (switchbot === undefined) {
      await this.BLERefreshConnection(switchbot);
    } else {
    // Start to monitor advertisement packets
      (async () => {
      // Start to monitor advertisement packets
        const serviceData: serviceData = await this.monitorAdvertisementPackets(switchbot);
        // Update HomeKit
        if (serviceData.model !== '' && serviceData.modelName !== '') {
          await this.BLEparseStatus(serviceData);
          await this.updateHomeKitCharacteristics();
        } else {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed to get serviceData, serviceData: ${serviceData}`);
          await this.BLERefreshConnection(switchbot);
        }
      })();
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode } = await this.deviceRefreshStatus();
      const deviceStatus: any = await body.json();
      await this.refreshStatusCodes(statusCode, deviceStatus);;
      if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
        await this.successfulRefreshStatus(statusCode, deviceStatus);
        await this.openAPIparseStatus(deviceStatus);
        await this.updateHomeKitCharacteristics();
      } else {
        await this.statusCodes(statusCode, deviceStatus);
      }
    } catch (e: any) {
      await this.apiError(e);
      await this.openAPIRefreshError(e);
    }
  }

  async registerWebhook(accessory: PlatformAccessory, device: device & devicesConfig) {
    if (device.webhook) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} is listening webhook.`);
      this.platform.webhookEventHandler[this.device.deviceId] = async (context) => {
        try {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} received Webhook: ${JSON.stringify(context)}`);
          const { temperature, humidity, lightLevel } = context;
          const { CurrentTemperature } = this.TemperatureSensor || { CurrentTemperature: undefined };
          const { CurrentAmbientLightLevel } = this.LightSensor || { CurrentAmbientLightLevel: undefined };
          const { CurrentRelativeHumidity } = this.HumiditySensor || { CurrentRelativeHumidity: undefined };
          if (context.scale !== 'CELCIUS' && device.hub?.convertUnitTo === undefined) {
            this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} received a non-CELCIUS Webhook scale: `
              + `${context.scale}, Use the *convertUnitsTo* config under Hub settings, if displaying incorrectly in HomeKit.`);
          }
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ` +
            '(scale, temperature, humidity, lightLevel) = ' +
            `Webhook:(${context.scale}, ${convertUnits(temperature, context.scale, device.hub?.convertUnitTo)}, ${humidity}, ${lightLevel}), `
            + `current:(${CurrentTemperature}, ${CurrentRelativeHumidity}, ${CurrentAmbientLightLevel})`);
          if (!this.device.hub?.hide_humidity) {
            this.HumiditySensor!.CurrentRelativeHumidity = humidity;
          }
          if (!this.device.hub?.hide_temperature) {
            this.TemperatureSensor!.CurrentTemperature = convertUnits(temperature, context.scale, device.hub?.convertUnitTo);
          }
          if (!this.device.hub?.hide_lightsensor) {
            const set_minLux = this.device.curtain?.set_minLux ?? 1;
            const set_maxLux = this.device.curtain?.set_maxLux ?? 6001;
            const spaceBetweenLevels = 19;
            await this.getLightLevel(lightLevel, set_minLux, set_maxLux, spaceBetweenLevels);
          }
          this.updateHomeKitCharacteristics();
        } catch (e: any) {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`);
        }
      };
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
      if (this.HumiditySensor!.CurrentRelativeHumidity === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
          + ` CurrentRelativeHumidity: ${this.HumiditySensor!.CurrentRelativeHumidity}`);
      } else {
        if (this.device.mqttURL) {
          mqttmessage.push(`"humidity": ${this.HumiditySensor!.CurrentRelativeHumidity}`);
        }
        if (this.device.history) {
          entry['humidity'] = this.HumiditySensor!.CurrentRelativeHumidity;
        }
        this.accessory.context.CurrentRelativeHumidity = this.HumiditySensor!.CurrentRelativeHumidity;
        this.HumiditySensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity,
          this.HumiditySensor!.CurrentRelativeHumidity);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `updateCharacteristic CurrentRelativeHumidity: ${this.HumiditySensor!.CurrentRelativeHumidity}`);
      }
    }

    // CurrentTemperature
    if (!this.device.hub?.hide_temperature) {
      if (this.TemperatureSensor!.CurrentTemperature === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentTemperature: ${this.TemperatureSensor!.CurrentTemperature}`);
      } else {
        if (this.device.mqttURL) {
          mqttmessage.push(`"temperature": ${this.TemperatureSensor!.CurrentTemperature}`);
        }
        if (this.device.history) {
          entry['temp'] = this.TemperatureSensor!.CurrentTemperature;
        }
        this.accessory.context.CurrentTemperature = this.TemperatureSensor!.CurrentTemperature;
        this.TemperatureSensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, this.TemperatureSensor!.CurrentTemperature);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
          + ` CurrentTemperature: ${this.TemperatureSensor!.CurrentTemperature}`);
      }
    }

    // CurrentAmbientLightLevel
    if (!this.device.hub?.hide_lightsensor) {
      if (this.LightSensor!.CurrentAmbientLightLevel === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
          + ` CurrentAmbientLightLevel: ${this.LightSensor!.CurrentAmbientLightLevel}`);
      } else {
        if (this.device.mqttURL) {
          mqttmessage.push(`"light": ${this.LightSensor!.CurrentAmbientLightLevel}`);
        }
        if (this.device.history) {
          entry['lux'] = this.LightSensor!.CurrentAmbientLightLevel;
        }
        this.accessory.context.CurrentAmbientLightLevel = this.LightSensor!.CurrentAmbientLightLevel;
        this.LightSensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, this.LightSensor!.CurrentAmbientLightLevel);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `updateCharacteristic CurrentAmbientLightLevel: ${this.LightSensor!.CurrentAmbientLightLevel}`);
      }
    }

    // MQTT
    if (this.device.mqttURL) {
      this.mqttPublish(`{${mqttmessage.join(',')}}`);
    }
    if (Number(this.HumiditySensor!.CurrentRelativeHumidity) > 0) {
      // reject unreliable data
      if (this.device.history) {
        this.historyService?.addEntry(entry);
      }
    }
  }

  async BLERefreshConnection(switchbot: any): Promise<void> {
    this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot:`
      + ` ${JSON.stringify(switchbot)}`);
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Refresh Status`);
      await this.openAPIRefreshStatus();
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      if (!this.device.hub?.hide_temperature) {
        this.TemperatureSensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, this.accessory.context.CurrentTemperature);
      }
      if (!this.device.hub?.hide_humidity) {
        this.HumiditySensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity,
          this.accessory.context.CurrentRelativeHumidity);
      }
      if (!this.device.hub?.hide_lightsensor) {
        this.LightSensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel,
          this.accessory.context.CurrentAmbientLightLevel);
      }
    }
  }

  async apiError(e: any): Promise<void> {
    if (!this.device.hub?.hide_temperature) {
      this.TemperatureSensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, e);
    }
    if (!this.device.hub?.hide_humidity) {
      this.HumiditySensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity, e);
    }
    if (!this.device.hub?.hide_lightsensor) {
      this.LightSensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, e);
    }
  }

  async getLightLevel(lightLevel: any, set_minLux: number, set_maxLux: number, spaceBetweenLevels: number) {
    switch (lightLevel) {
      case 1:
        this.LightSensor!.CurrentAmbientLightLevel = set_minLux;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 2:
        this.LightSensor!.CurrentAmbientLightLevel = (set_maxLux - set_minLux) / spaceBetweenLevels;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel},`
          + ` Calculation: ${(set_maxLux - set_minLux) / spaceBetweenLevels}`);
        break;
      case 3:
        this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 2;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 4:
        this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 3;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 5:
        this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 4;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 6:
        this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 5;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 7:
        this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 6;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 8:
        this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 7;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 9:
        this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 8;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 10:
        this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 9;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 11:
        this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 10;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 12:
        this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 11;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 13:
        this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 12;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 14:
        this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 13;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 15:
        this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 14;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 16:
        this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 15;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 17:
        this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 16;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 18:
        this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 17;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 19:
        this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 18;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 20:
      default:
        this.LightSensor!.CurrentAmbientLightLevel = set_maxLux;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
    }
  }
}
