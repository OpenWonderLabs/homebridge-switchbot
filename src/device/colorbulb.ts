/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * blindtilt.ts: @switchbot/homebridge-switchbot.
 */
import { deviceBase } from './device.js';
import { hs2rgb, rgb2hs, m2hs } from '../utils.js';
import { SwitchBotBLEModel, SwitchBotBLEModelName } from 'node-switchbot';
import { Subject, debounceTime, interval, skipWhile, take, tap } from 'rxjs';

import type { devicesConfig } from '../settings.js';
import type { device } from '../types/devicelist.js';
import type { SwitchBotPlatform } from '../platform.js';
import type { colorBulbServiceData } from '../types/bledevicestatus.js';
import type { colorBulbStatus } from '../types/devicestatus.js';
import type { colorBulbWebhookContext } from '../types/devicewebhookstatus.js';
import type { Service, PlatformAccessory, CharacteristicValue, ControllerConstructor, Controller, ControllerServiceMap } from 'homebridge';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class ColorBulb extends deviceBase {
  // Services
  private LightBulb: {
    Name: CharacteristicValue;
    Service: Service;
    On: CharacteristicValue;
    Hue: CharacteristicValue;
    Saturation: CharacteristicValue;
    Brightness: CharacteristicValue;
    ColorTemperature?: CharacteristicValue;
  };

  // OpenAPI
  deviceStatus!: colorBulbStatus;

  //Webhook
  webhookContext!: colorBulbWebhookContext;

  // BLE
  serviceData!: colorBulbServiceData;

  // Adaptive Lighting
  AdaptiveLightingController?: ControllerConstructor | Controller<ControllerServiceMap>;
  adaptiveLightingShift?: number;

  // Updates
  colorBulbUpdateInProgress!: boolean;
  doColorBulbUpdate!: Subject<void>;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device);
    // default placeholders
    this.adaptiveLighting(device);

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doColorBulbUpdate = new Subject();
    this.colorBulbUpdateInProgress = false;

    // Initialize LightBulb property
    accessory.context.LightBulb = accessory.context.LightBulb ?? {};
    this.LightBulb = {
      Name: accessory.context.LightBulb.Name ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service.Lightbulb) ?? accessory.addService(this.hap.Service.Lightbulb) as Service,
      On: accessory.context.On ?? false,
      Hue: accessory.context.Hue ?? 0,
      Saturation: accessory.context.Saturation ?? 0,
      Brightness: accessory.context.Brightness ?? 0,
      ColorTemperature: accessory.context.ColorTemperature ?? 140,
    };
    accessory.context.LightBulb = this.LightBulb as object;

    // Adaptive Lighting
    if (this.adaptiveLightingShift === -1 && accessory.context.adaptiveLighting) {
      accessory.removeService(this.LightBulb.Service);
      this.LightBulb.Service = accessory.addService(this.hap.Service.Lightbulb);
      accessory.context.adaptiveLighting = false;
      this.debugLog(`adaptiveLighting: ${accessory.context.adaptiveLighting}`);
    }
    if (this.adaptiveLightingShift !== -1) {
      this.AdaptiveLightingController = new platform.api.hap.AdaptiveLightingController(this.LightBulb.Service, {
        customTemperatureAdjustment: this.adaptiveLightingShift,
      });
      accessory.configureController(this.AdaptiveLightingController);
      accessory.context.adaptiveLighting = true;
      this.debugLog(`${device.deviceType}: ${this.accessory.displayName} adaptiveLighting: ${accessory.context.adaptiveLighting},`
        + ` adaptiveLightingShift: ${this.adaptiveLightingShift}`);
    }
    this.debugLog(`${device.deviceType}: ${this.accessory.displayName} adaptiveLightingShift: ${this.adaptiveLightingShift}`);

    // Initialize LightBulb Characteristics
    this.LightBulb.Service
      .setCharacteristic(this.hap.Characteristic.Name, this.LightBulb.Name)
      .getCharacteristic(this.hap.Characteristic.On)
      .onGet(() => {
        return this.LightBulb.On;
      })
      .onSet(this.OnSet.bind(this));

    this.LightBulb.Service
      .getCharacteristic(this.hap.Characteristic.Brightness)
      .setProps({
        minStep: device.colorbulb?.set_minStep ?? 1,
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onGet(() => {
        return this.LightBulb.Brightness;
      })
      .onSet(this.BrightnessSet.bind(this));

    this.LightBulb.Service
      .getCharacteristic(this.hap.Characteristic.ColorTemperature)
      .setProps({
        minValue: 140,
        maxValue: 500,
        validValueRanges: [140, 500],
      })
      .onGet(() => {
        return this.LightBulb.ColorTemperature!;
      })
      .onSet(this.ColorTemperatureSet.bind(this));

    this.LightBulb.Service
      .getCharacteristic(this.hap.Characteristic.Hue)
      .setProps({
        minValue: 0,
        maxValue: 360,
        validValueRanges: [0, 360],
      })
      .onGet(() => {
        return this.LightBulb.Hue;
      })
      .onSet(this.HueSet.bind(this));

    this.LightBulb.Service
      .getCharacteristic(this.hap.Characteristic.Saturation)
      .setProps({
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onGet(() => {
        return this.LightBulb.Saturation;
      })
      .onSet(this.SaturationSet.bind(this));

    // Retrieve initial values and updateHomekit
    this.debugLog('Retrieve initial values and update Homekit');
    this.refreshStatus();

    //regisiter webhook event handler
    this.debugLog('Registering Webhook Event Handler');
    this.registerWebhook();

    //regisiter webhook event handler
    this.registerWebhook();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.colorBulbUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    // Watch for Bulb change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doColorBulbUpdate
      .pipe(
        tap(() => {
          this.colorBulbUpdateInProgress = true;
        }),
        debounceTime(this.devicePushRate * 1000),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges();
        } catch (e: any) {
          await this.apiError(e);
          await this.errorLog(`failed pushChanges with ${device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`);
        }
        this.colorBulbUpdateInProgress = false;
      });
  }

  /**
   * Parse the device status from the SwitchBotBLE API
   */
  async BLEparseStatus(): Promise<void> {
    await this.debugLog('BLEparseStatus');
    // On
    this.LightBulb.On = this.serviceData.power;
    await this.debugLog(`On: ${this.LightBulb.On}`);
    // Brightness
    this.LightBulb.Brightness = this.serviceData.brightness;
    await this.debugLog(`Brightness: ${this.LightBulb.Brightness}`);
    // Color, Hue & Brightness
    await this.debugLog(`red: ${this.serviceData.red}, green: ${this.serviceData.green}, blue: ${this.serviceData.blue}`);
    const [hue, saturation] = rgb2hs(this.serviceData.red, this.serviceData.green, this.serviceData.blue);
    await this.debugLog(`hs: ${JSON.stringify(rgb2hs(this.serviceData.red, this.serviceData.green, this.serviceData.blue))}`);
    // Hue
    this.LightBulb.Hue = hue;
    await this.debugLog(`Hue: ${this.LightBulb.Hue}`);
    // Saturation
    this.LightBulb.Saturation = saturation;
    await this.debugLog(`Saturation: ${this.LightBulb.Saturation}`);
    // ColorTemperature
    const miredColorTemperature = Math.round(1000000 / this.serviceData.color_temperature);
    this.LightBulb.ColorTemperature = Math.max(Math.min(miredColorTemperature, 500), 140);
    await this.debugLog(`ColorTemperature: ${this.LightBulb.ColorTemperature}`);
  }

  /**
   * Parse the device status from the SwitchBot OpenAPI
   */
  async openAPIparseStatus(): Promise<void> {
    await this.debugLog('openAPIparseStatus');
    // On
    this.LightBulb.On = this.deviceStatus.power === 'on' ? true : false;
    await this.debugLog(`On: ${this.LightBulb.On}`);
    // Brightness
    this.LightBulb.Brightness = this.deviceStatus.brightness;
    await this.debugLog(`Brightness: ${this.LightBulb.Brightness}`);
    // Color, Hue & Brightness
    await this.debugLog(`color: ${JSON.stringify(this.deviceStatus.color)}`);
    const [red, green, blue] = this.deviceStatus.color.split(':');
    await this.debugLog(`red: ${JSON.stringify(red)}, green: ${JSON.stringify(green)}, blue: ${JSON.stringify(blue)}`);
    const [hue, saturation] = rgb2hs(red, green, blue);
    await this.debugLog(`hs: ${JSON.stringify(rgb2hs(red, green, blue))}`);
    // Hue
    this.LightBulb.Hue = hue;
    await this.debugLog(`Hue: ${this.LightBulb.Hue}`);
    // Saturation
    this.LightBulb.Saturation = saturation;
    await this.debugLog(`Saturation: ${this.LightBulb.Saturation}`);
    // ColorTemperature
    const miredColorTemperature = Math.round(1000000 / this.deviceStatus.colorTemperature);
    this.LightBulb.ColorTemperature = Math.max(Math.min(miredColorTemperature, 500), 140);
    await this.debugLog(`ColorTemperature: ${this.LightBulb.ColorTemperature}`);
    // Firmware Version
    if (this.deviceStatus.version) {
      const version = this.deviceStatus.version.toString();
      await this.debugLog(`Firmware Version: ${version.replace(/^V|-.*$/g, '')}`);
      const deviceVersion = version.replace(/^V|-.*$/g, '') ?? '0.0.0';
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
        .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
        .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
        .updateValue(deviceVersion);
      this.accessory.context.deviceVersion = deviceVersion;
      await this.debugSuccessLog(`deviceVersion: ${this.accessory.context.deviceVersion}`);
    }
  }

  async parseStatusWebhook(): Promise<void> {
    await this.debugLog('parseStatusWebhook');
    await this.debugLog(`(powerState, brightness, color, colorTemperature) = Webhook:(${this.webhookContext.powerState},`
      + ` ${this.webhookContext.brightness}, ${this.webhookContext.color}, ${this.webhookContext.colorTemperature}), current:(${this.LightBulb.On},`
      + ` ${this.LightBulb.Brightness}, ${this.LightBulb.Hue}, ${this.LightBulb.Saturation}, ${this.LightBulb.ColorTemperature})`);
    // On
    this.LightBulb.On = this.webhookContext.powerState === 'ON' ? true : false;
    await this.debugLog(`On: ${this.LightBulb.On}`);
    // Brightness
    this.LightBulb.Brightness = this.webhookContext.brightness;
    await this.debugLog(`Brightness: ${this.LightBulb.Brightness}`);
    // Color, Hue & Brightness
    await this.debugLog(`color: ${JSON.stringify(this.webhookContext.color)}`);
    const [red, green, blue] = this.webhookContext.color.split(':');
    await this.debugLog(`red: ${JSON.stringify(red)}, green: ${JSON.stringify(green)}, blue: ${JSON.stringify(blue)}`);
    const [hue, saturation] = rgb2hs(red, green, blue);
    await this.debugLog(`hs: ${JSON.stringify(rgb2hs(red, green, blue))}`);
    // Hue
    this.LightBulb.Hue = hue;
    await this.debugLog(`Hue: ${this.LightBulb.Hue}`);
    // Saturation
    this.LightBulb.Saturation = saturation;
    await this.debugLog(`Saturation: ${this.LightBulb.Saturation}`);
    // ColorTemperature
    const miredColorTemperature = Math.round(1000000 / this.webhookContext.colorTemperature);
    this.LightBulb.ColorTemperature = Math.max(Math.min(miredColorTemperature, 500), 140);
    await this.debugLog(`ColorTemperature: ${this.LightBulb.ColorTemperature}`);
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      await this.errorLog(`refreshStatus enableCloudService: ${this.device.enableCloudService}`);
    } else if (this.BLE) {
      await this.BLERefreshStatus();
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIRefreshStatus();
    } else {
      await this.offlineOff();
      await this.debugWarnLog(`Connection Type: ${this.device.connectionType}, refreshStatus will not happen.`);
    }
  }

  async BLERefreshStatus(): Promise<void> {
    await this.debugLog('BLERefreshStatus');
    const switchbot = await this.switchbotBLE();

    if (switchbot === undefined) {
      await this.BLERefreshConnection(switchbot);
    } else {
    // Start to monitor advertisement packets
      (async () => {
      // Start to monitor advertisement packets
        const serviceData = await this.monitorAdvertisementPackets(switchbot) as colorBulbServiceData;
        // Update HomeKit
        if (serviceData.model === SwitchBotBLEModel.ColorBulb && serviceData.modelName === SwitchBotBLEModelName.ColorBulb) {
          this.serviceData = serviceData;
          await this.BLEparseStatus();
          await this.updateHomeKitCharacteristics();
        } else {
          await this.errorLog(`failed to get serviceData, serviceData: ${serviceData}`);
          await this.BLERefreshConnection(switchbot);
        }
      })();
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    await this.debugLog('openAPIRefreshStatus');
    try {
      const { body, statusCode } = await this.deviceRefreshStatus();
      const deviceStatus: any = await body.json();
      await this.debugLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`);;
      if (await this.successfulStatusCodes(statusCode, deviceStatus)) {
        await this.debugSuccessLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`);
        this.deviceStatus = deviceStatus.body;
        await this.openAPIparseStatus();
        await this.updateHomeKitCharacteristics();
      } else {
        await this.debugWarnLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`);
        await this.debugWarnLog(statusCode, deviceStatus);
      }
    } catch (e: any) {
      await this.apiError(e);
      await this.errorLog(`failed openAPIRefreshStatus with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`);
    }
  }

  async registerWebhook() {
    if (this.device.webhook) {
      await this.debugLog('is listening webhook.');
      this.webhookEventHandler[this.device.deviceId] = async (context: colorBulbWebhookContext) => {
        try {
          await this.debugLog(`received Webhook: ${JSON.stringify(context)}`);
          this.webhookContext = context;
          await this.parseStatusWebhook();
          await this.updateHomeKitCharacteristics();
        } catch (e: any) {
          await this.errorLog(`failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`);
        }
      };
    } else {
      await this.debugLog('is not listening webhook.');
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
   *
   */
  async pushChanges(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      await this.errorLog(`pushChanges enableCloudService: ${this.device.enableCloudService}`);
    } else if (this.BLE) {
      await this.BLEpushChanges();
      if (this.LightBulb.On) {
      // Push Brightness Update
        await this.debugLog(`Brightness: ${this.LightBulb.Brightness}`);
        await this.BLEpushBrightnessChanges();
        // Push ColorTemperature Update
        await this.debugLog(`ColorTemperature: ${this.LightBulb.ColorTemperature}`);
        await this.BLEpushColorTemperatureChanges();
        // Push Hue & Saturation Update
        await this.debugLog(`Hue: ${this.LightBulb.Hue}, Saturation: ${this.LightBulb.Saturation}`);
        await this.BLEpushRGBChanges();
      } else {
        await this.debugLog('BLE (Brightness), (ColorTemperature), (Hue), & (Saturation) changes will not happen, as the device is OFF.');
      }
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges();
      if (this.LightBulb.On) {
        // Push Brightness Update
        await this.debugLog(`Brightness: ${this.LightBulb.Brightness}`);
        await this.pushBrightnessChanges();
        // Push ColorTemperature Update
        await this.debugLog(`ColorTemperature: ${this.LightBulb.ColorTemperature}`);
        await this.pushColorTemperatureChanges();
        // Push Hue & Saturation Update
        await this.debugLog(`Hue: ${this.LightBulb.Hue}, Saturation: ${this.LightBulb.Saturation}`);
        await this.pushHueSaturationChanges();
      } else {
        await this.debugLog('openAPI (Brightness), (ColorTemperature), (Hue), & (Saturation) changes will not happen, as the device is OFF.');
      }
    } else {
      await this.offlineOff();
      await this.debugWarnLog(`Connection Type: ${this.device.connectionType}, pushChanges will not happen.`);
    }
    // Refresh the status from the API
    interval(15000)
      .pipe(skipWhile(() => this.colorBulbUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus();
      });
  }

  async BLEpushChanges(): Promise<void> {
    await this.debugLog('BLEpushChanges');
    if (this.LightBulb.On !== this.accessory.context.On) {
      await this.debugLog(`BLEpushChanges On: ${this.LightBulb.On}, OnCached: ${this.accessory.context.On}`);
      const switchbot = await this.platform.connectBLE(this.accessory, this.device);
      await this.convertBLEAddress();
      if (switchbot !== false) {
        switchbot
          .discover({ model: this.device.bleModel, id: this.device.bleMac })
          .then(async (device_list: any) => {
            await this.infoLog(`On: ${this.LightBulb.On}`);
            return await this.retryBLE({
              max: await this.maxRetryBLE(),
              fn: async () => {
                if (this.LightBulb.On) {
                  return await device_list[0].turnOn({ id: this.device.bleMac });
                } else {
                  return await device_list[0].turnOff({ id: this.device.bleMac });
                }
              },
            });
          })
          .then(async () => {
            await this.successLog(`On: ${this.LightBulb.On} sent over SwitchBot BLE,  sent successfully`);
            await this.updateHomeKitCharacteristics();
          })
          .catch(async (e: any) => {
            await this.apiError(e);
            await this.errorLog(`failed BLEpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`);
            await this.BLEPushConnection();
          });
      } else {
        await this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`);
        await this.BLEPushConnection();
      }
    } else {
      await this.debugLog(`No changes (BLEpushChanges), On: ${this.LightBulb.On}, OnCached: ${this.accessory.context.On}`);
    }
  }

  async BLEpushBrightnessChanges(): Promise<void> {
    await this.debugLog('BLEpushBrightnessChanges');
    if (this.LightBulb.Brightness !== this.accessory.context.Brightness) {
      const switchbot = await this.platform.connectBLE(this.accessory, this.device);
      await this.convertBLEAddress();
      if (switchbot !== false) {
        switchbot
          .discover({ model: this.device.bleModel, id: this.device.bleMac })
          .then(async (device_list: any) => {
            await this.infoLog(`${this.accessory.displayName} Target Brightness: ${this.LightBulb.Brightness}`);
            return await device_list[0].setBrightness(this.LightBulb.Brightness);
          })
          .then(async () => {
            await this.successLog(`Brightness: ${this.LightBulb.Brightness} sent over SwitchBot BLE,  sent successfully`);
            await this.updateHomeKitCharacteristics();
          })
          .catch(async (e: any) => {
            await this.apiError(e);
            await this.errorLog(`failed BLEpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`);
            await this.BLEPushConnection();
          });
      } else {
        await this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`);
        await this.BLEPushConnection();
      }
    } else {
      await this.debugLog(`No changes (BLEpushBrightnessChanges), Brightness: ${this.LightBulb.Brightness},`
        + ` BrightnessCached: ${this.accessory.context.Brightness}`);
    }
  }

  async BLEpushColorTemperatureChanges(): Promise<void> {
    await this.debugLog('BLEpushColorTemperatureChanges');
    if (this.LightBulb.ColorTemperature !== this.accessory.context.ColorTemperature) {
      const kelvin = Math.round(1000000 / Number(this.LightBulb.ColorTemperature));
      this.accessory.context.kelvin = kelvin;
      const switchbot = await this.platform.connectBLE(this.accessory, this.device);
      await this.convertBLEAddress();
      if (switchbot !== false) {
        switchbot
          .discover({ model: this.device.bleModel, id: this.device.bleMac })
          .then(async (device_list: any) => {
            await this.infoLog(`ColorTemperature: ${this.LightBulb.ColorTemperature}`);
            return await device_list[0].setColorTemperature(kelvin);
          })
          .then(async () => {
            await this.successLog(`ColorTemperature: ${this.LightBulb.ColorTemperature} sent over SwitchBot BLE,  sent successfully`);
            await this.updateHomeKitCharacteristics();
          })
          .catch(async (e: any) => {
            await this.apiError(e);
            await this.errorLog(`failed BLEpushRGBChanges with ${this.device.connectionType} Connection,`
              + ` Error Message: ${JSON.stringify(e.message)}`);
            await this.BLEPushConnection();
          });
      } else {
        await this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`);
        await this.BLEPushConnection();
      }
    } else {
      await this.debugLog(`No changes (BLEpushColorTemperatureChanges), ColorTemperature: ${this.LightBulb.ColorTemperature},`
        + ` ColorTemperatureCached: ${this.accessory.context.ColorTemperature}`);
    }
  }

  async BLEpushRGBChanges(): Promise<void> {
    await this.debugLog('BLEpushRGBChanges');
    if ((this.LightBulb.Hue !== this.accessory.context.Hue) || (this.LightBulb.Saturation !== this.accessory.context.Saturation)) {
      await this.debugLog(`Hue: ${JSON.stringify(this.LightBulb.Hue)}, Saturation: ${JSON.stringify(this.LightBulb.Saturation)}`);
      const [red, green, blue] = hs2rgb(this.LightBulb.Hue, this.LightBulb.Saturation);
      await this.debugLog(`rgb: ${JSON.stringify([red, green, blue])}`);
      const switchbot = await this.platform.connectBLE(this.accessory, this.device);
      await this.convertBLEAddress();
      if (switchbot !== false) {
        switchbot
          .discover({ model: this.device.bleModel, id: this.device.bleMac })
          .then(async (device_list: any) => {
            await this.infoLog(`RGB: ${(this.LightBulb.Brightness, red, green, blue)}`);
            return await device_list[0].setRGB(this.LightBulb.Brightness, red, green, blue);
          })
          .then(async () => {
            await this.successLog(`RGB: ${(this.LightBulb.Brightness, red, green, blue)} sent over SwitchBot BLE,  sent successfully`);
            await this.updateHomeKitCharacteristics();
          })
          .catch(async (e: any) => {
            await this.apiError(e);
            await this.errorLog(`failed BLEpushRGBChanges with ${this.device.connectionType} Connection,`
              + ` Error Message: ${JSON.stringify(e.message)}`);
            await this.BLEPushConnection();
          });
      } else {
        await this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`);
        await this.BLEPushConnection();
      }
    } else {
      await this.debugLog(`No changes (BLEpushRGBChanges), Hue: ${this.LightBulb.Hue}, HueCached: ${this.accessory.context.Hue},`
        + ` Saturation: ${this.LightBulb.Saturation}, SaturationCached: ${this.accessory.context.Saturation}`);
    }
  }

  async openAPIpushChanges(): Promise<void> {
    await this.debugLog('openAPIpushChanges');
    if (this.LightBulb.On !== this.accessory.context.On) {
      const command = this.LightBulb.On ? 'turnOn' : 'turnOff';
      const bodyChange = JSON.stringify({
        command: `${command}`,
        parameter: 'default',
        commandType: 'command',
      });
      await this.debugLog(`SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`);
      try {
        const { body, statusCode } = await this.pushChangeRequest(bodyChange);
        const deviceStatus: any = await body.json();
        await this.debugLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`);
        if (await this.successfulStatusCodes(statusCode, deviceStatus)) {
          await this.debugSuccessLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`);
          await this.updateHomeKitCharacteristics();
        } else {
          await this.statusCode(statusCode);
          await this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        await this.apiError(e);
        await this.errorLog(`failed openAPIpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`);
      }
    } else {
      await this.debugLog(`No changes (openAPIpushChanges), On: ${this.LightBulb.On}, OnCached: ${this.accessory.context.On}`);
    }
  }

  async pushHueSaturationChanges(): Promise<void> {
    await this.debugLog('pushHueSaturationChanges');
    if ((this.LightBulb.Hue !== this.accessory.context.Hue) || (this.LightBulb.Saturation !== this.accessory.context.Saturation)) {
      await this.debugLog(`Hue: ${JSON.stringify(this.LightBulb.Hue)}, Saturation: ${JSON.stringify(this.LightBulb.Saturation)}`);
      const [red, green, blue] = hs2rgb(this.LightBulb.Hue, this.LightBulb.Saturation);
      await this.debugLog(`rgb: ${JSON.stringify([red, green, blue])}`);
      const bodyChange = JSON.stringify({
        command: 'setColor',
        parameter: `${red}:${green}:${blue}`,
        commandType: 'command',
      });
      await this.debugLog(`SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`);
      try {
        const { body, statusCode } = await this.pushChangeRequest(bodyChange);
        const deviceStatus: any = await body.json();
        await this.debugLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`);
        if (await this.successfulStatusCodes(statusCode, deviceStatus)) {
          await this.debugSuccessLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`);
          await this.updateHomeKitCharacteristics();
        } else {
          await this.statusCode(statusCode);
          await this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        await this.apiError(e);
        await this.errorLog(`failed pushHueSaturationChanges with ${this.device.connectionType} Connection,`
          + ` Error Message: ${JSON.stringify(e.message)}`);
      }
    } else {
      await this.debugLog(`No changes (pushHueSaturationChanges), Hue: ${this.LightBulb.Hue}, HueCached: ${this.accessory.context.Hue},`
        + ` Saturation: ${this.LightBulb.Saturation}, SaturationCached: ${this.accessory.context.Saturation}`);
    }
  }

  async pushColorTemperatureChanges(): Promise<void> {
    await this.debugLog('pushColorTemperatureChanges');
    if (this.LightBulb.ColorTemperature !== this.accessory.context.ColorTemperature) {
      const kelvin = Math.round(1000000 / Number(this.LightBulb.ColorTemperature));
      this.accessory.context.kelvin = kelvin;
      const bodyChange = JSON.stringify({
        command: 'setColorTemperature',
        parameter: `${kelvin}`,
        commandType: 'command',
      });
      await this.debugLog(`SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`);
      try {
        const { body, statusCode } = await this.pushChangeRequest(bodyChange);
        const deviceStatus: any = await body.json();
        await this.debugLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`);
        if (await this.successfulStatusCodes(statusCode, deviceStatus)) {
          await this.debugSuccessLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`);
          await this.updateHomeKitCharacteristics();
        } else {
          await this.statusCode(statusCode);
          await this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        await this.apiError(e);
        await this.errorLog(`failed pushColorTemperatureChanges with ${this.device.connectionType} Connection,`
          + ` Error Message: ${JSON.stringify(e.message)}`);
      }
    } else {
      await this.debugLog(`No changes (pushColorTemperatureChanges), ColorTemperature: ${this.LightBulb.ColorTemperature},`
        + ` ColorTemperatureCached: ${this.accessory.context.ColorTemperature}`);
    }
  }

  async pushBrightnessChanges(): Promise<void> {
    await this.debugLog('pushBrightnessChanges');
    if (this.LightBulb.Brightness !== this.accessory.context.Brightness) {
      const bodyChange = JSON.stringify({
        command: 'setBrightness',
        parameter: `${this.LightBulb.Brightness}`,
        commandType: 'command',
      });
      await this.debugLog(`SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`);
      try {
        const { body, statusCode } = await this.pushChangeRequest(bodyChange);
        const deviceStatus: any = await body.json();
        await this.debugLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`);
        if (await this.successfulStatusCodes(statusCode, deviceStatus)) {
          await this.debugSuccessLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`);
          await this.updateHomeKitCharacteristics();
        } else {
          await this.statusCode(statusCode);
          await this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        await this.apiError(e);
        await this.errorLog(`failed pushBrightnessChanges with ${this.device.connectionType} Connection,`
          + ` Error Message: ${JSON.stringify(e.message)}`);
      }
    } else {
      await this.debugLog(`No changes (pushBrightnessChanges), Brightness: ${this.LightBulb.Brightness},`
        + ` BrightnessCached: ${this.accessory.context.Brightness}`);
    }
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    if (this.LightBulb.On !== this.accessory.context.On) {
      await this.infoLog(`Set On: ${value}`);
    } else {
      await this.debugLog(`No Changes, On: ${value}`);
    }

    this.LightBulb.On = value;
    this.doColorBulbUpdate.next();
  }

  /**
   * Handle requests to set the value of the "Brightness" characteristic
   */
  async BrightnessSet(value: CharacteristicValue): Promise<void> {
    if (this.LightBulb.On && (this.LightBulb.Brightness !== this.accessory.context.Brightness)) {
      await this.infoLog(`Set Brightness: ${value}`);
    } else {
      if (this.LightBulb.On) {
        this.debugLog(`No Changes, Brightness: ${value}`);
      } else {
        this.debugLog(`Brightness: ${value}, On: ${this.LightBulb.On}`);
      }
    }

    this.LightBulb.Brightness = value;
    this.doColorBulbUpdate.next();
  }

  /**
   * Handle requests to set the value of the "ColorTemperature" characteristic
   */
  async ColorTemperatureSet(value: CharacteristicValue): Promise<void> {
    if (this.LightBulb.On && (this.LightBulb.ColorTemperature !== this.accessory.context.ColorTemperature)) {
      this.infoLog(`Set ColorTemperature: ${value}`);
    } else {
      if (this.LightBulb.On) {
        this.debugLog(`No Changes, ColorTemperature: ${value}`);
      } else {
        this.debugLog(`Set ColorTemperature: ${value}, On: ${this.LightBulb.On}`);
      }
    }

    const minKelvin = 2000;
    const maxKelvin = 9000;
    // Convert mired to kelvin to nearest 100 (SwitchBot seems to need this)
    const kelvin = Math.round(1000000 / Number(value) / 100) * 100;

    // Check and increase/decrease kelvin to range of device
    const k = Math.min(Math.max(kelvin, minKelvin), maxKelvin);

    if (!this.accessory.context.On || this.accessory.context.kelvin === k) {
      return;
    }

    // Updating the hue/sat to the corresponding values mimics native adaptive lighting
    const hs = m2hs(value);
    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.Hue, hs[0]);
    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.Saturation, hs[1]);

    this.LightBulb.ColorTemperature = value;
    this.doColorBulbUpdate.next();
  }

  /**
   * Handle requests to set the value of the "Hue" characteristic
   */
  async HueSet(value: CharacteristicValue): Promise<void> {
    if (this.LightBulb.On && (this.LightBulb.Hue !== this.accessory.context.Hue)) {
      this.infoLog(`Set Hue: ${value}`);
    } else {
      if (this.LightBulb.On) {
        this.debugLog(`No Changes, Hue: ${value}`);
      } else {
        this.debugLog(`Set Hue: ${value}, On: ${this.LightBulb.On}`);
      }
    }

    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.ColorTemperature, 140);

    this.LightBulb.Hue = value;
    this.doColorBulbUpdate.next();
  }

  /**
   * Handle requests to set the value of the "Saturation" characteristic
   */
  async SaturationSet(value: CharacteristicValue): Promise<void> {
    if (this.LightBulb.On && (this.LightBulb.Saturation !== this.accessory.context.Saturation)) {
      this.infoLog(`Set Saturation: ${value}`);
    } else {
      if (this.LightBulb.On) {
        this.debugLog(`No Changes, Saturation: ${value}`);
      } else {
        this.debugLog(`Set Saturation: ${value}, On: ${this.LightBulb.On}`);
      }
    }

    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.ColorTemperature, 140);

    this.LightBulb.Saturation = value;
    this.doColorBulbUpdate.next();
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    // On
    await this.updateCharacteristic(this.LightBulb.Service, this.hap.Characteristic.On,
      this.LightBulb.On, 'On');
    // Brightness
    await this.updateCharacteristic(this.LightBulb.Service, this.hap.Characteristic.Brightness,
      this.LightBulb.Brightness, 'Brightness');
    // ColorTemperature
    await this.updateCharacteristic(this.LightBulb.Service, this.hap.Characteristic.ColorTemperature,
      this.LightBulb.ColorTemperature, 'ColorTemperature');
    // Hue
    await this.updateCharacteristic(this.LightBulb.Service, this.hap.Characteristic.Hue,
      this.LightBulb.Hue, 'Hue');
    // Saturation
    await this.updateCharacteristic(this.LightBulb.Service, this.hap.Characteristic.Saturation,
      this.LightBulb.Saturation, 'Saturation');
  }

  async adaptiveLighting(device: device & devicesConfig): Promise<void> {
    if (device.colorbulb?.adaptiveLightingShift) {
      this.adaptiveLightingShift = device.colorbulb.adaptiveLightingShift;
    } else {
      this.adaptiveLightingShift = 0;
    }
    await this.debugLog(`adaptiveLightingShift: ${this.adaptiveLightingShift}`);
  }

  async BLEPushConnection() {
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      await this.warnLog('Using OpenAPI Connection to Push Changes');
      await this.openAPIpushChanges();
    }
  }

  async BLERefreshConnection(switchbot: any): Promise<void> {
    await this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${JSON.stringify(switchbot)}`);
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      await this.warnLog('Using OpenAPI Connection to Refresh Status');
      await this.openAPIRefreshStatus();
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.On, false);
    }
  }

  async apiError(e: any): Promise<void> {
    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.On, e);
    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.Hue, e);
    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.Brightness, e);
    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.Saturation, e);
    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.ColorTemperature, e);
  }
}
