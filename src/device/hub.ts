/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * hub.ts: @switchbot/homebridge-switchbot.
 */
import { Units } from 'homebridge';
import { deviceBase } from './device.js';
import { Devices } from '../settings.js';
import { convertUnits } from '../utils.js';
import { Subject, interval, skipWhile } from 'rxjs';

import type { SwitchBotPlatform } from '../platform.js';
import type { device, deviceStatus, devicesConfig } from '../settings.js';
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

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
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Temperature Sensor Service`);
      this.TemperatureSensor!.Service = this.accessory.getService(this.hap.Service.TemperatureSensor) as Service;
      accessory.removeService(this.TemperatureSensor!.Service);
    } else {
      this.TemperatureSensor = {
        Name: accessory.context.TemperatureSensor.Name ?? `${accessory.displayName} Temperature Sensor`,
        Service: accessory.getService(this.hap.Service.TemperatureSensor) ?? this.accessory.addService(this.hap.Service.TemperatureSensor) as Service,
        CurrentTemperature: accessory.context.CurrentTemperature ?? 0,
      };

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
      accessory.context.TemperatureSensor.Name = this.TemperatureSensor.Name;
    }

    // Initialize Humidity Sensor Service
    if (device.hub?.hide_humidity) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Humidity Sensor Service`);
      this.HumiditySensor!.Service = this.accessory.getService(this.hap.Service.HumiditySensor) as Service;
      accessory.removeService(this.HumiditySensor!.Service);
    } else {
      this.HumiditySensor = {
        Name: accessory.context.HumiditySensor.Name ?? `${accessory.displayName} Humidity Sensor`,
        Service: accessory.getService(this.hap.Service.HumiditySensor) ?? this.accessory.addService(this.hap.Service.HumiditySensor) as Service,
        CurrentRelativeHumidity: accessory.context.CurrentRelativeHumidity ?? 0,
      };

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
      accessory.context.HumiditySensor.Name = this.HumiditySensor.Name;
    }

    // Initialize Light Sensor Service
    if (device.hub?.hide_lightsensor) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Light Sensor Service`);
      this.LightSensor!.Service = this.accessory.getService(this.hap.Service.LightSensor) as Service;
      accessory.removeService(this.LightSensor!.Service);
    } else {
      this.LightSensor = {
        Name: accessory.context.LightSensor.Name ?? `${accessory.displayName} Light Sensor`,
        Service: accessory.getService(this.hap.Service.LightSensor) ?? this.accessory.addService(this.hap.Service.LightSensor) as Service,
        CurrentAmbientLightLevel: accessory.context.CurrentAmbientLightLevel ?? 0.0001,
      };

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
      accessory.context.LightSensor.Name = this.LightSensor.Name;
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
            `Webhook:(${context.scale}, ${convertUnits(temperature, context.scale, device.hub?.convertUnitTo)}, ${humidity}, ${lightLevel}), ` +
            `current:(${CurrentTemperature}, ${CurrentRelativeHumidity}, ${CurrentAmbientLightLevel})`);
          if (!this.device.hub?.hide_humidity) {
            this.HumiditySensor!.CurrentRelativeHumidity = humidity;
          }
          if (!this.device.hub?.hide_temperature) {
            this.TemperatureSensor!.CurrentTemperature = convertUnits(temperature, context.scale, device.hub?.convertUnitTo);
          }
          if (!this.device.hub?.hide_lightsensor) {
            const set_minLux = await this.minLux();
            const set_maxLux = await this.maxLux();
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
        const set_minLux = await this.minLux();
        const set_maxLux = await this.maxLux();
        const spaceBetweenLevels = 19;
        const lightLevel = deviceStatus.body.lightLevel;
        await this.getLightLevel(lightLevel, set_minLux, set_maxLux, spaceBetweenLevels);
        this.debugLog(
          `${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${deviceStatus.body.lightLevel},` +
          ` CurrentAmbientLightLevel: ${this.LightSensor!.CurrentAmbientLightLevel}`,
        );
      }
      if (!this.device.hub?.hide_lightsensor) {
        this.LightSensor!.Service.setCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, this.LightSensor!.CurrentAmbientLightLevel);
      }
    }

    // Firmware Version
    const version = deviceStatus.body.version?.toString();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Firmware Version: ${version?.replace(/^V|-.*$/g, '')}`);
    if (deviceStatus.body.version) {
      this.accessory.context.version = version?.replace(/^V|-.*$/g, '');
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.hap.Characteristic.FirmwareRevision, this.accessory.context.version)
        .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
        .updateValue(this.accessory.context.version);
    }
  }

  async refreshStatus(): Promise<void> {
    if (this.BLE) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE not supported`);
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIRefreshStatus();
    } else {
      await this.offlineOff();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type: OpenAPI, refreshStatus will not happen.`);
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode } = await this.platform.retryRequest(this.deviceMaxRetries, this.deviceDelayBetweenRetries,
        `${Devices}/${this.device.deviceId}/status`, {
          headers: this.platform.generateHeaders(),
        });
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
      const deviceStatus: any = await body.json();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
      if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
        this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);

        this.openAPIparseStatus(deviceStatus);
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
        this.debugLog(
          `${this.device.deviceType}: ${this.accessory.displayName} `
          + `updateCharacteristic CurrentAmbientLightLevel: ${this.LightSensor!.CurrentAmbientLightLevel}`,
        );
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

  async minLux(): Promise<number> {
    let set_minLux: number;
    if (this.device.curtain?.set_minLux) {
      set_minLux = this.device.curtain?.set_minLux;
    } else {
      set_minLux = 1;
    }
    return set_minLux;
  }

  async maxLux(): Promise<number> {
    let set_maxLux: number;
    if (this.device.curtain?.set_maxLux) {
      set_maxLux = this.device.curtain?.set_maxLux;
    } else {
      set_maxLux = 6001;
    }
    return set_maxLux;
  }

  async getLightLevel(lightLevel: any, set_minLux: number, set_maxLux: number, spaceBetweenLevels: number) {
    switch (lightLevel) {
      case 1:
        this.LightSensor!.CurrentAmbientLightLevel = set_minLux;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel}`);
        break;
      case 2:
        this.LightSensor!.CurrentAmbientLightLevel = (set_maxLux - set_minLux) / spaceBetweenLevels;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${lightLevel},` +
          ` Calculation: ${(set_maxLux - set_minLux) / spaceBetweenLevels}`);
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
