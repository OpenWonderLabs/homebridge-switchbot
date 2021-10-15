import { Service, PlatformAccessory, Units, CharacteristicValue, MacAddress } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { skipWhile } from 'rxjs/operators';
import { DeviceURL, device } from '../settings';

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

  // Others
  deviceStatus!: any;
  BLEtemperature!: number;
  BLEHumidity!: number;
  switchbot!: {
    discover: (
      arg0:
        {
          duration: any;
          model: string;
          quick: boolean;
          id: MacAddress;
        }
    ) => Promise<any>;
    wait: (
      arg0: number
    ) => any;
  };

  // Updates
  meterUpdateInProgress!: boolean;
  doMeterUpdate;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device,
  ) {
    // default placeholders
    this.BatteryLevel = 0;
    this.ChargingState = 2;
    this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    this.CurrentRelativeHumidity = 0;
    this.CurrentTemperature = 0;

    // BLE Connection
    if (this.platform.config.options?.ble?.includes(this.device.deviceId!)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const SwitchBot = require('node-switchbot');
      this.switchbot = new SwitchBot();
      const colon = device.deviceId!.match(/.{1,2}/g);
      const bleMac = colon!.join(':'); //returns 1A:23:B4:56:78:9A;
      this.device.bleMac = bleMac.toLowerCase();
      this.platform.device(this.device.bleMac.toLowerCase());
    }

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
      accessory.addService(this.platform.Service.Battery)), `${device.deviceName} ${device.deviceType}`;

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
    if (this.platform.config.options?.meter?.hide_temperature) {
      this.platform.device('Removing Temperature Sensor Service');
      this.temperatureservice = this.accessory.getService(this.platform.Service.TemperatureSensor);
      accessory.removeService(this.temperatureservice!);
    } else if (!this.temperatureservice) {
      this.platform.device('Adding Temperature Sensor Service');
      (this.temperatureservice =
        this.accessory.getService(this.platform.Service.TemperatureSensor) ||
        this.accessory.addService(this.platform.Service.TemperatureSensor)), `${device.deviceName} ${device.deviceType} TemperatureSensor`;

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
      this.platform.device('Temperature Sensor Not Added');
    }

    // Humidity Sensor Service
    if (this.platform.config.options?.meter?.hide_humidity) {
      this.platform.device('Removing Humidity Sensor Service');
      this.humidityservice = this.accessory.getService(this.platform.Service.HumiditySensor);
      accessory.removeService(this.humidityservice!);
    } else if (!this.humidityservice) {
      this.platform.device('Adding Humidity Sensor Service');
      (this.humidityservice =
        this.accessory.getService(this.platform.Service.HumiditySensor) ||
        this.accessory.addService(this.platform.Service.HumiditySensor)), `${device.deviceName} ${device.deviceType} HumiditySensor`;

      this.humidityservice
        .getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .setProps({
          minStep: 0.1,
        })
        .onGet(() => {
          return this.CurrentRelativeHumidity;
        });
    } else {
      this.platform.device('Adding Humidity Sensor Not Added');
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
    if (this.platform.config.options?.ble?.includes(this.device.deviceId!)) {
      await this.BLEparseStatus();
    } else {
      await this.openAPIparseStatus();
    }
  }

  private async BLEparseStatus() {
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
    this.platform.debug(`${this.accessory.displayName}
    , BatteryLevel: ${this.BatteryLevel}, StatusLowBattery: ${this.StatusLowBattery}`);
  }

  private async openAPIparseStatus() {
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
    if (!this.platform.config.options?.meter?.hide_humidity) {
      if (this.platform.config.options?.ble?.includes(this.device.deviceId!)) {
        this.CurrentRelativeHumidity = this.BLEHumidity;
      } else {
        this.CurrentRelativeHumidity = this.deviceStatus.body.humidity!;
      }
      this.platform.debug(`Meter ${this.accessory.displayName} - Humidity: ${this.CurrentRelativeHumidity}%`);
    }

    // Current Temperature
    if (!this.platform.config.options?.meter?.hide_temperature) {
      if (this.platform.config.options?.ble?.includes(this.device.deviceId!)) {
        this.CurrentTemperature = this.BLEtemperature;
      } else {
        if (this.platform.config.options?.meter?.unit === 1) {
          this.CurrentTemperature = this.toFahrenheit(this.deviceStatus.body.temperature!);
        } else if (this.platform.config.options?.meter?.unit === 0) {
          this.CurrentTemperature = this.toCelsius(this.deviceStatus.body.temperature!);
        } else {
          this.CurrentTemperature = this.deviceStatus.body.temperature!;
        }
      }
      this.platform.debug(`Meter ${this.accessory.displayName} - Temperature: ${this.CurrentTemperature}°c`);
    }
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus() {
    if (this.platform.config.options?.ble?.includes(this.device.deviceId!)) {
      await this.BLErefreshStatus();
    } else {
      await this.openAPIRefreshStatus();
    }
  }

  private async BLErefreshStatus() {
    this.platform.debug('Meter BLE Device RefreshStatus');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Switchbot = require('node-switchbot');
    const switchbot = new Switchbot();
    const colon = this.device.deviceId!.match(/.{1,2}/g);
    const bleMac = colon!.join(':'); //returns 1A:23:B4:56:78:9A;
    this.device.bleMac = bleMac.toLowerCase();
    this.platform.device(this.device.bleMac!);
    switchbot.onadvertisement = (ad: any) => {
      this.platform.debug(JSON.stringify(ad, null, '  '));
      this.platform.device('ad:', JSON.stringify(ad));
      this.platform.device(`Temperature: ${ad.serviceData.temperature.c}`);
      this.platform.device(`Humidity: ${ad.serviceData.humidity}`);
      this.BLEtemperature = ad.serviceData.temperature.c;
      this.BLEHumidity = ad.serviceData.humidity;
    };
    this.parseStatus();
    this.updateHomeKitCharacteristics();
    switchbot
      .startScan({
        id: this.device.bleMac,
      })
      .then(() => {
        return switchbot.wait(this.platform.config.options!.refreshRate! * 1000);
      })
      .then(() => {
        switchbot.stopScan();
      })
      .catch(async (error: any) => {
        this.platform.log.error(error);
        await this.openAPIRefreshStatus();
      });
    setInterval(() => {
      this.platform.log.info('Start scan ' + this.device.deviceName + '(' + this.device.bleMac + ')');
      switchbot
        .startScan({
          mode: 'T',
          id: bleMac,
        })
        .then(() => {
          return switchbot.wait(this.platform.config.options!.refreshRate! * 1000);
        })
        .then(() => {
          switchbot.stopScan();
          this.platform.log.info('Stop scan ' + this.device.deviceName + '(' + this.device.bleMac + ')');
        })
        .catch(async (error: any) => {
          this.platform.log.error(error);
          await this.openAPIRefreshStatus();
        });
    }, this.platform.config.options!.refreshRate! * 60000);
  }

  private async openAPIRefreshStatus() {
    try {
      this.deviceStatus = (await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)).data;
      this.platform.debug(`Meter ${this.accessory.displayName} openAPIRefreshStatus: ${JSON.stringify(this.deviceStatus)}`);
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.platform.log.error(`Meter - Failed to refresh status of ${this.device.deviceName} - ${JSON.stringify(e.message)}`);
      this.platform.debug(`Meter ${this.accessory.displayName} - ${JSON.stringify(e)}`);
      this.apiError(e);
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    if (this.StatusLowBattery === undefined) {
      this.platform.debug(`ContactSensorState: ${this.StatusLowBattery}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
    }
    if (this.BatteryLevel === undefined) {
      this.platform.debug(`ContactSensorState: ${this.BatteryLevel}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
    }
    if (!this.platform.config.options?.meter?.hide_humidity && (this.CurrentRelativeHumidity !== undefined)) {
      this.humidityservice?.updateCharacteristic(
        this.platform.Characteristic.CurrentRelativeHumidity,
        this.CurrentRelativeHumidity,
      );
    }
    if (!this.platform.config.options?.meter?.hide_temperature && (this.CurrentTemperature !== undefined)) {
      this.temperatureservice?.updateCharacteristic(
        this.platform.Characteristic.CurrentTemperature,
        this.CurrentTemperature,
      );
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, e);
    this.service.updateCharacteristic(this.platform.Characteristic.BatteryLevel, e);
    if (!this.platform.config.options?.meter?.hide_humidity) {
      this.humidityservice?.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, e);
    }
    if (!this.platform.config.options?.meter?.hide_temperature) {
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
