/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * plug.ts: @switchbot/homebridge-switchbot.
 */
import { deviceBase } from './device.js';
import { SwitchBotBLEModel, SwitchBotBLEModelName } from 'node-switchbot';
import { Subject, debounceTime, interval, skipWhile, take, tap } from 'rxjs';

import type { devicesConfig } from '../settings.js';
import type { device } from '../types/devicelist.js';
import type { SwitchBotPlatform } from '../platform.js';
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { plugStatus, plugMiniStatus } from '../types/devicestatus.js';
import type { plugMiniUSServiceData, plugMiniJPServiceData } from '../types/bledevicestatus.js';
import type { plugMiniJPWebhookContext, plugMiniUSWebhookContext, plugWebhookContext } from '../types/devicewebhookstatus.js';
export class Plug extends deviceBase {
  // Services
  private Outlet: {
    Name: CharacteristicValue;
    Service: Service;
    On: CharacteristicValue;
  };

  // Updates
  plugUpdateInProgress!: boolean;
  doPlugUpdate!: Subject<void>;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device);
    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doPlugUpdate = new Subject();
    this.plugUpdateInProgress = false;

    // Initialize Outlet Service
    accessory.context.Outlet = accessory.context.Outlet ?? {};
    this.Outlet = {
      Name: accessory.context.Outlet.Name ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service.Outlet) ?? accessory.addService(this.hap.Service.Outlet) as Service,
      On: accessory.context.On || false,
    };
    accessory.context.Outlet = this.Outlet as object;

    // Initialize Outlet Characteristics
    this.Outlet.Service
      .setCharacteristic(this.hap.Characteristic.Name, accessory.displayName)
      .getCharacteristic(this.hap.Characteristic.On)
      .onGet(() => {
        return this.Outlet.On;
      })
      .onSet(this.OnSet.bind(this));

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // Update Homekit
    this.updateHomeKitCharacteristics();

    //regisiter webhook event handler
    this.registerWebhook();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.plugUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    // Watch for Plug change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doPlugUpdate
      .pipe(
        tap(() => {
          this.plugUpdateInProgress = true;
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
        this.plugUpdateInProgress = false;
      });
  }

  async BLEparseStatus(serviceData: plugMiniUSServiceData | plugMiniJPServiceData): Promise<void> {
    await this.debugLog('BLEparseStatus');
    // On
    this.Outlet.On = serviceData.state === 'on' ? true : false;
    await this.debugLog(`On: ${this.Outlet.On}`);
  }

  async openAPIparseStatus(deviceStatus: plugStatus | plugMiniStatus) {
    await this.debugLog('openAPIparseStatus');
    // On
    this.Outlet.On = deviceStatus.power === 'on' ? true : false;
    await this.debugLog(`On: ${this.Outlet.On}`);
    // Firmware Version
    const version = deviceStatus.version.toString();
    await this.debugLog(`Firmware Version: ${version.replace(/^V|-.*$/g, '')}`);
    if (deviceStatus.version) {
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

  async parseStatusWebhook(context: plugWebhookContext | plugMiniUSWebhookContext | plugMiniJPWebhookContext): Promise<void> {
    await this.debugLog('parseStatusWebhook');
    await this.debugLog(`(powerState) = Webhook: (${context.powerState}), current:(${this.Outlet.On})`);
    // On
    this.Outlet.On = context.powerState === 'ON' ? true : false;
    await this.debugLog(`On: ${this.Outlet.On}`);
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
        const serviceData = await this.monitorAdvertisementPackets(switchbot) as plugMiniUSServiceData | plugMiniJPServiceData;
        // Update HomeKit
        if ((serviceData.model === SwitchBotBLEModel.PlugMiniUS || SwitchBotBLEModel.PlugMiniJP)
          && serviceData.modelName === (SwitchBotBLEModelName.PlugMini || SwitchBotBLEModelName.PlugMini)) {
          await this.BLEparseStatus(serviceData);
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
        await this.openAPIparseStatus(deviceStatus.body);
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
      this.platform.webhookEventHandler[this.device.deviceId] = async (context: plugWebhookContext | plugMiniUSWebhookContext
        | plugMiniJPWebhookContext) => {
        try {
          await this.debugLog(`received Webhook: ${JSON.stringify(context)}`);
          await this.parseStatusWebhook(context);
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
   * deviceType	commandType	  Command	    command parameter	  Description
   * Plug               -    "command"     "turnOff"   "default"	  =        set to OFF state
   * Plug               -    "command"     "turnOn"    "default"	  =        set to ON state
   * Plug Mini (US/JP)  -    "command"      turnOn      default     =        set to ON state
   * Plug Mini (US/JP)  -    "command"      turnOff     default     =        set to OFF state
   * Plug Mini (US/JP)  -    "command"      toggle      default     =        toggle state
   */

  async pushChanges(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      await this.errorLog(`pushChanges enableCloudService: ${this.device.enableCloudService}`);
    } else if (this.BLE) {
      await this.BLEpushChanges();
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges();
    } else {
      await this.offlineOff();
      await this.debugWarnLog(`Connection Type: ${this.device.connectionType}, pushChanges will not happen.`);
    }
    // Refresh the status from the API
    interval(15000)
      .pipe(skipWhile(() => this.plugUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus();
      });
  }

  async BLEpushChanges(): Promise<void> {
    await this.debugLog('BLEpushChanges');
    if (this.Outlet.On !== this.accessory.context.On) {
      await this.debugLog(`BLEpushChanges On: ${this.Outlet.On}, OnCached: ${this.accessory.context.On}`);
      const switchbot = await this.platform.connectBLE(this.accessory, this.device);
      await this.convertBLEAddress();
      if (switchbot !== false) {
        switchbot
          .discover({ model: this.device.bleModel, id: this.device.bleMac })
          .then(async (device_list: any) => {
            await this.infoLog(`On: ${this.Outlet.On}`);
            return await this.retryBLE({
              max: await this.maxRetryBLE(),
              fn: async () => {
                if (this.Outlet.On) {
                  return await device_list[0].turnOn({ id: this.device.bleMac });
                } else {
                  return await device_list[0].turnOff({ id: this.device.bleMac });
                }
              },
            });
          })
          .then(async () => {
            await this.successLog(`On: ${this.Outlet.On} sent over SwitchBot BLE,  sent successfully`);
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
      await this.debugLog(`No changes (BLEpushChanges), On: ${this.Outlet.On}, OnCached: ${this.accessory.context.On}`);
    }
  }

  async openAPIpushChanges() {
    await this.debugLog('openAPIpushChanges');
    if (this.Outlet.On !== this.accessory.context.On) {
      const command = this.Outlet.On ? 'turnOn' : 'turnOff';
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
      await this.debugLog(`No changes (openAPIpushChanges), On: ${this.Outlet.On}, OnCached: ${this.accessory.context.On}`);
    }
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    if (this.Outlet.On !== this.accessory.context.On) {
      await this.infoLog(`Set On: ${value}`);
    } else {
      await this.debugLog(`No Changes, On: ${value}`);
    }

    this.Outlet.On = value;
    this.doPlugUpdate.next();
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    // On
    await this.updateCharacteristic(this.Outlet.Service, this.hap.Characteristic.On,
      this.Outlet.On, 'On');
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
      this.Outlet.Service.updateCharacteristic(this.hap.Characteristic.On, false);
    }
  }

  async apiError(e: any): Promise<void> {
    this.Outlet.Service.updateCharacteristic(this.hap.Characteristic.On, e);
  }
}
