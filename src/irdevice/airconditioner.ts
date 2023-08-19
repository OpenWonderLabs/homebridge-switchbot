import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { request } from 'undici';
import { SwitchBotPlatform } from '../platform';
import { Devices, irDevicesConfig, irdevice } from '../settings';
import { StatusCodeDescription } from '../utils';

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
  RotationSpeed!: CharacteristicValue;
  CurrentTemperature!: CharacteristicValue;
  CurrentRelativeHumidity?: CharacteristicValue;
  TargetHeaterCoolerState!: CharacteristicValue;
  CurrentHeaterCoolerState!: CharacteristicValue;
  ThresholdTemperature!: CharacteristicValue;

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
  disablePushOn?: boolean;
  disablePushOff?: boolean;
  disablePushDetail?: boolean;
  deviceLogging!: string;
  hide_automode?: boolean;
  meter?: PlatformAccessory;

  private readonly valid12 = [1, 2];
  private readonly valid012 = [0, 1, 2];

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: irdevice & irDevicesConfig,
  ) {
    // default placeholders
    this.logs({ device });
    this.context();
    this.disablePushOnChanges({ device });
    this.disablePushOffChanges({ device });
    this.disablePushDetailChanges({ device });
    this.config({ device });

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, device.remoteType)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision({ accessory, device }))
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
      .updateValue(this.FirmwareRevision({ accessory, device }));

    // get the Television service if it exists, otherwise create a new Television service
    // you can create multiple services for each accessory
    (this.coolerService = accessory.getService(this.platform.Service.HeaterCooler) || accessory.addService(this.platform.Service.HeaterCooler)),
    `${accessory.displayName} ${device.remoteType}`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Outlet, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.coolerService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
    if (!this.coolerService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
      this.coolerService.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
    }

    // handle on / off events using the Active characteristic
    this.coolerService.getCharacteristic(this.platform.Characteristic.Active).onSet(this.ActiveSet.bind(this));

    this.coolerService.getCharacteristic(this.platform.Characteristic.CurrentTemperature).onGet(this.CurrentTemperatureGet.bind(this));

    this.ValidValues = this.hide_automode ? [1, 2] : [0, 1, 2];

    if (this.device.irair?.meterType && this.device.irair?.meterId) {
      const meterUuid = this.platform.api.hap.uuid.generate(`${this.device.irair.meterId}-${this.device.irair.meterType}`);
      this.meter = this.platform.accessories.find((accessory) => accessory.UUID === meterUuid);
    }

    if (this.meter) {
      this.coolerService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity).onGet(this.CurrentRelativeHumidityGet.bind(this));
    }

    this.coolerService
      .getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .setProps({
        validValues: this.ValidValues,
      })
      .onGet(this.TargetHeaterCoolerStateGet.bind(this))
      .onSet(this.TargetHeaterCoolerStateSet.bind(this));

    this.coolerService.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState).onGet(this.CurrentHeaterCoolerStateGet.bind(this));

    this.coolerService
      .getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .setProps({
        minValue: 0,
        maxValue: 35,
        minStep: 0.5,
      })
      .onGet(this.ThresholdTemperatureGet.bind(this))
      .onSet(this.ThresholdTemperatureSet.bind(this));

    this.coolerService
      .getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .setProps({
        minValue: 0,
        maxValue: 35,
        minStep: 0.5,
      })
      .onGet(this.ThresholdTemperatureGet.bind(this))
      .onSet(this.ThresholdTemperatureSet.bind(this));

    this.coolerService
      .getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .setProps({
        format: 'int',
        minStep: 1,
        minValue: 1,
        maxValue: 4,
      })
      .onGet(this.RotationSpeedGet.bind(this))
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
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} pushAirConditionerOnChanges Active: ${this.Active},` +
      ` disablePushOn: ${this.disablePushOn}`,
    );
    if (this.Active === this.platform.Characteristic.Active.ACTIVE && !this.disablePushOn) {
      const commandType: string = await this.commandType();
      const command: string = await this.commandOn();
      const bodyChange = JSON.stringify({
        command: command,
        parameter: 'default',
        commandType: commandType,
      });
      await this.pushChanges(bodyChange);
    }
  }

  async pushAirConditionerOffChanges(): Promise<void> {
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} pushAirConditionerOffChanges Active: ${this.Active},` +
      ` disablePushOff: ${this.disablePushOff}`,
    );
    if (this.Active === this.platform.Characteristic.Active.INACTIVE && !this.disablePushOff) {
      const commandType: string = await this.commandType();
      const command: string = await this.commandOff();
      const bodyChange = JSON.stringify({
        command: command,
        parameter: 'default',
        commandType: commandType,
      });
      await this.pushChanges(bodyChange);
    }
  }

  async pushAirConditionerStatusChanges(): Promise<void> {
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} pushAirConditionerStatusChanges Active: ${this.Active},` +
      ` disablePushOff: ${this.disablePushOff},  disablePushOn: ${this.disablePushOn}`,
    );
    if (!this.Busy) {
      this.Busy = true;
      this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
    }
    clearTimeout(this.Timeout);

    // Make a new Timeout set to go off in 1000ms (1 second)
    this.Timeout = setTimeout(this.pushAirConditionerDetailsChanges.bind(this), 1500);
  }

  async pushAirConditionerDetailsChanges(): Promise<void> {
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} pushAirConditionerDetailsChanges Active: ${this.Active},` +
      ` disablePushOff: ${this.disablePushOff},  disablePushOn: ${this.disablePushOn}`,
    );
    //await this.context();
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
      // Remove or make configurable?
      this.ThresholdTemperature = 25;
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} CurrentMode: ${this.CurrentMode},` +
        ` ThresholdTemperature: ${this.ThresholdTemperature}`,
      );
    }
    const parameter = `${this.ThresholdTemperature},${this.CurrentMode},${this.CurrentFanSpeed},${this.state}`;

    await this.UpdateCurrentHeaterCoolerState();
    const bodyChange = JSON.stringify({
      command: 'setAll',
      parameter: `${parameter}`,
      commandType: 'command',
    });

    await this.pushChanges(bodyChange);
  }

  private async UpdateCurrentHeaterCoolerState() {
    if (this.Active === this.platform.Characteristic.Active.ACTIVE) {
      await this.context();
      if (this.ThresholdTemperature < this.CurrentTemperature &&
        this.TargetHeaterCoolerState !== this.platform.Characteristic.TargetHeaterCoolerState.HEAT) {
        this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
      } else if (this.ThresholdTemperature > this.CurrentTemperature &&
        this.TargetHeaterCoolerState !== this.platform.Characteristic.TargetHeaterCoolerState.COOL) {
        this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
      } else {
        this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
      }
    } else {
      this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }
  }

  async pushChanges(bodyChange: any): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushChanges`);
    if (this.device.connectionType === 'OpenAPI' && !this.disablePushDetail) {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode, headers } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        await this.statusCode(statusCode);
        const deviceStatus: any = await body.json();
        await this.statusCode(deviceStatus.statusCode);
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Devices: ${JSON.stringify(deviceStatus.body)}`);
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Headers: ${JSON.stringify(headers)}`);
        this.updateHomeKitCharacteristics();
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(
          `${this.device.remoteType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType}` +
          ` Connection, Error Message: ${JSON.stringify(e.message)}`,
        );
      }
    } else {
      this.warnLog(
        `${this.device.remoteType}: ${this.accessory.displayName}` +
        ` Connection Type: ${this.device.connectionType}, commands will not be sent to OpenAPI`,
      );
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName}` +
        ` Connection Type: ${this.device.connectionType}, disablePushDetails: ${this.disablePushDetail}`,
      );
      this.updateHomeKitCharacteristics();
    }
  }

  async CurrentTemperatureGet(): Promise<CharacteristicValue> {
    if (this.meter?.context?.CurrentTemperature) {
      this.accessory.context.CurrentTemperature = this.meter.context.CurrentTemperature;
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} `
        + `Using CurrentTemperature from ${this.meter.context.deviceType} (${this.meter.context.deviceID})`,
      );
    }

    this.CurrentTemperature = this.accessory.context.CurrentTemperature || 24;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Get CurrentTemperature: ${this.CurrentTemperature}`);
    return this.CurrentTemperature;
  }

  async CurrentRelativeHumidityGet(): Promise<CharacteristicValue> {
    if (this.meter?.context?.CurrentRelativeHumidity) {
      this.accessory.context.CurrentRelativeHumidity = this.meter.context.CurrentRelativeHumidity;
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} `
        + `Using CurrentRelativeHumidity from ${this.meter.context.deviceType} (${this.meter.context.deviceID})`,
      );
    }

    this.CurrentRelativeHumidity = this.accessory.context.CurrentRelativeHumidity || 0;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Get CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
    return this.CurrentRelativeHumidity as CharacteristicValue;
  }

  async RotationSpeedGet(): Promise<number> {
    if (!this.CurrentFanSpeed || this.CurrentFanSpeed === 1) {
      this.RotationSpeed = 4;
    } else {
      this.RotationSpeed = this.CurrentFanSpeed - 1;
    }
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Get RotationSpeed: ${this.RotationSpeed}`);
    return this.RotationSpeed;
  }

  async RotationSpeedSet(value: CharacteristicValue): Promise<void> {
    if (value === 4) {
      this.CurrentFanSpeed = 1;
    } else {
      this.CurrentFanSpeed = Number(value) + 1;
    }
    this.RotationSpeed = value;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName}` +
      `Set RotationSpeed: ${this.RotationSpeed}, CurrentFanSpeed: ${this.CurrentFanSpeed}`);
    this.pushAirConditionerStatusChanges();
  }

  async ActiveSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Active: ${value}`);

    this.Active = value;
    if (this.Active === this.platform.Characteristic.Active.ACTIVE) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushAirConditionerOnChanges, Active: ${this.Active}`);
      if (this.disablePushOn) {
        this.pushAirConditionerStatusChanges();
      } else {
        this.pushAirConditionerOnChanges();
      }
    } else {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushAirConditionerOffChanges, Active: ${this.Active}`);
      this.pushAirConditionerOffChanges();
    }
  }

  async TargetHeaterCoolerStateGet(): Promise<CharacteristicValue> {
    const targetState = this.TargetHeaterCoolerState || this.accessory.context.TargetHeaterCoolerState;
    this.TargetHeaterCoolerState = this.ValidValues.includes(targetState) ? targetState : this.ValidValues[0];
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} Get (${this.getTargetHeaterCoolerStateName()})` +
      ` TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}, ValidValues: ${this.ValidValues},  hide_automode: ${this.hide_automode}`,
    );
    return this.TargetHeaterCoolerState;
  }

  async TargetHeaterCoolerStateSet(value: CharacteristicValue): Promise<void> {
    if (!this.hide_automode && value === this.platform.Characteristic.TargetHeaterCoolerState.AUTO) {
      this.TargetHeaterCoolerStateAUTO();
    } else if (value === this.platform.Characteristic.TargetHeaterCoolerState.HEAT) {
      this.TargetHeaterCoolerStateHEAT();
    } else if (value === this.platform.Characteristic.TargetHeaterCoolerState.COOL) {
      this.TargetHeaterCoolerStateCOOL();
    } else {
      this.errorLog(
        `${this.device.remoteType}: ${this.accessory.displayName} Set TargetHeaterCoolerState: ${this.TargetHeaterCoolerState},` +
        ` hide_automode: ${this.hide_automode} `,
      );
    }
    this.pushAirConditionerStatusChanges();
  }

  async TargetHeaterCoolerStateAUTO(): Promise<void> {
    this.TargetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
    this.CurrentMode = 1;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set (AUTO) TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`);
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Switchbot CurrentMode: ${this.CurrentMode}`);
  }

  async TargetHeaterCoolerStateCOOL(): Promise<void> {
    this.TargetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.COOL;
    this.CurrentMode = 2;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set (COOL) TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`);
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Switchbot CurrentMode: ${this.CurrentMode}`);
  }

  async TargetHeaterCoolerStateHEAT(): Promise<void> {
    this.TargetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
    this.CurrentMode = 5;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set (HEAT) TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`);
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Switchbot CurrentMode: ${this.CurrentMode}`);
  }

  async CurrentHeaterCoolerStateGet(): Promise<CharacteristicValue> {
    await this.UpdateCurrentHeaterCoolerState();
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName}` +
      ` Get (${this.getTargetHeaterCoolerStateName()}) CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`,
    );

    return this.CurrentHeaterCoolerState;
  }


  private getTargetHeaterCoolerStateName(): string {
    switch (this.TargetHeaterCoolerState) {
      case this.platform.Characteristic.TargetHeaterCoolerState.AUTO:
        return 'AUTO';
      case this.platform.Characteristic.TargetHeaterCoolerState.HEAT:
        return 'HEAT';
      case this.platform.Characteristic.TargetHeaterCoolerState.COOL:
        return 'COOL';
      default:
        return this.TargetHeaterCoolerState.toString();
    }
  }

  async ThresholdTemperatureGet(): Promise<CharacteristicValue> {
    await this.context();
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Get ThresholdTemperature: ${this.ThresholdTemperature}`);
    return this.ThresholdTemperature;
  }

  async ThresholdTemperatureSet(value: CharacteristicValue): Promise<void> {
    this.ThresholdTemperature = value;
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} Set ThresholdTemperature: ${this.ThresholdTemperature},` +
      ` ThresholdTemperatureCached: ${this.accessory.context.ThresholdTemperature}`,
    );
    this.pushAirConditionerStatusChanges();
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    if (this.Active === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Active: ${this.Active}`);
    } else {
      this.accessory.context.Active = this.Active;
      this.coolerService?.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`);
    }
    if (this.RotationSpeed === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} RotationSpeed: ${this.RotationSpeed}`);
    } else {
      this.accessory.context.RotationSpeed = this.RotationSpeed;
      this.coolerService?.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.RotationSpeed);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic RotationSpeed: ${this.RotationSpeed}`);
    }
    if (this.CurrentTemperature === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
    } else {
      this.accessory.context.CurrentTemperature = this.CurrentTemperature;
      this.coolerService?.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.CurrentTemperature);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`);
    }
    if (this.meter) {
      if (this.CurrentRelativeHumidity === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
      } else {
        this.accessory.context.CurrentRelativeHumidity = this.CurrentRelativeHumidity;
        this.coolerService?.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
        this.debugLog(
          `${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`,
        );
      }
    }
    if (this.TargetHeaterCoolerState === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`);
    } else {
      this.accessory.context.TargetHeaterCoolerState = this.TargetHeaterCoolerState;
      this.coolerService?.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState, this.TargetHeaterCoolerState);
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName}` + ` updateCharacteristic TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`,
      );
    }
    if (this.CurrentHeaterCoolerState === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`);
    } else {
      this.accessory.context.CurrentHeaterCoolerState = this.CurrentHeaterCoolerState;
      this.coolerService?.updateCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState, this.CurrentHeaterCoolerState);
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName}` +
        ` updateCharacteristic CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`,
      );
    }
    if (this.ThresholdTemperature === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} ThresholdTemperature: ${this.ThresholdTemperature}`);
    } else {
      this.accessory.context.ThresholdTemperature = this.ThresholdTemperature;
      this.coolerService?.updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, this.ThresholdTemperature);
      this.coolerService?.updateCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature, this.ThresholdTemperature);
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName}` + ` updateCharacteristic ThresholdTemperature: ${this.ThresholdTemperature}`,
      );
    }
  }

  async disablePushOnChanges({ device }: { device: irdevice & irDevicesConfig }): Promise<void> {
    if (device.disablePushOn === undefined) {
      this.disablePushOn = false;
    } else {
      this.disablePushOn = device.disablePushOn;
    }
  }

  async disablePushOffChanges({ device }: { device: irdevice & irDevicesConfig }): Promise<void> {
    if (device.disablePushOff === undefined) {
      this.disablePushOff = false;
    } else {
      this.disablePushOff = device.disablePushOff;
    }
  }

  async disablePushDetailChanges({ device }: { device: irdevice & irDevicesConfig }): Promise<void> {
    if (device.disablePushDetail === undefined) {
      this.disablePushDetail = false;
    } else {
      this.disablePushDetail = device.disablePushDetail;
    }
  }

  async commandType(): Promise<string> {
    let commandType: string;
    if (this.device.customize) {
      commandType = 'customize';
    } else {
      commandType = 'command';
    }
    return commandType;
  }

  async commandOn(): Promise<string> {
    let command: string;
    if (this.device.customize && this.device.customOn) {
      command = this.device.customOn;
    } else {
      command = 'turnOn';
    }
    return command;
  }

  async commandOff(): Promise<string> {
    let command: string;
    if (this.device.customize && this.device.customOff) {
      command = this.device.customOff;
    } else {
      command = 'turnOff';
    }
    return command;
  }

  /**
   * Logs the status code and throws an error if the status code is invalid.
   *
   * @param APIstatusCode - The status code to be validated.
   * @returns {Promise<void>} - Resolves if the status code is valid, otherwise rejects with an error.
   * @throws {Error} If the provided status code is not valid.
   */
  async statusCode(statusCode:number ): Promise<void> {
    let statusMsg = `${this.device.remoteType}: ${this.accessory.displayName} ${StatusCodeDescription(statusCode)}`;

    if (statusCode === 100 || statusCode === 200) {
      this.debugLog(statusMsg);
    } else {
      if (statusCode === 171) {
        statusMsg =`${statusMsg}, Hub: ${this.device.hubDeviceId}`;
      }
      this.errorLog(statusMsg);
      return Promise.reject(new Error(`Invalid Status Code: ${statusCode}`));
    }
  }

  async apiError({ e }: { e: any }): Promise<void> {
    this.coolerService.updateCharacteristic(this.platform.Characteristic.Active, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature, e);
  }

  FirmwareRevision({ accessory, device }: { accessory: PlatformAccessory; device: irdevice & irDevicesConfig }): string {
    let FirmwareRevision: string;
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName}` + ` accessory.context.FirmwareRevision: ${accessory.context.FirmwareRevision}`,
    );
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} device.firmware: ${device.firmware}`);
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} this.platform.version: ${this.platform.version}`);
    if (accessory.context.FirmwareRevision) {
      FirmwareRevision = accessory.context.FirmwareRevision;
    } else if (device.firmware) {
      FirmwareRevision = device.firmware;
    } else {
      FirmwareRevision = this.platform.version;
    }
    return FirmwareRevision;
  }

  async context(): Promise<void> {
    if (this.Active === undefined) {
      this.Active = this.platform.Characteristic.Active.INACTIVE;
    } else if (this.Active) {
      this.Active;
    } else {
      this.Active = this.accessory.context.Active;
    }

    if (this.CurrentTemperature === undefined && this.accessory.context.CurrentTemperature === undefined) {
      this.CurrentTemperature = 24;
    } else {
      this.CurrentTemperature = this.CurrentTemperature || this.accessory.context.CurrentTemperature;
    }

    if (this.ThresholdTemperature === undefined && this.accessory.context.ThresholdTemperature === undefined) {
      this.ThresholdTemperature = 24;
    } else {
      this.ThresholdTemperature = this.ThresholdTemperature || this.accessory.context.ThresholdTemperature;
    }

    if (this.RotationSpeed === undefined && this.accessory.context.RotationSpeed === undefined) {
      this.RotationSpeed = 4;
    } else {
      this.RotationSpeed = this.RotationSpeed || this.accessory.context.RotationSpeed;
    }

    if (this.device.irair?.hide_automode) {
      this.hide_automode = this.device.irair?.hide_automode;
      this.accessory.context.hide_automode = this.hide_automode;
    } else {
      this.hide_automode = this.device.irair?.hide_automode;
      this.accessory.context.hide_automode = this.hide_automode;
    }

    if (this.meter) {
      if (this.CurrentRelativeHumidity === undefined && this.accessory.context.CurrentRelativeHumidity === undefined) {
        this.CurrentRelativeHumidity = 0;
      } else {
        this.CurrentRelativeHumidity = this.CurrentRelativeHumidity || this.accessory.context.CurrentRelativeHumidity;
      }
    }
  }

  async config({ device }: { device: irdevice & irDevicesConfig }): Promise<void> {
    let config = {};
    if (device.irair) {
      config = device.irair;
    }
    if (device.logging !== undefined) {
      config['logging'] = device.logging;
    }
    if (device.connectionType !== undefined) {
      config['connectionType'] = device.connectionType;
    }
    if (device.external !== undefined) {
      config['external'] = device.external;
    }
    if (device.customOn !== undefined) {
      config['customOn'] = device.customOn;
    }
    if (device.customOff !== undefined) {
      config['customOff'] = device.customOff;
    }
    if (device.customize !== undefined) {
      config['customize'] = device.customize;
    }
    if (device.disablePushOn !== undefined) {
      config['disablePushOn'] = device.disablePushOn;
    }
    if (device.disablePushOff !== undefined) {
      config['disablePushOff'] = device.disablePushOff;
    }
    if (device.disablePushDetail !== undefined) {
      config['disablePushDetail'] = device.disablePushDetail;
    }
    if (Object.entries(config).length !== 0) {
      this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  async logs({ device }: { device: irdevice & irDevicesConfig }): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
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

  debugWarnLog(...log: any[]): void {
    if (this.enablingDeviceLogging() && this.deviceLogging?.includes('debug')) {
      this.platform.log.warn('[DEBUG]', String(...log));
    }
  }

  errorLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.error(String(...log));
    }
  }

  debugErrorLog(...log: any[]): void {
    if (this.enablingDeviceLogging() && this.deviceLogging?.includes('debug')) {
      this.platform.log.error('[DEBUG]', String(...log));
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
