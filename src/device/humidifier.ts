import https from 'https';
import crypto from 'crypto';
import { Context } from 'vm';
import { IncomingMessage } from 'http';
import { interval, Subject } from 'rxjs';
import superStringify from 'super-stringify';
import { SwitchBotPlatform } from '../platform';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { device, devicesConfig, serviceData, ad, deviceStatus, HostDomain, DevicePath } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Humidifier {
  // Services
  humidifierService: Service;
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
  deviceStatus!: any; //deviceStatusResponse;

  // BLE Others
  connected?: boolean;
  serviceData!: serviceData;
  address!: ad['address'];
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

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doHumidifierUpdate = new Subject();
    this.humidifierUpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'W0801800')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision(accessory, device))
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
      .updateValue(this.FirmwareRevision(accessory, device));

    // get the service if it exists, otherwise create a new service
    // you can create multiple services for each accessory
    (this.humidifierService =
      accessory.getService(this.platform.Service.HumidifierDehumidifier) || accessory.addService(this.platform.Service.HumidifierDehumidifier)),
    `${accessory.displayName} Humidifier`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.HumidifierDehumidifier, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.humidifierService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/HumidifierDehumidifier

    // create handlers for required characteristics
    this.humidifierService.setCharacteristic(
      this.platform.Characteristic.CurrentHumidifierDehumidifierState,
      this.CurrentHumidifierDehumidifierState,
    );

    this.humidifierService
      .getCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState)
      .setProps({
        validValueRanges: [0, 1],
        minValue: 0,
        maxValue: 1,
        validValues: [0, 1],
      })
      .onSet(this.TargetHumidifierDehumidifierStateSet.bind(this));

    this.humidifierService.getCharacteristic(this.platform.Characteristic.Active).onSet(this.ActiveSet.bind(this));

    this.humidifierService
      .getCharacteristic(this.platform.Characteristic.RelativeHumidityHumidifierThreshold)
      .setProps({
        validValueRanges: [0, 100],
        minValue: 0,
        maxValue: 100,
        minStep: this.minStep(),
      })
      .onSet(this.RelativeHumidityHumidifierThresholdSet.bind(this));

    // Temperature Sensor Service
    if (device.humidifier?.hide_temperature || this.BLE) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Temperature Sensor Service`);
      this.temperatureservice = this.accessory.getService(this.platform.Service.TemperatureSensor);
      accessory.removeService(this.temperatureservice!);
    } else if (!this.temperatureservice && !this.BLE) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Temperature Sensor Service`);
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
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Temperature Sensor Service Not Added`);
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
          this.apiError(e);
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType} Connection,`
              + ` Error Message: ${superStringify(e.message)}`);
        }
        this.humidifierUpdateInProgress = false;
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
    // Current Relative Humidity
    this.CurrentRelativeHumidity = this.percentage!;
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    // Active
    if (this.onState) {
      this.Active = this.platform.Characteristic.Active.ACTIVE;
    } else {
      this.Active = this.platform.Characteristic.Active.INACTIVE;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Active: ${this.Active}`);
  }

  async openAPIparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
    // Current Relative Humidity
    this.CurrentRelativeHumidity = this.humidity!;
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    // Current Temperature
    if (!this.device.humidifier?.hide_temperature) {
      this.CurrentTemperature = this.temperature!;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
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
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
      + ` TargetHumidifierDehumidifierState: ${this.TargetHumidifierDehumidifierState}`);
    this.debugLog(
      `${this.device.deviceType}: ${this.accessory.displayName}`
        + ` RelativeHumidityHumidifierThreshold: ${this.RelativeHumidityHumidifierThreshold}`,
    );
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
      + ` CurrentHumidifierDehumidifierState: ${this.CurrentHumidifierDehumidifierState}`);
    // Active
    switch (this.power) {
      case 'on':
        this.Active = this.platform.Characteristic.Active.ACTIVE;
        break;
      default:
        this.Active = this.platform.Characteristic.Active.INACTIVE;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Active: ${this.Active}`);
    // Water Level
    if (this.lackWater) {
      this.WaterLevel = 0;
    } else {
      this.WaterLevel = 100;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} WaterLevel: ${this.WaterLevel}`);

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
          model: 'e',
          id: this.device.bleMac,
        })
        .then(async () => {
          // Set an event hander
          switchbot.onadvertisement = async (ad: ad) => {
            this.address = ad.address;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac},`
            + ` BLE Address Found: ${this.address}`);
            this.serviceData = ad.serviceData;
            this.autoMode = ad.serviceData.autoMode;
            this.onState = ad.serviceData.onState;
            this.percentage = ad.serviceData.percentage;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${superStringify(ad.serviceData)}`);
            this.debugLog(
              `${this.device.deviceType}: ${this.accessory.displayName} model: ${ad.serviceData.model}, modelName: ${ad.serviceData.modelName},` +
                `autoMode: ${ad.serviceData.autoMode}, onState: ${ad.serviceData.onState}, percentage: ${ad.serviceData.percentage}`,
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
            this.auto = this.deviceStatus.body.auto;
            this.power = this.deviceStatus.body.power;
            this.lackWater = this.deviceStatus.body.lackWater;
            this.humidity = this.deviceStatus.body.humidity;
            this.temperature = this.deviceStatus.body.temperature;
            this.nebulizationEfficiency = this.deviceStatus.body.nebulizationEfficiency;
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
   * Pushes the requested changes to the SwitchBot API
   */
  async pushChanges(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} pushChanges enableCloudService: ${this.device.enableCloudService}`);
    } else /*if (this.BLE) {
      await this.BLEpushChanges();
    } else*/ if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges();
    } else {
      await this.offlineOff();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:`
      + ` ${this.device.connectionType}, pushChanges will not happen.`);
    }
    interval(5000)
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus();
      });
  }

  async BLEpushChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges`);
    const switchbot = await this.platform.connectBLE();
    // Convert to BLE Address
    this.device.bleMac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(':')
      .toLowerCase();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    switchbot
      .discover({
        model: 'e',
        quick: true,
        id: this.device.bleMac,
      })
      .then((device_list: any) => {
        this.infoLog(`${this.accessory.displayName} Target Position: ${this.Active}`);
        return device_list[0].percentage(this.RelativeHumidityHumidifierThreshold);
      })
      .then(() => {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
      })
      .catch(async (e: any) => {
        this.apiError(e);
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}`
      + ` Connection, Error Message: ${superStringify(e.message)}`);
        await this.BLEPushConnection();
      });
  }

  async openAPIpushChanges(): Promise<void> {
    try {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);
      if (this.TargetHumidifierDehumidifierState === this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER &&
        this.Active === this.platform.Characteristic.Active.ACTIVE) {
      // Make Push On request to the API
        const t = Date.now();
        const nonce = 'requestID';
        const data = this.platform.config.credentials?.token + t + nonce;
        const signTerm = crypto.createHmac('sha256', this.platform.config.credentials?.secret)
          .update(Buffer.from(data, 'utf-8'))
          .digest();
        const sign = signTerm.toString('base64');
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} sign: ${sign}`);
        this.debugLog(`Pushing Manual: ${this.RelativeHumidityHumidifierThreshold}!`);
        const body = superStringify({
          'command': 'setMode',
          'parameter': `${this.RelativeHumidityHumidifierThreshold}`,
          'commandType': 'command',
        });
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${body},`);
        const options = {
          hostname: HostDomain,
          port: 443,
          path: `${DevicePath}/${this.device.deviceId}/commands`,
          method: 'POST',
          headers: {
            'Authorization': this.platform.config.credentials?.token,
            'sign': sign,
            'nonce': nonce,
            't': t,
            'Content-Type': 'application/json',
            'Content-Length': body.length,
          },
        };
        const req = https.request(options, res => {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges statusCode: ${res.statusCode}`);
          res.on('data', d => {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} d: ${d}`);
          });
        });
        req.on('error', (e: any) => {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} error message: ${e.message}`);
          this.apiError(e);
        });
        req.write(body);
        req.end();
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges: ${superStringify(req)}`);
      } else if (
        this.TargetHumidifierDehumidifierState === this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER &&
        this.Active === this.platform.Characteristic.Active.ACTIVE
      ) {
        await this.pushAutoChanges();
      } else {
        await this.pushActiveChanges();
      }
    } catch (e: any) {
      this.apiError(e);
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIpushChanges with ${this.device.connectionType}`
        + ` Connection, Error Message: ${superStringify(e.message)}`);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   */
  async pushAutoChanges(): Promise<void> {
    try {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} pushAutoChanges`);
      if (
        this.TargetHumidifierDehumidifierState === this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER &&
        this.Active === this.platform.Characteristic.Active.ACTIVE
      ) {
        // Make Push On request to the API
        const t = Date.now();
        const nonce = 'requestID';
        const data = this.platform.config.credentials?.token + t + nonce;
        const signTerm = crypto.createHmac('sha256', this.platform.config.credentials?.secret)
          .update(Buffer.from(data, 'utf-8'))
          .digest();
        const sign = signTerm.toString('base64');
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} sign: ${sign}`);
        this.debugLog('Pushing Auto!');
        const body = superStringify({
          'command': 'setMode',
          'parameter': 'auto',
          'commandType': 'command',
        });
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${body},`);
        const options = {
          hostname: HostDomain,
          port: 443,
          path: `${DevicePath}/${this.device.deviceId}/commands`,
          method: 'POST',
          headers: {
            'Authorization': this.platform.config.credentials?.token,
            'sign': sign,
            'nonce': nonce,
            't': t,
            'Content-Type': 'application/json',
            'Content-Length': body.length,
          },
        };
        const req = https.request(options, res => {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${res.statusCode}`);
          this.statusCode({ res });
          res.on('data', d => {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} d: ${d}`);
          });
        });
        req.on('error', (e: any) => {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} error message: ${e.message}`);
        });
        req.write(body);
        req.end();
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} pushAutoChanges: ${superStringify(req)}`);
      } else {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No pushAutoChanges.` +
            `TargetHumidifierDehumidifierState: ${this.TargetHumidifierDehumidifierState}, Active: ${this.Active}`);
      }
    } catch (e: any) {
      this.apiError(e);
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushAutoChanges with ${this.device.connectionType}`
          + ` Connection, Error Message: ${superStringify(e.message)}`);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   */
  async pushActiveChanges(): Promise<void> {
    try {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} pushActiveChanges`);
      if (this.Active === this.platform.Characteristic.Active.INACTIVE) {
        // Make Push On request to the API
        const t = Date.now();
        const nonce = 'requestID';
        const data = this.platform.config.credentials?.token + t + nonce;
        const signTerm = crypto.createHmac('sha256', this.platform.config.credentials?.secret)
          .update(Buffer.from(data, 'utf-8'))
          .digest();
        const sign = signTerm.toString('base64');
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} sign: ${sign}`);
        this.debugLog('Pushing Off!');
        const body = superStringify({
          'command': 'turnOff',
          'parameter': 'default',
          'commandType': 'command',
        });
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${body},`);
        const options = {
          hostname: HostDomain,
          port: 443,
          path: `${DevicePath}/${this.device.deviceId}/commands`,
          method: 'POST',
          headers: {
            'Authorization': this.platform.config.credentials?.token,
            'sign': sign,
            'nonce': nonce,
            't': t,
            'Content-Type': 'application/json',
            'Content-Length': body.length,
          },
        };
        const req = https.request(options, res => {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} pushActiveChanges statusCode: ${res.statusCode}`);
          this.statusCode({ res });
          res.on('data', d => {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} d: ${d}`);
          });
        });
        req.on('error', (e: any) => {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} error message: ${e.message}`);
        });
        req.write(body);
        req.end();
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} pushActiveChanges: ${superStringify(req)}`);
      }
    } catch (e: any) {
      this.apiError(e);
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushActiveChanges with ${this.device.connectionType}`
          + ` Connection, Error Message: ${superStringify(e.message)}`,
      );
    }
  }

  /**
   * Handle requests to set the "Active" characteristic
   */
  async ActiveSet(value: CharacteristicValue): Promise<void> {
    if (this.Active === this.accessory.context.Active) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set Active: ${value}`);
    } else {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Active: ${value}`);
    }

    this.Active = value;
    this.doHumidifierUpdate.next();
  }

  /**
   * Handle requests to set the "Target Humidifier Dehumidifier State" characteristic
   */
  async TargetHumidifierDehumidifierStateSet(value: CharacteristicValue): Promise<void> {
    if (this.Active === this.platform.Characteristic.Active.ACTIVE) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set TargetHumidifierDehumidifierState: ${value}`);
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Set TargetHumidifierDehumidifierState: ${value}`);
    }

    this.TargetHumidifierDehumidifierState = value;
    this.doHumidifierUpdate.next();
  }

  /**
   * Handle requests to set the "Relative Humidity Humidifier Threshold" characteristic
   */
  async RelativeHumidityHumidifierThresholdSet(value: CharacteristicValue): Promise<void> {
    if (this.Active === this.platform.Characteristic.Active.ACTIVE) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set RelativeHumidityHumidifierThreshold: ${value}`);
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Set RelativeHumidityHumidifierThreshold: ${value}`);
    }

    this.RelativeHumidityHumidifierThreshold = value;
    if (this.Active === this.platform.Characteristic.Active.INACTIVE) {
      this.Active = this.platform.Characteristic.Active.ACTIVE;
      this.CurrentHumidifierDehumidifierState = this.platform.Characteristic.CurrentHumidifierDehumidifierState.IDLE;
    }
    this.doHumidifierUpdate.next();
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    if (this.CurrentRelativeHumidity === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    } else {
      this.humidifierService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
      + ` updateCharacteristic CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
      this.accessory.context.CurrentRelativeHumidity = this.CurrentRelativeHumidity;
    }
    if (this.OpenAPI) {
      if (this.WaterLevel === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} WaterLevel: ${this.WaterLevel}`);
      } else {
        this.humidifierService.updateCharacteristic(this.platform.Characteristic.WaterLevel, this.WaterLevel);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic WaterLevel: ${this.WaterLevel}`);
        this.accessory.context.WaterLevel = this.WaterLevel;
      }
    }
    if (this.CurrentHumidifierDehumidifierState === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
      + ` CurrentHumidifierDehumidifierState: ${this.CurrentHumidifierDehumidifierState}`);
    } else {
      this.humidifierService.updateCharacteristic(this.platform.Characteristic.CurrentHumidifierDehumidifierState,
        this.CurrentHumidifierDehumidifierState);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}` +
          ` updateCharacteristic CurrentHumidifierDehumidifierState: ${this.CurrentHumidifierDehumidifierState}`);
      this.accessory.context.CurrentHumidifierDehumidifierState = this.CurrentHumidifierDehumidifierState;
    }
    if (this.TargetHumidifierDehumidifierState === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
      +` TargetHumidifierDehumidifierState: ${this.TargetHumidifierDehumidifierState}`);
    } else {
      this.humidifierService.updateCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState,
        this.TargetHumidifierDehumidifierState);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}` +
          ` updateCharacteristic TargetHumidifierDehumidifierState: ${this.TargetHumidifierDehumidifierState}`);
      this.accessory.context.TargetHumidifierDehumidifierState = this.TargetHumidifierDehumidifierState;
    }
    if (this.Active === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Active: ${this.Active}`);
    } else {
      this.humidifierService.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`);
      this.accessory.context.Active = this.Active;
    }
    if (this.RelativeHumidityHumidifierThreshold === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
        + ` RelativeHumidityHumidifierThreshold: ${this.RelativeHumidityHumidifierThreshold}`);
    } else {
      this.humidifierService.updateCharacteristic(this.platform.Characteristic.RelativeHumidityHumidifierThreshold,
        this.RelativeHumidityHumidifierThreshold);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}` +
          ` updateCharacteristic RelativeHumidityHumidifierThreshold: ${this.RelativeHumidityHumidifierThreshold}`);
      this.accessory.context.RelativeHumidityHumidifierThreshold = this.RelativeHumidityHumidifierThreshold;
    }
    if (!this.device.humidifier?.hide_temperature && !this.BLE) {
      if (this.CurrentTemperature === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
      } else {
        this.temperatureservice?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`);
        this.accessory.context.CurrentTemperature = this.CurrentTemperature;
      }
    }
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
          model: 'e',
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

  async BLEPushConnection() {
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Push Changes`);
      await this.openAPIpushChanges();
    }
  }

  async BLERefreshConnection(switchbot: any): Promise<void> {
    this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`);
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Refresh Status`);
      await this.openAPIRefreshStatus();
    }
  }

  minStep(): number {
    if (this.device.humidifier?.set_minStep) {
      this.set_minStep = this.device.humidifier?.set_minStep;
    } else {
      this.set_minStep = 1;
    }
    return this.set_minStep;
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
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Hub Device is offline. Hub: ${this.device.hubDeviceId}`);
        await this.offlineOff();
        break;
      case 190:
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
            ` Or command: ${superStringify(res)} format is invalid`,
        );
        break;
      case 100:
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  async offlineOff(): Promise<void> {
    this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} offline: ${this.device.offline}`);
    if (this.device.offline) {
      await this.context();
      if (this.CurrentTemperature === undefined) {
        this.CurrentTemperature = 0;
      }
      await this.updateHomeKitCharacteristics();
    }
  }

  async apiError(e: any): Promise<void> {
    this.humidifierService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, e);
    if (!this.BLE) {
      this.humidifierService.updateCharacteristic(this.platform.Characteristic.WaterLevel, e);
    }
    this.humidifierService.updateCharacteristic(this.platform.Characteristic.CurrentHumidifierDehumidifierState, e);
    this.humidifierService.updateCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState, e);
    this.humidifierService.updateCharacteristic(this.platform.Characteristic.Active, e);
    this.humidifierService.updateCharacteristic(this.platform.Characteristic.RelativeHumidityHumidifierThreshold, e);
    if (!this.device.humidifier?.hide_temperature && !this.BLE) {
      this.temperatureservice?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, e);
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
    if (this.Active === undefined) {
      this.Active = this.platform.Characteristic.Active.ACTIVE;
    } else {
      this.Active = this.accessory.context.Active;
    }
    if (this.CurrentTemperature === undefined) {
      this.CurrentTemperature = 30;
    } else {
      this.CurrentTemperature = this.accessory.context.CurrentTemperature;
    }
    if (this.CurrentRelativeHumidity === undefined) {
      this.CurrentRelativeHumidity = 0;
    } else {
      this.CurrentRelativeHumidity = this.accessory.context.CurrentRelativeHumidity;
    }
    if (this.TargetHumidifierDehumidifierState === undefined) {
      this.TargetHumidifierDehumidifierState = this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER;
    } else if (this.accessory.context.TargetHumidifierDehumidifierState === undefined) {
      this.TargetHumidifierDehumidifierState = this.platform.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER;
    } else {
      this.TargetHumidifierDehumidifierState = this.accessory.context.TargetHumidifierDehumidifierState;
    }
    if (this.CurrentHumidifierDehumidifierState === undefined) {
      this.CurrentHumidifierDehumidifierState = this.platform.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
    } else if (this.accessory.context.CurrentHumidifierDehumidifierState === undefined) {
      this.CurrentHumidifierDehumidifierState = this.platform.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
    } else {
      this.CurrentHumidifierDehumidifierState = this.accessory.context.CurrentHumidifierDehumidifierState;
    }
    if (this.RelativeHumidityHumidifierThreshold === undefined) {
      this.RelativeHumidityHumidifierThreshold = 0;
    } else {
      this.RelativeHumidityHumidifierThreshold = this.accessory.context.RelativeHumidityHumidifierThreshold;
    }
    if (this.WaterLevel === undefined) {
      this.WaterLevel = 0;
    } else {
      this.WaterLevel = this.accessory.context.WaterLevel;
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
    if (device.humidifier) {
      config = device.humidifier;
    }
    if (device.connectionType !== undefined) {
      config['connectionType'] = device.connectionType;
    }
    if (device.external !== undefined) {
      config['external'] = device.external;
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
  async infoLog(...log: any[]): Promise<void> {
    if (this.enablingDeviceLogging()) {
      this.platform.log.info(String(...log));
    }
  }

  async warnLog(...log: any[]): Promise<void> {
    if (this.enablingDeviceLogging()) {
      this.platform.log.warn(String(...log));
    }
  }

  async debugWarnLog(...log: any[]): Promise<void> {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging?.includes('debug')) {
        this.platform.log.warn('[DEBUG]', String(...log));
      }
    }
  }

  async errorLog(...log: any[]): Promise<void> {
    if (this.enablingDeviceLogging()) {
      this.platform.log.error(String(...log));
    }
  }

  async debugErrorLog(...log: any[]): Promise<void> {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging?.includes('debug')) {
        this.platform.log.error('[DEBUG]', String(...log));
      }
    }
  }

  async debugLog(...log: any[]): Promise<void> {
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
