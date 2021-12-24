import Switchbot from 'node-switchbot';
import { interval, Subject } from 'rxjs';
import { skipWhile } from 'rxjs/operators';
import { SwitchBotPlatform } from '../platform';
import { Service, PlatformAccessory, CharacteristicValue, HAPStatus } from 'homebridge';
import { DeviceURL, device, devicesConfig, serviceData, switchbot, deviceStatusResponse } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Contact {
  // Services
  private service: Service;
  private motionService?: Service;
  private lightSensorService?: Service;
  private batteryService?: Service;

  // Characteristic Values
  ContactSensorState!: CharacteristicValue;
  MotionDetected!: CharacteristicValue;
  CurrentAmbientLightLevel!: CharacteristicValue;
  BatteryLevel!: CharacteristicValue;
  StatusLowBattery!: CharacteristicValue;

  // OpenAPI others
  deviceStatus!: deviceStatusResponse;

  // BLE Others
  connected?: boolean;
  switchbot!: switchbot;
  serviceData!: serviceData;
  battery!: serviceData['battery'];
  movement!: serviceData['movement'];
  doorState!: serviceData['doorState'];
  lightLevel!: serviceData['lightLevel'];

  // Config
  deviceLogging!: string;
  deviceRefreshRate!: number;

  // Updates
  contactUbpdateInProgress!: boolean;
  doContactUpdate!: Subject<void>;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device & devicesConfig,
  ) {
    // default placeholders
    this.refreshRate();
    this.logs();
    this.ContactSensorState = this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;

    // Contact Config
    this.debugLog(`Contact Sensor: ${this.accessory.displayName} Config: (ble: ${device.ble}, offline: ${device.offline},`
      + ` hide_lightsensor: ${device.contact?.hide_lightsensor}, hide_motionsensor: ${device.contact?.hide_motionsensor})`);


    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doContactUpdate = new Subject();
    this.contactUbpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'SWITCHBOT-WOCONTACT-W1201500')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!);

    // get the Contact service if it exists, otherwise create a new Contact service
    // you can create multiple services for each accessory
    (this.service =
      accessory.getService(this.platform.Service.ContactSensor) ||
      accessory.addService(this.platform.Service.ContactSensor)), `${accessory.displayName} Contact Sensor`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Contact, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/MotionSensor

    // Motion Sensor Service
    if (device.contact?.hide_motionsensor) {
      this.debugLog(`Contact Sensor: ${accessory.displayName} Removing Motion Sensor Service`);
      this.motionService = this.accessory.getService(this.platform.Service.MotionSensor);
      accessory.removeService(this.motionService!);
    } else if (!this.motionService) {
      this.debugLog(`Contact Sensor: ${accessory.displayName} Add Motion Sensor Service`);
      (this.motionService =
        this.accessory.getService(this.platform.Service.MotionSensor) ||
        this.accessory.addService(this.platform.Service.MotionSensor)), `${accessory.displayName} Motion Sensor`;

      this.motionService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Motion Sensor`);

    } else {
      this.debugLog(`Contact Sensor: ${accessory.displayName} Motion Sensor Service Not Added`);
    }

    // Light Sensor Service
    if (device.contact?.hide_lightsensor) {
      this.debugLog(`Contact Sensor: ${accessory.displayName} Removing Light Sensor Service`);
      this.lightSensorService = this.accessory.getService(this.platform.Service.LightSensor);
      accessory.removeService(this.lightSensorService!);
    } else if (!this.lightSensorService) {
      this.debugLog(`Contact Sensor: ${accessory.displayName} Add Light Sensor Service`);
      (this.lightSensorService =
        this.accessory.getService(this.platform.Service.LightSensor) ||
        this.accessory.addService(this.platform.Service.LightSensor)), `${accessory.displayName} Light Sensor`;

      this.lightSensorService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Light Sensor`);

    } else {
      this.debugLog(`Contact Sensor: ${accessory.displayName} Light Sensor Service Not Added`);
    }

    if (device.ble) {
      (this.batteryService =
        accessory.getService(this.platform.Service.Battery) ||
        accessory.addService(this.platform.Service.Battery)), `${accessory.displayName} Battery`;

      this.batteryService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Battery`);
    }

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.contactUbpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });
  }

  refreshRate() {
    if (this.device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.device.refreshRate;
      if (this.platform.debugMode) {
        this.warnLog(`Using Device Config refreshRate: ${this.deviceRefreshRate}`);
      }
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options!.refreshRate;
      if (this.platform.debugMode) {
        this.warnLog(`Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
      }
    }
  }

  logs() {
    if (this.device.logging) {
      this.deviceLogging = this.accessory.context.logging = this.device.logging;
      if (this.platform.debugMode) {
        this.warnLog(`Using Device Config Logging: ${this.deviceLogging}`);
      }
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      if (this.platform.debugMode) {
        this.warnLog(`Using Platform Config Logging: ${this.deviceLogging}`);
      }
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      if (this.platform.debugMode) {
        this.warnLog('Using Device Standard Logging');
      }
    }
  }

  /**
   * Parse the device status from the SwitchBot api
   */
  async parseStatus() {
    if (this.device.ble) {
      await this.BLEparseStatus();
    } else {
      await this.openAPIparseStatus();
    }
  }

  private async BLEparseStatus() {
    this.debugLog(`Contact Sensor: ${this.accessory.displayName} BLE parseStatus`);
    if (this.device.contact?.hide_motionsensor) {
      // Movement
      this.MotionDetected = Boolean(this.movement);
    }
    // Door State
    switch (this.doorState) {
      case 'open':
      case 1:
        this.ContactSensorState = this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
        break;
      case 'close':
      case 0:
        this.ContactSensorState = this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;
        break;
      default:
        this.errorLog(`Contact Sensor: ${this.accessory.displayName} timeout no closed, doorstate: ${this.doorState}`);
    }
    if (this.device.contact?.hide_lightsensor) {// Light Level
      switch (this.lightLevel) {
        case 'dark':
        case 0:
          this.CurrentAmbientLightLevel = 0.0001;
          break;
        default:
          this.CurrentAmbientLightLevel = 100000;
      }
    }
    // Battery
    this.BatteryLevel = Number(this.battery);
    if (this.BatteryLevel < 10) {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }

    this.debugLog(`Contact Sensor: ${this.accessory.displayName} ContactSensorState: ${this.ContactSensorState}, MotionDetected: `
      + `${this.MotionDetected}, CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}, BatteryLevel: ${this.BatteryLevel}`);
  }

  private async openAPIparseStatus() {
    if (this.platform.config.credentials?.openToken) {
      this.debugLog(`Contact Sensor: ${this.accessory.displayName} OpenAPI parseStatus`);
      if (this.deviceStatus.body.openState === 'open') {
        this.ContactSensorState = this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
        this.debugLog(`Contact Sensor: ${this.accessory.displayName} ContactSensorState: ${this.ContactSensorState}`);
      } else if (this.deviceStatus.body.openState === 'close') {
        this.ContactSensorState = this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;
        this.debugLog(`Contact Sensor: ${this.accessory.displayName} ContactSensorState: ${this.ContactSensorState}`);
      } else {
        this.debugLog(`Contact Sensor: ${this.accessory.displayName} openState: ${this.deviceStatus.body.openState}`);
      }
      if (this.device.contact?.hide_motionsensor) {
        this.MotionDetected = Boolean(this.deviceStatus.body.moveDetected);
      }
      this.debugLog(`Contact Sensor: ${this.accessory.displayName} MotionDetected: ${this.MotionDetected}`);
    }
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus() {
    if (this.device.ble) {
      await this.BLERefreshStatus();
    } else {
      await this.openAPIRefreshStatus();
    }
  }

  private connectBLE() {
    const switchbot = new Switchbot();
    this.device.bleMac = ((this.device.deviceId!.match(/.{1,2}/g))!.join(':')).toLowerCase();
    this.debugLog(`Contact Sensor: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    return switchbot;
  }

  private async BLERefreshStatus() {
    this.debugLog(`Contact Sensor: ${this.accessory.displayName} BLE refreshStatus`);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const switchbot = this.connectBLE();
    // Start to monitor advertisement packets
    switchbot.startScan({
      model: 'd',
      id: this.device.bleMac,
    }).then(() => {
      // Set an event hander
      switchbot.onadvertisement = (ad: any) => {
        this.serviceData = ad.serviceData;
        this.movement = ad.serviceData.movement;
        this.doorState = ad.serviceData.doorState;
        this.lightLevel = ad.serviceData.lightLevel;
        this.battery = ad.serviceData.battery;
        this.debugLog(`Contact Sensor: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        this.debugLog(`Contact Sensor: ${this.accessory.displayName} movement: ${ad.serviceData.movement}, doorState: `
          + `${ad.serviceData.doorState}, lightLevel: ${ad.serviceData.lightLevel}, battery: ${ad.serviceData.battery}`);

        if (this.serviceData) {
          this.connected = true;
          this.debugLog(`Contact Sensor: ${this.accessory.displayName} connected: ${this.connected}`);
        } else {
          this.connected = false;
          this.debugLog(`Contact Sensor: ${this.accessory.displayName} connected: ${this.connected}`);
        }
      };
      // Wait 10 seconds
      return switchbot.wait(10000);
    }).then(async () => {
      // Stop to monitor
      switchbot.stopScan();
      if (this.connected) {
        this.parseStatus();
        this.updateHomeKitCharacteristics();
      } else {
        this.errorLog(`Contact Sensor: ${this.accessory.displayName} wasn't able to establish BLE Connection`);
        if (this.platform.config.credentials?.openToken) {
          this.warnLog(`Contact Sensor: ${this.accessory.displayName} Using OpenAPI Connection`);
          await this.openAPIRefreshStatus();
        }
      }
    }).catch(async (e: any) => {
      this.errorLog(`Contact Sensor: ${this.accessory.displayName} failed refreshStatus with BLE Connection`);
      if (this.deviceLogging === 'debug') {
        this.errorLog(`Contact Sensor: ${this.accessory.displayName} failed refreshStatus with BLE Connection,`
          + ` Error Message: ${JSON.stringify(e.message)}`);
      }
      if (this.platform.debugMode) {
        this.errorLog(`Contact Sensor: ${this.accessory.displayName} failed refreshStatus with BLE Connection,`
          + ` Error: ${JSON.stringify(e)}`);
      }
      if (this.platform.config.credentials?.openToken) {
        this.warnLog(`Contact Sensor: ${this.accessory.displayName} Using OpenAPI Connection`);
        await this.openAPIRefreshStatus();
      }
      this.apiError();
    });
  }

  private async openAPIRefreshStatus() {
    if (this.platform.config.credentials?.openToken) {
      this.debugLog(`Contact Sensor: ${this.accessory.displayName} OpenAPI refreshStatus`);
      try {
        this.deviceStatus = (await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)).data;
        this.debugLog(`Contact Sensor: ${this.accessory.displayName} refreshStatus: ${JSON.stringify(this.deviceStatus)}`);
        this.parseStatus();
        this.updateHomeKitCharacteristics();
      } catch (e: any) {
        this.errorLog(`Contact Sensor: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection`);
        if (this.deviceLogging === 'debug') {
          this.errorLog(`Contact Sensor: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,`
            + ` Error Message: ${JSON.stringify(e.message)}`);
        }
        if (this.platform.debugMode) {
          this.errorLog(`Contact Sensor: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,`
            + ` Error: ${JSON.stringify(e)}`);
        }
        this.apiError();
      }
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    if (this.ContactSensorState === undefined) {
      this.debugLog(`Contact Sensor: ${this.accessory.displayName} ContactSensorState: ${this.ContactSensorState}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.ContactSensorState, this.ContactSensorState);
      this.debugLog(`Contact Sensor: ${this.accessory.displayName} updateCharacteristic ContactSensorState: ${this.ContactSensorState}`);
    }
    if (!this.device.contact?.hide_motionsensor) {
      if (this.MotionDetected === undefined) {
        this.debugLog(`Contact Sensor: ${this.accessory.displayName} MotionDetected: ${this.MotionDetected}`);
      } else {
        this.motionService?.updateCharacteristic(this.platform.Characteristic.MotionDetected, this.MotionDetected);
        this.debugLog(`Contact Sensor: ${this.accessory.displayName} updateCharacteristic MotionDetected: ${this.MotionDetected}`);
      }
    }
    if (!this.device.contact?.hide_lightsensor) {
      if (this.CurrentAmbientLightLevel === undefined) {
        this.debugLog(`Contact Sensor: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
      } else {
        this.lightSensorService?.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, this.CurrentAmbientLightLevel);
        this.debugLog(`Contact Sensor: ${this.accessory.displayName}`
          + ` updateCharacteristic CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
      }
    }
    if (this.device.ble) {
      if (this.BatteryLevel === undefined) {
        this.debugLog(`Contact Sensor: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
      } else {
        this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
        this.debugLog(`Contact Sensor: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
      }
      if (this.StatusLowBattery === undefined) {
        this.debugLog(`Contact Sensor: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
      } else {
        this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
        this.debugLog(`Contact Sensor: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
      }
    }
  }

  public apiError() {
    throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
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
