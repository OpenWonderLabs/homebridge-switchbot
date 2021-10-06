import { Service, PlatformAccessory, CharacteristicValue, MacAddress } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { skipWhile } from 'rxjs/operators';
import { DeviceURL, device, deviceStatusResponse } from '../settings';

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

  // Others
  deviceStatus!: deviceStatusResponse;
  switchbot!: {
    discover: (
      arg0:
        {
          duration: any;
          model: string;
          quick: boolean;
          id: MacAddress;
        }
    ) => Promise<any>;
    wait: (
      arg0: number
    ) => any;
  };

  // Updates
  motionUbpdateInProgress!: boolean;
  doMotionUpdate;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device,
  ) {
    // default placeholders
    this.MotionDetected = false;

    // BLE Connection
    if (this.platform.config.options?.ble?.includes(this.device.deviceId!)) {
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
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId);

    // get the Battery service if it exists, otherwise create a new Motion service
    // you can create multiple services for each accessory
    (this.service =
      accessory.getService(this.platform.Service.MotionSensor) ||
      accessory.addService(this.platform.Service.MotionSensor)), `${device.deviceName} ${device.deviceType}`;

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
    if (this.platform.config.options?.ble?.includes(this.device.deviceId!)) {
      await this.BLEparseStatus();
    } else {
      await this.openAPIparseStatus();
    }
  }

  private async BLEparseStatus() {
    this.MotionDetected = true;
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
    if (this.platform.config.options?.ble?.includes(this.device.deviceId!)) {
      await this.BLErefreshStatus();
    } else {
      await this.openAPIRefreshStatus();
    }
  }

  private async BLErefreshStatus() {
    this.platform.debug('Motion BLE Device RefreshStatus');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Switchbot = require('node-switchbot');
    const switchbot = new Switchbot();
    const colon = this.device.deviceId!.match(/.{1,2}/g);
    const bleMac = colon!.join(':'); //returns 1A:23:B4:56:78:9A;
    this.device.bleMac = bleMac.toLowerCase();
    this.platform.device(this.device.bleMac!);
    switchbot.onadvertisement = (ad: any) => {
      this.platform.debug(JSON.stringify(ad, null, '  '));
      this.platform.device('ad:', JSON.stringify(ad));
    };
    switchbot
      .startScan({
        id: this.device.bleMac,
      })
      .then(() => {
        return switchbot.wait(this.platform.config.options!.refreshRate! * 1000);
      })
      .then(() => {
        switchbot.stopScan();
      })
      .catch(async (error: any) => {
        this.platform.log.error(error);
        await this.openAPIRefreshStatus();
      });
    setInterval(() => {
      this.platform.log.info('Start scan ' + this.device.deviceName + '(' + this.device.bleMac + ')');
      switchbot
        .startScan({
          mode: 'S',
          id: bleMac,
        })
        .then(() => {
          return switchbot.wait(this.platform.config.options!.refreshRate! * 1000);
        })
        .then(() => {
          switchbot.stopScan();
          this.platform.log.info('Stop scan ' + this.device.deviceName + '(' + this.device.bleMac + ')');
        })
        .catch(async (error: any) => {
          this.platform.log.error(error);
          await this.openAPIRefreshStatus();
        });
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    }, this.platform.config.options!.refreshRate! * 60000);
  }

  private async openAPIRefreshStatus() {
    try {
      const deviceStatus: deviceStatusResponse = (
        await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)
      ).data;
      if (deviceStatus.message === 'success') {
        this.deviceStatus = deviceStatus;
        this.platform.debug(`Motion ${this.accessory.displayName} refreshStatus - ${JSON.stringify(this.deviceStatus)}`);

        this.parseStatus();
        this.updateHomeKitCharacteristics();
      } else {
        this.platform.debug(this.deviceStatus);
      }
    } catch (e: any) {
      this.platform.log.error(`Motion - Failed to refresh status of ${this.device.deviceName} - ${JSON.stringify(e.message)}`);
      this.platform.debug(`Motion ${this.accessory.displayName} - ${JSON.stringify(e)}`);
      this.apiError(e);
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    if (this.MotionDetected === undefined) {
      this.platform.debug(`MotionDetected: ${this.MotionDetected}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.MotionDetected, this.MotionDetected);
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.MotionDetected, e);
  }
}
