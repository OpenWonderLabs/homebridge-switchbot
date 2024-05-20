/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * curtain.ts: @switchbot/homebridge-switchbot.
 */
import { hostname } from 'os';
import { request } from 'undici';
import { interval, Subject } from 'rxjs';
import { deviceBase } from './device.js';
import { Devices } from '../settings.js';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';

import type { SwitchBotPlatform } from '../platform.js';
import type { device, devicesConfig, serviceData, deviceStatus} from '../settings.js';
import type { Service, PlatformAccessory, CharacteristicValue, CharacteristicChange } from 'homebridge';

export class Curtain extends deviceBase {
  // Services
  private WindowCovering: {
    Name: CharacteristicValue;
    Service: Service;
    PositionState: CharacteristicValue;
    TargetPosition: CharacteristicValue;
    CurrentPosition: CharacteristicValue;
    HoldPosition: CharacteristicValue;
  };

  private Battery: {
    Name: CharacteristicValue;
    Service: Service;
    BatteryLevel: CharacteristicValue;
    StatusLowBattery: CharacteristicValue;
    ChargingState: CharacteristicValue;
  };

  private LightSensor?: {
    Name: CharacteristicValue;
    Service: Service;
    CurrentAmbientLightLevel?: CharacteristicValue;
  };

  // Target
  setNewTarget!: boolean;
  setNewTargetTimer!: NodeJS.Timeout;

  // Updates
  curtainUpdateInProgress!: boolean;
  doCurtainUpdate!: Subject<void>;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device);
    // default placeholder
    this.history(device);
    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doCurtainUpdate = new Subject();
    this.curtainUpdateInProgress = false;
    this.setNewTarget = false;

    // Initialize WindowCovering Service
    accessory.context.WindowCovering = accessory.context.WindowCovering ?? {};
    this.WindowCovering = {
      Name: accessory.context.WindowCovering.Name ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service.WindowCovering) ?? accessory.addService(this.hap.Service.WindowCovering) as Service,
      PositionState: accessory.context.PositionState ?? this.hap.Characteristic.PositionState.STOPPED,
      TargetPosition: accessory.context.TargetPosition ?? 100,
      CurrentPosition: accessory.context.CurrentPosition ?? 100,
      HoldPosition: accessory.context.HoldPosition ?? false,
    };
    accessory.context.WindowCovering = this.WindowCovering as object;

    // Initialize WindowCovering Service
    this.WindowCovering.Service.
      setCharacteristic(this.hap.Characteristic.Name, this.WindowCovering.Name)
      .setCharacteristic(this.hap.Characteristic.ObstructionDetected, false)
      .getCharacteristic(this.hap.Characteristic.PositionState)
      .onGet(() => {
        return this.WindowCovering.PositionState;
      });

    // Initialize WindowCovering CurrentPosition
    this.WindowCovering.Service
      .getCharacteristic(this.hap.Characteristic.CurrentPosition)
      .setProps({
        minStep: Number(this.minStep(device)),
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onGet(() => {
        return this.WindowCovering.CurrentPosition;
      });

    // Initialize WindowCovering TargetPosition
    this.WindowCovering.Service
      .getCharacteristic(this.hap.Characteristic.TargetPosition)
      .setProps({
        minStep: Number(this.minStep(device)),
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onGet(() => {
        return this.WindowCovering.TargetPosition;
      })
      .onSet(this.TargetPositionSet.bind(this));

    // Initialize WindowCovering TargetPosition
    this.WindowCovering.Service
      .getCharacteristic(this.hap.Characteristic.HoldPosition)
      .onGet(() => {
        return this.WindowCovering.HoldPosition;
      })
      .onSet(this.HoldPositionSet.bind(this));

    // Initialize Battery Service
    accessory.context.Battery = accessory.context.Battery ?? {};
    this.Battery = {
      Name: accessory.context.Battery.Name ?? `${accessory.displayName} Battery`,
      Service: accessory.getService(this.hap.Service.Battery) ?? accessory.addService(this.hap.Service.Battery) as Service,
      BatteryLevel: accessory.context.BatteryLevel ?? 100,
      StatusLowBattery: accessory.context.StatusLowBattery ?? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      ChargingState: accessory.context.ChargingState ?? this.hap.Characteristic.ChargingState.NOT_CHARGING,
    };
    accessory.context.Battery = this.Battery as object;

    // Initialize Battery Service
    this.Battery.Service
      .setCharacteristic(this.hap.Characteristic.Name, this.Battery.Name)
      .getCharacteristic(this.hap.Characteristic.BatteryLevel)
      .onGet(() => {
        return this.Battery.BatteryLevel;
      });

    this.Battery.Service
      .getCharacteristic(this.hap.Characteristic.StatusLowBattery)
      .onGet(() => {
        return this.Battery.StatusLowBattery;
      });

    this.Battery.Service
      .getCharacteristic(this.hap.Characteristic.ChargingState)
      .onGet(() => {
        return this.Battery.ChargingState;
      });

    // Initialize LightSensor Service
    if (device.curtain?.hide_lightsensor) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Light Sensor Service`);
      this.LightSensor!.Service = this.accessory.getService(this.hap.Service.LightSensor) as Service;
      accessory.removeService(this.LightSensor!.Service);
    } else {
      accessory.context.LightSensor = accessory.context.LightSensor ?? {};
      this.LightSensor = {
        Name: accessory.context.LightSensor.Name ?? `${accessory.displayName} Light Sensor`,
        Service: accessory.getService(this.hap.Service.LightSensor) ?? this.accessory.addService(this.hap.Service.LightSensor) as Service,
        CurrentAmbientLightLevel: accessory.context.CurrentAmbientLightLevel ?? 0.0001,
      };
      accessory.context.LightSensor = this.LightSensor as object;

      // Initialize LightSensor Characteristic
      this.LightSensor.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.LightSensor.Name)
        .setCharacteristic(this.hap.Characteristic.StatusActive, true)
        .getCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel)
        .onGet(() => {
          return this.LightSensor!.CurrentAmbientLightLevel!;
        });
    }

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.curtainUpdateInProgress))
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
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ` +
            '(slidePosition, battery) = ' +
            `Webhook:(${slidePosition}, ${battery}), ` +
            `current:(${this.WindowCovering.CurrentPosition}, ${this.Battery.BatteryLevel})`);
          this.WindowCovering.CurrentPosition = slidePosition;
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
      //.pipe(skipWhile(() => this.curtainUpdateInProgress))
      .subscribe(async () => {
        if (this.WindowCovering.PositionState === this.hap.Characteristic.PositionState.STOPPED) {
          return;
        }
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Refresh Status When Moving,`
          + ` PositionState: ${this.WindowCovering.PositionState}`);
        await this.refreshStatus();
      });

    // Watch for Curtain change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doCurtainUpdate
      .pipe(
        tap(() => {
          this.curtainUpdateInProgress = true;
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
        this.curtainUpdateInProgress = false;
      });

    // Setup EVE history features
    this.setupHistoryService(device);
  }

  private history(device: device & devicesConfig) {
    if (device.history === true) {
      // initialize when this accessory is newly created.
      this.accessory.context.lastActivation = this.accessory.context.lastActivation ?? 0;
    } else {
      // removes cached values if history is turned off
      delete this.accessory.context.lastActivation;
    }
  }

  /*
   * Setup EVE history features for curtain devices.
   */
  async setupHistoryService(device: device & devicesConfig): Promise<void> {
    if (device.history !== true) {
      return;
    }

    const mac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(':')
      .toLowerCase();
    this.historyService = new this.platform.fakegatoAPI('custom', this.accessory, {
      log: this.platform.log,
      storage: 'fs',
      filename: `${hostname().split('.')[0]}_${mac}_persist.json`,
    });
    const motion: Service =
      this.accessory.getService(this.hap.Service.MotionSensor) ||
      this.accessory.addService(this.hap.Service.MotionSensor, `${this.accessory.displayName} Motion`);
    motion.addOptionalCharacteristic(this.platform.eve.Characteristics.LastActivation);
    motion.getCharacteristic(this.platform.eve.Characteristics.LastActivation).onGet(() => {
      const lastActivation = this.accessory.context.lastActivation
        ? Math.max(0, this.accessory.context.lastActivation - this.historyService.getInitialTime())
        : 0;
      return lastActivation;
    });
    await this.setMinMax();
    motion.getCharacteristic(this.hap.Characteristic.MotionDetected).on('change', (event: CharacteristicChange) => {
      if (event.newValue !== event.oldValue) {
        const sensor = this.accessory.getService(this.hap.Service.MotionSensor);
        const entry = {
          time: Math.round(new Date().valueOf() / 1000),
          motion: event.newValue,
        };
        this.accessory.context.lastActivation = entry.time;
        sensor?.updateCharacteristic(
          this.platform.eve.Characteristics.LastActivation,
          Math.max(0, this.accessory.context.lastActivation - this.historyService.getInitialTime()),
        );
        this.historyService.addEntry(entry);
      }
    });
    this.updateHistory();
  }

  async updateHistory(): Promise<void> {
    const motion = Number(this.WindowCovering.CurrentPosition) > 0 ? 1 : 0;
    this.historyService.addEntry({
      time: Math.round(new Date().valueOf() / 1000),
      motion: motion,
    });
    setTimeout(
      () => {
        this.updateHistory();
      },
      10 * 60 * 1000,
    );
  }

  async BLEparseStatus(serviceData: serviceData): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);
    // CurrentPosition
    this.WindowCovering.CurrentPosition = 100 - Number(serviceData.position);
    await this.setMinMax();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition ${this.WindowCovering.CurrentPosition}`);
    if (this.setNewTarget) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Checking Status ...`);
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
        this.debugLog(`${this.device.deviceType}: ${this.WindowCovering.CurrentPosition} Standby,`
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
    this.debugLog(
      `${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition: ${this.WindowCovering.CurrentPosition},` +
      ` TargetPosition: ${this.WindowCovering.TargetPosition}, PositionState: ${this.WindowCovering.PositionState},`,
    );

    if (!this.device.curtain?.hide_lightsensor) {
      const set_minLux = await this.minLux();
      const set_maxLux = await this.maxLux();
      const spaceBetweenLevels = 9;

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
          this.Battery.ChargingState = this.hap.Characteristic.ChargingState.CHARGING;
          break;
        case 4:
          this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 3;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${serviceData.lightLevel}`);
          this.Battery.ChargingState = this.hap.Characteristic.ChargingState.CHARGING;
          break;
        case 5:
          this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 4;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${serviceData.lightLevel}`);
          this.Battery.ChargingState = this.hap.Characteristic.ChargingState.CHARGING;
          break;
        case 6:
          this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 5;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${serviceData.lightLevel}`);
          this.Battery.ChargingState = this.hap.Characteristic.ChargingState.CHARGING;
          break;
        case 7:
          this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 6;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${serviceData.lightLevel}`);
          this.Battery.ChargingState = this.hap.Characteristic.ChargingState.CHARGING;
          break;
        case 8:
          this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 7;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${serviceData.lightLevel}`);
          this.Battery.ChargingState = this.hap.Characteristic.ChargingState.CHARGING;
          break;
        case 9:
          this.LightSensor!.CurrentAmbientLightLevel = ((set_maxLux - set_minLux) / spaceBetweenLevels) * 8;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${serviceData.lightLevel}`);
          this.Battery.ChargingState = this.hap.Characteristic.ChargingState.CHARGING;
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

  async openAPIparseStatus(deviceStatus: deviceStatus): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
    // CurrentPosition
    this.WindowCovering!.CurrentPosition = 100 - Number(deviceStatus.body.slidePosition);
    await this.setMinMax();
    this.debugLog(`Curtain ${this.accessory.displayName} CurrentPosition: ${this.WindowCovering.CurrentPosition}`);
    if (this.setNewTarget) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Checking Status ...`);
    }

    if (this.setNewTarget && deviceStatus.body.moving) {
      await this.setMinMax();
      if (Number(this.WindowCovering.TargetPosition) > this.WindowCovering.CurrentPosition) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Closing, CurrentPosition: ${this.WindowCovering.CurrentPosition} `);
        this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.INCREASING;
        this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.WindowCovering.CurrentPosition} INCREASING`
          + ` PositionState: ${this.WindowCovering.PositionState}`);
      } else if (Number(this.WindowCovering.TargetPosition) < this.WindowCovering.CurrentPosition) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Opening, CurrentPosition: ${this.WindowCovering.CurrentPosition} `);
        this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.DECREASING;
        this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.WindowCovering.CurrentPosition} DECREASING`
          + ` PositionState: ${this.WindowCovering.PositionState}`);
      } else {
        this.debugLog(`${this.device.deviceType}: ${this.WindowCovering.CurrentPosition} Standby,`
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
    this.debugLog(
      `${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition: ${this.WindowCovering.CurrentPosition},` +
      ` TargetPosition: ${this.WindowCovering.TargetPosition}, PositionState: ${this.WindowCovering.PositionState},`,
    );

    // Brightness
    if (!this.device.curtain?.hide_lightsensor) {
      const set_minLux = await this.minLux();
      const set_maxLux = await this.maxLux();
      switch (deviceStatus.body.brightness) {
        case 'bright':
          this.LightSensor!.CurrentAmbientLightLevel = set_maxLux;
          this.Battery.ChargingState = this.hap.Characteristic.ChargingState.CHARGING;
          break;
        case 'dim':
        default:
          this.LightSensor!.CurrentAmbientLightLevel = set_minLux;
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
      .pipe(skipWhile(() => this.curtainUpdateInProgress))
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
      const adjustedMode = setPositionMode === 1 ? 0x01 : 0xff;
      this.debugLog(`${this.accessory.displayName} Mode: ${Mode}`);
      if (switchbot !== false) {
        try {
          const device_list = await switchbot.discover({ model: 'c', quick: true, id: this.device.bleMac });
          this.infoLog(`${this.accessory.displayName} Target Position: ${this.WindowCovering.TargetPosition}`);

          await this.retryBLE({
            max: await this.maxRetryBLE(),
            fn: async () => {
              await device_list[0].runToPos(100 - Number(this.WindowCovering.TargetPosition), adjustedMode);
            },
          });

          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
          this.successLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `TargetPosition: ${this.WindowCovering.TargetPosition} sent over BLE,  sent successfully`);
        } catch (e) {
          this.apiError(e);
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}` +
            ` Connection, Error Message: ${JSON.stringify((e as Error).message)}`,
          );
          await this.BLEPushConnection();
          throw new Error('Connection error');
        }
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
    let command: string;
    let parameter: string;
    let commandType: string;
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);
    if (this.WindowCovering.TargetPosition !== this.WindowCovering.CurrentPosition || this.device.disableCaching) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Pushing ${this.WindowCovering.TargetPosition}`);
      const adjustedTargetPosition = 100 - Number(this.WindowCovering.TargetPosition);
      const { setPositionMode, Mode }: { setPositionMode: number; Mode: string; } = await this.setPerformance();
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Mode: ${Mode}`);
      const adjustedMode = setPositionMode || 'ff';
      if (this.WindowCovering.HoldPosition) {
        command = 'pause';
        parameter = 'default';
        commandType = 'command';
      } else {
        command = 'setPosition';
        parameter = `0,${adjustedMode},${adjustedTargetPosition}`;
        commandType = 'command';
      }
      const bodyChange = JSON.stringify({
        command: command,
        parameter: parameter,
        commandType: commandType,
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
    } else {
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} No OpenAPI Changes, CurrentPosition & TargetPosition Are the Same.` +
        ` CurrentPosition: ${this.WindowCovering.CurrentPosition}, TargetPosition  ${this.WindowCovering.TargetPosition}`,
      );
    }
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

    // Set HoldPosition to false when TargetPosition is changed
    this.WindowCovering.HoldPosition = false;
    this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.HoldPosition, this.WindowCovering.HoldPosition);

    this.WindowCovering.TargetPosition = value;
    if (this.device.mqttURL) {
      this.mqttPublish('TargetPosition', this.WindowCovering.TargetPosition.toString());
      this.mqttPublish('HoldPosition', this.WindowCovering.HoldPosition.toString()); // Convert boolean to string
    }

    await this.setMinMax();
    if (value > this.WindowCovering.CurrentPosition) {
      this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.INCREASING;
      this.setNewTarget = true;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} value: ${value},`
        + ` CurrentPosition: ${this.WindowCovering.CurrentPosition}`);
    } else if (value < this.WindowCovering.CurrentPosition) {
      this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.DECREASING;
      this.setNewTarget = true;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} value: ${value},`
        + ` CurrentPosition: ${this.WindowCovering.CurrentPosition}`);
    } else {
      this.WindowCovering.PositionState = this.hap.Characteristic.PositionState.STOPPED;
      this.setNewTarget = false;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} value: ${value},`
        + ` CurrentPosition: ${this.WindowCovering.CurrentPosition}`);
    }
    this.WindowCovering.Service.setCharacteristic(this.hap.Characteristic.PositionState, this.WindowCovering.PositionState);
    this.WindowCovering.Service.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.WindowCovering.PositionState);

    /**
     * If Curtain movement time is short, the moving flag from backend is always false.
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
    this.doCurtainUpdate.next();
  }

  /**
   * Handle requests to set the value of the "Target Position" characteristic
   */
  async HoldPositionSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} HoldPosition: ${value}`);
    this.WindowCovering.HoldPosition = value;
    this.doCurtainUpdate.next();
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    await this.setMinMax();
    if (this.WindowCovering.CurrentPosition === undefined || Number.isNaN(this.WindowCovering.CurrentPosition)) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition: ${this.WindowCovering.CurrentPosition}`);
    } else {
      this.accessory.context.CurrentPosition = this.WindowCovering.CurrentPosition;
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, Number(this.WindowCovering.CurrentPosition));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` CurrentPosition: ${this.WindowCovering.CurrentPosition}`);
      if (this.device.mqttURL) {
        this.mqttPublish('CurrentPosition', this.WindowCovering.CurrentPosition.toString()); // Convert to string
      }
    }
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
    if (this.WindowCovering.HoldPosition === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} HoldPosition: ${this.WindowCovering.HoldPosition}`);
    } else {
      if (this.device.mqttURL) {
        this.mqttPublish('HoldPosition', this.WindowCovering.HoldPosition.toString());
      }
      this.accessory.context.HoldPosition = this.WindowCovering.HoldPosition;
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.HoldPosition, this.WindowCovering.HoldPosition);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` HoldPosition: ${this.WindowCovering.HoldPosition}`);
    }
    if (!this.device.curtain?.hide_lightsensor) {
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
        if (this.device.history) {
          this.historyService?.addEntry({
            time: Math.round(new Date().valueOf() / 1000),
            lux: this.LightSensor!.CurrentAmbientLightLevel,
          });
        }
      }
    }
    if (this.Battery.BatteryLevel === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel}`);
    } else {
      if (this.device.mqttURL) {
        this.mqttPublish('BatteryLevel', this.Battery.BatteryLevel.toString());
      }
      this.accessory.context.BatteryLevel = this.Battery.BatteryLevel;
      this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, this.Battery.BatteryLevel);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.Battery.BatteryLevel}`);
    }
    if (this.Battery.StatusLowBattery === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatusLowBattery: ${this.Battery.StatusLowBattery}`);
    } else {
      if (this.device.mqttURL) {
        this.mqttPublish('StatusLowBattery', this.Battery.StatusLowBattery.toString());
      }
      this.accessory.context.StatusLowBattery = this.Battery.StatusLowBattery;
      this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, this.Battery.StatusLowBattery);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` StatusLowBattery: ${this.Battery.StatusLowBattery}`);
    }
    if (this.Battery.ChargingState === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ChargingState: ${this.Battery.ChargingState}`);
    } else {
      if (this.device.mqttURL) {
        this.mqttPublish('ChargingState', this.Battery.ChargingState.toString());
      }
      this.accessory.context.ChargingState = this.Battery.ChargingState;
      this.Battery.Service.updateCharacteristic(this.hap.Characteristic.ChargingState, this.Battery.ChargingState);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` ChargingState: ${this.Battery.ChargingState}`);
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
    if (this.device.curtain?.set_min) {
      if (Number(this.WindowCovering.CurrentPosition) <= this.device.curtain?.set_min) {
        this.WindowCovering.CurrentPosition = 0;
      }
    }
    if (this.device.curtain?.set_max) {
      if (Number(this.WindowCovering.CurrentPosition) >= this.device.curtain?.set_max) {
        this.WindowCovering.CurrentPosition = 100;
      }
    }
    if (this.device.history) {
      const motion = this.accessory.getService(this.hap.Service.MotionSensor);
      const state = Number(this.WindowCovering.CurrentPosition) > 0 ? 1 : 0;
      motion?.updateCharacteristic(this.hap.Characteristic.MotionDetected, state);
    }
  }

  async minStep(device: device & devicesConfig): Promise<number> {
    let set_minStep: number;
    if (device.curtain?.set_minStep) {
      set_minStep = device.curtain?.set_minStep;
    } else {
      set_minStep = 1;
    }
    return set_minStep;
  }

  async minLux(): Promise<number> {
    let set_minLux: number;
    if (this.device.curtain?.set_minLux) {
      set_minLux = this.device.curtain?.set_minLux;
    } else {
      set_minLux = 1;
    }
    return set_minLux;
  }

  async maxLux(): Promise<number> {
    let set_maxLux: number;
    if (this.device.curtain?.set_maxLux) {
      set_maxLux = this.device.curtain?.set_maxLux;
    } else {
      set_maxLux = 6001;
    }
    return set_maxLux;
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, 100);
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, 100);
      this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, this.hap.Characteristic.PositionState.STOPPED);
    }
  }

  async apiError(e: any): Promise<void> {
    this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
    this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.PositionState, e);
    this.WindowCovering.Service.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e);
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e);
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.ChargingState, e);
    if (!this.device.curtain?.hide_lightsensor) {
      this.LightSensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, e);
      this.LightSensor!.Service.updateCharacteristic(this.hap.Characteristic.StatusActive, e);
    }
  }
}
