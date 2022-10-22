import https from 'https';
import crypto from 'crypto';
import { Context } from 'vm';
import { interval, Subject } from 'rxjs';
import { skipWhile } from 'rxjs/operators';
import superStringify from 'super-stringify';
import { SwitchBotPlatform } from '../platform';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { device, devicesConfig, serviceData, switchbot, deviceStatus, ad, HostDomain, DevicePath } from '../settings';
import { IncomingMessage } from 'http';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Motion {
  // Services
  motionSensorService: Service;
  lightSensorService?: Service;
  batteryService?: Service;

  // Characteristic Values
  MotionDetected!: CharacteristicValue;
  CurrentAmbientLightLevel!: CharacteristicValue;
  BatteryLevel?: CharacteristicValue;
  StatusLowBattery?: CharacteristicValue;

  // OpenAPI Others
  deviceStatus!: any; //deviceStatusResponse;
  moveDetected: deviceStatus['moveDetected'];
  brightness: deviceStatus['brightness'];

  // BLE Others
  scanning!: boolean;
  connected?: boolean;
  switchbot!: switchbot;
  serviceData!: serviceData;
  address!: ad['address'];
  battery!: serviceData['battery'];
  movement!: serviceData['movement'];
  lightLevel!: serviceData['lightLevel'];
  is_light!: any;//serviceData['is_light'];
  tested!: any;
  led!: any;
  iot!: any;
  sense_distance!: any;

  // Config
  set_minLux!: number;
  set_maxLux!: number;
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;

  // Updates
  motionUbpdateInProgress!: boolean;
  doMotionUpdate!: Subject<void>;

  // Connection
  private readonly BLE = (this.device.connectionType === 'BLE' || this.device.connectionType === 'BLE/OpenAPI');
  private readonly OpenAPI = (this.device.connectionType === 'OpenAPI' || this.device.connectionType === 'BLE/OpenAPI');

  constructor(private readonly platform: SwitchBotPlatform, private accessory: PlatformAccessory, public device: device & devicesConfig) {
    // default placeholders
    this.logs(device);
    this.scan(device);
    this.refreshRate(device);
    this.config(device);
    this.context();

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doMotionUpdate = new Subject();
    this.motionUbpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'W1101500')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision(accessory, device))
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
      .updateValue(this.FirmwareRevision(accessory, device));

    // get the Battery service if it exists, otherwise create a new Motion service
    // you can create multiple services for each accessory
    (this.motionSensorService = accessory.getService(this.platform.Service.MotionSensor) || accessory.addService(this.platform.Service.MotionSensor)),
    `${accessory.displayName} Motion Sensor`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Motion, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.motionSensorService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/MotionSensor

    // Light Sensor Service
    if (device.motion?.hide_lightsensor) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Light Sensor Service`);
      this.lightSensorService = this.accessory.getService(this.platform.Service.LightSensor);
      accessory.removeService(this.lightSensorService!);
    } else if (!this.lightSensorService) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Light Sensor Service`);
      (this.lightSensorService =
        this.accessory.getService(this.platform.Service.LightSensor) || this.accessory.addService(this.platform.Service.LightSensor)),
      `${accessory.displayName} Light Sensor`;

      this.lightSensorService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Light Sensor`);
    } else {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Light Sensor Service Not Added`);
    }

    // Battery Service
    if (!this.BLE) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Battery Service`);
      this.batteryService = this.accessory.getService(this.platform.Service.Battery);
      accessory.removeService(this.batteryService!);
    } else if (this.BLE && !this.batteryService) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Battery Service`);
      (this.batteryService = this.accessory.getService(this.platform.Service.Battery) || this.accessory.addService(this.platform.Service.Battery)),
      `${accessory.displayName} Battery`;

      this.batteryService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Battery`);
    } else {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Battery Service Not Added`);
    }

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.motionUbpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
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
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:`
      + ` ${this.device.connectionType}, parseStatus will not happen.`);
    }
  }

  async BLEparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);
    // Movement
    this.MotionDetected = this.movement!;
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} MotionDetected: ${this.MotionDetected}`);
    if ((this.MotionDetected !== this.accessory.context.MotionDetected) && this.MotionDetected) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Detected Motion`);
    }
    // Light Level
    if (!this.device.motion?.hide_lightsensor) {
      this.set_minLux = this.minLux();
      this.set_maxLux = this.maxLux();
      switch (this.lightLevel) {
        case 'dark':
        case 1:
          this.CurrentAmbientLightLevel = this.set_minLux;
          break;
        default:
          this.CurrentAmbientLightLevel = this.set_maxLux;
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel},` +
          ` CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
      if (this.CurrentAmbientLightLevel !== this.accessory.context.CurrentAmbientLightLevel) {
        this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
      }
    }
    // Battery
    if (this.battery === undefined) {
      this.battery = 100;
    }
    this.BatteryLevel = this.battery!;
    if (this.BatteryLevel < 10) {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel},`
    +` StatusLowBattery: ${this.StatusLowBattery}`);
  }

  async openAPIparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
    // Motion State
    this.MotionDetected = this.moveDetected!;
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} MotionDetected: ${this.MotionDetected}`);
    // Light Level
    if (!this.device.motion?.hide_lightsensor) {
      this.set_minLux = this.minLux();
      this.set_maxLux = this.maxLux();
      switch (this.brightness) {
        case 'dim':
          this.CurrentAmbientLightLevel = this.set_minLux;
          break;
        case 'bright':
        default:
          this.CurrentAmbientLightLevel = this.set_maxLux;
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
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
    const switchbot = await this.platform.connectBLE();
    // Convert to BLE Address
    this.device.bleMac =
      this.device.customBLEaddress ||
      this.device
        .deviceId!.match(/.{1,2}/g)!
        .join(':')
        .toLowerCase();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    this.getCustomBLEAddress(switchbot);
    // Start to monitor advertisement packets
    if (switchbot !== false) {
      await switchbot
        .startScan({
          model: 's',
          id: this.device.bleMac,
        })
        .then(async () => {
          // Set an event hander
          this.scanning = true;
          switchbot.onadvertisement = async (ad: any) => {
            this.address = ad.address;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac},`
            + ` BLE Address Found: ${this.address}`);
            this.serviceData = ad.serviceData;
            this.movement = ad.serviceData.movement;
            this.tested = ad.serviceData.tested;
            this.battery = ad.serviceData.battery;
            this.led = ad.serviceData.led;
            this.iot = ad.serviceData.led;
            this.sense_distance = ad.serviceData.sense_distance;
            this.lightLevel = ad.serviceData.lightLevel;
            this.is_light = ad.serviceData.is_light;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${superStringify(ad.serviceData)}`);
            this.debugLog(
              `${this.device.deviceType}: ${this.accessory.displayName} movement: ${ad.serviceData.movement}, is_light: ` +
                `${ad.serviceData.is_light}, lightLevel: ${ad.serviceData.lightLevel}, battery: ${ad.serviceData.battery}`,
            );

            if (this.serviceData) {
              this.connected = true;
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.connected}`);
              await this.stopScanning(switchbot);
              this.scanning = false;
              this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} scanning: ${this.scanning}`);
            } else {
              this.connected = false;
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.connected}`);
            }
          };
          // Wait
          return await switchbot.wait(this.scanDuration * 1000);
        })
        .then(async () => {
          // Stop to monitor
          this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} scanning: ${this.scanning}`);
          if (this.scanning) {
            await this.stopScanning(switchbot);
          }
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLERefreshStatus with ${this.device.connectionType}`
                + ` Connection, Error Message: ${superStringify(e.message)}`);
          await this.BLERefreshConnection(switchbot);
        });
    } else {
      await this.BLERefreshConnection(switchbot);
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const t = Date.now();
      const nonce = 'requestID';
      const data = this.platform.config.credentials?.token + t + nonce;
      const signTerm = crypto.createHmac('sha256', this.platform.config.credentials?.secret).update(Buffer.from(data, 'utf-8')).digest();
      const sign = signTerm.toString('base64');
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} sign: ${sign}`);
      const options = {
        hostname: HostDomain,
        port: 443,
        path: `${DevicePath}/${this.device.deviceId}/status`,
        method: 'GET',
        headers: {
          Authorization: this.platform.config.credentials?.token,
          sign: sign,
          nonce: nonce,
          t: t,
          'Content-Type': 'application/json',
        },
      };
      const req = https.request(options, (res) => {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus statusCode: ${res.statusCode}`);
        this.statusCode({ res });
        let rawData = '';
        res.on('data', (d) => {
          rawData += d;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} d: ${d}`);
        });
        res.on('end', () => {
          try {
            this.deviceStatus = JSON.parse(rawData);
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus: ${superStringify(this.deviceStatus)}`);
            this.moveDetected = this.deviceStatus.body.moveDetected;
            this.brightness = this.deviceStatus.body.brightness;
            this.openAPIparseStatus();
            this.updateHomeKitCharacteristics();
          } catch (e: any) {
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} error message: ${e.message}`);
          }
        });
      });
      req.on('error', (e: any) => {
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} error message: ${e.message}`);
      });
      req.end();
    } catch (e: any) {
      this.apiError(e);
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIRefreshStatus with ${this.device.connectionType}`
            + ` Connection, Error Message: ${superStringify(e.message)}`);
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    if (this.MotionDetected === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} MotionDetected: ${this.MotionDetected}`);
    } else {
      this.accessory.context.MotionDetected = this.MotionDetected;
      this.motionSensorService.updateCharacteristic(this.platform.Characteristic.MotionDetected, this.MotionDetected);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic MotionDetected: ${this.MotionDetected}`);
    }
    if (this.BLE) {
      if (this.BatteryLevel === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
      } else {
        this.accessory.context.BatteryLevel = this.BatteryLevel;
        this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
      }
      if (this.StatusLowBattery === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
      } else {
        this.accessory.context.StatusLowBattery = this.StatusLowBattery;
        this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
      }
      if (this.CurrentAmbientLightLevel === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
      } else {
        this.accessory.context.CurrentAmbientLightLevel = this.CurrentAmbientLightLevel;
        this.lightSensorService?.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, this.CurrentAmbientLightLevel);
        this.debugLog(
          `${this.device.deviceType}: ${this.accessory.displayName}`
          + ` updateCharacteristic CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`,
        );
      }
    }
  }

  async stopScanning(switchbot: any) {
    await switchbot.stopScan();
    if (this.connected) {
      await this.BLEparseStatus();
      await this.updateHomeKitCharacteristics();
    } else {
      await this.BLERefreshConnection(switchbot);
    }
  }

  async getCustomBLEAddress(switchbot: any) {
    if (this.device.customBLEaddress && this.deviceLogging.includes('debug')) {
      (async () => {
        // Start to monitor advertisement packets
        await switchbot.startScan({
          model: 's',
        });
        // Set an event handler
        switchbot.onadvertisement = (ad: any) => {
          this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} ad: ${superStringify(ad, null, '  ')}`);
        };
        await switchbot.wait(10000);
        // Stop to monitor
        switchbot.stopScan();
      })();
    }
  }

  async BLERefreshConnection(switchbot: any): Promise<void> {
    this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`);
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Refresh Status`);
      await this.openAPIRefreshStatus();
    }
  }

  minLux(): number {
    if (this.device.motion?.set_minLux) {
      this.set_minLux = this.device.motion!.set_minLux!;
    } else {
      this.set_minLux = 1;
    }
    return this.set_minLux;
  }

  maxLux(): number {
    if (this.device.motion?.set_maxLux) {
      this.set_maxLux = this.device.motion!.set_maxLux!;
    } else {
      this.set_maxLux = 6001;
    }
    return this.set_maxLux;
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

  async statusCode({ res }: { res: IncomingMessage }): Promise<void> {
    switch (res.statusCode) {
      case 151:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Device is offline.`);
        await this.offlineOff();
        break;
      case 171:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} is offline. Hub: ${this.device.hubDeviceId}`);
        await this.offlineOff();
        break;
      case 190:
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
            ` Or command: ${superStringify(res)} format is invalid`,
        );
        break;
      case 100:
        if (this.platform.debugMode) {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Command successfully sent.`);
        }
        break;
      default:
        if (this.platform.debugMode) {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Unknown statusCode.`);
        }
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      await this.context();
      await this.updateHomeKitCharacteristics();
    }
  }

  async apiError(e: any): Promise<void> {
    this.motionSensorService.updateCharacteristic(this.platform.Characteristic.MotionDetected, e);
    if (this.BLE) {
      this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, e);
      this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, e);
      this.lightSensorService?.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, e);
    }
  }

  FirmwareRevision(accessory: PlatformAccessory<Context>, device: device & devicesConfig): CharacteristicValue {
    let FirmwareRevision: string;
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
    + ` accessory.context.FirmwareRevision: ${accessory.context.FirmwareRevision}`);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} device.firmware: ${device.firmware}`);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} this.platform.version: ${this.platform.version}`);
    if (accessory.context.FirmwareRevision) {
      FirmwareRevision = accessory.context.FirmwareRevision;
    } else if (device.firmware) {
      FirmwareRevision = device.firmware;
    } else {
      FirmwareRevision = this.platform.version;
    }
    return FirmwareRevision;
  }

  async context() {
    if (this.MotionDetected === undefined) {
      this.MotionDetected = false;
    } else {
      this.MotionDetected = this.accessory.context.MotionDetected;
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

  async config(device: device & devicesConfig): Promise<void> {
    let config = {};
    if (device.motion) {
      config = device.motion;
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
    if (Object.entries(config).length !== 0) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Config: ${superStringify(config)}`);
    }
  }

  async logs(device: device & devicesConfig): Promise<void> {
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
