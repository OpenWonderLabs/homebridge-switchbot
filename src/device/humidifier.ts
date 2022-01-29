import { AxiosResponse } from 'axios';
import { interval, Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { DeviceURL, device, devicesConfig, serviceData, ad, deviceStatusResponse, payload, deviceStatus } from '../settings';

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
  auto: deviceStatus['auto'];
  power: deviceStatus['power'];
  humidity: deviceStatus['humidity'];
  lackWater: deviceStatus['lackWater'];
  temperature: deviceStatus['temperature'];
  nebulizationEfficiency: deviceStatus['nebulizationEfficiency'];
  deviceStatus!: deviceStatusResponse;

  // BLE Others
  connected?: boolean;
  serviceData!: serviceData;
  onState!: serviceData['onState'];
  autoMode!: serviceData['autoMode'];
  percentage!: serviceData['percentage'];

  // Config
  set_minStep?: number;
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;

  // Updates
  humidifierUpdateInProgress!: boolean;
  doHumidifierUpdate!: Subject<void>;

  constructor(private readonly platform: SwitchBotPlatform, private accessory: PlatformAccessory, public device: device & devicesConfig) {
    // default placeholders
    this.logs(device);
    this.scan(device);
    this.refreshRate(device);
    this.config(device);
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
      accessory.getService(this.platform.Service.HumidifierDehumidifier) || accessory.addService(this.platform.Service.HumidifierDehumidifier)),
    `${accessory.displayName} Humidifier`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/HumidifierDehumidifier

    // create handlers for required characteristics
    this.service.setCharacteristic(this.platform.Characteristic.CurrentHumidifierDehumidifierState, this.CurrentHumidifierDehumidifierState);

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
      this.debugLog(`Humidifier: ${accessory.displayName} Removing Temperature Sensor Service`);
      this.temperatureservice = this.accessory.getService(this.platform.Service.TemperatureSensor);
      accessory.removeService(this.temperatureservice!);
    } else if (!this.temperatureservice && !device.ble) {
      this.debugLog(`Humidifier: ${accessory.displayName} Add Temperature Sensor Service`);
      (this.temperatureservice =
        this.accessory.getService(this.platform.Service.TemperatureSensor) || this.accessory.addService(this.platform.Service.TemperatureSensor)),
      `${accessory.displayName} Temperature Sensor`;

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
          return this.CurrentTemperature;
        });
    } else {
      this.debugLog(`Humidifier: ${accessory.displayName} Temperature Sensor Service Not Added`);
    }

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
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
          this.errorLog(`Humidifier: ${this.accessory.displayName} failed pushChanges`);
          if (this.deviceLogging === 'debug') {
            this.errorLog(`Humidifier: ${this.accessory.displayName} failed pushChanges,` + ` Error Message: ${JSON.stringify(e.message)}`);
          }
          if (this.platform.debugMode) {
            this.errorLog(`Humidifier: ${this.accessory.displayName} failed pushChanges,` + ` Error: ${JSON.stringify(e)}`);
          }
          this.apiError(e);
        }
        this.humidifierUpdateInProgress = false;
      });
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
    this.debugLog(`Humidifier: ${this.accessory.displayName} BLE parseStatus`);
    // Current Relative Humidity
    this.CurrentRelativeHumidity = this.percentage!;
    this.debugLog(`Humidifier: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    // Active
    if (this.onState) {
      this.Active = this.platform.Characteristic.Active.ACTIVE;
    } else {
      this.Active = this.platform.Characteristic.Active.INACTIVE;
    }
    this.debugLog(`Humidifier: ${this.accessory.displayName} Active: ${this.Active}`);
  }

  private openAPIparseStatus() {
    if (this.platform.config.credentials?.openToken) {
      this.debugLog(`Humidifier: ${this.accessory.displayName} OpenAPI parseStatus`);
      // Current Relative Humidity
      this.CurrentRelativeHumidity = this.humidity!;
      this.debugLog(`Humidifier: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
      // Current Temperature
      if (!this.device.humidifier?.hide_temperature) {
        this.CurrentTemperature = this.temperature!;
        this.debugLog(`Humidifier: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
      }
      // Target Humidifier Dehumidifier State
      switch (this.auto) {
        case true:
          this.TargetHumidifierDehumidifierState = this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER;
          this.CurrentHumidifierDehumidifierState = this.platform.Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING;
          this.RelativeHumidityHumidifierThreshold = this.CurrentRelativeHumidity;
          break;
        default:
          this.TargetHumidifierDehumidifierState = this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER;
          if (this.nebulizationEfficiency! > 100) {
            this.RelativeHumidityHumidifierThreshold = 100;
          } else {
            this.RelativeHumidityHumidifierThreshold = this.nebulizationEfficiency!;
          }
          if (this.CurrentRelativeHumidity > this.RelativeHumidityHumidifierThreshold) {
            this.CurrentHumidifierDehumidifierState = this.platform.Characteristic.CurrentHumidifierDehumidifierState.IDLE;
          } else if (this.Active === this.platform.Characteristic.Active.INACTIVE) {
            this.CurrentHumidifierDehumidifierState = this.platform.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
          } else {
            this.CurrentHumidifierDehumidifierState = this.platform.Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING;
          }
      }
      this.debugLog(`Humidifier: ${this.accessory.displayName} TargetHumidifierDehumidifierState: ${this.TargetHumidifierDehumidifierState}`);
      this.debugLog(
        `Humidifier: ${this.accessory.displayName}` + ` RelativeHumidityHumidifierThreshold: ${this.RelativeHumidityHumidifierThreshold}`,
      );
      this.debugLog(`Humidifier: ${this.accessory.displayName} CurrentHumidifierDehumidifierState: ${this.CurrentHumidifierDehumidifierState}`);
      // Active
      switch (this.power) {
        case 'on':
          this.Active = this.platform.Characteristic.Active.ACTIVE;
          break;
        default:
          this.Active = this.platform.Characteristic.Active.INACTIVE;
      }
      this.debugLog(`Humidifier: ${this.accessory.displayName} Active: ${this.Active}`);
      // Water Level
      if (this.lackWater) {
        this.WaterLevel = 0;
      } else {
        this.WaterLevel = 100;
      }
      this.debugLog(`Humidifier: ${this.accessory.displayName} WaterLevel: ${this.WaterLevel}`);
    }
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

  private async BLERefreshStatus() {
    this.debugLog(`Humidifier: ${this.accessory.displayName} BLE refreshStatus`);
    const switchbot = await this.platform.connectBLE();
    // Convert to BLE Address
    this.device.bleMac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(':')
      .toLowerCase();
    this.debugLog(`Curtain: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    // Start to monitor advertisement packets
    if (switchbot !== false) {
      switchbot
        .startScan({
          model: 'e',
          id: this.device.bleMac,
        })
        .then(() => {
          // Set an event hander
          switchbot.onadvertisement = (ad: ad) => {
            this.serviceData = ad.serviceData;
            this.autoMode = ad.serviceData.autoMode;
            this.onState = ad.serviceData.onState;
            this.percentage = ad.serviceData.percentage;
            this.debugLog(`Humidifier: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
            this.debugLog(
              `Humidifier: ${this.accessory.displayName} model: ${ad.serviceData.model}, modelName: ${ad.serviceData.modelName},` +
                `autoMode: ${ad.serviceData.autoMode}, onState: ${ad.serviceData.onState}, percentage: ${ad.serviceData.percentage}`,
            );

            if (this.serviceData) {
              this.connected = true;
              this.debugLog(`Humidifier: ${this.accessory.displayName} connected: ${this.connected}`);
            } else {
              this.connected = false;
              this.debugLog(`Humidifier: ${this.accessory.displayName} connected: ${this.connected}`);
            }
          };
          // Wait 2 seconds
          return switchbot.wait(this.scanDuration * 1000);
        })
        .then(async () => {
          // Stop to monitor
          switchbot.stopScan();
          if (this.connected) {
            this.parseStatus();
            this.updateHomeKitCharacteristics();
          } else {
            await this.BLEconnection(switchbot);
          }
        })
        .catch(async (e: any) => {
          this.errorLog(`Humidifier: ${this.accessory.displayName} failed refreshStatus with BLE Connection`);
          if (this.deviceLogging === 'debug') {
            this.errorLog(
              `Humidifier: ${this.accessory.displayName} failed refreshStatus with BLE Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
            );
          }
          if (this.platform.debugMode) {
            this.errorLog(`Humidifier: ${this.accessory.displayName} failed refreshStatus with BLE Connection,` + ` Error: ${JSON.stringify(e)}`);
          }
          if (this.platform.config.credentials?.openToken) {
            this.warnLog(`Humidifier: ${this.accessory.displayName} Using OpenAPI Connection`);
            await this.openAPIRefreshStatus();
          }
          this.apiError(e);
        });
    } else {
      await this.BLEconnection(switchbot);
    }
  }

  public async BLEconnection(switchbot: any) {
    this.errorLog(`Humidifier: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`);
    if (this.platform.config.credentials?.openToken) {
      this.warnLog(`Humidifier: ${this.accessory.displayName} Using OpenAPI Connection`);
      await this.openAPIRefreshStatus();
    }
  }

  private async openAPIRefreshStatus() {
    if (this.platform.config.credentials?.openToken) {
      this.debugLog(`Humidifier: ${this.accessory.displayName} OpenAPI refreshStatus`);
      try {
        this.deviceStatus = (await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)).data;
        if (this.deviceStatus.message === 'success') {
          this.debugLog(`Humidifier: ${this.accessory.displayName} refreshStatus: ${JSON.stringify(this.deviceStatus)}`);
          this.auto = this.deviceStatus.body.auto;
          this.power = this.deviceStatus.body.power;
          this.lackWater = this.deviceStatus.body.lackWater;
          this.humidity = this.deviceStatus.body.humidity;
          this.temperature = this.deviceStatus.body.temperature;
          this.nebulizationEfficiency = this.deviceStatus.body.nebulizationEfficiency;
          this.parseStatus();
          this.updateHomeKitCharacteristics();
        } else {
          this.errorLog(`Humidifier: ${this.accessory.displayName} message: ${JSON.stringify(this.deviceStatus.message)}`);
        }
      } catch (e: any) {
        this.errorLog(`Humidifier: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection`);
        if (this.deviceLogging === 'debug') {
          this.errorLog(
            `Humidifier: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,` +
              ` Error Message: ${JSON.stringify(e.message)}`,
          );
        }
        if (this.platform.debugMode) {
          this.errorLog(`Humidifier: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,` + ` Error: ${JSON.stringify(e)}`);
        }
        this.apiError(e);
      }
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   */
  async pushChanges() {
    //if (this.device.ble) {
    //  await this.BLEpushChanges();
    //} else {
    await this.openAPIpushChanges();
    //}
    interval(5000)
      .pipe(skipWhile(() => this.humidifierUpdateInProgress))
      .pipe(take(1))
      .subscribe(() => {
        this.refreshStatus();
      });
  }

  private async BLEpushChanges() {
    this.debugLog(`Humidifier: ${this.accessory.displayName} BLE pushChanges`);
    const switchbot = await this.platform.connectBLE();
    // Convert to BLE Address
    this.device.bleMac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(':')
      .toLowerCase();
    this.debugLog(`Curtain: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    if (switchbot !== false) {
      switchbot
        .discover({ model: 'e', quick: true, id: this.device.bleMac })
        .then((device_list) => {
          this.infoLog(`${this.accessory.displayName} Target Position: ${this.Active}`);
          return device_list[0].percentage(this.RelativeHumidityHumidifierThreshold);
        })
        .then(() => {
          this.debugLog(`Humidifier: ${this.accessory.displayName} Done.`);
        })
        .catch(async (e: any) => {
          this.errorLog(`Humidifier: ${this.accessory.displayName} failed pushChanges with BLE Connection`);
          if (this.deviceLogging === 'debug') {
            this.errorLog(
              `Humidifier: ${this.accessory.displayName} failed pushChanges with BLE Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
            );
          }
          if (this.platform.debugMode) {
            this.errorLog(`Humidifier: ${this.accessory.displayName} failed pushChanges with BLE Connection,` + ` Error: ${JSON.stringify(e)}`);
          }
          if (this.platform.config.credentials?.openToken) {
            this.warnLog(`Humidifier: ${this.accessory.displayName} Using OpenAPI Connection`);
            await this.openAPIpushChanges();
          }
          this.apiError(e);
        });
    } else {
      this.errorLog(`Humidifier: ${this.accessory.displayName} wasn't able to establish BLE Connection`);
      if (this.platform.config.credentials?.openToken) {
        this.warnLog(`Humidifier: ${this.accessory.displayName} Using OpenAPI Connection`);
        await this.openAPIpushChanges();
      }
    }
  }

  private async openAPIpushChanges() {
    if (this.platform.config.credentials?.openToken) {
      this.debugLog(`Humidifier: ${this.accessory.displayName} OpenAPI pushChanges`);
      if (
        this.TargetHumidifierDehumidifierState === this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER &&
        this.Active === this.platform.Characteristic.Active.ACTIVE
      ) {
        try {
          this.debugLog(`Pushing Manual: ${this.RelativeHumidityHumidifierThreshold}!`);
          const payload = {
            commandType: 'command',
            command: 'setMode',
            parameter: `${this.RelativeHumidityHumidifierThreshold}`,
          } as payload;

          this.infoLog(
            `Humidifier: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},` +
              ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`,
          );

          // Make the API request
          const push: any = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
          this.debugLog(`Humidifier: ${this.accessory.displayName} pushChanges: ${JSON.stringify(push.data)}`);
          this.statusCode(push);
        } catch (e: any) {
          this.errorLog(`Humidifier: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection`);
          if (this.deviceLogging === 'debug') {
            this.errorLog(
              `Humidifier: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` +
                ` Error Message: ${JSON.stringify(e.message)}`,
            );
          }
          if (this.platform.debugMode) {
            this.errorLog(`Humidifier: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` + ` Error: ${JSON.stringify(e)}`);
          }
          this.apiError(e);
        }
      } else if (
        this.TargetHumidifierDehumidifierState === this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER &&
        this.Active === this.platform.Characteristic.Active.ACTIVE
      ) {
        await this.pushAutoChanges();
      } else {
        await this.pushActiveChanges();
      }
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   */
  async pushAutoChanges() {
    try {
      if (
        this.TargetHumidifierDehumidifierState === this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER &&
        this.Active === this.platform.Characteristic.Active.ACTIVE
      ) {
        this.debugLog('Pushing Auto!');
        const payload = {
          commandType: 'command',
          command: 'setMode',
          parameter: 'auto',
        } as payload;

        this.infoLog(
          `Humidifier: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},` +
            ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`,
        );

        // Make the API request
        const push: any = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
        this.debugLog(`Humidifier: ${this.accessory.displayName} pushAutoChanges: ${JSON.stringify(push.data)}`);
        this.statusCode(push);
      }
    } catch (e: any) {
      this.errorLog(`Humidifier: ${this.accessory.displayName} failed pushAutoChanges with OpenAPI Connection`);
      if (this.deviceLogging === 'debug') {
        this.errorLog(
          `Humidifier: ${this.accessory.displayName} failed pushAutoChanges with OpenAPI Connection,` +
            ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      if (this.platform.debugMode) {
        this.errorLog(`Humidifier: ${this.accessory.displayName} failed pushAutoChanges with OpenAPI Connection,` + ` Error: ${JSON.stringify(e)}`);
      }
      this.apiError(e);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   */
  async pushActiveChanges() {
    try {
      if (this.Active === this.platform.Characteristic.Active.INACTIVE) {
        this.debugLog('Pushing Off!');
        const payload = {
          commandType: 'command',
          command: 'turnOff',
          parameter: 'default',
        } as payload;

        this.infoLog(
          `Humidifier: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},` +
            ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`,
        );

        // Make the API request
        const push: any = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
        this.debugLog(`Humidifier: ${this.accessory.displayName} pushActiveChanges: ${JSON.stringify(push.data)}`);
        this.statusCode(push);
      }
    } catch (e: any) {
      this.errorLog(`Humidifier: ${this.accessory.displayName} failed pushActiveChanges with OpenAPI Connection`);
      if (this.deviceLogging === 'debug') {
        this.errorLog(
          `Humidifier: ${this.accessory.displayName} failed pushActiveChanges with OpenAPI Connection,` +
            ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      if (this.platform.debugMode) {
        this.errorLog(`Humidifier: ${this.accessory.displayName} failed pushActiveChanges with OpenAPI Connection,` + ` Error: ${JSON.stringify(e)}`);
      }
      this.apiError(e);
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    if (this.CurrentRelativeHumidity === undefined) {
      this.debugLog(`Humidifier: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
      this.debugLog(`Humidifier: ${this.accessory.displayName}` + ` updateCharacteristic CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    }
    if (!this.device.ble) {
      if (this.WaterLevel === undefined) {
        this.debugLog(`Humidifier: ${this.accessory.displayName} WaterLevel: ${this.WaterLevel}`);
      } else {
        this.service.updateCharacteristic(this.platform.Characteristic.WaterLevel, this.WaterLevel);
        this.debugLog(`Humidifier: ${this.accessory.displayName} updateCharacteristic WaterLevel: ${this.WaterLevel}`);
      }
    }
    if (this.CurrentHumidifierDehumidifierState === undefined) {
      this.debugLog(`Humidifier: ${this.accessory.displayName} CurrentHumidifierDehumidifierState: ${this.CurrentHumidifierDehumidifierState}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentHumidifierDehumidifierState, this.CurrentHumidifierDehumidifierState);
      this.debugLog(
        `Humidifier: ${this.accessory.displayName}` +
          ` updateCharacteristic CurrentHumidifierDehumidifierState: ${this.CurrentHumidifierDehumidifierState}`,
      );
    }
    if (this.TargetHumidifierDehumidifierState === undefined) {
      this.debugLog(`Humidifier: ${this.accessory.displayName} TargetHumidifierDehumidifierState: ${this.TargetHumidifierDehumidifierState}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState, this.TargetHumidifierDehumidifierState);
      this.debugLog(
        `Humidifier: ${this.accessory.displayName}` +
          ` updateCharacteristic TargetHumidifierDehumidifierState: ${this.TargetHumidifierDehumidifierState}`,
      );
    }
    if (this.Active === undefined) {
      this.debugLog(`Humidifier: ${this.accessory.displayName} Active: ${this.Active}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
      this.debugLog(`Humidifier: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`);
    }
    if (this.RelativeHumidityHumidifierThreshold === undefined) {
      this.debugLog(
        `Humidifier: ${this.accessory.displayName}` + ` RelativeHumidityHumidifierThreshold: ${this.RelativeHumidityHumidifierThreshold}`,
      );
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.RelativeHumidityHumidifierThreshold, this.RelativeHumidityHumidifierThreshold);
      this.debugLog(
        `Humidifier: ${this.accessory.displayName}` +
          ` updateCharacteristic RelativeHumidityHumidifierThreshold: ${this.RelativeHumidityHumidifierThreshold}`,
      );
    }
    if (!this.device.humidifier?.hide_temperature && !this.device.ble) {
      if (this.CurrentTemperature === undefined) {
        this.debugLog(`Humidifier: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
      } else {
        this.temperatureservice?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
        this.debugLog(`Humidifier: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`);
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
      this.temperatureservice?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, e);
    }
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  private statusCode(push: AxiosResponse<{ statusCode: number }>) {
    switch (push.data.statusCode) {
      case 151:
        this.errorLog(`Humidifier: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.errorLog(`Humidifier: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.errorLog(`Humidifier: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.errorLog(`Humidifier: ${this.accessory.displayName} Device is offline.`);
        this.offlineOff();
        break;
      case 171:
        this.errorLog(`Humidifier: ${this.accessory.displayName} Hub Device is offline. Hub: ${this.device.hubDeviceId}`);
        this.offlineOff();
        break;
      case 190:
        this.errorLog(
          `Humidifier: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
            ` Or command: ${JSON.stringify(push.data)} format is invalid`,
        );
        break;
      case 100:
        this.debugLog(`Humidifier: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.debugLog(`Humidifier: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  offlineOff() {
    if (this.device.offline) {
      this.Active = this.platform.Characteristic.Active.INACTIVE;
      this.service.getCharacteristic(this.platform.Characteristic.Active).updateValue(this.Active);
    }
  }

  /**
   * Handle requests to set the "Target Humidifier Dehumidifier State" characteristic
   */
  handleTargetHumidifierDehumidifierStateSet(value: CharacteristicValue) {
    this.debugLog(`Humidifier: ${this.accessory.displayName} TargetHumidifierDehumidifierState: ${value}`);

    this.TargetHumidifierDehumidifierState = value;
    this.doHumidifierUpdate.next();
  }

  /**
   * Handle requests to set the "Active" characteristic
   */
  handleActiveSet(value: CharacteristicValue) {
    this.debugLog(`Humidifier: ${this.accessory.displayName} Active: ${value}`);
    this.Active = value;
    this.doHumidifierUpdate.next();
  }

  /**
   * Handle requests to set the "Relative Humidity Humidifier Threshold" characteristic
   */
  handleRelativeHumidityHumidifierThresholdSet(value: CharacteristicValue) {
    this.debugLog(`Humidifier: ${this.accessory.displayName} RelativeHumidityHumidifierThreshold: ${value}`);

    this.RelativeHumidityHumidifierThreshold = value;
    if (this.Active === this.platform.Characteristic.Active.INACTIVE) {
      this.Active = this.platform.Characteristic.Active.ACTIVE;
      this.CurrentHumidifierDehumidifierState = this.platform.Characteristic.CurrentHumidifierDehumidifierState.IDLE;
    }
    this.doHumidifierUpdate.next();
  }

  config(device: device & devicesConfig) {
    let config = {};
    if (device.humidifier) {
      config = device.humidifier;
    }
    if (device.ble !== undefined) {
      config['ble'] = device.ble;
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
    if (device.offline !== undefined) {
      config['offline'] = device.offline;
    }
    if (Object.entries(config).length !== 0) {
      this.warnLog(`Humidifier: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  refreshRate(device: device & devicesConfig) {
    if (device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = device.refreshRate;
      this.debugLog(`Humidifier: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options!.refreshRate;
      this.debugLog(`Humidifier: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
    }
  }

  scan(device: device & devicesConfig) {
    if (device.scanDuration) {
      this.scanDuration = this.accessory.context.scanDuration = device.scanDuration;
      if (device.ble) {
        this.debugLog(`Humidifier: ${this.accessory.displayName} Using Device Config scanDuration: ${this.scanDuration}`);
      }
    } else {
      this.scanDuration = this.accessory.context.scanDuration = 1;
      if (this.device.ble) {
        this.debugLog(`Humidifier: ${this.accessory.displayName} Using Default scanDuration: ${this.scanDuration}`);
      }
    }
  }

  logs(device: device & devicesConfig) {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugLog(`Humidifier: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(`Humidifier: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      this.debugLog(`Humidifier: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugLog(`Humidifier: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
    }
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
