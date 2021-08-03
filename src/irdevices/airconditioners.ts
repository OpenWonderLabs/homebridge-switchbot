import { AxiosResponse } from 'axios';
import { CharacteristicValue, HAPStatus, PlatformAccessory, Service } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { DeviceURL, irdevice } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class AirConditioner {
  service!: Service;

  Active!: CharacteristicValue;
  RotationSpeed!: CharacteristicValue;
  CurrentHeaterCoolerState!: CharacteristicValue;
  CurrentTemperature!: CharacteristicValue;
  CurrentARTemp!: CharacteristicValue;
  CurrentARMode!: CharacteristicValue;
  CurrentARFanSpeed!: CharacteristicValue;
  ARActive!: CharacteristicValue;
  LastTemperature!: number;
  CurrentMode!: number;
  CurrentFanSpeed!: number;
  Busy: any;
  Timeout: any = null;
  static MODE_AUTO: number;
  static MODE_COOL: number;
  static MODE_HEAT: number;
  ValidValues: number[];

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
      accessory.getService(this.platform.Service.HeaterCooler) ||
      accessory.addService(this.platform.Service.HeaterCooler)), '%s %s', device.deviceName, device.remoteType;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Outlet, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // handle on / off events using the Active characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Active).onSet(this.ActiveSet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .setProps({
        minValue: 0,
        maxValue: 100,
        minStep: 0.01,
      })
      .onGet((value: CharacteristicValue) => {
        return this.CurrentTemperatureGet(value);
      });

    if (this.platform.config.options?.irair?.hide_automode) {
      this.ValidValues = [1, 2];
    } else {
      this.ValidValues = [0, 1, 2];
    }
    this.service
      .getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .setProps({
        validValues: this.ValidValues,
      })
      .onSet(this.TargetHeaterCoolerStateSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState).onGet(async () => {
      return this.CurrentHeaterCoolerStateGet();
    });

    this.service
      .getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .setProps({
        minValue: 16,
        maxValue: 30,
        minStep: 1,
      })
      .onGet(() => {
        return this.HeatingThresholdTemperatureGet();
      })
      .onSet(this.HeatingThresholdTemperatureSet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .setProps({
        minValue: 16,
        maxValue: 30,
        minStep: 1,
      })
      .onGet(() => {
        return this.HeatingThresholdTemperatureGet();
      })
      .onSet(this.HeatingThresholdTemperatureSet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .setProps({
        minStep: 1,
        minValue: 1,
        maxValue: 4,
      })
      .onGet(async () => {
        return this.RotationSpeedGet();
      })
      .onSet(this.RotationSpeedSet.bind(this));
  }

  private RotationSpeedSet(value: CharacteristicValue) {
    if (value === 4) {
      this.CurrentFanSpeed = 1;
    } else {
      this.CurrentFanSpeed = Number(value) + 1;
    }
    this.pushAirConditionerStatusChanges();
    this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.CurrentFanSpeed || 1);
    this.RotationSpeed = this.CurrentFanSpeed || 1;
  }

  private RotationSpeedGet() {
    if (!this.CurrentFanSpeed || this.CurrentFanSpeed === 1) {
      this.RotationSpeed = 4;
    } else {
      this.RotationSpeed = this.CurrentFanSpeed - 1;
    }
    return this.RotationSpeed;
  }

  private ActiveSet(value: CharacteristicValue) {
    this.platform.log.debug('%s %s Set Active: %s', this.device.remoteType, this.accessory.displayName, value);

    if (value === this.platform.Characteristic.Active.INACTIVE) {
      this.pushAirConditionerOffChanges();
    } else {
      this.pushAirConditionerOnChanges();
    }
    this.Active = value;
    if (this.Active !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
    }
  }

  private CurrentTemperatureGet(value: CharacteristicValue) {
    this.platform.log.debug('Trigger Get CurrentTemperture');

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .updateValue(this.CurrentTemperature || 24);
    return (this.CurrentTemperature = Number(value));
  }

  private TargetHeaterCoolerStateSet(value: CharacteristicValue) {
    switch (value) {
      case this.platform.Characteristic.TargetHeaterCoolerState.AUTO:
        this.CurrentMode = AirConditioner.MODE_AUTO;
        break;
      case this.platform.Characteristic.TargetHeaterCoolerState.COOL:
        this.CurrentMode = AirConditioner.MODE_COOL;
        break;
      case this.platform.Characteristic.TargetHeaterCoolerState.HEAT:
        this.CurrentMode = AirConditioner.MODE_HEAT;
        break;
      default:
        break;
    }
    this.pushAirConditionerStatusChanges();
  }

  private CurrentHeaterCoolerStateGet() {
    if (this.Active === 1) {
      if ((this.CurrentTemperature || 24) < (this.LastTemperature || 30)) {
        this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
      } else {
        this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
      }
    } else {
      this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }
    return this.CurrentHeaterCoolerState;
  }

  private HeatingThresholdTemperatureGet() {
    this.CurrentTemperature = this.CurrentTemperature || 24;
    return this.CurrentTemperature;
  }

  private HeatingThresholdTemperatureSet(value: CharacteristicValue) {
    this.pushAirConditionerStatusChanges();
    this.LastTemperature = Number(this.CurrentTemperature);
    this.CurrentTemperature = Number(value);
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType				commandType     Command	          command parameter	         Description
   * AirConditioner:        "command"       "swing"          "default"	        =        swing
   * AirConditioner:        "command"       "timer"          "default"	        =        timer
   * AirConditioner:        "command"       "lowSpeed"       "default"	        =        fan speed to low
   * AirConditioner:        "command"       "middleSpeed"    "default"	        =        fan speed to medium
   * AirConditioner:        "command"       "highSpeed"      "default"	        =        fan speed to high
   */
  async pushAirConditionerOnChanges() {
    if (this.Active !== 1) {
      const payload = {
        commandType: 'command',
        parameter: 'default',
        command: 'turnOn',
      } as any;
      await this.pushChanges(payload);
    }
  }

  async pushAirConditionerOffChanges() {
    if (this.Active !== 0) {
      const payload = {
        commandType: 'command',
        parameter: 'default',
        command: 'turnOff',
      } as any;
      await this.pushChanges(payload);
    }
  }

  async pushAirConditionerStatusChanges() {
    if (!this.Busy) {
      this.Busy = true;
      this.service.updateCharacteristic(
        this.platform.Characteristic.CurrentHeaterCoolerState,
        this.platform.Characteristic.CurrentHeaterCoolerState.IDLE,
      );
    }
    clearTimeout(this.Timeout);

    // Make a new Timeout set to go off in 1000ms (1 second)
    this.Timeout = setTimeout(this.pushAirConditionerDetailsChanges.bind(this), 1500);
  }

  async pushAirConditionerDetailsChanges() {
    const payload = {
      commandType: 'command',
      command: 'setAll',
    } as any;

    this.CurrentARTemp = this.CurrentTemperature || 24;
    this.CurrentARMode = this.CurrentMode || 1;
    this.CurrentARFanSpeed = this.CurrentFanSpeed || 1;
    this.ARActive = this.Active === 1 ? 'on' : 'off';
    payload.parameter = '%s,%s,%s,%s', this.CurrentARTemp, this.CurrentARMode, this.CurrentARFanSpeed, this.ARActive;


    if (this.Active === 1) {
      if ((this.CurrentTemperature || 24) < (this.LastTemperature || 30)) {
        this.service.updateCharacteristic(
          this.platform.Characteristic.CurrentHeaterCoolerState,
          this.platform.Characteristic.CurrentHeaterCoolerState.COOLING,
        );
      } else {
        this.service.updateCharacteristic(
          this.platform.Characteristic.CurrentHeaterCoolerState,
          this.platform.Characteristic.CurrentHeaterCoolerState.HEATING,
        );
      }
    } else {
      this.service.updateCharacteristic(
        this.platform.Characteristic.CurrentHeaterCoolerState,
        this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE,
      );
    }

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
      this.platform.log.debug(
        '%s %s pushChanges -',
        this.device.remoteType,
        this.accessory.displayName,
        JSON.stringify(payload),
      );

      // Make the API request
      const push = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
      this.platform.log.debug('%s %s Changes pushed -', this.device.remoteType, this.accessory.displayName, push.data);
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
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, e);
    this.service.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState, e);
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState, e);
    this.service.updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, e);
    new this.platform.api.hap.HapStatusError(HAPStatus.OPERATION_TIMED_OUT);
  }
}
