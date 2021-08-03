import { AxiosResponse } from 'axios';
import { CharacteristicValue, HAPStatus, PlatformAccessory, Service } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { DeviceURL, irdevice } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Light {
  service!: Service;

  On!: CharacteristicValue;

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
    (this.service =
      accessory.getService(this.platform.Service.Lightbulb) ||
      accessory.addService(this.platform.Service.Lightbulb)), '%s %s', device.deviceName, device.remoteType;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Outlet, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // handle on / off events using the On characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On).onSet(this.OnSet.bind(this));

    // handle Brightness events using the Brightness characteristic
    /* this.service
      .getCharacteristic(this.platform.Characteristic.Brightness)
      .on(CharacteristicEventTypes.SET, (value: any, callback: CharacteristicGetCallback) => {
        this.platform.log.debug('%s %s Set Brightness: %s', device.remoteType, accessory.displayName, value);
        this.Brightness = value;
        if (value > this.Brightness) {
          this.pushLightBrightnessUpChanges();
        } else {
          this.pushLightBrightnessDownChanges();
        }
        this.service.updateCharacteristic(this.platform.Characteristic.Active, this.Brightness);
        callback(null);
      });*/
  }

  private OnSet(value: CharacteristicValue) {
    this.platform.log.debug('%s %s Set On: %s', this.device.remoteType, this.accessory.displayName, value);
    this.On = value;
    if (this.On) {
      this.pushLightOnChanges();
    } else {
      this.pushLightOffChanges();
    }
    this.service.updateCharacteristic(this.platform.Characteristic.Active, this.On);
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
  async pushLightOnChanges() {
    if (this.On) {
      const payload = {
        commandType: 'command',
        parameter: 'default',
        command: 'turnOn',
      } as any;
      await this.pushChanges(payload);
    }
  }

  async pushLightOffChanges() {
    if (!this.On) {
      const payload = {
        commandType: 'command',
        parameter: 'default',
        command: 'turnOff',
      } as any;
      await this.pushChanges(payload);
    }
  }

  async pushLightBrightnessUpChanges() {
    const payload = {
      commandType: 'command',
      parameter: 'default',
      command: 'brightnessUp',
    } as any;
    await this.pushChanges(payload);
  }

  async pushLightBrightnessDownChanges() {
    const payload = {
      commandType: 'command',
      parameter: 'default',
      command: 'brightnessDown',
    } as any;
    await this.pushChanges(payload);
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
      this.platform.log.debug('Light %s pushChanges -', this.accessory.displayName, JSON.stringify(payload));

      // Make the API request
      const push = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
      this.platform.log.debug('Light %s Changes pushed -', this.accessory.displayName, push.data);
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
        this.platform.log.debug('Command successfully sent.');
        break;
      default:
        this.platform.log.debug('Unknown statusCode.');
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.On, e);
    new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
  }
}
