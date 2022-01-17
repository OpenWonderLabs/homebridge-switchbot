import * as rxjs from "rxjs";
import * as operators from "rxjs/operators";
import * as platform_1 from "../platform";
import * as homebridge from "homebridge";
import * as settings from "../settings";

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Meter {
  // Services
  private batteryService?: homebridge.Service;
  private temperatureservice?: homebridge.Service;
  private humidityservice?: homebridge.Service;

  // Characteristic Values
  CurrentRelativeHumidity!: homebridge.CharacteristicValue;
  CurrentRelativeHumidityCached!: homebridge.CharacteristicValue;
  CurrentTemperature?: homebridge.CharacteristicValue;
  CurrentTemperatureCached?: homebridge.CharacteristicValue;
  BatteryLevel?: homebridge.CharacteristicValue;
  ChargingState?: homebridge.CharacteristicValue;
  StatusLowBattery?: homebridge.CharacteristicValue;
  Active!: homebridge.CharacteristicValue;
  WaterLevel!: homebridge.CharacteristicValue;

  // OpenAPI Others
  Temperature: settings.deviceStatus["temperature"];
  Humidity: settings.deviceStatus["humidity"];
  deviceStatus!: settings.deviceStatusResponse;

  // BLE Others
  connected?: boolean;
  switchbot!: settings.switchbot;
  SwitchToOpenAPI?: boolean;
  serviceData!: settings.serviceData;
  temperature!: settings.temperature["c"];
  battery!: settings.serviceData["battery"];
  humidity!: settings.serviceData["humidity"];

  // Config
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;

  // Updates
  meterUpdateInProgress!: boolean;
  doMeterUpdate: rxjs.Subject<void>;

  constructor(
    private readonly platform: platform_1.SwitchBotPlatform,
    private accessory: homebridge.PlatformAccessory,
    public device: settings.device & settings.devicesConfig,
  ) {
    // default placeholders
    this.logs(device);
    this.scan(device);
    this.refreshRate(device);
    this.config(device);
    if (this.CurrentRelativeHumidity === undefined) {
      this.CurrentRelativeHumidity = 0;
    } else {
      this.CurrentRelativeHumidity =
        this.accessory.context.CurrentRelativeHumidity;
    }
    if (this.CurrentTemperature === undefined) {
      this.CurrentTemperature = 0;
    } else {
      this.CurrentTemperature = this.accessory.context.CurrentTemperature;
    }

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doMeterUpdate = new rxjs.Subject();
    this.meterUpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, "SwitchBot")
      .setCharacteristic(
        this.platform.Characteristic.Model,
        "SWITCHBOT-METERTH-S1",
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        device.deviceId!,
      );

    // Temperature Sensor Service
    if (device.meter?.hide_temperature) {
      this.debugLog(
        `Meter: ${accessory.displayName} Removing Temperature Sensor Service`,
      );
      this.temperatureservice = this.accessory.getService(
        this.platform.Service.TemperatureSensor,
      );
      accessory.removeService(this.temperatureservice!);
    } else if (!this.temperatureservice) {
      this.debugLog(
        `Meter: ${accessory.displayName} Add Temperature Sensor Service`,
      );
      (this.temperatureservice =
        this.accessory.getService(this.platform.Service.TemperatureSensor) ||
        this.accessory.addService(this.platform.Service.TemperatureSensor)),
      `${accessory.displayName} Temperature Sensor`;

      this.temperatureservice.setCharacteristic(
        this.platform.Characteristic.Name,
        `${accessory.displayName} Temperature Sensor`,
      );

      this.temperatureservice
        .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .setProps({
          unit: homebridge.Units["CELSIUS"],
          validValueRanges: [-273.15, 100],
          minValue: -273.15,
          maxValue: 100,
          minStep: 0.1,
        })
        .onGet(() => {
          return this.CurrentTemperature!;
        });
    } else {
      this.debugLog(
        `Meter: ${accessory.displayName} Temperature Sensor Service Not Added`,
      );
    }

    // Humidity Sensor Service
    if (device.meter?.hide_humidity) {
      this.debugLog(
        `Meter: ${accessory.displayName} Removing Humidity Sensor Service`,
      );
      this.humidityservice = this.accessory.getService(
        this.platform.Service.HumiditySensor,
      );
      accessory.removeService(this.humidityservice!);
    } else if (!this.humidityservice) {
      this.debugLog(
        `Meter: ${accessory.displayName} Add Humidity Sensor Service`,
      );
      (this.humidityservice =
        this.accessory.getService(this.platform.Service.HumiditySensor) ||
        this.accessory.addService(this.platform.Service.HumiditySensor)),
      `${accessory.displayName} Humidity Sensor`;

      this.humidityservice.setCharacteristic(
        this.platform.Characteristic.Name,
        `${accessory.displayName} Humidity Sensor`,
      );

      this.humidityservice
        .getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .setProps({
          minStep: 0.1,
        })
        .onGet(() => {
          return this.CurrentRelativeHumidity;
        });
    } else {
      this.debugLog(
        `Meter: ${accessory.displayName} Humidity Sensor Service Not Added`,
      );
    }

    // Battery Service
    if (!device.ble) {
      this.debugLog(`Meter: ${accessory.displayName} Removing Battery Service`);
      this.batteryService = this.accessory.getService(
        this.platform.Service.Battery,
      );
      accessory.removeService(this.batteryService!);
    } else if (device.ble && !this.batteryService) {
      this.debugLog(`Meter: ${accessory.displayName} Add Battery Service`);
      (this.batteryService =
        this.accessory.getService(this.platform.Service.Battery) ||
        this.accessory.addService(this.platform.Service.Battery)),
      `${accessory.displayName} Battery`;

      this.batteryService.setCharacteristic(
        this.platform.Characteristic.Name,
        `${accessory.displayName} Battery`,
      );

      this.batteryService.setCharacteristic(
        this.platform.Characteristic.ChargingState,
        this.platform.Characteristic.ChargingState.NOT_CHARGEABLE,
      );
    } else {
      this.debugLog(
        `Meter: ${accessory.displayName} Battery Service Not Added`,
      );
    }

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    rxjs
      .interval(this.deviceRefreshRate * 1000)
      .pipe(operators.skipWhile(() => this.meterUpdateInProgress))
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
    this.debugLog(`Meter: ${this.accessory.displayName} BLE parseStatus`);

    // Battery
    this.BatteryLevel = Number(this.battery);
    if (this.BatteryLevel < 15) {
      this.StatusLowBattery =
        this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery =
        this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.debugLog(
      `${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}, StatusLowBattery: ${this.StatusLowBattery}`,
    );

    // Humidity
    if (!this.device.meter?.hide_humidity) {
      this.CurrentRelativeHumidity = this.humidity!;
      this.debugLog(
        `Meter: ${this.accessory.displayName} Humidity: ${this.CurrentRelativeHumidity}%`,
      );
    }

    // Current Temperature
    if (!this.device.meter?.hide_temperature) {
      this.temperature < 0
        ? 0
        : this.temperature > 100
          ? 100
          : this.temperature;
      this.CurrentTemperature = this.temperature;
      this.debugLog(
        `Meter: ${this.accessory.displayName} Temperature: ${this.CurrentTemperature}°c`,
      );
    }
  }

  private async openAPIparseStatus() {
    if (this.device.ble) {
      this.SwitchToOpenAPI = false;
    }
    if (this.platform.config.credentials?.openToken) {
      this.debugLog(`Meter: ${this.accessory.displayName} OpenAPI parseStatus`);
      // Current Relative Humidity
      if (!this.device.meter?.hide_humidity) {
        this.CurrentRelativeHumidity = this.Humidity!;
        this.debugLog(
          `Meter: ${this.accessory.displayName} Humidity: ${this.CurrentRelativeHumidity}%`,
        );
      }

      // Current Temperature
      if (!this.device.meter?.hide_temperature) {
        this.CurrentTemperature = this.Temperature!;
        this.debugLog(
          `Meter: ${this.accessory.displayName} Temperature: ${this.CurrentTemperature}°c`,
        );
      }
    }
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus() {
    if (this.device.ble) {
      this.BLErefreshStatus();
    } else {
      this.openAPIRefreshStatus();
    }
  }

  private async BLErefreshStatus() {
    this.debugLog(`Meter: ${this.accessory.displayName} BLE RefreshStatus`);
    const switchbot = await this.platform.connectBLE();
    // Convert to BLE Address
    this.device.bleMac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(":")
      .toLowerCase();
    this.debugLog(
      `Meter: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`,
    );
    try {
      await switchbot.discover({
        model: "T",
        quick: false,
      });
      // Start to monitor advertisement packets
      await switchbot.startScan({
        model: "T",
        id: this.device.bleMac,
      });
      // Set an event hander
      switchbot.onadvertisement = (ad: settings.ad) => {
        this.serviceData = ad.serviceData;
        this.temperature = ad.serviceData.temperature!.c;
        this.humidity = ad.serviceData.humidity;
        this.battery = ad.serviceData.battery;
        this.debugLog(
          `Meter: ${this.accessory.displayName} serviceData: ${JSON.stringify(
            ad.serviceData,
          )}`,
        );
        this.debugLog(
          `Meter: ${this.accessory.displayName} model: ${ad.serviceData.model}, modelName: ${ad.serviceData.modelName}, ` +
            `temperature: ${JSON.stringify(
              ad.serviceData.temperature?.c,
            )}, humidity: ${ad.serviceData.humidity}, ` +
            `battery: ${ad.serviceData.battery}`,
        );

        if (this.serviceData) {
          this.connected = true;
          this.debugLog(
            `Meter: ${this.accessory.displayName} connected: ${this.connected}`,
          );
        } else {
          this.connected = false;
          this.debugLog(
            `Meter: ${this.accessory.displayName} connected: ${this.connected}`,
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
          `Meter: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`,
        );
        if (this.platform.config.credentials?.openToken) {
          this.warnLog(
            `Meter: ${this.accessory.displayName} Using OpenAPI Connection`,
          );
          this.SwitchToOpenAPI = true;
          await this.openAPIRefreshStatus();
        }
      }
    } catch (e: any) {
      this.errorLog(
        `Meter: ${this.accessory.displayName} failed refreshStatus with BLE Connection`,
      );
      if (this.deviceLogging.includes("debug")) {
        this.errorLog(
          `Meter: ${this.accessory.displayName} failed refreshStatus with BLE Connection,` +
            ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      if (this.platform.config.credentials?.openToken) {
        this.warnLog(
          `Meter: ${this.accessory.displayName} Using OpenAPI Connection`,
        );
        this.SwitchToOpenAPI = true;
        this.openAPIRefreshStatus();
      }
      this.apiError(e);
    }
  }

  private async openAPIRefreshStatus() {
    if (this.platform.config.credentials?.openToken) {
      this.debugLog(
        `Meter: ${this.accessory.displayName} OpenAPI RefreshStatus`,
      );
      try {
        this.deviceStatus = (
          await this.platform.axios.get(
            `${settings.DeviceURL}/${this.device.deviceId}/status`,
          )
        ).data;
        this.debugLog(
          `Meter: ${
            this.accessory.displayName
          } openAPIRefreshStatus: ${JSON.stringify(this.deviceStatus)}`,
        );
        this.Humidity = this.deviceStatus.body.humidity!;
        this.Temperature = this.deviceStatus.body.temperature!;
        this.parseStatus();
        this.updateHomeKitCharacteristics();
      } catch (e: any) {
        this.errorLog(
          `Meter: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection`,
        );
        if (this.deviceLogging.includes("debug")) {
          this.errorLog(
            `Meter: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,` +
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
    if (!this.device.meter?.hide_humidity) {
      if (this.CurrentRelativeHumidity === undefined) {
        this.debugLog(
          `Meter: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`,
        );
      } else {
        this.humidityservice?.updateCharacteristic(
          this.platform.Characteristic.CurrentRelativeHumidity,
          this.CurrentRelativeHumidity,
        );
        this.debugLog(
          `Meter: ${this.accessory.displayName} updateCharacteristic CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`,
        );
      }
    }
    if (!this.device.meter?.hide_temperature) {
      if (this.CurrentTemperature === undefined) {
        this.debugLog(
          `Meter: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`,
        );
      } else {
        this.temperatureservice?.updateCharacteristic(
          this.platform.Characteristic.CurrentTemperature,
          this.CurrentTemperature,
        );
        this.debugLog(
          `Meter: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`,
        );
      }
    }
    if (this.device.ble) {
      if (this.BatteryLevel === undefined) {
        this.debugLog(
          `Meter: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`,
        );
      } else {
        this.batteryService?.updateCharacteristic(
          this.platform.Characteristic.BatteryLevel,
          this.BatteryLevel,
        );
        this.debugLog(
          `Meter: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`,
        );
      }
      if (this.StatusLowBattery === undefined) {
        this.debugLog(
          `Meter: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`,
        );
      } else {
        this.batteryService?.updateCharacteristic(
          this.platform.Characteristic.StatusLowBattery,
          this.StatusLowBattery,
        );
        this.debugLog(
          `Meter: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`,
        );
      }
    }
  }

  public apiError(e: any) {
    if (!this.device.meter?.hide_humidity) {
      this.humidityservice?.updateCharacteristic(
        this.platform.Characteristic.CurrentRelativeHumidity,
        e,
      );
    }
    if (!this.device.meter?.hide_temperature) {
      this.temperatureservice?.updateCharacteristic(
        this.platform.Characteristic.CurrentTemperature,
        e,
      );
    }
    if (this.device.ble) {
      this.batteryService?.updateCharacteristic(
        this.platform.Characteristic.BatteryLevel,
        e,
      );
      this.batteryService?.updateCharacteristic(
        this.platform.Characteristic.StatusLowBattery,
        e,
      );
    }
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  config(device: settings.device & settings.devicesConfig) {
    let config = {};
    if (device.meter) {
      config = device.meter;
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
        `Meter: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`,
      );
    }
  }

  refreshRate(device: settings.device & settings.devicesConfig) {
    if (device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate =
        device.refreshRate;
      this.debugLog(
        `Meter: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`,
      );
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate =
        this.platform.config.options!.refreshRate;
      this.debugLog(
        `Meter: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`,
      );
    }
  }

  scan(device: settings.device & settings.devicesConfig) {
    if (device.scanDuration) {
      this.scanDuration = this.accessory.context.scanDuration =
        device.scanDuration;
      if (device.ble) {
        this.debugLog(
          `Meter: ${this.accessory.displayName} Using Device Config scanDuration: ${this.scanDuration}`,
        );
      }
    } else {
      this.scanDuration = this.accessory.context.scanDuration = 1;
      if (this.device.ble) {
        this.debugLog(
          `Meter: ${this.accessory.displayName} Using Default scanDuration: ${this.scanDuration}`,
        );
      }
    }
  }

  logs(device: settings.device & settings.devicesConfig) {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = "debugMode";
      this.debugLog(
        `Meter: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`,
      );
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(
        `Meter: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`,
      );
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging =
        this.platform.config.options?.logging;
      this.debugLog(
        `Meter: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`,
      );
    } else {
      this.deviceLogging = this.accessory.context.logging = "standard";
      this.debugLog(
        `Meter: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`,
      );
    }
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
