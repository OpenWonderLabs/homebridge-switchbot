import { AxiosResponse } from 'axios';
import { interval, Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { DeviceURL, device, devicesConfig, switchbot, deviceStatusResponse, payload, hs2rgb, rgb2hs } from '../settings';

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
  Hue!: CharacteristicValue;
  Brightness!: CharacteristicValue;
  Saturation!: CharacteristicValue;
  ColorTemperature!: CharacteristicValue;

  // OpenAPI Others
  deviceStatus!: deviceStatusResponse;

  // BLE Others
  switchbot!: switchbot;

  // Config
  set_minStep?: number;
  private readonly deviceDebug = this.platform.config.options?.debug === 'device' || this.platform.debugMode;
  private readonly debugDebug = this.platform.config.options?.debug === 'debug' || this.platform.debugMode;

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
    this.ColorTemperature = 140;
    this.Brightness = 0;
    this.Saturation = 0;
    this.Hue = 0;

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
        minValue: 140,
        maxValue: 500,
        validValueRanges: [140, 500],
      })
      .onGet(() => {
        return this.ColorTemperature;
      })
      .onSet(this.ColorTemperatureSet.bind(this));

    // handle Hue events using the Hue characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Hue)
      .setProps({
        minValue: 0,
        maxValue: 360,
        validValueRanges: [0, 360],
      })
      .onGet(() => {
        return this.Hue;
      })
      .onSet(this.HueSet.bind(this));

    // handle Hue events using the Hue characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Saturation)
      .setProps({
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onGet(() => {
        return this.Saturation;
      })
      .onSet(this.SaturationSet.bind(this));

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
          this.platform.log.error(`Color Bulb: ${this.accessory.displayName} failed pushChanges`);
          if (this.deviceDebug) {
            this.platform.log.error(`Color Bulb: ${this.accessory.displayName} failed pushChanges,`
              + ` Error Message: ${JSON.stringify(e.message)}`);
          }
          if (this.debugDebug) {
            this.platform.log.error(`Color Bulb: ${this.accessory.displayName} failed pushChanges,`
              + ` Error: ${JSON.stringify(e)}`);
          }
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
    this.platform.device(`Color Bulb: ${this.accessory.displayName} On: ${this.On}`);

    // Brightness
    this.Brightness = Number(this.deviceStatus.body.brightness);
    this.platform.device(`Color Bulb: ${this.accessory.displayName} Brightness: ${this.Brightness}`);

    // Color, Hue & Brightness
    if (this.deviceStatus.body.color) {
      this.platform.device(`Color Bulb: ${this.accessory.displayName} color: ${JSON.stringify(this.deviceStatus.body.color)}`);
      const [red, green, blue] = this.deviceStatus.body.color!.split(':');
      this.platform.device(`Color Bulb: ${this.accessory.displayName} red: ${JSON.stringify(red)}`);
      this.platform.device(`Color Bulb: ${this.accessory.displayName} green: ${JSON.stringify(green)}`);
      this.platform.device(`Color Bulb: ${this.accessory.displayName} blue: ${JSON.stringify(blue)}`);

      const [hue, saturation] = rgb2hs(Number(red), Number(green), Number(blue));
      this.platform.device(`Color Bulb: ${this.accessory.displayName} hs: ${JSON.stringify(rgb2hs(Number(red), Number(green), Number(blue)))}`);

      // Hue
      this.Hue = hue;
      this.platform.device(`Color Bulb: ${this.accessory.displayName} Hue: ${this.Hue}`);

      // Saturation
      this.Saturation = saturation;
      this.platform.device(`Color Bulb: ${this.accessory.displayName} Saturation: ${this.Saturation}`);
    }

    // ColorTemperature
    if (!Number.isNaN(this.deviceStatus.body.colorTemperature)) {
      this.platform.device(`Color Bulb: ${this.accessory.displayName} OpenAPI ColorTemperature: ${this.deviceStatus.body.colorTemperature}`);
      const mired = Math.round(1000000 / this.deviceStatus.body.colorTemperature!);

      this.ColorTemperature = Number(mired);

      this.ColorTemperature = Math.max(Math.min(this.ColorTemperature, 500), 140);
      this.platform.device(`Color Bulb: ${this.accessory.displayName} ColorTemperature: ${this.ColorTemperature}`);
    }
  }

  async refreshStatus() {
    try {
      this.deviceStatus = (await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)).data;
      this.platform.device(`Color Bulb: ${this.accessory.displayName} refreshStatus: ${JSON.stringify(this.deviceStatus)}`);
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.platform.log.error(`Color Bulb: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection`);
      if (this.deviceDebug) {
        this.platform.log.error(`Color Bulb: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,`
          + ` Error Message: ${JSON.stringify(e.message)}`);
      }
      if (this.debugDebug) {
        this.platform.log.error(`Color Bulb: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,`
          + ` Error: ${JSON.stringify(e)}`);
      }
      this.apiError(e);
    }
  }

  /**
 * Pushes the requested changes to the SwitchBot API
 * deviceType	      commandType	          Command	               command parameter	                     Description
 * Color Bulb   -    "command"            "turnOff"                  "default"	              =        set to OFF state
 * Color Bulb   -    "command"            "turnOn"                   "default"	              =        set to ON state
 * Color Bulb   -    "command"            "toggle"                   "default"	              =        toggle state
 * Color Bulb   -    "command"         "setBrightness"	             "{1-100}"	              =        set brightness
 * Color Bulb   -    "command"           "setColor"	         "{0-255}:{0-255}:{0-255}"	      =        set RGB color value
 * Color Bulb   -    "command"     "setColorTemperature"	         "{2700-6500}"	            =        set color temperature
 */
  async pushChanges() {
    try {
      // Push On Update
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

      // Push Brightness Update
      if (this.On) {
        const payload = {
          commandType: 'command',
          command: 'setBrightness',
          parameter: `${this.Brightness}`,
        } as payload;

        this.platform.log.info(`Color Bulb: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},`
          + ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`);

        // Make the API request
        const push: any = (await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload));
        this.platform.debug(`Color Bulb: ${this.accessory.displayName} pushChanges: ${JSON.stringify(push.data)}`);
        this.statusCode(push);
      }

      // Push ColorTemperature Update
      if (this.On) {
        const kelvin = Math.round(1000000 / Number(this.ColorTemperature));

        const payload = {
          commandType: 'command',
          command: 'setColorTemperature',
          parameter: `${kelvin}`,
        } as payload;

        this.platform.log.info(`Color Bulb: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},`
          + ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`);

        // Make the API request
        const push: any = (await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload));
        this.platform.debug(`Color Bulb: ${this.accessory.displayName} pushChanges: ${JSON.stringify(push.data)}`);
        this.statusCode(push);
      }

      // Push Hue & Saturation Update
      if (this.On) {
        this.platform.device(`Color Bulb: ${this.accessory.displayName} Hue: ${JSON.stringify(this.Hue)}`);
        this.platform.device(`Color Bulb: ${this.accessory.displayName} Saturation: ${JSON.stringify(this.Saturation)}`);

        const [red, green, blue] = hs2rgb(Number(this.Hue), Number(this.Saturation));
        this.platform.device(`Color Bulb: ${this.accessory.displayName} rgb: ${JSON.stringify([red, green, blue])}`);

        const payload = {
          commandType: 'command',
          command: 'setColor',
          parameter: `${red}:${green}:${blue}`,
        } as payload;

        this.platform.log.info(`Color Bulb: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},`
          + ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`);

        // Make the API request
        const push: any = (await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload));
        this.platform.debug(`Color Bulb: ${this.accessory.displayName} pushChanges: ${JSON.stringify(push.data)}`);
        this.statusCode(push);
      }

    } catch (e: any) {
      this.platform.log.error(`Color Bulb: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection`);
      if (this.deviceDebug) {
        this.platform.log.error(`Color Bulb: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,`
          + ` Error Message: ${JSON.stringify(e.message)}`);
      }
      if (this.debugDebug) {
        this.platform.log.error(`Color Bulb: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,`
          + ` Error: ${JSON.stringify(e)}`);
      }
      this.apiError(e);
    }
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
      this.service.updateCharacteristic(this.platform.Characteristic.ColorTemperature, this.ColorTemperature);
      this.platform.debug(`Color Bulb: ${this.accessory.displayName} updateCharacteristic ColorTemperature: ${this.ColorTemperature}`);
    }
    if (this.Hue === undefined) {
      this.platform.debug(`Color Bulb: ${this.accessory.displayName} Hue: ${this.Hue}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.Hue, this.Hue);
      this.platform.debug(`Color Bulb: ${this.accessory.displayName} updateCharacteristic Hue: ${this.Hue}`);
    }
    if (this.Saturation === undefined) {
      this.platform.debug(`Color Bulb: ${this.accessory.displayName} Saturation: ${this.Saturation}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.Saturation, this.Saturation);
      this.platform.debug(`Color Bulb: ${this.accessory.displayName} updateCharacteristic Saturation: ${this.Saturation}`);
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.On, e);
    this.service.updateCharacteristic(this.platform.Characteristic.Hue, e);
    this.service.updateCharacteristic(this.platform.Characteristic.Brightness, e);
    this.service.updateCharacteristic(this.platform.Characteristic.Saturation, e);
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
        this.platform.log.error(`Color Bulb: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,`
          + ` Or command: ${JSON.stringify(push.data)} format is invalid`);
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

  /**
 * Handle requests to set the value of the "Hue" characteristic
 */
  HueSet(value: CharacteristicValue) {
    this.platform.debug(`Color Bulb: ${this.accessory.displayName} Hue: ${value}`);

    this.Hue = value;
    this.doColorBulbUpdate.next();
  }

  /**
 * Handle requests to set the value of the "Saturation" characteristic
 */
  SaturationSet(value: CharacteristicValue) {
    this.platform.debug(`Color Bulb: ${this.accessory.displayName} Saturation: ${value}`);

    this.Saturation = value;
    this.doColorBulbUpdate.next();
  }
}

