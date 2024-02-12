import { request } from 'undici';
import { sleep } from '../utils.js';
import { MqttClient } from 'mqtt';
import { interval, Subject } from 'rxjs';
import asyncmqtt from 'async-mqtt';
import { SwitchBotPlatform } from '../platform.js';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue, CharacteristicChange, API, Logging, HAP } from 'homebridge';
import { device, devicesConfig, serviceData, deviceStatus, Devices, SwitchBotPlatformConfig } from '../settings.js';
import { hostname } from 'os';

export class Curtain {
  public readonly api: API;
  public readonly log: Logging;
  public readonly config!: SwitchBotPlatformConfig;
  protected readonly hap: HAP;
  // Services
  batteryService: Service;
  lightSensorService?: Service;
  windowCoveringService!: Service;

  // Characteristic Values
  BatteryLevel!: CharacteristicValue;
  HoldPosition!: CharacteristicValue;
  PositionState!: CharacteristicValue;
  TargetPosition!: CharacteristicValue;
  CurrentPosition!: CharacteristicValue;
  FirmwareRevision!: CharacteristicValue;
  StatusLowBattery!: CharacteristicValue;
  CurrentAmbientLightLevel?: CharacteristicValue;

  // OpenAPI Status
  OpenAPI_InMotion: deviceStatus['moving'];
  OpenAPI_BatteryLevel: deviceStatus['battery'];
  OpenAPI_FirmwareRevision: deviceStatus['version'];
  OpenAPI_CurrentPosition: deviceStatus['slidePosition'];
  OpenAPI_CurrentAmbientLightLevel: deviceStatus['brightness'];

  // Others
  Mode!: string;
  setPositionMode?: string;

  // BLE Status
  BLE_InMotion: serviceData['inMotion'];
  BLE_BatteryLevel: serviceData['battery'];
  BLE_Calibration: serviceData['calibration'];
  BLE_CurrentPosition: serviceData['position'];
  BLE_CurrentAmbientLightLevel: serviceData['lightLevel'];

  // BLE Others
  BLE_IsConnected?: boolean;
  spaceBetweenLevels!: number;

  // Target
  setNewTarget!: boolean;
  setNewTargetTimer!: NodeJS.Timeout;

  //MQTT stuff
  mqttClient: MqttClient | null = null;

  // Config
  updateRate!: number;
  set_minLux!: number;
  set_maxLux!: number;
  set_minStep!: number;
  setOpenMode!: string;
  setCloseMode!: string;
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;

  // Updates
  curtainUpdateInProgress!: boolean;
  doCurtainUpdate!: Subject<void>;

  // Connection
  private readonly OpenAPI: boolean;
  private readonly BLE: boolean;

  // EVE history service handler
  historyService: any = null;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device & devicesConfig,
  ) {
    this.api = this.platform.api;
    this.log = this.platform.log;
    this.config = this.platform.config;
    this.hap = this.api.hap;
    // Connection
    this.BLE = this.device.connectionType === 'BLE' || this.device.connectionType === 'BLE/OpenAPI';
    this.OpenAPI = this.device.connectionType === 'OpenAPI' || this.device.connectionType === 'BLE/OpenAPI';
    // default placeholders
    this.deviceLogs(device);
    this.refreshRate(device);
    this.scan(device);
    this.setupMqtt(device);
    this.deviceContext();
    this.deviceConfig(device);

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doCurtainUpdate = new Subject();
    this.curtainUpdateInProgress = false;
    this.setNewTarget = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.hap.Characteristic.Model, 'W0701600')
      .setCharacteristic(this.hap.Characteristic.SerialNumber, device.deviceId)
      .setCharacteristic(this.hap.Characteristic.FirmwareRevision, accessory.context.FirmwareRevision);

    // get the WindowCovering service if it exists, otherwise create a new WindowCovering service
    // you can create multiple services for each accessory
    const windowCoveringService = `${accessory.displayName} ${device.deviceType}`;
    (this.windowCoveringService = accessory.getService(this.hap.Service.WindowCovering)
      || accessory.addService(this.hap.Service.WindowCovering)), windowCoveringService;

    this.windowCoveringService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
    if (!this.windowCoveringService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
      this.windowCoveringService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
    }

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/WindowCovering

    // create handlers for required characteristics
    this.windowCoveringService.setCharacteristic(this.hap.Characteristic.PositionState, this.PositionState);

    this.windowCoveringService
      .getCharacteristic(this.hap.Characteristic.CurrentPosition)
      .setProps({
        minStep: this.minStep(device),
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onGet(() => {
        return this.CurrentPosition;
      });

    this.windowCoveringService
      .getCharacteristic(this.hap.Characteristic.TargetPosition)
      .setProps({
        minStep: this.minStep(device),
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onSet(this.TargetPositionSet.bind(this));

    this.windowCoveringService
      .getCharacteristic(this.hap.Characteristic.HoldPosition)
      .onSet(this.HoldPositionSet.bind(this));

    // Light Sensor Service
    if (device.curtain?.hide_lightsensor) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Light Sensor Service`);
      this.lightSensorService = this.accessory.getService(this.hap.Service.LightSensor);
      accessory.removeService(this.lightSensorService!);
    } else if (!this.lightSensorService) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Light Sensor Service`);
      const lightSensorService = `${accessory.displayName} Light Sensor`;
      (this.lightSensorService = this.accessory.getService(this.hap.Service.LightSensor)
        || this.accessory.addService(this.hap.Service.LightSensor)), lightSensorService;

      this.lightSensorService.setCharacteristic(this.hap.Characteristic.Name, `${accessory.displayName} Light Sensor`);
      if (!this.lightSensorService?.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
        this.lightSensorService.addCharacteristic(this.hap.Characteristic.ConfiguredName, `${accessory.displayName} Light Sensor`);
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Light Sensor Service Not Added`);
    }

    // Battery Service
    const batteryService = `${accessory.displayName} Battery`;
    (this.batteryService = this.accessory.getService(this.hap.Service.Battery)
      || accessory.addService(this.hap.Service.Battery)), batteryService;

    this.batteryService.setCharacteristic(this.hap.Characteristic.Name, `${accessory.displayName} Battery`);
    if (!this.batteryService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
      this.batteryService.addCharacteristic(this.hap.Characteristic.ConfiguredName, `${accessory.displayName} Battery`);
    }

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.curtainUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    //regisiter webhook event handler
    if (this.device.webhook) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} is listening webhook.`);
      this.platform.webhookEventHandler[this.device.deviceId] = async (context) => {
        try {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} received Webhook: ${JSON.stringify(context)}`);
          const { slidePosition, battery } = context;
          const { CurrentPosition, BatteryLevel } = this;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ` +
            '(slidePosition, battery) = ' +
            `Webhook:(${slidePosition}, ${battery}), ` +
            `current:(${CurrentPosition}, ${BatteryLevel})`);
          this.CurrentPosition = slidePosition;
          this.BatteryLevel = battery;
          this.updateHomeKitCharacteristics();
        } catch (e: any) {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`);
        }
      };
    }

    // update slide progress
    interval(this.updateRate * 1000)
      //.pipe(skipWhile(() => this.curtainUpdateInProgress))
      .subscribe(async () => {
        if (this.PositionState === this.hap.Characteristic.PositionState.STOPPED) {
          return;
        }
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Refresh Status When Moving, PositionState: ${this.PositionState}`);
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
    const motion = Number(this.CurrentPosition) > 0 ? 1 : 0;
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
      this.debugWarnLog(
        `${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` + ` ${this.device.connectionType}, parseStatus will not happen.`,
      );
    }
  }

  async BLEparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);
    // CurrentPosition
    this.CurrentPosition = 100 - Number(this.BLE_CurrentPosition);
    await this.setMinMax();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition ${this.CurrentPosition}`);
    if (this.setNewTarget) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Checking Status ...`);
      await this.setMinMax();
      if (Number(this.TargetPosition) > this.CurrentPosition) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Closing, CurrentPosition: ${this.CurrentPosition}`);
        this.PositionState = this.hap.Characteristic.PositionState.INCREASING;
        this.windowCoveringService.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} INCREASING PositionState: ${this.PositionState}`);
      } else if (Number(this.TargetPosition) < this.CurrentPosition) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Opening, CurrentPosition: ${this.CurrentPosition}`);
        this.PositionState = this.hap.Characteristic.PositionState.DECREASING;
        this.windowCoveringService.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} DECREASING PositionState: ${this.PositionState}`);
      } else {
        this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} Standby, CurrentPosition: ${this.CurrentPosition}`);
        this.PositionState = this.hap.Characteristic.PositionState.STOPPED;
        this.windowCoveringService.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} STOPPED PositionState: ${this.PositionState}`);
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Standby, CurrentPosition: ${this.CurrentPosition}`);
      this.TargetPosition = this.CurrentPosition;
      this.PositionState = this.hap.Characteristic.PositionState.STOPPED;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Stopped`);
    }
    this.debugLog(
      `${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition},` +
      ` TargetPosition: ${this.TargetPosition}, PositionState: ${this.PositionState},`,
    );

    if (!this.device.curtain?.hide_lightsensor) {
      this.set_minLux = this.minLux();
      this.set_maxLux = this.maxLux();
      this.spaceBetweenLevels = 9;

      // Brightness
      switch (this.BLE_CurrentAmbientLightLevel) {
        case 1:
          this.CurrentAmbientLightLevel = this.set_minLux;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.BLE_CurrentAmbientLightLevel}`);
          break;
        case 2:
          this.CurrentAmbientLightLevel = (this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels;
          this.debugLog(
            `${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.BLE_CurrentAmbientLightLevel},` +
            ` Calculation: ${(this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels}`,
          );
          break;
        case 3:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 2;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.BLE_CurrentAmbientLightLevel}`);
          break;
        case 4:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 3;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.BLE_CurrentAmbientLightLevel}`);
          break;
        case 5:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 4;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.BLE_CurrentAmbientLightLevel}`);
          break;
        case 6:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 5;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.BLE_CurrentAmbientLightLevel}`);
          break;
        case 7:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 6;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.BLE_CurrentAmbientLightLevel}`);
          break;
        case 8:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 7;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.BLE_CurrentAmbientLightLevel}`);
          break;
        case 9:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 8;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.BLE_CurrentAmbientLightLevel}`);
          break;
        case 10:
        default:
          this.CurrentAmbientLightLevel = this.set_maxLux;
          this.debugLog();
      }
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.BLE_CurrentAmbientLightLevel},` +
        ` CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`,
      );
    }
    // Battery
    this.BatteryLevel = Number(this.BLE_BatteryLevel);
    if (this.BatteryLevel < 10) {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.debugLog(
      `${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel},` + ` StatusLowBattery: ${this.StatusLowBattery}`,
    );
  }

  async openAPIparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
    // CurrentPosition
    this.CurrentPosition = 100 - Number(this.OpenAPI_CurrentPosition);
    await this.setMinMax();
    this.debugLog(`Curtain ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition}`);
    if (this.setNewTarget) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Checking Status ...`);
    }

    if (this.setNewTarget && this.OpenAPI_InMotion) {
      await this.setMinMax();
      if (Number(this.TargetPosition) > this.CurrentPosition) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Closing, CurrentPosition: ${this.CurrentPosition} `);
        this.PositionState = this.hap.Characteristic.PositionState.INCREASING;
        this.windowCoveringService.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} INCREASING PositionState: ${this.PositionState}`);
      } else if (Number(this.TargetPosition) < this.CurrentPosition) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Opening, CurrentPosition: ${this.CurrentPosition} `);
        this.PositionState = this.hap.Characteristic.PositionState.DECREASING;
        this.windowCoveringService.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} DECREASING PositionState: ${this.PositionState}`);
      } else {
        this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} Standby, CurrentPosition: ${this.CurrentPosition}`);
        this.PositionState = this.hap.Characteristic.PositionState.STOPPED;
        this.windowCoveringService.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} STOPPED PositionState: ${this.PositionState}`);
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Standby, CurrentPosition: ${this.CurrentPosition}`);
      this.TargetPosition = this.CurrentPosition;
      this.PositionState = this.hap.Characteristic.PositionState.STOPPED;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Stopped`);
    }
    this.debugLog(
      `${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition},` +
      ` TargetPosition: ${this.TargetPosition}, PositionState: ${this.PositionState},`,
    );

    // Brightness
    if (!this.device.curtain?.hide_lightsensor) {
      this.set_minLux = this.minLux();
      this.set_maxLux = this.maxLux();
      switch (this.OpenAPI_CurrentAmbientLightLevel) {
        case 'dim':
          this.CurrentAmbientLightLevel = this.set_minLux;
          break;
        case 'bright':
        default:
          this.CurrentAmbientLightLevel = this.set_maxLux;
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
    }

    // BatteryLevel
    this.BatteryLevel = Number(this.OpenAPI_BatteryLevel);
    if (this.BatteryLevel < 10) {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    if (Number.isNaN(this.BatteryLevel)) {
      this.BatteryLevel = 100;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel},`
      + ` StatusLowBattery: ${this.StatusLowBattery}`);

    // FirmwareRevision
    this.FirmwareRevision = this.OpenAPI_FirmwareRevision!;
    this.accessory.context.FirmwareRevision = this.FirmwareRevision;
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
    let model: string;
    switch (this.device.configDeviceType) {
      case 'Curtain3':
        model = '{';
        break;
      default:
        model = 'c';
    }
    (async () => {
      // Start to monitor advertisement packets
      await switchbot.startScan({
        model: model,
        id: this.device.bleMac,
      });
      // Set an event handler
      switchbot.onadvertisement = (ad: any) => {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ${JSON.stringify(ad, null, '  ')}`);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} address: ${ad.address}, model: ${ad.serviceData.model}`);
        if (this.device.bleMac === ad.address && ad.serviceData.model === 'c') {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
          this.BLE_Calibration = ad.serviceData.calibration;
          this.BLE_BatteryLevel = ad.serviceData.battery;
          this.BLE_InMotion = ad.serviceData.inMotion;
          this.BLE_CurrentPosition = ad.serviceData.position;
          this.BLE_CurrentAmbientLightLevel = ad.serviceData.lightLevel;
        } else {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        }
      };
      // Wait 1 seconds
      await switchbot.wait(this.scanDuration * 1000);
      // Stop to monitor
      await switchbot.stopScan();
      // Update HomeKit
      await this.BLEparseStatus();
      await this.updateHomeKitCharacteristics();
    })();


    /*if (switchbot !== false) {
      switchbot
        .startScan({
          model: model,
          id: this.device.bleMac,
        })
        .then(async () => {
          // Set an event handler
          switchbot.onadvertisement = async (ad: ad) => {
            this.debugLog(
              `${this.device.deviceType}: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac},` +
              ` BLE Address Found: ${ad.address}`,
            );
            this.BLE_Calibration = ad.serviceData.calibration;
            this.BLE_BatteryLevel = ad.serviceData.battery;
            this.BLE_InMotion = ad.serviceData.inMotion;
            this.BLE_CurrentPosition = ad.serviceData.position;
            this.BLE_CurrentAmbientLightLevel = ad.serviceData.lightLevel;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
            this.debugLog(
              `${this.device.deviceType}: ${this.accessory.displayName} calibration: ${ad.serviceData.calibration}, ` +
              `position: ${ad.serviceData.position}, lightLevel: ${ad.serviceData.lightLevel}, battery: ${ad.serviceData.battery}, ` +
              `inMotion: ${ad.serviceData.inMotion}`,
            );

            if (ad.serviceData) {
              this.BLE_IsConnected = true;
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.BLE_IsConnected}`);
              await this.stopScanning(switchbot);
            } else {
              this.BLE_IsConnected = false;
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.BLE_IsConnected}`);
            }
          };
          // Wait
          return await sleep(this.scanDuration * 1000);
        })
        .then(async () => {
          // Stop to monitor
          await this.stopScanning(switchbot);
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed BLERefreshStatus with ${this.device.connectionType}` +
            ` Connection, Error Message: ${JSON.stringify(e.message)}`,
          );
          await this.BLERefreshConnection(switchbot);
        });
    } else {
      await this.BLERefreshConnection(switchbot);
    }*/
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode } = await request(`${Devices}/${this.device.deviceId}/status`, {
        headers: this.platform.generateHeaders(),
      });
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
      const deviceStatus: any = await body.json();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
      if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
        this.debugErrorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
        this.OpenAPI_CurrentPosition = deviceStatus.body.slidePosition;
        this.OpenAPI_InMotion = deviceStatus.body.moving;
        this.OpenAPI_CurrentAmbientLightLevel = deviceStatus.body.brightness;
        this.OpenAPI_BatteryLevel = deviceStatus.body.battery;
        this.OpenAPI_FirmwareRevision = deviceStatus.body.version;
        this.openAPIparseStatus();
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
    if (this.TargetPosition !== this.CurrentPosition) {
      const switchbot = await this.platform.connectBLE();
      // Convert to BLE Address
      this.device.bleMac = this.device
        .deviceId!.match(/.{1,2}/g)!
        .join(':')
        .toLowerCase();
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
      this.SilentPerformance();
      const adjustedMode = this.setPositionMode === '1' ? 0x01 : 0xff;
      this.debugLog(`${this.accessory.displayName} Mode: ${this.Mode}`);
      if (switchbot !== false) {
        try {
          const device_list = await switchbot.discover({ model: 'c', quick: true, id: this.device.bleMac });
          this.infoLog(`${this.accessory.displayName} Target Position: ${this.TargetPosition}`);

          await this.retry({
            max: this.maxRetry(),
            fn: async () => {
              await device_list[0].runToPos(100 - Number(this.TargetPosition), adjustedMode);
            },
          });

          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
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
        `  CurrentPosition: ${this.CurrentPosition}, TargetPosition  ${this.TargetPosition}`,
      );
    }
  }

  async retry({ max, fn }: { max: number; fn: { (): any; (): Promise<any> } }): Promise<null> {
    return fn().catch(async (e: any) => {
      if (max === 0) {
        throw e;
      }
      this.infoLog(e);
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Retrying`);
      await sleep(1000);
      return this.retry({ max: max - 1, fn });
    });
  }

  maxRetry(): number {
    if (this.device.maxRetry) {
      return this.device.maxRetry;
    } else {
      return 5;
    }
  }

  async openAPIpushChanges(): Promise<void> {
    let command: string;
    let parameter: string;
    let commandType: string;
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);
    if (this.TargetPosition !== this.CurrentPosition || this.device.disableCaching) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Pushing ${this.TargetPosition}`);
      const adjustedTargetPosition = 100 - Number(this.TargetPosition);
      if (Number(this.TargetPosition) > 50) {
        this.setPositionMode = this.device.curtain?.setOpenMode;
      } else {
        this.setPositionMode = this.device.curtain?.setCloseMode;
      }
      if (this.setPositionMode === '1') {
        this.Mode = 'Silent Mode';
      } else if (this.setPositionMode === '0') {
        this.Mode = 'Performance Mode';
      } else {
        this.Mode = 'Default Mode';
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Mode: ${this.Mode}`);
      const adjustedMode = this.setPositionMode || 'ff';
      if (this.HoldPosition) {
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
        ` CurrentPosition: ${this.CurrentPosition}, TargetPosition  ${this.TargetPosition}`,
      );
    }
  }

  /**
   * Handle requests to set the value of the "Target Position" characteristic
   */
  async TargetPositionSet(value: CharacteristicValue): Promise<void> {
    if (this.TargetPosition === this.accessory.context.TargetPosition) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set TargetPosition: ${value}`);
    } else {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set TargetPosition: ${value}`);
    }

    // Set HoldPosition to false when TargetPosition is changed
    this.HoldPosition = false;
    this.windowCoveringService.updateCharacteristic(this.hap.Characteristic.HoldPosition, this.HoldPosition);

    this.TargetPosition = value;
    if (this.device.mqttURL) {
      this.mqttPublish('TargetPosition', this.TargetPosition);
      this.mqttPublish('HoldPosition', this.HoldPosition);
    }

    await this.setMinMax();
    if (value > this.CurrentPosition) {
      this.PositionState = this.hap.Characteristic.PositionState.INCREASING;
      this.setNewTarget = true;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} value: ${value}, CurrentPosition: ${this.CurrentPosition}`);
    } else if (value < this.CurrentPosition) {
      this.PositionState = this.hap.Characteristic.PositionState.DECREASING;
      this.setNewTarget = true;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} value: ${value}, CurrentPosition: ${this.CurrentPosition}`);
    } else {
      this.PositionState = this.hap.Characteristic.PositionState.STOPPED;
      this.setNewTarget = false;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} value: ${value}, CurrentPosition: ${this.CurrentPosition}`);
    }
    this.windowCoveringService.setCharacteristic(this.hap.Characteristic.PositionState, this.PositionState);
    this.windowCoveringService.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.PositionState);

    /**
     * If Curtain movement time is short, the moving flag from backend is always false.
     * The minimum time depends on the network control latency.
     */
    clearTimeout(this.setNewTargetTimer);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateRate: ${this.updateRate}`);
    if (this.setNewTarget) {
      this.setNewTargetTimer = setTimeout(() => {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} setNewTarget ${this.setNewTarget} timeout`);
        this.setNewTarget = false;
      }, this.updateRate * 1000);
    }
    this.doCurtainUpdate.next();
  }

  /**
   * Handle requests to set the value of the "Target Position" characteristic
   */
  async HoldPositionSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} HoldPosition: ${value}`);
    this.HoldPosition = value;
    this.doCurtainUpdate.next();
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    await this.setMinMax();
    if (this.CurrentPosition === undefined || Number.isNaN(this.CurrentPosition)) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition}`);
    } else {
      if (this.device.mqttURL) {
        this.mqttPublish('CurrentPosition', this.CurrentPosition);
      }
      this.accessory.context.CurrentPosition = this.CurrentPosition;
      this.windowCoveringService.updateCharacteristic(this.hap.Characteristic.CurrentPosition, Number(this.CurrentPosition));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic CurrentPosition: ${this.CurrentPosition}`);
    }
    if (this.PositionState === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} PositionState: ${this.PositionState}`);
    } else {
      if (this.device.mqttURL) {
        this.mqttPublish('PositionState', this.PositionState);
      }
      this.accessory.context.PositionState = this.PositionState;
      this.windowCoveringService.updateCharacteristic(this.hap.Characteristic.PositionState, Number(this.PositionState));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic PositionState: ${this.PositionState}`);
    }
    if (this.TargetPosition === undefined || Number.isNaN(this.TargetPosition)) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} TargetPosition: ${this.TargetPosition}`);
    } else {
      if (this.device.mqttURL) {
        this.mqttPublish('TargetPosition', this.TargetPosition);
      }
      this.accessory.context.TargetPosition = this.TargetPosition;
      this.windowCoveringService.updateCharacteristic(this.hap.Characteristic.TargetPosition, Number(this.TargetPosition));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: ${this.TargetPosition}`);
    }
    if (this.HoldPosition === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} HoldPosition: ${this.HoldPosition}`);
    } else {
      if (this.device.mqttURL) {
        this.mqttPublish('HoldPosition', this.HoldPosition);
      }
      this.accessory.context.HoldPosition = this.HoldPosition;
      this.windowCoveringService.updateCharacteristic(this.hap.Characteristic.HoldPosition, this.HoldPosition);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic HoldPosition: ${this.HoldPosition}`);
    }
    if (!this.device.curtain?.hide_lightsensor) {
      if (this.CurrentAmbientLightLevel === undefined || Number.isNaN(this.CurrentAmbientLightLevel)) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
      } else {
        if (this.device.mqttURL) {
          this.mqttPublish('CurrentAmbientLightLevel', this.CurrentAmbientLightLevel);
        }
        this.accessory.context.CurrentAmbientLightLevel = this.CurrentAmbientLightLevel;
        this.lightSensorService?.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, this.CurrentAmbientLightLevel);
        this.debugLog(
          `${this.device.deviceType}: ${this.accessory.displayName}` +
          ` updateCharacteristic CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`,
        );
        if (this.device.history) {
          this.historyService?.addEntry({
            time: Math.round(new Date().valueOf() / 1000),
            lux: this.CurrentAmbientLightLevel,
          });
        }
      }
    }
    if (this.BatteryLevel === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
    } else {
      if (this.device.mqttURL) {
        this.mqttPublish('BatteryLevel', this.BatteryLevel);
      }
      this.accessory.context.BatteryLevel = this.BatteryLevel;
      this.batteryService?.updateCharacteristic(this.hap.Characteristic.BatteryLevel, this.BatteryLevel);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
    }
    if (this.StatusLowBattery === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
    } else {
      if (this.device.mqttURL) {
        this.mqttPublish('StatusLowBattery', this.StatusLowBattery);
      }
      this.accessory.context.StatusLowBattery = this.StatusLowBattery;
      this.batteryService?.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, this.StatusLowBattery);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
    }
  }

  /*
   * Publish MQTT message for topics of
   * 'homebridge-switchbot/curtain/xx:xx:xx:xx:xx:xx'
   */
  mqttPublish(topic: string, message: any) {
    const mac = this.device.deviceId
      ?.toLowerCase()
      .match(/[\s\S]{1,2}/g)
      ?.join(':');
    const options = this.device.mqttPubOptions || {};
    this.mqttClient?.publish(`homebridge-switchbot/curtain/${mac}/${topic}`, `${message}`, options);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} MQTT message: ${topic}/${message} options:${JSON.stringify(options)}`);
  }

  /*
   * Setup MQTT hadler if URL is specified.
   */
  async setupMqtt(device: device & devicesConfig): Promise<void> {
    if (device.mqttURL) {
      try {
        const { connectAsync } = asyncmqtt;
        this.mqttClient = await connectAsync(device.mqttURL, device.mqttOptions || {});
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} MQTT connection has been established successfully.`);
        this.mqttClient.on('error', (e: Error) => {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Failed to publish MQTT messages. ${e}`);
        });
      } catch (e) {
        this.mqttClient = null;
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Failed to establish MQTT connection. ${e}`);
      }
    }
  }

  async stopScanning(switchbot: any) {
    switchbot.stopScan();
    if (this.BLE_IsConnected) {
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
          model: 'c',
        });
        // Set an event handler
        switchbot.onadvertisement = (ad: any) => {
          this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} ad: ${JSON.stringify(ad, null, '  ')}`);
        };
        await sleep(10000);
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
    this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot:`
      + ` ${JSON.stringify(switchbot)}`);
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Refresh Status`);
      await this.openAPIRefreshStatus();
    }
  }

  async SilentPerformance() {
    if (Number(this.TargetPosition) > 50) {
      if (this.device.curtain?.setOpenMode === '1') {
        this.setPositionMode = '1';
        this.Mode = 'Silent Mode';
      } else {
        this.setPositionMode = '0';
        this.Mode = 'Performance Mode';
      }
    } else {
      if (this.device.curtain?.setCloseMode === '1') {
        this.setPositionMode = '1';
        this.Mode = 'Silent Mode';
      } else {
        this.setPositionMode = '0';
        this.Mode = 'Performance Mode';
      }
    }
  }

  async setMinMax(): Promise<void> {
    if (this.device.curtain?.set_min) {
      if (Number(this.CurrentPosition) <= this.device.curtain?.set_min) {
        this.CurrentPosition = 0;
      }
    }
    if (this.device.curtain?.set_max) {
      if (Number(this.CurrentPosition) >= this.device.curtain?.set_max) {
        this.CurrentPosition = 100;
      }
    }
    if (this.device.history) {
      const motion = this.accessory.getService(this.hap.Service.MotionSensor);
      const state = Number(this.CurrentPosition) > 0 ? 1 : 0;
      motion?.updateCharacteristic(this.hap.Characteristic.MotionDetected, state);
    }
  }

  minStep(device: device & devicesConfig): number {
    if (device.curtain?.set_minStep) {
      this.set_minStep = device.curtain?.set_minStep;
    } else {
      this.set_minStep = 1;
    }
    return this.set_minStep;
  }

  minLux(): number {
    if (this.device.curtain?.set_minLux) {
      this.set_minLux = this.device.curtain?.set_minLux;
    } else {
      this.set_minLux = 1;
    }
    return this.set_minLux;
  }

  maxLux(): number {
    if (this.device.curtain?.set_maxLux) {
      this.set_maxLux = this.device.curtain?.set_maxLux;
    } else {
      this.set_maxLux = 6001;
    }
    return this.set_maxLux;
  }

  async scan(device: device & devicesConfig): Promise<void> {
    if (device.scanDuration) {
      if (this.updateRate > device.scanDuration) {
        this.scanDuration = this.updateRate;
        if (this.BLE) {
          this.warnLog(
            `${this.device.deviceType}: ` +
            `${this.accessory.displayName} scanDuration is less than updateRate, overriding scanDuration with updateRate`,
          );
        }
      } else {
        this.scanDuration = this.accessory.context.scanDuration = device.scanDuration;
      }
      if (this.BLE) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config scanDuration: ${this.scanDuration}`);
      }
    } else {
      if (this.updateRate > 1) {
        this.scanDuration = this.updateRate;
      } else {
        this.scanDuration = this.accessory.context.scanDuration = 1;
      }
      if (this.BLE) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Default scanDuration: ${this.scanDuration}`);
      }
    }
  }

  async statusCode(statusCode: number): Promise<void> {
    switch (statusCode) {
      case 151:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Command not supported by this deviceType, statusCode: ${statusCode}`);
        break;
      case 152:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Device not found, statusCode: ${statusCode}`);
        break;
      case 160:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Command is not supported, statusCode: ${statusCode}`);
        break;
      case 161:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Device is offline, statusCode: ${statusCode}`);
        this.offlineOff();
        break;
      case 171:
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} Hub Device is offline, statusCode: ${statusCode}. ` +
          `Hub: ${this.device.hubDeviceId}`,
        );
        this.offlineOff();
        break;
      case 190:
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
          ` Or command format is invalid, statusCode: ${statusCode}`,
        );
        break;
      case 100:
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Command successfully sent, statusCode: ${statusCode}`);
        break;
      case 200:
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Request successful, statusCode: ${statusCode}`);
        break;
      case 400:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Bad Request, The client has issued an invalid request. `
            + `This is commonly used to specify validation errors in a request payload, statusCode: ${statusCode}`);
        break;
      case 401:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Unauthorized,	Authorization for the API is required, `
            + `but the request has not been authenticated, statusCode: ${statusCode}`);
        break;
      case 403:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Forbidden,	The request has been authenticated but does not `
            + `have appropriate permissions, or a requested resource is not found, statusCode: ${statusCode}`);
        break;
      case 404:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Not Found,	Specifies the requested path does not exist, `
        + `statusCode: ${statusCode}`);
        break;
      case 406:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Not Acceptable,	The client has requested a MIME type via `
            + `the Accept header for a value not supported by the server, statusCode: ${statusCode}`);
        break;
      case 415:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Unsupported Media Type,	The client has defined a contentType `
            + `header that is not supported by the server, statusCode: ${statusCode}`);
        break;
      case 422:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Unprocessable Entity,	The client has made a valid request, `
            + `but the server cannot process it. This is often used for APIs for which certain limits have been exceeded, statusCode: ${statusCode}`);
        break;
      case 429:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Too Many Requests,	The client has exceeded the number of `
            + `requests allowed for a given time window, statusCode: ${statusCode}`);
        break;
      case 500:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Internal Server Error,	An unexpected error on the SmartThings `
            + `servers has occurred. These errors should be rare, statusCode: ${statusCode}`);
        break;
      default:
        this.infoLog(
          `${this.device.deviceType}: ${this.accessory.displayName} Unknown statusCode: ` +
          `${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`,
        );
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      await this.deviceContext();
      await this.updateHomeKitCharacteristics();
    }
  }

  async apiError(e: any): Promise<void> {
    this.windowCoveringService.updateCharacteristic(this.hap.Characteristic.CurrentPosition, e);
    this.windowCoveringService.updateCharacteristic(this.hap.Characteristic.PositionState, e);
    this.windowCoveringService.updateCharacteristic(this.hap.Characteristic.TargetPosition, e);
    if (!this.device.curtain?.hide_lightsensor) {
      this.lightSensorService?.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, e);
    }
    this.batteryService?.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e);
    this.batteryService?.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e);
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  async deviceContext() {
    if (this.accessory.context.CurrentPosition === undefined) {
      this.CurrentPosition = 0;
    } else {
      this.CurrentPosition = this.accessory.context.CurrentPosition;
    }

    if (this.accessory.context.TargetPosition === undefined) {
      this.TargetPosition = 0;
    } else {
      this.TargetPosition = this.accessory.context.TargetPosition;
    }

    if (this.accessory.context.PositionState === undefined) {
      this.PositionState = this.hap.Characteristic.PositionState.STOPPED;
    } else {
      this.PositionState = this.accessory.context.PositionState;
    }

    if (!this.device.curtain?.hide_lightsensor) {
      if (this.accessory.context.CurrentAmbientLightLevel !== undefined) {
        this.CurrentAmbientLightLevel = this.accessory.context.CurrentAmbientLightLevel;
      }
    }

    if (this.BLE) {
      if (this.accessory.context.BatteryLevel === undefined) {
        this.BatteryLevel = 100;
      } else {
        this.BatteryLevel = this.accessory.context.BatteryLevel;
      }
      if (this.accessory.context.StatusLowBattery === undefined) {
        this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
      } else {
        this.StatusLowBattery = this.accessory.context.StatusLowBattery;
      }
    }

    if (this.device.history === true) {
      // initialize when this accessory is newly created.
      this.accessory.context.lastActivation = this.accessory.context.lastActivation ?? 0;
    } else {
      // removes cached values if history is turned off
      delete this.accessory.context.lastActivation;
    }
    if (this.FirmwareRevision === undefined) {
      this.FirmwareRevision = this.platform.version;
      this.accessory.context.FirmwareRevision = this.FirmwareRevision;
    }
  }

  async refreshRate(device: device & devicesConfig): Promise<void> {
    // refreshRate
    if (device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = device.refreshRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options!.refreshRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
    }
    // updateRate
    if (device?.curtain?.updateRate) {
      this.updateRate = device?.curtain?.updateRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config Curtain updateRate: ${this.updateRate}`);
    } else {
      this.updateRate = 7;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Default Curtain updateRate: ${this.updateRate}`);
    }
  }

  async deviceConfig(device: device & devicesConfig): Promise<void> {
    let config = {};
    if (device.curtain) {
      config = device.curtain;
    }
    if (device.connectionType !== undefined) {
      config['connectionType'] = device.connectionType;
    }
    if (device.external !== undefined) {
      config['external'] = device.external;
    }
    if (device.mqttURL !== undefined) {
      config['mqttURL'] = device.mqttURL;
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
    if (device.maxRetry !== undefined) {
      config['maxRetry'] = device.maxRetry;
    }
    if (device.webhook !== undefined) {
      config['webhook'] = device.webhook;
    }
    if (Object.entries(config).length !== 0) {
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  async deviceLogs(device: device & devicesConfig): Promise<void> {
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
  infoLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.info(String(...log));
    }
  }

  warnLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.warn(String(...log));
    }
  }

  debugWarnLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging?.includes('debug')) {
        this.platform.log.warn('[DEBUG]', String(...log));
      }
    }
  }

  errorLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.error(String(...log));
    }
  }

  debugErrorLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging?.includes('debug')) {
        this.platform.log.error('[DEBUG]', String(...log));
      }
    }
  }

  debugLog(...log: any[]): void {
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
