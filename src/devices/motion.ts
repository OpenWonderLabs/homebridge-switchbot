import * as rxjs from "rxjs";
import * as operators from "rxjs/operators";
import * as platform from "../platform";
import * as homebridge from "homebridge";
import * as settings from "../settings";

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Motion {
  // Services
  private service: homebridge.Service;
  private lightSensorService?: homebridge.Service;
  private batteryService?: homebridge.Service;

  // Characteristic Values
  MotionDetected!: homebridge.CharacteristicValue;
  CurrentAmbientLightLevel!: homebridge.CharacteristicValue;
  BatteryLevel?: homebridge.CharacteristicValue;
  StatusLowBattery?: homebridge.CharacteristicValue;

  // OpenAPI Others
  deviceStatus!: settings.deviceStatusResponse;
  moveDetected: settings.deviceStatus["moveDetected"];
  brightness: settings.deviceStatus["brightness"];

  // BLE Others
  connected?: boolean;
  switchbot!: settings.switchbot;
  SwitchToOpenAPI?: boolean;
  serviceData!: settings.serviceData;
  battery!: settings.serviceData["battery"];
  movement!: settings.serviceData["movement"];
  lightLevel!: settings.serviceData["lightLevel"];

  // Config
  set_minLux!: number;
  set_maxLux!: number;
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;

  // Updates
  motionUbpdateInProgress!: boolean;
  doMotionUpdate!: rxjs.Subject<void>;

  constructor(
    private readonly platform: platform.SwitchBotPlatform,
    private accessory: homebridge.PlatformAccessory,
    public device: settings.device & settings.devicesConfig,
  ) {
    // default placeholders
    this.logs(device);
    this.scan(device);
    this.refreshRate(device);
    this.config(device);
    this.MotionDetected = false;

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doMotionUpdate = new rxjs.Subject();
    this.motionUbpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, "SwitchBot")
      .setCharacteristic(
        this.platform.Characteristic.Model,
        "SWITCHBOT-WOMOTION-W1101500",
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        device.deviceId!,
      );

    // get the Battery service if it exists, otherwise create a new Motion service
    // you can create multiple services for each accessory
    (this.service =
      accessory.getService(this.platform.Service.MotionSensor) ||
      accessory.addService(this.platform.Service.MotionSensor)),
    `${accessory.displayName} Motion Sensor`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Motion, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.displayName,
    );

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/MotionSensor

    // Light Sensor Service
    if (device.motion?.hide_lightsensor) {
      this.debugLog(
        `Motion Sensor: ${accessory.displayName} Removing Light Sensor Service`,
      );
      this.lightSensorService = this.accessory.getService(
        this.platform.Service.LightSensor,
      );
      accessory.removeService(this.lightSensorService!);
    } else if (!this.lightSensorService) {
      this.debugLog(
        `Motion Sensor: ${accessory.displayName} Add Light Sensor Service`,
      );
      (this.lightSensorService =
        this.accessory.getService(this.platform.Service.LightSensor) ||
        this.accessory.addService(this.platform.Service.LightSensor)),
      `${accessory.displayName} Light Sensor`;

      this.lightSensorService.setCharacteristic(
        this.platform.Characteristic.Name,
        `${accessory.displayName} Light Sensor`,
      );
    } else {
      this.debugLog(
        `Motion Sensor: ${accessory.displayName} Light Sensor Service Not Added`,
      );
    }

    // Battery Service
    if (!device.ble) {
      this.debugLog(
        `Motion Sensor: ${accessory.displayName} Removing Battery Service`,
      );
      this.batteryService = this.accessory.getService(
        this.platform.Service.Battery,
      );
      accessory.removeService(this.batteryService!);
    } else if (device.ble && !this.batteryService) {
      this.debugLog(
        `Motion Sensor: ${accessory.displayName} Add Battery Service`,
      );
      (this.batteryService =
        this.accessory.getService(this.platform.Service.Battery) ||
        this.accessory.addService(this.platform.Service.Battery)),
      `${accessory.displayName} Battery`;

      this.batteryService.setCharacteristic(
        this.platform.Characteristic.Name,
        `${accessory.displayName} Battery`,
      );
    } else {
      this.debugLog(
        `Motion Sensor: ${accessory.displayName} Battery Service Not Added`,
      );
    }

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    rxjs
      .interval(this.deviceRefreshRate * 1000)
      .pipe(operators.skipWhile(() => this.motionUbpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });
  }

  /**
   * Parse the device status from the SwitchBot api
   */
  async parseStatus() {
    if (this.SwitchToOpenAPI || !this.device.ble) {
      await this.openAPIparseStatus();
    } else {
      await this.BLEparseStatus();
    }
  }

  private async BLEparseStatus() {
    this.debugLog(
      `Motion Sensor: ${this.accessory.displayName} BLE parseStatus`,
    );
    // Movement
    this.MotionDetected = this.movement!;
    this.debugLog(
      `Motion Sensor: ${this.accessory.displayName} MotionDetected: ${this.MotionDetected}`,
    );
    // Light Level
    if (!this.device.motion?.hide_lightsensor) {
      this.set_minLux = this.minLux();
      this.set_maxLux = this.maxLux();
      switch (this.lightLevel) {
        case "dark":
        case 1:
          this.CurrentAmbientLightLevel = this.set_minLux;
          break;
        default:
          this.CurrentAmbientLightLevel = this.set_maxLux;
      }
      this.debugLog(
        `Motion Sensor: ${this.accessory.displayName} LightLevel: ${this.lightLevel},` +
          ` CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`,
      );
    }
    // Battery
    if (this.battery === undefined) {
      this.battery = 100;
    }
    this.BatteryLevel = this.battery!;
    if (this.BatteryLevel < 10) {
      this.StatusLowBattery =
        this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery =
        this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.debugLog(
      `Motion Sensor: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}, StatusLowBattery: ${this.StatusLowBattery}`,
    );
  }

  private async openAPIparseStatus() {
    if (this.device.ble) {
      this.SwitchToOpenAPI = false;
    }
    if (this.platform.config.credentials?.openToken) {
      this.debugLog(
        `Motion Sensor: ${this.accessory.displayName} OpenAPI parseStatus`,
      );
      // Motion State
      this.MotionDetected = this.moveDetected!;
      this.debugLog(
        `Motion Sensor: ${this.accessory.displayName} MotionDetected: ${this.MotionDetected}`,
      );
      // Light Level
      if (!this.device.motion?.hide_lightsensor) {
        this.set_minLux = this.minLux();
        this.set_maxLux = this.maxLux();
        switch (this.brightness) {
          case "dim":
            this.CurrentAmbientLightLevel = this.set_minLux;
            break;
          case "bright":
          default:
            this.CurrentAmbientLightLevel = this.set_maxLux;
        }
        this.debugLog(
          `Motion Sensor: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`,
        );
      }
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

  private async BLERefreshStatus() {
    this.debugLog(
      `Motion Sensor: ${this.accessory.displayName} BLE RefreshStatus`,
    );
    const switchbot = await this.platform.connectBLE();
    // Convert to BLE Address
    this.device.bleMac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(":")
      .toLowerCase();
    this.debugLog(
      `Motion Sensor: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`,
    );
    // Start to monitor advertisement packets
    try {
      await switchbot.discover({
        model: "s",
        quick: false,
      });
      // Start to monitor advertisement packets
      await switchbot.startScan({
        model: "s",
        id: this.device.bleMac,
      });
      // Set an event hander
      switchbot.onadvertisement = (ad: settings.ad) => {
        this.serviceData = ad.serviceData;
        this.movement = ad.serviceData.movement;
        this.battery = ad.serviceData.battery;
        this.lightLevel = ad.serviceData.lightLevel;
        this.debugLog(
          `Motion Sensor: ${
            this.accessory.displayName
          } serviceData: ${JSON.stringify(ad.serviceData)}`,
        );
        this.debugLog(
          `Motion Sensor: ${this.accessory.displayName} movement: ${ad.serviceData.movement}, lightLevel: ` +
            `${ad.serviceData.lightLevel}, battery: ${ad.serviceData.battery}`,
        );

        if (this.serviceData) {
          this.connected = true;
          this.debugLog(
            `Motion Sensor: ${this.accessory.displayName} connected: ${this.connected}`,
          );
        } else {
          this.connected = false;
          this.debugLog(
            `Motion Sensor: ${this.accessory.displayName} connected: ${this.connected}`,
          );
        }
      };
      // Wait 10 seconds
      await switchbot.wait(this.scanDuration * 1000);
      // Stop to monitor
      switchbot.stopScan();
      if (this.connected) {
        this.parseStatus();
        this.updateHomeKitCharacteristics();
      } else {
        this.errorLog(
          `Motion Sensor: ${this.accessory.displayName} wasn't able to establish BLE Connection`,
        );
        if (this.platform.config.credentials?.openToken) {
          this.warnLog(
            `Motion Sensor: ${this.accessory.displayName} Using OpenAPI Connection`,
          );
          this.SwitchToOpenAPI = true;
          await this.openAPIRefreshStatus();
        }
      }
    } catch (e: any) {
      this.errorLog(
        `Motion Sensor: ${this.accessory.displayName} failed refreshStatus with BLE Connection`,
      );
      if (this.deviceLogging.includes("debug")) {
        this.errorLog(
          `Motion Sensor: ${this.accessory.displayName} failed refreshStatus with BLE Connection,` +
            ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      if (this.platform.config.credentials?.openToken) {
        this.warnLog(
          `Motion Sensor: ${this.accessory.displayName} Using OpenAPI Connection`,
        );
        this.SwitchToOpenAPI = true;
        await this.openAPIRefreshStatus();
      }
      this.apiError(e);
    }
  }

  private async openAPIRefreshStatus() {
    if (this.platform.config.credentials?.openToken) {
      this.debugLog(
        `Motion Sensor: ${this.accessory.displayName} OpenAPI RefreshStatus`,
      );
      try {
        this.deviceStatus = (
          await this.platform.axios.get(
            `${settings.DeviceURL}/${this.device.deviceId}/status`,
          )
        ).data;
        this.debugLog(
          `Motion Sensor: ${
            this.accessory.displayName
          } refreshStatus: ${JSON.stringify(this.deviceStatus)}`,
        );
        if (this.deviceStatus.body.moveDetected === undefined) {
          this.errorLog(
            `Motion Sensor: ${
              this.accessory.displayName
            } refreshStatus: ${JSON.stringify(this.deviceStatus)}`,
          );
        }
        this.moveDetected = this.deviceStatus.body.moveDetected;
        this.brightness = this.deviceStatus.body.brightness;
        this.parseStatus();
        this.updateHomeKitCharacteristics();
      } catch (e: any) {
        this.errorLog(
          `Motion Sensor: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection`,
        );
        if (this.deviceLogging.includes("debug")) {
          this.errorLog(
            `Motion Sensor: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,` +
              ` Error Message: ${JSON.stringify(e.message)}`,
          );
        }
        this.apiError(e);
      }
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    if (this.MotionDetected === undefined) {
      this.debugLog(
        `Motion Sensor: ${this.accessory.displayName} MotionDetected: ${this.MotionDetected}`,
      );
    } else {
      this.service.updateCharacteristic(
        this.platform.Characteristic.MotionDetected,
        this.MotionDetected,
      );
      this.debugLog(
        `Motion Sensor: ${this.accessory.displayName} updateCharacteristic MotionDetected: ${this.MotionDetected}`,
      );
    }
    if (this.device.ble) {
      if (this.BatteryLevel === undefined) {
        this.debugLog(
          `Motion Sensor: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`,
        );
      } else {
        this.batteryService?.updateCharacteristic(
          this.platform.Characteristic.BatteryLevel,
          this.BatteryLevel,
        );
        this.debugLog(
          `Motion Sensor: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`,
        );
      }
      if (this.StatusLowBattery === undefined) {
        this.debugLog(
          `Motion Sensor: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`,
        );
      } else {
        this.batteryService?.updateCharacteristic(
          this.platform.Characteristic.StatusLowBattery,
          this.StatusLowBattery,
        );
        this.debugLog(
          `Motion Sensor: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`,
        );
      }
      if (this.CurrentAmbientLightLevel === undefined) {
        this.debugLog(
          `Motion Sensor: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`,
        );
      } else {
        this.lightSensorService?.updateCharacteristic(
          this.platform.Characteristic.CurrentAmbientLightLevel,
          this.CurrentAmbientLightLevel,
        );
        this.debugLog(
          `Motion Sensor: ${this.accessory.displayName}` +
            ` updateCharacteristic CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`,
        );
      }
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(
      this.platform.Characteristic.MotionDetected,
      e,
    );
    if (this.device.ble) {
      this.batteryService?.updateCharacteristic(
        this.platform.Characteristic.BatteryLevel,
        e,
      );
      this.batteryService?.updateCharacteristic(
        this.platform.Characteristic.StatusLowBattery,
        e,
      );
      this.lightSensorService?.updateCharacteristic(
        this.platform.Characteristic.CurrentAmbientLightLevel,
        e,
      );
    }
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  config(device: settings.device & settings.devicesConfig) {
    let config = {};
    if (device.motion) {
      config = device.motion;
    }
    if (device.ble !== undefined) {
      config["ble"] = device.ble;
    }
    if (device.logging !== undefined) {
      config["logging"] = device.logging;
    }
    if (device.refreshRate !== undefined) {
      config["refreshRate"] = device.refreshRate;
    }
    if (device.scanDuration !== undefined) {
      config["scanDuration"] = device.scanDuration;
    }
    if (Object.entries(config).length !== 0) {
      this.warnLog(
        `Motion Sensor: ${this.accessory.displayName} Config: ${JSON.stringify(
          config,
        )}`,
      );
    }
  }

  refreshRate(device: settings.device & settings.devicesConfig) {
    if (device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate =
        device.refreshRate;
      this.debugLog(
        `Motion Sensor: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`,
      );
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate =
        this.platform.config.options!.refreshRate;
      this.debugLog(
        `Motion Sensor: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`,
      );
    }
  }

  scan(device: settings.device & settings.devicesConfig) {
    if (device.scanDuration) {
      this.scanDuration = this.accessory.context.scanDuration =
        device.scanDuration;
      if (device.ble) {
        this.debugLog(
          `Motion Sensor: ${this.accessory.displayName} Using Device Config scanDuration: ${this.scanDuration}`,
        );
      }
    } else {
      this.scanDuration = this.accessory.context.scanDuration = 1;
      if (this.device.ble) {
        this.debugLog(
          `Motion Sensor: ${this.accessory.displayName} Using Default scanDuration: ${this.scanDuration}`,
        );
      }
    }
  }

  logs(device: settings.device & settings.devicesConfig) {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = "debugMode";
      this.debugLog(
        `Motion Sensor: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`,
      );
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(
        `Motion Sensor: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`,
      );
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging =
        this.platform.config.options?.logging;
      this.debugLog(
        `Motion Sensor: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`,
      );
    } else {
      this.deviceLogging = this.accessory.context.logging = "standard";
      this.debugLog(
        `Motion Sensor: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`,
      );
    }
  }

  private minLux(): number {
    if (this.device.motion?.set_minLux) {
      this.set_minLux = this.device.motion!.set_minLux!;
    } else {
      this.set_minLux = 1;
    }
    return this.set_minLux;
  }

  private maxLux(): number {
    if (this.device.motion?.set_maxLux) {
      this.set_maxLux = this.device.motion!.set_maxLux!;
    } else {
      this.set_maxLux = 6001;
    }
    return this.set_maxLux;
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

  errorLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.error(String(...log));
    }
  }

  debugLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging === "debug") {
        this.platform.log.info("[DEBUG]", String(...log));
      } else {
        this.platform.log.debug(String(...log));
      }
    }
  }

  enablingDeviceLogging(): boolean {
    return (
      this.deviceLogging.includes("debug") || this.deviceLogging === "standard"
    );
  }
}
