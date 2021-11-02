import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { skipWhile } from 'rxjs/operators';
import { DeviceURL, device, devicesConfig, serviceData, switchbot, deviceStatusResponse } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Motion {
  // Services
  private service: Service;

  // Characteristic Values
  MotionDetected!: CharacteristicValue;

  // BLE Others
  switchbot!: switchbot;
  serviceData!: serviceData;
  BLEmotion!: serviceData['movement'];

  // OpenAPI Others
  deviceStatus!: deviceStatusResponse;

  // Updates
  motionUbpdateInProgress!: boolean;
  doMotionUpdate!: Subject<void>;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device & devicesConfig,
  ) {
    // default placeholders
    this.MotionDetected = false;

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
    this.doMotionUpdate = new Subject();
    this.motionUbpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'SWITCHBOT-WOMOTION-W1101500')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!);

    // get the Battery service if it exists, otherwise create a new Motion service
    // you can create multiple services for each accessory
    (this.service =
      accessory.getService(this.platform.Service.MotionSensor) ||
      accessory.addService(this.platform.Service.MotionSensor)), `${accessory.displayName} Motion Sensor`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Motion, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/MotionSensor

    // create handlers for required characteristics
    //this.service.setCharacteristic(this.platform.Characteristic.ChargingState, 2);

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.platform.config.options!.refreshRate! * 1000)
      .pipe(skipWhile(() => this.motionUbpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });
  }

  /**
   * Parse the device status from the SwitchBot api
   */
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
    this.MotionDetected = Boolean(this.BLEmotion);
    this.platform.debug(`${this.accessory.displayName}, MotionDetected: ${this.MotionDetected}`);
  }

  private async openAPIparseStatus() {
    this.MotionDetected = Boolean(this.deviceStatus.body.moveDetected);
    this.platform.debug(`${this.accessory.displayName}, MotionDetected: ${this.MotionDetected}`);
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
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
    this.platform.debug('Motion BLE Device RefreshStatus');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const switchbot = this.connectBLE();
    // Start to monitor advertisement packets
    switchbot.startScan({
      model: 's',
      id: this.device.bleMac,
    }).then(() => {
      // Set an event hander
      switchbot.onadvertisement = (ad: any) => {
        this.serviceData = ad.serviceData;
        this.platform.device(`${this.device.bleMac}: ${JSON.stringify(ad.serviceData)}`);
        /*this.Mode === ad.serviceData.mode;
        this.SwitchOn === ad.serviceData.state;
        this.BatteryLevel === ad.serviceData.battery;
        this.platform.device(`${this.accessory.displayName}, Mode: ${ad.serviceData.mode}, State: ${ad.serviceData.state},`
          + ` Battery: ${ad.serviceData.battery}`);*/
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
      this.platform.debug(`Motion ${this.accessory.displayName} refreshStatus: ${JSON.stringify(this.deviceStatus)}`);
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.platform.log.error(`Motion ${this.accessory.displayName} failed to refresh status, Error Message: ${JSON.stringify(e.message)}`);
      this.platform.debug(`Motion ${this.accessory.displayName}, Error: ${JSON.stringify(e)}`);
      this.apiError(e);
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    if (this.MotionDetected === undefined) {
      this.platform.debug(`Motion ${this.accessory.displayName} MotionDetected: ${this.MotionDetected}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.MotionDetected, this.MotionDetected);
      this.platform.device(`Motion ${this.accessory.displayName} updateCharacteristic MotionDetected: ${this.MotionDetected}`);
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.MotionDetected, e);
  }
}
