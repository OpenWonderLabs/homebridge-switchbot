import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { skipWhile } from 'rxjs/operators';
import { DeviceURL, device, deviceStatusResponse } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Contact {
  private service: Service;
  temperatureservice?: Service;
  humidityservice?: Service;

  ContactSensorState!: CharacteristicValue;
  deviceStatus!: deviceStatusResponse;

  contactUbpdateInProgress!: boolean;
  doContactUpdate;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device,
  ) {
    // default placeholders
    this.ContactSensorState = this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doContactUpdate = new Subject();
    this.contactUbpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'SWITCHBOT-CONTACT-')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId);

    // get the Battery service if it exists, otherwise create a new Contact service
    // you can create multiple services for each accessory
    (this.service =
      accessory.getService(this.platform.Service.ContactSensor) ||
      accessory.addService(this.platform.Service.ContactSensor)), '%s %s', device.deviceName, device.deviceType;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Contact, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/ContactSensor

    // create handlers for required characteristics
    //this.service.setCharacteristic(this.platform.Characteristic.ChargingState, 2);

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.platform.config.options!.refreshRate! * 1000)
      .pipe(skipWhile(() => this.contactUbpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });
  }

  /**
   * Parse the device status from the SwitchBot api
   */
  parseStatus() {
    // Set Room Sensor State
    if (this.deviceStatus.body.openState) {
      this.ContactSensorState = this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;
    } else {
      this.ContactSensorState = this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
    }
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus() {
    try {
      const deviceStatus: deviceStatusResponse = (
        await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)
      ).data;
      if (deviceStatus.message === 'success') {
        this.deviceStatus = deviceStatus;
        this.platform.debug(`Contact ${this.accessory.displayName} refreshStatus - ${JSON.stringify(this.deviceStatus)}`);

        this.parseStatus();
        this.updateHomeKitCharacteristics();
      }
    } catch (e: any) {
      this.platform.log.error(
        'Contact - Failed to update status of',
        this.device.deviceName,
        JSON.stringify(e.message),
        this.platform.debug(`Contact ${this.accessory.displayName} - ${JSON.stringify(e)}`),
      );
      this.apiError(e);
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    if (this.ContactSensorState !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.ContactSensorState, this.ContactSensorState);
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.ContactSensorState, e);
  }
}
