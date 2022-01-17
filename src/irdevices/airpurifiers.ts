import { AxiosResponse } from "axios";
import { SwitchBotPlatform } from "../platform";
import { irDevicesConfig, DeviceURL, irdevice, payload } from "../settings";
import { CharacteristicValue, PlatformAccessory, Service } from "homebridge";

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class AirPurifier {
  // Services
  service!: Service;

  // Characteristic Values
  Active!: CharacteristicValue;
  APActive!: CharacteristicValue;
  ActiveCached!: CharacteristicValue;
  CurrentAPTemp!: CharacteristicValue;
  CurrentAPMode!: CharacteristicValue;
  RotationSpeed!: CharacteristicValue;
  CurrentAPFanSpeed!: CharacteristicValue;
  CurrentTemperature!: CharacteristicValue;
  CurrentTemperatureCached!: CharacteristicValue;
  CurrentAirPurifierState!: CharacteristicValue;
  CurrentHeaterCoolerState!: CharacteristicValue;

  // Others
  Busy: any;
  Timeout: any = null;
  static IDLE: number;
  CurrentMode!: number;
  static INACTIVE: number;
  LastTemperature!: number;
  CurrentFanSpeed!: number;
  static PURIFYING_AIR: number;

  // Config
  deviceLogging!: string;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: irdevice & irDevicesConfig,
  ) {
    // default placeholders
    this.logs(device);
    this.config(device);
    if (this.Active === undefined) {
      this.Active = this.platform.Characteristic.Active.INACTIVE;
    } else {
      this.Active = this.accessory.context.Active;
    }
    if (this.CurrentTemperature === undefined) {
      this.CurrentTemperature = 24;
    } else {
      this.CurrentTemperature = this.accessory.context.CurrentTemperature;
    }

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, "SwitchBot")
      .setCharacteristic(this.platform.Characteristic.Model, device.remoteType)
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        device.deviceId!,
      );

    // get the Television service if it exists, otherwise create a new Television service
    // you can create multiple services for each accessory
    (this.service =
      accessory.getService(this.platform.Service.AirPurifier) ||
      accessory.addService(this.platform.Service.AirPurifier)),
    `${accessory.displayName} Air Purifier`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Outlet, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.displayName,
    );

    // handle on / off events using the Active characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.Active)
      .onSet(this.ActiveSet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentAirPurifierState)
      .onGet(() => {
        return this.CurrentAirPurifierStateGet();
      });

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetAirPurifierState)
      .onSet(this.TargetAirPurifierStateSet.bind(this));
  }

  private ActiveSet(value: CharacteristicValue) {
    this.debugLog(
      `Air Purifier: ${this.accessory.displayName} Set Active: ${value}`,
    );
    if (value === this.platform.Characteristic.Active.INACTIVE) {
      this.pushAirPurifierOffChanges();
    } else {
      this.pushAirPurifierOnChanges();
    }
    this.Active = value;
    this.ActiveCached = this.Active;
    this.accessory.context.Active = this.ActiveCached;
  }

  private updateHomeKitCharacteristics() {
    if (this.Active === undefined) {
      this.debugLog(
        `Air Purifier: ${this.accessory.displayName} Active: ${this.Active}`,
      );
    } else {
      this.service?.updateCharacteristic(
        this.platform.Characteristic.Active,
        this.Active,
      );
      this.debugLog(
        `Air Purifier: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`,
      );
    }
    if (this.CurrentAirPurifierState === undefined) {
      this.debugLog(
        `Air Purifier: ${this.accessory.displayName} CurrentAirPurifierState: ${this.CurrentAirPurifierState}`,
      );
    } else {
      this.service?.updateCharacteristic(
        this.platform.Characteristic.CurrentAirPurifierState,
        this.CurrentAirPurifierState,
      );
      this.debugLog(
        `Air Purifier: ${this.accessory.displayName}` +
          ` updateCharacteristic CurrentAirPurifierState: ${this.CurrentAirPurifierState}`,
      );
    }
    if (this.CurrentHeaterCoolerState === undefined) {
      this.debugLog(
        `Air Purifier: ${this.accessory.displayName} CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`,
      );
    } else {
      this.service?.updateCharacteristic(
        this.platform.Characteristic.CurrentHeaterCoolerState,
        this.CurrentHeaterCoolerState,
      );
      this.debugLog(
        `Air Purifier: ${this.accessory.displayName}` +
          ` updateCharacteristic CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`,
      );
    }
  }

  private TargetAirPurifierStateSet(value: CharacteristicValue) {
    switch (value) {
      case this.platform.Characteristic.CurrentAirPurifierState.PURIFYING_AIR:
        this.CurrentMode = AirPurifier.PURIFYING_AIR;
        break;
      case this.platform.Characteristic.CurrentAirPurifierState.IDLE:
        this.CurrentMode = AirPurifier.IDLE;
        break;
      case this.platform.Characteristic.CurrentAirPurifierState.INACTIVE:
        this.CurrentMode = AirPurifier.INACTIVE;
        break;
      default:
        break;
    }
  }

  private CurrentAirPurifierStateGet() {
    if (this.Active === 1) {
      this.CurrentAirPurifierState =
        this.platform.Characteristic.CurrentAirPurifierState.PURIFYING_AIR;
    } else {
      this.CurrentAirPurifierState =
        this.platform.Characteristic.CurrentAirPurifierState.INACTIVE;
    }
    return this.CurrentAirPurifierState;
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType				commandType     Command	          command parameter	         Description
   * AirPurifier:        "command"       "turnOn"         "default"	        =        every home appliance can be turned on by default
   * AirPurifier:        "command"       "turnOff"        "default"	        =        every home appliance can be turned off by default
   * AirPurifier:        "command"       "swing"          "default"	        =        swing
   * AirPurifier:        "command"       "timer"          "default"	        =        timer
   * AirPurifier:        "command"       "lowSpeed"       "default"	        =        fan speed to low
   * AirPurifier:        "command"       "middleSpeed"    "default"	        =        fan speed to medium
   * AirPurifier:        "command"       "highSpeed"      "default"	        =        fan speed to high
   */
  async pushAirPurifierOnChanges() {
    if (this.Active !== 1) {
      const payload = {
        commandType: "command",
        parameter: "default",
        command: "turnOn",
      } as payload;
      await this.pushChanges(payload);
    }
  }

  async pushAirPurifierOffChanges() {
    if (this.Active !== 0) {
      const payload = {
        commandType: "command",
        parameter: "default",
        command: "turnOff",
      } as payload;
      await this.pushChanges(payload);
    }
  }

  async pushAirConditionerStatusChanges() {
    if (!this.Busy) {
      this.Busy = true;
      this.CurrentHeaterCoolerState =
        this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
    }
    clearTimeout(this.Timeout);

    // Make a new Timeout set to go off in 1000ms (1 second)
    this.Timeout = setTimeout(
      this.pushAirConditionerDetailsChanges.bind(this),
      1500,
    );
  }

  async pushAirConditionerDetailsChanges() {
    const payload = {
      commandType: "command",
      command: "setAll",
    } as payload;

    this.CurrentAPTemp = this.CurrentTemperature || 24;
    this.CurrentAPMode = this.CurrentMode || 1;
    this.CurrentAPFanSpeed = this.CurrentFanSpeed || 1;
    this.APActive = this.Active === 1 ? "on" : "off";
    payload.parameter = `${this.CurrentAPTemp},${this.CurrentAPMode},${this.CurrentAPFanSpeed},${this.APActive}`;

    if (this.Active === 1) {
      if ((this.CurrentTemperature || 24) < (this.LastTemperature || 30)) {
        this.CurrentHeaterCoolerState =
          this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
      } else {
        this.CurrentHeaterCoolerState =
          this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
      }
    } else {
      this.CurrentHeaterCoolerState =
        this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }

    await this.pushChanges(payload);
  }

  public async pushChanges(payload: payload) {
    try {
      this.infoLog(
        `Air Purifier: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},` +
          ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`,
      );

      // Make the API request
      const push = await this.platform.axios.post(
        `${DeviceURL}/${this.device.deviceId}/commands`,
        payload,
      );
      this.debugLog(
        `Air Purifier: ${this.accessory.displayName} pushChanges: ${push.data}`,
      );
      this.statusCode(push);
      this.updateHomeKitCharacteristics();
      this.CurrentTemperatureCached = this.CurrentTemperature;
      this.accessory.context.CurrentTemperature = this.CurrentTemperatureCached;
    } catch (e: any) {
      this.errorLog(
        `Air Purifier: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection`,
      );
      if (this.deviceLogging === "debug") {
        this.errorLog(
          `Air Purifier: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` +
            ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      if (this.platform.debugMode) {
        this.errorLog(
          `Air Purifier: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` +
            ` Error: ${JSON.stringify(e)}`,
        );
      }
      this.apiError(e);
    }
  }

  private statusCode(push: AxiosResponse<{ statusCode: number }>) {
    switch (push.data.statusCode) {
      case 151:
        this.errorLog(
          `Air Purifier: ${this.accessory.displayName} Command not supported by this device type.`,
        );
        break;
      case 152:
        this.errorLog(
          `Air Purifier: ${this.accessory.displayName} Device not found.`,
        );
        break;
      case 160:
        this.errorLog(
          `Air Purifier: ${this.accessory.displayName} Command is not supported.`,
        );
        break;
      case 161:
        this.errorLog(
          `Air Purifier: ${this.accessory.displayName} Device is offline.`,
        );
        break;
      case 171:
        this.errorLog(
          `Air Purifier: ${this.accessory.displayName} Hub Device is offline. Hub: ${this.device.hubDeviceId}`,
        );
        break;
      case 190:
        this.errorLog(
          `Air Purifier: ${this.accessory.displayName} Device internal error due to device states not synchronized` +
            ` with server, Or command: ${JSON.stringify(
              push.data,
            )} format is invalid`,
        );
        break;
      case 100:
        this.debugLog(
          `Air Purifier: ${this.accessory.displayName} Command successfully sent.`,
        );
        break;
      default:
        this.debugLog(
          `Air Purifier: ${this.accessory.displayName} Unknown statusCode.`,
        );
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(
      this.platform.Characteristic.CurrentHeaterCoolerState,
      e,
    );
    this.service.updateCharacteristic(
      this.platform.Characteristic.CurrentAirPurifierState,
      e,
    );
    this.service.updateCharacteristic(
      this.platform.Characteristic.TargetAirPurifierState,
      e,
    );
    this.service.updateCharacteristic(this.platform.Characteristic.Active, e);
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  config(device: irdevice & irDevicesConfig) {
    let config = {};
    if (device.irpur) {
      config = device.irpur;
    }
    if (device.logging !== undefined) {
      config["logging"] = device.logging;
    }
    if (Object.entries(config).length !== 0) {
      this.warnLog(
        `Air Purifier: ${this.accessory.displayName} Config: ${JSON.stringify(
          config,
        )}`,
      );
    }
  }

  logs(device: irdevice & irDevicesConfig) {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = "debugMode";
      this.debugLog(
        `Air Purifier: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`,
      );
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(
        `Air Purifier: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`,
      );
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging =
        this.platform.config.options?.logging;
      this.debugLog(
        `Air Purifier: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`,
      );
    } else {
      this.deviceLogging = this.accessory.context.logging = "standard";
      this.debugLog(
        `Air Purifier: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`,
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
    return this.deviceLogging.includes("debug") || this.deviceLogging === "standard";
  }
}
