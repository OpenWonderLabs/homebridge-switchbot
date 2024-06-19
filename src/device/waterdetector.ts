/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * waterdetector.ts: @switchbot/homebridge-switchbot.
 */
import { deviceBase } from './device.js';
import { Subject, interval, skipWhile } from 'rxjs';
import { SwitchBotBLEModel, SwitchBotBLEModelName } from 'node-switchbot';

import type { devicesConfig } from '../settings.js';
import type { device } from '../types/devicelist.js';
import type { SwitchBotPlatform } from '../platform.js';
import type { waterLeakDetectorServiceData } from '../types/bledevicestatus.js';
import type { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import type { waterLeakDetectorStatus } from '../types/devicestatus.js';
import type { waterLeakDetectorWebhookContext } from '../types/devicewebhookstatus.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class WaterDetector extends deviceBase {
  // Services
  private Battery: {
    Name: CharacteristicValue
    Service: Service;
    BatteryLevel: CharacteristicValue;
    StatusLowBattery: CharacteristicValue;
    ChargingState: CharacteristicValue;
  };

  private LeakSensor?: {
    Name: CharacteristicValue;
    Service: Service;
    StatusActive: CharacteristicValue;
    LeakDetected: CharacteristicValue;
  };

  // Updates
  WaterDetectorUpdateInProgress!: boolean;
  doWaterDetectorUpdate: Subject<void>;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device);
    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doWaterDetectorUpdate = new Subject();
    this.WaterDetectorUpdateInProgress = false;

    // Initialize Battery Service
    accessory.context.Battery = accessory.context.Battery ?? {};
    this.Battery = {
      Name: accessory.context.Battery.Name ?? `${accessory.displayName} Battery`,
      Service: accessory.getService(this.hap.Service.Battery) ?? accessory.addService(this.hap.Service.Battery) as Service,
      BatteryLevel: accessory.context.BatteryLevel ?? 100,
      StatusLowBattery: accessory.context.StatusLowBattery ?? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      ChargingState: accessory.context.ChargingState ?? this.hap.Characteristic.ChargingState.NOT_CHARGEABLE,
    };
    accessory.context.Battery = this.Battery as object;

    // Initialize Battery Characteristic
    this.Battery.Service
      .setCharacteristic(this.hap.Characteristic.Name, this.Battery.Name)
      .setCharacteristic(this.hap.Characteristic.ChargingState, this.hap.Characteristic.ChargingState.NOT_CHARGEABLE)
      .getCharacteristic(this.hap.Characteristic.BatteryLevel)
      .onGet(() => {
        return this.Battery.StatusLowBattery;
      });

    this.Battery.Service
      .getCharacteristic(this.hap.Characteristic.StatusLowBattery)
      .onGet(() => {
        return this.Battery.StatusLowBattery;
      });

    // Initialize Leak Sensor Service
    if (device.waterdetector?.hide_leak) {
      if (this.LeakSensor) {
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Leak Sensor Service`);
        this.LeakSensor.Service = this.accessory.getService(this.hap.Service.LeakSensor) as Service;
        accessory.removeService(this.LeakSensor.Service);
      } else {
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Leak Sensor Service Not Found`);
      }
    } else {
      accessory.context.LeakSensor = accessory.context.LeakSensor ?? {};
      this.LeakSensor = {
        Name: accessory.context.LeakSensor.Name ?? `${accessory.displayName} Leak Sensor`,
        Service: accessory.getService(this.hap.Service.LeakSensor) ?? this.accessory.addService(this.hap.Service.LeakSensor) as Service,
        StatusActive: accessory.context.StatusActive ?? false,
        LeakDetected: accessory.context.LeakDetected ?? this.hap.Characteristic.LeakDetected.LEAK_NOT_DETECTED,
      };
      accessory.context.LeakSensor = this.LeakSensor as object;

      // Initialize LeakSensor Characteristic
      this.LeakSensor!.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.LeakSensor.Name)
        .setCharacteristic(this.hap.Characteristic.StatusActive, true)
        .getCharacteristic(this.hap.Characteristic.LeakDetected)
        .onGet(() => {
          return this.LeakSensor!.LeakDetected;
        });
    }

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    //regisiter webhook event handler
    this.registerWebhook();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.WaterDetectorUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });
  }

  async BLEparseStatus(serviceData: waterLeakDetectorServiceData): Promise<void> {
    await this.debugLog('BLEparseStatus');
    if (this.device.waterdetector?.hide_leak && this.LeakSensor?.Service) {
      // StatusActive
      this.LeakSensor.StatusActive = serviceData.state;
      await this.debugLog(`StatusActive: ${this.LeakSensor.StatusActive}`);
      // LeakDetected
      this.LeakSensor.LeakDetected = serviceData.status;
      this.debugLog(`LeakDetected: ${this.LeakSensor.LeakDetected}`);
    }
    // BatteryLevel
    this.Battery.BatteryLevel = Number(serviceData.battery);
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`);
    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`);
  }

  async openAPIparseStatus(deviceStatus: waterLeakDetectorStatus): Promise<void> {
    await this.debugLog('openAPIparseStatus');
    if (!this.device.waterdetector?.hide_leak && this.LeakSensor?.Service) {
      // StatusActive
      this.LeakSensor.StatusActive = deviceStatus.battery === 0 ? false : true;
      await this.debugLog(`StatusActive: ${this.LeakSensor.StatusActive}`);
      // LeakDetected
      this.LeakSensor.LeakDetected = deviceStatus.status;
      this.debugLog(`LeakDetected: ${this.LeakSensor.LeakDetected}`);
    }
    // BatteryLevel
    this.Battery.BatteryLevel = Number(deviceStatus.battery);
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`);
    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`);
    // FirmwareVersion
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

  async parseStatusWebhook(context: waterLeakDetectorWebhookContext): Promise<void> {
    await this.debugLog('parseStatusWebhook');
    await this.debugLog(`(detectionState, battery) = Webhook: (${context.detectionState}, ${context.battery}),`
      + ` current:(${this.LeakSensor?.LeakDetected}, ${this.Battery.BatteryLevel})`);
    if (!this.device.waterdetector?.hide_leak && this.LeakSensor?.Service) {
      // StatusActive
      this.LeakSensor.StatusActive = context.detectionState ? true : false;
      await this.debugLog(`StatusActive: ${this.LeakSensor.StatusActive}`);
      // LeakDetected
      this.LeakSensor.LeakDetected = context.detectionState;
      await this.debugLog(`LeakDetected: ${this.LeakSensor.LeakDetected}`);
    }
    // BatteryLevel
    this.Battery.BatteryLevel = Number(context.battery);
    await this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`);
    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    await this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`);
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
        const serviceData = await this.monitorAdvertisementPackets(switchbot) as unknown as waterLeakDetectorServiceData;
        // Update HomeKit
        if (serviceData.model === SwitchBotBLEModel.Unknown && serviceData.modelName === SwitchBotBLEModelName.Unknown) {
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
      this.platform.webhookEventHandler[this.device.deviceId] = async (context: waterLeakDetectorWebhookContext) => {
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
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    if (!this.device.waterdetector?.hide_leak && this.LeakSensor?.Service) {
      // StatusActive
      await this.updateCharacteristic(this.LeakSensor.Service, this.hap.Characteristic.StatusActive,
        this.LeakSensor.StatusActive, 'StatusActive');
      // LeakDetected
      await this.updateCharacteristic(this.LeakSensor.Service, this.hap.Characteristic.LeakDetected,
        this.LeakSensor.LeakDetected, 'LeakDetected');
    }
    // BatteryLevel
    await this.updateCharacteristic(this.Battery.Service, this.hap.Characteristic.BatteryLevel,
      this.Battery.BatteryLevel, 'BatteryLevel');
    // StatusLowBattery
    await this.updateCharacteristic(this.Battery.Service, this.hap.Characteristic.StatusLowBattery,
      this.Battery.StatusLowBattery, 'StatusLowBattery');
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
      if (!this.device.waterdetector?.hide_leak && this.LeakSensor?.Service) {
        this.LeakSensor.Service.updateCharacteristic(this.hap.Characteristic.StatusActive, false);
        this.LeakSensor.Service.updateCharacteristic(this.hap.Characteristic.LeakDetected, this.hap.Characteristic.LeakDetected.LEAK_NOT_DETECTED);
      }
    }
  }

  async apiError(e: any): Promise < void> {
    if(!this.device.waterdetector?.hide_leak && this.LeakSensor?.Service) {
      this.LeakSensor.Service.updateCharacteristic(this.hap.Characteristic.StatusActive, e);
      this.LeakSensor.Service.updateCharacteristic(this.hap.Characteristic.LeakDetected, e);
    }
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e);
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e);
  }
}
