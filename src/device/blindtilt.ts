/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * blindtilt.ts: @switchbot/homebridge-switchbot.
 */
import { request } from 'undici';
import { BlindTiltMappingMode } from '../utils.js';
import { interval, Subject } from 'rxjs';
import { deviceBase } from './device.js';
import { SwitchBotPlatform } from '../platform.js';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { device, devicesConfig, serviceData, deviceStatus, Devices } from '../settings.js';


export class BlindTilt extends deviceBase {
  // Services
  private WindowCovering: {
    Service: Service;
    PositionState: CharacteristicValue;
    TargetPosition: CharacteristicValue;
    CurrentPosition: CharacteristicValue;
    TargetHorizontalTiltAngle: CharacteristicValue;
    CurrentHorizontalTiltAngle: CharacteristicValue;
  };

  private Battery: {
    Service: Service;
    BatteryLevel: CharacteristicValue;
    StatusLowBattery: CharacteristicValue;
  };

  private LightSensor?: {
    Service: Service;
    CurrentAmbientLightLevel?: CharacteristicValue;
  };

  // OpenAPI Others
  mappingMode: BlindTiltMappingMode = BlindTiltMappingMode.OnlyUp;

  // Target
  setNewTarget!: boolean;
  setNewTargetTimer!: NodeJS.Timeout;

  // Updates
  blindTiltUpdateInProgress!: boolean;
  doBlindTiltUpdate!: Subject<void>;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device);
    // default placeholders
    this.mappingMode = (device.blindTilt?.mode as BlindTiltMappingMode) ?? BlindTiltMappingMode.OnlyUp;
    this.debugLog(`Mapping mode: ${this.mappingMode}`);

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doBlindTiltUpdate = new Subject();
    this.blindTiltUpdateInProgress = false;
    this.setNewTarget = false;

    // Initialize LightBulb property
    this.WindowCovering = {
      Service: accessory.getService(this.hap.Service.WindowCovering) as Service,
      PositionState: accessory.context.PositionState || this.hap.Characteristic.PositionState.STOPPED,
      TargetPosition: accessory.context.TargetPosition || 100,
      CurrentPosition: accessory.context.CurrentPosition || 100,
      TargetHorizontalTiltAngle: accessory.context.TargetHorizontalTiltAngle || 0,
      CurrentHorizontalTiltAngle: accessory.context.CurrentHorizontalTiltAngle || 0,
    };

    // Initialize Battery property
    this.Battery = {
      Service: accessory.getService(this.hap.Service.Battery) as Service,
      BatteryLevel: accessory.context.BatteryLevel || 100,
      StatusLowBattery: this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
    };

    // Initialize LightSensor property
    if (!this.device.blindTilt?.hide_lightsensor) {
      this.LightSensor = {
        Service: accessory.getService(this.hap.Service.LightSensor) as Service,
        CurrentAmbientLightLevel: accessory.context.CurrentAmbientLightLevel || 0.0001,
      };
    }

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // get the WindowCovering service if it exists, otherwise create a new WindowCovering service
    // you can create multiple services for each accessory
    (this.WindowCovering!.Service =
      accessory.getService(this.hap.Service.WindowCovering)
      || accessory.addService(this.hap.Service.WindowCovering)), accessory.displayName;

    this.WindowCovering!.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);

    // create handlers for required characteristics
    this.WindowCovering!.Service.setCharacteristic(this.hap.Characteristic.PositionState, this.WindowCovering.PositionState);

    this.WindowCovering!.Service
      .getCharacteristic(this.hap.Characteristic.CurrentPosition)
      .setProps({
        minStep: this.minStep(device),
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onGet(() => {
        return this.WindowCovering?.CurrentPosition ?? 0;
      });

    this.WindowCovering!.Service
      .getCharacteristic(this.hap.Characteristic.TargetPosition)
      .setProps({
        minStep: this.minStep(device),
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onSet(this.TargetPositionSet.bind(this));

    this.WindowCovering!.CurrentHorizontalTiltAngle = 90;
    this.WindowCovering!.Service
      .getCharacteristic(this.hap.Characteristic.CurrentHorizontalTiltAngle)
      .setProps({
        minStep: 180,
        minValue: -90,
        maxValue: 90,
        validValues: [-90, 90],
      })
      .onGet(() => {
        // this.debugLog(`requested CurrentHorizontalTiltAngle: ${this.WindowCovering.CurrentHorizontalTiltAngle}`);
        return this.WindowCovering.CurrentHorizontalTiltAngle ?? 0;
      });

    this.WindowCovering!.TargetHorizontalTiltAngle = 90;
    this.WindowCovering!.Service
      .getCharacteristic(this.hap.Characteristic.TargetHorizontalTiltAngle)
      .setProps({
        minStep: 180,
        minValue: -90,
        maxValue: 90,
        validValues: [-90, 90],
      })
      .onSet(this.TargetHorizontalTiltAngleSet.bind(this));

    // Battery Service
    const batteryService = `${accessory.displayName} Battery`;
    (this.Battery.Service = this.accessory.getService(this.hap.Service.Battery)
      || accessory.addService(this.hap.Service.Battery)), batteryService;

    this.Battery!.Service.setCharacteristic(this.hap.Characteristic.Name, batteryService);

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.blindTiltUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    //regisiter webhook event handler
    if (device.webhook) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} is listening webhook.`);
      this.platform.webhookEventHandler[this.device.deviceId] = async (context) => {
        try {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} received Webhook: ${JSON.stringify(context)}`);
          const { slidePosition, battery } = context;
          const { CurrentPosition } = this.WindowCovering;
          const { BatteryLevel } = this.Battery;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ` +
            '(slidePosition, battery) = ' +
            `Webhook:(${slidePosition}, ${battery}), ` +
            `current:(${CurrentPosition}, ${BatteryLevel})`);
          this.WindowCovering!.CurrentPosition = slidePosition;
          this.Battery.BatteryLevel = battery;
          this.updateHomeKitCharacteristics();
        } catch (e: any) {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`);
        }
      };
    }

    // update slide progress
    interval(this.deviceUpdateRate * 1000)
      //.pipe(skipWhile(() => this.blindTiltUpdateInProgress))
      .subscribe(async () => {
        if (this.WindowCovering!.PositionState === this.hap.Characteristic.PositionState.STOPPED) {
          return;
        }
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Refresh Status When Moving,`
          + ` PositionState: ${this.WindowCovering!.PositionState}`);
        await this.refreshStatus();
      });

    // Watch for BlindTilt change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doBlindTiltUpdate
      .pipe(
        tap(() => {
          this.blindTiltUpdateInProgress = true;
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
        this.blindTiltUpdateInProgress = false;
      });
  }

  /**
   * Parse the device status from the SwitchBotBLE API
   */
  async BLEparseStatus(serviceData: serviceData): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);
    // CurrentPosition
    this.WindowCovering.CurrentPosition = 100 - Number(serviceData.position);
    await this.setMinMax();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition ${this.WindowCovering.CurrentPosition}`);
    if (this.setNewTarget) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Checking Status ...`);
    }

    if (this.setNewTarget && serviceData.inMotion) {
      await this.setMinMax();
      if (Number(this.WindowCovering.TargetPosition) > this.WindowCovering.CurrentPosition) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Closing, CurrentPosition: ${this.WindowCovering.CurrentPosition}`);
        this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.INCREASING;
        this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.WindowCovering.CurrentPosition} INCREASING`
          + ` PositionState: ${this.WindowCovering.PositionState}`);
      } else if (Number(this.WindowCovering.TargetPosition) < this.WindowCovering.CurrentPosition) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Opening, CurrentPosition: ${this.WindowCovering.CurrentPosition}`);
        this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.DECREASING;
        this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.WindowCovering.CurrentPosition} DECREASING`
          + ` PositionState: ${this.WindowCovering.PositionState}`);
      } else {
        this.debugLog(`${this.device.deviceType}: ${this.WindowCovering.CurrentPosition} Standby2,`
          + ` CurrentPosition: ${this.WindowCovering.CurrentPosition}`);
        this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.STOPPED;
        this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.WindowCovering.CurrentPosition} STOPPED`
          + ` PositionState: ${this.WindowCovering.PositionState}`);
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Standby, CurrentPosition: ${this.WindowCovering.CurrentPosition}`);
      this.WindowCovering.TargetPosition = this.WindowCovering.CurrentPosition;
      this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.STOPPED;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Stopped`);
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition: ${this.WindowCovering.CurrentPosition},`
      + ` TargetPosition: ${this.WindowCovering.TargetPosition}, PositionState: ${this.WindowCovering.PositionState},`);

    if (!this.device.blindTilt?.hide_lightsensor) {
      const set_minLux = await this.minLux();
      const set_maxLux = await this.maxLux();
      const spaceBetweenLevels = 9;

      if (this.LightSensor?.CurrentAmbientLightLevel === 0) {
        this.LightSensor!.CurrentAmbientLightLevel = 0.0001;
      }

      // Brightness
      switch (serviceData.lightLevel) {
        case 1:
          this.LightSensor!.CurrentAmbientLightLevel = set_minLux;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${serviceData.lightLevel}`);
          break;
        case 2:
          this.LightSensor!.CurrentAmbientLightLevel = (set_maxLux - set_minLux) / spaceBetweenLevels;
          this.debugLog(
            `${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${serviceData.lightLevel},` +
            ` Calculation: ${(set_maxLux - set_minLux) / spaceBetweenLevels}`,
          );
          break;
        case 3:
          this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 2;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${serviceData.lightLevel}`);
          break;
        case 4:
          this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 3;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${serviceData.lightLevel}`);
          break;
        case 5:
          this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 4;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${serviceData.lightLevel}`);
          break;
        case 6:
          this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 5;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${serviceData.lightLevel}`);
          break;
        case 7:
          this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 6;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${serviceData.lightLevel}`);
          break;
        case 8:
          this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 7;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${serviceData.lightLevel}`);
          break;
        case 9:
          this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 8;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${serviceData.lightLevel}`);
          break;
        case 10:
        default:
          this.LightSensor!.CurrentAmbientLightLevel = set_maxLux;
          this.debugLog();
      }
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${serviceData.lightLevel},` +
        ` CurrentAmbientLightLevel: ${this.LightSensor!.CurrentAmbientLightLevel}`,
      );
    }
    // Battery
    this.Battery.BatteryLevel = Number(serviceData.battery);
    if (this.Battery.BatteryLevel < 10) {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.debugLog(
      `${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel},`
      + ` StatusLowBattery: ${this.Battery.StatusLowBattery}`,
    );
  }


  /**
   * Parse the device status from the SwitchBot OpenAPI
   */
  async openAPIparseStatus(deviceStatus: deviceStatus): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);

    const [homekitPosition, homekitTiltAngle] = this.mapDeviceValuesToHomekitValues(Number(deviceStatus.body.slidePosition),
      String(deviceStatus.body.direction));
    this.debugLog(` device: ${deviceStatus.body.slidePosition} => HK: ${homekitPosition}`);

    this.WindowCovering!.CurrentPosition = homekitPosition;
    // CurrentPosition
    await this.setMinMax();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition: ${this.WindowCovering.CurrentPosition}`);

    if (homekitTiltAngle) {
      this.WindowCovering.CurrentHorizontalTiltAngle = homekitTiltAngle!;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
        + ` CurrentHorizontalTiltAngle: ${this.WindowCovering.CurrentHorizontalTiltAngle}`);
    }

    if (this.setNewTarget) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Checking Status ...`);
    }

    if (this.setNewTarget && deviceStatus.body.moving) {
      await this.setMinMax();
      if (this.WindowCovering.TargetPosition > this.WindowCovering.CurrentPosition
        || (homekitTiltAngle && this.WindowCovering.TargetHorizontalTiltAngle !== this.WindowCovering.CurrentHorizontalTiltAngle)) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Closing, CurrentPosition: ${this.WindowCovering.CurrentPosition} `);
        this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.INCREASING;
        this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.WindowCovering.CurrentPosition} INCREASING`
          + ` PositionState: ${this.WindowCovering.PositionState}`);
      } else if (this.WindowCovering.TargetPosition < this.WindowCovering.CurrentPosition) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Opening, CurrentPosition: ${this.WindowCovering.CurrentPosition} `);
        this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.DECREASING;
        this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.WindowCovering.CurrentPosition} DECREASING`
          + ` PositionState: ${this.WindowCovering.PositionState}`);
      } else {
        this.debugLog(
          `${this.device.deviceType}: ${this.WindowCovering.CurrentPosition} Standby because reached position,`
          + ` CurrentPosition: ${this.WindowCovering.CurrentPosition}`,
        );
        this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.STOPPED;
        this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.WindowCovering.CurrentPosition} STOPPED`
          + ` PositionState: ${this.WindowCovering.PositionState}`);
      }
    } else {
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} Standby because device not moving,`
        + ` CurrentPosition: ${this.WindowCovering.CurrentPosition}`,
      );
      this.WindowCovering.TargetPosition = this.WindowCovering.CurrentPosition;
      if (homekitTiltAngle) {
        this.WindowCovering.TargetHorizontalTiltAngle = this.WindowCovering.CurrentHorizontalTiltAngle;
      }
      this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.STOPPED;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Stopped`);
    }
    this.debugLog(
      `${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition: ${this.WindowCovering.CurrentPosition},` +
      ` TargetPosition: ${this.WindowCovering.TargetPosition}, PositionState: ${this.WindowCovering.PositionState},`,
    );

    if (!this.device.blindTilt?.hide_lightsensor) {
      const set_minLux = await this.minLux();
      const set_maxLux = await this.maxLux();
      // Brightness
      switch (deviceStatus.body.brightness) {
        case 'dim':
          this.LightSensor!.CurrentAmbientLightLevel = set_minLux;
          break;
        case 'bright':
        default:
          this.LightSensor!.CurrentAmbientLightLevel = set_maxLux;
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
        + ` CurrentAmbientLightLevel: ${this.LightSensor!.CurrentAmbientLightLevel}`);
    }

    // BatteryLevel
    this.Battery.BatteryLevel = Number(deviceStatus.body.battery);
    if (this.Battery.BatteryLevel < 10) {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    if (Number.isNaN(this.Battery.BatteryLevel)) {
      this.Battery.BatteryLevel = 100;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel},`
      + ` StatusLowBattery: ${this.Battery.StatusLowBattery}`);

    // Firmware Version
    const version = deviceStatus.body.version?.toString();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Firmware Version: ${version?.replace(/^V|-.*$/g, '')}`);
    if (deviceStatus.body.version) {
      this.accessory.context.version = version?.replace(/^V|-.*$/g, '');
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

  async pushChanges(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} pushChanges enableCloudService: ${this.device.enableCloudService}`);
    } else if (this.BLE) {
      await this.BLEpushChanges();
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges();
    } else {
      await this.offlineOff();
      this.debugWarnLog(
        `${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` + ` ${this.device.connectionType}, pushChanges will not happen.`,
      );
    }
    // Refresh the status from the API
    interval(15000)
      .pipe(skipWhile(() => this.blindTiltUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus();
      });
  }

  async BLEpushChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges`);
    if (this.WindowCovering.TargetPosition !== this.WindowCovering.CurrentPosition) {
      const switchbot = await this.platform.connectBLE();
      // Convert to BLE Address
      this.device.bleMac = this.device
        .deviceId!.match(/.{1,2}/g)!
        .join(':')
        .toLowerCase();
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
      const { setPositionMode, Mode }: { setPositionMode: number; Mode: string; } = await this.setPerformance();
      this.debugLog(`${this.accessory.displayName} Mode: ${Mode}`);
      if (switchbot !== false) {
        switchbot
          .discover({ model: 'c', quick: true, id: this.device.bleMac })
          .then(async (device_list: any) => {
            this.infoLog(`${this.accessory.displayName} Target Position: ${this.WindowCovering.TargetPosition}`);
            return await this.retryBLE({
              max: await this.maxRetryBLE(),
              fn: async () => {
                return await device_list[0].runToPos(100 - Number(this.WindowCovering.TargetPosition), setPositionMode);
              },
            });
          })
          .then(() => {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
            this.successLog(`${this.device.deviceType}: ${this.accessory.displayName} `
              + `Target Position: ${this.WindowCovering.TargetPosition} sent over BLE,  sent successfully`);
          })
          .catch(async (e: any) => {
            this.apiError(e);
            this.errorLog(
              `${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}` +
              ` Connection, Error Message: ${JSON.stringify(e.message)}`,
            );
            await this.BLEPushConnection();
          });
      } else {
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection`);
        await this.BLEPushConnection();
      }
    } else {
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} No BLEpushChanges, CurrentPosition & TargetPosition Are the Same.` +
        `  CurrentPosition: ${this.WindowCovering.CurrentPosition}, TargetPosition  ${this.WindowCovering.TargetPosition}`,
      );
    }
  }

  async openAPIpushChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);
    const hasDifferentAndRelevantHorizontalTiltAngle =
      this.mappingMode === BlindTiltMappingMode.UseTiltForDirection
      && this.WindowCovering.TargetHorizontalTiltAngle !== this.WindowCovering.CurrentHorizontalTiltAngle;
    if (this.WindowCovering.TargetPosition !== this.WindowCovering.CurrentPosition
      || hasDifferentAndRelevantHorizontalTiltAngle || this.device.disableCaching) {
      const [direction, position] = this.mapHomekitValuesToDeviceValues(Number(this.WindowCovering.TargetPosition),
        Number(this.WindowCovering.TargetHorizontalTiltAngle));
      const { Mode }: { setPositionMode: number; Mode: string; } = await this.setPerformance();
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
        + ` Pushing ${this.WindowCovering.TargetPosition} (device = ${direction};${position})`);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Mode: ${Mode}`);
      let bodyChange = '';
      if (position === 100) {
        bodyChange = JSON.stringify({
          command: 'fullyOpen',
          commandType: 'command',
        });
      } else if (position === 0) {
        bodyChange = JSON.stringify({
          command: direction === 'up' ? 'closeUp' : 'closeDown',
          commandType: 'command',
        });
      } else {
        bodyChange = JSON.stringify({
          command: 'setPosition',
          parameter: `${direction};${position}`,
          commandType: 'command',
        });
      }
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
          this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
          this.successLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `request to SwitchBot API, body: ${JSON.stringify(bodyChange)} sent successfully`);
        } else {
          this.statusCode(statusCode);
          this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} failed openAPIpushChanges with ${this.device.connectionType}`
          + ` Connection, Error Message: ${JSON.stringify(e.message)}`,
        );
      }
    } else {
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} No OpenAPI Changes, CurrentPosition & TargetPosition Are the Same.`
        + ` CurrentPosition: ${this.WindowCovering.CurrentPosition}, TargetPosition  ${this.WindowCovering.TargetPosition}`
        + ` CurrentHorizontalTiltAngle: ${this.WindowCovering.CurrentHorizontalTiltAngle},`
        + ` TargetPosition  ${this.WindowCovering.TargetHorizontalTiltAngle}`,
      );
    }
  }

  /**
   * Handle requests to set the value of the "Target Horizontal Tilt" characteristic
   */
  async TargetHorizontalTiltAngleSet(value: CharacteristicValue): Promise<void> {
    if (this.WindowCovering.TargetHorizontalTiltAngle === this.accessory.context.TargetHorizontalTiltAngle) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set TargetHorizontalTiltAngle: ${value}`);
    } else {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set TargetHorizontalTiltAngle: ${value}`);
    }

    //value = value < 0 ? -90 : 90;
    this.WindowCovering.TargetHorizontalTiltAngle = value;
    if (this.device.mqttURL) {
      this.mqttPublish('TargetHorizontalTiltAngle', this.WindowCovering.TargetHorizontalTiltAngle.toString());
    }

    this.startUpdatingBlindTiltIfNeeded();
  }

  /**
   * Handle requests to set the value of the "Target Position" characteristic
   */
  async TargetPositionSet(value: CharacteristicValue): Promise<void> {
    if (this.WindowCovering.TargetPosition === this.accessory.context.TargetPosition) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set TargetPosition: ${value}`);
    } else {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set TargetPosition: ${value}`);
    }

    this.WindowCovering.TargetPosition = value;
    if (this.device.mqttURL) {
      this.mqttPublish('TargetPosition', this.WindowCovering.TargetPosition.toString());
    }
    this.startUpdatingBlindTiltIfNeeded();
  }

  async startUpdatingBlindTiltIfNeeded(): Promise<void> {
    await this.setMinMax();
    this.debugLog('setMinMax');
    if (this.WindowCovering.TargetPosition > this.WindowCovering.CurrentPosition
      || this.WindowCovering.TargetHorizontalTiltAngle !== this.WindowCovering.CurrentHorizontalTiltAngle) {
      this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.INCREASING;
      this.setNewTarget = true;
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} value: ${this.WindowCovering.CurrentPosition},`
        + ` CurrentPosition: ${this.WindowCovering.CurrentPosition}`,
      );
    } else if (this.WindowCovering.TargetPosition < this.WindowCovering.CurrentPosition) {
      this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.DECREASING;
      this.setNewTarget = true;
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} value: ${this.WindowCovering.CurrentPosition},`
        + ` CurrentPosition: ${this.WindowCovering.CurrentPosition}`,
      );
    } else {
      this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.STOPPED;
      this.setNewTarget = false;
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} value: ${this.WindowCovering.CurrentPosition},`
        + ` CurrentPosition: ${this.WindowCovering.CurrentPosition}`,
      );
    }
    this.WindowCovering.Service.setCharacteristic(this.hap.Characteristic.PositionState, this.WindowCovering.PositionState);
    this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState);

    /**
     * If Blind Tilt movement time is short, the moving flag from backend is always false.
     * The minimum time depends on the network control latency.
     */
    clearTimeout(this.setNewTargetTimer);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateRate: ${this.deviceUpdateRate}`);
    if (this.setNewTarget) {
      this.setNewTargetTimer = setTimeout(() => {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} setNewTarget ${this.setNewTarget} timeout`);
        this.setNewTarget = false;
      }, this.deviceUpdateRate * 1000);
    }
    this.doBlindTiltUpdate.next();
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    await this.setMinMax();
    // CurrentHorizontalTiltAngle
    if (this.mappingMode === BlindTiltMappingMode.UseTiltForDirection) {
      if (this.WindowCovering.CurrentHorizontalTiltAngle === undefined || Number.isNaN(this.WindowCovering.CurrentHorizontalTiltAngle)) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
          + ` CurrentHorizontalTiltAngle: ${this.WindowCovering.CurrentHorizontalTiltAngle}`);
      } else {
        if (this.device.mqttURL) {
          this.mqttPublish('CurrentHorizontalTiltAngle', this.WindowCovering.CurrentHorizontalTiltAngle.toString());
        }
        this.accessory.context.CurrentHorizontalTiltAngle = this.WindowCovering.CurrentHorizontalTiltAngle;
        this.WindowCovering.Service.updateCharacteristic(
          this.hap.Characteristic.CurrentHorizontalTiltAngle,
          Number(this.WindowCovering.CurrentHorizontalTiltAngle),
        );
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} 
        updateCharacteristic CurrentHorizontalTiltAngle: ${this.WindowCovering.CurrentHorizontalTiltAngle}`);
      }
    }
    // CurrentPosition
    if (this.WindowCovering.CurrentPosition === undefined || Number.isNaN(this.WindowCovering.CurrentPosition)) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition: ${this.WindowCovering.CurrentPosition}`);
    } else {
      if (this.device.mqttURL) {
        this.mqttPublish('CurrentPosition', this.WindowCovering.CurrentPosition.toString());
      }
      this.accessory.context.CurrentPosition = this.WindowCovering.CurrentPosition;
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, Number(this.WindowCovering.CurrentPosition));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
        + ` updateCharacteristic CurrentPosition: ${this.WindowCovering.CurrentPosition}`);
    }
    // PositionState
    if (this.WindowCovering.PositionState === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} PositionState: ${this.WindowCovering.PositionState}`);
    } else {
      if (this.device.mqttURL) {
        this.mqttPublish('PositionState', this.WindowCovering.PositionState.toString());
      }
      this.accessory.context.PositionState = this.WindowCovering.PositionState;
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, Number(this.WindowCovering.PositionState));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` PositionState: ${this.WindowCovering.PositionState}`);
    }
    // TargetPosition
    if (this.WindowCovering.TargetPosition === undefined || Number.isNaN(this.WindowCovering.TargetPosition)) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} TargetPosition: ${this.WindowCovering.TargetPosition}`);
    } else {
      if (this.device.mqttURL) {
        this.mqttPublish('TargetPosition', this.WindowCovering.TargetPosition.toString());
      }
      this.accessory.context.TargetPosition = this.WindowCovering.TargetPosition;
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, Number(this.WindowCovering.TargetPosition));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` TargetPosition: ${this.WindowCovering.TargetPosition}`);
    }
    // CurrentAmbientLightLevel
    if (!this.device.blindTilt?.hide_lightsensor) {
      if (this.LightSensor!.CurrentAmbientLightLevel === undefined || Number.isNaN(this.LightSensor!.CurrentAmbientLightLevel)) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
          + ` CurrentAmbientLightLevel: ${this.LightSensor!.CurrentAmbientLightLevel}`);
      } else {
        if (this.device.mqttURL) {
          this.mqttPublish('CurrentAmbientLightLevel', this.LightSensor!.CurrentAmbientLightLevel.toString());
        }
        this.accessory.context.CurrentAmbientLightLevel = this.LightSensor!.CurrentAmbientLightLevel;
        this.LightSensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, this.LightSensor!.CurrentAmbientLightLevel);
        this.debugLog(
          `${this.device.deviceType}: ${this.accessory.displayName}` +
          ` updateCharacteristic CurrentAmbientLightLevel: ${this.LightSensor!.CurrentAmbientLightLevel}`,
        );
      }
    }
    // BatteryLevel
    if (this.Battery.BatteryLevel === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel}`);
    } else {
      if (this.device.mqttURL) {
        this.mqttPublish('BatteryLevel', this.Battery.BatteryLevel.toString());
      }
      this.accessory.context.BatteryLevel = this.Battery.BatteryLevel;
      this.Battery?.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, this.Battery.BatteryLevel);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.Battery.BatteryLevel}`);
    }
    // StatusLowBattery
    if (this.Battery.StatusLowBattery === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatusLowBattery: ${this.Battery.StatusLowBattery}`);
    } else {
      if (this.device.mqttURL) {
        this.mqttPublish('StatusLowBattery', this.Battery.StatusLowBattery.toString());
      }
      this.accessory.context.StatusLowBattery = this.Battery.StatusLowBattery;
      this.Battery?.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, this.Battery.StatusLowBattery);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` StatusLowBattery: ${this.Battery.StatusLowBattery}`);
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

  async setPerformance() {
    let setPositionMode: number;
    let Mode: string;
    if (Number(this.WindowCovering.TargetPosition) > 50) {
      if (this.device.blindTilt?.setOpenMode === '1') {
        setPositionMode = 1;
        Mode = 'Silent Mode';
      } else if (this.device.blindTilt?.setOpenMode === '0') {
        setPositionMode = 0;
        Mode = 'Performance Mode';
      } else {
        setPositionMode = 0;
        Mode = 'Default Mode';
      }
    } else {
      if (this.device.blindTilt?.setCloseMode === '1') {
        setPositionMode = 1;
        Mode = 'Silent Mode';
      } else if (this.device.blindTilt?.setOpenMode === '0') {
        setPositionMode = 0;
        Mode = 'Performance Mode';
      } else {
        setPositionMode = 0;
        Mode = 'Default Mode';
      }
    }
    return { setPositionMode, Mode };
  }

  async setMinMax(): Promise<void> {
    if (this.device.blindTilt?.set_min) {
      if (Number(this.WindowCovering.CurrentPosition) <= this.device.blindTilt?.set_min) {
        this.WindowCovering.CurrentPosition = 0;
      }
    }
    if (this.device.blindTilt?.set_max) {
      if (Number(this.WindowCovering.CurrentPosition) >= this.device.blindTilt?.set_max) {
        this.WindowCovering.CurrentPosition = 100;
      }
    }

    if (this.mappingMode === BlindTiltMappingMode.UseTiltForDirection) {
      this.WindowCovering.CurrentHorizontalTiltAngle = Number(this.WindowCovering.CurrentHorizontalTiltAngle) < 0 ? -90 : 90;
    }
  }

  minStep(device: device & devicesConfig): number {
    let set_minStep: number;
    if (device.blindTilt?.set_minStep) {
      set_minStep = device.blindTilt?.set_minStep;
    } else {
      set_minStep = 1;
    }
    return set_minStep;
  }

  async minLux(): Promise<number> {
    let set_minLux: number;
    if (this.device.blindTilt?.set_minLux) {
      set_minLux = this.device.blindTilt?.set_minLux;
    } else {
      set_minLux = 1;
    }
    return set_minLux;
  }

  async maxLux(): Promise<number> {
    let set_maxLux: number;
    if (this.device.blindTilt?.set_maxLux) {
      set_maxLux = this.device.blindTilt?.set_maxLux;
    } else {
      set_maxLux = 6001;
    }
    return set_maxLux;
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
    }
  }

  async apiError(e: any): Promise<void> {
    this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
    this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e);
    this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
    if (!this.device.curtain?.hide_lightsensor) {
      this.LightSensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, e);
    }
    if (this.BLE) {
      this.Battery?.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e);
      this.Battery?.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e);
    }
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  /**
   * Maps device values to homekit values
   *
   * @param devicePosition the position as reported by the devide
   * @param direction the direction as reported by the device
   * @returns [homekit position, homekit tiltAngle]
   */
  mapDeviceValuesToHomekitValues(devicePosition: number, deviceDirection: string): [CharacteristicValue, CharacteristicValue?] {
    // device position 0 => closed down
    // device position 50 => open
    // device position 100 => closed up

    // homekit position 0 =>  closed
    // homekit position 100 => open
    deviceDirection;
    switch (this.mappingMode) {
      case BlindTiltMappingMode.OnlyUp:
        // we only close upwards, so we see anything that is tilted downwards(<50) as open
        if (devicePosition < 50) {
          return [100, undefined]; // fully open in homekit
        } else {
          // we range from 50->100, with 100 being closed, so map to homekit by scaling to 0..100 and then reversing
          return [100 - (devicePosition - 50) * 2, undefined];
        }

      case BlindTiltMappingMode.OnlyDown:
        // we only close downwards, so we see anything that is tilted upwards(>50) as upwards
        if (devicePosition > 50) {
          return [100, undefined]; // fully open in homekit
        } else {
          // we range from 0..50 so scale to homekit and then reverse
          return [devicePosition * 2, undefined];
        }

      case BlindTiltMappingMode.DownAndUp:
        // we close both ways with closed downwards being 0 in homekit and closed upwards in homekit being 100. Open is 50 in homekit
        return [devicePosition, undefined];

      case BlindTiltMappingMode.UpAndDown:
        // we close both ways with closed downwards being 1000 in homekit and closed upwards in homekit being 0. Open is 50 in homekit.,
        // so we reverse the value
        return [100 - devicePosition, undefined];

      case BlindTiltMappingMode.UseTiltForDirection:
        // we use tilt for direction, so being closed downwards is 0 in homekit with -90 tilt, while being closed upwards is 0 with 90 tilt.
        if (devicePosition <= 50) {
          // downwards tilted, so we range from 0..50, with 0 being closed and 50 being open, so scale.
          return [devicePosition * 2, -90];
        } else {
          // upwards tilted, so we range from 50..100, with 50 being open and 100 being closed, so scale and rever
          return [100 - (devicePosition - 50) * 2, 90];
        }
    }
  }

  /**
   * Maps homekit values to device values
   *
   * @param homekitPosition the position as reported by homekit
   * @param homekitTiltAngle? the tilt angle as reported by homekit
   * @returns [device position, device direction]
   */
  mapHomekitValuesToDeviceValues(homekitPosition: number, homekitTiltAngle: number): [string, number] {
    // homekit position 0 =>  closed
    // homekit position 100 => open

    // device position [up, 0] = closed upwards
    // device position [down, 0] = closed downwards
    // device position [up, 100] = open
    // device position [down, 100] = open

    switch (this.mappingMode) {
      case BlindTiltMappingMode.OnlyUp:
        // invert
        return ['up', homekitPosition];
      case BlindTiltMappingMode.OnlyDown:
        // invert
        return ['down', homekitPosition];

      case BlindTiltMappingMode.DownAndUp:
        // homekit 0 = downwards closed,
        // homekit 50 = open,
        // homekit 100 = upwards closed
        if (homekitPosition <= 50) {
          // homekit 0..50 -> device 100..0 so scale and invert
          return ['down', 100 - homekitPosition * 2];
        } else {
          // homekit 50..100 -> device 0..100, so rebase, scale and invert
          return ['up', (homekitPosition - 50) * 2];
        }

      case BlindTiltMappingMode.UpAndDown:
        // homekit 0 = upwards closed,
        // homekit 50 = open,
        // homekit 100 = upwards closed
        if (homekitPosition <= 50) {
          // homekit 0..50 -> device 0..100 so scale and invert
          return ['up', homekitPosition * 2];
        } else {
          // homekit 50..100 -> device 100...0 so scale
          return ['down', 100 - homekitPosition * 2];
        }

      case BlindTiltMappingMode.UseTiltForDirection:
        // tilt -90, homekit 0 = closed downwards
        // tilt -90, homekit 100 = open
        // tilt 90, homekit 0 = closed upwards
        // tilt 90, homekit 100 = open
        if (homekitTiltAngle! <= 0) {
          // downwards
          // homekit 0..100 -> device 0..100, so invert
          return ['down', homekitPosition];
        } else {
          // upwards
          // homekit 0..100 -> device 0..100, so invert
          return ['up', homekitPosition];
        }
    }
  }
}
