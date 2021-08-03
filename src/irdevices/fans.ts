import { AxiosResponse } from 'axios';
import { CharacteristicValue, HAPStatus, PlatformAccessory, Service } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { DeviceURL, irdevice, deviceStatusResponse } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Fan {
  service!: Service;

  Active!: CharacteristicValue;
  ActiveIdentifier!: CharacteristicValue;
  RotationSpeed!: CharacteristicValue;
  SwingMode!: CharacteristicValue;
  RotationDirection!: CharacteristicValue;
  deviceStatus!: deviceStatusResponse;
  minStep: number | undefined;
  minValue: number | undefined;
  maxValue: number | undefined;

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
      accessory.getService(this.platform.Service.Fanv2) ||
      accessory.addService(this.platform.Service.Fanv2)), '%s %s', device.deviceName, device.remoteType;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Outlet, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // handle on / off events using the Active characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Active).onSet(this.ActiveSet.bind(this));

    if (this.platform.config.options?.fan?.rotation_speed?.includes(device.deviceId)) {
      if (this.platform.config.options?.fan?.set_minStep) {
        this.minStep = this.platform.config.options?.fan?.set_minStep;
      } else {
        this.minStep = 1;
      }
      if (this.platform.config.options?.fan?.set_min) {
        this.minValue = this.platform.config.options?.fan?.set_min;
      } else {
        this.minValue = 1;
      }
      if (this.platform.config.options?.fan?.set_max) {
        this.maxValue = this.platform.config.options?.fan?.set_max;
      } else {
        this.maxValue = 100;
      }
      // handle Roation Speed events using the RotationSpeed characteristic
      this.service
        .getCharacteristic(this.platform.Characteristic.RotationSpeed)
        .setProps({
          minStep: this.minStep,
          minValue: this.minValue,
          maxValue: this.maxValue,
        })
        .onSet(this.RotationSpeedSet.bind(this));
    } else if (
      this.service.testCharacteristic(this.platform.Characteristic.RotationSpeed) &&
      !this.platform.config.options?.fan?.swing_mode?.includes(device.deviceId)
    ) {
      const characteristic = this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed);
      this.service.removeCharacteristic(characteristic);
      this.platform.log.warn('Rotation Speed Characteristic was removed.');
    } else {
      this.platform.log.debug(
        'Rotation Speed Characteristic was not removed or not added. To Remove Chracteristic, Clear Cache on this Accessory.',
      );
    }

    if (this.platform.config.options?.fan?.swing_mode?.includes(device.deviceId)) {
      // handle Osolcation events using the SwingMode characteristic
      this.service.getCharacteristic(this.platform.Characteristic.SwingMode).onSet(this.SwingModeSet.bind(this));
    } else if (
      this.service.testCharacteristic(this.platform.Characteristic.SwingMode) &&
      !this.platform.config.options?.fan?.swing_mode?.includes(device.deviceId)
    ) {
      const characteristic = this.service.getCharacteristic(this.platform.Characteristic.SwingMode);
      this.service.removeCharacteristic(characteristic);
      this.platform.log.warn('Swing Mode Characteristic was removed.');
    } else {
      this.platform.log.debug(
        'Swing Mode Characteristic was not removed or not added. To Remove Chracteristic, Clear Cache on this Accessory.',
      );
    }
  }

  private SwingModeSet(value: CharacteristicValue) {
    this.platform.log.debug('Fan %s Set SwingMode: %s', this.accessory.displayName, value);
    if (value > this.SwingMode) {
      this.SwingMode = 1;
      this.pushFanOnChanges();
      this.pushFanSwingChanges();
    } else {
      this.SwingMode = 0;
      this.pushFanOnChanges();
      this.pushFanSwingChanges();
    }
    this.SwingMode = value;
    if (this.SwingMode !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.SwingMode, this.SwingMode);
    }
  }

  private RotationSpeedSet(value: CharacteristicValue) {
    this.platform.log.debug('Fan %s Set Active: %s', this.accessory.displayName, value);
    if (value > this.RotationSpeed) {
      this.RotationSpeed = 1;
      this.pushFanSpeedUpChanges();
      this.pushFanOnChanges();
    } else {
      this.RotationSpeed = 0;
      this.pushFanSpeedDownChanges();
    }
    this.RotationSpeed = value;
    if (this.RotationSpeed !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.RotationSpeed);
    }
  }

  private ActiveSet(value: CharacteristicValue) {
    this.platform.log.debug('Fan %s Set Active: %s', this.accessory.displayName, value);
    if (value === this.platform.Characteristic.Active.INACTIVE) {
      this.pushFanOffChanges();
    } else {
      this.pushFanOnChanges();
    }
    this.Active = value;
    if (this.Active !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	commandType     Command	          command parameter	         Description
   * Fan:        "command"       "swing"          "default"	        =        swing
   * Fan:        "command"       "timer"          "default"	        =        timer
   * Fan:        "command"       "lowSpeed"       "default"	        =        fan speed to low
   * Fan:        "command"       "middleSpeed"    "default"	        =        fan speed to medium
   * Fan:        "command"       "highSpeed"      "default"	        =        fan speed to high
   */
  async pushFanOnChanges() {
    if (this.Active !== 1) {
      const payload = {
        commandType: 'command',
        parameter: 'default',
        command: 'turnOn',
      } as any;
      await this.pushTVChanges(payload);
    }
  }

  async pushFanOffChanges() {
    const payload = {
      commandType: 'command',
      parameter: 'default',
      command: 'turnOff',
    } as any;
    await this.pushTVChanges(payload);
  }

  async pushFanSpeedUpChanges() {
    const payload = {
      commandType: 'command',
      parameter: 'default',
      command: 'highSpeed',
    } as any;
    await this.pushTVChanges(payload);
  }

  async pushFanSpeedDownChanges() {
    const payload = {
      commandType: 'command',
      parameter: 'default',
      command: 'lowSpeed',
    } as any;
    await this.pushTVChanges(payload);
  }

  async pushFanSwingChanges() {
    const payload = {
      commandType: 'command',
      parameter: 'default',
      command: 'swing',
    } as any;
    await this.pushTVChanges(payload);
  }

  public async pushTVChanges(payload: any) {
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
      this.platform.log.debug('TV %s pushChanges -', this.accessory.displayName, JSON.stringify(payload));

      // Make the API request
      const push = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
      this.platform.log.debug('TV %s Changes pushed -', this.accessory.displayName, push.data);
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
    this.service.updateCharacteristic(this.platform.Characteristic.Active, e);
    this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, e);
    this.service.updateCharacteristic(this.platform.Characteristic.SwingMode, e);
    new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
  }
}
