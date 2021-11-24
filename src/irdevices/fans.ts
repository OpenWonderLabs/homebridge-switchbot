import { AxiosResponse } from 'axios';
import { SwitchBotPlatform } from '../platform';
import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { DeviceURL, irdevice, deviceStatusResponse, irDevicesConfig, payload } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Fan {
  // Services
  service!: Service;

  // Characteristic Values
  Active!: CharacteristicValue;
  ActiveIdentifier!: CharacteristicValue;
  RotationSpeed!: CharacteristicValue;
  SwingMode!: CharacteristicValue;
  RotationDirection!: CharacteristicValue;

  // Others
  deviceStatus!: deviceStatusResponse;

  // Config
  minStep?: number;
  minValue?: number;
  maxValue?: number;
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
      accessory.getService(this.platform.Service.Fanv2) ||
      accessory.addService(this.platform.Service.Fanv2)), `${accessory.displayName} Fan`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Outlet, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // handle on / off events using the Active characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Active).onSet(this.ActiveSet.bind(this));

    if (device.irfan?.rotation_speed) {
      if (device.irfan?.set_minStep) {
        this.minStep = device.irfan?.set_minStep;
      } else {
        this.minStep = 1;
      }
      if (device.irfan?.set_min) {
        this.minValue = device.irfan?.set_min;
      } else {
        this.minValue = 1;
      }
      if (device.irfan?.set_max) {
        this.maxValue = device.irfan?.set_max;
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
      !device.irfan?.swing_mode) {
      const characteristic = this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed);
      this.service.removeCharacteristic(characteristic);
      this.platform.device(`Fan: ${this.accessory.displayName} Rotation Speed Characteristic was removed.`);
    } else {
      // eslint-disable-next-line max-len
      this.platform.device(`Fan: ${this.accessory.displayName} Rotation Speed Characteristic was not removed or not added. To Remove Chracteristic, Clear Cache on this Accessory.`);
    }

    if (device.irfan?.swing_mode) {
      // handle Osolcation events using the SwingMode characteristic
      this.service.getCharacteristic(this.platform.Characteristic.SwingMode).onSet(this.SwingModeSet.bind(this));
    } else if (this.service.testCharacteristic(this.platform.Characteristic.SwingMode) && !device.irfan?.swing_mode) {
      const characteristic = this.service.getCharacteristic(this.platform.Characteristic.SwingMode);
      this.service.removeCharacteristic(characteristic);
      this.platform.device(`Fan: ${this.accessory.displayName} Swing Mode Characteristic was removed.`);
    } else {
      // eslint-disable-next-line max-len
      this.platform.device(`Fan: ${this.accessory.displayName} Swing Mode Characteristic was not removed or not added. To Remove Chracteristic, Clear Cache on this Accessory.`);

    }
  }

  private SwingModeSet(value: CharacteristicValue) {
    this.platform.debug(`Fan: ${this.accessory.displayName} SwingMode: ${value}`);
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
  }

  private updateHomeKitCharacteristics() {
    if (this.Active === undefined) {
      this.platform.debug(`Fan: ${this.accessory.displayName} Active: ${this.Active}`);
    } else {
      this.service!.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
      this.platform.device(`Fan: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`);
    }
    if (this.SwingMode === undefined) {
      this.platform.debug(`Fan: ${this.accessory.displayName} SwingMode: ${this.SwingMode}`);
    } else {
      this.service!.updateCharacteristic(this.platform.Characteristic.SwingMode, this.SwingMode);
      this.platform.device(`Fan: ${this.accessory.displayName} updateCharacteristic SwingMode: ${this.SwingMode}`);
    }
    if (this.RotationSpeed === undefined) {
      this.platform.debug(`Fan: ${this.accessory.displayName} RotationSpeed: ${this.RotationSpeed}`);
    } else {
      this.service!.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.RotationSpeed);
      this.platform.device(`Fan: ${this.accessory.displayName} updateCharacteristic RotationSpeed: ${this.RotationSpeed}`);
    }
  }

  private RotationSpeedSet(value: CharacteristicValue) {
    this.platform.debug(`Fan: ${this.accessory.displayName} RotationSpeed: ${value}`);
    if (value > this.RotationSpeed) {
      this.RotationSpeed = 1;
      this.pushFanSpeedUpChanges();
      this.pushFanOnChanges();
    } else {
      this.RotationSpeed = 0;
      this.pushFanSpeedDownChanges();
    }
    this.RotationSpeed = value;
  }

  private ActiveSet(value: CharacteristicValue) {
    this.platform.debug(`Fan: ${this.accessory.displayName} Active: ${value}`);
    if (value === this.platform.Characteristic.Active.INACTIVE) {
      this.pushFanOffChanges();
    } else {
      this.pushFanOnChanges();
    }
    this.Active = value;
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
      } as payload;
      await this.pushTVChanges(payload);
    }
  }

  async pushFanOffChanges() {
    const payload = {
      commandType: 'command',
      parameter: 'default',
      command: 'turnOff',
    } as payload;
    await this.pushTVChanges(payload);
  }

  async pushFanSpeedUpChanges() {
    const payload = {
      commandType: 'command',
      parameter: 'default',
      command: 'highSpeed',
    } as payload;
    await this.pushTVChanges(payload);
  }

  async pushFanSpeedDownChanges() {
    const payload = {
      commandType: 'command',
      parameter: 'default',
      command: 'lowSpeed',
    } as payload;
    await this.pushTVChanges(payload);
  }

  async pushFanSwingChanges() {
    const payload = {
      commandType: 'command',
      parameter: 'default',
      command: 'swing',
    } as payload;
    await this.pushTVChanges(payload);
  }

  public async pushTVChanges(payload: payload) {
    try {
      this.platform.log.info(`Fan: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},`
        + ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`);

      // Make the API request
      const push = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
      this.platform.debug(`Fan: ${this.accessory.displayName} pushTVChanges: ${push.data}`);
      this.statusCode(push);
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.platform.log.error(`Fan: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection`);
      if (this.deviceDebug) {
        this.platform.log.error(`Fan: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,`
          + ` Error Message: ${JSON.stringify(e.message)}`);
      }
      if (this.debugDebug) {
        this.platform.log.error(`Fan: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,`
          + ` Error: ${JSON.stringify(e)}`);
      }
      this.apiError(e);
    }
  }

  private statusCode(push: AxiosResponse<{ statusCode: number; }>) {
    switch (push.data.statusCode) {
      case 151:
        this.platform.log.error(`Fan: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.platform.log.error(`Fan: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.platform.log.error(`Fan: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.platform.log.error(`Fan: ${this.accessory.displayName} Device is offline.`);
        break;
      case 171:
        this.platform.log.error(`Fan: ${this.accessory.displayName} Hub Device is offline.`);
        break;
      case 190:
        this.platform.log.error(`Fan: ${this.accessory.displayName} Device internal error due to device states not synchronized`
          + ` with server, Or command: ${JSON.stringify(push.data)} format is invalid`);
        break;
      case 100:
        this.platform.debug(`Fan: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.platform.debug(`Fan: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.Active, e);
    this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, e);
    this.service.updateCharacteristic(this.platform.Characteristic.SwingMode, e);
  }
}
