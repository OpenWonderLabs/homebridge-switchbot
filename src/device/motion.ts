import { sleep } from '../utils.js';
import { interval, Subject } from 'rxjs';
import { skipWhile } from 'rxjs/operators';
import { SwitchBotPlatform } from '../platform.js';
import { Service, PlatformAccessory, CharacteristicValue, API, Logging, HAP } from 'homebridge';
import { device, devicesConfig, serviceData, deviceStatus, Devices, SwitchBotPlatformConfig } from '../settings.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Motion {
  public readonly api: API;
  public readonly log: Logging;
  public readonly config!: SwitchBotPlatformConfig;
  protected readonly hap: HAP;
  // Services
  batteryService: Service;
  motionSensorService!: Service;
  lightSensorService?: Service;

  // Characteristic Values
  BatteryLevel!: CharacteristicValue;
  MotionDetected!: CharacteristicValue;
  StatusLowBattery!: CharacteristicValue;
  FirmwareRevision!: CharacteristicValue;
  CurrentAmbientLightLevel!: CharacteristicValue;

  // OpenAPI Others
  OpenAPI_BatteryLevel: deviceStatus['battery'];
  OpenAPI_FirmwareRevision: deviceStatus['version'];
  OpenAPI_MotionDetected: deviceStatus['moveDetected'];
  OpenAPI_CurrentAmbientLightLevel: deviceStatus['brightness'];

  // Status
  BLE_BatteryLevel!: serviceData['battery'];
  BLE_MotionDetected!: serviceData['movement'];
  BLE_CurrentAmbientLightLevel!: serviceData['lightLevel'];

  // BLE Others
  scanning!: boolean;
  BLE_IsConnected?: boolean;

  // Config
  set_minLux!: number;
  set_maxLux!: number;
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;
  maxRetries!: number;
  delayBetweenRetries!: number;

  // Updates
  motionUbpdateInProgress!: boolean;
  doMotionUpdate!: Subject<void>;

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
    this.deviceRetry(device);
    this.deviceConfig(device);

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doMotionUpdate = new Subject();
    this.motionUbpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.hap.Characteristic.Model, 'W1101500')
      .setCharacteristic(this.hap.Characteristic.SerialNumber, device.deviceId)
      .setCharacteristic(this.hap.Characteristic.FirmwareRevision, accessory.context.FirmwareRevision);

    // get the Battery service if it exists, otherwise create a new Motion service
    // you can create multiple services for each accessory
    const motionSensorService = `${accessory.displayName} Motion Sensor`;
    (this.motionSensorService = accessory.getService(this.hap.Service.MotionSensor)
      || accessory.addService(this.hap.Service.MotionSensor)), motionSensorService;

    this.motionSensorService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
    if (!this.motionSensorService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
      this.motionSensorService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
    }
    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/MotionSensor

    // Light Sensor Service
    if (device.motion?.hide_lightsensor) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Light Sensor Service`);
      this.lightSensorService = this.accessory.getService(this.hap.Service.LightSensor);
      accessory.removeService(this.lightSensorService!);
    } else if (!this.lightSensorService) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Light Sensor Service`);
      const lightSensorService = `${accessory.displayName} Light Sensor`;
      (this.lightSensorService = this.accessory.getService(this.hap.Service.LightSensor)
        || this.accessory.addService(this.hap.Service.LightSensor)), lightSensorService;

      this.lightSensorService.setCharacteristic(this.hap.Characteristic.Name, `${accessory.displayName} Light Sensor`);
      this.lightSensorService.setCharacteristic(this.hap.Characteristic.ConfiguredName, `${accessory.displayName} Light Sensor`);
    } else {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Light Sensor Service Not Added`);
    }

    // Battery Service
    const batteryService = `${accessory.displayName} Battery`;
    (this.batteryService = this.accessory.getService(this.hap.Service.Battery)
      || accessory.addService(this.hap.Service.Battery)), batteryService;

    this.batteryService.setCharacteristic(this.hap.Characteristic.Name, `${accessory.displayName} Battery`);
    if (!this.batteryService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
      this.batteryService.addCharacteristic(this.hap.Characteristic.ConfiguredName, `${accessory.displayName} Battery`);
    }
    this.batteryService.setCharacteristic(this.hap.Characteristic.ChargingState, this.hap.Characteristic.ChargingState.NOT_CHARGEABLE);

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.motionUbpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    //regisiter webhook event handler
    if (this.device.webhook) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} is listening webhook.`);
      this.platform.webhookEventHandler[this.device.deviceId] = async (context) => {
        try {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} received Webhook: ${JSON.stringify(context)}`);
          const { detectionState } = context;
          const { MotionDetected } = this;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ` +
            '(detectionState) = ' +
            `Webhook:(${detectionState}), ` +
            `current:(${MotionDetected})`);
          this.MotionDetected = detectionState === 'DETECTED' ? true : false;
          this.updateHomeKitCharacteristics();
        } catch (e: any) {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`);
        }
      };
    }
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
    // Movement
    this.MotionDetected = this.BLE_MotionDetected!;
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} MotionDetected: ${this.MotionDetected}`);
    if (this.MotionDetected !== this.accessory.context.MotionDetected && this.MotionDetected) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Detected Motion`);
    }
    // Light Level
    if (!this.device.motion?.hide_lightsensor) {
      this.set_minLux = this.minLux();
      this.set_maxLux = this.maxLux();
      switch (this.BLE_CurrentAmbientLightLevel) {
        case 'dark':
        case 1:
          this.CurrentAmbientLightLevel = this.set_minLux;
          break;
        default:
          this.CurrentAmbientLightLevel = this.set_maxLux;
      }
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.BLE_CurrentAmbientLightLevel},` +
        ` CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`,
      );
      if (this.CurrentAmbientLightLevel !== this.accessory.context.CurrentAmbientLightLevel) {
        this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
      }
    }
    // Battery
    if (this.BLE_BatteryLevel === undefined) {
      this.BLE_BatteryLevel = 100;
    }
    this.BatteryLevel = this.BLE_BatteryLevel!;
    if (this.BatteryLevel < 10) {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.debugLog(
      `${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel},` + ` StatusLowBattery: ${this.StatusLowBattery}`,
    );
  }

  async openAPIparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
    // Motion State
    this.MotionDetected = this.OpenAPI_MotionDetected!;
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} MotionDetected: ${this.MotionDetected}`);
    // Light Level
    if (!this.device.motion?.hide_lightsensor) {
      this.set_minLux = this.minLux();
      this.set_maxLux = this.maxLux();
      switch (this.OpenAPI_CurrentAmbientLightLevel) {
        case 'dim':
          this.CurrentAmbientLightLevel = this.set_minLux;
          break;
        case 'bright':
        default:
          this.CurrentAmbientLightLevel = this.set_maxLux;
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
    }

    // Battery
    this.BatteryLevel = Number(this.OpenAPI_BatteryLevel);
    if (this.BatteryLevel < 10) {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    if (Number.isNaN(this.BatteryLevel)) {
      this.BatteryLevel = 100;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel},`
      + ` StatusLowBattery: ${this.StatusLowBattery}`);

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
    this.device.bleMac =
      this.device.customBLEaddress ||
      this.device
        .deviceId!.match(/.{1,2}/g)!
        .join(':')
        .toLowerCase();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    this.getCustomBLEAddress(switchbot);
    // Start to monitor advertisement packets
    (async () => {
      // Start to monitor advertisement packets
      await switchbot.startScan({
        model: 's',
        id: this.device.bleMac,
      });
      // Set an event handler
      switchbot.onadvertisement = (ad: any) => {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ${JSON.stringify(ad, null, '  ')}`);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} address: ${ad.address}, model: ${ad.serviceData.model}`);
        if (this.device.bleMac === ad.address && ad.serviceData.model === 's') {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
          this.BLE_MotionDetected = ad.serviceData.movement;
          this.BLE_BatteryLevel = ad.serviceData.battery;
          this.BLE_CurrentAmbientLightLevel = ad.serviceData.lightLevel;
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
      await switchbot
        .startScan({
          model: 's',
          id: this.device.bleMac,
        })
        .then(async () => {
          return await this.retry({
            max: this.maxRetry(),
            fn: async () => {
              // Set an event handler
              this.scanning = true;
              switchbot.onadvertisement = async (ad: ad) => {
                this.debugLog(
                  `${this.device.deviceType}: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac},` +
                  ` BLE Address Found: ${ad.address}`,
                );
                this.BLE_MotionDetected = ad.serviceData.movement;
                this.BLE_BatteryLevel = ad.serviceData.battery;
                this.BLE_CurrentAmbientLightLevel = ad.serviceData.lightLevel;
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
                this.debugLog(
                  `${this.device.deviceType}: ${this.accessory.displayName} movement: ${ad.serviceData.movement},`
                  + ` lightLevel: ${ad.serviceData.lightLevel}, battery: ${ad.serviceData.battery}`,
                );

                if (ad.serviceData) {
                  this.BLE_IsConnected = true;
                  this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.BLE_IsConnected}`);
                  this.debugErrorLog('1');
                  await this.stopScanning(switchbot);
                  this.scanning = false;
                  this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} scanning: ${this.scanning}`);
                } else {
                  this.BLE_IsConnected = false;
                  this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.BLE_IsConnected}`);
                }
              };
              // Wait
              return await sleep(this.scanDuration * 1000);
            },
          });
        })
        .then(async () => {
          // Stop to monitor
          this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} scanning: ${this.scanning}`);
          if (this.scanning) {
            this.debugErrorLog('2');
            await this.stopScanning(switchbot);
          }
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed BLERefreshStatus with ${this.device.connectionType}` +
            ` Connection, Error Message: ${JSON.stringify(e.message)}`,
          );
          this.debugErrorLog('3');
          await this.BLERefreshConnection(switchbot);
        });
    } else {
      this.debugErrorLog('4');
      await this.BLERefreshConnection(switchbot);
    }*/
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode } = await this.platform.retryRequest(this.maxRetries, this.delayBetweenRetries,
        `${Devices}/${this.device.deviceId}/status`, {
          headers: this.platform.generateHeaders(),
        });
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
      const deviceStatus: any = await body.json();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
      if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
        this.debugErrorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
        this.OpenAPI_MotionDetected = deviceStatus.body.moveDetected;
        this.OpenAPI_CurrentAmbientLightLevel = deviceStatus.body.brightness;
        this.OpenAPI_BatteryLevel = deviceStatus.body.battery;
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
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    if (this.MotionDetected === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} MotionDetected: ${this.MotionDetected}`);
    } else {
      this.accessory.context.MotionDetected = this.MotionDetected;
      this.motionSensorService.updateCharacteristic(this.hap.Characteristic.MotionDetected, this.MotionDetected);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic MotionDetected: ${this.MotionDetected}`);
    }
    if (this.BatteryLevel === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
    } else {
      this.accessory.context.BatteryLevel = this.BatteryLevel;
      this.batteryService?.updateCharacteristic(this.hap.Characteristic.BatteryLevel, this.BatteryLevel);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
    }
    if (this.StatusLowBattery === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
    } else {
      this.accessory.context.StatusLowBattery = this.StatusLowBattery;
      this.batteryService?.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, this.StatusLowBattery);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
    }
    if (this.BLE) {
      if (this.CurrentAmbientLightLevel === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
      } else {
        this.accessory.context.CurrentAmbientLightLevel = this.CurrentAmbientLightLevel;
        this.lightSensorService?.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, this.CurrentAmbientLightLevel);
        this.debugLog(
          `${this.device.deviceType}: ${this.accessory.displayName}` +
          ` updateCharacteristic CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`,
        );
      }
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
      (async () => {
        // Start to monitor advertisement packets
        await switchbot.startScan({
          model: 's',
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

  async apiError(e: any): Promise<void> {
    this.motionSensorService.updateCharacteristic(this.hap.Characteristic.MotionDetected, e);
    this.batteryService?.updateCharacteristic(this.hap.Characteristic.BatteryLevel, e);
    this.batteryService?.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, e);
    if (this.BLE) {
      this.lightSensorService?.updateCharacteristic(this.hap.Characteristic.CurrentAmbientLightLevel, e);
    }
  }

  async deviceContext() {
    if (this.MotionDetected === undefined) {
      this.MotionDetected = false;
    } else {
      this.MotionDetected = this.accessory.context.MotionDetected;
    }
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

  async deviceRetry(device: device & devicesConfig): Promise<void> {
    if (device.maxRetries === undefined) {
      this.maxRetries = 5; // Maximum number of retries
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Max Retries Not Set, Using: ${this.maxRetries}`);
    } else {
      this.maxRetries = device.maxRetries;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Max Retries: ${this.maxRetries}`);
    }
    if (device.delayBetweenRetries === undefined) {
      this.delayBetweenRetries = 3000; // Delay between retries in milliseconds
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Delay Between Retries Not Set, Using: ${this.delayBetweenRetries}`);
    } else {
      this.delayBetweenRetries = device.delayBetweenRetries;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Delay Between Retries: ${this.delayBetweenRetries}`);
    }
  }

  async deviceConfig(device: device & devicesConfig): Promise<void> {
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
  successLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.success(String(...log));
    }
  }

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
