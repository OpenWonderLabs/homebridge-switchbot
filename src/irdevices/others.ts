import { AxiosResponse } from 'axios';
import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { DeviceURL, irdevice } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Others {
  private service?: Service;

  Active!: CharacteristicValue;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: irdevice,
  ) {
    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, device.remoteType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId);

    // get the Television service if it exists, otherwise create a new Television service
    // you can create multiple services for each accessory
    this.service = accessory.getService(this.platform.Service.Fanv2);
    if (!this.service && this.platform.config.options?.other?.deviceType === 'Fan') {
      this.service = accessory.addService(
        this.platform.Service.Fanv2,
        `${device.deviceName} ${device.remoteType} Temperature Sensor`,
      );
      this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

      this.service.getCharacteristic(this.platform.Characteristic.Active).onSet(this.ActiveSet.bind(this));
    } else {
      accessory.removeService(this.service!);
      this.platform.log.error('No Device Type Set');
    }
  }

  private ActiveSet(value: CharacteristicValue) {
    this.platform.debug(`${this.accessory.displayName} Set On: ${value}`);
    this.Active = value;
    if (this.Active) {
      this.pushOnChanges();
    } else {
      this.pushOffChanges();
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
      if (this.platform.config.options!.other) {
        if (this.platform.config.options!.other.commandOn) {
          if (this.Active) {
            const payload = {
              commandType: 'customize',
              parameter: 'default',
              command: `${this.platform.config.options!.other.commandOn}`,
            } as any;
            await this.pushChanges(payload);
          }
        } else {
          this.platform.log.error('On Command not set.');
        }
      } else {
        this.platform.log.error('On Command not set.');
      }
    } else {
      this.platform.log.error('On Command not set.');
    }
  }

  async pushOffChanges() {
    if (this.platform.config.options) {
      if (this.platform.config.options!.other) {
        if (this.platform.config.options!.other.commandOff) {
          if (!this.Active) {
            const payload = {
              commandType: 'customize',
              parameter: 'default',
              command: `${this.platform.config.options!.other.commandOff}`,
            } as any;
            await this.pushChanges(payload);
          }
        } else {
          this.platform.log.error('Off Command not set.');
        }
      } else {
        this.platform.log.error('Off Command not set.');
      }
    } else {
      this.platform.log.error('Off Command not set.');
    }
  }

  public async pushChanges(payload: any) {
    try {
      this.platform.log.info(
        'Sending request for',
        this.accessory.displayName,
        'to SwitchBot API. command:',
        payload.command,
        'parameter:',
        payload.parameter,
        'commandType:',
        payload.commandType,
      );
      this.platform.debug(`${this.accessory.displayName} pushChanges - ${JSON.stringify(payload)}`);

      // Make the API request
      const push = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
      this.platform.debug(`${this.accessory.displayName} Changes pushed - ${push.data}`);
      this.statusCode(push);
    } catch (e) {
      this.apiError(e);
    }
  }

  private statusCode(push: AxiosResponse<any>) {
    switch (push.data.statusCode) {
      case 151:
        this.platform.log.error('Command not supported by this device type.');
        break;
      case 152:
        this.platform.log.error('Device not found.');
        break;
      case 160:
        this.platform.log.error('Command is not supported.');
        break;
      case 161:
        this.platform.log.error('Device is offline.');
        break;
      case 171:
        this.platform.log.error('Hub Device is offline.');
        break;
      case 190:
        this.platform.log.error('Device internal error due to device states not synchronized with server. Or command fomrat is invalid.');
        break;
      case 100:
        this.platform.debug('Command successfully sent.');
        break;
      default:
        this.platform.debug('Unknown statusCode.');
    }
  }

  public apiError(e: any) {
    this.service!.updateCharacteristic(this.platform.Characteristic.Active, e);
  }
}
