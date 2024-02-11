import asyncmqtt from 'async-mqtt';
import { CharacteristicValue, PlatformAccessory, Service, Units, API, Logging, HAP } from 'homebridge';
import { MqttClient } from 'mqtt';
import { hostname } from 'os';
import { interval } from 'rxjs';
import { request } from 'undici';
import { SwitchBotPlatform } from '../platform.js';
import { Devices, device, deviceStatus, devicesConfig, serviceData, temperature, SwitchBotPlatformConfig } from '../settings.js';
import { sleep } from '../utils.js';

export class Meter {
  public readonly api: API;
  public readonly log: Logging;
  public readonly config!: SwitchBotPlatformConfig;
  protected readonly hap: HAP;
  // Services
  batteryService: Service;
  humidityService?: Service;
  temperatureService?: Service;

  // Characteristic Values
  BatteryLevel!: CharacteristicValue;
  FirmwareRevision!: CharacteristicValue;
  StatusLowBattery!: CharacteristicValue;
  CurrentTemperature?: CharacteristicValue;
  CurrentRelativeHumidity?: CharacteristicValue;

  // OpenAPI Status
  OpenAPI_BatteryLevel: deviceStatus['battery'];
  OpenAPI_FirmwareRevision: deviceStatus['version'];
  OpenAPI_CurrentTemperature: deviceStatus['temperature'];
  OpenAPI_CurrentRelativeHumidity: deviceStatus['humidity'];

  // BLE Status
  BLE_Celsius!: temperature['c'];
  BLE_Fahrenheit!: temperature['f'];
  BLE_BatteryLevel!: serviceData['battery'];
  BLE_CurrentTemperature!: serviceData['temperature'];
  BLE_CurrentRelativeHumidity!: serviceData['humidity'];

  // BLE Others
  BLE_IsConnected?: boolean;

  //MQTT stuff
  mqttClient: MqttClient | null = null;

  // EVE history service handler
  historyService?: any;

  // Config
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;

  // Connection
  private readonly OpenAPI: boolean;
  private readonly BLE: boolean;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device & devicesConfig,
  ) {
    this.api = this.platform.api;
    this.log = this.platform.log;
    this.config = this.platform.config;
    this.hap = this.api.hap;
    // Connection
    this.BLE = this.device.connectionType === 'BLE' || this.device.connectionType === 'BLE/OpenAPI';
    this.OpenAPI = this.device.connectionType === 'OpenAPI' || this.device.connectionType === 'BLE/OpenAPI';
    // default placeholders
    this.deviceLogs(device);
    this.scan(device);
    this.refreshRate(device);
    this.deviceContext();
    this.setupHistoryService(device);
    this.setupMqtt(device);
    this.deviceConfig(device);

    this.CurrentRelativeHumidity = accessory.context.CurrentRelativeHumidity;
    this.CurrentTemperature = accessory.context.CurrentTemperature;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.hap.Characteristic.Model, 'METERTH-S1')
      .setCharacteristic(this.hap.Characteristic.SerialNumber, device.deviceId)
      .setCharacteristic(this.hap.Characteristic.FirmwareRevision, accessory.context.FirmwareRevision);

    // Temperature Sensor Service
    if (device.meter?.hide_temperature) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Temperature Sensor Service`);
      this.temperatureService = this.accessory.getService(this.hap.Service.TemperatureSensor);
      accessory.removeService(this.temperatureService!);
    } else if (!this.temperatureService) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Temperature Sensor Service`);
      const temperatureService = `${accessory.displayName} Temperature Sensor`;
      (this.temperatureService = this.accessory.getService(this.hap.Service.TemperatureSensor)
        || this.accessory.addService(this.hap.Service.TemperatureSensor)), temperatureService;

      this.temperatureService.setCharacteristic(this.hap.Characteristic.Name, `${accessory.displayName} Temperature Sensor`);
      if (!this.temperatureService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.temperatureService.addCharacteristic(this.hap.Characteristic.ConfiguredName, `${accessory.displayName} Temperature Sensor`);
      }
      this.temperatureService
        .getCharacteristic(this.hap.Characteristic.CurrentTemperature)
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
    if (device.meter?.hide_humidity) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Humidity Sensor Service`);
      this.humidityService = this.accessory.getService(this.hap.Service.HumiditySensor);
      accessory.removeService(this.humidityService!);
    } else if (!this.humidityService) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Humidity Sensor Service`);
      const humidityService = `${accessory.displayName} Humidity Sensor`;
      (this.humidityService = this.accessory.getService(this.hap.Service.HumiditySensor)
        || this.accessory.addService(this.hap.Service.HumiditySensor)), humidityService;

      this.humidityService.setCharacteristic(this.hap.Characteristic.Name, `${accessory.displayName} Humidity Sensor`);
      if (!this.humidityService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.humidityService.addCharacteristic(this.hap.Characteristic.ConfiguredName, `${accessory.displayName} Humidity Sensor`);
      }
      this.humidityService
        .getCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity)
        .setProps({
          minStep: 0.1,
        })
        .onGet(() => {
          return this.CurrentRelativeHumidity!;
        });
    } else {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Humidity Sensor Service Not Added`);
    }

    // Battery Service
    const batteryService = `${accessory.displayName} Battery`;
    (this.batteryService = this.accessory.getService(this.hap.Service.Battery)
      || accessory.addService(this.hap.Service.Battery)), batteryService;

    this.batteryService.setCharacteristic(this.hap.Characteristic.Name, `${accessory.displayName} Battery`);
    if (!this.batteryService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
      this.batteryService.addCharacteristic(this.hap.Characteristic.ConfiguredName, `${accessory.displayName} Battery`);
    }
    this.batteryService.setCharacteristic(this.hap.Characteristic.ChargingState, this.hap.Characteristic.ChargingState.NOT_CHARGEABLE);

    // Retrieve initial values and update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .subscribe(async () => {
        await this.refreshStatus();
      });

    //regisiter webhook event handler
    if (this.device.webhook) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} is listening webhook.`);
      this.platform.webhookEventHandler[this.device.deviceId] = async (context) => {
        try {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} received Webhook: ${JSON.stringify(context)}`);
          if (context.scale === 'CELSIUS') {
            const { temperature, humidity } = context;
            const { CurrentTemperature, CurrentRelativeHumidity } = this;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ` +
              '(temperature, humidity) = ' +
              `Webhook:(${temperature}, ${humidity}), ` +
              `current:(${CurrentTemperature}, ${CurrentRelativeHumidity})`);
            this.CurrentRelativeHumidity = humidity;
            this.CurrentTemperature = temperature;
            this.updateHomeKitCharacteristics();
          }
        } catch (e: any) {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`);
        }
      };
    }
  }

  /**
   * Parse the device status from the SwitchBot api
   */
  async parseStatus(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} parseStatus enableCloudService: ${this.device.enableCloudService}`);
    } else if (this.BLE) {
      await this.BLEparseStatus();
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIparseStatus();
    } else {
      await this.offlineOff();
      this.debugWarnLog(
        `${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` + ` ${this.device.connectionType}, parseStatus will not happen.`,
      );
    }
  }

  async BLEparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);

    // BatteryLevel
    this.BatteryLevel = Number(this.BLE_BatteryLevel);
    if (this.BatteryLevel < 15) {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.debugLog(`${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}, StatusLowBattery: ${this.StatusLowBattery}`);

    // CurrentRelativeHumidity
    if (!this.device.meter?.hide_humidity) {
      this.CurrentRelativeHumidity = this.BLE_CurrentRelativeHumidity!;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Humidity: ${this.CurrentRelativeHumidity}%`);
    }

    // CurrentTemperature
    if (!this.device.meter?.hide_temperature) {
      this.BLE_Celsius < 0 ? 0 : this.BLE_Celsius > 100 ? 100 : this.BLE_Celsius;
      this.CurrentTemperature = this.BLE_Celsius;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Temperature: ${this.CurrentTemperature}°c`);
    }
  }

  async openAPIparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);

    // BatteryLevel
    this.BatteryLevel = Number(this.OpenAPI_BatteryLevel);
    if (this.BatteryLevel < 15) {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.debugLog(`${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}, StatusLowBattery: ${this.StatusLowBattery}`);

    // CurrentRelativeHumidity
    if (!this.device.meter?.hide_humidity) {
      this.CurrentRelativeHumidity = this.OpenAPI_CurrentRelativeHumidity!;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Humidity: ${this.CurrentRelativeHumidity}%`);
    }

    // CurrentTemperature
    if (!this.device.meter?.hide_temperature) {
      this.CurrentTemperature = this.OpenAPI_CurrentTemperature!;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Temperature: ${this.CurrentTemperature}°c`);
    }

    // Battery
    this.BatteryLevel = Number(this.OpenAPI_BatteryLevel);
    if (this.BatteryLevel < 10) {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    if (Number.isNaN(this.BatteryLevel)) {
      this.BatteryLevel = 100;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel},`
      + ` StatusLowBattery: ${this.StatusLowBattery}`);

    // FirmwareRevision
    this.FirmwareRevision = this.OpenAPI_FirmwareRevision!;
    this.accessory.context.FirmwareRevision = this.FirmwareRevision;
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
      this.debugWarnLog(
        `${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` +
        ` ${this.device.connectionType}, refreshStatus will not happen.`,
      );
    }
  }

  async BLERefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLERefreshStatus`);
    const switchbot = await this.platform.connectBLE();
    // Convert to BLE Address
    this.device.bleMac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(':')
      .toLowerCase();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    this.getCustomBLEAddress(switchbot);
    // Start to monitor advertisement packets
    (async () => {
      await switchbot.startScan({
        model: 'T',
        id: this.device.bleMac,
      });
      // Set an event handler
      switchbot.onadvertisement = (ad: any) => {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ${JSON.stringify(ad, null, '  ')}`);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} address: ${ad.address}, model: ${ad.serviceData.model}`);
        if (this.device.bleMac === ad.address && ad.serviceData.model === 'T') {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
          this.BLE_CurrentRelativeHumidity = ad.serviceData.humidity < 0 ? 0 : ad.serviceData.humidity > 100 ? 100 : ad.serviceData.humidity;
          this.BLE_CurrentTemperature = ad.serviceData.temperature;
          this.BLE_Celsius = ad.serviceData.temperature!.c;
          this.BLE_Fahrenheit = ad.serviceData.temperature!.f;
          this.BLE_BatteryLevel = ad.serviceData.battery;
        } else {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        }
      };
      // Wait 1 seconds
      await switchbot.wait(this.scanDuration * 1000);
      // Stop to monitor
      await switchbot.stopScan();
      // Update HomeKit
      await this.BLEparseStatus();
      await this.updateHomeKitCharacteristics();
    })();
    /*if (switchbot !== false) {
      switchbot
        .startScan({
          model: 'T',
          id: this.device.bleMac,
        })
        .then(async () => {
          // Set an event handler
          switchbot.onadvertisement = async (ad: ad) => {
            this.debugLog(
              `${this.device.deviceType}: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac},` +
              ` BLE Address Found: ${ad.address}`,
            );
            if (ad.serviceData.humidity! > 0) {
              // reject unreliable data
              this.BLE_CurrentRelativeHumidity = ad.serviceData.humidity;
            }
            this.BLE_CurrentTemperature = ad.serviceData.temperature;
            this.BLE_Celsius = ad.serviceData.temperature!.c;
            this.BLE_Fahrenheit = ad.serviceData.temperature!.f;
            this.BLE_BatteryLevel = ad.serviceData.battery;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
            this.debugLog(
              `${this.device.deviceType}: ${this.accessory.displayName} model: ${ad.serviceData.model}, modelName: ${ad.serviceData.modelName}, ` +
              `temperature: ${JSON.stringify(ad.serviceData.temperature?.c)}, humidity: ${ad.serviceData.humidity}, ` +
              `battery: ${ad.serviceData.battery}`,
            );

            if (ad.serviceData) {
              this.BLE_IsConnected = true;
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.BLE_IsConnected}`);
              await this.stopScanning(switchbot);
            } else {
              this.BLE_IsConnected = false;
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.BLE_IsConnected}`);
            }
          };
          // Wait
          return await sleep(this.scanDuration * 1000);
        })
        .then(async () => {
          // Stop to monitor
          await this.stopScanning(switchbot);
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed BLERefreshStatus with ${this.device.connectionType}` +
            ` Connection, Error Message: ${JSON.stringify(e.message)}`,
          );
          await this.BLERefreshConnection(switchbot);
        });
    } else {
      await this.BLERefreshConnection(switchbot);
    }*/
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode } = await request(`${Devices}/${this.device.deviceId}/status`, {
        headers: this.platform.generateHeaders(),
      });
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
      const deviceStatus: any = await body.json();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
      if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
        this.debugErrorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
        this.OpenAPI_CurrentRelativeHumidity = deviceStatus.body.humidity!;
        this.OpenAPI_CurrentTemperature = deviceStatus.body.temperature!;
        this.OpenAPI_BatteryLevel = deviceStatus.body.battery;
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
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    const mqttmessage: string[] = [];
    const entry = { time: Math.round(new Date().valueOf() / 1000) };

    // CurrentRelativeHumidity
    if (!this.device.meter?.hide_humidity) {
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
        this.humidityService?.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `updateCharacteristic CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
      }
    }
    // CurrentTemperature
    if (!this.device.meter?.hide_temperature) {
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
        this.temperatureService?.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, this.CurrentTemperature);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`);
      }
    }
    // BatteryLevel
    if (this.BatteryLevel === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
    } else {
      if (this.device.mqttURL) {
        mqttmessage.push(`"battery": ${this.BatteryLevel}`);
      }
      this.accessory.context.BatteryLevel = this.BatteryLevel;
      this.batteryService?.updateCharacteristic(this.hap.Characteristic.BatteryLevel, this.BatteryLevel);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
    }
    if (this.StatusLowBattery === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
    } else {
      if (this.device.mqttURL) {
        mqttmessage.push(`"lowBattery": ${this.StatusLowBattery}`);
      }
      this.accessory.context.StatusLowBattery = this.StatusLowBattery;
      this.batteryService?.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, this.StatusLowBattery);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
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
   * Setup MQTT hadler if URL is specified.
   */
  async setupMqtt(device: device & devicesConfig): Promise<void> {
    if (device.mqttURL) {
      try {
        const { connectAsync } = asyncmqtt;
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

  async stopScanning(switchbot: any) {
    switchbot.stopScan();
    if (this.BLE_IsConnected) {
      await this.BLEparseStatus();
      await this.updateHomeKitCharacteristics();
    } else {
      await this.BLERefreshConnection(switchbot);
    }
  }

  async getCustomBLEAddress(switchbot: any) {
    if (this.device.customBLEaddress && this.deviceLogging.includes('debug')) {
      (async () => {
        // Start to monitor advertisement packets
        await switchbot.startScan({
          model: 'T',
        });
        // Set an event handler
        switchbot.onadvertisement = (ad: any) => {
          this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} ad: ${JSON.stringify(ad, null, '  ')}`);
        };
        await sleep(10000);
        // Stop to monitor
        switchbot.stopScan();
      })();
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

  async scan(device: device & devicesConfig): Promise<void> {
    if (device.scanDuration) {
      this.scanDuration = this.accessory.context.scanDuration = device.scanDuration;
      if (this.BLE) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config scanDuration: ${this.scanDuration}`);
      }
    } else {
      this.scanDuration = this.accessory.context.scanDuration = 1;
      if (this.BLE) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Default scanDuration: ${this.scanDuration}`);
      }
    }
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
        this.infoLog(
          `${this.device.deviceType}: ${this.accessory.displayName} Unknown statusCode: ` +
          `${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`,
        );
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      await this.deviceContext();
      await this.updateHomeKitCharacteristics();
    }
  }

  async apiError(e: any): Promise<void> {
    if (!this.device.meter?.hide_humidity) {
      this.humidityService?.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity, e);
    }
    if (!this.device.meter?.hide_temperature) {
      this.temperatureService?.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, e);
    }
    this.batteryService?.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e);
    this.batteryService?.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e);
  }

  async deviceContext() {
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
    if (this.BatteryLevel === undefined) {
      this.BatteryLevel = 100;
    } else {
      this.BatteryLevel = this.accessory.context.BatteryLevel;
    }
    if (this.StatusLowBattery === undefined) {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
      this.accessory.context.StatusLowBattery = this.StatusLowBattery;
    } else {
      this.StatusLowBattery = this.accessory.context.StatusLowBattery;
    }
    if (this.FirmwareRevision === undefined) {
      this.FirmwareRevision = this.platform.version;
      this.accessory.context.FirmwareRevision = this.FirmwareRevision;
    }
  }

  async refreshRate(device: device & devicesConfig): Promise<void> {
    if (device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = device.refreshRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options!.refreshRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
    }
  }

  async deviceConfig(device: device & devicesConfig): Promise<void> {
    let config = {};
    if (device.meter) {
      config = device.meter;
    }
    if (device.connectionType !== undefined) {
      config['connectionType'] = device.connectionType;
    }
    if (device.external !== undefined) {
      config['external'] = device.external;
    }
    if (device.mqttURL !== undefined) {
      config['mqttURL'] = device.mqttURL;
    }
    if (device.logging !== undefined) {
      config['logging'] = device.logging;
    }
    if (device.refreshRate !== undefined) {
      config['refreshRate'] = device.refreshRate;
    }
    if (device.scanDuration !== undefined) {
      config['scanDuration'] = device.scanDuration;
    }
    if (device.webhook !== undefined) {
      config['webhook'] = device.webhook;
    }
    if (Object.entries(config).length !== 0) {
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  async deviceLogs(device: device & devicesConfig): Promise<void> {
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
