import { Service, PlatformAccessory, Units, CharacteristicValue, HAPStatus } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { skipWhile } from 'rxjs/operators';
import { DeviceURL, device, deviceStatusResponse } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Meter {
  private service: Service;
  temperatureservice?: Service;
  humidityservice?: Service;

  CurrentRelativeHumidity!: CharacteristicValue;
  CurrentTemperature!: CharacteristicValue;
  BatteryLevel!: CharacteristicValue;
  ChargingState!: CharacteristicValue;
  StatusLowBattery!: CharacteristicValue;
  Active!: CharacteristicValue;
  WaterLevel!: CharacteristicValue;
  deviceStatus!: deviceStatusResponse;
  switchbot;

  meterUpdateInProgress!: boolean;
  doMeterUpdate;
  BLEtemperature: any;
  BLEHumidity: any;
  ScanDuration: number;

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
    this.ScanDuration = this.platform.config.options!.refreshRate!;
    if (this.platform.config.options?.ble?.includes(this.device.deviceId!)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Switchbot = require('node-switchbot');
      this.switchbot = new Switchbot();
      const colon = device.deviceId!.match(/.{1,2}/g);
      const bleMac = colon!.join(':'); //returns 1A:23:B4:56:78:9A;
      this.device.bleMac = bleMac.toLowerCase();
      if (this.platform.debugMode) {
        this.platform.log.warn(this.device.bleMac);
      }
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
      accessory.addService(this.platform.Service.Battery)), '%s %s', device.deviceName, device.deviceType;

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
      if (this.platform.debugMode) {
        this.platform.log.error('Removing service');
      }
      this.temperatureservice = this.accessory.getService(this.platform.Service.TemperatureSensor);
      accessory.removeService(this.temperatureservice!);
    } else if (!this.temperatureservice) {
      if (this.platform.debugMode) {
        this.platform.log.warn('Adding service');
      }
      (this.temperatureservice =
        this.accessory.getService(this.platform.Service.TemperatureSensor) ||
        this.accessory.addService(this.platform.Service.TemperatureSensor)), '%s %s TemperatureSensor', device.deviceName, device.deviceType;

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
      this.platform.log.info(this.device.deviceName + ' current temperature: ' + this.CurrentTemperature + '\u2103');
    } else {
      if (this.platform.debugMode) {
        this.platform.log.warn('TemperatureSensor not added.');
      }
    }

    // Humidity Sensor Service
    if (this.platform.config.options?.meter?.hide_humidity) {
      if (this.platform.debugMode) {
        this.platform.log.error('Removing service');
      }
      this.humidityservice = this.accessory.getService(this.platform.Service.HumiditySensor);
      accessory.removeService(this.humidityservice!);
    } else if (!this.humidityservice) {
      (this.humidityservice =
        this.accessory.getService(this.platform.Service.HumiditySensor) ||
        this.accessory.addService(this.platform.Service.HumiditySensor)), '%s %s HumiditySensor', device.deviceName, device.deviceType;

      this.humidityservice
        .getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .setProps({
          minStep: 0.1,
        })
        .onGet(() => {
          return this.CurrentRelativeHumidity;
        });
      this.platform.log.info(this.device.deviceName + ' current humidity: ' + this.CurrentRelativeHumidity + '%');
    } else {
      if (this.platform.debugMode) {
        this.platform.log.warn('HumiditySensor not added.');
      }
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
  parseStatus() {
    // Set Room Sensor State
    if (this.deviceStatus.body || this.platform.config.options?.ble?.includes(this.device.deviceId!)) {
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
      this.platform.log.debug('Meter %s - Humidity: %s%', this.accessory.displayName, this.CurrentRelativeHumidity);
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
      this.platform.log.debug('Meter %s - Temperature: %s°c', this.accessory.displayName, this.CurrentTemperature);
    }
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus() {
    if (this.platform.config.options?.ble?.includes(this.device.deviceId!)) {
      this.switchbot.onadvertisement = (ad: any) => {
        this.platform.log.info(JSON.stringify(ad, null, '  '));
        this.platform.log.warn('ad:', JSON.stringify(ad));
        this.platform.log.info('Temperature:', ad.serviceData.temperature.c);
        this.platform.log.info('Humidity:', ad.serviceData.humidity);
        this.BLEtemperature = ad.serviceData.temperature.c;
        this.BLEHumidity = ad.serviceData.humidity;
      };
    } else {
      try {
        const deviceStatus: deviceStatusResponse = (
          await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)
        ).data;
        if (deviceStatus.message === 'success') {
          this.deviceStatus = deviceStatus;
          this.platform.log.debug(
            'Meter %s refreshStatus -',
            this.accessory.displayName,
            JSON.stringify(this.deviceStatus),
          );

          this.parseStatus();
          this.updateHomeKitCharacteristics();
        }
      } catch (e) {
        this.platform.log.error(
          'Meter - Failed to update status of',
          this.device.deviceName,
          JSON.stringify(e.message),
          this.platform.log.debug('Meter %s -', this.accessory.displayName, JSON.stringify(e)),
        );
        this.apiError(e);
      }
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    if (this.StatusLowBattery !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
    }
    if (this.BatteryLevel !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
    }
    if (!this.platform.config.options?.meter?.hide_humidity && this.CurrentRelativeHumidity !== undefined) {
      this.humidityservice?.updateCharacteristic(
        this.platform.Characteristic.CurrentRelativeHumidity,
        this.CurrentRelativeHumidity,
      );
    }
    if (!this.platform.config.options?.meter?.hide_temperature && this.CurrentTemperature !== undefined) {
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
    new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
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
