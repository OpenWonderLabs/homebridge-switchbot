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
  coolerService!: Service;

  // Characteristic Values
  Active!: CharacteristicValue;
  ActiveCached!: CharacteristicValue;
  RotationSpeed!: CharacteristicValue;
  RotationSpeedCached!: CharacteristicValue;
  CurrentTemperature!: CharacteristicValue;
  CurrentTemperatureCached!: CharacteristicValue;
  TargetHeaterCoolerState!: CharacteristicValue;
  TargetHeaterCoolerStateCached!: CharacteristicValue;
  CurrentHeaterCoolerState!: CharacteristicValue;
  CurrentHeaterCoolerStateCached!: CharacteristicValue;
  HeatingThresholdTemperature!: CharacteristicValue;
  HeatingThresholdTemperatureCached!: CharacteristicValue;
  CoolingThresholdTemperature!: CharacteristicValue;
  CoolingThresholdTemperatureCached!: CharacteristicValue;

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
  hide_automode?: boolean;
  pushOn?: boolean;

  constructor(private readonly platform: SwitchBotPlatform, private accessory: PlatformAccessory, public device: irdevice & irDevicesConfig) {
    // default placeholders
    this.logs(device);
    this.config(device);
    this.pushOnChanges(device);
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
    if (device.irair?.hide_automode) {
      this.hide_automode = device.irair?.hide_automode;
      this.accessory.context.hide_automode = this.hide_automode;
    } else {
      this.hide_automode = device.irair?.hide_automode;
      this.accessory.context.hide_automode = this.hide_automode;
    }

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, device.remoteType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!);

    // get the Television service if it exists, otherwise create a new Television service
    // you can create multiple services for each accessory
    (this.coolerService = accessory.getService(this.platform.Service.HeaterCooler) || accessory.addService(this.platform.Service.HeaterCooler)),
    `${accessory.displayName} Air Conditioner`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Outlet, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.coolerService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // handle on / off events using the Active characteristic
    this.coolerService.getCharacteristic(this.platform.Characteristic.Active).onSet(this.ActiveSet.bind(this));

    this.coolerService
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .setProps({
        minValue: 0,
        maxValue: 100,
        minStep: 0.01,
      })
      .onGet(() => {
        return this.CurrentTemperatureGet();
      });

    if (this.hide_automode) {
      this.TargetHeaterCoolerState = 1 || 2;
      this.ValidValues = [1, 2];
      this.debugLog(
        `Air Conditioner: ${this.accessory.displayName} ValidValues: ${JSON.stringify(this.ValidValues)},` +
          ` hide_automode: ${this.hide_automode}, TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`,
      );
    } else {
      this.TargetHeaterCoolerState = 0 || 1 || 2;
      this.ValidValues = [0, 1, 2];
      this.debugLog(
        `Air Conditioner: ${this.accessory.displayName} ValidValues: ${JSON.stringify(this.ValidValues)},` +
          ` hide_automode: ${this.hide_automode}, TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`,
      );
    }
    this.coolerService
      .getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .setProps({
        validValues: this.ValidValues,
      })
      .onGet(async () => {
        return this.TargetHeaterCoolerStateGet();
      })
      .onSet(this.TargetHeaterCoolerStateSet.bind(this));

    this.coolerService.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState).onGet(async () => {
      return this.CurrentHeaterCoolerStateGet();
    });

    this.coolerService
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

    this.coolerService
      .getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .setProps({
        minValue: 16,
        maxValue: 30,
        minStep: 1,
      })
      .onGet(() => {
        return this.CoolingThresholdTemperatureGet();
      })
      .onSet(this.CoolingThresholdTemperatureSet.bind(this));

    this.coolerService
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

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType				commandType     Command	          command parameter	         Description
   * AirConditioner:        "command"       "swing"          "default"	        =        swing
   * AirConditioner:        "command"       "timer"          "default"	        =        timer
   * AirConditioner:        "command"       "lowSpeed"       "default"	        =        fan speed to low
   * AirConditioner:        "command"       "middleSpeed"    "default"	        =        fan speed to medium
   * AirConditioner:        "command"       "highSpeed"      "default"	        =        fan speed to high
   */
  async pushAirConditionerOnChanges(): Promise<void> {
    if (this.Active !== this.platform.Characteristic.Active.ACTIVE || this.pushOn) {
      const payload = {
        commandType: 'command',
        parameter: 'default',
        command: 'turnOn',
      } as any;
      await this.pushChanges(payload);
    }
  }

  async pushAirConditionerOffChanges(): Promise<void> {
    const payload = {
      commandType: 'command',
      parameter: 'default',
      command: 'turnOff',
    } as any;
    await this.pushChanges(payload);
  }

  async pushAirConditionerStatusChanges(): Promise<void> {
    if (!this.Busy) {
      this.Busy = true;
      this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
    }
    clearTimeout(this.Timeout);

    // Make a new Timeout set to go off in 1000ms (1 second)
    this.Timeout = setTimeout(this.pushAirConditionerDetailsChanges.bind(this), 1500);
  }

  async pushAirConditionerDetailsChanges(): Promise<void> {
    const payload = {
      commandType: 'command',
      command: 'setAll',
    } as any;

    this.CurrentTemperatureUndefined();
    if (this.CurrentMode === undefined) {
      this.CurrentMode = 1;
    }
    if (this.CurrentFanSpeed === undefined) {
      this.CurrentFanSpeed = 1;
    }
    if (this.Active === this.platform.Characteristic.Active.ACTIVE) {
      this.state = 'on';
    } else {
      this.state = 'off';
    }
    if (this.CurrentMode === 1) {
      this.CurrentTemperature = 25;
      this.debugLog(
        `Air Conditioner: ${this.accessory.displayName} CurrentMode: ${this.CurrentMode},` + ` CurrentTemperature: ${this.CurrentTemperature}`,
      );
    }
    payload.parameter = `${this.CurrentTemperature},${this.CurrentMode},${this.CurrentFanSpeed},${this.state}`;

    if (this.Active === this.platform.Characteristic.Active.ACTIVE) {
      this.CurrentTemperatureUndefined();
      if (this.CurrentTemperature < this.CurrentTemperatureCached) {
        this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
      } else if (this.CurrentTemperature > this.CurrentTemperatureCached) {
        this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
      }
    } else {
      this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }

    await this.pushChanges(payload);
  }

  async pushChanges(payload: payload): Promise<void> {
    try {
      this.infoLog(
        `Air Conditioner: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},` +
          ` parameter: [${payload.parameter}], commandType: ${payload.commandType}`,
      );

      // Make the API request
      const push: any = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} pushChanges: ${JSON.stringify(push.data)}`);
      this.statusCode(push);
      this.CurrentTemperatureCached = this.CurrentTemperature;
      this.accessory.context.CurrentTemperature = this.CurrentTemperatureCached;
      this.HeatingThresholdTemperature = this.CurrentTemperatureCached;
      this.HeatingThresholdTemperatureCached = this.CurrentTemperatureCached;
      this.accessory.context.HeatingThresholdTemperature = this.HeatingThresholdTemperatureCached;
      this.CoolingThresholdTemperature = this.CurrentTemperatureCached;
      this.CoolingThresholdTemperatureCached = this.CurrentTemperatureCached;
      this.accessory.context.CoolingThresholdTemperature = this.CoolingThresholdTemperatureCached;
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.errorLog(`Air Conditioner: ${this.accessory.displayName} failed pushChanges`);
      if (this.deviceLogging.includes('debug')) {
        this.errorLog(`Air Conditioner: ${this.accessory.displayName} failed pushChanges,` + ` Error Message: ${JSON.stringify(e.message)}`);
      }
      this.apiError(e);
    }
  }

  async statusCode(push: AxiosResponse<{ statusCode: number }>): Promise<void> {
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
        this.errorLog(
          `Air Conditioner: ${this.accessory.displayName} Device internal error due to device states not synchronized` +
            ` with server, Or command: ${JSON.stringify(push.data)} format is invalid`,
        );
        break;
      case 100:
        this.debugLog(`Air Conditioner: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.debugLog(`Air Conditioner: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    if (this.Active === undefined) {
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} Active: ${this.Active}`);
    } else {
      this.coolerService?.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`);
    }
    if (this.RotationSpeed === undefined) {
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} RotationSpeed: ${this.RotationSpeed}`);
    } else {
      this.coolerService?.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.RotationSpeed);
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} updateCharacteristic RotationSpeed: ${this.RotationSpeed}`);
    }
    if (this.CurrentTemperature === undefined) {
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
    } else {
      this.coolerService?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`);
    }
    if (this.TargetHeaterCoolerState === undefined) {
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`);
    } else {
      this.coolerService?.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState, this.TargetHeaterCoolerState);
      this.debugLog(
        `Air Conditioner: ${this.accessory.displayName}` + ` updateCharacteristic TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`,
      );
    }
    if (this.CurrentHeaterCoolerState === undefined) {
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`);
    } else {
      this.coolerService?.updateCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState, this.CurrentHeaterCoolerState);
      this.debugLog(
        `Air Conditioner: ${this.accessory.displayName}` + ` updateCharacteristic CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`,
      );
    }
    if (this.HeatingThresholdTemperature === undefined) {
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} HeatingThresholdTemperature: ${this.HeatingThresholdTemperature}`);
    } else {
      this.coolerService?.updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, this.HeatingThresholdTemperature);
      this.debugLog(
        `Air Conditioner: ${this.accessory.displayName}` + ` updateCharacteristic HeatingThresholdTemperature: ${this.HeatingThresholdTemperature}`,
      );
    }
    if (this.CoolingThresholdTemperature === undefined) {
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} CoolingThresholdTemperature: ${this.CoolingThresholdTemperature}`);
    } else {
      this.coolerService?.updateCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature, this.CoolingThresholdTemperature);
      this.debugLog(
        `Air Conditioner: ${this.accessory.displayName}` + ` updateCharacteristic CoolingThresholdTemperature: ${this.CoolingThresholdTemperature}`,
      );
    }
  }

  async apiError(e: any): Promise<void> {
    this.coolerService.updateCharacteristic(this.platform.Characteristic.Active, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature, e);
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  async CurrentTemperatureGet(): Promise<CharacteristicValue> {
    if (this.CurrentTemperature === undefined) {
      this.CurrentTemperature = 24;
      this.CurrentTemperatureCached = this.CurrentTemperature;
    } else {
      this.CurrentTemperatureCached = this.CurrentTemperature;
    }
    this.debugLog(`Air Conditioner: ${this.accessory.displayName} Get CurrentTemperature: ${this.CurrentTemperature}`);
    this.accessory.context.CurrentTemperature = this.CurrentTemperatureCached;
    return this.CurrentTemperature;
  }

  async RotationSpeedGet(): Promise<number> {
    if (!this.CurrentFanSpeed) {
      this.RotationSpeed = 4;
    } else if (this.CurrentFanSpeed === 1) {
      this.RotationSpeed = 4;
    } else {
      this.RotationSpeed = this.CurrentFanSpeed - 1;
    }
    this.debugLog(`Air Conditioner: ${this.accessory.displayName} Get RotationSpeed: ${this.RotationSpeed}`);
    this.RotationSpeedCached = this.RotationSpeed;
    this.accessory.context.RotationSpeed = this.RotationSpeedCached;
    return this.RotationSpeed;
  }

  async RotationSpeedSet(value: CharacteristicValue): Promise<void> {
    if (value === 4) {
      this.CurrentFanSpeed = 1;
    } else {
      this.CurrentFanSpeed = Number(value) + 1;
    }
    this.RotationSpeed = this.CurrentFanSpeed;
    this.RotationSpeedCached = this.RotationSpeed;
    this.accessory.context.RotationSpeed = this.RotationSpeedCached;
    this.pushAirConditionerStatusChanges();
  }

  async ActiveSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`Air Conditioner: ${this.accessory.displayName} Set Active: ${value}`);

    this.Active = value;
    this.ActiveCached = this.Active;
    this.accessory.context.Active = this.ActiveCached;

    if (value === this.platform.Characteristic.Active.INACTIVE) {
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} pushAirConditionerOffChanges, Active: ${this.Active}`);
      this.pushAirConditionerOffChanges();
    } else {
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} pushAirConditionerOnChanges, Active: ${this.Active}`);
      if (this.pushOn) {
        this.pushAirConditionerOnChanges();
      } else {
        this.pushAirConditionerStatusChanges();
      }
    }
  }

  async TargetHeaterCoolerStateGet(): Promise<CharacteristicValue> {
    if (this.ValidValues === [0, 1, 2]) {
      this.TargetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
      this.debugLog(
        `Air Conditioner: ${this.accessory.displayName} Get (AUTO) TargetHeaterCoolerState: ${this.CurrentHeaterCoolerState},` +
          ` ValidValues: ${this.ValidValues}`,
      );
    } else if (this.ValidValues === [1, 2]) {
      this.TargetHeaterCoolerState =
        this.platform.Characteristic.TargetHeaterCoolerState.COOL || this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
      this.debugLog(
        `Air Conditioner: ${this.accessory.displayName} Get (COOL/HEAT) TargetHeaterCoolerState: ${this.CurrentHeaterCoolerState},` +
          ` ValidValues: ${this.ValidValues}`,
      );
    } else {
      this.debugLog(
        `Air Conditioner: ${this.accessory.displayName} Get TargetHeaterCoolerState: ${this.CurrentHeaterCoolerState},` +
          ` ValidValues: ${this.ValidValues}`,
      );
    }
    this.TargetHeaterCoolerStateCached = this.TargetHeaterCoolerState;
    this.accessory.context.TargetHeaterCoolerState = this.TargetHeaterCoolerStateCached;
    return this.TargetHeaterCoolerState;
  }

  async TargetHeaterCoolerStateSet(value: CharacteristicValue): Promise<void> {
    if (this.hide_automode) {
      if (value === this.platform.Characteristic.TargetHeaterCoolerState.HEAT) {
        this.TargetHeaterCoolerStateHEAT();
      } else if (value === this.platform.Characteristic.TargetHeaterCoolerState.COOL) {
        this.TargetHeaterCoolerStateCOOL();
      } else {
        this.errorLog(
          `Air Conditioner: ${this.accessory.displayName} Set TargetHeaterCoolerState: ${this.TargetHeaterCoolerState},` +
            ` hide_automode: ${this.hide_automode} `,
        );
      }
    } else {
      if (value === this.platform.Characteristic.TargetHeaterCoolerState.AUTO) {
        this.TargetHeaterCoolerStateAUTO();
      } else if (value === this.platform.Characteristic.TargetHeaterCoolerState.HEAT) {
        this.TargetHeaterCoolerStateHEAT();
      } else if (value === this.platform.Characteristic.TargetHeaterCoolerState.COOL) {
        this.TargetHeaterCoolerStateCOOL();
      } else {
        this.errorLog(
          `Air Conditioner: ${this.accessory.displayName} Set TargetHeaterCoolerState: ${this.TargetHeaterCoolerState},` +
            ` hide_automode: ${this.hide_automode} `,
        );
      }
    }
    this.TargetHeaterCoolerStateCached = this.TargetHeaterCoolerState;
    this.accessory.context.TargetHeaterCoolerState = this.TargetHeaterCoolerStateCached;
    this.pushAirConditionerStatusChanges();
  }

  async TargetHeaterCoolerStateAUTO(): Promise<void> {
    this.TargetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
    this.CurrentMode = 1;
    this.debugLog(`Air Conditioner: ${this.accessory.displayName} Set (AUTO) TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`);
    this.debugLog(`Air Conditioner: ${this.accessory.displayName} Switchbot CurrentMode: ${this.CurrentMode}`);
  }

  async TargetHeaterCoolerStateCOOL(): Promise<void> {
    this.TargetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.COOL;
    this.CurrentMode = 2;
    this.debugLog(`Air Conditioner: ${this.accessory.displayName} Set (COOL) TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`);
    this.debugLog(`Air Conditioner: ${this.accessory.displayName} Switchbot CurrentMode: ${this.CurrentMode}`);
  }

  async TargetHeaterCoolerStateHEAT(): Promise<void> {
    this.TargetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
    this.CurrentMode = 5;
    this.debugLog(`Air Conditioner: ${this.accessory.displayName} Set (HEAT) TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`);
    this.debugLog(`Air Conditioner: ${this.accessory.displayName} Switchbot CurrentMode: ${this.CurrentMode}`);
  }

  async CurrentHeaterCoolerStateGet(): Promise<CharacteristicValue> {
    if (this.Active === this.platform.Characteristic.Active.ACTIVE) {
      this.CurrentTemperatureUndefined();
      if (this.CurrentTemperature < this.CurrentTemperatureCached) {
        this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
        this.debugLog(`Air Conditioner: ${this.accessory.displayName} Get (COOLLING) CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`);
      } else if (this.CurrentTemperature > this.CurrentTemperatureCached) {
        this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
        this.debugLog(`Air Conditioner: ${this.accessory.displayName} Get (HEATING) CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`);
      }
    } else {
      this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} Get (INACTIVE) CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`);
    }
    this.CurrentHeaterCoolerStateCached = this.CurrentHeaterCoolerState;
    this.accessory.context.CurrentHeaterCoolerState = this.CurrentHeaterCoolerStateCached;
    return this.CurrentHeaterCoolerState;
  }

  async HeatingThresholdTemperatureGet(): Promise<CharacteristicValue> {
    this.CurrentTemperatureUndefined;
    this.CurrentTemperature = this.CurrentTemperatureCached;
    this.HeatingThresholdTemperature = this.CurrentTemperatureCached;
    this.HeatingThresholdTemperatureCached = this.HeatingThresholdTemperature;
    this.accessory.context.HeatingThresholdTemperature = this.HeatingThresholdTemperatureCached;
    this.debugLog(`Air Conditioner: ${this.accessory.displayName} Get HeatingThresholdTemperature: ${this.HeatingThresholdTemperature}`);
    return this.HeatingThresholdTemperature;
  }

  async HeatingThresholdTemperatureSet(value: CharacteristicValue): Promise<void> {
    this.CurrentTemperatureCached = this.CurrentTemperature;
    this.CurrentTemperature = value;
    this.HeatingThresholdTemperatureCached = this.HeatingThresholdTemperature;
    this.accessory.context.HeatingThresholdTemperature = this.HeatingThresholdTemperatureCached;
    this.debugLog(
      `Air Conditioner: ${this.accessory.displayName} Set HeatingThresholdTemperature: ${this.HeatingThresholdTemperature},` +
        ` CurrentTemperatureCached: ${this.CurrentTemperatureCached}`,
    );
    this.pushAirConditionerStatusChanges();
  }

  async CoolingThresholdTemperatureGet(): Promise<CharacteristicValue> {
    this.CurrentTemperatureUndefined;
    this.CurrentTemperature = this.CurrentTemperatureCached;
    this.CoolingThresholdTemperature = this.CurrentTemperatureCached;
    this.CoolingThresholdTemperatureCached = this.CoolingThresholdTemperature;
    this.accessory.context.CoolingThresholdTemperature = this.CoolingThresholdTemperatureCached;
    this.debugLog(`Air Conditioner: ${this.accessory.displayName} Get CoolingThresholdTemperature: ${this.CoolingThresholdTemperature}`);
    return this.CoolingThresholdTemperature;
  }

  async CoolingThresholdTemperatureSet(value: CharacteristicValue): Promise<void> {
    this.CurrentTemperatureCached = this.CurrentTemperature;
    this.CurrentTemperature = value;
    this.CoolingThresholdTemperatureCached = this.CoolingThresholdTemperature;
    this.accessory.context.CoolingThresholdTemperature = this.CoolingThresholdTemperatureCached;
    this.debugLog(
      `Air Conditioner: ${this.accessory.displayName} Set CoolingThresholdTemperature: ${this.CoolingThresholdTemperature},` +
        ` CurrentTemperatureCached: ${this.CurrentTemperatureCached}`,
    );
    this.pushAirConditionerStatusChanges();
  }

  async CurrentTemperatureUndefined(): Promise<void> {
    if (this.CurrentTemperature === undefined) {
      this.CurrentTemperature = 24;
    }
    if (this.CurrentTemperatureCached === undefined) {
      this.CurrentTemperature = 30;
    }
  }

  async config(device: irdevice & irDevicesConfig): Promise<void> {
    let config = {};
    if (device.irair) {
      config = device.irair;
    }
    if (device.logging !== undefined) {
      config['logging'] = device.logging;
    }
    if (Object.entries(config).length !== 0) {
      this.infoLog(`Air Conditioner: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  async logs(device: irdevice & irDevicesConfig): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugLog(`Air Conditioner: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
    }
  }


  async pushOnChanges(device: irdevice & irDevicesConfig): Promise<void> {
    if (device.irair?.pushOn) {
      this.pushOn = true;
    } else {
      this.pushOn = false;
    }
  }

  /**
   * Logging for Device
   */
  infoLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.info(String(...log));
    }
  }

  warnLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.warn(String(...log));
    }
  }

  errorLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.error(String(...log));
    }
  }

  debugLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging === 'debug') {
        this.platform.log.info('[DEBUG]', String(...log));
      } else {
        this.platform.log.debug(String(...log));
      }
    }
  }

  enablingDeviceLogging(): boolean {
    return this.deviceLogging.includes('debug') || this.deviceLogging === 'standard';
  }
}
