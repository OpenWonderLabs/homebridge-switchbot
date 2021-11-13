/* eslint-disable @typescript-eslint/no-var-requires */
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { DeviceURL, device, devicesConfig, serviceData, switchbot, deviceStatusResponse } from '../settings';
import { AxiosResponse } from 'axios';

export class Curtain {
  // Services
  private service: Service;
  private lightSensorService: Service;
  private batteryService?: Service;

  // Characteristic Values
  CurrentPosition!: CharacteristicValue;
  PositionState!: CharacteristicValue;
  TargetPosition!: CharacteristicValue;
  CurrentAmbientLightLevel!: CharacteristicValue;
  BatteryLevel?: CharacteristicValue;
  StatusLowBattery?: CharacteristicValue;

  // BLE Others
  switchbot!: switchbot;
  serviceData!: serviceData;
  moveTimer!: NodeJS.Timeout;
  ScanIntervalId!: NodeJS.Timeout;
  setNewTargetTimer!: NodeJS.Timeout;
  AutoDisableFastScanTimeoutId!: NodeJS.Timeout;
  setNewTarget!: boolean;
  moveTime!: number;
  ScanDuration: any;
  ReverseDir: any;
  FastScanEnabled!: boolean;
  FastScanInterval!: number;
  SlowScanInterval!: number;
  OpenCloseThreshold: any;
  PreviousPosition: any;
  Position: any;
  FastScanDuration!: number;
  calibration: serviceData['calibration'];
  battery: serviceData['battery'];
  position: serviceData['position'];
  lightLevel: serviceData['lightLevel'];

  // OpenAPI Others
  deviceStatus!: deviceStatusResponse;

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
    // default placeholders
    this.setMinMax();
    this.CurrentPosition = 0;
    this.TargetPosition = 0;
    this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
    this.ScanDuration = this.platform.config.options!.refreshRate!;

    // BLE Connection
    if (device.ble) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const SwitchBot = require('node-switchbot');
      this.switchbot = new SwitchBot();
      const colon = device.deviceId!.match(/.{1,2}/g);
      const bleMac = colon!.join(':'); //returns 1A:23:B4:56:78:9A;
      this.device.bleMac = bleMac.toLowerCase();
      this.platform.device(this.device.bleMac.toLowerCase());
    }

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
      .setCharacteristic(this.platform.Characteristic.Model, 'SWITCHBOT-WOCURTAIN-W0701600')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!);

    // get the WindowCovering service if it exists, otherwise create a new WindowCovering service
    // you can create multiple services for each accessory
    (this.service =
      accessory.getService(this.platform.Service.WindowCovering) ||
      accessory.addService(this.platform.Service.WindowCovering)), `${device.deviceName} ${device.deviceType}`;

    this.platform.device(`[Curtain Config] disable_group: ${device.curtain?.disable_group}, refreshRate: ${device.curtain?.refreshRate},`
      + ` set_max: ${device.curtain?.set_max}, set_min: ${device.curtain?.set_min}, set_minStep: ${device.curtain?.set_minStep}`);
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
        return Number.isNaN(this.CurrentPosition);
      });

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetPosition)
      .setProps({
        minStep: this.minStep(),
        validValueRanges: [0, 100],
      })
      .onSet(this.TargetPositionSet.bind(this));

    //set up brightness level from the builtin sensor as light sensor accessory
    (this.lightSensorService =
      accessory.getService(this.platform.Service.LightSensor) ||
      accessory.addService(this.platform.Service.LightSensor)), `${device.deviceName} Light Sensor`;
    this.lightSensorService.setCharacteristic(this.platform.Characteristic.Name, `${device.deviceName} Light Sensor`);

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
        this.platform.debug('Refresh status when moving', this.PositionState);
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
          this.platform.log.error(JSON.stringify(e.message));
          this.platform.debug(`Curtain ${accessory.displayName} - ${JSON.stringify(e)}`);
          this.apiError(e);
        }
        this.curtainUpdateInProgress = false;
      });
  }

  private curtainRefreshRate() {
    if (this.device?.curtain?.refreshRate) {
      this.refreshRate = this.device?.curtain?.refreshRate;
    } else {
      this.refreshRate = 5;
      if (this.platform.config.options?.debug === 'device') {
        this.platform.log.warn('Using Default Curtain Refresh Rate.');
      }
    }

    return this.refreshRate;
  }

  private minStep(): number | undefined {
    if (this.device.curtain?.set_minStep) {
      this.set_minStep = this.device.curtain?.set_minStep;
    } else {
      this.set_minStep = 1;
    }
    return this.set_minStep;
  }

  async parseStatus() {
    if (this.device.ble) {
      this.platform.device('BLE');
      await this.BLEparseStatus();
    } else {
      this.platform.device('OpenAPI');
      await this.openAPIparseStatus();
    }
  }

  private async BLEparseStatus() {
    this.platform.device('Curtains BLE Device parseStatus');
    this.setMinMax();
    this.CurrentPosition = Number(this.position);
    this.setMinMax();
    if (this.TargetPosition > this.CurrentPosition) {
      this.platform.debug(`Curtain ${this.accessory.displayName} - Current position: ${this.CurrentPosition} closing`);
      this.PositionState = this.platform.Characteristic.PositionState.INCREASING;
    } else if (this.TargetPosition < this.CurrentPosition) {
      this.platform.debug(`Curtain ${this.accessory.displayName} - Current position: ${this.CurrentPosition} opening`);
      this.PositionState = this.platform.Characteristic.PositionState.DECREASING;
    } else {
      this.platform.debug(`Curtain ${this.CurrentPosition} - standby`);
      this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
    }
    // Brightness
    switch (this.lightLevel) {
      case 1:
        this.CurrentAmbientLightLevel = 0.0001;
        break;
      case 2:
        this.CurrentAmbientLightLevel = 100;
        break;
      case 3:
        this.CurrentAmbientLightLevel = 200;
        break;
      case 4:
        this.CurrentAmbientLightLevel = 4000;
        break;
      case 5:
        this.CurrentAmbientLightLevel = 12000;
        break;
      case 6:
        this.CurrentAmbientLightLevel = 28000;
        break;
      case 7:
        this.CurrentAmbientLightLevel = 56000;
        break;
      case 8:
        this.CurrentAmbientLightLevel = 75000;
        break;
      case 9:
        this.CurrentAmbientLightLevel = 90000;
        break;
      case 10:
      default:
        this.CurrentAmbientLightLevel = 100000;
    }
    // Battery
    this.BatteryLevel = Number(this.battery);
    if (this.BatteryLevel < 10) {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.platform.debug(
      `Curtain ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition},`
      + ` TargetPosition: ${this.TargetPosition}, PositionState: ${this.PositionState},`
      + ` CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
  }

  private async openAPIparseStatus() {
    this.setMinMax();
    this.CurrentPosition = 100 - this.deviceStatus.body.slidePosition!;
    this.setMinMax();
    this.platform.debug(`Curtain ${this.accessory.displayName} CurrentPosition - Device is Currently: ${this.CurrentPosition}`);
    if (this.setNewTarget) {
      this.platform.log.info(`Checking ${this.accessory.displayName} Status ...`);
    }

    if (this.deviceStatus.body.moving) {
      if (this.TargetPosition > this.CurrentPosition) {
        this.platform.debug(`Curtain ${this.accessory.displayName} - Current position: ${this.CurrentPosition} closing`);
        this.PositionState = this.platform.Characteristic.PositionState.INCREASING;
      } else if (this.TargetPosition < this.CurrentPosition) {
        this.platform.debug(`Curtain ${this.accessory.displayName} - Current position: ${this.CurrentPosition} opening`);
        this.PositionState = this.platform.Characteristic.PositionState.DECREASING;
      } else {
        this.platform.debug(`Curtain ${this.CurrentPosition} - standby`);
        this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
      }
    } else {
      this.platform.debug(`Curtain ${this.accessory.displayName} - Current position: ${this.CurrentPosition} standby`);
      if (!this.setNewTarget) {
        /*If Curtain calibration distance is short, there will be an error between the current percentage and the target percentage.*/
        this.TargetPosition = this.CurrentPosition;
        this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
      }
    }

    // Brightness
    switch (this.deviceStatus.body.brightness) {
      case 'dim':
        this.CurrentAmbientLightLevel = 0.0001;
        break;
      case 'bright':
      default:
        this.CurrentAmbientLightLevel = 100000;
    }
    this.platform.debug(
      `Curtain ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition},`
      + ` TargetPosition: ${this.TargetPosition}, PositionState: ${this.PositionState},`
      + ` CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
  }

  async refreshStatus() {
    if (this.device.ble) {
      this.platform.device('BLE');
      await this.BLERefreshStatus();
    } else {
      this.platform.device('OpenAPI');
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
    this.platform.debug('Curtains BLE Device RefreshStatus');
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
        this.platform.device(`${this.accessory.displayName}, Calibration: ${ad.serviceData.calibration}, Position: ${ad.serviceData.position},`
          + ` Light Level: ${ad.serviceData.lightLevel}, Battery: ${ad.serviceData.battery}`);
      };
      // Wait 10 seconds
      return switchbot.wait(10000);
    }).then(() => {
      // Stop to monitor
      switchbot.stopScan();
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    }).catch(async (e: any) => {
      this.platform.log.error(`BLE Connection Failed: ${e.message}`);
      this.platform.log.warn('Using OpenAPI Connection');
      await this.openAPIRefreshStatus();
    });
  }

  private async openAPIRefreshStatus() {
    try {
      this.deviceStatus = (await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)).data;
      this.platform.debug(`Curtain ${this.accessory.displayName} refreshStatus: ${JSON.stringify(this.deviceStatus)}`);
      this.setMinMax();
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.platform.log.error(`Curtain ${this.accessory.displayName} failed to refresh status, Eror Message ${JSON.stringify(e.message)}`);
      this.platform.debug(`Curtain ${this.accessory.displayName}, Error: ${JSON.stringify(e)}`);
      this.apiError(e);
    }
  }

  async pushChanges() {
    if (this.device.ble) {
      this.platform.device('BLE');
      await this.BLEpushChanges();
    } else {
      this.platform.device('OpenAPI');
      await this.OpenAPIpushChanges();
    }
  }

  private async BLEpushChanges() {
    this.platform.device('Curtains BLE Device pushChanges');
    const switchbot = this.connectBLE();
    switchbot.discover({ model: 'c', quick: true, id: this.device.bleMac }).then((device_list) => {
      this.platform.log.info(`${this.accessory.displayName}, Target Position: ${this.TargetPosition}`);
      return device_list[0].runToPos(Number(this.TargetPosition));
    }).then(() => {
      this.platform.device('Done.');
    }).catch((e: any) => {
      this.platform.log.error(`BLE pushChanges Error Message: ${e.message}`);
    });
  }

  private async OpenAPIpushChanges() {
    if (this.TargetPosition !== this.CurrentPosition) {
      this.platform.debug(`Pushing ${this.TargetPosition}`);
      const adjustedTargetPosition = 100 - Number(this.TargetPosition);
      const payload = {
        commandType: 'command',
        command: 'setPosition',
        parameter: `0,ff,${adjustedTargetPosition}`,
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
      this.platform.debug(`Curtain ${this.accessory.displayName} pushchanges: ${JSON.stringify(payload)}`);

      // Make the API request
      const push: any = (await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId!}/commands`, payload));
      this.platform.debug(`Curtain ${this.accessory.displayName} Changes pushed: ${JSON.stringify(push.data)}`);
      this.statusCode(push);
    }
  }

  updateHomeKitCharacteristics() {
    this.platform.debug(
      `Curtain ${this.accessory.displayName} updateHomeKitCharacteristics - ${JSON.stringify({
        CurrentPosition: this.CurrentPosition,
        PositionState: this.PositionState,
        TargetPosition: this.TargetPosition,
        CurrentAmbientLightLevel: this.CurrentAmbientLightLevel,
      })}`,
    );
    if (!this.device.ble) {
      this.setMinMax();
    }
    if (this.CurrentPosition === undefined) {
      this.platform.debug(`Curtain ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, Number.isNaN(this.CurrentPosition));
      this.platform.device(`Curtain ${this.accessory.displayName} updateCharacteristic CurrentPosition: ${this.CurrentPosition}`);
    }
    if (this.PositionState === undefined) {
      this.platform.debug(`Curtain ${this.accessory.displayName} PositionState: ${this.PositionState}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.PositionState);
      this.platform.device(`Curtain ${this.accessory.displayName} updateCharacteristic PositionState: ${this.PositionState}`);
    }
    if (this.TargetPosition === undefined) {
      this.platform.debug(`Curtain ${this.accessory.displayName} TargetPosition: ${this.TargetPosition}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, Number.isNaN(this.TargetPosition));
      this.platform.device(`Curtain ${this.accessory.displayName} updateCharacteristic TargetPosition: ${this.TargetPosition}`);
    }
    if (this.CurrentAmbientLightLevel === undefined) {
      this.platform.debug(`Curtain ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
    } else {
      this.lightSensorService.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, this.CurrentAmbientLightLevel);
      this.platform.device(`Curtain ${this.accessory.displayName} updateCharacteristic CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
    }
    if (this.device.ble) {
      if (this.BatteryLevel === undefined) {
        this.platform.debug(`Curtain ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
      } else {
        this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
        this.platform.device(`Curtain ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
      }
      if (this.StatusLowBattery === undefined) {
        this.platform.debug(`Curtain ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
      } else {
        this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
        this.platform.device(`Curtain ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
      }
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, e);
    this.service.updateCharacteristic(this.platform.Characteristic.PositionState, e);
    this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, e);
    this.lightSensorService.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, e);
    if (this.device.ble) {
      this.batteryService!.updateCharacteristic(this.platform.Characteristic.BatteryLevel, e);
      this.batteryService!.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, e);
    }
  }

  private statusCode(push: AxiosResponse<{ statusCode: number;}>) {
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

  /**
   * Handle requests to set the value of the "Target Position" characteristic
   */
  TargetPositionSet(value: CharacteristicValue) {
    this.platform.debug(`Curtain ${this.accessory.displayName} - Set TargetPosition: ${value}`);

    this.TargetPosition = value;

    if (value > this.CurrentPosition) {
      this.PositionState = this.platform.Characteristic.PositionState.INCREASING;
      this.setNewTarget = true;
      this.setMinMax();
    } else if (value < this.CurrentPosition) {
      this.PositionState = this.platform.Characteristic.PositionState.DECREASING;
      this.setNewTarget = true;
      this.setMinMax();
    } else {
      this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
      this.setNewTarget = false;
      this.setMinMax();
    }
    this.service.setCharacteristic(this.platform.Characteristic.PositionState, this.PositionState);

    /**
   * If Curtain movement time is short, the moving flag from backend is always false.
   * The minimum time depends on the network control latency.
   */
    clearTimeout(this.setNewTargetTimer);
    if (this.setNewTarget) {
      this.setNewTargetTimer = setTimeout(() => {
        this.platform.debug(`Curtain ${this.accessory.displayName} - setNewTarget ${this.setNewTarget} timeout`);
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
