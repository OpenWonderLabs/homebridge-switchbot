import { AxiosResponse } from 'axios';
import { interval, Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue, ControllerConstructor, Controller, ControllerServiceMap } from 'homebridge';
import { DeviceURL, device, devicesConfig, switchbot, deviceStatusResponse, payload, hs2rgb, rgb2hs, m2hs, deviceStatus } from '../settings';

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
  OnCached!: CharacteristicValue;
  Hue!: CharacteristicValue;
  HueCached!: CharacteristicValue;
  Saturation!: CharacteristicValue;
  SaturationCached!: CharacteristicValue;
  Brightness!: CharacteristicValue;
  BrightnessCached!: CharacteristicValue;
  ColorTemperature!: CharacteristicValue;
  ColorTemperatureCached!: CharacteristicValue;

  // OpenAPI Others
  power: deviceStatus['power'];
  color: deviceStatus['color'];
  brightness: deviceStatus['brightness'];
  colorTemperature: deviceStatus['colorTemperature'];
  deviceStatus!: deviceStatusResponse;

  // BLE Others
  switchbot!: switchbot;

  // Config
  set_minStep?: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;
  adaptiveLightingShift?: number;

  // Adaptive Lighting
  AdaptiveLightingController?: ControllerConstructor | Controller<ControllerServiceMap>;
  minKelvin: number;
  maxKelvin: number;

  // Updates
  colorBulbUpdateInProgress!: boolean;
  doColorBulbUpdate!: Subject<void>;
  cacheKelvin!: number;

  constructor(private readonly platform: SwitchBotPlatform, private accessory: PlatformAccessory, public device: device & devicesConfig) {
    // default placeholders
    this.logs(device);
    this.refreshRate(device);
    this.adaptiveLighting(device);
    this.config(device);
    if (this.On === undefined) {
      this.On = false;
    } else {
      this.On = this.accessory.context.On;
    }
    this.Hue = 0;
    this.Brightness = 0;
    this.Saturation = 0;
    this.ColorTemperature = 140;
    this.minKelvin = 2000;
    this.maxKelvin = 9000;
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

    // get the Lightbulb service if it exists, otherwise create a new Lightbulb service
    // you can create multiple services for each accessory
    (this.service = accessory.getService(this.platform.Service.Lightbulb) || accessory.addService(this.platform.Service.Lightbulb)),
    `${accessory.displayName} Light Bulb`;

    if (this.adaptiveLightingShift === -1 && this.accessory.context.adaptiveLighting) {
      this.accessory.removeService(this.service);
      this.service = this.accessory.addService(this.platform.Service.Lightbulb);
      this.accessory.context.adaptiveLighting = false;
      this.debugLog(`Color Bulb: ${this.accessory.displayName} adaptiveLighting: ${this.accessory.context.adaptiveLighting}`);
    }

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Outlet, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // handle on / off events using the On characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On).onSet(this.OnSet.bind(this));

    // handle Brightness events using the Brightness characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.Brightness)
      .setProps({
        minStep: this.minStep(device),
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onGet(() => {
        return this.Brightness;
      })
      .onSet(this.BrightnessSet.bind(this));

    // handle ColorTemperature events using the ColorTemperature characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.ColorTemperature)
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
    this.service
      .getCharacteristic(this.platform.Characteristic.Hue)
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
    this.service
      .getCharacteristic(this.platform.Characteristic.Saturation)
      .setProps({
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onGet(() => {
        return this.Saturation;
      })
      .onSet(this.SaturationSet.bind(this));

    this.debugLog(`Color Bulb: ${this.accessory.displayName} adaptiveLightingShift: ${this.adaptiveLightingShift}`);
    if (this.adaptiveLightingShift !== -1) {
      this.AdaptiveLightingController = new platform.api.hap.AdaptiveLightingController(this.service, {
        customTemperatureAdjustment: this.adaptiveLightingShift,
      });
      this.accessory.configureController(this.AdaptiveLightingController);
      this.accessory.context.adaptiveLighting = true;
      this.debugLog(
        `Color Bulb: ${this.accessory.displayName} adaptiveLighting: ${this.accessory.context.adaptiveLighting},` +
          ` adaptiveLightingShift: ${this.adaptiveLightingShift}`,
      );
    }

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
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
          this.errorLog(`Color Bulb: ${this.accessory.displayName} failed pushChanges`);
          if (this.deviceLogging === 'debug') {
            this.errorLog(`Color Bulb: ${this.accessory.displayName} failed pushChanges,` + ` Error Message: ${JSON.stringify(e.message)}`);
          }
          if (this.platform.debugMode) {
            this.errorLog(`Color Bulb: ${this.accessory.displayName} failed pushChanges,` + ` Error: ${JSON.stringify(e)}`);
          }
          this.apiError(e);
        }
        this.colorBulbUpdateInProgress = false;
      });
  }

  parseStatus() {
    switch (this.power) {
      case 'on':
        this.On = true;
        break;
      default:
        this.On = false;
    }
    this.debugLog(`Color Bulb: ${this.accessory.displayName} On: ${this.On}`);

    // Brightness
    this.Brightness = Number(this.brightness);
    this.debugLog(`Color Bulb: ${this.accessory.displayName} Brightness: ${this.Brightness}`);

    // Color, Hue & Brightness
    if (this.color) {
      this.debugLog(`Color Bulb: ${this.accessory.displayName} color: ${JSON.stringify(this.color)}`);
      const [red, green, blue] = this.color!.split(':');
      this.debugLog(`Color Bulb: ${this.accessory.displayName} red: ${JSON.stringify(red)}`);
      this.debugLog(`Color Bulb: ${this.accessory.displayName} green: ${JSON.stringify(green)}`);
      this.debugLog(`Color Bulb: ${this.accessory.displayName} blue: ${JSON.stringify(blue)}`);

      const [hue, saturation] = rgb2hs(Number(red), Number(green), Number(blue));
      this.debugLog(`Color Bulb: ${this.accessory.displayName} hs: ${JSON.stringify(rgb2hs(Number(red), Number(green), Number(blue)))}`);

      // Hue
      this.Hue = hue;
      this.debugLog(`Color Bulb: ${this.accessory.displayName} Hue: ${this.Hue}`);

      // Saturation
      this.Saturation = saturation;
      this.debugLog(`Color Bulb: ${this.accessory.displayName} Saturation: ${this.Saturation}`);
    }

    // ColorTemperature
    if (!Number.isNaN(this.colorTemperature)) {
      this.debugLog(`Color Bulb: ${this.accessory.displayName} OpenAPI ColorTemperature: ${this.colorTemperature}`);
      const mired = Math.round(1000000 / this.colorTemperature!);

      this.ColorTemperature = Number(mired);

      this.ColorTemperature = Math.max(Math.min(this.ColorTemperature, 500), 140);
      this.debugLog(`Color Bulb: ${this.accessory.displayName} ColorTemperature: ${this.ColorTemperature}`);
    }
  }

  async refreshStatus() {
    try {
      this.deviceStatus = (await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)).data;
      this.debugLog(`Color Bulb: ${this.accessory.displayName} refreshStatus: ${JSON.stringify(this.deviceStatus)}`);
      this.power = this.deviceStatus.body.power;
      this.color = this.deviceStatus.body.color;
      this.brightness = this.deviceStatus.body.brightness;
      this.colorTemperature = this.deviceStatus.body.colorTemperature;
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.errorLog(`Color Bulb: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection`);
      if (this.deviceLogging === 'debug') {
        this.errorLog(
          `Color Bulb: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      if (this.platform.debugMode) {
        this.errorLog(`Color Bulb: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,` + ` Error: ${JSON.stringify(e)}`);
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
   * Strip Light  -    "command"            "turnOn"                   "default"                =        set to ON state |
   * Strip Light  -    "command"           "turnOff"                   "default"                =        set to OFF state |
   * Strip Light  -    "command"            "toggle"                   "default"                =        toggle state |
   * Strip Light  -    "command"        "setBrightness"               "`{1-100}`"               =        set brightness |
   * Strip Light  -    "command"          "setColor"           "`"{0-255}:{0-255}:{0-255}"`"    =        set RGB color value |
   *
   */
  async pushChanges() {
    try {
      if (this.On !== this.OnCached) {
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

        this.infoLog(
          `Color Bulb: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},` +
            ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`,
        );

        // Make the API request
        const push: any = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
        this.debugLog(`Color Bulb: ${this.accessory.displayName} pushChanges: ${JSON.stringify(push.data)}`);
        this.statusCode(push);
        this.OnCached = this.On;
        this.accessory.context.On = this.OnCached;
      }
      // Push Brightness Update
      if (this.On) {
        await this.pushBrightnessChanges();
      }

      // Push ColorTemperature Update
      if (this.On) {
        await this.pushColorTemperatureChanges();
      }

      // Push Hue & Saturation Update
      if (this.On) {
        await this.pushHueSaturationChanges();
      }
    } catch (e: any) {
      this.errorLog(`Color Bulb: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection`);
      if (this.deviceLogging === 'debug') {
        this.errorLog(
          `Color Bulb: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      if (this.platform.debugMode) {
        this.errorLog(`Color Bulb: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` + ` Error: ${JSON.stringify(e)}`);
      }
      this.apiError(e);
    }
  }

  private async pushHueSaturationChanges() {
    try {
      if (this.Hue !== this.HueCached || this.Saturation !== this.SaturationCached) {
        this.debugLog(`Color Bulb: ${this.accessory.displayName} Hue: ${JSON.stringify(this.Hue)}`);
        this.debugLog(`Color Bulb: ${this.accessory.displayName} Saturation: ${JSON.stringify(this.Saturation)}`);

        const [red, green, blue] = hs2rgb(Number(this.Hue), Number(this.Saturation));
        this.debugLog(`Color Bulb: ${this.accessory.displayName} rgb: ${JSON.stringify([red, green, blue])}`);

        const payload = {
          commandType: 'command',
          command: 'setColor',
          parameter: `${red}:${green}:${blue}`,
        } as payload;

        this.infoLog(
          `Color Bulb: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},` +
            ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`,
        );

        // Make the API request
        const push: any = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
        this.debugLog(`Color Bulb: ${this.accessory.displayName} pushChanges: ${JSON.stringify(push.data)}`);
        this.statusCode(push);
        this.HueCached = this.Hue;
        this.SaturationCached = this.Saturation;
      } else {
        this.debugLog(
          `Color Bulb: ${this.accessory.displayName} No Changes.` +
            `Hue: ${this.Hue}, HueCached: ${this.HueCached}, Saturation: ${this.Saturation}, SaturationCached: ${this.SaturationCached}`,
        );
      }
    } catch (e: any) {
      this.errorLog(`Color Bulb: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection`);
      if (this.deviceLogging === 'debug') {
        this.errorLog(
          `Color Bulb: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      if (this.platform.debugMode) {
        this.errorLog(`Color Bulb: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` + ` Error: ${JSON.stringify(e)}`);
      }
      this.apiError(e);
    }
  }

  private async pushColorTemperatureChanges() {
    try {
      if (this.ColorTemperature !== this.ColorTemperatureCached) {
        const kelvin = Math.round(1000000 / Number(this.ColorTemperature));
        this.cacheKelvin = kelvin;

        const payload = {
          commandType: 'command',
          command: 'setColorTemperature',
          parameter: `${kelvin}`,
        } as payload;

        this.infoLog(
          `Color Bulb: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},` +
            ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`,
        );

        // Make the API request
        const push: any = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
        this.debugLog(`Color Bulb: ${this.accessory.displayName} pushChanges: ${JSON.stringify(push.data)}`);
        this.statusCode(push);
        this.ColorTemperatureCached = this.ColorTemperature;
      } else {
        this.debugLog(
          `Color Bulb: ${this.accessory.displayName} No Changes.` +
            `ColorTemperature: ${this.ColorTemperature}, ColorTemperatureCached: ${this.ColorTemperatureCached}`,
        );
      }
    } catch (e: any) {
      this.errorLog(`Color Bulb: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection`);
      if (this.deviceLogging === 'debug') {
        this.errorLog(
          `Color Bulb: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      if (this.platform.debugMode) {
        this.errorLog(`Color Bulb: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` + ` Error: ${JSON.stringify(e)}`);
      }
      this.apiError(e);
    }
  }

  private async pushBrightnessChanges() {
    try {
      if (this.Brightness !== this.BrightnessCached) {
        const payload = {
          commandType: 'command',
          command: 'setBrightness',
          parameter: `${this.Brightness}`,
        } as payload;

        this.infoLog(
          `Color Bulb: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},` +
            ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`,
        );

        // Make the API request
        const push: any = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
        this.debugLog(`Color Bulb: ${this.accessory.displayName} pushChanges: ${JSON.stringify(push.data)}`);
        this.statusCode(push);
        this.BrightnessCached = this.Brightness;
      } else {
        this.debugLog(
          `Color Bulb: ${this.accessory.displayName} No Changes.` + `Brightness: ${this.Brightness}, BrightnessCached: ${this.BrightnessCached}`,
        );
      }
    } catch (e: any) {
      this.errorLog(`Color Bulb: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection`);
      if (this.deviceLogging === 'debug') {
        this.errorLog(
          `Color Bulb: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      if (this.platform.debugMode) {
        this.errorLog(`Color Bulb: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` + ` Error: ${JSON.stringify(e)}`);
      }
      this.apiError(e);
    }
  }

  updateHomeKitCharacteristics() {
    if (this.On === undefined) {
      this.debugLog(`Color Bulb: ${this.accessory.displayName} On: ${this.On}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.On, this.On);
      this.debugLog(`Color Bulb: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
    }
    if (this.Brightness === undefined) {
      this.debugLog(`Color Bulb: ${this.accessory.displayName} Brightness: ${this.Brightness}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.Brightness, this.Brightness);
      this.debugLog(`Color Bulb: ${this.accessory.displayName} updateCharacteristic Brightness: ${this.Brightness}`);
    }
    if (this.ColorTemperature === undefined) {
      this.debugLog(`Color Bulb: ${this.accessory.displayName} ColorTemperature: ${this.ColorTemperature}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.ColorTemperature, this.ColorTemperature);
      this.debugLog(`Color Bulb: ${this.accessory.displayName} updateCharacteristic ColorTemperature: ${this.ColorTemperature}`);
    }
    if (this.Hue === undefined) {
      this.debugLog(`Color Bulb: ${this.accessory.displayName} Hue: ${this.Hue}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.Hue, this.Hue);
      this.debugLog(`Color Bulb: ${this.accessory.displayName} updateCharacteristic Hue: ${this.Hue}`);
    }
    if (this.Saturation === undefined) {
      this.debugLog(`Color Bulb: ${this.accessory.displayName} Saturation: ${this.Saturation}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.Saturation, this.Saturation);
      this.debugLog(`Color Bulb: ${this.accessory.displayName} updateCharacteristic Saturation: ${this.Saturation}`);
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.On, e);
    this.service.updateCharacteristic(this.platform.Characteristic.Hue, e);
    this.service.updateCharacteristic(this.platform.Characteristic.Brightness, e);
    this.service.updateCharacteristic(this.platform.Characteristic.Saturation, e);
    this.service.updateCharacteristic(this.platform.Characteristic.ColorTemperature, e);
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  private statusCode(push: AxiosResponse<{ statusCode: number }>) {
    switch (push.data.statusCode) {
      case 151:
        this.errorLog(`Color Bulb: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.errorLog(`Color Bulb: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.errorLog(`Color Bulb: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.errorLog(`Color Bulb: ${this.accessory.displayName} Device is offline.`);
        this.offlineOff();
        break;
      case 171:
        this.errorLog(`Color Bulb: ${this.accessory.displayName} is offline. Hub: ${this.device.hubDeviceId}`);
        this.offlineOff();
        break;
      case 190:
        this.errorLog(
          `Color Bulb: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
            ` Or command: ${JSON.stringify(push.data)} format is invalid`,
        );
        break;
      case 100:
        if (this.platform.debugMode) {
          this.debugLog(`Color Bulb: ${this.accessory.displayName} Command successfully sent.`);
        }
        break;
      default:
        if (this.platform.debugMode) {
          this.debugLog(`Color Bulb: ${this.accessory.displayName} Unknown statusCode.`);
        }
    }
  }

  offlineOff() {
    if (this.device.offline) {
      this.On = false;
      this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(this.On);
    }
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  OnSet(value: CharacteristicValue) {
    this.debugLog(`Color Bulb: ${this.accessory.displayName} On: ${value}`);

    this.On = value;
    this.doColorBulbUpdate.next();
  }

  /**
   * Handle requests to set the value of the "Brightness" characteristic
   */
  BrightnessSet(value: CharacteristicValue) {
    this.debugLog(`Color Bulb: ${this.accessory.displayName} Brightness: ${value}`);

    this.Brightness = value;
    this.doColorBulbUpdate.next();
  }

  /**
   * Handle requests to set the value of the "ColorTemperature" characteristic
   */
  ColorTemperatureSet(value: CharacteristicValue) {
    this.debugLog(`Color Bulb: ${this.accessory.displayName} ColorTemperature: ${value}`);

    // Convert mired to kelvin to nearest 100 (SwitchBot seems to need this)
    const kelvin = Math.round(1000000 / Number(value) / 100) * 100;

    // Check and increase/decrease kelvin to range of device
    const k = Math.min(Math.max(kelvin, this.minKelvin), this.maxKelvin);

    if (!this.OnCached || this.cacheKelvin === k) {
      return;
    }

    // Updating the hue/sat to the corresponding values mimics native adaptive lighting
    const hs = m2hs(value);
    this.service.updateCharacteristic(this.platform.Characteristic.Hue, hs[0]);
    this.service.updateCharacteristic(this.platform.Characteristic.Saturation, hs[1]);

    this.ColorTemperature = value;
    this.doColorBulbUpdate.next();
  }

  /**
   * Handle requests to set the value of the "Hue" characteristic
   */
  HueSet(value: CharacteristicValue) {
    this.debugLog(`Color Bulb: ${this.accessory.displayName} Hue: ${value}`);

    this.service.updateCharacteristic(this.platform.Characteristic.ColorTemperature, 140);

    this.Hue = value;
    this.doColorBulbUpdate.next();
  }

  /**
   * Handle requests to set the value of the "Saturation" characteristic
   */
  SaturationSet(value: CharacteristicValue) {
    this.debugLog(`Color Bulb: ${this.accessory.displayName} Saturation: ${value}`);

    this.service.updateCharacteristic(this.platform.Characteristic.ColorTemperature, 140);

    this.Saturation = value;
    this.doColorBulbUpdate.next();
  }

  config(device: device & devicesConfig) {
    let config = {};
    if (device.colorbulb) {
      config = device.colorbulb;
    }
    if (device.ble) {
      config['ble'] = device.ble;
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
    if (device.offline !== undefined) {
      config['offline'] = device.offline;
    }
    if (Object.entries(config).length !== 0) {
      this.warnLog(`Color Bulb: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  refreshRate(device: device & devicesConfig) {
    if (device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = device.refreshRate;
      this.debugLog(`Color Bulb: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options!.refreshRate;
      this.debugLog(`Color Bulb: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
    }
  }

  logs(device: device & devicesConfig) {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugLog(`Color Bulb: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(`Color Bulb: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      this.debugLog(`Color Bulb: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugLog(`Color Bulb: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
    }
  }

  adaptiveLighting(device: device & devicesConfig) {
    if (device.colorbulb?.adaptiveLightingShift) {
      this.adaptiveLightingShift = device.colorbulb.adaptiveLightingShift;
      this.debugLog(`Color Bulb: ${this.accessory.displayName} adaptiveLightingShift: ${this.adaptiveLightingShift}`);
    } else {
      this.adaptiveLightingShift = 0;
      this.debugLog(`Color Bulb: ${this.accessory.displayName} adaptiveLightingShift: ${this.adaptiveLightingShift}`);
    }
  }

  minStep(device: device & devicesConfig): number {
    if (device.colorbulb?.set_minStep) {
      this.set_minStep = device.colorbulb?.set_minStep;
    } else {
      this.set_minStep = 1;
    }
    return this.set_minStep;
  }

  /**
   * Logging for Device
   */
  infoLog(...log: any[]) {
    if (this.enablingDeviceLogging()) {
      this.platform.log.info(String(...log));
    }
  }

  warnLog(...log: any[]) {
    if (this.enablingDeviceLogging()) {
      this.platform.log.warn(String(...log));
    }
  }

  errorLog(...log: any[]) {
    if (this.enablingDeviceLogging()) {
      this.platform.log.error(String(...log));
    }
  }

  debugLog(...log: any[]) {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging === 'debug') {
        this.platform.log.info('[DEBUG]', String(...log));
      } else {
        this.platform.log.debug(String(...log));
      }
    }
  }

  enablingDeviceLogging(): boolean {
    return this.deviceLogging === 'debug' || this.deviceLogging === 'standard';
  }
}
