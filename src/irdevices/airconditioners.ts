import { AxiosResponse } from 'axios';
import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { irDevicesConfig, DeviceURL, irdevice } from '../settings';

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
  LastTemperature!: CharacteristicValue;
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
    public device: irdevice & irDevicesConfig,
  ) {
    this.CurrentTemperature = 24;

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, device.remoteType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!);

    // get the Television service if it exists, otherwise create a new Television service
    // you can create multiple services for each accessory
    (this.service =
      accessory.getService(this.platform.Service.HeaterCooler) ||
      accessory.addService(this.platform.Service.HeaterCooler)), `${accessory.displayName} Air Conditioner`;

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
        this.platform.device(`onGet: ${this.CurrentTemperature}`);
        return this.CurrentTemperatureGet(value);
      });

    if (device.irair?.hide_automode) {
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
    this.platform.debug(`${this.accessory.displayName} Set Active: ${value}`);

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
    this.platform.debug('Trigger Get CurrentTemperture');
    if (this.CurrentTemperature) {
      this.CurrentTemperature;
      this.service
        .getCharacteristic(this.platform.Characteristic.CurrentTemperature).updateValue(this.CurrentTemperature);
    } else {
      this.CurrentTemperature = 24;
      this.service
        .getCharacteristic(this.platform.Characteristic.CurrentTemperature).updateValue(this.CurrentTemperature);
    }

    return (this.CurrentTemperature = value);
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
    this.platform.device(`CurrentHeaterCoolerStateGet: ${this.CurrentHeaterCoolerState}`);
    return this.CurrentHeaterCoolerState;
  }

  private HeatingThresholdTemperatureGet() {
    if (this.CurrentTemperature) {
      this.CurrentTemperature;
    } else {
      this.CurrentTemperature = 24;
    }
    this.platform.device(`HeatingThresholdTemperatureGet: ${this.CurrentTemperature}`);
    return this.CurrentTemperature;
  }

  private HeatingThresholdTemperatureSet(value: CharacteristicValue) {
    this.platform.device(`Before HeatingThresholdTemperatureSet CurrentTemperature: ${this.CurrentTemperature},`
      + ` HeatingThresholdTemperatureSet LastTemperature: ${this.LastTemperature}`);
    this.pushAirConditionerStatusChanges();
    this.LastTemperature = this.CurrentTemperature;
    if (this.CurrentTemperature) {
      this.CurrentTemperature = value;
    } else {
      this.CurrentTemperature = 24;
    }
    this.platform.device(`After HeatingThresholdTemperatureSet CurrentTemperature: ${this.CurrentTemperature},`
      + ` HeatingThresholdTemperatureSet LastTemperature: ${this.LastTemperature}`);
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
    payload.parameter = `${this.CurrentARTemp},${this.CurrentARMode},${this.CurrentARFanSpeed},${this.ARActive}`;


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
    this.service.updateCharacteristic(this.platform.Characteristic.Active, e);
    this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, e);
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, e);
    this.service.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState, e);
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState, e);
    this.service.updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, e);
  }
}
