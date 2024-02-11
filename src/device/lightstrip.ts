import { request } from 'undici';
import { sleep } from '../utils.js';
import { interval, Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform.js';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';
import {
  Service, PlatformAccessory, CharacteristicValue, ControllerConstructor, Controller, ControllerServiceMap, API, Logging, HAP,
} from 'homebridge';
import { device, devicesConfig, hs2rgb, rgb2hs, deviceStatus, serviceData, m2hs, Devices, SwitchBotPlatformConfig } from '../settings.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class StripLight {
  public readonly api: API;
  public readonly log: Logging;
  public readonly config!: SwitchBotPlatformConfig;
  protected readonly hap: HAP;
  // Services
  lightBulbService!: Service;

  // Characteristic Values
  On!: CharacteristicValue;
  Hue!: CharacteristicValue;
  Saturation!: CharacteristicValue;
  Brightness!: CharacteristicValue;
  FirmwareRevision!: CharacteristicValue;
  ColorTemperature?: CharacteristicValue;

  // OpenAPI Status
  OpenAPI_On: deviceStatus['power'];
  OpenAPI_RGB: deviceStatus['color'];
  OpenAPI_Brightness: deviceStatus['brightness'];
  OpenAPI_FirmwareRevision: deviceStatus['version'];

  // BLE Status
  BLE_On: serviceData['state'];
  BLE_Brightness: serviceData['brightness'];

  // BLE Others
  BLE_IsConnected?: boolean;

  // Config
  set_minStep?: number;
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;
  adaptiveLightingShift?: number;

  // Adaptive Lighting
  AdaptiveLightingController?: ControllerConstructor | Controller<ControllerServiceMap>;
  minKelvin!: number;
  maxKelvin!: number;

  // Others
  cacheKelvin!: number;
  change!: string;

  // Updates
  stripLightUpdateInProgress!: boolean;
  doStripLightUpdate!: Subject<void>;

  // Connection
  private readonly OpenAPI: boolean;
  private readonly BLE: boolean;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device & devicesConfig,
  ) {
    this.api = this.platform.api;
    this.log = this.platform.log;
    this.config = this.platform.config;
    this.hap = this.api.hap;
    // Connection
    this.BLE = this.device.connectionType === 'BLE' || this.device.connectionType === 'BLE/OpenAPI';
    this.OpenAPI = this.device.connectionType === 'OpenAPI' || this.device.connectionType === 'BLE/OpenAPI';
    // default placeholders
    this.deviceLogs(device);
    this.scan(device);
    this.refreshRate(device);
    this.deviceContext();
    this.deviceConfig(device);

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doStripLightUpdate = new Subject();
    this.stripLightUpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.hap.Characteristic.Model, 'W1701100')
      .setCharacteristic(this.hap.Characteristic.SerialNumber, device.deviceId)
      .setCharacteristic(this.hap.Characteristic.FirmwareRevision, accessory.context.FirmwareRevision);

    // get the Lightbulb service if it exists, otherwise create a new Lightbulb service
    // you can create multiple services for each accessory
    const lightBulbService = `${accessory.displayName} ${device.deviceType}`;
    (this.lightBulbService = accessory.getService(this.hap.Service.Lightbulb)
      || accessory.addService(this.hap.Service.Lightbulb)), lightBulbService;

    if (this.adaptiveLightingShift === -1 && this.accessory.context.adaptiveLighting) {
      this.accessory.removeService(this.lightBulbService);
      this.lightBulbService = this.accessory.addService(this.hap.Service.Lightbulb);
      this.accessory.context.adaptiveLighting = false;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} adaptiveLighting: ${this.accessory.context.adaptiveLighting}`);
    }

    this.lightBulbService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
    if (!this.lightBulbService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
      this.lightBulbService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
    }
    // handle on / off events using the On characteristic
    this.lightBulbService.getCharacteristic(this.hap.Characteristic.On).onSet(this.OnSet.bind(this));

    // handle Brightness events using the Brightness characteristic
    this.lightBulbService
      .getCharacteristic(this.hap.Characteristic.Brightness)
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
    this.lightBulbService
      .getCharacteristic(this.hap.Characteristic.ColorTemperature)
      .setProps({
        minValue: 140,
        maxValue: 500,
        validValueRanges: [140, 500],
      })
      .onGet(() => {
        return this.ColorTemperature!;
      })
      .onSet(this.ColorTemperatureSet.bind(this));

    // handle Hue events using the Hue characteristic
    this.lightBulbService
      .getCharacteristic(this.hap.Characteristic.Hue)
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
    this.lightBulbService
      .getCharacteristic(this.hap.Characteristic.Saturation)
      .setProps({
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onGet(() => {
        return this.Saturation;
      })
      .onSet(this.SaturationSet.bind(this));

    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} adaptiveLightingShift: ${this.adaptiveLightingShift}`);
    if (this.adaptiveLightingShift !== -1) {
      this.AdaptiveLightingController = new platform.api.hap.AdaptiveLightingController(this.lightBulbService, {
        customTemperatureAdjustment: this.adaptiveLightingShift,
      });
      this.accessory.configureController(this.AdaptiveLightingController);
      this.accessory.context.adaptiveLighting = true;
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} adaptiveLighting: ${this.accessory.context.adaptiveLighting},` +
        ` adaptiveLightingShift: ${this.adaptiveLightingShift}`,
      );
    }

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.stripLightUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    //regisiter webhook event handler
    if (this.device.webhook) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} is listening webhook.`);
      this.platform.webhookEventHandler[this.device.deviceId] = async (context) => {
        try {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} received Webhook: ${JSON.stringify(context)}`);
          const { powerState, brightness, color, colorTemperature } = context;
          const { On, Brightness, Hue, Saturation, ColorTemperature } = this;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ` +
            '(powerState, brightness, color, colorTemperature) = ' +
            `Webhook:(${powerState}, ${brightness}, ${color}, ${colorTemperature}), ` +
            `current:(${On}, ${Brightness}, ${Hue}, ${Saturation}, ${ColorTemperature})`);
          this.On = powerState === 'ON' ? true : false;
          this.Brightness = brightness;

          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} color: ${JSON.stringify(color)}`);
          const [red, green, blue] = color!.split(':');
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} red: ${JSON.stringify(red)}`);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} green: ${JSON.stringify(green)}`);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} blue: ${JSON.stringify(blue)}`);

          const [hue, saturation] = rgb2hs(Number(red), Number(green), Number(blue));
          this.debugLog(
            `${this.device.deviceType}: ${this.accessory.displayName}` + ` hs: ${JSON.stringify(rgb2hs(Number(red), Number(green), Number(blue)))}`,
          );

          // Hue
          this.Hue = hue;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Hue: ${this.Hue}`);

          // Saturation
          this.Saturation = saturation;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Saturation: ${this.Saturation}`);

          this.updateHomeKitCharacteristics();
        } catch (e: any) {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`);
        }
      };
    }

    // Watch for Bulb change events
    // We put in a debounce of 1000ms so we don't make duplicate calls
    this.doStripLightUpdate
      .pipe(
        tap(() => {
          this.stripLightUpdateInProgress = true;
        }),
        debounceTime(this.platform.config.options!.pushRate! * 1000),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges();
        } catch (e: any) {
          this.apiError(e);
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType} Connection,` +
            ` Error Message: ${JSON.stringify(e.message)}`,
          );
        }
        this.stripLightUpdateInProgress = false;
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
      this.debugWarnLog(
        `${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` + ` ${this.device.connectionType}, parseStatus will not happen.`,
      );
    }
  }

  async BLEparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);
    // State
    switch (this.BLE_On) {
      case 'on':
        this.On = true;
        break;
      default:
        this.On = false;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
  }

  async openAPIparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
    switch (this.OpenAPI_On) {
      case 'on':
        this.On = true;
        break;
      default:
        this.On = false;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);

    // Brightness
    this.Brightness = Number(this.OpenAPI_Brightness);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Brightness: ${this.Brightness}`);

    // Color, Hue & Brightness
    if (this.OpenAPI_RGB) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} color: ${JSON.stringify(this.OpenAPI_RGB)}`);
      const [red, green, blue] = this.OpenAPI_RGB!.split(':');
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} red: ${JSON.stringify(red)}`);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} green: ${JSON.stringify(green)}`);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} blue: ${JSON.stringify(blue)}`);

      const [hue, saturation] = rgb2hs(Number(red), Number(green), Number(blue));
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName}` + ` hs: ${JSON.stringify(rgb2hs(Number(red), Number(green), Number(blue)))}`,
      );

      // Hue
      this.Hue = hue;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Hue: ${this.Hue}`);

      // Saturation
      this.Saturation = saturation;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Saturation: ${this.Saturation}`);
    }

    // FirmwareRevision
    this.FirmwareRevision = this.OpenAPI_FirmwareRevision!;
    this.accessory.context.FirmwareRevision = this.FirmwareRevision;
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} refreshStatus enableCloudService: ${this.device.enableCloudService}`);
    } else if (this.BLE) {
      await this.BLERefreshStatus();
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIRefreshStatus();
    } else {
      await this.offlineOff();
      this.debugWarnLog(
        `${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` +
        ` ${this.device.connectionType}, refreshStatus will not happen.`,
      );
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
    (async () => {
      // Start to monitor advertisement packets
      await switchbot.startScan({
        model: 'r',
        id: this.device.bleMac,
      });
      // Set an event handler
      switchbot.onadvertisement = (ad: any) => {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ${JSON.stringify(ad, null, '  ')}`);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} address: ${ad.address}, model: ${ad.serviceData.model}`);
        if (this.device.bleMac === ad.address && ad.serviceData.model === 'r') {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        } else {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        }
      };
      // Wait 1 seconds
      await switchbot.wait(this.scanDuration * 1000);
      // Stop to monitor
      await switchbot.stopScan();
      // Update HomeKit
      await this.BLEparseStatus();
      await this.updateHomeKitCharacteristics();
    })();
    /*if (switchbot !== false) {
      switchbot
        .startScan({
          model: 'r',
          id: this.device.bleMac,
        })
        .then(async () => {
          // Set an event handler
          switchbot.onadvertisement = async (ad: ad) => {
            this.debugLog(
              `${this.device.deviceType}: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac},` +
              ` BLE Address Found: ${ad.address}`,
            );
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
            this.debugLog(
              `${this.device.deviceType}: ${this.accessory.displayName} state: ${ad.serviceData.state}, ` +
                `delay: ${ad.serviceData.delay}, timer: ${ad.serviceData.timer}, syncUtcTime: ${ad.serviceData.syncUtcTime} ` +
                `wifiRssi: ${ad.serviceData.wifiRssi}, overload: ${ad.serviceData.overload}, currentPower: ${ad.serviceData.currentPower}`,
            );

            if (ad.serviceData) {
              this.BLE_IsConnected = true;
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.BLE_IsConnected}`);
              await this.stopScanning(switchbot);
            } else {
              this.BLE_IsConnected = false;
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.BLE_IsConnected}`);
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
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed BLERefreshStatus with ${this.device.connectionType}` +
            ` Connection, Error Message: ${JSON.stringify(e.message)}`,
          );
          await this.BLERefreshConnection(switchbot);
        });
    } else {
      await this.BLERefreshConnection(switchbot);
    }*/
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode } = await request(`${Devices}/${this.device.deviceId}/status`, {
        headers: this.platform.generateHeaders(),
      });
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
      const deviceStatus: any = await body.json();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
      if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
        this.debugErrorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
        this.OpenAPI_On = deviceStatus.body.power;
        this.OpenAPI_RGB = deviceStatus.body.color;
        this.OpenAPI_Brightness = deviceStatus.body.brightness;
        this.OpenAPI_FirmwareRevision = deviceStatus.body.version;
        this.openAPIparseStatus();
        this.updateHomeKitCharacteristics();
      } else {
        this.statusCode(statusCode);
        this.statusCode(deviceStatus.statusCode);
      }
    } catch (e: any) {
      this.apiError(e);
      this.errorLog(
        `${this.device.deviceType}: ${this.accessory.displayName} failed openAPIRefreshStatus with ${this.device.connectionType}` +
        ` Connection, Error Message: ${JSON.stringify(e.message)}`,
      );
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	      commandType	          Command	               command parameter	                     Description
   * Strip Light  -    "command"            "turnOn"                   "default"                =        set to ON state |
   * Strip Light  -    "command"           "turnOff"                   "default"                =        set to OFF state |
   * Strip Light  -    "command"            "toggle"                   "default"                =        toggle state |
   * Strip Light  -    "command"        "setBrightness"               "`{1-100}`"               =        set brightness |
   * Strip Light  -    "command"          "setColor"           "`"{0-255}:{0-255}:{0-255}"`"    =        set RGB color value |
   *
   */
  async pushChanges(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} pushChanges enableCloudService: ${this.device.enableCloudService}`);
      /* }else if (this.BLE) {
        await this.BLEpushChanges();*/
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges();
    } else {
      await this.offlineOff();
      this.debugWarnLog(
        `${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` + ` ${this.device.connectionType}, pushChanges will not happen.`,
      );
    }
    // Refresh the status from the API
    interval(15000)
      .pipe(skipWhile(() => this.stripLightUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus();
      });
  }

  async BLEpushChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges`);
    if (this.On !== this.accessory.context.On) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges On: ${this.On} OnCached: ${this.accessory.context.On}`);
      const switchbot = await this.platform.connectBLE();
      // Convert to BLE Address
      this.device.bleMac = this.device
        .deviceId!.match(/.{1,2}/g)!
        .join(':')
        .toLowerCase();
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
      switchbot
        .discover({
          model: 'r',
          id: this.device.bleMac,
        })
        .then(async (device_list: any) => {
          this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
          return await this.retry({
            max: this.maxRetry(),
            fn: async () => {
              if (this.On) {
                return await device_list[0].turnOn({ id: this.device.bleMac });
              } else {
                return await device_list[0].turnOff({ id: this.device.bleMac });
              }
            },
          });
        })
        .then(() => {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
          this.On = false;
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}` +
            ` Connection, Error Message: ${JSON.stringify(e.message)}`,
          );
          await this.BLEPushConnection();
        });
      // Push Brightness Update
      if (this.On) {
        await this.BLEpushBrightnessChanges();
      }
      // Push Hue & Saturation Update
      if (this.On) {
        await this.BLEpushRGBChanges();
      }
    } else {
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} No BLEpushChanges.` + `On: ${this.On}, ` + `OnCached: ${this.accessory.context.On}`,
      );
    }
  }

  async BLEpushBrightnessChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushBrightnessChanges`);
    if (this.Brightness !== this.accessory.context.Brightness) {
      const switchbot = await this.platform.connectBLE();
      // Convert to BLE Address
      this.device.bleMac = this.device
        .deviceId!.match(/.{1,2}/g)!
        .join(':')
        .toLowerCase();
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
      switchbot
        .discover({
          model: 'u',
          id: this.device.bleMac,
        })
        .then(async (device_list: any) => {
          this.infoLog(`${this.accessory.displayName} Target Brightness: ${this.Brightness}`);
          return await device_list[0].setBrightness(this.Brightness);
        })
        .then(() => {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
          this.On = false;
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushBrightnessChanges with ${this.device.connectionType}` +
            ` Connection, Error Message: ${JSON.stringify(e.message)}`,
          );
          await this.BLEPushConnection();
        });
    } else {
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} No BLEpushBrightnessChanges.` +
        `Brightness: ${this.Brightness}, ` +
        `BrightnessCached: ${this.accessory.context.Brightness}`,
      );
    }
  }

  async BLEpushRGBChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushRGBChanges`);
    if (this.Hue !== this.accessory.context.Hue || this.Saturation !== this.accessory.context.Saturation) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Hue: ${JSON.stringify(this.Hue)}`);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Saturation: ${JSON.stringify(this.Saturation)}`);

      const [red, green, blue] = hs2rgb(Number(this.Hue), Number(this.Saturation));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} rgb: ${JSON.stringify([red, green, blue])}`);

      const switchbot = await this.platform.connectBLE();
      // Convert to BLE Address
      this.device.bleMac = this.device
        .deviceId!.match(/.{1,2}/g)!
        .join(':')
        .toLowerCase();
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
      switchbot
        .discover({
          model: 'u',
          id: this.device.bleMac,
        })
        .then(async (device_list: any) => {
          this.infoLog(`${this.accessory.displayName} Target RGB: ${(this.Brightness, red, green, blue)}`);
          return await device_list[0].setRGB(this.Brightness, red, green, blue);
        })
        .then(() => {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
          this.On = false;
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushRGBChanges with ${this.device.connectionType}` +
            ` Connection, Error Message: ${JSON.stringify(e.message)}`,
          );
          await this.BLEPushConnection();
        });
    } else {
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} No BLEpushRGBChanges. Hue: ${this.Hue}, ` +
        `HueCached: ${this.accessory.context.Hue}, Saturation: ${this.Saturation}, SaturationCached: ${this.accessory.context.Saturation}`,
      );
    }
  }

  async openAPIpushChanges() {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);
    if (this.On !== this.accessory.context.On) {
      const command = this.On ? 'turnOn' : 'turnOff';
      /*if (this.On) {
          command = 'turnOn';
        } else {
          command = 'turnOff';
        }*/
      const bodyChange = JSON.stringify({
        command: `${command}`,
        parameter: 'default',
        commandType: 'command',
      });
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
        const deviceStatus: any = await body.json();
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus body: ${JSON.stringify(deviceStatus.body)}`);
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          this.debugErrorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
        } else {
          this.statusCode(statusCode);
          this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} failed openAPIpushChanges with ${this.device.connectionType}` +
          ` Connection, Error Message: ${JSON.stringify(e.message)}`,
        );
      }
    } else {
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} No openAPIpushChanges.` +
        `On: ${this.On}, ` +
        `OnCached: ${this.accessory.context.On}`,
      );
    }
    // Push Hue & Saturation Update
    if (this.On) {
      await this.pushHueSaturationChanges();
    }
    // Push Brightness Update
    if (this.On) {
      await this.pushBrightnessChanges();
    }
  }

  async pushHueSaturationChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} pushHueSaturationChanges`);
    if (this.Hue !== this.accessory.context.Hue || this.Saturation !== this.accessory.context.Saturation) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Hue: ${JSON.stringify(this.Hue)}`);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Saturation: ${JSON.stringify(this.Saturation)}`);
      const [red, green, blue] = hs2rgb(Number(this.Hue), Number(this.Saturation));
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} rgb: ${JSON.stringify([red, green, blue])}`);
      // Make Push On request to the API
      const bodyChange = JSON.stringify({
        command: 'setColor',
        parameter: `${red}:${green}:${blue}`,
        commandType: 'command',
      });
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
        const deviceStatus: any = await body.json();
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus body: ${JSON.stringify(deviceStatus.body)}`);
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          this.debugErrorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
        } else {
          this.statusCode(statusCode);
          this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} failed pushHueSaturationChanges with ${this.device.connectionType}` +
          ` Connection, Error Message: ${JSON.stringify(e.message)}`,
        );
      }
    } else {
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} No pushHueSaturationChanges. Hue: ${this.Hue}, ` +
        `HueCached: ${this.accessory.context.Hue}, Saturation: ${this.Saturation}, SaturationCached: ${this.accessory.context.Saturation}`,
      );
    }
  }

  async pushBrightnessChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} pushBrightnessChanges`);
    if (this.Brightness !== this.accessory.context.Brightness) {
      const bodyChange = JSON.stringify({
        command: 'setBrightness',
        parameter: `${this.Brightness}`,
        commandType: 'command',
      });
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
        const deviceStatus: any = await body.json();
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus body: ${JSON.stringify(deviceStatus.body)}`);
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          this.debugErrorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
        } else {
          this.statusCode(statusCode);
          this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} failed pushBrightnessChanges with ${this.device.connectionType}` +
          ` Connection, Error Message: ${JSON.stringify(e.message)}`,
        );
      }
    } else {
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} No pushBrightnessChanges,` +
        `Brightness: ${this.Brightness}, ` +
        `BrightnessCached: ${this.accessory.context.Brightness}`,
      );
    }
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    if (this.On === this.accessory.context.On) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set On: ${value}`);
    } else {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set On: ${value}`);
    }

    this.On = value;
    this.doStripLightUpdate.next();
  }

  /**
   * Handle requests to set the value of the "Brightness" characteristic
   */
  async BrightnessSet(value: CharacteristicValue): Promise<void> {
    if (this.Brightness === this.accessory.context.Brightness) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set Brightness: ${value}`);
    } else if (this.On) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Brightness: ${value}`);
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Brightness: ${value}`);
    }

    this.Brightness = value;
    this.doStripLightUpdate.next();
  }

  /**
   * Handle requests to set the value of the "ColorTemperature" characteristic
   */
  async ColorTemperatureSet(value: CharacteristicValue): Promise<void> {
    if (this.ColorTemperature === this.accessory.context.ColorTemperature) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set ColorTemperature: ${value}`);
    } else if (this.On) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set ColorTemperature: ${value}`);
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Set ColorTemperature: ${value}`);
    }

    // Convert mired to kelvin to nearest 100 (SwitchBot seems to need this)
    const kelvin = Math.round(1000000 / Number(value) / 100) * 100;

    // Check and increase/decrease kelvin to range of device
    const k = Math.min(Math.max(kelvin, this.minKelvin), this.maxKelvin);

    if (!this.accessory.context.On || this.cacheKelvin === k) {
      return;
    }

    // Updating the hue/sat to the corresponding values mimics native adaptive lighting
    const hs = m2hs(value);
    this.lightBulbService.updateCharacteristic(this.hap.Characteristic.Hue, hs[0]);
    this.lightBulbService.updateCharacteristic(this.hap.Characteristic.Saturation, hs[1]);

    this.ColorTemperature = value;
    this.doStripLightUpdate.next();
  }

  /**
   * Handle requests to set the value of the "Hue" characteristic
   */
  async HueSet(value: CharacteristicValue): Promise<void> {
    if (this.Hue === this.accessory.context.Hue) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set Hue: ${value}`);
    } else if (this.On) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Hue: ${value}`);
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Hue: ${value}`);
    }

    this.lightBulbService.updateCharacteristic(this.hap.Characteristic.ColorTemperature, 140);

    this.Hue = value;
    this.doStripLightUpdate.next();
  }

  /**
   * Handle requests to set the value of the "Saturation" characteristic
   */
  async SaturationSet(value: CharacteristicValue): Promise<void> {
    if (this.Saturation === this.accessory.context.Saturation) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set Saturation: ${value}`);
    } else if (this.On) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Saturation: ${value}`);
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Saturation: ${value}`);
    }

    this.lightBulbService.updateCharacteristic(this.hap.Characteristic.ColorTemperature, 140);

    this.Saturation = value;
    this.doStripLightUpdate.next();
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    // On
    if (this.On === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
    } else {
      this.accessory.context.On = this.On;
      this.lightBulbService.updateCharacteristic(this.hap.Characteristic.On, this.On);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
    }
    // Brightness
    if (this.Brightness === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Brightness: ${this.Brightness}`);
    } else {
      this.accessory.context.Brightness = this.Brightness;
      this.lightBulbService.updateCharacteristic(this.hap.Characteristic.Brightness, this.Brightness);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Brightness: ${this.Brightness}`);
    }
    // ColorTemperature
    if (this.ColorTemperature === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ColorTemperature: ${this.ColorTemperature}`);
    } else {
      this.accessory.context.ColorTemperature = this.ColorTemperature;
      this.lightBulbService.updateCharacteristic(this.hap.Characteristic.ColorTemperature, this.ColorTemperature);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic ColorTemperature: ${this.ColorTemperature}`);
    }
    // Hue
    if (this.Hue === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Hue: ${this.Hue}`);
    } else {
      this.accessory.context.Hue = this.Hue;
      this.lightBulbService.updateCharacteristic(this.hap.Characteristic.Hue, this.Hue);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Hue: ${this.Hue}`);
    }
    // Saturation
    if (this.Saturation === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Saturation: ${this.Saturation}`);
    } else {
      this.accessory.context.Saturation = this.Saturation;
      this.lightBulbService.updateCharacteristic(this.hap.Characteristic.Saturation, this.Saturation);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Saturation: ${this.Saturation}`);
    }
  }

  async stopScanning(switchbot: any) {
    switchbot.stopScan();
    if (this.BLE_IsConnected) {
      await this.BLEparseStatus();
      await this.updateHomeKitCharacteristics();
    } else {
      await this.BLERefreshConnection(switchbot);
    }
  }

  async getCustomBLEAddress(switchbot: any) {
    if (this.device.customBLEaddress && this.deviceLogging.includes('debug')) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} customBLEaddress: ${this.device.customBLEaddress}`);
      (async () => {
        // Start to monitor advertisement packets
        await switchbot.startScan({
          model: 'r',
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
    this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot:`
      + ` ${JSON.stringify(switchbot)}`);
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Refresh Status`);
      await this.openAPIRefreshStatus();
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

  minStep(device: device & devicesConfig): number {
    if (device.striplight?.set_minStep) {
      this.set_minStep = device.striplight?.set_minStep;
    } else {
      this.set_minStep = 1;
    }
    return this.set_minStep;
  }

  async adaptiveLighting(device: device & devicesConfig): Promise<void> {
    if (device.striplight?.adaptiveLightingShift) {
      this.adaptiveLightingShift = device.striplight.adaptiveLightingShift;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} adaptiveLightingShift: ${this.adaptiveLightingShift}`);
    } else {
      this.adaptiveLightingShift = 0;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} adaptiveLightingShift: ${this.adaptiveLightingShift}`);
    }
  }

  async scan(device: device & devicesConfig): Promise<void> {
    if (device.scanDuration) {
      this.scanDuration = this.accessory.context.scanDuration = device.scanDuration;
      if (this.BLE) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config scanDuration: ${this.scanDuration}`);
      }
    } else {
      this.scanDuration = this.accessory.context.scanDuration = 1;
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
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} Hub Device is offline, statusCode: ${statusCode}. ` +
          `Hub: ${this.device.hubDeviceId}`,
        );
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
      case 400:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Bad Request, The client has issued an invalid request. `
            + `This is commonly used to specify validation errors in a request payload, statusCode: ${statusCode}`);
        break;
      case 401:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Unauthorized,	Authorization for the API is required, `
            + `but the request has not been authenticated, statusCode: ${statusCode}`);
        break;
      case 403:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Forbidden,	The request has been authenticated but does not `
            + `have appropriate permissions, or a requested resource is not found, statusCode: ${statusCode}`);
        break;
      case 404:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Not Found,	Specifies the requested path does not exist, `
        + `statusCode: ${statusCode}`);
        break;
      case 406:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Not Acceptable,	The client has requested a MIME type via `
            + `the Accept header for a value not supported by the server, statusCode: ${statusCode}`);
        break;
      case 415:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Unsupported Media Type,	The client has defined a contentType `
            + `header that is not supported by the server, statusCode: ${statusCode}`);
        break;
      case 422:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Unprocessable Entity,	The client has made a valid request, `
            + `but the server cannot process it. This is often used for APIs for which certain limits have been exceeded, statusCode: ${statusCode}`);
        break;
      case 429:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Too Many Requests,	The client has exceeded the number of `
            + `requests allowed for a given time window, statusCode: ${statusCode}`);
        break;
      case 500:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Internal Server Error,	An unexpected error on the SmartThings `
            + `servers has occurred. These errors should be rare, statusCode: ${statusCode}`);
        break;
      default:
        this.infoLog(
          `${this.device.deviceType}: ${this.accessory.displayName} Unknown statusCode: ` +
          `${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`,
        );
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      await this.deviceContext();
      await this.updateHomeKitCharacteristics();
    }
  }

  apiError(e: any): void {
    this.lightBulbService.updateCharacteristic(this.hap.Characteristic.On, e);
    this.lightBulbService.updateCharacteristic(this.hap.Characteristic.Hue, e);
    this.lightBulbService.updateCharacteristic(this.hap.Characteristic.Brightness, e);
    this.lightBulbService.updateCharacteristic(this.hap.Characteristic.Saturation, e);
  }

  async deviceContext() {
    if (this.On === undefined) {
      this.On = false;
    } else {
      this.On = this.accessory.context.On;
    }
    if (this.Hue === undefined) {
      this.Hue = 0;
    } else {
      this.Hue = this.accessory.context.Hue;
    }
    if (this.Brightness === undefined) {
      this.Brightness = 0;
    } else {
      this.Brightness = this.accessory.context.Brightness;
    }
    if (this.Saturation === undefined) {
      this.Saturation = 0;
    } else {
      this.Saturation = this.accessory.context.Saturation;
    }
    if (this.ColorTemperature === undefined) {
      this.ColorTemperature = 140;
    } else {
      this.ColorTemperature = this.accessory.context.ColorTemperature;
    }
    this.minKelvin = 2000;
    this.maxKelvin = 9000;
    if (this.FirmwareRevision === undefined) {
      this.FirmwareRevision = this.platform.version;
      this.accessory.context.FirmwareRevision = this.FirmwareRevision;
    }
  }

  async refreshRate(device: device & devicesConfig): Promise<void> {
    if (device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = device.refreshRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options!.refreshRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
    }
  }

  async deviceConfig(device: device & devicesConfig): Promise<void> {
    let config = {};
    if (device.striplight) {
      config = device.striplight;
    }
    if (device.connectionType !== undefined) {
      config['connectionType'] = device.connectionType;
    }
    if (device.external !== undefined) {
      config['external'] = device.external;
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
    if (device.maxRetry !== undefined) {
      config['maxRetry'] = device.maxRetry;
    }
    if (device.webhook !== undefined) {
      config['webhook'] = device.webhook;
    }
    if (Object.entries(config).length !== 0) {
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  async deviceLogs(device: device & devicesConfig): Promise<void> {
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
