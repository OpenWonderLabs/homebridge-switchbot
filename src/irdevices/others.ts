import { AxiosResponse } from 'axios';
import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { irDevicesConfig, DeviceURL, irdevice, payload } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Others {
  // Services
  private service?: Service;

  // Characteristic Values
  Active!: CharacteristicValue;

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
    this.service = accessory.getService(this.platform.Service.Fanv2);
    if (!this.service && device?.other?.deviceType === 'Fan') {
      this.service = accessory.addService(this.platform.Service.Fanv2, `${accessory.displayName} Fan`);

      this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

      this.service.getCharacteristic(this.platform.Characteristic.Active).onSet(this.ActiveSet.bind(this));
    } else {
      accessory.removeService(this.service!);
      this.platform.log.error(`Other: ${this.accessory.displayName} No Device Type Set`);
    }
  }

  private ActiveSet(value: CharacteristicValue) {
    this.platform.debug(`Other: ${this.accessory.displayName} On: ${value}`);
    if (this.Active) {
      this.pushOnChanges();
    } else {
      this.pushOffChanges();
    }
    this.Active = value;
  }

  private updateHomeKitCharacteristics() {
    if (this.Active === undefined) {
      this.platform.debug(`Other: ${this.accessory.displayName} Active: ${this.Active}`);
    } else {
      this.service!.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
      this.platform.device(`Other: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	commandType     Command	          command parameter	         Description
   * Light:        "command"       "turnOff"         "default"	        =        set to OFF state
   * Light:        "command"       "turnOn"          "default"	        =        set to ON state
   * Light:        "command"       "volumeAdd"       "default"	        =        volume up
   * Light:        "command"       "volumeSub"       "default"	        =        volume down
   * Light:        "command"       "channelAdd"      "default"	        =        next channel
   * Light:        "command"       "channelSub"      "default"	        =        previous channel
   */
  async pushOnChanges() {
    if (this.platform.config.options) {
      if (this.device.other) {
        if (this.device.other.commandOn) {
          if (this.Active) {
            const payload = {
              commandType: 'customize',
              parameter: 'default',
              command: `${this.device.other.commandOn}`,
            } as payload;
            await this.pushChanges(payload);
          }
        } else {
          this.platform.log.error(`Other: ${this.accessory.displayName} On Command not set.`);
        }
      } else {
        this.platform.log.error(`Other: ${this.accessory.displayName} On Command not set.`);
      }
    } else {
      this.platform.log.error(`Other: ${this.accessory.displayName} On Command not set.`);
    }
  }

  async pushOffChanges() {
    if (this.platform.config.options) {
      if (this.device.other) {
        if (this.device.other.commandOff) {
          if (!this.Active) {
            const payload = {
              commandType: 'customize',
              parameter: 'default',
              command: `${this.device.other.commandOff}`,
            } as payload;
            await this.pushChanges(payload);
          }
        } else {
          this.platform.log.error(`Other: ${this.accessory.displayName} Off Command not set.`);
        }
      } else {
        this.platform.log.error(`Other: ${this.accessory.displayName} Off Command not set.`);
      }
    } else {
      this.platform.log.error(`Other: ${this.accessory.displayName} Off Command not set.`);
    }
  }

  public async pushChanges(payload: payload) {
    try {
      this.platform.log.info(`Other: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},`
        + ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`);

      // Make the API request
      const push = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
      this.platform.debug(`Other: ${this.accessory.displayName} pushChanges: ${push.data}`);
      this.statusCode(push);
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.platform.log.error(`Other: ${this.accessory.displayName}: failed to push changes,`
        + ` Error Message: ${JSON.stringify(e.message)}`);
      this.platform.debug(`Other: ${this.accessory.displayName} Error: ${JSON.stringify(e)}`);
      this.apiError(e);
    }
  }

  private statusCode(push: AxiosResponse<{ statusCode: number; }>) {
    switch (push.data.statusCode) {
      case 151:
        this.platform.log.error(`Other: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.platform.log.error(`Other: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.platform.log.error(`Other: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.platform.log.error(`Other: ${this.accessory.displayName} Device is offline.`);
        break;
      case 171:
        this.platform.log.error(`Other: ${this.accessory.displayName} Hub Device is offline.`);
        break;
      case 190:
        // eslint-disable-next-line max-len
        this.platform.log.error(`Other: ${this.accessory.displayName} Device internal error due to device states not synchronized with server. Or command fomrat is invalid.`);
        break;
      case 100:
        this.platform.debug(`Other: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.platform.debug(`Other: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  public apiError(e: any) {
    this.service!.updateCharacteristic(this.platform.Characteristic.Active, e);
  }
}
