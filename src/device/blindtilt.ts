import { Context } from 'vm';
import { request } from 'undici';
import { sleep } from '../utils';
import { MqttClient } from 'mqtt';
import { interval, Subject } from 'rxjs';
import { connectAsync } from 'async-mqtt';
import { SwitchBotPlatform } from '../platform';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { device, devicesConfig, serviceData, switchbot, deviceStatus, ad, Devices } from '../settings';

enum BlindTiltMappingMode {
  OnlyUp = 'only_up',
  OnlyDown = 'only_down',
  DownAndUp = 'down_and_up',
  UpAndDown = 'up_and_down',
  UseTiltForDirection = 'use_tilt_for_direction',
}

export class BlindTilt {
  // Services
  windowCoveringService: Service;
  lightSensorService?: Service;
  batteryService?: Service;

  // Characteristic Values
  CurrentPosition!: CharacteristicValue;
  PositionState!: CharacteristicValue;
  TargetPosition!: CharacteristicValue;
  CurrentAmbientLightLevel?: CharacteristicValue;
  BatteryLevel?: CharacteristicValue;
  StatusLowBattery?: CharacteristicValue;

  CurrentHorizontalTiltAngle!: CharacteristicValue;
  TargetHorizontalTiltAngle!: CharacteristicValue;

  // OpenAPI Others
  deviceStatus!: any; //deviceStatusResponse;
  slidePosition: deviceStatus['slidePosition'];
  direction: deviceStatus['direction'];
  moving: deviceStatus['moving'];
  brightness: deviceStatus['brightness'];
  setPositionMode?: string | number;
  Mode!: string;

  mappingMode: BlindTiltMappingMode = BlindTiltMappingMode.OnlyUp;

  // BLE Others
  connected?: boolean;
  switchbot!: switchbot;
  serviceData!: serviceData;
  spaceBetweenLevels!: number;
  address!: ad['address'];
  calibration: serviceData['calibration'];
  battery: serviceData['battery'];
  position: serviceData['position'];
  inMotion: serviceData['inMotion'];
  lightLevel: serviceData['lightLevel'];

  // Target
  setNewTarget!: boolean;
  setNewTargetTimer!: NodeJS.Timeout;

  //MQTT stuff
  mqttClient: MqttClient | null = null;

  // Config
  set_minStep!: number;
  updateRate!: number;
  set_minLux!: number;
  set_maxLux!: number;
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;
  setCloseMode!: string;
  setOpenMode!: string;

  // Updates
  blindTiltUpdateInProgress!: boolean;
  doBlindTiltUpdate!: Subject<void>;

  // Connection
  private readonly BLE = (this.device.connectionType === 'BLE' || this.device.connectionType === 'BLE/OpenAPI');
  private readonly OpenAPI = (this.device.connectionType === 'OpenAPI' || this.device.connectionType === 'BLE/OpenAPI');

  constructor(private readonly platform: SwitchBotPlatform, private accessory: PlatformAccessory, public device: device & devicesConfig) {
    // default placeholders
    this.logs(device);
    this.refreshRate(device);
    this.scan(device);
    this.config(device);
    this.setupMqtt(device);
    this.context();

    this.mappingMode = (device.blindTilt?.mode as BlindTiltMappingMode) ?? BlindTiltMappingMode.OnlyUp;
    this.debugLog(`Mapping mode: ${this.mappingMode}`);

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doBlindTiltUpdate = new Subject();
    this.blindTiltUpdateInProgress = false;
    this.setNewTarget = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'W2701600')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision(accessory, device))
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
      .updateValue(this.FirmwareRevision(accessory, device));

    // get the WindowCovering service if it exists, otherwise create a new WindowCovering service
    // you can create multiple services for each accessory
    (this.windowCoveringService =
      accessory.getService(this.platform.Service.WindowCovering) || accessory.addService(this.platform.Service.WindowCovering)),
    `${device.deviceName} ${device.deviceType}`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.WindowCovering, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.windowCoveringService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
    if (!this.windowCoveringService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
      this.windowCoveringService.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
    }

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/WindowCovering

    // create handlers for required characteristics
    this.windowCoveringService.setCharacteristic(this.platform.Characteristic.PositionState, this.PositionState);

    this.windowCoveringService
      .getCharacteristic(this.platform.Characteristic.CurrentPosition)
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
      .getCharacteristic(this.platform.Characteristic.TargetPosition)
      .setProps({
        minStep: this.minStep(device),
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onSet(this.TargetPositionSet.bind(this));

    this.CurrentHorizontalTiltAngle = 90;
    this.windowCoveringService
      .getCharacteristic(this.platform.Characteristic.CurrentHorizontalTiltAngle)
      .setProps({
        minStep: 180,
        minValue: -90,
        maxValue: 90,
        validValues: [-90, 90],
      })
      .onGet(() => {
        // this.debugLog(`requested CurrentHorizontalTiltAngle: ${this.CurrentHorizontalTiltAngle}`);
        return this.CurrentHorizontalTiltAngle;
      });

    this.TargetHorizontalTiltAngle = 90;
    this.windowCoveringService
      .getCharacteristic(this.platform.Characteristic.TargetHorizontalTiltAngle)
      .setProps({
        minStep: 180,
        minValue: -90,
        maxValue: 90,
        validValues: [-90, 90],
      })
      .onSet(this.TargetHorizontalTiltAngleSet.bind(this));

    // Battery Service
    if (!this.BLE) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Battery Service`);
      this.batteryService = this.accessory.getService(this.platform.Service.Battery);
      accessory.removeService(this.batteryService!);
    } else if (this.BLE && !this.batteryService) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Battery Service`);
      (this.batteryService = this.accessory.getService(this.platform.Service.Battery) || this.accessory.addService(this.platform.Service.Battery)),
      `${accessory.displayName} Battery`;

      this.batteryService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Battery`);
      if (!this.batteryService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
        this.batteryService.addCharacteristic(this.platform.Characteristic.ConfiguredName, `${accessory.displayName} Battery`);
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Battery Service Not Added`);
    }

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.blindTiltUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    // update slide progress
    interval(this.updateRate * 1000)
      //.pipe(skipWhile(() => this.blindTiltUpdateInProgress))
      .subscribe(async () => {
        if (this.PositionState === this.platform.Characteristic.PositionState.STOPPED) {
          return;
        }
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Refresh Status When Moving, PositionState: ${this.PositionState}`);
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
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType} Connection,`
            + ` Error Message: ${JSON.stringify(e.message)}`);
        }
        this.blindTiltUpdateInProgress = false;
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
    // CurrentPosition
    this.CurrentPosition = 100 - Number(this.position);
    await this.setMinMax();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition ${this.CurrentPosition}`);
    if (this.setNewTarget) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Checking Status ...`);
    }

    if (this.setNewTarget && this.inMotion) {
      await this.setMinMax();
      if (Number(this.TargetPosition) > this.CurrentPosition) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Closing, CurrentPosition: ${this.CurrentPosition}`);
        this.PositionState = this.platform.Characteristic.PositionState.INCREASING;
        this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} INCREASING PositionState: ${this.PositionState}`);
      } else if (Number(this.TargetPosition) < this.CurrentPosition) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Opening, CurrentPosition: ${this.CurrentPosition}`);
        this.PositionState = this.platform.Characteristic.PositionState.DECREASING;
        this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} DECREASING PositionState: ${this.PositionState}`);
      } else {
        this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} Standby2, CurrentPosition: ${this.CurrentPosition}`);
        this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
        this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} STOPPED PositionState: ${this.PositionState}`);
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Standby, CurrentPosition: ${this.CurrentPosition}`);
      this.TargetPosition = this.CurrentPosition;
      this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Stopped`);
    }
    this.debugLog(
      `${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition},` +
      ` TargetPosition: ${this.TargetPosition}, PositionState: ${this.PositionState},`,
    );

    if (!this.device.blindTilt?.hide_lightsensor) {
      this.set_minLux = this.minLux();
      this.set_maxLux = this.maxLux();
      this.spaceBetweenLevels = 9;

      // Brightness
      switch (this.lightLevel) {
        case 1:
          this.CurrentAmbientLightLevel = this.set_minLux;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 2:
          this.CurrentAmbientLightLevel = (this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels;
          this.debugLog(
            `${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel},` +
            ` Calculation: ${(this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels}`,
          );
          break;
        case 3:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 2;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 4:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 3;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 5:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 4;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 6:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 5;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 7:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 6;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 8:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 7;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 9:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 8;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 10:
        default:
          this.CurrentAmbientLightLevel = this.set_maxLux;
          this.debugLog();
      }
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel},`
        + ` CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`,
      );
    }
    // Battery
    this.BatteryLevel = Number(this.battery);
    if (this.BatteryLevel < 10) {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel},`
      + ` StatusLowBattery: ${this.StatusLowBattery}`);
  }

  async openAPIparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);

    const [homekitPosition, homekitTiltAngle] = this.mapDeviceValuesToHomekitValues(Number(this.slidePosition), String(this.direction));
    this.debugLog(` device: ${this.slidePosition} => HK: ${homekitPosition}`);

    this.CurrentPosition = homekitPosition;
    // CurrentPosition
    await this.setMinMax();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition}`);

    if (homekitTiltAngle) {
      this.CurrentHorizontalTiltAngle = homekitTiltAngle!;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentHorizontalTiltAngle: ${this.CurrentHorizontalTiltAngle}`);
    }

    if (this.setNewTarget) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Checking Status ...`);
    }

    if (this.setNewTarget && this.moving) {
      await this.setMinMax();
      if (this.TargetPosition > this.CurrentPosition || (homekitTiltAngle && (this.TargetHorizontalTiltAngle !== this.CurrentHorizontalTiltAngle))) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Closing, CurrentPosition: ${this.CurrentPosition} `);
        this.PositionState = this.platform.Characteristic.PositionState.INCREASING;
        this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} INCREASING PositionState: ${this.PositionState}`);
      } else if (this.TargetPosition < this.CurrentPosition) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Opening, CurrentPosition: ${this.CurrentPosition} `);
        this.PositionState = this.platform.Characteristic.PositionState.DECREASING;
        this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} DECREASING PositionState: ${this.PositionState}`);
      } else {
        this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} Standby because reached position,` +
          ` CurrentPosition: ${this.CurrentPosition}`);
        this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
        this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
        this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} STOPPED PositionState: ${this.PositionState}`);
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Standby because device not moving,` +
        ` CurrentPosition: ${this.CurrentPosition}`);
      this.TargetPosition = this.CurrentPosition;
      if (homekitTiltAngle) {
        this.TargetHorizontalTiltAngle = this.CurrentHorizontalTiltAngle;
      }
      this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Stopped`);
    }
    this.debugLog(
      `${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition},` +
      ` TargetPosition: ${this.TargetPosition}, PositionState: ${this.PositionState},`,
    );

    if (!this.device.blindTilt?.hide_lightsensor) {
      this.set_minLux = this.minLux();
      this.set_maxLux = this.maxLux();
      // Brightness
      switch (this.brightness) {
        case 'dim':
          this.CurrentAmbientLightLevel = this.set_minLux;
          break;
        case 'bright':
        default:
          this.CurrentAmbientLightLevel = this.set_maxLux;
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
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
          model: 'c',
          id: this.device.bleMac,
        })
        .then(async () => {
          // Set an event hander
          switchbot.onadvertisement = async (ad: any) => {
            this.address = ad.address;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac},`
              + ` BLE Address Found: ${this.address}`);
            this.serviceData = ad.serviceData;
            this.calibration = ad.serviceData.calibration;
            this.battery = ad.serviceData.battery;
            this.inMotion = ad.serviceData.inMotion;
            this.position = ad.serviceData.position;
            this.lightLevel = ad.serviceData.lightLevel;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
            this.debugLog(
              `${this.device.deviceType}: ${this.accessory.displayName} calibration: ${ad.serviceData.calibration}, ` +
              `position: ${ad.serviceData.position}, lightLevel: ${ad.serviceData.lightLevel}, battery: ${ad.serviceData.battery}, ` +
              `inMotion: ${ad.serviceData.inMotion}`);

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
          return await sleep(this.scanDuration * 1000);
        })
        .then(async () => {
          // Stop to monitor
          await this.stopScanning(switchbot);
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLERefreshStatus with ${this.device.connectionType}`
            + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
          await this.BLERefreshConnection(switchbot);
        });
    } else {
      await this.BLERefreshConnection(switchbot);
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode, headers } = await request(`${Devices}/${this.device.deviceId}/status`, {
        headers: this.platform.generateHeaders(),
      });
      const deviceStatus = await body.json();
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Devices: ${JSON.stringify(deviceStatus.body)}`);
      this.statusCode(statusCode);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Headers: ${JSON.stringify(headers)}`);
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName
        } refreshStatus: ${JSON.stringify(deviceStatus)}`,
      );
      this.slidePosition = deviceStatus.body.slidePosition;
      this.direction = deviceStatus.body.direction;
      this.moving = deviceStatus.body.moving;
      this.brightness = deviceStatus.body.brightness;
      this.openAPIparseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.apiError(e);
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIRefreshStatus with ${this.device.connectionType}`
        + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
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
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:`
        + ` ${this.device.connectionType}, pushChanges will not happen.`);
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
    if (this.TargetPosition !== this.CurrentPosition) {
      const switchbot = await this.platform.connectBLE();
      // Convert to BLE Address
      this.device.bleMac = this.device
        .deviceId!.match(/.{1,2}/g)!
        .join(':')
        .toLowerCase();
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
      this.SilentPerformance();
      const adjustedMode = this.setPositionMode || null;
      if (adjustedMode === null) {
        this.Mode = 'Default Mode';
      }
      this.debugLog(`${this.accessory.displayName} Mode: ${this.Mode}`);
      if (switchbot !== false) {
        switchbot
          .discover({ model: 'c', quick: true, id: this.device.bleMac })
          .then(async (device_list: any) => {
            this.infoLog(`${this.accessory.displayName} Target Position: ${this.TargetPosition}`);
            return await this.retry({
              max: this.maxRetry(),
              fn: async () => {
                return await device_list[0].runToPos(100 - Number(this.TargetPosition), adjustedMode);
              },
            });
          })
          .then(() => {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
          })
          .catch(async (e: any) => {
            this.apiError(e);
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}`
              + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
            await this.BLEPushConnection();
          });
      } else {
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection`);
        await this.BLEPushConnection();
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No BLEpushChanges, CurrentPosition & TargetPosition Are the Same.` +
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
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);
    const hasDifferentAndRelevantHorizontalTiltAngle = (
      this.mappingMode === BlindTiltMappingMode.UseTiltForDirection
      && this.TargetHorizontalTiltAngle !== this.CurrentHorizontalTiltAngle);
    if ((this.TargetPosition !== this.CurrentPosition) || hasDifferentAndRelevantHorizontalTiltAngle || this.device.disableCaching) {
      const [direction, position] = this.mapHomekitValuesToDeviceValues(Number(this.TargetPosition), Number(this.TargetHorizontalTiltAngle));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Pushing ${this.TargetPosition} (device = ${direction};${position})`);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Mode: ${this.Mode}`);
      let bodyChange = '';
      if (position === 100) {
        bodyChange = JSON.stringify({
          'command': 'fullyOpen',
          'commandType': 'command',
        });
      } else if (position === 0) {
        bodyChange = JSON.stringify({
          'command': direction === 'up' ? 'closeUp' : 'closeDown',
          'commandType': 'command',
        });
      } else {
        bodyChange = JSON.stringify({
          'command': 'setPosition',
          'parameter': `${direction};${position}`,
          'commandType': 'command',
        });
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode, headers } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        const deviceStatus = await body.json();
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Devices: ${JSON.stringify(deviceStatus.body)}`);
        this.statusCode(statusCode);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Headers: ${JSON.stringify(headers)}`);
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIpushChanges with ${this.device.connectionType}`
          + ` Connection, Error Message: ${JSON.stringify(e.message)}`,
        );
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No OpenAPI Changes, CurrentPosition & TargetPosition Are the Same.`
        + ` CurrentPosition: ${this.CurrentPosition}, TargetPosition  ${this.TargetPosition}`
        + ` CurrentHorizontalTiltAngle: ${this.CurrentHorizontalTiltAngle}, TargetPosition  ${this.TargetHorizontalTiltAngle}`,
      );
    }
  }

  /**
   * Handle requests to set the value of the "Target Horizontal Tilt" characteristic
   */
  async TargetHorizontalTiltAngleSet(value: CharacteristicValue): Promise<void> {
    if (this.TargetHorizontalTiltAngle === this.accessory.context.TargetHorizontalTiltAngle) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set TargetHorizontalTiltAngle: ${value}`);
    } else {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set TargetHorizontalTiltAngle: ${value}`);
    }

    //value = value < 0 ? -90 : 90;
    this.TargetHorizontalTiltAngle = value;
    if (this.device.mqttURL) {
      this.mqttPublish('TargetHorizontalTiltAngle', this.TargetHorizontalTiltAngle);
    }

    this.startUpdatingBlindTiltIfNeeded();
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

    this.TargetPosition = value;
    if (this.device.mqttURL) {
      this.mqttPublish('TargetPosition', this.TargetPosition);
    }
    this.startUpdatingBlindTiltIfNeeded();
  }

  async startUpdatingBlindTiltIfNeeded(): Promise<void> {
    await this.setMinMax();
    this.debugLog('setMinMax');
    if (this.TargetPosition > this.CurrentPosition || (this.TargetHorizontalTiltAngle !== this.CurrentHorizontalTiltAngle)) {
      this.PositionState = this.platform.Characteristic.PositionState.INCREASING;
      this.setNewTarget = true;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} value: ${this.CurrentPosition},` +
        ` CurrentPosition: ${this.CurrentPosition}`);
    } else if (this.TargetPosition < this.CurrentPosition) {
      this.PositionState = this.platform.Characteristic.PositionState.DECREASING;
      this.setNewTarget = true;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} value: ${this.CurrentPosition},` +
        ` CurrentPosition: ${this.CurrentPosition}`);
    } else {
      this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
      this.setNewTarget = false;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} value: ${this.CurrentPosition},` +
        ` CurrentPosition: ${this.CurrentPosition}`);
    }
    this.windowCoveringService.setCharacteristic(this.platform.Characteristic.PositionState, this.PositionState);
    this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);

    /**
     * If Blind Tilt movement time is short, the moving flag from backend is always false.
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
    this.doBlindTiltUpdate.next();
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    await this.setMinMax();

    if (this.mappingMode === BlindTiltMappingMode.UseTiltForDirection) {
      if (this.CurrentHorizontalTiltAngle === undefined || Number.isNaN(this.CurrentHorizontalTiltAngle)) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentHorizontalTiltAngle: ${this.CurrentHorizontalTiltAngle}`);
      } else {
        if (this.device.mqttURL) {
          this.mqttPublish('CurrentHorizontalTiltAngle', this.CurrentHorizontalTiltAngle);
        }
        this.accessory.context.CurrentHorizontalTiltAngle = this.CurrentHorizontalTiltAngle;
        this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.CurrentHorizontalTiltAngle,
          Number(this.CurrentHorizontalTiltAngle));
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} 
        updateCharacteristic CurrentHorizontalTiltAngle: ${this.CurrentHorizontalTiltAngle}`);
      }
    }

    if (this.CurrentPosition === undefined || Number.isNaN(this.CurrentPosition)) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition}`);
    } else {
      if (this.device.mqttURL) {
        this.mqttPublish('CurrentPosition', this.CurrentPosition);
      }
      this.accessory.context.CurrentPosition = this.CurrentPosition;
      this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.CurrentPosition, Number(this.CurrentPosition));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic CurrentPosition: ${this.CurrentPosition}`);
    }
    if (this.PositionState === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} PositionState: ${this.PositionState}`);
    } else {
      if (this.device.mqttURL) {
        this.mqttPublish('PositionState', this.PositionState);
      }
      this.accessory.context.PositionState = this.PositionState;
      this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.PositionState, Number(this.PositionState));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic PositionState: ${this.PositionState}`);
    }
    if (this.TargetPosition === undefined || Number.isNaN(this.TargetPosition)) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} TargetPosition: ${this.TargetPosition}`);
    } else {
      if (this.device.mqttURL) {
        this.mqttPublish('TargetPosition', this.TargetPosition);
      }
      this.accessory.context.TargetPosition = this.TargetPosition;
      this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.TargetPosition, Number(this.TargetPosition));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: ${this.TargetPosition}`);
    }
    if (!this.device.blindTilt?.hide_lightsensor) {
      if (this.CurrentAmbientLightLevel === undefined || Number.isNaN(this.CurrentAmbientLightLevel)) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
      } else {
        if (this.device.mqttURL) {
          this.mqttPublish('CurrentAmbientLightLevel', this.CurrentAmbientLightLevel);
        }
        this.accessory.context.CurrentAmbientLightLevel = this.CurrentAmbientLightLevel;
        this.lightSensorService?.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, this.CurrentAmbientLightLevel);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
          + ` updateCharacteristic CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
      }
    }
    if (this.BLE) {
      if (this.BatteryLevel === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
      } else {
        if (this.device.mqttURL) {
          this.mqttPublish('BatteryLevel', this.BatteryLevel);
        }
        this.accessory.context.BatteryLevel = this.BatteryLevel;
        this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
      }
      if (this.StatusLowBattery === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
      } else {
        if (this.device.mqttURL) {
          this.mqttPublish('StatusLowBattery', this.StatusLowBattery);
        }
        this.accessory.context.StatusLowBattery = this.StatusLowBattery;
        this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
      }
    }
  }

  /*
   * Publish MQTT message for topics of
   * 'homebridge-switchbot/blindtilt/xx:xx:xx:xx:xx:xx'
   */
  mqttPublish(topic: string, message: any) {
    const mac = this.device.deviceId
      ?.toLowerCase()
      .match(/[\s\S]{1,2}/g)
      ?.join(':');
    const options = this.device.mqttPubOptions || {};
    this.mqttClient?.publish(`homebridge-switchbot/blindtilt/${mac}/${topic}`, `${message}`, options);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} MQTT message: ${topic}/${message} options:${JSON.stringify(options)}`);
  }

  /*
   * Setup MQTT hadler if URL is specifed.
   */
  async setupMqtt(device: device & devicesConfig): Promise<void> {
    if (device.mqttURL) {
      try {
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
    this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`);
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Refresh Status`);
      await this.openAPIRefreshStatus();
    }
  }

  async SilentPerformance() {
    if (Number(this.TargetPosition) > 50) {
      if (this.device.blindTilt?.setOpenMode === '1') {
        this.setPositionMode = 1;
        this.Mode = 'Silent Mode';
      } else {
        this.setPositionMode = 0;
        this.Mode = 'Performance Mode';
      }
    } else {
      if (this.device.blindTilt?.setCloseMode === '1') {
        this.setPositionMode = 1;
        this.Mode = 'Silent Mode';
      } else {
        this.setPositionMode = 0;
        this.Mode = 'Performance Mode';
      }
    }
  }

  async setMinMax(): Promise<void> {
    if (this.device.blindTilt?.set_min) {
      if (Number(this.CurrentPosition) <= this.device.blindTilt?.set_min) {
        this.CurrentPosition = 0;
      }
    }
    if (this.device.blindTilt?.set_max) {
      if (Number(this.CurrentPosition) >= this.device.blindTilt?.set_max) {
        this.CurrentPosition = 100;
      }
    }

    if (this.mappingMode === BlindTiltMappingMode.UseTiltForDirection) {
      this.CurrentHorizontalTiltAngle = Number(this.CurrentHorizontalTiltAngle) < 0 ? -90 : 90;
    }
  }

  minStep(device: device & devicesConfig): number {
    if (device.blindTilt?.set_minStep) {
      this.set_minStep = device.blindTilt?.set_minStep;
    } else {
      this.set_minStep = 1;
    }
    return this.set_minStep;
  }

  minLux(): number {
    if (this.device.blindTilt?.set_minLux) {
      this.set_minLux = this.device.blindTilt?.set_minLux;
    } else {
      this.set_minLux = 1;
    }
    return this.set_minLux;
  }

  maxLux(): number {
    if (this.device.blindTilt?.set_maxLux) {
      this.set_maxLux = this.device.blindTilt?.set_maxLux;
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
          this.warnLog(`${this.device.deviceType}: `
            + `${this.accessory.displayName} scanDuration is less than updateRate, overriding scanDuration with updateRate`);
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
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Hub Device is offline, statusCode: ${statusCode}. `
          + `Hub: ${this.device.hubDeviceId}`);
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
      default:
        this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Unknown statusCode: `
          + `${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`);
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      await this.context();
      await this.updateHomeKitCharacteristics();
    }
  }

  async apiError(e: any): Promise<void> {
    this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.CurrentPosition, e);
    this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.PositionState, e);
    this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.TargetPosition, e);
    if (!this.device.curtain?.hide_lightsensor) {
      this.lightSensorService?.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, e);
    }
    if (this.BLE) {
      this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, e);
      this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, e);
    }
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
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
    if (this.CurrentPosition === undefined) {
      this.CurrentPosition = 0;
    } else {
      this.CurrentPosition = this.accessory.context.CurrentPosition;
    }

    if (this.TargetPosition === undefined) {
      this.TargetPosition = 0;
    } else {
      this.TargetPosition = this.accessory.context.TargetPosition;
    }

    if (this.PositionState === undefined) {
      this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
    } else {
      this.PositionState = this.accessory.context.PositionState;
    }
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
    if (device?.blindTilt?.updateRate) {
      this.updateRate = device?.blindTilt?.updateRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config Blind Tilt updateRate: ${this.updateRate}`);
    } else {
      this.updateRate = 2;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Default Blind Tilt updateRate: ${this.updateRate}`);
    }
  }

  async config(device: device & devicesConfig): Promise<void> {
    let config = {};
    if (device.blindTilt) {
      config = device.blindTilt;
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

    if (device.blindTilt?.mode === undefined) {
      config['mode'] = BlindTiltMappingMode.OnlyUp;
    } else {
      config['mode'] = device.blindTilt?.mode;
    }

    if (Object.entries(config).length !== 0) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
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