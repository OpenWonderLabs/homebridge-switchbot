import { interval, Subject } from 'rxjs';
import { skipWhile } from 'rxjs/operators';
import { SwitchBotPlatform } from '../platform';
import { Service, PlatformAccessory, Units, CharacteristicValue } from 'homebridge';
import { DeviceURL, device, devicesConfig, serviceData, ad, switchbot, deviceStatusResponse, temperature } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Meter {
  // Services
  private service: Service;
  temperatureservice?: Service;
  humidityservice?: Service;

  // Characteristic Values
  CurrentRelativeHumidity!: CharacteristicValue;
  CurrentRelativeHumidityCached!: CharacteristicValue;
  CurrentTemperature!: CharacteristicValue;
  CurrentTemperatureCached!: CharacteristicValue;
  BatteryLevel!: CharacteristicValue;
  BatteryLevelCached!: CharacteristicValue;
  ChargingState!: CharacteristicValue;
  StatusLowBattery!: CharacteristicValue;
  Active!: CharacteristicValue;
  WaterLevel!: CharacteristicValue;

  // OpenAPI Others
  deviceStatus!: deviceStatusResponse;

  // BLE Others
  connected?: boolean;
  switchbot!: switchbot;
  serviceData!: serviceData;
  temperature!: temperature['c'];
  battery!: serviceData['battery'];
  humidity!: serviceData['humidity'];

  // Config
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;

  // Updates
  meterUpdateInProgress!: boolean;
  doMeterUpdate: Subject<void>;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device & devicesConfig,
  ) {
    // default placeholders
    this.logs();
    this.scan();
    this.refreshRate();
    if (this.BatteryLevel === undefined) {
      this.BatteryLevel = 100;
    } else {
      this.BatteryLevel = this.accessory.context.BatteryLevel;
    }
    if (this.BatteryLevel < 15) {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.ChargingState = this.platform.Characteristic.ChargingState.NOT_CHARGEABLE;
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

    // Meter Config
    this.debugLog(`Meter: ${this.accessory.displayName} Config: (ble: ${device.ble}, hide_temperature: ${device.meter?.hide_temperature},`
      + ` hide_humidity: ${device.meter?.hide_humidity})`);

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doMeterUpdate = new Subject();
    this.meterUpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'SWITCHBOT-METERTH-S1')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!);

    // get the Battery service if it exists, otherwise create a new Battery service
    // you can create multiple services for each accessory
    (this.service =
      accessory.getService(this.platform.Service.Battery) ||
      accessory.addService(this.platform.Service.Battery)), `${accessory.displayName} Battery`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Battery, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Battery

    // create handlers for required characteristics
    this.service.setCharacteristic(this.platform.Characteristic.ChargingState, 2);

    // Temperature Sensor Service
    if (device.meter?.hide_temperature) {
      this.debugLog(`Meter: ${accessory.displayName} Removing Temperature Sensor Service`);
      this.temperatureservice = this.accessory.getService(this.platform.Service.TemperatureSensor);
      accessory.removeService(this.temperatureservice!);
    } else if (!this.temperatureservice) {
      this.debugLog(`Meter: ${accessory.displayName} Add Temperature Sensor Service`);
      (this.temperatureservice =
        this.accessory.getService(this.platform.Service.TemperatureSensor) ||
        this.accessory.addService(this.platform.Service.TemperatureSensor)), `${accessory.displayName} Temperature Sensor`;

      this.service.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Temperature Sensor`);

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
          return this.CurrentTemperature;
        });
    } else {
      this.debugLog(`Meter: ${accessory.displayName} Temperature Sensor Service Not Added`);
    }

    // Humidity Sensor Service
    if (device.meter?.hide_humidity) {
      this.debugLog(`Meter: ${accessory.displayName} Removing Humidity Sensor Service`);
      this.humidityservice = this.accessory.getService(this.platform.Service.HumiditySensor);
      accessory.removeService(this.humidityservice!);
    } else if (!this.humidityservice) {
      this.debugLog(`Meter: ${accessory.displayName} Add Humidity Sensor Service`);
      (this.humidityservice =
        this.accessory.getService(this.platform.Service.HumiditySensor) ||
        this.accessory.addService(this.platform.Service.HumiditySensor)), `${accessory.displayName} Humidity Sensor`;

      this.service.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Humidity Sensor`);

      this.humidityservice
        .getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .setProps({
          minStep: 0.1,
        })
        .onGet(() => {
          return this.CurrentRelativeHumidity;
        });
    } else {
      this.debugLog(`Meter: ${accessory.displayName} Humidity Sensor Service Not Added`);
    }

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.meterUpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });
  }

  refreshRate() {
    if (this.device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.device.refreshRate;
      if (this.platform.debugMode || (this.deviceLogging === 'debug')) {
        this.warnLog(`Meter: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
      }
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options!.refreshRate;
      if (this.platform.debugMode || (this.deviceLogging === 'debug')) {
        this.warnLog(`Meter: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
      }
    }
  }

  scan() {
    if (this.device.scanDuration) {
      this.scanDuration = this.accessory.context.scanDuration = this.device.scanDuration;
      if (this.platform.debugMode || (this.deviceLogging === 'debug')) {
        this.warnLog(`Bot: ${this.accessory.displayName} Using Device Config scanDuration: ${this.scanDuration}`);
      }
    } else {
      this.scanDuration = this.accessory.context.scanDuration = 1;
      if (this.platform.debugMode || (this.deviceLogging === 'debug')) {
        this.warnLog(`Bot: ${this.accessory.displayName} Using Default scanDuration: ${this.scanDuration}`);
      }
    }
  }

  logs() {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debug';
      this.warnLog(`Meter: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (this.device.logging) {
      this.deviceLogging = this.accessory.context.logging = this.device.logging;
      if (this.deviceLogging === 'debug' || this.deviceLogging === 'standard') {
        this.warnLog(`Meter: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
      }
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      if (this.deviceLogging === 'debug' || this.deviceLogging === 'standard') {
        this.warnLog(`Meter: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
      }
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
    }
  }

  /**
   * Parse the device status from the SwitchBot api
   */
  async parseStatus() {
    if (this.device.ble) {
      await this.BLEparseStatus();
    } else {
      await this.openAPIparseStatus();
    }
  }

  private async BLEparseStatus() {
    this.debugLog(`Meter: ${this.accessory.displayName} BLE parseStatus`);

    // Battery
    this.BatteryLevel = Number(this.battery);
    if (this.BatteryLevel < 15) {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.debugLog(`${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}, StatusLowBattery: ${this.StatusLowBattery}`);

    if (!this.device.meter?.hide_humidity) {
      // Humidity
      this.CurrentRelativeHumidity = Number(this.humidity);
      this.debugLog(`Meter: ${this.accessory.displayName} Humidity: ${this.CurrentRelativeHumidity}%`);
    }

    // Current Temperature
    if (!this.device.meter?.hide_temperature) {
      this.temperature < 0 ? 0 : this.temperature > 100 ? 100 : this.temperature;
      this.CurrentTemperature = this.temperature;
      this.debugLog(`Meter: ${this.accessory.displayName} Temperature: ${this.CurrentTemperature}°c`);
    }
  }

  private async openAPIparseStatus() {
    if (this.platform.config.credentials?.openToken) {
      this.debugLog(`Meter: ${this.accessory.displayName} OpenAPI parseStatus`);
      if (this.deviceStatus.body) {
        this.BatteryLevel = 100;
      } else {
        this.BatteryLevel = 10;
      }
      if (this.BatteryLevel < 15) {
        this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
      } else {
        this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
      }
      // Current Relative Humidity
      if (!this.device.meter?.hide_humidity) {
        this.CurrentRelativeHumidity = this.deviceStatus.body.humidity!;
        this.debugLog(`Meter: ${this.accessory.displayName} Humidity: ${this.CurrentRelativeHumidity}%`);
      }

      // Current Temperature
      if (!this.device.meter?.hide_temperature) {
        this.CurrentTemperature = Number(this.deviceStatus.body.temperature);
        this.debugLog(`Meter: ${this.accessory.displayName} Temperature: ${this.CurrentTemperature}°c`);
      }
    }
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus() {
    if (this.device.ble) {
      this.BLErefreshStatus();
    } else {
      this.openAPIRefreshStatus();
    }
  }

  private connectBLE() {
    // Convert to BLE Address
    this.device.bleMac = ((this.device.deviceId!.match(/.{1,2}/g))!.join(':')).toLowerCase();
    this.debugLog(`Bot: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    const switchbot = this.platform.connectBLE();
    return switchbot;
  }


  private BLErefreshStatus() {
    this.debugLog(`Meter: ${this.accessory.displayName} BLE RefreshStatus`);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const switchbot = this.connectBLE();
    // Start to monitor advertisement packets
    switchbot.startScan({
      model: 'T',
      id: this.device.bleMac,
    }).then(() => {
      // Set an event hander
      switchbot.onadvertisement = (ad: ad) => {
        this.serviceData = ad.serviceData;
        this.temperature = ad.serviceData.temperature!.c;
        this.humidity = ad.serviceData.humidity;
        this.battery = ad.serviceData.battery;
        this.debugLog(`Meter: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        this.debugLog(`Meter: ${this.accessory.displayName} model: ${ad.serviceData.model}, modelName: ${ad.serviceData.modelName}, `
          + `temperature: ${JSON.stringify(ad.serviceData.temperature?.c)}, humidity: ${ad.serviceData.humidity}, `
          + `battery: ${ad.serviceData.battery}`);

        if (this.serviceData) {
          this.connected = true;
          this.debugLog(`Meter: ${this.accessory.displayName} connected: ${this.connected}`);
        } else {
          this.connected = false;
          this.debugLog(`Meter: ${this.accessory.displayName} connected: ${this.connected}`);
        }
      };
      // Wait 10 seconds
      return switchbot.wait(this.scanDuration * 1000);
    }).then(async () => {
      // Stop to monitor
      switchbot.stopScan();
      if (this.connected) {
        this.CurrentTemperatureCached = this.temperature;
        this.accessory.context.CurrentTemperature = this.CurrentTemperatureCached;
        this.CurrentRelativeHumidityCached = this.humidity!;
        this.accessory.context.CurrentRelativeHumidity = this.CurrentRelativeHumidityCached;
        this.BatteryLevelCached = this.battery!;
        this.accessory.context.BatteryLevel = this.BatteryLevelCached;
        this.parseStatus();
        this.updateHomeKitCharacteristics();
      } else {
        this.errorLog(`Meter: ${this.accessory.displayName} wasn't able to establish BLE Connection`);
        if (this.platform.config.credentials?.openToken) {
          this.warnLog(`Meter: ${this.accessory.displayName} Using OpenAPI Connection`);
          this.openAPIRefreshStatus();
        }
      }
    }).catch(async (e: any) => {
      this.errorLog(`Meter: ${this.accessory.displayName} failed refreshStatus with BLE Connection`);
      if (this.deviceLogging === 'debug') {
        this.errorLog(`Meter: ${this.accessory.displayName} failed refreshStatus with BLE Connection,`
          + ` Error Message: ${JSON.stringify(e.message)}`);
      }
      if (this.platform.debugMode) {
        this.errorLog(`Meter: ${this.accessory.displayName} failed refreshStatus with BLE Connection,`
          + ` Error: ${JSON.stringify(e)}`);
      }
      if (this.platform.config.credentials?.openToken) {
        this.warnLog(`Meter: ${this.accessory.displayName} Using OpenAPI Connection`);
        this.openAPIRefreshStatus();
      }
      this.apiError(e);
    });
  }

  private async openAPIRefreshStatus() {
    if (this.platform.config.credentials?.openToken) {
      this.debugLog(`Meter: ${this.accessory.displayName} OpenAPI RefreshStatus`);
      try {
        this.deviceStatus = (await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)).data;
        this.debugLog(`Meter: ${this.accessory.displayName} openAPIRefreshStatus: ${JSON.stringify(this.deviceStatus)}`);
        this.CurrentTemperatureCached = this.deviceStatus.body.humidity!;
        this.accessory.context.CurrentTemperature = this.CurrentTemperatureCached;
        this.CurrentRelativeHumidityCached = this.deviceStatus.body.humidity!;
        this.accessory.context.CurrentRelativeHumidity = this.CurrentRelativeHumidityCached;
        this.BatteryLevelCached = 100;
        this.accessory.context.BatteryLevel = this.BatteryLevelCached;
        this.parseStatus();
        this.updateHomeKitCharacteristics();
      } catch (e: any) {
        this.errorLog(`Meter: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection`);
        if (this.deviceLogging === 'debug') {
          this.errorLog(`Meter: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,`
            + ` Error Message: ${JSON.stringify(e.message)}`);
        }
        if (this.platform.debugMode) {
          this.errorLog(`Meter: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,`
            + ` Error: ${JSON.stringify(e)}`);
        }
        this.apiError(e);
      }
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    if (this.StatusLowBattery === undefined) {
      this.debugLog(`Meter: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
      this.debugLog(`Meter: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
    }
    if (this.BatteryLevel === undefined) {
      this.debugLog(`Meter: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
      this.debugLog(`Meter: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
    }
    if (!this.device.meter?.hide_humidity) {
      if (this.CurrentRelativeHumidity === undefined) {
        this.debugLog(`Meter: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
      } else {
        this.humidityservice?.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
        this.debugLog(`Meter: ${this.accessory.displayName} updateCharacteristic CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
      }
    }
    if (!this.device.meter?.hide_temperature) {
      if (this.CurrentTemperature === undefined) {
        this.debugLog(`Meter: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
      } else {
        this.temperatureservice?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
        this.debugLog(`Meter: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`);
      }
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, e);
    this.service.updateCharacteristic(this.platform.Characteristic.BatteryLevel, e);
    if (!this.device.meter?.hide_humidity) {
      this.humidityservice?.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, e);
    }
    if (!this.device.meter?.hide_temperature) {
      this.temperatureservice?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, e);
    }
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  /**
 * Logging for Device
 */
  infoLog(...log: any[]) {
    if (this.enablingDeviceLogging()) {
      this.platform.log.info(String(...log));
    }
  }

  warnLog(...log: any[]) {
    if (this.enablingDeviceLogging()) {
      this.platform.log.warn(String(...log));
    }
  }

  errorLog(...log: any[]) {
    if (this.enablingDeviceLogging()) {
      this.platform.log.error(String(...log));
    }
  }

  debugLog(...log: any[]) {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging === 'debug') {
        this.platform.log.info('[DEBUG]', String(...log));
      } else {
        this.platform.log.debug(String(...log));
      }
    }
  }

  enablingDeviceLogging(): boolean {
    return this.deviceLogging === 'debug' || this.deviceLogging === 'standard';
  }
}
