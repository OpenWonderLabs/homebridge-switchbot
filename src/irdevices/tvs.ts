import { AxiosResponse } from "axios";
import { SwitchBotPlatform } from "../platform";
import { CharacteristicValue, PlatformAccessory, Service } from "homebridge";
import {
  DeviceURL,
  irdevice,
  deviceStatusResponse,
  irDevicesConfig,
  payload,
} from "../settings";

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class TV {
  // Services
  service!: Service;
  speakerService: Service;

  // Characteristic Values
  Active!: CharacteristicValue;
  ActiveCached!: CharacteristicValue;
  ActiveIdentifier!: CharacteristicValue;

  // Others
  deviceStatus!: deviceStatusResponse;

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

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.Characteristic.Name,
        `${device.deviceName} ${device.remoteType}`,
      )
      .setCharacteristic(this.platform.Characteristic.Manufacturer, "SwitchBot")
      .setCharacteristic(this.platform.Characteristic.Model, device.remoteType)
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        device.deviceId!,
      );

    // set the accessory category
    switch (device.remoteType) {
      case "Speaker":
      case "DIY Speaker":
        accessory.category = this.platform.api.hap.Categories.SPEAKER;
        (this.service =
          accessory.getService(this.platform.Service.Television) ||
          accessory.addService(this.platform.Service.Television)),
        `${accessory.displayName} Speaker`;
        break;
      case "IPTV":
      case "DIY IPTV":
        accessory.category =
          this.platform.api.hap.Categories.TV_STREAMING_STICK;
        (this.service =
          accessory.getService(this.platform.Service.Television) ||
          accessory.addService(this.platform.Service.Television)),
        `${accessory.displayName} Streaming Stick`;
        break;
      case "DVD":
      case "DIY DVD":
      case "Set Top Box":
      case "DIY Set Top Box":
        accessory.category = this.platform.api.hap.Categories.TV_SET_TOP_BOX;
        (this.service =
          accessory.getService(this.platform.Service.Television) ||
          accessory.addService(this.platform.Service.Television)),
        `${accessory.displayName} Set Top Box`;
        break;
      default:
        accessory.category = this.platform.api.hap.Categories.TELEVISION;

        // get the Television service if it exists, otherwise create a new Television service
        // you can create multiple services for each accessory
        (this.service =
          accessory.getService(this.platform.Service.Television) ||
          accessory.addService(this.platform.Service.Television)),
        `${accessory.displayName} TV`;
    }

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Outlet, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.getCharacteristic(this.platform.Characteristic.ConfiguredName);

    // set sleep discovery characteristic
    this.service.setCharacteristic(
      this.platform.Characteristic.SleepDiscoveryMode,
      this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE,
    );

    // handle on / off events using the Active characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.Active)
      .onSet(this.ActiveSet.bind(this));

    this.service.setCharacteristic(
      this.platform.Characteristic.ActiveIdentifier,
      1,
    );

    // handle input source changes
    this.service
      .getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .onSet(this.ActiveIdentifierSet.bind(this));

    // handle remote control input
    this.service
      .getCharacteristic(this.platform.Characteristic.RemoteKey)
      .onSet(this.RemoteKeySet.bind(this));

    /**
     * Create a speaker service to allow volume control
     */
    // create a new Television Speaker service
    (this.speakerService =
      accessory.getService(this.platform.Service.TelevisionSpeaker) ||
      accessory.addService(this.platform.Service.TelevisionSpeaker)),
    `${accessory.displayName} Speaker`;

    this.speakerService.setCharacteristic(
      this.platform.Characteristic.Name,
      `${accessory.displayName} Speaker`,
    );

    this.speakerService
      .setCharacteristic(
        this.platform.Characteristic.Active,
        this.platform.Characteristic.Active.ACTIVE,
      )
      .setCharacteristic(
        this.platform.Characteristic.VolumeControlType,
        this.platform.Characteristic.VolumeControlType.ABSOLUTE,
      );

    // handle volume control
    this.speakerService
      .getCharacteristic(this.platform.Characteristic.VolumeSelector)
      .onSet(this.VolumeSelectorSet.bind(this));
  }

  private VolumeSelectorSet(value: CharacteristicValue) {
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} VolumeSelector: ${value}`,
    );
    if (value === this.platform.Characteristic.VolumeSelector.INCREMENT) {
      this.pushVolumeUpChanges();
    } else {
      this.pushVolumeDownChanges();
    }
  }

  private RemoteKeySet(value: CharacteristicValue) {
    switch (value) {
      case this.platform.Characteristic.RemoteKey.REWIND: {
        this.debugLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: REWIND`,
        );
        break;
      }
      case this.platform.Characteristic.RemoteKey.FAST_FORWARD: {
        this.debugLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: FAST_FORWARD`,
        );
        break;
      }
      case this.platform.Characteristic.RemoteKey.NEXT_TRACK: {
        this.debugLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: NEXT_TRACK`,
        );
        break;
      }
      case this.platform.Characteristic.RemoteKey.PREVIOUS_TRACK: {
        this.debugLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: PREVIOUS_TRACK`,
        );
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_UP: {
        this.debugLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: ARROW_UP`,
        );
        //this.pushUpChanges();
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_DOWN: {
        this.debugLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: ARROW_DOWN`,
        );
        //this.pushDownChanges();
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_LEFT: {
        this.debugLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: ARROW_LEFT`,
        );
        //this.pushLeftChanges();
        break;
      }
      case this.platform.Characteristic.RemoteKey.ARROW_RIGHT: {
        this.debugLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: ARROW_RIGHT`,
        );
        //this.pushRightChanges();
        break;
      }
      case this.platform.Characteristic.RemoteKey.SELECT: {
        this.debugLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: SELECT`,
        );
        //this.pushOkChanges();
        break;
      }
      case this.platform.Characteristic.RemoteKey.BACK: {
        this.debugLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: BACK`,
        );
        //this.pushBackChanges();
        break;
      }
      case this.platform.Characteristic.RemoteKey.EXIT: {
        this.debugLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: EXIT`,
        );
        break;
      }
      case this.platform.Characteristic.RemoteKey.PLAY_PAUSE: {
        this.debugLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: PLAY_PAUSE`,
        );
        break;
      }
      case this.platform.Characteristic.RemoteKey.INFORMATION: {
        this.debugLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Set Remote Key Pressed: INFORMATION`,
        );
        //this.pushMenuChanges();
        break;
      }
    }
  }

  private ActiveIdentifierSet(value: CharacteristicValue) {
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} ActiveIdentifier: ${value}`,
    );
    this.ActiveIdentifier = value;
  }

  private ActiveSet(value: CharacteristicValue) {
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} Active: ${value}`,
    );
    if (!this.device.irtv?.disable_power) {
      if (value === this.platform.Characteristic.Active.INACTIVE) {
        this.pushTvOffChanges();
      } else {
        this.pushTvOnChanges();
      }
      this.Active = value;
      this.ActiveCached = this.Active;
      this.accessory.context.Active = this.ActiveCached;
    }
  }

  private updateHomeKitCharacteristics() {
    if (this.Active === undefined) {
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} Active: ${this.Active}`,
      );
    } else {
      this.service?.updateCharacteristic(
        this.platform.Characteristic.Active,
        this.Active,
      );
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`,
      );
    }
    if (this.ActiveIdentifier === undefined) {
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} ActiveIdentifier: ${this.ActiveIdentifier}`,
      );
    } else {
      this.service?.updateCharacteristic(
        this.platform.Characteristic.ActiveIdentifier,
        this.ActiveIdentifier,
      );
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName}` +
          ` updateCharacteristic ActiveIdentifier: ${this.ActiveIdentifier}`,
      );
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	commandType     Command	          command parameter	         Description
   * TV:        "command"       "turnOff"         "default"	        =        set to OFF state
   * TV:        "command"       "turnOn"          "default"	        =        set to ON state
   * TV:        "command"       "volumeAdd"       "default"	        =        volume up
   * TV:        "command"       "volumeSub"       "default"	        =        volume down
   * TV:        "command"       "channelAdd"      "default"	        =        next channel
   * TV:        "command"       "channelSub"      "default"	        =        previous channel
   */
  async pushTvOnChanges() {
    if (this.Active !== this.platform.Characteristic.Active.ACTIVE) {
      const payload = {
        commandType: "command",
        parameter: "default",
        command: "turnOn",
      } as payload;
      await this.pushTVChanges(payload);
    }
  }

  async pushTvOffChanges() {
    if (this.Active !== this.platform.Characteristic.Active.INACTIVE) {
      const payload = {
        commandType: "command",
        parameter: "default",
        command: "turnOff",
      } as payload;
      await this.pushTVChanges(payload);
    }
  }

  async pushOkChanges() {
    const payload = {
      commandType: "command",
      parameter: "default",
      command: "Ok",
    } as payload;
    await this.pushTVChanges(payload);
  }

  async pushBackChanges() {
    const payload = {
      commandType: "command",
      parameter: "default",
      command: "Back",
    } as payload;
    await this.pushTVChanges(payload);
  }

  async pushMenuChanges() {
    const payload = {
      commandType: "command",
      parameter: "default",
      command: "Menu",
    } as payload;
    await this.pushTVChanges(payload);
  }

  async pushUpChanges() {
    const payload = {
      commandType: "command",
      parameter: "default",
      command: "Up",
    } as payload;
    await this.pushTVChanges(payload);
  }

  async pushDownChanges() {
    const payload = {
      commandType: "command",
      parameter: "default",
      command: "Down",
    } as payload;
    await this.pushTVChanges(payload);
  }

  async pushRightChanges() {
    const payload = {
      commandType: "command",
      parameter: "default",
      command: "Right",
    } as payload;
    await this.pushTVChanges(payload);
  }

  async pushLeftChanges() {
    const payload = {
      commandType: "command",
      parameter: "default",
      command: "Left",
    } as payload;
    await this.pushTVChanges(payload);
  }

  async pushVolumeUpChanges() {
    const payload = {
      commandType: "command",
      parameter: "default",
      command: "volumeAdd",
    } as payload;
    await this.pushTVChanges(payload);
  }

  async pushVolumeDownChanges() {
    const payload = {
      commandType: "command",
      parameter: "default",
      command: "volumeSub",
    } as payload;
    await this.pushTVChanges(payload);
  }

  public async pushTVChanges(payload: payload) {
    try {
      this.infoLog(
        `${this.device.remoteType}: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},` +
          ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`,
      );

      // Make the API request
      const push = await this.platform.axios.post(
        `${DeviceURL}/${this.device.deviceId}/commands`,
        payload,
      );
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} pushChanges: ${push.data}`,
      );
      this.statusCode(push);
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.errorLog(
        `${this.device.remoteType}: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection`,
      );
      if (this.deviceLogging === "debug") {
        this.errorLog(
          `${this.device.remoteType}: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` +
            ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      if (this.platform.debugMode) {
        this.errorLog(
          `${this.device.remoteType}: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` +
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
          `${this.device.remoteType}: ${this.accessory.displayName} Command not supported by this device type.`,
        );
        break;
      case 152:
        this.errorLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Device not found.`,
        );
        break;
      case 160:
        this.errorLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Command is not supported.`,
        );
        break;
      case 161:
        this.errorLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Device is offline.`,
        );
        break;
      case 171:
        this.errorLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Hub Device is offline. Hub: ${this.device.hubDeviceId}`,
        );
        break;
      case 190:
        this.errorLog(
          `${this.device.remoteType}: ` +
            `${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
            ` Or command: ${JSON.stringify(push.data)} format is invalid`,
        );
        break;
      case 100:
        this.debugLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Command successfully sent.`,
        );
        break;
      default:
        this.debugLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Unknown statusCode.`,
        );
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.Active, e);
    this.service.updateCharacteristic(
      this.platform.Characteristic.ActiveIdentifier,
      e,
    );
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  config(device: irdevice & irDevicesConfig) {
    let config = {};
    if (device.irtv) {
      config = device.irtv;
    }
    if (device.logging !== undefined) {
      config["logging"] = device.logging;
    }
    if (Object.entries(config).length !== 0) {
      this.warnLog(
        `${this.device.remoteType}: ${
          this.accessory.displayName
        } Config: ${JSON.stringify(config)}`,
      );
    }
  }

  logs(device: irdevice & irDevicesConfig) {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = "debugMode";
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`,
      );
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`,
      );
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging =
        this.platform.config.options?.logging;
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`,
      );
    } else {
      this.deviceLogging = this.accessory.context.logging = "standard";
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`,
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
