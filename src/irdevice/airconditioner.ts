import { CharacteristicValue, PlatformAccessory, Service, API, Logging, HAP } from 'homebridge';
import { request } from 'undici';
import { SwitchBotPlatform } from '../platform.js';
import { Devices, irDevicesConfig, irdevice, SwitchBotPlatformConfig } from '../settings.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class AirConditioner {
  public readonly api: API;
  public readonly log: Logging;
  public readonly config!: SwitchBotPlatformConfig;
  protected readonly hap: HAP;
  // Services
  coolerService!: Service;

  // Characteristic Values
  Active!: CharacteristicValue;
  RotationSpeed!: CharacteristicValue;
  FirmwareRevision!: CharacteristicValue;
  CurrentTemperature!: CharacteristicValue;
  ThresholdTemperature!: CharacteristicValue;
  CurrentRelativeHumidity?: CharacteristicValue;
  TargetHeaterCoolerState!: CharacteristicValue;
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
  hide_automode?: boolean;
  set_max_heat?: number;
  set_min_heat?: number;
  set_max_cool?: number;
  set_min_cool?: number;
  disablePushOn?: boolean;
  disablePushOff?: boolean;
  meter?: PlatformAccessory;
  disablePushDetail?: boolean;

  private readonly valid12 = [1, 2];
  private readonly valid012 = [0, 1, 2];

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: irdevice & irDevicesConfig,
  ) {
    this.api = this.platform.api;
    this.log = this.platform.log;
    this.config = this.platform.config;
    this.hap = this.api.hap;
    // default placeholders
    this.deviceLogs(device);
    this.deviceContext();
    this.disablePushOnChanges(device);
    this.disablePushOffChanges(device);
    this.disablePushDetailChanges(device);
    this.deviceConfig(device);

    // set accessory information
    accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.hap.Characteristic.Model, device.remoteType)
      .setCharacteristic(this.hap.Characteristic.SerialNumber, device.deviceId)
      .setCharacteristic(this.hap.Characteristic.FirmwareRevision, accessory.context.FirmwareRevision);

    // get the Television service if it exists, otherwise create a new Television service
    // you can create multiple services for each accessory
    const coolerService = `${accessory.displayName} ${device.remoteType}`;
    (this.coolerService = accessory.getService(this.hap.Service.HeaterCooler)
      || accessory.addService(this.hap.Service.HeaterCooler)), coolerService;

    this.coolerService.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);
    if (!this.coolerService.testCharacteristic(this.hap.Characteristic.ConfiguredName)) {
      this.coolerService.addCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName);
    }

    // handle on / off events using the Active characteristic
    this.coolerService.getCharacteristic(this.hap.Characteristic.Active).onSet(this.ActiveSet.bind(this));

    this.coolerService.getCharacteristic(this.hap.Characteristic.CurrentTemperature).onGet(this.CurrentTemperatureGet.bind(this));

    this.ValidValues = this.hide_automode ? [1, 2] : [0, 1, 2];

    if (this.device.irair?.meterType && this.device.irair?.meterId) {
      const meterUuid = this.platform.api.hap.uuid.generate(`${this.device.irair.meterId}-${this.device.irair.meterType}`);
      this.meter = this.platform.accessories.find((accessory) => accessory.UUID === meterUuid);
    }

    if (this.meter) {
      this.coolerService.getCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity).onGet(this.CurrentRelativeHumidityGet.bind(this));
    }

    this.coolerService
      .getCharacteristic(this.hap.Characteristic.TargetHeaterCoolerState)
      .setProps({
        validValues: this.ValidValues,
      })
      .onGet(this.TargetHeaterCoolerStateGet.bind(this))
      .onSet(this.TargetHeaterCoolerStateSet.bind(this));

    this.coolerService.getCharacteristic(this.hap.Characteristic.CurrentHeaterCoolerState).onGet(this.CurrentHeaterCoolerStateGet.bind(this));

    this.coolerService
      .getCharacteristic(this.hap.Characteristic.HeatingThresholdTemperature)
      .setProps({
        minValue: this.set_min_heat,
        maxValue: this.set_max_heat,
        minStep: 0.5,
      })
      .onGet(this.ThresholdTemperatureGet.bind(this))
      .onSet(this.ThresholdTemperatureSet.bind(this));

    this.coolerService
      .getCharacteristic(this.hap.Characteristic.CoolingThresholdTemperature)
      .setProps({
        minValue: this.set_min_cool,
        maxValue: this.set_max_cool,
        minStep: 0.5,
      })
      .onGet(this.ThresholdTemperatureGet.bind(this))
      .onSet(this.ThresholdTemperatureSet.bind(this));

    this.coolerService
      .getCharacteristic(this.hap.Characteristic.RotationSpeed)
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
    if (this.Active === this.hap.Characteristic.Active.ACTIVE && !this.disablePushOn) {
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
    if (this.Active === this.hap.Characteristic.Active.INACTIVE && !this.disablePushOff) {
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
      this.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.IDLE;
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
    //await this.deviceContext();
    if (this.CurrentMode === undefined) {
      this.CurrentMode = 1;
    }
    if (this.CurrentFanSpeed === undefined) {
      this.CurrentFanSpeed = 1;
    }
    if (this.Active === this.hap.Characteristic.Active.ACTIVE) {
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
    if (this.Active === this.hap.Characteristic.Active.ACTIVE) {
      await this.deviceContext();
      if (this.ThresholdTemperature < this.CurrentTemperature &&
        this.TargetHeaterCoolerState !== this.hap.Characteristic.TargetHeaterCoolerState.HEAT) {
        this.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.COOLING;
      } else if (this.ThresholdTemperature > this.CurrentTemperature &&
        this.TargetHeaterCoolerState !== this.hap.Characteristic.TargetHeaterCoolerState.COOL) {
        this.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.HEATING;
      } else {
        this.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.IDLE;
      }
    } else {
      this.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }
  }

  async pushChanges(bodyChange: any): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushChanges`);
    if (this.device.connectionType === 'OpenAPI' && !this.disablePushDetail) {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
        const deviceStatus: any = await body.json();
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          this.debugErrorLog(`${this.device.remoteType}: ${this.accessory.displayName} `
            + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
          this.updateHomeKitCharacteristics();
        } else {
          this.statusCode(statusCode);
          this.statusCode(deviceStatus.statusCode);
        }
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
    if (this.Active === this.hap.Characteristic.Active.ACTIVE) {
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
    if (!this.hide_automode && value === this.hap.Characteristic.TargetHeaterCoolerState.AUTO) {
      this.TargetHeaterCoolerStateAUTO();
    } else if (value === this.hap.Characteristic.TargetHeaterCoolerState.HEAT) {
      this.TargetHeaterCoolerStateHEAT();
    } else if (value === this.hap.Characteristic.TargetHeaterCoolerState.COOL) {
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
    this.TargetHeaterCoolerState = this.hap.Characteristic.TargetHeaterCoolerState.AUTO;
    this.CurrentMode = 1;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set (AUTO) TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`);
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Switchbot CurrentMode: ${this.CurrentMode}`);
  }

  async TargetHeaterCoolerStateCOOL(): Promise<void> {
    this.TargetHeaterCoolerState = this.hap.Characteristic.TargetHeaterCoolerState.COOL;
    this.CurrentMode = 2;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set (COOL) TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`);
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Switchbot CurrentMode: ${this.CurrentMode}`);
  }

  async TargetHeaterCoolerStateHEAT(): Promise<void> {
    this.TargetHeaterCoolerState = this.hap.Characteristic.TargetHeaterCoolerState.HEAT;
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
      case this.hap.Characteristic.TargetHeaterCoolerState.AUTO:
        return 'AUTO';
      case this.hap.Characteristic.TargetHeaterCoolerState.HEAT:
        return 'HEAT';
      case this.hap.Characteristic.TargetHeaterCoolerState.COOL:
        return 'COOL';
      default:
        return this.TargetHeaterCoolerState.toString();
    }
  }

  async ThresholdTemperatureGet(): Promise<CharacteristicValue> {
    await this.deviceContext();
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
    // Active
    if (this.Active === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Active: ${this.Active}`);
    } else {
      this.accessory.context.Active = this.Active;
      this.coolerService?.updateCharacteristic(this.hap.Characteristic.Active, this.Active);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`);
    }
    // RotationSpeed
    if (this.RotationSpeed === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} RotationSpeed: ${this.RotationSpeed}`);
    } else {
      this.accessory.context.RotationSpeed = this.RotationSpeed;
      this.coolerService?.updateCharacteristic(this.hap.Characteristic.RotationSpeed, this.RotationSpeed);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic RotationSpeed: ${this.RotationSpeed}`);
    }
    // CurrentTemperature
    if (this.CurrentTemperature === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} CurrentTemperature: ${this.CurrentTemperature}`);
    } else {
      this.accessory.context.CurrentTemperature = this.CurrentTemperature;
      this.coolerService?.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, this.CurrentTemperature);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic CurrentTemperature: ${this.CurrentTemperature}`);
    }
    // CurrentRelativeHumidity
    if (this.meter) {
      if (this.CurrentRelativeHumidity === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`);
      } else {
        this.accessory.context.CurrentRelativeHumidity = this.CurrentRelativeHumidity;
        this.coolerService?.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity, this.CurrentRelativeHumidity);
        this.debugLog(
          `${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic CurrentRelativeHumidity: ${this.CurrentRelativeHumidity}`,
        );
      }
    }
    // TargetHeaterCoolerState
    if (this.TargetHeaterCoolerState === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`);
    } else {
      this.accessory.context.TargetHeaterCoolerState = this.TargetHeaterCoolerState;
      this.coolerService?.updateCharacteristic(this.hap.Characteristic.TargetHeaterCoolerState, this.TargetHeaterCoolerState);
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName}` + ` updateCharacteristic TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`,
      );
    }
    // CurrentHeaterCoolerState
    if (this.CurrentHeaterCoolerState === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`);
    } else {
      this.accessory.context.CurrentHeaterCoolerState = this.CurrentHeaterCoolerState;
      this.coolerService?.updateCharacteristic(this.hap.Characteristic.CurrentHeaterCoolerState, this.CurrentHeaterCoolerState);
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName}` +
        ` updateCharacteristic CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`,
      );
    }
    // ThresholdTemperature
    if (this.ThresholdTemperature === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} ThresholdTemperature: ${this.ThresholdTemperature}`);
    } else {
      this.accessory.context.ThresholdTemperature = this.ThresholdTemperature;
      this.coolerService?.updateCharacteristic(this.hap.Characteristic.HeatingThresholdTemperature, this.ThresholdTemperature);
      this.coolerService?.updateCharacteristic(this.hap.Characteristic.CoolingThresholdTemperature, this.ThresholdTemperature);
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName}` + ` updateCharacteristic ThresholdTemperature: ${this.ThresholdTemperature}`,
      );
    }
  }

  async disablePushOnChanges(device: irdevice & irDevicesConfig): Promise<void> {
    if (device.disablePushOn === undefined) {
      this.disablePushOn = false;
    } else {
      this.disablePushOn = device.disablePushOn;
    }
  }

  async disablePushOffChanges(device: irdevice & irDevicesConfig): Promise<void> {
    if (device.disablePushOff === undefined) {
      this.disablePushOff = false;
    } else {
      this.disablePushOff = device.disablePushOff;
    }
  }

  async disablePushDetailChanges(device: irdevice & irDevicesConfig): Promise<void> {
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

  async statusCode(statusCode: number): Promise<void> {
    switch (statusCode) {
      case 151:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Command not supported by this deviceType, statusCode: ${statusCode}`);
        break;
      case 152:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Device not found, statusCode: ${statusCode}`);
        break;
      case 160:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Command is not supported, statusCode: ${statusCode}`);
        break;
      case 161:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Device is offline, statusCode: ${statusCode}`);
        break;
      case 171:
        this.errorLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Hub Device is offline, statusCode: ${statusCode}. ` +
          `Hub: ${this.device.hubDeviceId}`,
        );
        break;
      case 190:
        this.errorLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
          ` Or command format is invalid, statusCode: ${statusCode}`,
        );
        break;
      case 100:
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Command successfully sent, statusCode: ${statusCode}`);
        break;
      case 200:
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Request successful, statusCode: ${statusCode}`);
        break;
      case 400:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Bad Request, The client has issued an invalid request. `
              + `This is commonly used to specify validation errors in a request payload, statusCode: ${statusCode}`);
        break;
      case 401:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Unauthorized,	Authorization for the API is required, `
              + `but the request has not been authenticated, statusCode: ${statusCode}`);
        break;
      case 403:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Forbidden,	The request has been authenticated but does not `
              + `have appropriate permissions, or a requested resource is not found, statusCode: ${statusCode}`);
        break;
      case 404:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Not Found,	Specifies the requested path does not exist, `
          + `statusCode: ${statusCode}`);
        break;
      case 406:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Not Acceptable,	The client has requested a MIME type via `
              + `the Accept header for a value not supported by the server, statusCode: ${statusCode}`);
        break;
      case 415:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Unsupported Media Type,	The client has defined a contentType `
              + `header that is not supported by the server, statusCode: ${statusCode}`);
        break;
      case 422:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Unprocessable Entity,	The client has made a valid request, but `
              + `the server cannot process it. This is often used for APIs for which certain limits have been exceeded, statusCode: ${statusCode}`);
        break;
      case 429:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Too Many Requests,	The client has exceeded the number of `
              + `requests allowed for a given time window, statusCode: ${statusCode}`);
        break;
      case 500:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Internal Server Error,	An unexpected error on the SmartThings `
              + `servers has occurred. These errors should be rare, statusCode: ${statusCode}`);
        break;
      default:
        this.infoLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Unknown statusCode: ` +
          `${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`,
        );
    }
  }

  async apiError({ e }: { e: any }): Promise<void> {
    this.coolerService.updateCharacteristic(this.hap.Characteristic.Active, e);
    this.coolerService.updateCharacteristic(this.hap.Characteristic.RotationSpeed, e);
    this.coolerService.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, e);
    this.coolerService.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity, e);
    this.coolerService.updateCharacteristic(this.hap.Characteristic.TargetHeaterCoolerState, e);
    this.coolerService.updateCharacteristic(this.hap.Characteristic.CurrentHeaterCoolerState, e);
    this.coolerService.updateCharacteristic(this.hap.Characteristic.HeatingThresholdTemperature, e);
    this.coolerService.updateCharacteristic(this.hap.Characteristic.CoolingThresholdTemperature, e);
  }

  async deviceContext(): Promise<void> {
    if (this.Active === undefined) {
      this.Active = this.hap.Characteristic.Active.INACTIVE;
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

    if (this.device.irair?.set_max_heat) {
      this.set_max_heat = this.device.irair?.set_max_heat;
      this.accessory.context.set_max_heat = this.set_max_heat;
    } else {
      this.set_max_heat = 35;
      this.accessory.context.set_max_heat = this.set_max_heat;
    }
    if (this.device.irair?.set_min_heat) {
      this.set_min_heat = this.device.irair?.set_min_heat;
      this.accessory.context.set_min_heat = this.set_min_heat;
    } else {
      this.set_min_heat = 0;
      this.accessory.context.set_min_heat = this.set_min_heat;
    }

    if (this.device.irair?.set_max_cool) {
      this.set_max_cool = this.device.irair?.set_max_cool;
      this.accessory.context.set_max_cool = this.set_max_cool;
    } else {
      this.set_max_cool = 35;
      this.accessory.context.set_max_cool = this.set_max_cool;
    }
    if (this.device.irair?.set_min_cool) {
      this.set_min_cool = this.device.irair?.set_min_cool;
      this.accessory.context.set_min_cool = this.set_min_cool;
    } else {
      this.set_min_cool = 0;
      this.accessory.context.set_min_cool = this.set_min_cool;
    }

    if (this.meter) {
      if (this.CurrentRelativeHumidity === undefined && this.accessory.context.CurrentRelativeHumidity === undefined) {
        this.CurrentRelativeHumidity = 0;
      } else {
        this.CurrentRelativeHumidity = this.CurrentRelativeHumidity || this.accessory.context.CurrentRelativeHumidity;
      }
    }
    if (this.FirmwareRevision === undefined) {
      this.FirmwareRevision = this.platform.version;
      this.accessory.context.FirmwareRevision = this.FirmwareRevision;
    }
  }

  async deviceConfig(device: irdevice & irDevicesConfig): Promise<void> {
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

  async deviceLogs(device: irdevice & irDevicesConfig): Promise<void> {
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
