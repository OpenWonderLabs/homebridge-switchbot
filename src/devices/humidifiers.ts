import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { DeviceURL, device, deviceStatusResponse } from '../settings';
import { AxiosResponse } from 'axios';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Humidifier {
  // Services
  private service: Service;
  temperatureservice?: Service;

  // Characteristic Values
  CurrentRelativeHumidity!: CharacteristicValue;
  CurrentTemperature!: CharacteristicValue;
  TargetHumidifierDehumidifierState!: CharacteristicValue;
  CurrentHumidifierDehumidifierState!: CharacteristicValue;
  RelativeHumidityHumidifierThreshold!: CharacteristicValue;
  Active!: CharacteristicValue;
  WaterLevel!: CharacteristicValue;

  // Others
  deviceStatus!: deviceStatusResponse;

  // Updates
  humidifierUpdateInProgress!: boolean;
  doHumidifierUpdate;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device,
  ) {
    // default placeholders
    this.CurrentRelativeHumidity = 0;
    this.TargetHumidifierDehumidifierState = this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER;
    this.CurrentHumidifierDehumidifierState = this.platform.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
    this.Active = this.platform.Characteristic.Active.ACTIVE;
    this.RelativeHumidityHumidifierThreshold = 0;
    this.CurrentTemperature = 0;
    this.WaterLevel = 0;

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doHumidifierUpdate = new Subject();
    this.humidifierUpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'SWITCHBOT-HUMIDIFIER-W0801800')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!);

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    (this.service =
      accessory.getService(this.platform.Service.HumidifierDehumidifier) ||
      accessory.addService(this.platform.Service.HumidifierDehumidifier)), `${device.deviceName} ${device.deviceType}`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/HumidifierDehumidifier

    // create handlers for required characteristics
    this.service.setCharacteristic(
      this.platform.Characteristic.CurrentHumidifierDehumidifierState,
      this.CurrentHumidifierDehumidifierState,
    );

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState)
      .setProps({
        validValueRanges: [0, 1],
        minValue: 0,
        maxValue: 1,
        validValues: [0, 1],
      })
      .onSet(this.handleTargetHumidifierDehumidifierStateSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.Active).onSet(this.handleActiveSet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.RelativeHumidityHumidifierThreshold)
      .setProps({
        validValueRanges: [0, 100],
        minValue: 0,
        maxValue: 100,
        minStep: this.platform.config.options?.humidifier?.set_minStep || 1,
      })
      .onSet(this.handleRelativeHumidityHumidifierThresholdSet.bind(this));

    // create a new Temperature Sensor service
    // Temperature Sensor Service
    if (this.platform.config.options?.humidifier?.hide_temperature) {
      this.platform.device('Removing Temerature Sensor Service');
      this.temperatureservice = this.accessory.getService(this.platform.Service.TemperatureSensor);
      accessory.removeService(this.temperatureservice!);
    } else if (!this.temperatureservice) {
      this.platform.device('Adding Temerature Sensor Service');
      (this.temperatureservice =
        this.accessory.getService(this.platform.Service.TemperatureSensor) ||
        this.accessory.addService(this.platform.Service.TemperatureSensor)), `${device.deviceName} ${device.deviceType} TemperatureSensor`;

      this.temperatureservice
        .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .setProps({
          validValueRanges: [-273.15, 100],
          minValue: -273.15,
          maxValue: 100,
          minStep: 0.1,
        })
        .onGet(() => {
          return this.CurrentTemperature;
        });
    } else {
      if (this.platform.config.options?.debug) {
        this.platform.device('Temperature Sensor Not Added');
      }
    }

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.platform.config.options!.refreshRate! * 1000)
      .pipe(skipWhile(() => this.humidifierUpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });

    // Watch for Humidifier change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doHumidifierUpdate
      .pipe(
        tap(() => {
          this.humidifierUpdateInProgress = true;
        }),
        debounceTime(this.platform.config.options!.pushRate! * 1000),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges();
        } catch (e: any) {
          this.platform.log.error(JSON.stringify(e.message));
          this.platform.debug(`Humidifier ${accessory.displayName} - ${JSON.stringify(e)}`);
          this.apiError(e);
        }
        this.humidifierUpdateInProgress = false;
      });
  }

  /**
   * Parse the device status from the SwitchBot api
   */
  parseStatus() {
    // Current Relative Humidity
    this.CurrentRelativeHumidity = this.deviceStatus.body.humidity!;
    this.platform.debug(`Humidifier ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    this.platform.device(JSON.stringify(this.deviceStatus.body));
    // Water Level
    if (this.deviceStatus.body.lackWater) {
      this.WaterLevel = 0;
    } else {
      this.WaterLevel = 100;
    }
    this.platform.debug(`Humidifier ${this.accessory.displayName} WaterLevel: ${this.WaterLevel}`);
    // Active
    switch (this.deviceStatus.body.power) {
      case 'on':
        this.Active = this.platform.Characteristic.Active.ACTIVE;
        break;
      default:
        this.Active = this.platform.Characteristic.Active.INACTIVE;
    }
    this.platform.debug(`Humidifier ${this.accessory.displayName} Active: ${this.Active}`);
    // Target Humidifier Dehumidifier State
    switch (this.deviceStatus.body.auto) {
      case true:
        this.TargetHumidifierDehumidifierState = this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER;
        this.CurrentHumidifierDehumidifierState = this.platform.Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING;
        this.RelativeHumidityHumidifierThreshold = this.CurrentRelativeHumidity;
        break;
      default:
        this.TargetHumidifierDehumidifierState = this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER;
        if (this.deviceStatus.body.nebulizationEfficiency! > 100) {
          this.RelativeHumidityHumidifierThreshold = 100;
        } else {
          this.RelativeHumidityHumidifierThreshold = this.deviceStatus.body.nebulizationEfficiency!;
        }
        if (this.CurrentRelativeHumidity > this.RelativeHumidityHumidifierThreshold) {
          this.CurrentHumidifierDehumidifierState = this.platform.Characteristic.CurrentHumidifierDehumidifierState.IDLE;
        } else if (this.Active === this.platform.Characteristic.Active.INACTIVE) {
          this.CurrentHumidifierDehumidifierState = this.platform.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
        } else {
          this.CurrentHumidifierDehumidifierState = this.platform.Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING;
        }
    }
    this.platform.debug(`Humidifier ${this.accessory.displayName} TargetHumidifierDehumidifierState: ${this.TargetHumidifierDehumidifierState}`);
    this.platform.debug(`Humidifier ${this.accessory.displayName} RelativeHumidityHumidifierThreshold: ${this.RelativeHumidityHumidifierThreshold}`);
    this.platform.debug(`Humidifier ${this.accessory.displayName} CurrentHumidifierDehumidifierState: ${this.CurrentHumidifierDehumidifierState}`);
    // Current Temperature
    if (!this.platform.config.options?.humidifier?.hide_temperature) {
      this.CurrentTemperature = this.deviceStatus.body.temperature!;
      this.platform.debug(`Humidifier ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
    }
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus() {
    try {
      const deviceStatus: deviceStatusResponse = (
        await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)
      ).data;
      if (deviceStatus.message === 'success') {
        this.deviceStatus = deviceStatus;
        this.platform.debug(`Humidifier ${this.accessory.displayName} refreshStatus: ${JSON.stringify(this.deviceStatus)}`);
        this.parseStatus();
        this.updateHomeKitCharacteristics();
      }
    } catch (e: any) {
      this.platform.log.error(`Humidifier - Failed to update status of ${this.device.deviceName}: ${JSON.stringify(e.message)}`);
      this.platform.debug(`Humidifier ${this.accessory.displayName} ${JSON.stringify(e)}`);
      this.apiError(e);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   */
  async pushChanges() {
    if (
      this.TargetHumidifierDehumidifierState ===
      this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER &&
      this.Active === this.platform.Characteristic.Active.ACTIVE
    ) {
      this.platform.debug(`Pushing Manual: ${this.RelativeHumidityHumidifierThreshold}!`);
      const payload = {
        commandType: 'command',
        command: 'setMode',
        parameter: `${this.RelativeHumidityHumidifierThreshold}`,
      } as any;

      this.platform.log.info(
        'Sending request for',
        this.accessory.displayName,
        'to SwitchBot API. command:',
        payload.command,
        'parameter:',
        payload.parameter,
        'commandType:',
        payload.commandType,
      );
      this.platform.debug(`Humidifier ${this.accessory.displayName} pushChanges - ${JSON.stringify(payload)}`);

      // Make the API request
      const push = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
      this.platform.debug(`Humidifier ${this.accessory.displayName} Changes pushed - ${push.data}`);
      this.statusCode(push);
    } else if (
      this.TargetHumidifierDehumidifierState ===
      this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER &&
      this.Active === this.platform.Characteristic.Active.ACTIVE
    ) {
      await this.pushAutoChanges();
    } else {
      await this.pushActiveChanges();
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   */
  async pushAutoChanges() {
    try {
      if (
        this.TargetHumidifierDehumidifierState ===
        this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER &&
        this.Active === this.platform.Characteristic.Active.ACTIVE
      ) {
        this.platform.debug('Pushing Auto!');
        const payload = {
          commandType: 'command',
          command: 'setMode',
          parameter: 'auto',
        } as any;

        this.platform.log.info(
          'Sending request for',
          this.accessory.displayName,
          'to SwitchBot API. command:',
          payload.command,
          'parameter:',
          payload.parameter,
          'commandType:',
          payload.commandType,
        );
        this.platform.debug(`Humidifier ${this.accessory.displayName} pushAutoChanges - ${JSON.stringify(payload)}`);

        // Make the API request
        const pushAuto = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
        this.platform.debug(`Humidifier ${this.accessory.displayName} Changes pushed - ${pushAuto.data}`);
        this.statusCodeAuto(pushAuto);
      }
    } catch (e: any) {
      this.platform.log.error(JSON.stringify(e.message));
      this.platform.debug(`Humidifier ${this.accessory.displayName} - ${JSON.stringify(e)}`);
      this.apiError(e);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   */
  async pushActiveChanges() {
    try {
      if (this.Active === this.platform.Characteristic.Active.INACTIVE) {
        this.platform.debug('Pushing Off!');
        const payload = {
          commandType: 'command',
          command: 'turnOff',
          parameter: 'default',
        } as any;

        this.platform.log.info(
          'Sending request for',
          this.accessory.displayName,
          'to SwitchBot API. command:',
          payload.command,
          'parameter:',
          payload.parameter,
          'commandType:',
          payload.commandType,
        );
        this.platform.debug(`Humidifier ${this.accessory.displayName} pushActiveChanges - ${JSON.stringify(payload)}`);

        // Make the API request
        const pushActive = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
        this.platform.debug(`Humidifier ${this.accessory.displayName} Changes pushed - ${pushActive.data}`);
        this.statusCodeActive(pushActive);
      }
    } catch (e: any) {
      this.platform.log.error(JSON.stringify(e.message));
      this.platform.debug(`Humidifier ${this.accessory.displayName} - ${JSON.stringify(e)}`);
      this.apiError(e);
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    if (this.CurrentRelativeHumidity !== undefined) {
      this.service.updateCharacteristic(
        this.platform.Characteristic.CurrentRelativeHumidity,
        this.CurrentRelativeHumidity,
      );
    }
    if (this.WaterLevel !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.WaterLevel, this.WaterLevel);
    }
    if (this.CurrentHumidifierDehumidifierState !== undefined) {
      this.service.updateCharacteristic(
        this.platform.Characteristic.CurrentHumidifierDehumidifierState,
        this.CurrentHumidifierDehumidifierState,
      );
    }
    if (this.TargetHumidifierDehumidifierState !== undefined) {
      this.service.updateCharacteristic(
        this.platform.Characteristic.TargetHumidifierDehumidifierState,
        this.TargetHumidifierDehumidifierState,
      );
    }
    if (this.Active !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
    }
    if (this.RelativeHumidityHumidifierThreshold !== undefined) {
      this.service.updateCharacteristic(
        this.platform.Characteristic.RelativeHumidityHumidifierThreshold,
        this.RelativeHumidityHumidifierThreshold,
      );
    }
    if (!this.platform.config.options?.humidifier?.hide_temperature && this.CurrentTemperature !== undefined) {
      this.temperatureservice!.updateCharacteristic(
        this.platform.Characteristic.CurrentTemperature,
        this.CurrentTemperature,
      );
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, e);
    this.service.updateCharacteristic(this.platform.Characteristic.WaterLevel, e);
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentHumidifierDehumidifierState, e);
    this.service.updateCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState, e);
    this.service.updateCharacteristic(this.platform.Characteristic.Active, e);
    this.service.updateCharacteristic(this.platform.Characteristic.RelativeHumidityHumidifierThreshold, e);
    if (!this.platform.config.options?.humidifier?.hide_temperature) {
      this.temperatureservice!.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, e);
    }
  }

  private statusCode(push: AxiosResponse<any>) {
    switch (push.data.statusCode) {
      case 151:
        this.platform.log.error('Command not supported by this device type.');
        break;
      case 152:
        this.platform.log.error('Device not found.');
        break;
      case 160:
        this.platform.log.error('Command is not supported.');
        break;
      case 161:
        this.platform.log.error('Device is offline.');
        break;
      case 171:
        this.platform.log.error('Hub Device is offline.');
        break;
      case 190:
        this.platform.log.error('Device internal error due to device states not synchronized with server. Or command fomrat is invalid.');
        break;
      case 100:
        this.platform.debug('Command successfully sent.');
        break;
      default:
        this.platform.debug('Unknown statusCode.');
    }
  }

  private statusCodeAuto(pushAuto: AxiosResponse<any>) {
    switch (pushAuto.data.statusCode) {
      case 151:
        this.platform.log.error('Command not supported by this device type.');
        break;
      case 152:
        this.platform.log.error('Device not found.');
        break;
      case 160:
        this.platform.log.error('Command is not supported.');
        break;
      case 161:
        this.platform.log.error('Device is offline.');
        break;
      case 171:
        this.platform.log.error('Hub Device is offline.');
        break;
      case 190:
        this.platform.log.error('Device internal error due to device states not synchronized with server. Or command fomrat is invalid.');
        break;
      case 100:
        this.platform.debug('Command successfully sent.');
        break;
      default:
        this.platform.debug('Unknown statusCode.');
    }
  }

  private statusCodeActive(pushActive: AxiosResponse<any>) {
    switch (pushActive.data.statusCode) {
      case 151:
        this.platform.log.error('Command not supported by this device type.');
        break;
      case 152:
        this.platform.log.error('Device not found.');
        break;
      case 160:
        this.platform.log.error('Command is not supported.');
        break;
      case 161:
        this.platform.log.error('Device is offline.');
        break;
      case 171:
        this.platform.log.error('Hub Device is offline.');
        break;
      case 190:
        this.platform.log.error('Device internal error due to device states not synchronized with server. Or command fomrat is invalid.');
        break;
      case 100:
        this.platform.debug('Command successfully sent.');
        break;
      default:
        this.platform.debug('Unknown statusCode.');
    }
  }

  /**
   * Handle requests to set the "Target Humidifier Dehumidifier State" characteristic
   */
  private handleTargetHumidifierDehumidifierStateSet(value: CharacteristicValue) {
    this.platform.debug(`Humidifier ${this.accessory.displayName} - Set TargetHumidifierDehumidifierState: ${value}`);

    this.TargetHumidifierDehumidifierState = value;
    this.doHumidifierUpdate.next();
  }

  /**
   * Handle requests to set the "Active" characteristic
   */
  private handleActiveSet(value: CharacteristicValue) {
    this.platform.debug(`Humidifier ${this.accessory.displayName} - Set Active: ${value}`);
    this.Active = value;
    this.doHumidifierUpdate.next();
  }

  /**
   * Handle requests to set the "Relative Humidity Humidifier Threshold" characteristic
   */
  private handleRelativeHumidityHumidifierThresholdSet(value: CharacteristicValue) {
    this.platform.debug(`Humidifier ${this.accessory.displayName} - Set RelativeHumidityHumidifierThreshold: ${value}`);

    this.RelativeHumidityHumidifierThreshold = value;
    if (this.Active === this.platform.Characteristic.Active.INACTIVE) {
      this.Active = this.platform.Characteristic.Active.ACTIVE;
      this.CurrentHumidifierDehumidifierState = this.platform.Characteristic.CurrentHumidifierDehumidifierState.IDLE;
    }
    this.doHumidifierUpdate.next();
  }
}
