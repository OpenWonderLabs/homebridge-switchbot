import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { DeviceURL, device, devicesConfig, serviceData, ad, deviceStatusResponse, payload } from '../settings';
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

  // OpenAPI
  deviceStatus!: deviceStatusResponse;

  // BLE Others
  serviceData!: serviceData;
  onState!: serviceData['onState'];
  autoMode!: serviceData['autoMode'];
  percentage!: serviceData['percentage'];

  // Config
  set_minStep?: number;

  // Updates
  humidifierUpdateInProgress!: boolean;
  doHumidifierUpdate!: Subject<void>;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device & devicesConfig,
  ) {
    // Humidifiers Config
    this.platform.device(`Humidifier: ${this.accessory.displayName} Config: (ble: ${device.ble}, hide_temperature: `
      + `${device.humidifier?.hide_temperature}, set_minStep: ${device.humidifier?.set_minStep})`);

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
      accessory.addService(this.platform.Service.HumidifierDehumidifier)), `${accessory.displayName} Humidifier`;

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
        minStep: this.minStep(),
      })
      .onSet(this.handleRelativeHumidityHumidifierThresholdSet.bind(this));

    // create a new Temperature Sensor service
    // Temperature Sensor Service
    if (device.humidifier?.hide_temperature || device.ble) {
      this.platform.device(`Humidifier: ${accessory.displayName} Removing Temperature Sensor Service`);
      this.temperatureservice = this.accessory.getService(this.platform.Service.TemperatureSensor);
      accessory.removeService(this.temperatureservice!);
    } else if (!this.temperatureservice && !device.ble) {
      this.platform.device(`Humidifier: ${accessory.displayName} Add Temperature Sensor Service`);
      (this.temperatureservice =
        this.accessory.getService(this.platform.Service.TemperatureSensor) ||
        this.accessory.addService(this.platform.Service.TemperatureSensor)), `${accessory.displayName} Temperature Sensor`;

      this.temperatureservice.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Temperature Sensor`);

      this.temperatureservice
        .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .setProps({
          validValueRanges: [-273.15, 100],
          minValue: -273.15,
          maxValue: 100,
          minStep: 0.1,
        })
        .onGet(() => {
          return Number.isNaN(this.CurrentTemperature);
        });
    } else {
      if (this.platform.config.options?.debug) {
        this.platform.device(`Humidifier: ${accessory.displayName} Temperature Sensor Service Not Added`);
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
          this.platform.log.error(`Humidifier: ${this.accessory.displayName} failed to pushChanges,`
            + ` Error Message: ${JSON.stringify(e.message)}`);
          this.platform.debug(`Humidifier: ${this.accessory.displayName} Error: ${JSON.stringify(e)}`);
          this.apiError(e);
        }
        this.humidifierUpdateInProgress = false;
      });
  }

  private minStep(): number | undefined {
    if (this.device.humidifier?.set_minStep) {
      this.set_minStep = this.device.humidifier?.set_minStep;
    } else {
      this.set_minStep = 1;
    }
    return this.set_minStep;
  }

  /**
   * Parse the device status from the SwitchBot api
   */
  parseStatus() {
    if (this.device.ble) {
      this.BLEparseStatus();
    } else {
      this.openAPIparseStatus();
    }
  }

  private BLEparseStatus() {
    this.platform.debug(`Humidifier: ${this.accessory.displayName} BLE parseStatus`);
    // Current Relative Humidity
    this.CurrentRelativeHumidity = this.percentage!;
    this.platform.debug(`Humidifier: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    // Active
    if (this.onState) {
      this.Active = this.platform.Characteristic.Active.ACTIVE;
    } else {
      this.Active = this.platform.Characteristic.Active.INACTIVE;
    }
    this.platform.debug(`Humidifier: ${this.accessory.displayName} Active: ${this.Active}`);
  }

  private openAPIparseStatus() {
    this.platform.debug(`Humidifier: ${this.accessory.displayName} OpenAPI parseStatus`);
    // Current Relative Humidity
    this.CurrentRelativeHumidity = this.deviceStatus.body.humidity!;
    this.platform.debug(`Humidifier: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    // Current Temperature
    if (!this.device.humidifier?.hide_temperature) {
      this.CurrentTemperature = Number(this.deviceStatus.body.temperature);
      this.platform.debug(`Humidifier: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
    }
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
    this.platform.debug(`Humidifier: ${this.accessory.displayName} TargetHumidifierDehumidifierState: ${this.TargetHumidifierDehumidifierState}`);
    this.platform.debug(`Humidifier: ${this.accessory.displayName} RelativeHumidityHumidifierThreshold: ${this.RelativeHumidityHumidifierThreshold}`);
    this.platform.debug(`Humidifier: ${this.accessory.displayName} CurrentHumidifierDehumidifierState: ${this.CurrentHumidifierDehumidifierState}`);
    // Active
    switch (this.deviceStatus.body.power) {
      case 'on':
        this.Active = this.platform.Characteristic.Active.ACTIVE;
        break;
      default:
        this.Active = this.platform.Characteristic.Active.INACTIVE;
    }
    this.platform.debug(`Humidifier: ${this.accessory.displayName} Active: ${this.Active}`);
    // Water Level
    if (this.deviceStatus.body.lackWater) {
      this.WaterLevel = 0;
    } else {
      this.WaterLevel = 100;
    }
    this.platform.debug(`Humidifier: ${this.accessory.displayName} WaterLevel: ${this.WaterLevel}`);
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus() {
    if (this.device.ble) {
      await this.BLERefreshStatus();
    } else {
      await this.openAPIRefreshStatus();
    }
  }

  private connectBLE() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Switchbot = require('node-switchbot');
    const switchbot = new Switchbot();
    const colon = this.device.deviceId!.match(/.{1,2}/g);
    const bleMac = colon!.join(':'); //returns 1A:23:B4:56:78:9A;
    this.device.bleMac = bleMac.toLowerCase();
    this.platform.device(this.device.bleMac!);
    return switchbot;
  }

  private async BLERefreshStatus() {
    this.platform.device(`Humidifier: ${this.accessory.displayName} BLE refreshStatus`);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const switchbot = this.connectBLE();
    // Start to monitor advertisement packets
    switchbot.startScan({
      model: 'e',
      id: this.device.bleMac,
    }).then(() => {
      // Set an event hander
      switchbot.onadvertisement = (ad: ad) => {
        this.serviceData = ad.serviceData;
        this.autoMode = ad.serviceData.autoMode;
        this.onState = ad.serviceData.onState;
        this.percentage = ad.serviceData.percentage;
        this.platform.device(`Humidifier: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        this.platform.device(`Humidifier: ${this.accessory.displayName} model: ${ad.serviceData.model}, modelName: ${ad.serviceData.modelName},`
          + `autoMode: ${ad.serviceData.autoMode}, onState: ${ad.serviceData.onState}, percentage: ${ad.serviceData.percentage}`);
      };
      // Wait 10 seconds
      return switchbot.wait(10000);
    }).then(() => {
      // Stop to monitor
      switchbot.stopScan();
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    }).catch(async (e: any) => {
      this.platform.log.error(`Humidifier: ${this.accessory.displayName} BLE Connection failed, Error Message: ${JSON.stringify(e.message)}`);
      this.platform.log.warn(`Humidifier: ${this.accessory.displayName} Using OpenAPI Connection`);
      await this.openAPIRefreshStatus();
    });
  }

  private async openAPIRefreshStatus() {
    this.platform.device(`Humidifier: ${this.accessory.displayName} OpenAPI refreshStatus`);
    try {
      this.deviceStatus = (await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)).data;
      if (this.deviceStatus.message === 'success') {
        this.platform.debug(`Humidifier: ${this.accessory.displayName} refreshStatus: ${JSON.stringify(this.deviceStatus)}`);
        this.parseStatus();
        this.updateHomeKitCharacteristics();
      } else {
        this.platform.debug(this.deviceStatus);
      }
    } catch (e: any) {
      this.platform.log.error(`Humidifier: ${this.accessory.displayName} Failed to update status. Error Message: ${JSON.stringify(e.message)}`);
      this.platform.debug(`Humidifier: ${this.accessory.displayName} Error: ${JSON.stringify(e)}`);
      this.apiError(e);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   */
  async pushChanges() {
    //if (this.device.ble) {
    //  await this.BLEpushChanges();
    //} else {
    await this.OpenAPIpushChanges();
    //}
    this.refreshStatus();
  }

  private async BLEpushChanges() {
    this.platform.debug(`Humidifier: ${this.accessory.displayName} BLE pushChanges`);
    const switchbot = this.connectBLE();
    switchbot.discover({ model: 'e', quick: true, id: this.device.bleMac }).then((device_list) => {
      this.platform.log.info(`${this.accessory.displayName} Target Position: ${this.Active}`);
      return device_list[0].runToPos(100 - Number(this.Active));
    }).then(() => {
      this.platform.device('Done.');
    }).catch(async (e: any) => {
      this.platform.log.error(`Humidifier: ${this.accessory.displayName} BLE Connection failed, Error Message: ${JSON.stringify(e.message)}`);
      this.platform.log.warn(`Humidifier: ${this.accessory.displayName} Using OpenAPI Connection`);
      await this.OpenAPIpushChanges();
    });
  }

  private async OpenAPIpushChanges() {
    this.platform.device(`Humidifier: ${this.accessory.displayName} OpenAPI pushChanges`);
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
      } as payload;

      this.platform.log.info(`Humidifier: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},`
        + ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`);

      // Make the API request
      const push: any = (await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload));
      this.platform.debug(`Humidifier: ${this.accessory.displayName} pushChanges: ${JSON.stringify(push.data)}`);
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
        } as payload;

        this.platform.log.info(`Humidifier: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},`
          + ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`);

        // Make the API request
        const push: any = (await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload));
        this.platform.debug(`Humidifier: ${this.accessory.displayName} pushAutoChanges: ${JSON.stringify(push.data)}`);
        this.statusCode(push);
      }
    } catch (e: any) {
      this.platform.log.error(`Humidifier: ${this.accessory.displayName} failed to pushAutoChanges,`
        + ` Error Message: ${JSON.stringify(e.message)}`);
      this.platform.debug(`Humidifier: ${this.accessory.displayName} Error: ${JSON.stringify(e)}`);
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
        } as payload;

        this.platform.log.info(`Humidifier: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},`
          + ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`);

        // Make the API request
        const push: any = (await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload));
        this.platform.debug(`Humidifier: ${this.accessory.displayName} pushActiveChanges: ${JSON.stringify(push.data)}`);
        this.statusCode(push);
      }
    } catch (e: any) {
      this.platform.log.error(`Humidifier: ${this.accessory.displayName} failed to pushActiveChanges,`
        + ` Error Message: ${JSON.stringify(e.message)}`);
      this.platform.debug(`Humidifier: ${this.accessory.displayName} Error: ${JSON.stringify(e)}`);
      this.apiError(e);
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    if (this.CurrentRelativeHumidity === undefined) {
      this.platform.debug(`Humidifier: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
      this.platform.device(`Humidifier": ${this.accessory.displayName}`
        + ` updateCharacteristic CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    }
    if (!this.device.ble) {
      if (this.WaterLevel === undefined) {
        this.platform.debug(`Humidifier: ${this.accessory.displayName} WaterLevel: ${this.WaterLevel}`);
      } else {
        this.service.updateCharacteristic(this.platform.Characteristic.WaterLevel, this.WaterLevel);
        this.platform.device(`Humidifier: ${this.accessory.displayName} updateCharacteristic WaterLevel: ${this.WaterLevel}`);
      }
    }
    if (this.CurrentHumidifierDehumidifierState === undefined) {
      this.platform.debug(`Humidifier: ${this.accessory.displayName} CurrentHumidifierDehumidifierState: ${this.CurrentHumidifierDehumidifierState}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentHumidifierDehumidifierState, this.CurrentHumidifierDehumidifierState);
      this.platform.device(`Humidifier: ${this.accessory.displayName}`
        + ` updateCharacteristic CurrentHumidifierDehumidifierState: ${this.CurrentHumidifierDehumidifierState}`);
    }
    if (this.TargetHumidifierDehumidifierState === undefined) {
      this.platform.debug(`Humidifier: ${this.accessory.displayName} TargetHumidifierDehumidifierState: ${this.TargetHumidifierDehumidifierState}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState, this.TargetHumidifierDehumidifierState);
      this.platform.device(`Humidifier: ${this.accessory.displayName}`
        + ` updateCharacteristic TargetHumidifierDehumidifierState: ${this.TargetHumidifierDehumidifierState}`);
    }
    if (this.Active === undefined) {
      this.platform.debug(`Humidifier: ${this.accessory.displayName} Active: ${this.Active}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
      this.platform.device(`Humidifier: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`);
    }
    if (this.RelativeHumidityHumidifierThreshold === undefined) {
      this.platform.debug(`Humidifier: ${this.accessory.displayName}`
        + ` RelativeHumidityHumidifierThreshold: ${this.RelativeHumidityHumidifierThreshold}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.RelativeHumidityHumidifierThreshold, this.RelativeHumidityHumidifierThreshold);
      this.platform.device(`Humidifier: ${this.accessory.displayName}`
        + ` updateCharacteristic RelativeHumidityHumidifierThreshold: ${this.RelativeHumidityHumidifierThreshold}`);
    }
    if (!this.device.humidifier?.hide_temperature && !this.device.ble) {
      if (this.CurrentTemperature === undefined) {
        this.platform.debug(`Humidifier: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
      } else {
        this.temperatureservice!.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
        this.platform.device(`Humidifier: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`);
      }
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, e);
    if (!this.device.ble) {
      this.service.updateCharacteristic(this.platform.Characteristic.WaterLevel, e);
    }
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentHumidifierDehumidifierState, e);
    this.service.updateCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState, e);
    this.service.updateCharacteristic(this.platform.Characteristic.Active, e);
    this.service.updateCharacteristic(this.platform.Characteristic.RelativeHumidityHumidifierThreshold, e);
    if (!this.device.humidifier?.hide_temperature && !this.device.ble) {
      this.temperatureservice!.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, e);
    }
  }

  private statusCode(push: AxiosResponse<{ statusCode: number; }>) {
    switch (push.data.statusCode) {
      case 151:
        this.platform.log.error(`Humidifier: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.platform.log.error(`Humidifier: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.platform.log.error(`Humidifier: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.platform.log.error(`Humidifier: ${this.accessory.displayName} Device is offline.`);
        break;
      case 171:
        this.platform.log.error(`Humidifier: ${this.accessory.displayName} Hub Device is offline.`);
        break;
      case 190:
        // eslint-disable-next-line max-len
        this.platform.log.error(`Humidifier: ${this.accessory.displayName} Device internal error due to device states not synchronized with server. Or command fomrat is invalid.`);
        break;
      case 100:
        this.platform.debug(`Humidifier: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.platform.debug(`Humidifier: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  /**
   * Handle requests to set the "Target Humidifier Dehumidifier State" characteristic
   */
  private handleTargetHumidifierDehumidifierStateSet(value: CharacteristicValue) {
    this.platform.debug(`Humidifier: ${this.accessory.displayName} TargetHumidifierDehumidifierState: ${value}`);

    this.TargetHumidifierDehumidifierState = value;
    this.doHumidifierUpdate.next();
  }

  /**
   * Handle requests to set the "Active" characteristic
   */
  private handleActiveSet(value: CharacteristicValue) {
    this.platform.debug(`Humidifier: ${this.accessory.displayName} Active: ${value}`);
    this.Active = value;
    this.doHumidifierUpdate.next();
  }

  /**
   * Handle requests to set the "Relative Humidity Humidifier Threshold" characteristic
   */
  private handleRelativeHumidityHumidifierThresholdSet(value: CharacteristicValue) {
    this.platform.debug(`Humidifier: ${this.accessory.displayName} RelativeHumidityHumidifierThreshold: ${value}`);

    this.RelativeHumidityHumidifierThreshold = value;
    if (this.Active === this.platform.Characteristic.Active.INACTIVE) {
      this.Active = this.platform.Characteristic.Active.ACTIVE;
      this.CurrentHumidifierDehumidifierState = this.platform.Characteristic.CurrentHumidifierDehumidifierState.IDLE;
    }
    this.doHumidifierUpdate.next();
  }
}
