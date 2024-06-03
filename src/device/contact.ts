/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * contact.ts: @switchbot/homebridge-switchbot.
 */
import { deviceBase } from './device.js';
import { interval, Subject } from 'rxjs';
import { skipWhile } from 'rxjs/operators';

import type { SwitchBotPlatform } from '../platform.js';
import type { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import type { device, devicesConfig, serviceData, deviceStatus } from '../settings.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Contact extends deviceBase {
  // Services
  private ContactSensor: {
    Name: CharacteristicValue;
    Service: Service;
    ContactSensorState: CharacteristicValue;
  };

  private Battery: {
    Name: CharacteristicValue;
    Service: Service;
    BatteryLevel: CharacteristicValue;
    StatusLowBattery: CharacteristicValue;
  };

  private MotionSensor?: {
    Name: CharacteristicValue;
    Service: Service;
    MotionDetected: CharacteristicValue;
  };

  private LightSensor?: {
    Name: CharacteristicValue;
    Service: Service;
    CurrentAmbientLightLevel: CharacteristicValue;
  };

  // Updates
  contactUpdateInProgress!: boolean;
  doContactUpdate!: Subject<void>;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device);
    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doContactUpdate = new Subject();
    this.contactUpdateInProgress = false;

    // Initialize Contact Sensor Service
    accessory.context.ContactSensor = accessory.context.ContactSensor ?? {};
    this.ContactSensor = {
      Name: accessory.context.ContactSensor.Name ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service.ContactSensor) ?? accessory.addService(this.hap.Service.ContactSensor) as Service,
      ContactSensorState: accessory.context.ContactSensorState ?? this.hap.Characteristic.ContactSensorState.CONTACT_DETECTED,
    };
    accessory.context.ContactSensor = this.ContactSensor as object;

    // Initialize ContactSensor Characteristics
    this.ContactSensor.Service
      .setCharacteristic(this.hap.Characteristic.Name, this.ContactSensor.Name)
      .setCharacteristic(this.hap.Characteristic.StatusActive, true)
      .getCharacteristic(this.hap.Characteristic.ContactSensorState)
      .onGet(() => {
        return this.ContactSensor.ContactSensorState;
      });

    // Initialize Battery Service
    accessory.context.Battery = accessory.context.Battery ?? {};
    this.Battery = {
      Name: accessory.context.Battery.Name ?? `${accessory.displayName} Battery`,
      Service: accessory.getService(this.hap.Service.Battery) ?? accessory.addService(this.hap.Service.Battery) as Service,
      BatteryLevel: accessory.context.BatteryLevel ?? 100,
      StatusLowBattery: accessory.context.StatusLowBattery ?? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
    };
    accessory.context.Battery = this.Battery as object;

    // Initialize Battery Characteristics
    this.Battery.Service
      .setCharacteristic(this.hap.Characteristic.Name, this.Battery.Name)
      .setCharacteristic(this.hap.Characteristic.ChargingState, this.hap.Characteristic.ChargingState.NOT_CHARGEABLE)
      .getCharacteristic(this.hap.Characteristic.BatteryLevel)
      .onGet(() => {
        return this.Battery.BatteryLevel;
      });

    this.Battery.Service
      .setCharacteristic(this.hap.Characteristic.StatusLowBattery, this.Battery.StatusLowBattery)
      .getCharacteristic(this.hap.Characteristic.StatusLowBattery)
      .onGet(() => {
        return this.Battery.StatusLowBattery;
      });

    // Initialize Motion Sensor Service
    if (this.device.contact?.hide_motionsensor) {
      if (this.MotionSensor) {
        this.debugLog(`${device.deviceType}: ${accessory.displayName} Removing Motion Sensor Service`);
        this.MotionSensor.Service = accessory.getService(this.hap.Service.MotionSensor) as Service;
        accessory.removeService(this.MotionSensor.Service);
      }
    } else {
      accessory.context.MotionSensor = accessory.context.MotionSensor ?? {};
      this.MotionSensor = {
        Name: accessory.context.MotionSensor.Name ?? `${accessory.displayName} Motion Sensor`,
        Service: accessory.getService(this.hap.Service.MotionSensor) ?? accessory.addService(this.hap.Service.MotionSensor) as Service,
        MotionDetected: accessory.context.MotionDetected ?? false,
      };
      accessory.context.MotionSensor = this.MotionSensor as object;

      // Motion Sensor Characteristics
      this.MotionSensor.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.MotionSensor.Name)
        .setCharacteristic(this.hap.Characteristic.StatusActive, true)
        .getCharacteristic(this.hap.Characteristic.MotionDetected)
        .onGet(() => {
          return this.MotionSensor!.MotionDetected;
        });
    }

    // Initialize Light Sensor Service
    if (device.contact?.hide_lightsensor) {
      if (this.LightSensor) {
        this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Light Sensor Service`);
        this.LightSensor.Service = accessory.getService(this.hap.Service.LightSensor) as Service;
        accessory.removeService(this.LightSensor.Service);
      }
    } else {
      accessory.context.LightSensor = accessory.context.LightSensor ?? {};
      this.LightSensor = {
        Name: accessory.context.LightSensor.Name ?? `${accessory.displayName} Light Sensor`,
        Service: accessory.getService(this.hap.Service.LightSensor) ?? accessory.addService(this.hap.Service.LightSensor) as Service,
        CurrentAmbientLightLevel: accessory.context.CurrentAmbientLightLevel ?? 0.0001,
      };
      accessory.context.LightSensor = this.LightSensor as object;

      // Light Sensor Characteristics
      this.LightSensor.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.LightSensor.Name)
        .setCharacteristic(this.hap.Characteristic.StatusActive, true)
        .getCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel)
        .onGet(() => {
          return this.LightSensor!.CurrentAmbientLightLevel;
        });
    }

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.contactUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    //regisiter webhook event handler
    this.registerWebhook(accessory, device);
  }

  async BLEparseStatus(serviceData: serviceData): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);
    // Door State
    switch (serviceData.doorState) {
      case 'open':
      case 1:
        this.ContactSensor.ContactSensorState = this.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
        break;
      case 'close':
      case 0:
        this.ContactSensor.ContactSensorState = this.hap.Characteristic.ContactSensorState.CONTACT_DETECTED;
        break;
      default:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} timeout no closed, doorstate: ${serviceData.doorState}`);
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ContactSensorState: ${this.ContactSensor.ContactSensorState}`);
    if (
      this.ContactSensor.ContactSensorState !== this.accessory.context.ContactSensorState &&
      this.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
    ) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Opened`);
    }
    // Movement
    if (!this.device.contact?.hide_motionsensor) {
      this.MotionSensor!.MotionDetected = Boolean(serviceData.movement);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} MotionDetected: ${this.MotionSensor!.MotionDetected}`);
      if (this.MotionSensor!.MotionDetected !== this.accessory.context.MotionDetected && this.MotionSensor!.MotionDetected) {
        this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Detected Motion`);
      }
    }
    // Light Level
    if (!this.device.contact?.hide_lightsensor) {
      const set_minLux = this.device.contact?.set_minLux ?? 1;
      const set_maxLux = this.device.contact?.set_maxLux ?? 6001;
      switch (serviceData.lightLevel) {
        case true:
          this.LightSensor!.CurrentAmbientLightLevel = set_minLux;
          break;
        default:
          this.LightSensor!.CurrentAmbientLightLevel = set_maxLux;
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${serviceData.lightLevel},`
        + ` CurrentAmbientLightLevel: ${this.LightSensor!.CurrentAmbientLightLevel}`);
      if (this.LightSensor!.CurrentAmbientLightLevel !== this.accessory.context.CurrentAmbientLightLevel) {
        this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName}`
          + ` CurrentAmbientLightLevel: ${this.LightSensor!.CurrentAmbientLightLevel}`);
      }
    }
    // Battery
    this.Battery.BatteryLevel = Number(serviceData.battery);
    if (this.Battery.BatteryLevel < 10) {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel}, `
      + `StatusLowBattery: ${this.Battery.StatusLowBattery}`);
  }

  async openAPIparseStatus(deviceStatus: deviceStatus): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
    // Contact State
    if (deviceStatus.body.openState === 'open') {
      this.ContactSensor.ContactSensorState = this.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ContactSensorState: ${this.ContactSensor.ContactSensorState}`);
    } else if (deviceStatus.body.openState === 'close') {
      this.ContactSensor.ContactSensorState = this.hap.Characteristic.ContactSensorState.CONTACT_DETECTED;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ContactSensorState: ${this.ContactSensor.ContactSensorState}`);
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openState: ${deviceStatus.body.openState}`);
    }
    // Motion State
    if (!this.device.contact?.hide_motionsensor) {
      this.MotionSensor!.MotionDetected = deviceStatus.body.moveDetected!;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} MotionDetected: ${this.MotionSensor!.MotionDetected}`);
    }
    // Light Level
    if (!this.device.contact?.hide_lightsensor) {
      const set_minLux = this.device.contact?.set_minLux ?? 1;
      const set_maxLux = this.device.contact?.set_maxLux ?? 6001;
      switch (deviceStatus.body.brightness) {
        case 'dim':
          this.LightSensor!.CurrentAmbientLightLevel = set_minLux;
          break;
        case 'bright':
        default:
          this.LightSensor!.CurrentAmbientLightLevel = set_maxLux;
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
        + ` CurrentAmbientLightLevel: ${this.LightSensor!.CurrentAmbientLightLevel}`);
    }
    // Battery
    this.Battery.BatteryLevel = Number(deviceStatus.body.battery);
    if (this.Battery.BatteryLevel < 10) {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel}, `
      + `StatusLowBattery: ${this.Battery.StatusLowBattery}`);

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
    } else if (this.OpenAPI) {
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
          const { detectionState, brightness, openState } = context;
          const { ContactSensorState } = this.ContactSensor;
          const { CurrentAmbientLightLevel } = this.LightSensor ?? {};
          const { MotionDetected } = this.MotionSensor ?? {};
          this.debugLog(`${device.deviceType}: ${accessory.displayName} (detectionState, brightness, openState) = Webhook:(${detectionState}, `
            + `${brightness}, ${openState}), current:(${MotionDetected}, ${CurrentAmbientLightLevel}, ${ContactSensorState})`);
          const set_minLux = this.device.contact?.set_minLux ?? 1;
          const set_maxLux = this.device.contact?.set_maxLux ?? 6001;
          this.ContactSensor.ContactSensorState = openState === 'open' ? 1 : 0;
          if (!device.contact?.hide_motionsensor) {
            this.MotionSensor!.MotionDetected = detectionState === 'DETECTED' ? true : false;
          }
          if (!device.contact?.hide_lightsensor) {
            this.LightSensor!.CurrentAmbientLightLevel = brightness === 'bright' ? set_maxLux : set_minLux;
          }
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
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    // ContactSensorState
    await this.updateCharacteristic(this.ContactSensor.Service, this.hap.Characteristic.ContactSensorState,
      this.ContactSensor.ContactSensorState, 'ContactSensorState');
    // MotionDetected
    if (!this.device.contact?.hide_motionsensor && this.MotionSensor?.Service) {
      await this.updateCharacteristic(this.MotionSensor.Service, this.hap.Characteristic.MotionDetected,
        this.MotionSensor.MotionDetected, 'MotionDetected');
    }
    // CurrentAmbientLightLevel
    if (!this.device.contact?.hide_lightsensor && this.LightSensor?.Service) {
      await this.updateCharacteristic(this.LightSensor.Service, this.hap.Characteristic.CurrentAmbientLightLevel,
        this.LightSensor.CurrentAmbientLightLevel, 'CurrentAmbientLightLevel');
    }
    // BatteryLevel
    await this.updateCharacteristic(this.Battery.Service, this.hap.Characteristic.BatteryLevel,
      this.Battery.BatteryLevel, 'BatteryLevel');
    // StatusLowBattery
    await this.updateCharacteristic(this.Battery.Service, this.hap.Characteristic.StatusLowBattery,
      this.Battery.StatusLowBattery, 'StatusLowBattery');
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
      this.ContactSensor.Service.updateCharacteristic(this.hap.Characteristic.ContactSensorState,
        this.hap.Characteristic.ContactSensorState.CONTACT_DETECTED);
      if (!this.device.contact?.hide_motionsensor && this.MotionSensor?.Service) {
        this.MotionSensor.Service.updateCharacteristic(this.hap.Characteristic.MotionDetected, false);
      }
      if (!this.device.contact?.hide_lightsensor && this.LightSensor?.Service) {
        this.LightSensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, 100);
      }
    }
  }

  async apiError(e: any): Promise<void> {
    this.ContactSensor.Service.updateCharacteristic(this.hap.Characteristic.ContactSensorState, e);
    this.ContactSensor.Service.updateCharacteristic(this.hap.Characteristic.StatusActive, e);
    if (!this.device.contact?.hide_motionsensor && this.MotionSensor?.Service) {
      this.MotionSensor.Service.updateCharacteristic(this.hap.Characteristic.MotionDetected, e);
      this.MotionSensor.Service.updateCharacteristic(this.hap.Characteristic.StatusActive, e);
    }
    if (!this.device.contact?.hide_lightsensor && this.LightSensor?.Service) {
      this.LightSensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, e);
      this.LightSensor.Service.updateCharacteristic(this.hap.Characteristic.StatusActive, e);
    }
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e);
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e);
  }
}
