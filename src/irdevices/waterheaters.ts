import { AxiosResponse } from 'axios';
import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { irDevicesConfig, DeviceURL, irdevice, payload } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class WaterHeater {
  // Services
  service!: Service;

  // Characteristic Values
  Active!: CharacteristicValue;

  // Config
  private readonly deviceDebug = this.platform.config.options?.debug === 'device' || this.platform.debugMode;
  private readonly debugDebug = this.platform.config.options?.debug === 'debug' || this.platform.debugMode;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: irdevice & irDevicesConfig,
  ) {
    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, device.remoteType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!);

    // get the Television service if it exists, otherwise create a new Television service
    // you can create multiple services for each accessory
    (this.service =
      accessory.getService(this.platform.Service.Valve) ||
      accessory.addService(this.platform.Service.Valve)), `${accessory.displayName} Water Heater`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Outlet, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      `${device.deviceName} ${device.remoteType}`,
    );

    // set sleep discovery characteristic
    this.service.setCharacteristic(
      this.platform.Characteristic.ValveType,
      this.platform.Characteristic.ValveType.GENERIC_VALVE,
    );

    // handle on / off events using the Active characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Active).onSet(this.ActiveSet.bind(this));
  }

  private ActiveSet(value: CharacteristicValue) {
    this.platform.debug(`Water Heater: ${this.accessory.displayName} Active: ${value}`);
    if (value === this.platform.Characteristic.Active.INACTIVE) {
      this.pushWaterHeaterOffChanges();
      this.service.setCharacteristic(
        this.platform.Characteristic.InUse,
        this.platform.Characteristic.InUse.NOT_IN_USE,
      );
    } else {
      this.pushWaterHeaterOnChanges();
      this.service.setCharacteristic(this.platform.Characteristic.InUse, this.platform.Characteristic.InUse.IN_USE);
    }
    this.Active = value;
  }

  private updateHomeKitCharacteristics() {
    if (this.Active === undefined) {
      this.platform.debug(`Water Heater: ${this.accessory.displayName} Active: ${this.Active}`);
    } else {
      this.service!.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
      this.platform.device(`Water Heater: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	commandType     Command	          command parameter	         Description
   * WaterHeater:        "command"       "turnOff"         "default"	        =        set to OFF state
   * WaterHeater:        "command"       "turnOn"          "default"	        =        set to ON state
   * WaterHeater:        "command"       "volumeAdd"       "default"	        =        volume up
   * WaterHeater:        "command"       "volumeSub"       "default"	        =        volume down
   * WaterHeater:        "command"       "channelAdd"      "default"	        =        next channel
   * WaterHeater:        "command"       "channelSub"      "default"	        =        previous channel
   */
  async pushWaterHeaterOnChanges() {
    if (this.Active !== 1) {
      const payload = {
        commandType: 'command',
        parameter: 'default',
        command: 'turnOn',
      } as payload;
      await this.pushChanges(payload);
    }
  }

  async pushWaterHeaterOffChanges() {
    if (this.Active !== 0) {
      const payload = {
        commandType: 'command',
        parameter: 'default',
        command: 'turnOff',
      } as payload;
      await this.pushChanges(payload);
    }
  }

  public async pushChanges(payload: payload) {
    try {
      this.platform.log.info(`Water Heater: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},`
        + ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`);

      // Make the API request
      const push = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
      this.platform.debug(`Water Heater: ${this.accessory.displayName} pushChanges: ${push.data}`);
      this.statusCode(push);
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.platform.log.error(`Water Heater: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection`);
      if (this.deviceDebug) {
        this.platform.log.error(`Water Heater: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,`
          + ` Error Message: ${JSON.stringify(e.message)}`);
      }
      if (this.debugDebug) {
        this.platform.log.error(`Water Heater: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,`
          + ` Error: ${JSON.stringify(e)}`);
      }
      this.apiError(e);
    }
  }

  private statusCode(push: AxiosResponse<{ statusCode: number; }>) {
    switch (push.data.statusCode) {
      case 151:
        this.platform.log.error(`Water Heater: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.platform.log.error(`Water Heater: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.platform.log.error(`Water Heater: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.platform.log.error(`Water Heater: ${this.accessory.displayName} Device is offline.`);
        break;
      case 171:
        this.platform.log.error(`Water Heater: ${this.accessory.displayName} Hub Device is offline.`);
        break;
      case 190:
        this.platform.log.error(`Water Heater: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,`
          + ` Or command: ${JSON.stringify(push.data)} format is invalid`);
        break;
      case 100:
        this.platform.debug(`Water Heater: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.platform.debug(`Water Heater: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.Active, e);
  }
}
