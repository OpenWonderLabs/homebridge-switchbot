import https from 'https';
import crypto from 'crypto';
import { Context } from 'vm';
import { hostname } from 'os';
import { MqttClient } from 'mqtt';
import { connectAsync } from 'async-mqtt';
import { interval, Subject } from 'rxjs';
import { skipWhile } from 'rxjs/operators';
import superStringify from 'super-stringify';
import { SwitchBotPlatform } from '../platform';
import { Service, PlatformAccessory, Units, CharacteristicValue } from 'homebridge';
import { device, devicesConfig, serviceData, ad, switchbot, temperature, deviceStatus, HostDomain, DevicePath } from '../settings';
import { IncomingMessage } from 'http';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Meter {
  // Services
  batteryService?: Service;
  temperatureservice?: Service;
  humidityservice?: Service;

  // Characteristic Values
  CurrentRelativeHumidity!: CharacteristicValue;
  CurrentTemperature?: CharacteristicValue;
  BatteryLevel?: CharacteristicValue;
  ChargingState?: CharacteristicValue;
  StatusLowBattery?: CharacteristicValue;

  // OpenAPI Others
  Temperature: deviceStatus['temperature'];
  Humidity: deviceStatus['humidity'];
  deviceStatus!: any; //deviceStatusResponse;

  // BLE Others
  connected?: boolean;
  switchbot!: switchbot;
  serviceData!: serviceData;
  address!: ad['address'];
  temperature!: serviceData['temperature'];
  celsius!: temperature['c'];
  fahrenheit!: temperature['f'];
  battery!: serviceData['battery'];
  humidity!: serviceData['humidity'];

  //MQTT stuff
  mqttClient: MqttClient | null = null;

  // EVE history service handler
  historyService?: any;

  // Config
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;

  // Updates
  meterUpdateInProgress!: boolean;
  doMeterUpdate: Subject<void>;

  // Connection
  private readonly BLE = (this.device.connectionType === 'BLE' || this.device.connectionType === 'BLE/OpenAPI');
  private readonly OpenAPI = (this.device.connectionType === 'OpenAPI' || this.device.connectionType === 'BLE/OpenAPI');

  constructor(private readonly platform: SwitchBotPlatform, private accessory: PlatformAccessory, public device: device & devicesConfig) {
    // default placeholders
    this.logs(device);
    this.scan(device);
    this.refreshRate(device);
    this.config(device);
    this.context();
    this.setupHistoryService(device);
    this.setupMqtt(device);

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doMeterUpdate = new Subject();
    this.meterUpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'METERTH-S1')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision(accessory, device))
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
      .updateValue(this.FirmwareRevision(accessory, device));

    // Temperature Sensor Service
    if (device.meter?.hide_temperature) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Temperature Sensor Service`);
      this.temperatureservice = this.accessory.getService(this.platform.Service.TemperatureSensor);
      accessory.removeService(this.temperatureservice!);
    } else if (!this.temperatureservice) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Temperature Sensor Service`);
      (this.temperatureservice =
        this.accessory.getService(this.platform.Service.TemperatureSensor) || this.accessory.addService(this.platform.Service.TemperatureSensor)),
      `${accessory.displayName} Temperature Sensor`;

      this.temperatureservice.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Temperature Sensor`);

      this.temperatureservice
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
    if (device.meter?.hide_humidity) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Humidity Sensor Service`);
      this.humidityservice = this.accessory.getService(this.platform.Service.HumiditySensor);
      accessory.removeService(this.humidityservice!);
    } else if (!this.humidityservice) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Humidity Sensor Service`);
      (this.humidityservice =
        this.accessory.getService(this.platform.Service.HumiditySensor) || this.accessory.addService(this.platform.Service.HumiditySensor)),
      `${accessory.displayName} Humidity Sensor`;

      this.humidityservice.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Humidity Sensor`);

      this.humidityservice
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

    // Battery Service
    if (!this.BLE) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Battery Service`);
      this.batteryService = this.accessory.getService(this.platform.Service.Battery);
      accessory.removeService(this.batteryService!);
    } else if (this.BLE && !this.batteryService) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Battery Service`);
      (this.batteryService = this.accessory.getService(this.platform.Service.Battery) || this.accessory.addService(this.platform.Service.Battery)),
      `${accessory.displayName} Battery`;

      this.batteryService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Battery`);

      this.batteryService.setCharacteristic(this.platform.Characteristic.ChargingState, this.platform.Characteristic.ChargingState.NOT_CHARGEABLE);
    } else {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Battery Service Not Added`);
    }

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.meterUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });
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
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:`
      + ` ${this.device.connectionType}, parseStatus will not happen.`);
    }
  }

  async BLEparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);

    // Battery
    this.BatteryLevel = Number(this.battery);
    if (this.BatteryLevel < 15) {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.debugLog(`${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}, StatusLowBattery: ${this.StatusLowBattery}`);

    // Humidity
    if (!this.device.meter?.hide_humidity) {
      this.CurrentRelativeHumidity = this.humidity!;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Humidity: ${this.CurrentRelativeHumidity}%`);
    }

    // Current Temperature
    if (!this.device.meter?.hide_temperature) {
      this.celsius < 0 ? 0 : this.celsius > 100 ? 100 : this.temperature;
      this.CurrentTemperature = this.temperature;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Temperature: ${this.CurrentTemperature}°c`);
    }
  }

  async openAPIparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
    // Current Relative Humidity
    if (!this.device.meter?.hide_humidity) {
      this.CurrentRelativeHumidity = this.Humidity!;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Humidity: ${this.CurrentRelativeHumidity}%`);
    }

    // Current Temperature
    if (!this.device.meter?.hide_temperature) {
      this.CurrentTemperature = this.Temperature!;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Temperature: ${this.CurrentTemperature}°c`);
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
    const switchbot = await this.platform.connectBLE();
    // Convert to BLE Address
    this.device.bleMac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(':')
      .toLowerCase();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    this.getCustomBLEAddress(switchbot);
    // Start to monitor advertisement packets
    if (switchbot !== false) {
      switchbot
        .startScan({
          model: 'T',
          id: this.device.bleMac,
        })
        .then(async () => {
          // Set an event hander
          switchbot.onadvertisement = async (ad: ad) => {
            this.address = ad.address;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac},`
            + ` BLE Address Found: ${this.address}`);
            if (ad.serviceData.humidity! > 0) {
              // reject unreliable data
              this.humidity = ad.serviceData.humidity;
            }
            this.serviceData = ad.serviceData;
            this.temperature = ad.serviceData.temperature;
            this.celsius = ad.serviceData.temperature!.c;
            this.fahrenheit = ad.serviceData.temperature!.f;
            this.battery = ad.serviceData.battery;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${superStringify(ad.serviceData)}`);
            this.debugLog(
              `${this.device.deviceType}: ${this.accessory.displayName} model: ${ad.serviceData.model}, modelName: ${ad.serviceData.modelName}, ` +
                `temperature: ${superStringify(ad.serviceData.temperature?.c)}, humidity: ${ad.serviceData.humidity}, ` +
                `battery: ${ad.serviceData.battery}`,
            );

            if (this.serviceData) {
              this.connected = true;
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.connected}`);
              await this.stopScanning(switchbot);
            } else {
              this.connected = false;
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.connected}`);
            }
          };
          // Wait
          return await switchbot.wait(this.scanDuration * 1000);
        })
        .then(async () => {
          // Stop to monitor
          await this.stopScanning(switchbot);
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLERefreshStatus with ${this.device.connectionType}`
                + ` Connection, Error Message: ${superStringify(e.message)}`);
          await this.BLERefreshConnection(switchbot);
        });
    } else {
      await this.BLERefreshConnection(switchbot);
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const t = Date.now();
      const nonce = 'requestID';
      const data = this.platform.config.credentials?.token + t + nonce;
      const signTerm = crypto.createHmac('sha256', this.platform.config.credentials?.secret).update(Buffer.from(data, 'utf-8')).digest();
      const sign = signTerm.toString('base64');
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} sign: ${sign}`);
      const options = {
        hostname: HostDomain,
        port: 443,
        path: `${DevicePath}/${this.device.deviceId}/status`,
        method: 'GET',
        headers: {
          Authorization: this.platform.config.credentials?.token,
          sign: sign,
          nonce: nonce,
          t: t,
          'Content-Type': 'application/json',
        },
      };
      const req = https.request(options, (res) => {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus statusCode: ${res.statusCode}`);
        let rawData = '';
        res.on('data', (d) => {
          rawData += d;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} d: ${d}`);
        });
        res.on('end', () => {
          try {
            this.deviceStatus = JSON.parse(rawData);
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus: ${superStringify(this.deviceStatus)}`);
            this.Humidity = this.deviceStatus.body.humidity!;
            this.Temperature = this.deviceStatus.body.temperature!;
            this.openAPIparseStatus();
            this.updateHomeKitCharacteristics();
          } catch (e: any) {
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} error message: ${e.message}`);
          }
        });
      });
      req.on('error', (e: any) => {
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} error message: ${e.message}`);
      });
      req.end();
    } catch (e: any) {
      this.apiError(e);
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIRefreshStatus with ${this.device.connectionType}`
            + ` Connection, Error Message: ${superStringify(e.message)}`);
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    const mqttmessage: string[] = [];
    const entry = { time: Math.round(new Date().valueOf() / 1000) };
    if (!this.device.meter?.hide_humidity) {
      if (this.CurrentRelativeHumidity === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
      } else {
        this.accessory.context.CurrentRelativeHumidity = this.CurrentRelativeHumidity;
        this.humidityservice?.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
        if (this.device.mqttURL) {
          mqttmessage.push(`"humidity": ${this.CurrentRelativeHumidity}`);
        }
        if (this.device.history) {
          entry['humidity'] = this.CurrentRelativeHumidity;
        }
      }
    }
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
        this.temperatureservice?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`);

      }
    }
    if (this.BLE) {
      if (this.BatteryLevel === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
      } else {
        if (this.device.mqttURL) {
          mqttmessage.push(`"battery": ${this.BatteryLevel}`);
        }
        this.accessory.context.BatteryLevel = this.BatteryLevel;
        this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
      }
      if (this.StatusLowBattery === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
      } else {
        if (this.device.mqttURL) {
          mqttmessage.push(`"lowBattery": ${this.StatusLowBattery}`);
        }
        this.accessory.context.StatusLowBattery = this.StatusLowBattery;
        this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
      }
    }
    if (this.device.mqttURL) {
      this.mqttPublish(`{${mqttmessage.join(',')}}`);
    }
    if (this.CurrentRelativeHumidity > 0) {
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
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} MQTT message: ${message} options:${superStringify(options)}`);
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

  async stopScanning(switchbot: any) {
    await switchbot.stopScan();
    if (this.connected) {
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
          this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} ad: ${superStringify(ad, null, '  ')}`);
        };
        await switchbot.wait(10000);
        // Stop to monitor
        switchbot.stopScan();
      })();
    }
  }

  async BLERefreshConnection(switchbot: any): Promise<void> {
    this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`);
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

  async statusCode({ res }: { res: IncomingMessage }): Promise<void> {
    switch (res.statusCode) {
      case 151:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Device is offline.`);
        await this.offlineOff();
        break;
      case 171:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} is offline. Hub: ${this.device.hubDeviceId}`);
        await this.offlineOff();
        break;
      case 190:
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
            ` Or command: ${superStringify(res)} format is invalid`,
        );
        break;
      case 100:
        if (this.platform.debugMode) {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Command successfully sent.`);
        }
        break;
      default:
        if (this.platform.debugMode) {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Unknown statusCode.`);
        }
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      await this.context();
      await this.updateHomeKitCharacteristics();
    }
  }

  async apiError(e: any): Promise<void> {
    if (!this.device.meter?.hide_humidity) {
      this.humidityservice?.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, e);
    }
    if (!this.device.meter?.hide_temperature) {
      this.temperatureservice?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, e);
    }
    if (this.BLE) {
      this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, e);
      this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, e);
    }
  }

  FirmwareRevision(accessory: PlatformAccessory<Context>, device: device & devicesConfig): CharacteristicValue {
    let FirmwareRevision: string;
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
    + ` accessory.context.FirmwareRevision: ${accessory.context.FirmwareRevision}`);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} device.firmware: ${device.firmware}`);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} this.platform.version: ${this.platform.version}`);
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
    if (this.BLE) {
      if (this.BatteryLevel === undefined) {
        this.BatteryLevel = 100;
      } else {
        this.BatteryLevel = this.accessory.context.BatteryLevel;
      }
      if (this.StatusLowBattery === undefined) {
        this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
        this.accessory.context.StatusLowBattery = this.StatusLowBattery;
      } else {
        this.StatusLowBattery = this.accessory.context.StatusLowBattery;
      }
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

  async config(device: device & devicesConfig): Promise<void> {
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
    if (Object.entries(config).length !== 0) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Config: ${superStringify(config)}`);
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
