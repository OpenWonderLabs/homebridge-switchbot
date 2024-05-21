/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * contact.ts: @switchbot/homebridge-switchbot.
 */
import { deviceBase } from './device.js';
import { interval, Subject } from 'rxjs';
import { Devices } from '../settings.js';
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
    if (device.webhook) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} is listening webhook.`);
      this.platform.webhookEventHandler[this.device.deviceId] = async (context) => {
        try {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} received Webhook: ${JSON.stringify(context)}`);
          const { detectionState, brightness, openState } = context;
          const { ContactSensorState } = this.ContactSensor;
          const { CurrentAmbientLightLevel } = this.LightSensor ?? {};
          const { MotionDetected } = this.MotionSensor ?? {};
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ` +
            '(detectionState, brightness, openState) = ' +
            `Webhook:(${detectionState}, ${brightness}, ${openState}), ` +
            `current:(${MotionDetected}, ${CurrentAmbientLightLevel}, ${ContactSensorState})`);
          const set_minLux = await this.minLux();
          const set_maxLux = await this.maxLux();
          this.ContactSensor.ContactSensorState = openState === 'open' ? 1 : 0;
          if (!this.device.contact?.hide_motionsensor) {
            this.MotionSensor!.MotionDetected = detectionState === 'DETECTED' ? true : false;
          }
          if (!this.device.contact?.hide_lightsensor) {
            this.LightSensor!.CurrentAmbientLightLevel = brightness === 'bright' ? set_maxLux : set_minLux;
          }
          this.updateHomeKitCharacteristics();
        } catch (e: any) {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`);
        }
      };
    }
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
      const set_minLux = await this.minLux();
      const set_maxLux = await this.maxLux();
      switch (serviceData.lightLevel) {
        case true:
          this.LightSensor!.CurrentAmbientLightLevel = set_minLux;
          break;
        default:
          this.LightSensor!.CurrentAmbientLightLevel = set_maxLux;
      }
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${serviceData.lightLevel},` +
        ` CurrentAmbientLightLevel: ${this.LightSensor!.CurrentAmbientLightLevel}`,
      );
      if (this.LightSensor!.CurrentAmbientLightLevel !== this.accessory.context.CurrentAmbientLightLevel) {
        this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName}`
          + ` CurrentAmbientLightLevel: ${this.LightSensor!.CurrentAmbientLightLevel}`);
      }
    }
    // Battery
    if (serviceData.battery === undefined) {
      serviceData.battery === 100;
    }
    this.Battery.BatteryLevel = Number(serviceData.battery);
    if (this.Battery.BatteryLevel < 10) {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.debugLog(
      `${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel}, `
      + `StatusLowBattery: ${this.Battery.StatusLowBattery}`,
    );
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
      const set_minLux = await this.minLux();
      const set_maxLux = await this.maxLux();
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
    if (deviceStatus.body.battery === undefined) {
      deviceStatus.body.battery === 100;
    }
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
      await switchbot.startScan({ model: this.device.bleModel, id: this.device.bleMac });
      // Set an event handler
      switchbot.onadvertisement = (ad: any) => {
        if (this.device.bleMac === ad.address && ad.model === this.device.bleModel) {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ${JSON.stringify(ad, null, '  ')}`);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} address: ${ad.address}, model: ${ad.model}`);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        } else {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        }
      };
      // Wait 10 seconds
      await switchbot.wait(this.scanDuration * 1000);
      // Stop to monitor
      await switchbot.stopScan();
      // Update HomeKit
      await this.BLEparseStatus(switchbot.onadvertisement.serviceData);
      await this.updateHomeKitCharacteristics();
    })();
    if (switchbot === undefined) {
      await this.BLERefreshConnection(switchbot);
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode } = await this.platform.retryRequest(this.deviceMaxRetries, this.deviceDelayBetweenRetries,
        `${Devices}/${this.device.deviceId}/status`, { headers: this.platform.generateHeaders() });
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
      const deviceStatus: any = await body.json();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
      if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
        this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
        this.openAPIparseStatus(deviceStatus);
        this.updateHomeKitCharacteristics();
      } else {
        this.statusCode(statusCode);
        this.statusCode(deviceStatus.statusCode);
        if (deviceStatus.statusCode === 161 || deviceStatus.statusCode === 171) {
          this.offlineOff();
        }
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
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    if (this.ContactSensor.ContactSensorState === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ContactSensorState: ${this.ContactSensor.ContactSensorState}`);
    } else {
      this.accessory.context.ContactSensorState = this.ContactSensor.ContactSensorState;
      this.ContactSensor.Service.updateCharacteristic(this.hap.Characteristic.ContactSensorState, this.ContactSensor.ContactSensorState);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` ContactSensorState: ${this.ContactSensor.ContactSensorState}`);
    }
    if (!this.device.contact?.hide_motionsensor) {
      if (this.MotionSensor!.MotionDetected === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} MotionDetected: ${this.MotionSensor!.MotionDetected}`);
      } else {
        this.accessory.context.MotionDetected = this.MotionSensor!.MotionDetected;
        this.MotionSensor!.Service.updateCharacteristic(this.hap.Characteristic.MotionDetected, this.MotionSensor!.MotionDetected);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
          + ` MotionDetected: ${this.MotionSensor!.MotionDetected}`);
      }
    }
    if (!this.device.contact?.hide_lightsensor) {
      if (this.LightSensor?.CurrentAmbientLightLevel === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
          + ` CurrentAmbientLightLevel: ${this.LightSensor!.CurrentAmbientLightLevel}`);
      } else {
        this.accessory.context.CurrentAmbientLightLevel = this.LightSensor.CurrentAmbientLightLevel;
        this.LightSensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, this.LightSensor.CurrentAmbientLightLevel);
        this.debugLog(
          `${this.device.deviceType}: ${this.accessory.displayName}` +
          ` updateCharacteristic CurrentAmbientLightLevel: ${this.LightSensor.CurrentAmbientLightLevel}`,
        );
      }
    }
    if (this.Battery.BatteryLevel === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel}`);
    } else {
      this.accessory.context.BatteryLevel = this.Battery.BatteryLevel;
      this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, this.Battery.BatteryLevel);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.Battery.BatteryLevel}`);
    }
    if (this.Battery.StatusLowBattery === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatusLowBattery: ${this.Battery.StatusLowBattery}`);
    } else {
      this.accessory.context.StatusLowBattery = this.Battery.StatusLowBattery;
      this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, this.Battery.StatusLowBattery);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` StatusLowBattery: ${this.Battery.StatusLowBattery}`);
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

  async minLux(): Promise<number> {
    let set_minLux: number;
    if (this.device.contact?.set_minLux) {
      set_minLux = this.device.contact!.set_minLux!;
    } else {
      set_minLux = 1;
    }
    return set_minLux;
  }

  async maxLux(): Promise<number> {
    let set_maxLux: number;
    if (this.device.contact?.set_maxLux) {
      set_maxLux = this.device.contact!.set_maxLux!;
    } else {
      set_maxLux = 6001;
    }
    return set_maxLux;
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      this.ContactSensor.Service.updateCharacteristic(this.hap.Characteristic.ContactSensorState,
        this.hap.Characteristic.ContactSensorState.CONTACT_DETECTED);
      if (!this.device.contact?.hide_motionsensor) {
        this.MotionSensor!.Service.updateCharacteristic(this.hap.Characteristic.MotionDetected, false);
      }
      if (!this.device.contact?.hide_lightsensor) {
        this.LightSensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, 100);
      }
    }
  }

  async apiError(e: any): Promise<void> {
    this.ContactSensor.Service.updateCharacteristic(this.hap.Characteristic.ContactSensorState, e);
    this.ContactSensor.Service.updateCharacteristic(this.hap.Characteristic.StatusActive, e);
    if (!this.device.contact?.hide_motionsensor) {
      this.MotionSensor!.Service.updateCharacteristic(this.hap.Characteristic.MotionDetected, e);
      this.MotionSensor!.Service.updateCharacteristic(this.hap.Characteristic.StatusActive, e);
    }
    if (!this.device.contact?.hide_lightsensor) {
      this.LightSensor!.Service.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, e);
      this.LightSensor!.Service.updateCharacteristic(this.hap.Characteristic.StatusActive, e);
    }
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e);
    this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e);
  }
}
