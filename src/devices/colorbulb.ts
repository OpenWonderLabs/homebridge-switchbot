import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { DeviceURL, device, devicesConfig, switchbot, deviceStatusResponse, payload } from '../settings';
import { AxiosResponse } from 'axios';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class ColorBulb {
  // Services
  service!: Service;

  // Characteristic Values
  On!: CharacteristicValue;
  Brightness!: CharacteristicValue;
  ColorTemperature!: CharacteristicValue;

  // OpenAPI Others
  deviceStatus!: deviceStatusResponse;

  // BLE Others
  switchbot!: switchbot;

  // Config
  set_minStep?: number;

  // Updates
  colorBulbUpdateInProgress!: boolean;
  doColorBulbUpdate!: Subject<void>;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device & devicesConfig,
  ) {
    // ColorBulb Config
    this.platform.device(`Color Bulb: ${this.accessory.displayName} Config: (ble: ${device.ble}, set_minStep: ${device.colorbulb?.set_minStep}`);

    // default placeholders
    this.On = false;
    this.Brightness = 0;

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doColorBulbUpdate = new Subject();
    this.colorBulbUpdateInProgress = false;


    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'SWITCHBOT-COLORBULB-W1401400')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!);

    // get the Television service if it exists, otherwise create a new Television service
    // you can create multiple services for each accessory
    (this.service =
      accessory.getService(this.platform.Service.Lightbulb) ||
      accessory.addService(this.platform.Service.Lightbulb)), `${accessory.displayName} Light Bulb`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Outlet, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // handle on / off events using the On characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.OnSet.bind(this));

    // handle Brightness events using the Brightness characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Brightness)
      .setProps({
        minStep: this.minStep(),
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onGet(() => {
        return this.Brightness;
      })
      .onSet(this.BrightnessSet.bind(this));

    // handle ColorTemperature events using the ColorTemperature characteristic
    this.service.getCharacteristic(this.platform.Characteristic.ColorTemperature)
      .setProps({
        minStep: this.minStep(),
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onGet(() => {
        return this.ColorTemperature;
      })
      .onSet(this.ColorTemperatureSet.bind(this));

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.platform.config.options!.refreshRate! * 1000)
      .pipe(skipWhile(() => this.colorBulbUpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });

    // Watch for Bulb change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doColorBulbUpdate
      .pipe(
        tap(() => {
          this.colorBulbUpdateInProgress = true;
        }),
        debounceTime(this.platform.config.options!.pushRate! * 1000),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges();
        } catch (e: any) {
          this.platform.log.error(`Color Bulb: ${this.accessory.displayName} failed to pushChanges,`
            + ` Error Message: ${JSON.stringify(e.message)}`);
          this.platform.debug(`Color Bulb: ${this.accessory.displayName} Error: ${JSON.stringify(e)}`);
          this.apiError(e);
        }
        this.colorBulbUpdateInProgress = false;
      });
  }

  private minStep(): number | undefined {
    if (this.device.colorbulb?.set_minStep) {
      this.set_minStep = this.device.colorbulb?.set_minStep;
    } else {
      this.set_minStep = 1;
    }
    return this.set_minStep;
  }

  parseStatus() {
    switch (this.deviceStatus.body.power) {
      case 'on':
        this.On = true;
        break;
      default:
        this.On = false;
    }
    this.platform.debug(`Color Bulb: ${this.accessory.displayName} On: ${this.On}`);
    this.deviceStatus.body.brightness = Number(this.Brightness);
    this.deviceStatus.body.colorTemperature = Number(this.ColorTemperature);
  }

  async refreshStatus() {
    try {
      this.deviceStatus = (await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)).data;
      this.platform.device(`Color Bulb: ${this.accessory.displayName} refreshStatus: ${JSON.stringify(this.deviceStatus)}`);
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.platform.log.error(`Color Bulb: ${this.accessory.displayName} failed to refresh status, Error Message ${JSON.stringify(e.message)}`);
      this.platform.debug(`Color Bulb: ${this.accessory.displayName} Error: ${JSON.stringify(e)}`);
      this.apiError(e);
    }
  }

  /**
 * Pushes the requested changes to the SwitchBot API
 * deviceType	commandType	  Command	    command parameter	  Description
 * Color Bulb   -    "command"     "turnOff"   "default"	  =        set to OFF state
 * Color Bulb   -    "command"     "turnOn"    "default"	  =        set to ON state
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

    this.platform.log.info(`Color Bulb: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},`
      + ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`);

    // Make the API request
    const push: any = (await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload));
    this.platform.debug(`Color Bulb: ${this.accessory.displayName} pushChanges: ${JSON.stringify(push.data)}`);
    this.statusCode(push);
  }

  updateHomeKitCharacteristics() {
    if (this.On === undefined) {
      this.platform.debug(`Color Bulb: ${this.accessory.displayName} On: ${this.On}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.On, this.On);
      this.platform.device(`Color Bulb: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
    }
    if (this.Brightness === undefined) {
      this.platform.debug(`Color Bulb: ${this.accessory.displayName} Brightness: ${this.Brightness}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.Brightness, this.Brightness);
      this.platform.device(`Color Bulb: ${this.accessory.displayName} updateCharacteristic Brightness: ${this.Brightness}`);
    }
    if (this.ColorTemperature === undefined) {
      this.platform.debug(`Color Bulb: ${this.accessory.displayName} ColorTemperature: ${this.ColorTemperature}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.Brightness, this.ColorTemperature);
      this.platform.debug(`Color Bulb: ${this.accessory.displayName} updateCharacteristic ColorTemperature: ${this.ColorTemperature}`);
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.On, e);
    this.service.updateCharacteristic(this.platform.Characteristic.Brightness, e);
    this.service.updateCharacteristic(this.platform.Characteristic.ColorTemperature, e);
  }

  private statusCode(push: AxiosResponse<{ statusCode: number; }>) {
    switch (push.data.statusCode) {
      case 151:
        this.platform.log.error(`Color Bulb: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.platform.log.error(`Color Bulb: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.platform.log.error(`Color Bulb: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.platform.log.error(`Color Bulb: ${this.accessory.displayName} Device is offline.`);
        break;
      case 171:
        this.platform.log.error(`Color Bulb: ${this.accessory.displayName} Hub Device is offline.`);
        break;
      case 190:
        // eslint-disable-next-line max-len
        this.platform.log.error(`Color Bulb: ${this.accessory.displayName} Device internal error due to device states not synchronized with server. Or command fomrat is invalid.`);
        break;
      case 100:
        this.platform.debug(`Color Bulb: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.platform.debug(`Color Bulb: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  OnSet(value: CharacteristicValue) {
    this.platform.debug(`Color Bulb: ${this.accessory.displayName} On: ${value}`);

    this.On = value;
    this.doColorBulbUpdate.next();
  }

  /**
   * Handle requests to set the value of the "Brightness" characteristic
   */
  BrightnessSet(value: CharacteristicValue) {
    this.platform.debug(`Color Bulb: ${this.accessory.displayName} Brightness: ${value}`);

    this.Brightness = value;
    this.doColorBulbUpdate.next();
  }

  /**
   * Handle requests to set the value of the "ColorTemperature" characteristic
   */
  ColorTemperatureSet(value: CharacteristicValue) {
    this.platform.debug(`Color Bulb: ${this.accessory.displayName} ColorTemperature: ${value}`);

    this.ColorTemperature = value;
    this.doColorBulbUpdate.next();
  }
}
