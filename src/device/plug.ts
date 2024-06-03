/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * plug.ts: @switchbot/homebridge-switchbot.
 */
import { deviceBase } from './device.js';
import { Subject, debounceTime, interval, skipWhile, take, tap } from 'rxjs';

import type { SwitchBotPlatform } from '../platform.js';
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { device, devicesConfig, serviceData, deviceStatus } from '../settings.js';
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

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.plugUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    //regisiter webhook event handler
    this.registerWebhook(accessory, device);

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
          this.apiError(e);
          this.errorLog(`${device.deviceType}: ${this.accessory.displayName} failed pushChanges with ${device.connectionType} Connection,`
            + ` Error Message: ${JSON.stringify(e.message)}`);
        }
        this.plugUpdateInProgress = false;
      });
  }

  async BLEparseStatus(serviceData: serviceData): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);
    // State
    switch (serviceData.state) {
      case 'on':
        this.Outlet.On = true;
        break;
      default:
        this.Outlet.On = false;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.Outlet.On}`);
  }

  async openAPIparseStatus(deviceStatus: deviceStatus) {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
    switch (deviceStatus.body.power) {
      case 'on':
        this.Outlet.On = true;
        break;
      default:
        this.Outlet.On = false;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.Outlet.On}`);

    // Firmware Version
    const version = deviceStatus.body.version?.toString();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Firmware Version: ${version?.replace(/^V|-.*$/g, '')}`);
    if (deviceStatus.body.version) {
      const deviceVersion = version?.replace(/^V|-.*$/g, '') ?? '0.0.0';
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
        .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
        .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
        .updateValue(deviceVersion);
      this.accessory.context.deviceVersion = deviceVersion;
      this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceVersion: ${this.accessory.context.deviceVersion}`);
    }
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
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:`
        + ` ${this.device.connectionType}, refreshStatus will not happen.`);
    }
  }

  async BLERefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLERefreshStatus`);
    const switchbot = await this.switchbotBLE();

    if (switchbot === undefined) {
      await this.BLERefreshConnection(switchbot);
    } else {
    // Start to monitor advertisement packets
      (async () => {
      // Start to monitor advertisement packets
        const serviceData: serviceData = await this.monitorAdvertisementPackets(switchbot);
        // Update HomeKit
        if (serviceData.model !== '' && serviceData.modelName !== '') {
          await this.BLEparseStatus(serviceData);
          await this.updateHomeKitCharacteristics();
        } else {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed to get serviceData, serviceData: ${serviceData}`);
          await this.BLERefreshConnection(switchbot);
        }
      })();
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode } = await this.deviceRefreshStatus();
      const deviceStatus: any = await body.json();
      await this.refreshStatusCodes(statusCode, deviceStatus);;
      if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
        await this.successfulRefreshStatus(statusCode, deviceStatus);
        await this.openAPIparseStatus(deviceStatus);
        await this.updateHomeKitCharacteristics();
      } else {
        await this.statusCodes(statusCode, deviceStatus);
      }
    } catch (e: any) {
      await this.apiError(e);
      await this.openAPIRefreshError(e);
    }
  }

  async registerWebhook(accessory: PlatformAccessory, device: device & devicesConfig) {
    if (device.webhook) {
      this.debugLog(`${device.deviceType}: ${accessory.displayName} is listening webhook.`);
      this.platform.webhookEventHandler[device.deviceId] = async (context) => {
        try {
          this.debugLog(`${device.deviceType}: ${accessory.displayName} received Webhook: ${JSON.stringify(context)}`);
          const { powerState } = context;
          const { On } = this.Outlet;
          this.debugLog(`${device.deviceType}: ${accessory.displayName} (powerState) = Webhook: (${powerState}), current:(${On})`);
          this.Outlet.On = powerState === 'ON' ? true : false;
          this.updateHomeKitCharacteristics();
        } catch (e: any) {
          this.errorLog(`${device.deviceType}: ${accessory.displayName} failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`);
        }
      };
    } else {
      this.debugLog(`${device.deviceType}: ${accessory.displayName} is not listening webhook.`);
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
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} pushChanges enableCloudService: ${this.device.enableCloudService}`);
    } else if (this.BLE) {
      await this.BLEpushChanges();
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges();
    } else {
      await this.offlineOff();
      await this.pushChangeDisabled();
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
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges`);
    if (this.Outlet.On !== this.accessory.context.On) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges`
        + ` On: ${this.Outlet.On} OnCached: ${this.accessory.context.On}`);
      const switchbot = await this.platform.connectBLE();
      // Convert to BLE Address
      await this.convertBLEAddress();
      switchbot
        .discover({
          model: this.device.bleModel,
          id: this.device.bleMac,
        })
        .then(async (device_list: any) => {
          this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.Outlet.On}`);
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
        .then(() => {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
          this.successLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `On: ${this.Outlet.On} sent over BLE,  sent successfully`);
          this.Outlet.On = false;
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}`
            + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
          await this.BLEPushConnection();
        });
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No BLEpushChanges,`
        + ` On: ${this.Outlet.On}, OnCached: ${this.accessory.context.On}`);
    }
  }

  async openAPIpushChanges() {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);
    if (this.Outlet.On !== this.accessory.context.On) {
      let command = '';
      if (this.Outlet.On) {
        command = 'turnOn';
      } else {
        command = 'turnOff';
      }
      const bodyChange = JSON.stringify({
        command: `${command}`,
        parameter: 'default',
        commandType: 'command',
      });
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await this.pushChangeRequest(bodyChange);
        const deviceStatus: any = await body.json();
        await this.pushStatusCodes(statusCode, deviceStatus);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          await this.successfulPushChange(statusCode, deviceStatus, bodyChange);
          await this.updateHomeKitCharacteristics();
        } else {
          await this.statusCode(statusCode);
          await this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIpushChanges with ${this.device.connectionType}`
          + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No openAPIpushChanges.`
        + `On: ${this.Outlet.On}, OnCached: ${this.accessory.context.On}`);
    }
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    if (this.Outlet.On === this.accessory.context.On) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set On: ${value}`);
    } else {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set On: ${value}`);
    }

    this.Outlet.On = value;
    this.doPlugUpdate.next();
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    // On
    if (this.Outlet.On === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.Outlet.On}`);
    } else {
      this.accessory.context.On = this.Outlet.On;
      this.Outlet.Service.updateCharacteristic(this.hap.Characteristic.On, this.Outlet.On);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic On: ${this.Outlet.On}`);
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

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      this.Outlet.Service.updateCharacteristic(this.hap.Characteristic.On, false);
    }
  }

  async apiError(e: any): Promise<void> {
    this.Outlet.Service.updateCharacteristic(this.hap.Characteristic.On, e);
  }
}
