import Switchbot from 'node-switchbot';
import { interval, Subject } from 'rxjs';
import { skipWhile } from 'rxjs/operators';
import { SwitchBotPlatform } from '../platform';
import { Service, PlatformAccessory, Units, CharacteristicValue } from 'homebridge';
import { DeviceURL, device, devicesConfig, serviceData, ad, switchbot, deviceStatusResponse } from '../settings';

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
  CurrentTemperature!: CharacteristicValue;
  BatteryLevel!: CharacteristicValue;
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
  battery!: serviceData['battery'];
  humidity!: serviceData['humidity'];
  fahrenheit!: serviceData['fahrenheit'];
  temperature!: serviceData['temperature'];

  // Config
  private readonly deviceDebug = this.platform.config.options?.debug === 'device' || this.platform.debugMode;
  private readonly debugDebug = this.platform.config.options?.debug === 'debug' || this.platform.debugMode;

  // Updates
  meterUpdateInProgress!: boolean;
  doMeterUpdate: Subject<void>;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device & devicesConfig,
  ) {
    // Meter Config
    this.platform.device(`Meter: ${this.accessory.displayName} Config: (ble: ${device.ble}, unit: ${device.meter?.unit},`
      + ` hide_temperature: ${device.meter?.hide_temperature}, hide_humidity: ${device.meter?.hide_humidity})`);

    // default placeholders
    this.BatteryLevel = 0;
    this.ChargingState = 2;
    this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    this.CurrentRelativeHumidity = 0;
    this.CurrentTemperature = 0;

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
      this.platform.device(`Meter: ${accessory.displayName} Removing Temperature Sensor Service`);
      this.temperatureservice = this.accessory.getService(this.platform.Service.TemperatureSensor);
      accessory.removeService(this.temperatureservice!);
    } else if (!this.temperatureservice) {
      this.platform.device(`Meter: ${accessory.displayName} Add Temperature Sensor Service`);
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
      this.platform.device(`Meter: ${accessory.displayName} Temperature Sensor Service Not Added`);
    }

    // Humidity Sensor Service
    if (device.meter?.hide_humidity) {
      this.platform.device(`Meter: ${accessory.displayName} Removing Humidity Sensor Service`);
      this.humidityservice = this.accessory.getService(this.platform.Service.HumiditySensor);
      accessory.removeService(this.humidityservice!);
    } else if (!this.humidityservice) {
      this.platform.device(`Meter: ${accessory.displayName} Add Humidity Sensor Service`);
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
      this.platform.device(`Meter: ${accessory.displayName} Humidity Sensor Service Not Added`);
    }

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.platform.config.options!.refreshRate! * 1000)
      .pipe(skipWhile(() => this.meterUpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });
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
    this.platform.debug(`Meter: ${this.accessory.displayName} BLE parseStatus`);

    // Battery
    this.BatteryLevel = Number(this.battery);
    if (this.BatteryLevel < 15) {
      this.StatusLowBattery = 1;
    } else {
      this.StatusLowBattery = 0;
    }
    this.platform.debug(`${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}, StatusLowBattery: ${this.StatusLowBattery}`);

    if (!this.device.meter?.hide_humidity) {
      // Humidity
      this.CurrentRelativeHumidity = Number(this.humidity);
      this.platform.debug(`Meter: ${this.accessory.displayName} Humidity: ${this.CurrentRelativeHumidity}%`);
    }

    // Current Temperature
    if (!this.device.meter?.hide_temperature) {
      if (this.device.meter?.unit === 1) {
        this.CurrentTemperature = this.toFahrenheit(this.temperature!.c);
      } else if (this.device.meter?.unit === 0) {
        this.CurrentTemperature = this.toCelsius(this.temperature!.c);
      } else {
        this.CurrentTemperature = Number(this.temperature?.c);
      }
      this.platform.debug(`Meter: ${this.accessory.displayName} Temperature: ${this.CurrentTemperature}°c`);
    }
  }

  private async openAPIparseStatus() {
    if (this.platform.config.credentials?.openToken) {
      this.platform.debug(`Meter: ${this.accessory.displayName} OpenAPI parseStatus`);
      if (this.deviceStatus.body) {
        this.BatteryLevel = 100;
      } else {
        this.BatteryLevel = 10;
      }
      if (this.BatteryLevel < 15) {
        this.StatusLowBattery = 1;
      } else {
        this.StatusLowBattery = 0;
      }
      // Current Relative Humidity
      if (!this.device.meter?.hide_humidity) {
        this.CurrentRelativeHumidity = this.deviceStatus.body.humidity!;
        this.platform.debug(`Meter: ${this.accessory.displayName} Humidity: ${this.CurrentRelativeHumidity}%`);
      }

      // Current Temperature
      if (!this.device.meter?.hide_temperature) {
        if (this.device.meter?.unit === 1) {
          this.CurrentTemperature = this.toFahrenheit(this.deviceStatus.body.temperature!);
        } else if (this.device.meter?.unit === 0) {
          this.CurrentTemperature = this.toCelsius(this.deviceStatus.body.temperature!);
        } else {
          this.CurrentTemperature = Number(this.deviceStatus.body.temperature);
        }
        this.platform.debug(`Meter: ${this.accessory.displayName} Temperature: ${this.CurrentTemperature}°c`);
      }
    }
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus() {
    if (this.device.ble) {
      await this.BLErefreshStatus();
    } else {
      await this.openAPIRefreshStatus();
    }
  }

  private connectBLE() {
    const switchbot = new Switchbot();
    this.device.bleMac = ((this.device.deviceId!.match(/.{1,2}/g))!.join(':')).toLowerCase();
    this.platform.device(`Meter: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    return switchbot;
  }

  private async BLErefreshStatus() {
    this.platform.debug(`Meter: ${this.accessory.displayName} BLE RefreshStatus`);
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
        this.temperature = ad.serviceData.temperature;
        this.fahrenheit = ad.serviceData.fahrenheit;
        this.humidity = ad.serviceData.humidity;
        this.battery = ad.serviceData.battery;
        this.platform.device(`Meter: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        this.platform.device(`Meter: ${this.accessory.displayName} model: ${ad.serviceData.model}, modelName: ${ad.serviceData.modelName}, `
          + `temperature: ${JSON.stringify(ad.serviceData.temperature)}, fahrenheit: ${ad.serviceData.fahrenheit}, `
          + `humidity: ${ad.serviceData.humidity}, battery: ${ad.serviceData.battery}`);

        if (this.serviceData) {
          this.connected = true;
          this.platform.device(`Meter: ${this.accessory.displayName} connected: ${this.connected}`);
        } else {
          this.connected = false;
          this.platform.device(`Meter: ${this.accessory.displayName} connected: ${this.connected}`);
        }
      };
      // Wait 10 seconds
      return switchbot.wait(10000);
    }).then(() => {
      // Stop to monitor
      switchbot.stopScan();
      if (this.connected) {
        this.parseStatus();
        this.updateHomeKitCharacteristics();
      } else {
        this.platform.log.error(`Meter: ${this.accessory.displayName} wasn't able to establish BLE Connection`);
      }
    }).catch(async (e: any) => {
      this.platform.log.error(`Meter: ${this.accessory.displayName} failed refreshStatus with BLE Connection`);
      if (this.deviceDebug) {
        this.platform.log.error(`Meter: ${this.accessory.displayName} failed refreshStatus with BLE Connection,`
          + ` Error Message: ${JSON.stringify(e.message)}`);
      }
      if (this.debugDebug) {
        this.platform.log.error(`Meter: ${this.accessory.displayName} failed refreshStatus with BLE Connection,`
          + ` Error: ${JSON.stringify(e)}`);
      }
      if (this.platform.config.credentials?.openToken) {
        this.platform.log.warn(`Meter: ${this.accessory.displayName} Using OpenAPI Connection`);
        await this.openAPIRefreshStatus();
      }
      this.apiError(e);
    });
  }

  private async openAPIRefreshStatus() {
    if (this.platform.config.credentials?.openToken) {
      this.platform.debug(`Meter: ${this.accessory.displayName} OpenAPI RefreshStatus`);
      try {
        this.deviceStatus = (await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)).data;
        this.platform.debug(`Meter: ${this.accessory.displayName} openAPIRefreshStatus: ${JSON.stringify(this.deviceStatus)}`);
        this.parseStatus();
        this.updateHomeKitCharacteristics();
      } catch (e: any) {
        this.platform.log.error(`Meter: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection`);
        if (this.deviceDebug) {
          this.platform.log.error(`Meter: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,`
            + ` Error Message: ${JSON.stringify(e.message)}`);
        }
        if (this.debugDebug) {
          this.platform.log.error(`Meter: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,`
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
      this.platform.debug(`Meter: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
      this.platform.device(`Meter: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
    }
    if (this.BatteryLevel === undefined) {
      this.platform.debug(`Meter: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
      this.platform.device(`Meter: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
    }
    if (!this.device.meter?.hide_humidity) {
      if (this.CurrentRelativeHumidity === undefined) {
        this.platform.debug(`Meter: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
      } else {
        this.humidityservice?.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
        this.platform.device(`Meter: ${this.accessory.displayName} updateCharacteristic CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
      }
    }
    if (!this.device.meter?.hide_temperature) {
      if (this.CurrentTemperature === undefined) {
        this.platform.debug(`Meter: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
      } else {
        this.temperatureservice?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
        this.platform.device(`Meter: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`);
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
  }

  /**
   * Converts the value to celsius if the temperature units are in Fahrenheit
   */
  toCelsius(value: number) {
    // celsius should be to the nearest 0.5 degree
    return Math.round((5 / 9) * (value - 32) * 2) / 2;
  }

  /**
   * Converts the value to fahrenheit if the temperature units are in Fahrenheit
   */
  toFahrenheit(value: number) {
    return Math.round((value * 9) / 5 + 32);
  }
}
