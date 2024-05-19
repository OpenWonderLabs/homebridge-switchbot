/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * airconditioners.ts: @switchbot/homebridge-switchbot.
 */
import { request } from 'undici';
import { Devices } from '../settings.js';
import { irdeviceBase } from './irdevice.js';

import type { SwitchBotPlatform } from '../platform.js';
import type { irDevicesConfig, irdevice } from '../settings.js';
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class AirConditioner extends irdeviceBase {
  // Services
  private HeaterCooler: {
    Service: Service;
    Active: CharacteristicValue;
    CurrentHeaterCoolerState: CharacteristicValue;
    TargetHeaterCoolerState: CharacteristicValue;
    CurrentTemperature: CharacteristicValue;
    ThresholdTemperature: CharacteristicValue;
    RotationSpeed: CharacteristicValue;
  };

  private HumiditySensor?: {
    Service: Service;
    CurrentRelativeHumidity: CharacteristicValue;
  };

  // Others
  state!: string;
  Busy: any;
  Timeout: any = null;
  CurrentMode!: number;
  ValidValues: number[];
  CurrentFanSpeed!: number;

  // Config
  hide_automode?: boolean;
  set_max_heat?: number;
  set_min_heat?: number;
  set_max_cool?: number;
  set_min_cool?: number;
  meter?: PlatformAccessory;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: irdevice & irDevicesConfig,
  ) {
    super(platform, accessory, device);

    // default placeholders
    this.getAirConditionerConfigSettings(accessory, device);

    // Initialize HeaterCooler property
    this.HeaterCooler = {
      Service: accessory.getService(this.hap.Service.Switch) as Service,
      Active: accessory.context.Active || this.hap.Characteristic.Active.INACTIVE,
      CurrentHeaterCoolerState: accessory.context.CurrentHeaterCoolerState || this.hap.Characteristic.CurrentHeaterCoolerState.IDLE,
      TargetHeaterCoolerState: accessory.context.TargetHeaterCoolerState || this.hap.Characteristic.TargetHeaterCoolerState.AUTO,
      CurrentTemperature: accessory.context.CurrentTemperature || 24,
      ThresholdTemperature: accessory.context.ThresholdTemperature || 24,
      RotationSpeed: accessory.context.RotationSpeed || 4,
    };

    // Initialize HumiditySensor property
    if (this.device.irair?.meterType && this.device.irair?.meterId) {
      const meterUuid = this.platform.api.hap.uuid.generate(`${this.device.irair.meterId}-${this.device.irair.meterType}`);
      this.meter = this.platform.accessories.find((accessory) => accessory.UUID === meterUuid);
      this.HumiditySensor = {
        Service: this.meter!.getService(this.hap.Service.HumiditySensor) as Service,
        CurrentRelativeHumidity: this.meter!.context.CurrentRelativeHumidity || 0,
      };
    }

    // get the Television service if it exists, otherwise create a new Television service
    // you can create multiple services for each accessory
    const HeaterCoolerService = `${accessory.displayName} ${device.remoteType}`;
    (this.HeaterCooler.Service = accessory.getService(this.hap.Service.HeaterCooler)
      || accessory.addService(this.hap.Service.HeaterCooler)), HeaterCoolerService;

    this.HeaterCooler.Service.setCharacteristic(this.hap.Characteristic.Name, accessory.displayName);

    // handle on / off events using the Active characteristic
    this.HeaterCooler.Service.getCharacteristic(this.hap.Characteristic.Active)
      .onSet(this.ActiveSet.bind(this));

    this.HeaterCooler.Service.getCharacteristic(this.hap.Characteristic.CurrentTemperature)
      .onGet(this.CurrentTemperatureGet.bind(this));

    this.ValidValues = this.hide_automode ? [1, 2] : [0, 1, 2];

    if (this.device.irair?.meterType && this.device.irair?.meterId) {
      const meterUuid = this.platform.api.hap.uuid.generate(`${this.device.irair.meterId}-${this.device.irair.meterType}`);
      this.meter = this.platform.accessories.find((accessory) => accessory.UUID === meterUuid);
    }

    if (this.meter) {
      this.HumiditySensor!.Service.getCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity)
        .onGet(this.CurrentRelativeHumidityGet.bind(this));
    }

    this.HeaterCooler.Service
      .getCharacteristic(this.hap.Characteristic.TargetHeaterCoolerState)
      .setProps({
        validValues: this.ValidValues,
      })
      .onGet(this.TargetHeaterCoolerStateGet.bind(this))
      .onSet(this.TargetHeaterCoolerStateSet.bind(this));

    this.HeaterCooler.Service.getCharacteristic(this.hap.Characteristic.CurrentHeaterCoolerState)
      .onGet(this.CurrentHeaterCoolerStateGet.bind(this));

    this.HeaterCooler.Service
      .getCharacteristic(this.hap.Characteristic.HeatingThresholdTemperature)
      .setProps({
        minValue: this.set_min_heat,
        maxValue: this.set_max_heat,
        minStep: 0.5,
      })
      .onGet(this.ThresholdTemperatureGet.bind(this))
      .onSet(this.ThresholdTemperatureSet.bind(this));

    this.HeaterCooler.Service
      .getCharacteristic(this.hap.Characteristic.CoolingThresholdTemperature)
      .setProps({
        minValue: this.set_min_cool,
        maxValue: this.set_max_cool,
        minStep: 0.5,
      })
      .onGet(this.ThresholdTemperatureGet.bind(this))
      .onSet(this.ThresholdTemperatureSet.bind(this));

    this.HeaterCooler.Service
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
      `${this.device.remoteType}: ${this.accessory.displayName} pushAirConditionerOnChanges Active: ${this.HeaterCooler.Active},` +
      ` disablePushOn: ${this.disablePushOn}`,
    );
    if (this.HeaterCooler.Active === this.hap.Characteristic.Active.ACTIVE && !this.disablePushOn) {
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
      `${this.device.remoteType}: ${this.accessory.displayName} pushAirConditionerOffChanges Active: ${this.HeaterCooler.Active},` +
      ` disablePushOff: ${this.disablePushOff}`,
    );
    if (this.HeaterCooler.Active === this.hap.Characteristic.Active.INACTIVE && !this.disablePushOff) {
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
      `${this.device.remoteType}: ${this.accessory.displayName} pushAirConditionerStatusChanges Active: ${this.HeaterCooler.Active},` +
      ` disablePushOff: ${this.disablePushOff},  disablePushOn: ${this.disablePushOn}`,
    );
    if (!this.Busy) {
      this.Busy = true;
      this.HeaterCooler.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.IDLE;
    }
    clearTimeout(this.Timeout);

    // Make a new Timeout set to go off in 1000ms (1 second)
    this.Timeout = setTimeout(this.pushAirConditionerDetailsChanges.bind(this), 1500);
  }

  async pushAirConditionerDetailsChanges(): Promise<void> {
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} pushAirConditionerDetailsChanges Active: ${this.HeaterCooler.Active},` +
      ` disablePushOff: ${this.disablePushOff},  disablePushOn: ${this.disablePushOn}`,
    );
    //await this.deviceContext();
    if (this.CurrentMode === undefined) {
      this.CurrentMode = 1;
    }
    if (this.CurrentFanSpeed === undefined) {
      this.CurrentFanSpeed = 1;
    }
    if (this.HeaterCooler.Active === this.hap.Characteristic.Active.ACTIVE) {
      this.state = 'on';
    } else {
      this.state = 'off';
    }
    if (this.CurrentMode === 1) {
      // Remove or make configurable?
      this.HeaterCooler.ThresholdTemperature = 25;
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} CurrentMode: ${this.CurrentMode},` +
        ` ThresholdTemperature: ${this.HeaterCooler.ThresholdTemperature}`,
      );
    }
    const parameter = `${this.HeaterCooler.ThresholdTemperature},${this.CurrentMode},${this.CurrentFanSpeed},${this.state}`;

    await this.UpdateCurrentHeaterCoolerState();
    const bodyChange = JSON.stringify({
      command: 'setAll',
      parameter: `${parameter}`,
      commandType: 'command',
    });

    await this.pushChanges(bodyChange);
  }

  private async UpdateCurrentHeaterCoolerState() {
    if (this.HeaterCooler.Active === this.hap.Characteristic.Active.ACTIVE) {

      if (this.HeaterCooler.Active === undefined) {
        this.HeaterCooler.Active = this.hap.Characteristic.Active.INACTIVE;
      } else if (this.HeaterCooler.Active) {
        this.HeaterCooler.Active;
      } else {
        this.HeaterCooler.Active = this.accessory.context.Active;
      }

      if (this.HeaterCooler.CurrentTemperature === undefined && this.accessory.context.CurrentTemperature === undefined) {
        this.HeaterCooler.CurrentTemperature = 24;
      } else {
        this.HeaterCooler.CurrentTemperature = this.HeaterCooler.CurrentTemperature || this.accessory.context.CurrentTemperature;
      }

      if (this.HeaterCooler.ThresholdTemperature === undefined && this.accessory.context.ThresholdTemperature === undefined) {
        this.HeaterCooler.ThresholdTemperature = 24;
      } else {
        this.HeaterCooler.ThresholdTemperature = this.HeaterCooler.ThresholdTemperature || this.accessory.context.ThresholdTemperature;
      }

      if (this.HeaterCooler.RotationSpeed === undefined && this.accessory.context.RotationSpeed === undefined) {
        this.HeaterCooler.RotationSpeed = 4;
      } else {
        this.HeaterCooler.RotationSpeed = this.HeaterCooler.RotationSpeed || this.accessory.context.RotationSpeed;
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
        if (this.HumiditySensor!.CurrentRelativeHumidity === undefined && this.accessory.context.CurrentRelativeHumidity === undefined) {
          this.HumiditySensor!.CurrentRelativeHumidity = 0;
        } else {
          this.HumiditySensor!.CurrentRelativeHumidity = this.HumiditySensor!.CurrentRelativeHumidity
            || this.accessory.context.CurrentRelativeHumidity;
        }
      }
      if (this.HeaterCooler.ThresholdTemperature < this.HeaterCooler.CurrentTemperature &&
        this.HeaterCooler.TargetHeaterCoolerState !== this.hap.Characteristic.TargetHeaterCoolerState.HEAT) {
        this.HeaterCooler.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.COOLING;
      } else if (this.HeaterCooler.ThresholdTemperature > this.HeaterCooler.CurrentTemperature &&
        this.HeaterCooler.TargetHeaterCoolerState !== this.hap.Characteristic.TargetHeaterCoolerState.COOL) {
        this.HeaterCooler.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.HEATING;
      } else {
        this.HeaterCooler.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.IDLE;
      }
    } else {
      this.HeaterCooler.CurrentHeaterCoolerState = this.hap.Characteristic.CurrentHeaterCoolerState.INACTIVE;
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
          this.debugSuccessLog(`${this.device.remoteType}: ${this.accessory.displayName} `
            + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
          this.successLog(`${this.device.remoteType}: ${this.accessory.displayName}`
            + ` request to SwitchBot API, body: ${JSON.stringify(bodyChange)} sent successfully`);
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

    this.HeaterCooler.CurrentTemperature = this.accessory.context.CurrentTemperature || 24;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Get CurrentTemperature: ${this.HeaterCooler.CurrentTemperature}`);
    return this.HeaterCooler.CurrentTemperature;
  }

  async CurrentRelativeHumidityGet(): Promise<CharacteristicValue> {
    if (this.meter?.context?.CurrentRelativeHumidity) {
      this.accessory.context.CurrentRelativeHumidity = this.meter.context.CurrentRelativeHumidity;
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} `
        + `Using CurrentRelativeHumidity from ${this.meter.context.deviceType} (${this.meter.context.deviceID})`,
      );
    }

    this.HumiditySensor!.CurrentRelativeHumidity = this.accessory.context.CurrentRelativeHumidity || 0;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Get`
      + ` CurrentRelativeHumidity: ${this.HumiditySensor!.CurrentRelativeHumidity}`);
    return this.HumiditySensor!.CurrentRelativeHumidity as CharacteristicValue;
  }

  async RotationSpeedGet(): Promise<number> {
    if (!this.CurrentFanSpeed || this.CurrentFanSpeed === 1) {
      this.HeaterCooler.RotationSpeed = 4;
    } else {
      this.HeaterCooler.RotationSpeed = this.CurrentFanSpeed - 1;
    }
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Get RotationSpeed: ${this.HeaterCooler.RotationSpeed}`);
    return this.HeaterCooler.RotationSpeed;
  }

  async RotationSpeedSet(value: CharacteristicValue): Promise<void> {
    if (value === 4) {
      this.CurrentFanSpeed = 1;
    } else {
      this.CurrentFanSpeed = Number(value) + 1;
    }
    this.HeaterCooler.RotationSpeed = value;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName}` +
      `Set RotationSpeed: ${this.HeaterCooler.RotationSpeed}, CurrentFanSpeed: ${this.CurrentFanSpeed}`);
    this.pushAirConditionerStatusChanges();
  }

  async ActiveSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set Active: ${value}`);

    this.HeaterCooler.Active = value;
    if (this.HeaterCooler.Active === this.hap.Characteristic.Active.ACTIVE) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushAirConditionerOnChanges, Active: ${this.HeaterCooler.Active}`);
      if (this.disablePushOn) {
        this.pushAirConditionerStatusChanges();
      } else {
        this.pushAirConditionerOnChanges();
      }
    } else {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushAirConditionerOffChanges, Active: ${this.HeaterCooler.Active}`);
      this.pushAirConditionerOffChanges();
    }
  }

  async TargetHeaterCoolerStateGet(): Promise<CharacteristicValue> {
    const targetState = this.HeaterCooler.TargetHeaterCoolerState || this.accessory.context.TargetHeaterCoolerState;
    this.HeaterCooler.TargetHeaterCoolerState = this.ValidValues.includes(targetState) ? targetState : this.ValidValues[0];
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Get (${this.getTargetHeaterCoolerStateName()}) TargetHeaterCoolerState:`
      + ` ${this.HeaterCooler.TargetHeaterCoolerState}, ValidValues: ${this.ValidValues},  hide_automode: ${this.hide_automode}`);
    return this.HeaterCooler.TargetHeaterCoolerState;
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
        `${this.device.remoteType}: ${this.accessory.displayName} Set TargetHeaterCoolerState: ${this.HeaterCooler.TargetHeaterCoolerState},` +
        ` hide_automode: ${this.hide_automode} `,
      );
    }
    this.pushAirConditionerStatusChanges();
  }

  async TargetHeaterCoolerStateAUTO(): Promise<void> {
    this.HeaterCooler.TargetHeaterCoolerState = this.hap.Characteristic.TargetHeaterCoolerState.AUTO;
    this.CurrentMode = 1;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set (AUTO)`
      + ` TargetHeaterCoolerState: ${this.HeaterCooler.TargetHeaterCoolerState}`);
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Switchbot CurrentMode: ${this.CurrentMode}`);
  }

  async TargetHeaterCoolerStateCOOL(): Promise<void> {
    this.HeaterCooler.TargetHeaterCoolerState = this.hap.Characteristic.TargetHeaterCoolerState.COOL;
    this.CurrentMode = 2;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set (COOL)`
      + ` TargetHeaterCoolerState: ${this.HeaterCooler.TargetHeaterCoolerState}`);
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Switchbot CurrentMode: ${this.CurrentMode}`);
  }

  async TargetHeaterCoolerStateHEAT(): Promise<void> {
    this.HeaterCooler.TargetHeaterCoolerState = this.hap.Characteristic.TargetHeaterCoolerState.HEAT;
    this.CurrentMode = 5;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set (HEAT)`
      + ` TargetHeaterCoolerState: ${this.HeaterCooler.TargetHeaterCoolerState}`);
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Switchbot CurrentMode: ${this.CurrentMode}`);
  }

  async CurrentHeaterCoolerStateGet(): Promise<CharacteristicValue> {
    await this.UpdateCurrentHeaterCoolerState();
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName}` +
      ` Get (${this.getTargetHeaterCoolerStateName()}) CurrentHeaterCoolerState: ${this.HeaterCooler.CurrentHeaterCoolerState}`,
    );

    return this.HeaterCooler.CurrentHeaterCoolerState;
  }


  private getTargetHeaterCoolerStateName(): string {
    switch (this.HeaterCooler.TargetHeaterCoolerState) {
      case this.hap.Characteristic.TargetHeaterCoolerState.AUTO:
        return 'AUTO';
      case this.hap.Characteristic.TargetHeaterCoolerState.HEAT:
        return 'HEAT';
      case this.hap.Characteristic.TargetHeaterCoolerState.COOL:
        return 'COOL';
      default:
        return this.HeaterCooler.TargetHeaterCoolerState.toString();
    }
  }

  async ThresholdTemperatureGet(): Promise<CharacteristicValue> {

    if (this.HeaterCooler.Active === undefined) {
      this.HeaterCooler.Active = this.hap.Characteristic.Active.INACTIVE;
    } else if (this.HeaterCooler.Active) {
      this.HeaterCooler.Active;
    } else {
      this.HeaterCooler.Active = this.accessory.context.Active;
    }

    if (this.HeaterCooler.CurrentTemperature === undefined && this.accessory.context.CurrentTemperature === undefined) {
      this.HeaterCooler.CurrentTemperature = 24;
    } else {
      this.HeaterCooler.CurrentTemperature = this.HeaterCooler.CurrentTemperature || this.accessory.context.CurrentTemperature;
    }

    if (this.HeaterCooler.ThresholdTemperature === undefined && this.accessory.context.ThresholdTemperature === undefined) {
      this.HeaterCooler.ThresholdTemperature = 24;
    } else {
      this.HeaterCooler.ThresholdTemperature = this.HeaterCooler.ThresholdTemperature || this.accessory.context.ThresholdTemperature;
    }

    if (this.HeaterCooler.RotationSpeed === undefined && this.accessory.context.RotationSpeed === undefined) {
      this.HeaterCooler.RotationSpeed = 4;
    } else {
      this.HeaterCooler.RotationSpeed = this.HeaterCooler.RotationSpeed || this.accessory.context.RotationSpeed;
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
      if (this.HumiditySensor!.CurrentRelativeHumidity === undefined && this.accessory.context.CurrentRelativeHumidity === undefined) {
        this.HumiditySensor!.CurrentRelativeHumidity = 0;
      } else {
        this.HumiditySensor!.CurrentRelativeHumidity = this.HumiditySensor!.CurrentRelativeHumidity || this.accessory.context.CurrentRelativeHumidity;
      }
    }
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Get ThresholdTemperature: ${this.HeaterCooler.ThresholdTemperature}`);
    return this.HeaterCooler.ThresholdTemperature;
  }

  async ThresholdTemperatureSet(value: CharacteristicValue): Promise<void> {
    this.HeaterCooler.ThresholdTemperature = value;
    this.debugLog(
      `${this.device.remoteType}: ${this.accessory.displayName} Set ThresholdTemperature: ${this.HeaterCooler.ThresholdTemperature},` +
      ` ThresholdTemperatureCached: ${this.accessory.context.ThresholdTemperature}`,
    );
    this.pushAirConditionerStatusChanges();
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    // Active
    if (this.HeaterCooler.Active === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Active: ${this.HeaterCooler.Active}`);
    } else {
      this.accessory.context.Active = this.HeaterCooler.Active;
      this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.Active, this.HeaterCooler.Active);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.HeaterCooler.Active}`);
    }
    // RotationSpeed
    if (this.HeaterCooler.RotationSpeed === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} RotationSpeed: ${this.HeaterCooler.RotationSpeed}`);
    } else {
      this.accessory.context.RotationSpeed = this.HeaterCooler.RotationSpeed;
      this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.RotationSpeed, this.HeaterCooler.RotationSpeed);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
        + ` RotationSpeed: ${this.HeaterCooler.RotationSpeed}`);
    }
    // CurrentTemperature
    if (this.HeaterCooler.CurrentTemperature === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} CurrentTemperature: ${this.HeaterCooler.CurrentTemperature}`);
    } else {
      this.accessory.context.CurrentTemperature = this.HeaterCooler.CurrentTemperature;
      this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, this.HeaterCooler.CurrentTemperature);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
        + ` CurrentTemperature: ${this.HeaterCooler.CurrentTemperature}`);
    }
    // CurrentRelativeHumidity
    if (this.meter) {
      if (this.HumiditySensor!.CurrentRelativeHumidity === undefined) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName}`
          + ` CurrentRelativeHumidity: ${this.HumiditySensor!.CurrentRelativeHumidity}`);
      } else {
        this.accessory.context.CurrentRelativeHumidity = this.HumiditySensor!.CurrentRelativeHumidity;
        this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity,
          this.HumiditySensor!.CurrentRelativeHumidity);
        this.debugLog(
          `${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
          + ` CurrentRelativeHumidity: ${this.HumiditySensor!.CurrentRelativeHumidity}`,
        );
      }
    }
    // TargetHeaterCoolerState
    if (this.HeaterCooler.TargetHeaterCoolerState === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} TargetHeaterCoolerState: ${this.HeaterCooler.TargetHeaterCoolerState}`);
    } else {
      this.accessory.context.TargetHeaterCoolerState = this.HeaterCooler.TargetHeaterCoolerState;
      this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.TargetHeaterCoolerState, this.HeaterCooler.TargetHeaterCoolerState);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
        + ` TargetHeaterCoolerState: ${this.HeaterCooler.TargetHeaterCoolerState}`);
    }
    // CurrentHeaterCoolerState
    if (this.HeaterCooler.CurrentHeaterCoolerState === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName}`
        + ` CurrentHeaterCoolerState: ${this.HeaterCooler.CurrentHeaterCoolerState}`);
    } else {
      this.accessory.context.CurrentHeaterCoolerState = this.HeaterCooler.CurrentHeaterCoolerState;
      this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.CurrentHeaterCoolerState, this.HeaterCooler.CurrentHeaterCoolerState);
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName}` +
        ` updateCharacteristic CurrentHeaterCoolerState: ${this.HeaterCooler.CurrentHeaterCoolerState}`,
      );
    }
    // ThresholdTemperature
    if (this.HeaterCooler.ThresholdTemperature === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} ThresholdTemperature: ${this.HeaterCooler.ThresholdTemperature}`);
    } else {
      this.accessory.context.ThresholdTemperature = this.HeaterCooler.ThresholdTemperature;
      this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.HeatingThresholdTemperature, this.HeaterCooler.ThresholdTemperature);
      this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.CoolingThresholdTemperature, this.HeaterCooler.ThresholdTemperature);
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic`
        + ` ThresholdTemperature: ${this.HeaterCooler.ThresholdTemperature}`);
    }
  }

  async apiError({ e }: { e: any }): Promise<void> {
    this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.Active, e);
    this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.RotationSpeed, e);
    this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, e);
    this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity, e);
    this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.TargetHeaterCoolerState, e);
    this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.CurrentHeaterCoolerState, e);
    this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.HeatingThresholdTemperature, e);
    this.HeaterCooler.Service.updateCharacteristic(this.hap.Characteristic.CoolingThresholdTemperature, e);
  }

  async getAirConditionerConfigSettings(accessory: PlatformAccessory, device: irdevice & irDevicesConfig): Promise<void> {
    if (this.device.irair?.hide_automode) {
      this.hide_automode = device.irair?.hide_automode;
      accessory.context.hide_automode = this.hide_automode;
    } else {
      this.hide_automode = device.irair?.hide_automode;
      accessory.context.hide_automode = this.hide_automode;
    }

    if (this.device.irair?.set_max_heat) {
      this.set_max_heat = device.irair?.set_max_heat;
      accessory.context.set_max_heat = this.set_max_heat;
    } else {
      this.set_max_heat = 35;
      accessory.context.set_max_heat = this.set_max_heat;
    }
    if (this.device.irair?.set_min_heat) {
      this.set_min_heat = device.irair?.set_min_heat;
      accessory.context.set_min_heat = this.set_min_heat;
    } else {
      this.set_min_heat = 0;
      accessory.context.set_min_heat = this.set_min_heat;
    }

    if (this.device.irair?.set_max_cool) {
      this.set_max_cool = device.irair?.set_max_cool;
      accessory.context.set_max_cool = this.set_max_cool;
    } else {
      this.set_max_cool = 35;
      accessory.context.set_max_cool = this.set_max_cool;
    }
    if (this.device.irair?.set_min_cool) {
      this.set_min_cool = device.irair?.set_min_cool;
      accessory.context.set_min_cool = this.set_min_cool;
    } else {
      this.set_min_cool = 0;
      accessory.context.set_min_cool = this.set_min_cool;
    }
  }
}
