import { request } from 'undici';
import { deviceBase } from './device.js';
import { interval, Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform.js';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { device, devicesConfig, serviceData, deviceStatus, Devices } from '../settings.js';
import { convertUnits } from '../utils.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Humidifier extends deviceBase {
  // Services
  private HumidifierDehumidifier: {
    Service: Service;
    Active: CharacteristicValue;
    WaterLevel: CharacteristicValue;
    CurrentRelativeHumidity: CharacteristicValue;
    TargetHumidifierDehumidifierState: CharacteristicValue;
    CurrentHumidifierDehumidifierState: CharacteristicValue;
    RelativeHumidityHumidifierThreshold: CharacteristicValue;
  };

  private TemperatureSensor?: {
    Service: Service;
    CurrentTemperature: CharacteristicValue;
  };

  // Updates
  humidifierUpdateInProgress!: boolean;
  doHumidifierUpdate!: Subject<void>;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device);
    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doHumidifierUpdate = new Subject();
    this.humidifierUpdateInProgress = false;

    // Initialize the HumidifierDehumidifier Service
    this.HumidifierDehumidifier = {
      Service: accessory.getService(this.hap.Service.HumidifierDehumidifier)!,
      Active: accessory.context.Active || this.hap.Characteristic.Active.ACTIVE,
      WaterLevel: accessory.context.WaterLevel || 100,
      CurrentRelativeHumidity: accessory.context.CurrentRelativeHumidity || 50,
      TargetHumidifierDehumidifierState: accessory.context.TargetHumidifierDehumidifierState
        || this.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER,
      CurrentHumidifierDehumidifierState: accessory.context.CurrentHumidifierDehumidifierState
        || this.hap.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE,
      RelativeHumidityHumidifierThreshold: accessory.context.RelativeHumidityHumidifierThreshold || 50,
    };

    // Initialize the Temperature Sensor Service
    if (!device.humidifier?.hide_temperature) {
      this.TemperatureSensor = {
        Service: accessory.getService(this.hap.Service.TemperatureSensor)!,
        CurrentTemperature: accessory.context.CurrentTemperature || 30,
      };
    }

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // get the service if it exists, otherwise create a new service
    // you can create multiple services for each accessory
    const HumidifierDehumidifierService = `${accessory.displayName} Humidifier`;
    (this.HumidifierDehumidifier.Service = accessory.getService(this.hap.Service.HumidifierDehumidifier)
      || accessory.addService(this.hap.Service.HumidifierDehumidifier)), HumidifierDehumidifierService;

    this.HumidifierDehumidifier.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/HumidifierDehumidifier

    // create handlers for required characteristics
    this.HumidifierDehumidifier.Service.setCharacteristic(
      this.hap.Characteristic.CurrentHumidifierDehumidifierState,
      this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState,
    );

    this.HumidifierDehumidifier.Service
      .getCharacteristic(this.hap.Characteristic.TargetHumidifierDehumidifierState)
      .setProps({
        validValueRanges: [0, 1],
        minValue: 0,
        maxValue: 1,
        validValues: [0, 1],
      })
      .onSet(this.TargetHumidifierDehumidifierStateSet.bind(this));

    this.HumidifierDehumidifier.Service.getCharacteristic(this.hap.Characteristic.Active).onSet(this.ActiveSet.bind(this));

    this.HumidifierDehumidifier.Service
      .getCharacteristic(this.hap.Characteristic.RelativeHumidityHumidifierThreshold)
      .setProps({
        validValueRanges: [0, 100],
        minValue: 0,
        maxValue: 100,
        minStep: this.minStep(device),
      })
      .onSet(this.RelativeHumidityHumidifierThresholdSet.bind(this));

    // Temperature Sensor Service
    if (device.humidifier?.hide_temperature || this.BLE) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Temperature Sensor Service`);
      this.TemperatureSensor!.Service = this.accessory.getService(this.hap.Service.TemperatureSensor) as Service;
      accessory.removeService(this.TemperatureSensor!.Service);
    } else if (!this.TemperatureSensor?.Service && !this.BLE) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Temperature Sensor Service`);
      const TemperatureSensorService = `${accessory.displayName} Temperature Sensor`;
      (this.TemperatureSensor!.Service = this.accessory.getService(this.hap.Service.TemperatureSensor)
        || this.accessory.addService(this.hap.Service.TemperatureSensor)), TemperatureSensorService;

      this.TemperatureSensor!.Service.setCharacteristic(this.hap.Characteristic.Name, TemperatureSensorService);
      this.TemperatureSensor!.Service
        .getCharacteristic(this.hap.Characteristic.CurrentTemperature)
        .setProps({
          validValueRanges: [-273.15, 100],
          minValue: -273.15,
          maxValue: 100,
          minStep: 0.1,
        })
        .onGet(() => {
          return this.TemperatureSensor!.CurrentTemperature;
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

    //regisiter webhook event handler
    if (device.webhook) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} is listening webhook.`);
      this.platform.webhookEventHandler[this.device.deviceId] = async (context) => {
        try {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} received Webhook: ${JSON.stringify(context)}`);
          const { temperature, humidity } = context;
          const { CurrentRelativeHumidity } = this.HumidifierDehumidifier;
          const { CurrentTemperature } = this.TemperatureSensor || { CurrentTemperature: undefined };
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ` +
              '(temperature, humidity) = ' +
              `Webhook:(${convertUnits(temperature, context.scale, device.iosensor?.convertUnitTo)}, ${humidity}), ` +
              `current:(${CurrentTemperature}, ${CurrentRelativeHumidity})`);
          this.HumidifierDehumidifier.CurrentRelativeHumidity = humidity;
          if (!this.device.humidifier?.hide_temperature) {
              this.TemperatureSensor!.CurrentTemperature = convertUnits(temperature, context.scale, device.iosensor?.convertUnitTo);
          }
          this.updateHomeKitCharacteristics();
        } catch (e: any) {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`);
        }
      };
    }

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
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType} Connection,` +
            ` Error Message: ${JSON.stringify(e.message)}`,
          );
        }
        this.humidifierUpdateInProgress = false;
      });
  }

  async BLEparseStatus(serviceData: serviceData): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);
    // Target Humidifier Dehumidifier State
    if (serviceData.autoMode) {
      this.HumidifierDehumidifier.TargetHumidifierDehumidifierState = this.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER;
    }
    // Current Relative Humidity
    this.HumidifierDehumidifier.CurrentRelativeHumidity = serviceData.percentage!;
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
      + ` CurrentRelativeHumidity: ${this.HumidifierDehumidifier.CurrentRelativeHumidity}`);
    // Active
    if (serviceData.onState) {
      this.HumidifierDehumidifier.Active = this.hap.Characteristic.Active.ACTIVE;
    } else {
      this.HumidifierDehumidifier.Active = this.hap.Characteristic.Active.INACTIVE;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Active: ${this.HumidifierDehumidifier.Active}`);
  }

  async openAPIparseStatus(deviceStatus: deviceStatus): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
    // Current Relative Humidity
    this.HumidifierDehumidifier.CurrentRelativeHumidity = deviceStatus.body.temperature!;
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
      + ` CurrentRelativeHumidity: ${this.HumidifierDehumidifier.CurrentRelativeHumidity}`);
    // Current Temperature
    if (!this.device.humidifier?.hide_temperature) {
      this.TemperatureSensor!.CurrentTemperature = deviceStatus.body.temperature!;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentTemperature: ${this.TemperatureSensor!.CurrentTemperature}`);
    }
    // Target Humidifier Dehumidifier State
    switch (deviceStatus.body.auto) {
      case true:
        this.HumidifierDehumidifier.TargetHumidifierDehumidifierState =
          this.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER;
        this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState = this.hap.Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING;
        this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold = this.HumidifierDehumidifier.CurrentRelativeHumidity;
        break;
      default:
        this.HumidifierDehumidifier.TargetHumidifierDehumidifierState = this.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER;
        if (deviceStatus.body.nebulizationEfficiency! > 100) {
          this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold = 100;
        } else {
          this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold = deviceStatus.body.nebulizationEfficiency!;
        }
        if (this.HumidifierDehumidifier.CurrentRelativeHumidity > this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold) {
          this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState = this.hap.Characteristic.CurrentHumidifierDehumidifierState.IDLE;
        } else if (this.HumidifierDehumidifier.Active === this.hap.Characteristic.Active.INACTIVE) {
          this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState = this.hap.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
        } else {
          this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState = this.hap.Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING;
        }
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
      + ` TargetHumidifierDehumidifierState: ${this.HumidifierDehumidifier.TargetHumidifierDehumidifierState}`);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
      + ` RelativeHumidityHumidifierThreshold: ${this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold}`);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
      + ` CurrentHumidifierDehumidifierState: ${this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState}`);
    // Active
    switch (deviceStatus.body.power) {
      case 'on':
        this.HumidifierDehumidifier.Active = this.hap.Characteristic.Active.ACTIVE;
        break;
      default:
        this.HumidifierDehumidifier.Active = this.hap.Characteristic.Active.INACTIVE;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Active: ${this.HumidifierDehumidifier.Active}`);
    // Water Level
    if (deviceStatus.body.lackWater) {
      this.HumidifierDehumidifier.WaterLevel = 0;
    } else {
      this.HumidifierDehumidifier.WaterLevel = 100;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} WaterLevel: ${this.HumidifierDehumidifier.WaterLevel}`);

    // Firmware Version
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Firmware Version: ${deviceStatus.body.version}`);
    if (deviceStatus.body.version) {
      this.accessory.context.version = deviceStatus.body.version.toString();
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.hap.Characteristic.FirmwareRevision, this.accessory.context.version)
        .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
        .updateValue(this.accessory.context.version);
    }
  }

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
      // Start to monitor advertisement packets
      await switchbot.startScan({ model: this.device.bleModel, id: this.device.bleMac });
      // Set an event handler
      switchbot.onadvertisement = (ad: any) => {
        if (this.device.bleMac === ad.address && ad.model === this.device.bleModel) {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ${JSON.stringify(ad, null, '  ')}`);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} address: ${ad.address}, model: ${ad.model}`);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        } else {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        }
      };
      // Wait 10 seconds
      await switchbot.wait(this.scanDuration * 1000);
      // Stop to monitor
      await switchbot.stopScan();
      // Update HomeKit
      await this.BLEparseStatus(switchbot.onadvertisement.serviceData);
      await this.updateHomeKitCharacteristics();
    })();
    if (switchbot === undefined) {
      await this.BLERefreshConnection(switchbot);
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode } = await this.platform.retryRequest(this.deviceMaxRetries, this.deviceDelayBetweenRetries,
        `${Devices}/${this.device.deviceId}/status`, { headers: this.platform.generateHeaders() });
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
      const deviceStatus: any = await body.json();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
      if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
        this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
        this.openAPIparseStatus(deviceStatus);
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
   * Pushes the requested changes to the SwitchBot API
   */
  async pushChanges(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} pushChanges enableCloudService: ${this.device.enableCloudService}`);
      /*} else if (this.BLE) {
        await this.BLEpushChanges();*/
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges();
    } else {
      await this.offlineOff();
      this.debugWarnLog(
        `${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` + ` ${this.device.connectionType}, pushChanges will not happen.`,
      );
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
      .then(async (device_list: any) => {
        this.infoLog(`${this.accessory.displayName} Active: ${this.HumidifierDehumidifier.Active}`);
        return await device_list[0].percentage(this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold);
      })
      .then(() => {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
        this.successLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `Active: ${this.HumidifierDehumidifier.Active} sent over BLE,  sent successfully`);
      })
      .catch(async (e: any) => {
        this.apiError(e);
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}` +
          ` Connection, Error Message: ${JSON.stringify(e.message)}`,
        );
        await this.BLEPushConnection();
      });
  }

  async openAPIpushChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);
    if (
      this.HumidifierDehumidifier.TargetHumidifierDehumidifierState === this.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER &&
      this.HumidifierDehumidifier.Active === this.hap.Characteristic.Active.ACTIVE
    ) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
        + ` Pushing Manual: ${this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold}!`);
      const bodyChange = JSON.stringify({
        command: 'setMode',
        parameter: `${this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold}`,
        commandType: 'command',
      });
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
        const deviceStatus: any = await body.json();
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus body: ${JSON.stringify(deviceStatus.body)}`);
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          this.debugErrorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
          this.successLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `request to SwitchBot API, body: ${JSON.stringify(deviceStatus)} sent successfully`);
        } else {
          this.statusCode(statusCode);
          this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} failed openAPIpushChanges with ${this.device.connectionType}` +
          ` Connection, Error Message: ${JSON.stringify(e.message)}`,
        );
      }
    } else if (
      this.HumidifierDehumidifier.TargetHumidifierDehumidifierState ===
      this.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER &&
      this.HumidifierDehumidifier.Active === this.hap.Characteristic.Active.ACTIVE
    ) {
      await this.pushAutoChanges();
    } else {
      await this.pushActiveChanges();
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   */
  async pushAutoChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} pushAutoChanges`);
    if (
      this.HumidifierDehumidifier.TargetHumidifierDehumidifierState ===
      this.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER &&
      this.HumidifierDehumidifier.Active === this.hap.Characteristic.Active.ACTIVE
    ) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Pushing Auto`);
      const bodyChange = JSON.stringify({
        command: 'setMode',
        parameter: 'auto',
        commandType: 'command',
      });
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
        const deviceStatus: any = await body.json();
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus body: ${JSON.stringify(deviceStatus.body)}`);
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          this.debugErrorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
          this.successLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `request to SwitchBot API, body: ${JSON.stringify(deviceStatus)} sent successfully`);
        } else {
          this.statusCode(statusCode);
          this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} failed pushAutoChanges with ${this.device.connectionType}` +
          ` Connection, Error Message: ${JSON.stringify(e.message)}`,
        );
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No pushAutoChanges. TargetHumidifierDehumidifierState:`
        + ` ${this.HumidifierDehumidifier.TargetHumidifierDehumidifierState}, Active: ${this.HumidifierDehumidifier.Active}`);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   */
  async pushActiveChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} pushActiveChanges`);
    if (this.HumidifierDehumidifier.Active === this.hap.Characteristic.Active.INACTIVE) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Pushing Off`);
      const bodyChange = JSON.stringify({
        command: 'turnOff',
        parameter: 'default',
        commandType: 'command',
      });
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
        const deviceStatus: any = await body.json();
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus body: ${JSON.stringify(deviceStatus.body)}`);
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          this.debugErrorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
          this.successLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `request to SwitchBot API, body: ${JSON.stringify(deviceStatus)} sent successfully`);
        } else {
          this.statusCode(statusCode);
          this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} failed pushActiveChanges with ${this.device.connectionType}` +
          ` Connection, Error Message: ${JSON.stringify(e.message)}`,
        );
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No pushActiveChanges. Active: ${this.HumidifierDehumidifier.Active}`);
    }
  }

  /**
   * Handle requests to set the "Active" characteristic
   */
  async ActiveSet(value: CharacteristicValue): Promise<void> {
    if (this.HumidifierDehumidifier.Active === this.accessory.context.Active) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set Active: ${value}`);
    } else {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Active: ${value}`);
    }

    this.HumidifierDehumidifier.Active = value;
    this.doHumidifierUpdate.next();
  }

  /**
   * Handle requests to set the "Target Humidifier Dehumidifier State" characteristic
   */
  async TargetHumidifierDehumidifierStateSet(value: CharacteristicValue): Promise<void> {
    if (this.HumidifierDehumidifier.Active === this.hap.Characteristic.Active.ACTIVE) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set TargetHumidifierDehumidifierState: ${value}`);
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Set TargetHumidifierDehumidifierState: ${value}`);
    }

    this.HumidifierDehumidifier.TargetHumidifierDehumidifierState = value;
    this.doHumidifierUpdate.next();
  }

  /**
   * Handle requests to set the "Relative Humidity Humidifier Threshold" characteristic
   */
  async RelativeHumidityHumidifierThresholdSet(value: CharacteristicValue): Promise<void> {
    if (this.HumidifierDehumidifier.Active === this.hap.Characteristic.Active.ACTIVE) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set RelativeHumidityHumidifierThreshold: ${value}`);
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Set RelativeHumidityHumidifierThreshold: ${value}`);
    }

    this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold = value;
    if (this.HumidifierDehumidifier.Active === this.hap.Characteristic.Active.INACTIVE) {
      this.HumidifierDehumidifier.Active = this.hap.Characteristic.Active.ACTIVE;
      this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState = this.hap.Characteristic.CurrentHumidifierDehumidifierState.IDLE;
    }
    this.doHumidifierUpdate.next();
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    if (this.HumidifierDehumidifier.CurrentRelativeHumidity === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
        + ` CurrentRelativeHumidity: ${this.HumidifierDehumidifier.CurrentRelativeHumidity}`);
    } else {
      this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity,
        this.HumidifierDehumidifier.CurrentRelativeHumidity);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` CurrentRelativeHumidity: ${this.HumidifierDehumidifier.CurrentRelativeHumidity}`);
      this.accessory.context.CurrentRelativeHumidity = this.HumidifierDehumidifier.CurrentRelativeHumidity;
    }
    if (this.OpenAPI) {
      if (this.HumidifierDehumidifier.WaterLevel === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} WaterLevel: ${this.HumidifierDehumidifier.WaterLevel}`);
      } else {
        this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.WaterLevel, this.HumidifierDehumidifier.WaterLevel);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
          + ` WaterLevel: ${this.HumidifierDehumidifier.WaterLevel}`);
        this.accessory.context.WaterLevel = this.HumidifierDehumidifier.WaterLevel;
      }
    }
    if (this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}` +
        ` CurrentHumidifierDehumidifierState: ${this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState}`);
    } else {
      this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentHumidifierDehumidifierState,
        this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic` +
        ` CurrentHumidifierDehumidifierState: ${this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState}`);
      this.accessory.context.CurrentHumidifierDehumidifierState = this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState;
    }
    if (this.HumidifierDehumidifier.TargetHumidifierDehumidifierState === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
        + ` TargetHumidifierDehumidifierState: ${this.HumidifierDehumidifier.TargetHumidifierDehumidifierState}`,
      );
    } else {
      this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.TargetHumidifierDehumidifierState,
        this.HumidifierDehumidifier.TargetHumidifierDehumidifierState);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` TargetHumidifierDehumidifierState: ${this.HumidifierDehumidifier.TargetHumidifierDehumidifierState}`);
      this.accessory.context.TargetHumidifierDehumidifierState = this.HumidifierDehumidifier.TargetHumidifierDehumidifierState;
    }
    if (this.HumidifierDehumidifier.Active === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Active: ${this.HumidifierDehumidifier.Active}`);
    } else {
      this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.Active, this.HumidifierDehumidifier.Active);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.HumidifierDehumidifier.Active}`);
      this.accessory.context.Active = this.HumidifierDehumidifier.Active;
    }
    if (this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}` +
        ` RelativeHumidityHumidifierThreshold: ${this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold}`);
    } else {
      this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.RelativeHumidityHumidifierThreshold,
        this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic` +
        ` RelativeHumidityHumidifierThreshold: ${this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold}`);
      this.accessory.context.RelativeHumidityHumidifierThreshold = this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold;
    }
    if (!this.device.humidifier?.hide_temperature && !this.BLE) {
      if (this.TemperatureSensor!.CurrentTemperature === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentTemperature: ${this.TemperatureSensor!.CurrentTemperature}`);
      } else {
        this.TemperatureSensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, this.TemperatureSensor!.CurrentTemperature);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
          + ` CurrentTemperature: ${this.TemperatureSensor!.CurrentTemperature}`);
        this.accessory.context.CurrentTemperature = this.TemperatureSensor!.CurrentTemperature;
      }
    }
  }

  async BLEPushConnection() {
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Push Changes`);
      await this.openAPIpushChanges();
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

  minStep(device: device & devicesConfig): number {
    let set_minStep: number;
    if (device.humidifier?.set_minStep) {
      set_minStep = device.humidifier?.set_minStep;
    } else {
      set_minStep = 1;
    }
    return set_minStep;
  }

  async offlineOff(): Promise<void> {
    this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} offline: ${this.device.offline}`);
    if (this.device.offline) {
      this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentHumidifierDehumidifierState,
        this.hap.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE);
      this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.TargetHumidifierDehumidifierState,
        this.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER);
      this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.INACTIVE);
    }
  }

  async apiError(e: any): Promise<void> {
    this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity, e);
    if (!this.BLE) {
      this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.WaterLevel, e);
    }
    this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentHumidifierDehumidifierState, e);
    this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.TargetHumidifierDehumidifierState, e);
    this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.Active, e);
    this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.RelativeHumidityHumidifierThreshold, e);
    if (!this.device.humidifier?.hide_temperature && !this.BLE) {
      this.TemperatureSensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, e);
    }
  }
}
