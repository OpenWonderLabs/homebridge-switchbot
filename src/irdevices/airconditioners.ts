import { AxiosResponse } from 'axios';
import { SwitchBotPlatform } from '../platform';
import { irDevicesConfig, DeviceURL, irdevice, payload } from '../settings';
import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class AirConditioner {
  // Services
  service!: Service;

  // Characteristic Values
  Active!: CharacteristicValue;
  ActiveCached!: CharacteristicValue;
  RotationSpeed!: CharacteristicValue;
  LastTemperature!: CharacteristicValue;
  CurrentTemperature!: CharacteristicValue;
  CurrentTemperatureCached!: CharacteristicValue;
  TargetHeaterCoolerState?: CharacteristicValue;
  CurrentHeaterCoolerState!: CharacteristicValue;

  // Others
  state!: string;
  Busy: any;
  Timeout: any = null;
  CurrentMode!: number;
  ValidValues: number[];
  CurrentFanSpeed!: number;
  static MODE_AUTO: number;
  static MODE_COOL: number;
  static MODE_HEAT: number;

  // Config
  deviceLogging!: string;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: irdevice & irDevicesConfig,
  ) {
    // default placeholders
    this.logs();
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

  logs() {
    if (this.device.logging) {
      this.deviceLogging = this.accessory.context.logging = this.device.logging;
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
    }
  }

  private RotationSpeedSet(value: CharacteristicValue) {
    if (value === 4) {
      this.CurrentFanSpeed = 1;
    } else {
      this.CurrentFanSpeed = Number(value) + 1;
    }
    this.pushAirConditionerStatusChanges();
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
    this.debugLog(`Air Conditioner: ${this.accessory.displayName} Set Active: ${value}`);

    if (value === this.platform.Characteristic.Active.INACTIVE) {
      this.pushAirConditionerOffChanges();
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} pushAirConditionerOffChanges, Active: ${this.Active}`);
    } else {
      this.pushAirConditionerOnChanges();
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} pushAirConditionerOffChanges, Active: ${this.Active}`);
    }
    this.Active = value;
    this.ActiveCached = this.Active;
    this.accessory.context.Active = this.ActiveCached;
  }

  private updateHomeKitCharacteristics() {
    if (this.Active === undefined) {
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} Active: ${this.Active}`);
    } else {
      this.service?.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`);
    }
    if (this.RotationSpeed === undefined) {
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} RotationSpeed: ${this.RotationSpeed}`);
    } else {
      this.service?.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.RotationSpeed);
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} updateCharacteristic RotationSpeed: ${this.RotationSpeed}`);
    }
    if (this.CurrentTemperature === undefined) {
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
    } else {
      this.service?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`);
    }
    if (this.TargetHeaterCoolerState === undefined) {
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`);
    } else {
      this.service?.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState, this.TargetHeaterCoolerState);
      this.debugLog(`Air Conditioner: ${this.accessory.displayName}`
        + ` updateCharacteristic TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`);
    }
    if (this.CurrentHeaterCoolerState === undefined) {
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`);
    } else {
      this.service?.updateCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState, this.CurrentHeaterCoolerState);
      this.debugLog(`Air Conditioner: ${this.accessory.displayName}`
        + ` updateCharacteristic CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`);
    }
  }

  private CurrentTemperatureGet(value: CharacteristicValue) {
    value = Number(this.CurrentTemperature) || 24;
    this.debugLog(`Air Conditioner: ${this.accessory.displayName} Trigger Get CurrentTemperature: ${value}`);

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .updateValue(value);

    return value;
  }

  private TargetHeaterCoolerStateSet(value: CharacteristicValue) {
    switch (value) {
      case this.platform.Characteristic.TargetHeaterCoolerState.HEAT:
        this.CurrentMode = AirConditioner.MODE_HEAT;
        this.debugLog(`Air Conditioner: ${this.accessory.displayName} (Set) TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`);
        break;
      case this.platform.Characteristic.TargetHeaterCoolerState.COOL:
        this.CurrentMode = AirConditioner.MODE_COOL;
        this.debugLog(`Air Conditioner: ${this.accessory.displayName} (Set) TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`);
        break;
      case this.platform.Characteristic.TargetHeaterCoolerState.AUTO:
        this.CurrentMode = AirConditioner.MODE_AUTO;
        this.debugLog(`Air Conditioner: ${this.accessory.displayName} (Set) TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`);
    }
    this.pushAirConditionerStatusChanges();
  }

  private CurrentHeaterCoolerStateGet() {
    if (this.Active === this.platform.Characteristic.Active.ACTIVE) {
      if ((this.CurrentTemperature || 24) < (this.LastTemperature || 30)) {
        this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
        this.debugLog(`Air Conditioner: ${this.accessory.displayName} (Get) CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`);
      } else {
        this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
        this.debugLog(`Air Conditioner: ${this.accessory.displayName} (Get) CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`);
      }
    } else {
      this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} (Get) CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`);
    }
    return this.CurrentHeaterCoolerState;
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
    if (this.Active !== this.platform.Characteristic.Active.ACTIVE) {
      const payload = {
        commandType: 'command',
        parameter: 'default',
        command: 'turnOn',
      } as any;
      await this.pushChanges(payload);
    }
  }

  async pushAirConditionerOffChanges() {
    if (this.Active !== this.platform.Characteristic.Active.INACTIVE) {
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
      this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
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

    if (this.CurrentTemperature === undefined) {
      this.CurrentTemperature = 24;
    }
    if (this.CurrentMode === undefined) {
      this.CurrentMode = 1;
    }
    if (this.CurrentFanSpeed === undefined) {
      this.CurrentFanSpeed = 1;
    }
    this.Active = this.platform.Characteristic.Active.ACTIVE;
    if (this.Active === this.platform.Characteristic.Active.ACTIVE) {
      this.state = 'on';
    } else {
      this.state = 'off';
    }
    payload.parameter = `${this.CurrentTemperature},${this.CurrentMode},${this.CurrentFanSpeed},${this.state}`;


    if (this.Active === this.platform.Characteristic.Active.ACTIVE) {
      if ((this.CurrentTemperature || 24) < (this.LastTemperature || 30)) {
        this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
      } else {
        this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
      }
    } else {
      this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }

    await this.pushChanges(payload);
  }

  public async pushChanges(payload: payload) {
    try {
      this.infoLog(`Air Conditioner: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},`
        + ` parameter: [${payload.parameter}], commandType: ${payload.commandType}`);

      // Make the API request
      const push: any = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
      this.errorLog(`Air Conditioner: ${this.accessory.displayName} pushChanges: ${JSON.stringify(push.data)}`);
      this.statusCode(push);
      this.CurrentTemperatureCached = this.CurrentTemperature;
      this.accessory.context.CurrentTemperature = this.CurrentTemperatureCached;
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.errorLog(`Air Conditioner: ${this.accessory.displayName} failed pushChanges`);
      if (this.deviceLogging === 'debug') {
        this.errorLog(`Air Conditioner: ${this.accessory.displayName} failed pushChanges,`
          + ` Error Message: ${JSON.stringify(e.message)}`);
      }
      if (this.platform.debugMode) {
        this.errorLog(`Air Conditioner: ${this.accessory.displayName} failed pushChanges,`
          + ` Error: ${JSON.stringify(e)}`);
      }
      this.apiError(e);
    }
  }

  private statusCode(push: AxiosResponse<{ statusCode: number; }>) {
    switch (push.data.statusCode) {
      case 151:
        this.errorLog(`Air Conditioner: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.errorLog(`Air Conditioner: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.errorLog(`Air Conditioner: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.errorLog(`Air Conditioner: ${this.accessory.displayName} Device is offline.`);
        break;
      case 171:
        this.errorLog(`Air Conditioner: ${this.accessory.displayName} Hub Device is offline. Hub: ${this.device.hubDeviceId}`);
        break;
      case 190:
        this.errorLog(`Air Conditioner: ${this.accessory.displayName} Device internal error due to device states not synchronized`
          + ` with server, Or command: ${JSON.stringify(push.data)} format is invalid`);
        break;
      case 100:
        this.debugLog(`Air Conditioner: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.debugLog(`Air Conditioner: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.Active, e);
    this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, e);
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, e);
    this.service.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState, e);
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState, e);
    this.service.updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, e);
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
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
      if (this.deviceLogging === 'debug') {
        this.platform.log.info('[DEBUG]', String(...log));
      } else {
        this.platform.log.debug(String(...log));
      }
    }
  }

  enablingDeviceLogging(): boolean {
    return this.deviceLogging === 'debug' || this.deviceLogging === 'standard';
  }
}
