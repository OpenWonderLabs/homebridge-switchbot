/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * meterplus.ts: @switchbot/homebridge-switchbot.
 */
import { Units } from 'homebridge';
import { deviceBase } from './device.js';
import { Subject, interval, skipWhile } from 'rxjs';

import type { SwitchBotPlatform } from '../platform.js';
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { device, devicesConfig, serviceData, deviceStatus } from '../settings.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class MeterPlus extends deviceBase {
  // Services
  private Battery: {
    Name: CharacteristicValue;
    Service: Service;
    BatteryLevel: CharacteristicValue;
    StatusLowBattery: CharacteristicValue;
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
  meterUpdateInProgress!: boolean;
  doMeterUpdate: Subject<void>;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device);
    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doMeterUpdate = new Subject();
    this.meterUpdateInProgress = false;

    // Initialize Battery Service
    accessory.context.Battery = accessory.context.Battery ?? {};
    this.Battery = {
      Name: accessory.context.Battery.Name ?? `${accessory.displayName} Battery`,
      Service: accessory.getService(this.hap.Service.Battery) ?? accessory.addService(this.hap.Service.Battery) as Service,
      BatteryLevel: accessory.context.BatteryLevel ?? 100,
      StatusLowBattery: accessory.context.StatusLowBattery ?? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
    };
    accessory.context.Battery = this.Battery as object;

    // Initialize Battery Characteristics
    this.Battery.Service
      .setCharacteristic(this.hap.Characteristic.Name, this.Battery.Name)
      .setCharacteristic(this.hap.Characteristic.ChargingState, this.hap.Characteristic.ChargingState.NOT_CHARGEABLE)
      .getCharacteristic(this.hap.Characteristic.BatteryLevel)
      .onGet(() => {
        return this.Battery.BatteryLevel;
      });

    this.Battery.Service
      .getCharacteristic(this.hap.Characteristic.StatusLowBattery)
      .onGet(() => {
        return this.Battery.StatusLowBattery;
      });

    // Initialize Temperature Sensor Service
    if (device.meter?.hide_temperature) {
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
        CurrentTemperature: accessory.context.CurrentTemperature ?? 30,
      };
      accessory.context.TemperatureSensor = this.TemperatureSensor as object;

      // Initialize Temperature Sensor Characteristics
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
          return this.TemperatureSensor!.CurrentTemperature!;
        });
    }
    // Initialize Humidity Sensor Service
    if (device.meter?.hide_humidity) {
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
        CurrentRelativeHumidity: accessory.context.CurrentRelativeHumidity ?? 50,
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
          return this.HumiditySensor!.CurrentRelativeHumidity!;
        });
    }

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.meterUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    //regisiter webhook event handler
    this.registerWebhook(accessory, device);
  }

  async BLEparseStatus(serviceData: serviceData): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);

    // Battery
    this.Battery.BatteryLevel = Number(serviceData.battery);
    if (this.Battery.BatteryLevel < 15) {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.debugLog(`${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel}, StatusLowBattery: ${this.Battery.StatusLowBattery}`);

    // Humidity
    if (!this.device.meter?.hide_humidity) {
      this.HumiditySensor!.CurrentRelativeHumidity = serviceData.humidity!;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Humidity: ${this.HumiditySensor!.CurrentRelativeHumidity}%`);
    }

    // Current Temperature
    if (!this.device.meter?.hide_temperature) {
      const celcius = serviceData.temperature!.c < 0 ? 0 : serviceData.temperature!.c > 100 ? 100 : serviceData.temperature!.c;
      this.TemperatureSensor!.CurrentTemperature = celcius;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Temperature: ${this.TemperatureSensor!.CurrentTemperature}°c`);
    }
  }

  async openAPIparseStatus(deviceStatus: deviceStatus): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);

    // BatteryLevel
    this.Battery.BatteryLevel = Number(deviceStatus.body.battery);
    if (this.Battery.BatteryLevel < 10) {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    if (Number.isNaN(this.Battery.BatteryLevel)) {
      this.Battery.BatteryLevel = 100;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel},`
      + ` StatusLowBattery: ${this.Battery.StatusLowBattery}`);

    // CurrentRelativeHumidity
    if (!this.device.meter?.hide_humidity) {
      this.HumiditySensor!.CurrentRelativeHumidity = deviceStatus.body.humidity!;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Humidity: ${this.HumiditySensor!.CurrentRelativeHumidity}%`);
    }

    // CurrentTemperature
    if (!this.device.meter?.hide_temperature) {
      this.TemperatureSensor!.CurrentTemperature = deviceStatus.body.temperature!;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Temperature: ${this.TemperatureSensor!.CurrentTemperature}°c`);
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
      this.apiError(e);
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIRefreshStatus with ${this.device.connectionType}`
        + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
    }
  }

  async registerWebhook(accessory: PlatformAccessory, device: device & devicesConfig) {
    if (device.webhook) {
      this.debugLog(`${device.deviceType}: ${accessory.displayName} is listening webhook.`);
      this.platform.webhookEventHandler[device.deviceId] = async (context) => {
        try {
          this.debugLog(`${device.deviceType}: ${accessory.displayName} received Webhook: ${JSON.stringify(context)}`);
          if (context.scale === 'CELSIUS') {
            const { temperature, humidity } = context;
            const { CurrentRelativeHumidity } = this.HumiditySensor ?? { CurrentRelativeHumidity: undefined };
            const { CurrentTemperature } = this.TemperatureSensor ?? { CurrentTemperature: undefined };
            this.debugLog(`${device.deviceType}: ${accessory.displayName} (temperature, humidity) = Webhook:(${temperature}, ${humidity}), `
              + `current:(${CurrentTemperature}, ${CurrentRelativeHumidity})`);
            if (!device.meter?.hide_humidity) {
              this.HumiditySensor!.CurrentRelativeHumidity = humidity;
            }
            if (!device.meter?.hide_temperature) {
              this.TemperatureSensor!.CurrentTemperature = temperature;
            }
            this.updateHomeKitCharacteristics();
          }
        } catch (e: any) {
          this.errorLog(`${device.deviceType}: ${accessory.displayName} failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`);
        }
      };
    } else {
      this.debugLog(`${device.deviceType}: ${accessory.displayName} is not listening webhook.`);
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    const mqttmessage: string[] = [];
    const entry = { time: Math.round(new Date().valueOf() / 1000) };

    // CurrentRelativeHumidity
    if (!this.device.meter?.hide_humidity) {
      if (this.HumiditySensor!.CurrentRelativeHumidity === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
          + ` CurrentRelativeHumidity: ${this.HumiditySensor!.CurrentRelativeHumidity}`);
      } else {
        this.accessory.context.CurrentRelativeHumidity = this.HumiditySensor!.CurrentRelativeHumidity;
        this.HumiditySensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity,
          this.HumiditySensor!.CurrentRelativeHumidity);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
          + ` updateCharacteristic CurrentRelativeHumidity: ${this.HumiditySensor!.CurrentRelativeHumidity}`);
        if (this.device.mqttURL) {
          mqttmessage.push(`"humidity": ${this.HumiditySensor!.CurrentRelativeHumidity}`);
        }
        if (this.device.history) {
          entry['humidity'] = this.HumiditySensor!.CurrentRelativeHumidity;
        }
      }
    }

    // CurrentTemperature
    if (!this.device.meter?.hide_temperature) {
      if (this.TemperatureSensor!.CurrentTemperature === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentTemperature: ${this.TemperatureSensor!.CurrentTemperature}`);
      } else {
        this.accessory.context.CurrentTemperature = this.TemperatureSensor!.CurrentTemperature;
        this.TemperatureSensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, this.TemperatureSensor!.CurrentTemperature);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
          + ` CurrentTemperature: ${this.TemperatureSensor!.CurrentTemperature}`);
        if (this.device.mqttURL) {
          mqttmessage.push(`"temperature": ${this.TemperatureSensor!.CurrentTemperature}`);
        }
        if (this.device.history) {
          entry['temp'] = this.TemperatureSensor!.CurrentTemperature;
        }
      }
    }

    // BatteryLevel
    if (this.Battery.BatteryLevel === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel}`);
    } else {
      this.accessory.context.BatteryLevel = this.Battery.BatteryLevel;
      this.Battery!.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, this.Battery.BatteryLevel);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.Battery.BatteryLevel}`);
      if (this.device.mqttURL) {
        mqttmessage.push(`"battery": ${this.Battery.BatteryLevel}`);
      }
    }
    // StatusLowBattery
    if (this.Battery.StatusLowBattery === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatusLowBattery: ${this.Battery.StatusLowBattery}`);
    } else {
      this.accessory.context.StatusLowBattery = this.Battery.StatusLowBattery;
      this.Battery!.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, this.Battery.StatusLowBattery);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` StatusLowBattery: ${this.Battery.StatusLowBattery}`);
      if (this.device.mqttURL) {
        mqttmessage.push(`"lowBattery": ${this.Battery.StatusLowBattery}`);
      }
    }

    // MQTT Publish
    if (this.device.mqttURL) {
      this.mqttPublish(`{${mqttmessage.join(',')}}`);
    }

    // History Service
    if (!this.device.meter?.hide_humidity && (Number(this.HumiditySensor!.CurrentRelativeHumidity) > 0)) {
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
      if (!this.device.meter?.hide_humidity) {
        this.HumiditySensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity, 50);
      }
      if (!this.device.meter?.hide_temperature) {
        this.TemperatureSensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, 30);
      }
      this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, 100);
    }
  }

  async apiError(e: any): Promise<void> {
    if (!this.device.meter?.hide_humidity) {
      this.HumiditySensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity, e);
    }
    if (!this.device.meter?.hide_temperature) {
      this.TemperatureSensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, e);
    }
    this.Battery!.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e);
    this.Battery!.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e);
  }
}
