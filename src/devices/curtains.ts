import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { DeviceURL, device, devicesConfig, serviceData, switchbot, deviceStatusResponse, payload } from '../settings';
import { AxiosResponse } from 'axios';

export class Curtain {
  // Services
  private service: Service;
  private lightSensorService?: Service;
  private batteryService?: Service;

  // Characteristic Values
  CurrentPosition!: CharacteristicValue;
  PositionState!: CharacteristicValue;
  TargetPosition!: CharacteristicValue;
  CurrentAmbientLightLevel?: CharacteristicValue;
  BatteryLevel?: CharacteristicValue;
  StatusLowBattery?: CharacteristicValue;

  // OpenAPI Others
  deviceStatus!: deviceStatusResponse;
  setNewTarget!: boolean;
  setNewTargetTimer!: NodeJS.Timeout;

  // BLE Others
  set_minLux!: number;
  set_maxLux!: number;
  spaceBetweenLevels!: number;
  switchbot!: switchbot;
  serviceData!: serviceData;
  calibration: serviceData['calibration'];
  battery: serviceData['battery'];
  position: serviceData['position'];
  lightLevel: serviceData['lightLevel'];

  // Config
  set_minStep!: number;
  refreshRate!: number;

  // Updates
  curtainUpdateInProgress!: boolean;
  doCurtainUpdate!: Subject<void>;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device & devicesConfig,
  ) {
    // Curtain Config
    this.platform.device(`Curtain: ${this.accessory.displayName} Config: (ble: ${device.ble}, disable_group: ${device.curtain?.disable_group},`
      + ` hide_lightsensor: ${device.curtain?.hide_lightsensor}, set_minLux: ${device.curtain?.set_minLux}, set_maxLux: `
      + `${device.curtain?.set_maxLux}, refreshRate: ${device.curtain?.refreshRate}, set_max: ${device.curtain?.set_max}, set_min: `
      + `${device.curtain?.set_min}, set_minStep: ${device.curtain?.set_minStep})`);

    // default placeholders
    this.setMinMax();
    this.CurrentPosition = 0;
    this.TargetPosition = 0;
    this.PositionState = this.platform.Characteristic.PositionState.STOPPED;

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doCurtainUpdate = new Subject();
    this.curtainUpdateInProgress = false;
    this.setNewTarget = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'SWITCHBOT-CURTAIN-W0701600')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId);

    // get the WindowCovering service if it exists, otherwise create a new WindowCovering service
    // you can create multiple services for each accessory
    (this.service =
      accessory.getService(this.platform.Service.WindowCovering) ||
      accessory.addService(this.platform.Service.WindowCovering)), `${device.deviceName} ${device.deviceType}`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/WindowCovering

    // create handlers for required characteristics
    this.service.setCharacteristic(this.platform.Characteristic.PositionState, this.PositionState);

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentPosition)
      .setProps({
        minStep: this.minStep(),
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onGet(() => {
        return this.CurrentPosition;
      });

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetPosition)
      .setProps({
        minStep: this.minStep(),
        validValueRanges: [0, 100],
      })
      .onSet(this.TargetPositionSet.bind(this));

    // Light Sensor Service
    if (this.device.curtain?.hide_lightsensor) {
      this.platform.device(`Curtain: ${accessory.displayName} Removing Light Sensor Service`);
      this.lightSensorService = this.accessory.getService(this.platform.Service.LightSensor);
      accessory.removeService(this.lightSensorService!);
    } else if (!this.lightSensorService) {
      this.platform.device(`Curtain: ${accessory.displayName} Add Light Sensor Service`);
      (this.lightSensorService =
        this.accessory.getService(this.platform.Service.LightSensor) ||
        this.accessory.addService(this.platform.Service.LightSensor)), `${accessory.displayName} Light Sensor`;

      this.lightSensorService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Light Sensor`);

    } else {
      this.platform.device(`Curtain: ${accessory.displayName} Light Sensor Service Not Added`);
    }


    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.platform.config.options!.refreshRate! * 1000)
      .pipe(skipWhile(() => this.curtainUpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });

    // update slide progress
    interval(this.curtainRefreshRate() * 1000)
      .pipe(skipWhile(() => this.curtainUpdateInProgress))
      .subscribe(() => {
        if (this.PositionState === this.platform.Characteristic.PositionState.STOPPED) {
          return;
        }
        this.platform.debug(`Curtain: ${accessory.displayName} Refresh Status When Moving, PositionState: ${this.PositionState}`);
        this.refreshStatus();
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
          this.platform.log.error(`Curtain: ${this.accessory.displayName} failed to pushChanges,`
            + ` Error Message: ${JSON.stringify(e.message)}`);
          this.platform.debug(`Curtain: ${this.accessory.displayName} Error: ${JSON.stringify(e)}`);
          this.apiError(e);
        }
        this.curtainUpdateInProgress = false;
      });
  }

  private connectBLE() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Switchbot = require('node-switchbot');
    const switchbot = new Switchbot();
    const colon = this.device.deviceId!.match(/.{1,2}/g);
    const bleMac = colon!.join(':'); //returns 1A:23:B4:56:78:9A;
    this.device.bleMac = bleMac.toLowerCase();
    this.platform.device(this.device.bleMac.toLowerCase());
    return switchbot;
  }

  private curtainRefreshRate() {
    if (this.device?.curtain?.refreshRate) {
      this.refreshRate = this.device?.curtain?.refreshRate;
    } else {
      this.refreshRate = 5;
      if (this.platform.config.options?.debug === 'device') {
        this.platform.log.warn(`Curtain: ${this.accessory.displayName} Using Default Curtain Refresh Rate.`);
      }
    }
    return this.refreshRate;
  }

  private minStep(): number {
    if (this.device.curtain?.set_minStep) {
      this.set_minStep = this.device.curtain?.set_minStep;
    } else {
      this.set_minStep = 1;
    }
    return this.set_minStep;
  }

  private minLux(): number {
    if (this.device.curtain?.set_minLux) {
      this.set_minLux = this.device.curtain?.set_minLux;
    } else {
      this.set_minLux = 1;
    }
    return this.set_minLux;
  }

  private maxLux(): number {
    if (this.device.curtain?.set_maxLux) {
      this.set_maxLux = this.device.curtain?.set_maxLux;
    } else {
      this.set_maxLux = 6001;
    }
    return this.set_maxLux;
  }

  async parseStatus() {
    if (this.device.ble) {
      await this.BLEparseStatus();
    } else {
      await this.openAPIparseStatus();
    }
  }

  private async BLEparseStatus() {
    this.platform.debug(`Curtain: ${this.accessory.displayName} BLE parseStatus`);
    this.CurrentPosition = 100 - Number(this.position);
    this.platform.debug(`Curtain: ${this.accessory.displayName} CurrentPosition ${this.CurrentPosition}`);
    if (this.setNewTarget) {
      this.platform.log.info(`Curtain: ${this.accessory.displayName} Checking Status ...`);
    }

    if (this.setNewTarget) {
      this.setMinMax();
      if (this.TargetPosition > this.CurrentPosition) {
        this.platform.debug(`Curtain: ${this.accessory.displayName} Closing, CurrentPosition: ${this.CurrentPosition}`);
        this.PositionState = this.platform.Characteristic.PositionState.INCREASING;
      } else if (this.TargetPosition < this.CurrentPosition) {
        this.platform.debug(`Curtain: ${this.accessory.displayName} Opening, CurrentPosition: ${this.CurrentPosition}`);
        this.PositionState = this.platform.Characteristic.PositionState.DECREASING;
      } else {
        this.platform.debug(`Curtain: ${this.CurrentPosition} Standby, CurrentPosition: ${this.CurrentPosition}`);
        this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
      }
    } else {
      this.platform.debug(`Curtain: ${this.accessory.displayName} Standby, CurrentPosition: ${this.CurrentPosition}`);
      if (!this.setNewTarget) {
        // If Curtain calibration distance is short, there will be an error between the current percentage and the target percentage.
        this.TargetPosition = this.CurrentPosition;
        this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
      }
    }
    this.platform.debug(`Curtain: ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition},`
      + ` TargetPosition: ${this.TargetPosition}, PositionState: ${this.PositionState},`);

    if (!this.device.curtain?.hide_lightsensor) {
      this.set_minLux = this.minLux();
      this.set_maxLux = this.maxLux();
      this.spaceBetweenLevels = 9;

      // Brightness
      switch (this.lightLevel) {
        case 1:
          this.CurrentAmbientLightLevel = this.set_minLux;
          this.platform.device(`Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 2:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels);
          this.platform.device(`Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel},`
            + ` Calculation: ${((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels)}`);
          break;
        case 3:
          this.CurrentAmbientLightLevel = (((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 2);
          this.platform.device(`Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 4:
          this.CurrentAmbientLightLevel = (((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 3);
          this.platform.device(`Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 5:
          this.CurrentAmbientLightLevel = (((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 4);
          this.platform.device(`Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 6:
          this.CurrentAmbientLightLevel = (((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 5);
          this.platform.device(`Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 7:
          this.CurrentAmbientLightLevel = (((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 6);
          this.platform.device(`Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 8:
          this.CurrentAmbientLightLevel = (((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 7);
          this.platform.device(`Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 9:
          this.CurrentAmbientLightLevel = (((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 8);
          this.platform.device(`Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 10:
        default:
          this.CurrentAmbientLightLevel = this.set_maxLux;
          this.platform.device();
      }
      this.platform.debug(`Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel},`
        + ` CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
    }
    // Battery
    this.BatteryLevel = Number(this.battery);
    if (this.BatteryLevel < 10) {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.platform.debug(`Curtain: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}, StatusLowBattery: ${this.StatusLowBattery}`);
  }

  private async openAPIparseStatus() {
    this.platform.debug(`Curtain: ${this.accessory.displayName} OpenAPI parseStatus`);
    // CurrentPosition
    this.CurrentPosition = 100 - this.deviceStatus.body.slidePosition!;
    this.platform.debug(`Curtain ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition}`);
    if (this.setNewTarget) {
      this.platform.log.info(`Checking ${this.accessory.displayName} Status ...`);
    }

    if (this.deviceStatus.body.moving) {
      this.setMinMax();
      if (this.TargetPosition > this.CurrentPosition) {
        this.platform.debug(`Curtain: ${this.accessory.displayName} Closing, CurrentPosition: ${this.CurrentPosition} `);
        this.PositionState = this.platform.Characteristic.PositionState.INCREASING;
      } else if (this.TargetPosition < this.CurrentPosition) {
        this.platform.debug(`Curtain: ${this.accessory.displayName} Opening, CurrentPosition: ${this.CurrentPosition} `);
        this.PositionState = this.platform.Characteristic.PositionState.DECREASING;
      } else {
        this.platform.debug(`Curtain: ${this.CurrentPosition} Standby, CurrentPosition: ${this.CurrentPosition}`);
        this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
      }
    } else {
      this.platform.debug(`Curtain: ${this.accessory.displayName} Standby, CurrentPosition: ${this.CurrentPosition}`);
      if (!this.setNewTarget) {
        /*If Curtain calibration distance is short, there will be an error between the current percentage and the target percentage.*/
        this.TargetPosition = this.CurrentPosition;
        this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
      }
    }
    this.platform.debug(`Curtain: ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition},`
      + ` TargetPosition: ${this.TargetPosition}, PositionState: ${this.PositionState},`);

    if (!this.device.curtain?.hide_lightsensor) {
      // Brightness
      switch (this.deviceStatus.body.brightness) {
        case 'dim':
          this.CurrentAmbientLightLevel = 0.0001;
          break;
        case 'bright':
        default:
          this.CurrentAmbientLightLevel = 100000;
      }
      this.platform.debug(`Curtain: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
    }
  }

  async refreshStatus() {
    if (this.device.ble) {
      await this.BLERefreshStatus();
    } else {
      await this.openAPIRefreshStatus();
    }
  }

  private async BLERefreshStatus() {
    this.platform.debug(`Curtain: ${this.accessory.displayName} BLE refreshStatus`);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const switchbot = this.connectBLE();
    // Start to monitor advertisement packets
    switchbot.startScan({
      model: 'c',
      id: this.device.bleMac,
    }).then(() => {
      // Set an event hander
      switchbot.onadvertisement = (ad: any) => {
        this.serviceData = ad.serviceData;
        this.platform.device(`${this.device.bleMac}: ${JSON.stringify(ad.serviceData)}`);
        this.calibration = ad.serviceData.calibration;
        this.battery = ad.serviceData.battery;
        this.position = ad.serviceData.position;
        this.lightLevel = ad.serviceData.lightLevel;
        this.platform.device(`Curtain: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        this.platform.device(`Curtain: ${this.accessory.displayName} calibration: ${ad.serviceData.calibration}, `
          + `position: ${ad.serviceData.position}, lightLevel: ${ad.serviceData.lightLevel}, battery: ${ad.serviceData.battery}`);
      };
      // Wait 10 seconds
      return switchbot.wait(10000);
    }).then(() => {
      // Stop to monitor
      switchbot.stopScan();
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    }).catch(async (e: any) => {
      this.platform.log.error(`Curtain: ${this.accessory.displayName} BLE Connection failed, Error Message: ${JSON.stringify(e.message)}`);
      this.platform.log.warn(`Curtain: ${this.accessory.displayName} Using OpenAPI Connection`);
      await this.openAPIRefreshStatus();
    });
  }

  private async openAPIRefreshStatus() {
    this.platform.debug(`Curtain: ${this.accessory.displayName} OpenAPI refreshStatus`);
    try {
      this.deviceStatus = (await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)).data;
      this.platform.debug(`Curtain: ${this.accessory.displayName} refreshStatus: ${JSON.stringify(this.deviceStatus)}`);
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.platform.log.error(`Curtain: ${this.accessory.displayName} failed to refresh status, Error Message ${JSON.stringify(e.message)}`);
      this.platform.debug(`Curtain: ${this.accessory.displayName} Error: ${JSON.stringify(e)}`);
      this.apiError(e);
    }
  }

  async pushChanges() {
    if (this.device.ble) {
      await this.BLEpushChanges();
    } else {
      await this.OpenAPIpushChanges();
    }
    this.refreshStatus();
  }

  private async BLEpushChanges() {
    this.platform.debug(`Curtain: ${this.accessory.displayName} BLE pushChanges`);
    const switchbot = this.connectBLE();
    switchbot.discover({ model: 'c', quick: true, id: this.device.bleMac }).then((device_list) => {
      this.platform.log.info(`${this.accessory.displayName} Target Position: ${this.TargetPosition}`);
      return device_list[0].runToPos(100 - Number(this.TargetPosition));
    }).then(() => {
      this.platform.device('Done.');
    }).catch(async (e: any) => {
      this.platform.log.error(`Curtain: ${this.accessory.displayName} BLE Connection failed, Error Message: ${JSON.stringify(e.message)}`);
      this.platform.log.warn(`Curtain: ${this.accessory.displayName} Using OpenAPI Connection`);
      await this.OpenAPIpushChanges();
    });
  }

  private async OpenAPIpushChanges() {
    this.platform.debug(`Curtain: ${this.accessory.displayName} OpenAPI pushChanges`);
    if (this.TargetPosition !== this.CurrentPosition) {
      this.platform.debug(`Pushing ${this.TargetPosition}`);
      const adjustedTargetPosition = 100 - Number(this.TargetPosition);
      const payload = {
        commandType: 'command',
        command: 'setPosition',
        parameter: `0,ff,${adjustedTargetPosition}`,
      } as payload;

      this.platform.log.info(`Curtain: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},`
        + ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`);

      // Make the API request
      const push: any = (await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId!}/commands`, payload));
      this.platform.debug(`Curtain: ${this.accessory.displayName} pushchanges: ${JSON.stringify(push.data)}`);
      this.statusCode(push);
    }
  }

  updateHomeKitCharacteristics() {
    this.setMinMax();
    if (this.CurrentPosition === undefined || Number.isNaN(this.CurrentPosition)) {
      this.platform.debug(`Curtain: ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, Number(this.CurrentPosition));
      this.platform.device(`Curtain: ${this.accessory.displayName} updateCharacteristic CurrentPosition: ${this.CurrentPosition}`);
    }
    if (this.PositionState === undefined) {
      this.platform.debug(`Curtain: ${this.accessory.displayName} PositionState: ${this.PositionState}`);
    } else {
      this.platform.device(`Curtain: ${this.accessory.displayName} updateCharacteristic PositionState: ${this.PositionState}`);
    }
    if (this.TargetPosition === undefined || Number.isNaN(this.TargetPosition)) {
      this.platform.debug(`Curtain: ${this.accessory.displayName} TargetPosition: ${this.TargetPosition}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, Number(this.TargetPosition));
      this.platform.device(`Curtain: ${this.accessory.displayName} updateCharacteristic TargetPosition: ${this.TargetPosition}`);
    }
    if (!this.device.curtain?.hide_lightsensor) {
      if (this.CurrentAmbientLightLevel === undefined || Number.isNaN(this.CurrentAmbientLightLevel)) {
        this.platform.debug(`Curtain: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
      } else {
        this.lightSensorService!.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, this.CurrentAmbientLightLevel);
        this.platform.device(`Curtain: ${this.accessory.displayName}`
          + ` updateCharacteristic CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
      }
    }
    if (this.device.ble) {
      if (this.BatteryLevel === undefined) {
        this.platform.debug(`Curtain: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
      } else {
        this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
        this.platform.device(`Curtain: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
      }
      if (this.StatusLowBattery === undefined) {
        this.platform.debug(`Curtain: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
      } else {
        this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
        this.platform.device(`Curtain: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
      }
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, e);
    this.service.updateCharacteristic(this.platform.Characteristic.PositionState, e);
    this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, e);
    if (!this.device.curtain?.hide_lightsensor) {
      this.lightSensorService!.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, e);
    }
    if (this.device.ble) {
      this.batteryService!.updateCharacteristic(this.platform.Characteristic.BatteryLevel, e);
      this.batteryService!.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, e);
    }
  }

  private statusCode(push: AxiosResponse<{ statusCode: number; }>) {
    switch (push.data.statusCode) {
      case 151:
        this.platform.log.error(`Curtain: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.platform.log.error(`Curtain: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.platform.log.error(`Curtain: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.platform.log.error(`Curtain: ${this.accessory.displayName} Device is offline.`);
        break;
      case 171:
        this.platform.log.error(`Curtain: ${this.accessory.displayName} Hub Device is offline.`);
        break;
      case 190:
        // eslint-disable-next-line max-len
        this.platform.log.error(`Curtain: ${this.accessory.displayName} Device internal error due to device states not synchronized with server. Or command fomrat is invalid.`);
        break;
      case 100:
        this.platform.debug(`Curtain: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.platform.debug(`Curtain: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  /**
   * Handle requests to set the value of the "Target Position" characteristic
   */
  TargetPositionSet(value: CharacteristicValue) {
    this.platform.debug(`Curtain: ${this.accessory.displayName} TargetPosition: ${value}`);

    this.TargetPosition = value;

    this.setMinMax();
    if (value > this.CurrentPosition) {
      this.PositionState = this.platform.Characteristic.PositionState.INCREASING;
      this.setNewTarget = true;
      //this.setMinMax();
    } else if (value < this.CurrentPosition) {
      this.PositionState = this.platform.Characteristic.PositionState.DECREASING;
      this.setNewTarget = true;
      //this.setMinMax();
    } else {
      this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
      this.setNewTarget = false;
      //this.setMinMax();
    }
    this.service.setCharacteristic(this.platform.Characteristic.PositionState, this.PositionState);

    /**
   * If Curtain movement time is short, the moving flag from backend is always false.
   * The minimum time depends on the network control latency.
   */
    clearTimeout(this.setNewTargetTimer);
    if (this.setNewTarget) {
      this.setNewTargetTimer = setTimeout(() => {
        this.platform.debug(`Curtain: ${this.accessory.displayName} setNewTarget ${this.setNewTarget} timeout`);
        this.setNewTarget = false;
      }, 10000);
    }
    this.doCurtainUpdate.next();
  }

  public setMinMax() {
    if (this.device.curtain?.set_min) {
      if (this.CurrentPosition <= this.device.curtain?.set_min) {
        this.CurrentPosition = 0;
      }
    }
    if (this.device.curtain?.set_max) {
      if (this.CurrentPosition >= this.device.curtain?.set_max) {
        this.CurrentPosition = 100;
      }
    }
  }
}
