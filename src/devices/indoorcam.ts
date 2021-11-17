import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { DeviceURL, device, devicesConfig, deviceStatusResponse, payload } from '../settings';
import { AxiosResponse } from 'axios';

export class IndoorCam {
  // Services
  private service: Service;

  // Characteristic Values
  On!: CharacteristicValue;
  OutletInUse!: CharacteristicValue;

  // OpenAPI Others
  deviceStatus!: deviceStatusResponse;

  // Updates
  cameraUpdateInProgress!: boolean;
  doCameraUpdate!: Subject<void>;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device & devicesConfig,
  ) {
    // default placeholders
    this.On = false;
    this.OutletInUse = true;

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doCameraUpdate = new Subject();
    this.cameraUpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'SWITCHBOT-CAMERA-')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!);

    // get the WindowCovering service if it exists, otherwise create a new WindowCovering service
    // you can create multiple services for each accessory
    (this.service =
      accessory.getService(this.platform.Service.Outlet) ||
      accessory.addService(this.platform.Service.Outlet)), `${accessory.displayName} Indoor Camera`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/WindowCovering

    // create handlers for required characteristics
    this.service.getCharacteristic(this.platform.Characteristic.On).onSet(this.OnSet.bind(this));

    this.service.setCharacteristic(this.platform.Characteristic.OutletInUse, this.OutletInUse || true);

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.platform.config.options!.refreshRate! * 1000)
      .pipe(skipWhile(() => this.cameraUpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });

    // Watch for Camera change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doCameraUpdate
      .pipe(
        tap(() => {
          this.cameraUpdateInProgress = true;
        }),
        debounceTime(this.platform.config.options!.pushRate! * 1000),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges();
        } catch (e: any) {
          this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} failed to pushChanges,`
            + ` Error Message: ${JSON.stringify(e.message)}`);
          this.platform.debug(`Indoor Cam: ${this.accessory.displayName} Error: ${JSON.stringify(e)}`);
          this.apiError(e);
        }
        this.cameraUpdateInProgress = false;
      });
  }

  parseStatus() {
    switch (this.deviceStatus.body.power) {
      case 'on':
        this.On = true;
        break;
      default:
        this.On = false;
    }
    this.platform.debug(`Indoor Cam ${this.accessory.displayName} On: ${this.On}`);
  }


  private async refreshStatus() {
    try {
      this.deviceStatus = (await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)).data;
      this.platform.device(`Indoor Cam: ${this.accessory.displayName} refreshStatus: ${JSON.stringify(this.deviceStatus)}`);
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} failed to refreshStatus, Error Message: ${JSON.stringify(e.message)}`);
      this.platform.debug(`Indoor Cam: ${this.accessory.displayName} Error: ${JSON.stringify(e)}`);
      this.apiError(e);
    }
  }

  /**
 * Pushes the requested changes to the SwitchBot API
 * deviceType	commandType	  Command	    command parameter	  Description
 * Camera   -    "command"     "turnOff"   "default"	  =        set to OFF state
 * Camera   -    "command"     "turnOn"    "default"	  =        set to ON state
 */
  async pushChanges() {
    const payload = {
      commandType: 'command',
      parameter: 'default',
    } as payload;

    if (this.On) {
      payload.command = 'turnOn';
    } else {
      payload.command = 'turnOff';
    }

    this.platform.log.info(`Indoor Cam: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},`
      + ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`);

    // Make the API request
    const push: any = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
    this.platform.debug(`Indoor Cam: ${this.accessory.displayName} pushChanges: ${JSON.stringify(push.data)}`);
    this.statusCode(push);
    this.refreshStatus();
  }

  updateHomeKitCharacteristics() {
    if (this.On === undefined) {
      this.platform.debug(`Indoor Cam: ${this.accessory.displayName} On: ${this.On}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.On, this.On);
      this.platform.device(`Indoor Cam: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
    }
    if (this.OutletInUse === undefined) {
      this.platform.debug(`Indoor Cam: ${this.accessory.displayName} OutletInUse: ${this.OutletInUse}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.OutletInUse, this.OutletInUse);
      this.platform.device(`Indoor Cam: ${this.accessory.displayName} updateCharacteristic OutletInUse: ${this.OutletInUse}`);
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.On, e);
    this.service.updateCharacteristic(this.platform.Characteristic.OutletInUse, e);
  }

  private statusCode(push: AxiosResponse<{ statusCode: number; }>) {
    switch (push.data.statusCode) {
      case 151:
        this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} Device is offline.`);
        break;
      case 171:
        this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} Hub Device is offline.`);
        break;
      case 190:
        // eslint-disable-next-line max-len
        this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} Device internal error due to device states not synchronized with server. Or command fomrat is invalid.`);
        break;
      case 100:
        this.platform.debug(`Indoor Cam: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.platform.debug(`Indoor Cam: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  OnSet(value: CharacteristicValue) {
    this.platform.debug(`Indoor Cam: ${this.accessory.displayName} On: ${value}`);

    this.On = value;
    this.doCameraUpdate.next();
  }


}