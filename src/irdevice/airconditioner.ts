import https from 'https';
import crypto from 'crypto';
import { IncomingMessage } from 'http';
import superStringify from 'super-stringify';
import { SwitchBotPlatform } from '../platform';
import { irDevicesConfig, irdevice, HostDomain, DevicePath, body } from '../settings';
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
  RotationSpeed!: CharacteristicValue;
  CurrentTemperature!: CharacteristicValue;
  TargetHeaterCoolerState!: CharacteristicValue;
  CurrentHeaterCoolerState!: CharacteristicValue;
  HeatingThresholdTemperature!: CharacteristicValue;
  CoolingThresholdTemperature!: CharacteristicValue;

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
  deviceLogging!: string;
  hide_automode?: boolean;

  private readonly valid12 = [1, 2];
  private readonly valid012 = [0, 1, 2];

  constructor(private readonly platform: SwitchBotPlatform, private accessory: PlatformAccessory, public device: irdevice & irDevicesConfig) {
    // default placeholders
    this.logs({ device });
    this.config({ device });
    this.context();
    this.disablePushOnChanges({ device });
    this.disablePushOffChanges({ device });

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
        `${this.device.remoteType}: ${this.accessory.displayName} ValidValues: ${superStringify(this.ValidValues)},` +
          ` hide_automode: ${this.hide_automode}, TargetHeaterCoolerState: ${this.TargetHeaterCoolerState}`,
      );
    } else {
      this.TargetHeaterCoolerState = 0 || 1 || 2;
      this.ValidValues = [0, 1, 2];
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} ValidValues: ${superStringify(this.ValidValues)},` +
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
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushAirConditionerOnChanges Active: ${this.Active},`
    + ` disablePushOn: ${this.disablePushOn}`);
    if (this.Active === this.platform.Characteristic.Active.ACTIVE && !this.disablePushOn) {
      const commandType: string = await this.commandType();
      const command: string = await this.commandOn();
      const body = superStringify({
        'command': command,
        'parameter': 'default',
        'commandType': commandType,
      });
      await this.pushChanges(body);
    }
  }

  async pushAirConditionerOffChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushAirConditionerOffChanges Active: ${this.Active},`
    + ` disablePushOff: ${this.disablePushOff}`);
    if (this.Active === this.platform.Characteristic.Active.INACTIVE && !this.disablePushOff) {
      const commandType: string = await this.commandType();
      const command: string = await this.commandOff();
      const body = superStringify({
        'command': command,
        'parameter': 'default',
        'commandType': commandType,
      });
      await this.pushChanges(body);
    }
  }

  async pushAirConditionerStatusChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushAirConditionerStatusChanges Active: ${this.Active},`
    + ` disablePushOff: ${this.disablePushOff},  disablePushOn: ${this.disablePushOn}`);
    if (!this.Busy) {
      this.Busy = true;
      this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
    }
    clearTimeout(this.Timeout);

    // Make a new Timeout set to go off in 1000ms (1 second)
    this.Timeout = setTimeout(this.pushAirConditionerDetailsChanges.bind(this), 1500);
  }

  async pushAirConditionerDetailsChanges(): Promise<void> {
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushAirConditionerDetailsChanges Active: ${this.Active},`
    + ` disablePushOff: ${this.disablePushOff},  disablePushOn: ${this.disablePushOn}`);
    await this.context();
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
        `${this.device.remoteType}: ${this.accessory.displayName} CurrentMode: ${this.CurrentMode},`
        + ` CurrentTemperature: ${this.CurrentTemperature}`,
      );
    }
    const parameter = `${this.CurrentTemperature},${this.CurrentMode},${this.CurrentFanSpeed},${this.state}`;

    if (this.Active === this.platform.Characteristic.Active.ACTIVE) {
      await this.context();
      if (this.CurrentTemperature < this.accessory.context.CurrentTemperature) {
        this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
      } else if (this.CurrentTemperature > this.accessory.context.CurrentTemperature) {
        this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
      }
    } else {
      this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }
    const body = superStringify({
      'command': 'setAll',
      'parameter': `${parameter}`,
      'commandType': 'command',
    });

    await this.pushChanges(body);
  }

  async pushChanges(body: Array<body>): Promise<void> {
    if (this.device.connectionType === 'OpenAPI') {
      try {
        this.debugWarnLog(`${this.device.remoteType}: ${this.accessory.displayName} body: ${body}`);
        // Make Push On request to the API
        const t = Date.now();
        const nonce = 'requestID';
        const data = this.platform.config.credentials?.token + t + nonce;
        const signTerm = crypto.createHmac('sha256', this.platform.config.credentials?.secret)
          .update(Buffer.from(data, 'utf-8'))
          .digest();
        const sign = signTerm.toString('base64');
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} sign: ${sign}`);
        this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Sending request to SwitchBot API. body: ${body},`);
        const options = {
          hostname: HostDomain,
          port: 443,
          path: `${DevicePath}/${this.device.deviceId}/commands`,
          method: 'POST',
          headers: {
            'Authorization': this.platform.config.credentials?.token,
            'sign': sign,
            'nonce': nonce,
            't': t,
            'Content-Type': 'application/json',
            'Content-Length': body.length,
          },
        };
        const req = https.request(options, res => {
          this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushchanges statusCode: ${res.statusCode}`);
          this.statusCode({ res });
          res.on('data', d => {
            this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} d: ${d}`);
          });
        });
        req.on('error', (e: any) => {
          this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} error message: ${e.message}`);
        });
        req.write(body);
        req.end();
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushchanges: ${superStringify(req)}`);
        this.accessory.context.CurrentTemperature = this.CurrentTemperature;
        this.HeatingThresholdTemperature = this.CurrentTemperature;
        this.CoolingThresholdTemperature = this.CurrentTemperature;
        this.accessory.context.HeatingThresholdTemperature = this.HeatingThresholdTemperature;
        this.accessory.context.CoolingThresholdTemperature = this.CoolingThresholdTemperature;
        this.updateHomeKitCharacteristics();
      } catch (e: any) {
        this.apiError({ e });
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType} Connection,`
            + ` Error Message: ${superStringify(e.message)}`,
        );
      }
    } else {
      this.warnLog(`${this.device.remoteType}: ${this.accessory.displayName}`
      + ` Connection Type: ${this.device.connectionType}, commands will not be sent to OpenAPI`);
    }
  }

  async CurrentTemperatureGet(): Promise<CharacteristicValue> {
    if (this.CurrentTemperature === undefined) {
      this.CurrentTemperature = 24;
      this.accessory.context.CurrentTemperature = this.CurrentTemperature;
    } else {
      this.accessory.context.CurrentTemperature = this.CurrentTemperature;
    }
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Get CurrentTemperature: ${this.CurrentTemperature}`);
    this.accessory.context.CurrentTemperature = this.CurrentTemperature;
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
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Get RotationSpeed: ${this.RotationSpeed}`);
    this.accessory.context.RotationSpeed = this.RotationSpeed;
    return this.RotationSpeed;
  }

  async RotationSpeedSet(value: CharacteristicValue): Promise<void> {
    if (value === 4) {
      this.CurrentFanSpeed = 1;
    } else {
      this.CurrentFanSpeed = Number(value) + 1;
    }
    this.RotationSpeed = this.CurrentFanSpeed;
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
    if (this.ValidValues === this.valid012) {
      this.TargetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} Get (AUTO) TargetHeaterCoolerState: ${this.CurrentHeaterCoolerState},` +
          ` ValidValues: ${this.ValidValues}`,
      );
    } else if (this.ValidValues === this.valid12) {
      this.TargetHeaterCoolerState =
        this.platform.Characteristic.TargetHeaterCoolerState.COOL || this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} Get (COOL/HEAT) TargetHeaterCoolerState: ${this.CurrentHeaterCoolerState},` +
          ` ValidValues: ${this.ValidValues}`,
      );
    } else {
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName} Get TargetHeaterCoolerState: ${this.CurrentHeaterCoolerState},` +
          ` ValidValues: ${this.ValidValues}`,
      );
    }
    this.accessory.context.TargetHeaterCoolerState = this.TargetHeaterCoolerState;
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
          `${this.device.remoteType}: ${this.accessory.displayName} Set TargetHeaterCoolerState: ${this.TargetHeaterCoolerState},` +
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
          `${this.device.remoteType}: ${this.accessory.displayName} Set TargetHeaterCoolerState: ${this.TargetHeaterCoolerState},` +
            ` hide_automode: ${this.hide_automode} `,
        );
      }
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
    if (this.Active === this.platform.Characteristic.Active.ACTIVE) {
      await this.context();
      if (this.CurrentTemperature < this.accessory.context.CurrentTemperature) {
        this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName}`
        +` Get (COOLLING) CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`);
      } else if (this.CurrentTemperature > this.accessory.context.CurrentTemperature) {
        this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName}`
        +` Get (HEATING) CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`);
      }
    } else {
      this.CurrentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName}`
      +` Get (INACTIVE) CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`);
    }
    this.accessory.context.CurrentHeaterCoolerState = this.CurrentHeaterCoolerState;
    return this.CurrentHeaterCoolerState;
  }

  async HeatingThresholdTemperatureGet(): Promise<CharacteristicValue> {
    await this.context();
    this.CurrentTemperature = this.accessory.context.CurrentTemperature;
    this.HeatingThresholdTemperature = this.accessory.context.CurrentTemperature;
    this.accessory.context.HeatingThresholdTemperature = this.HeatingThresholdTemperature;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Get HeatingThresholdTemperature: ${this.HeatingThresholdTemperature}`);
    return this.HeatingThresholdTemperature;
  }

  async HeatingThresholdTemperatureSet(value: CharacteristicValue): Promise<void> {
    this.CurrentTemperature = value;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set HeatingThresholdTemperature: ${this.HeatingThresholdTemperature},` +
        ` CurrentTemperatureCached: ${this.accessory.context.CurrentTemperature}`);
    this.pushAirConditionerStatusChanges();
  }

  async CoolingThresholdTemperatureGet(): Promise<CharacteristicValue> {
    await this.context();
    this.CurrentTemperature = this.accessory.context.CurrentTemperature;
    this.CoolingThresholdTemperature = this.accessory.context.CurrentTemperature;
    this.accessory.context.CoolingThresholdTemperature = this.CoolingThresholdTemperature;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Get CoolingThresholdTemperature: ${this.CoolingThresholdTemperature}`);
    return this.CoolingThresholdTemperature;
  }

  async CoolingThresholdTemperatureSet(value: CharacteristicValue): Promise<void> {
    this.CurrentTemperature = value;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Set CoolingThresholdTemperature: ${this.CoolingThresholdTemperature},` +
        ` CurrentTemperatureCached: ${this.accessory.context.CurrentTemperature}`);
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
        `${this.device.remoteType}: ${this.accessory.displayName}`
        + ` updateCharacteristic CurrentHeaterCoolerState: ${this.CurrentHeaterCoolerState}`,
      );
    }
    if (this.HeatingThresholdTemperature === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} HeatingThresholdTemperature: ${this.HeatingThresholdTemperature}`);
    } else {
      this.accessory.context.HeatingThresholdTemperature = this.HeatingThresholdTemperature;
      this.coolerService?.updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, this.HeatingThresholdTemperature);
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName}`
        + ` updateCharacteristic HeatingThresholdTemperature: ${this.HeatingThresholdTemperature}`,
      );
    }
    if (this.CoolingThresholdTemperature === undefined) {
      this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} CoolingThresholdTemperature: ${this.CoolingThresholdTemperature}`);
    } else {
      this.accessory.context.CoolingThresholdTemperature = this.CoolingThresholdTemperature;
      this.coolerService?.updateCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature, this.CoolingThresholdTemperature);
      this.debugLog(
        `${this.device.remoteType}: ${this.accessory.displayName}`
        + ` updateCharacteristic CoolingThresholdTemperature: ${this.CoolingThresholdTemperature}`,
      );
    }
  }

  async disablePushOnChanges({ device }: { device: irdevice & irDevicesConfig; }): Promise<void> {
    if (device.disablePushOn === undefined) {
      this.disablePushOn = false;
    } else {
      this.disablePushOn = device.disablePushOn;
    }
  }

  async disablePushOffChanges({ device }: { device: irdevice & irDevicesConfig; }): Promise<void> {
    if (device.disablePushOff === undefined) {
      this.disablePushOff = false;
    } else {
      this.disablePushOff = device.disablePushOff;
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

  async statusCode({ res }: { res: IncomingMessage }): Promise<void> {
    switch (res.statusCode) {
      case 151:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Device is offline.`);
        break;
      case 171:
        this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Hub Device is offline. Hub: ${this.device.hubDeviceId}`);
        break;
      case 190:
        this.errorLog(
          `${this.device.remoteType}: ${this.accessory.displayName} Device internal error due to device states not synchronized` +
            ` with server, Or command: ${superStringify(res)} format is invalid`,
        );
        break;
      case 100:
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  async apiError({ e }: { e: any; }): Promise<void> {
    this.coolerService.updateCharacteristic(this.platform.Characteristic.Active, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, e);
    this.coolerService.updateCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature, e);
  }

  FirmwareRevision({ accessory, device }: { accessory: PlatformAccessory; device: irdevice & irDevicesConfig; }): string {
    let FirmwareRevision: string;
    this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName}`
    + ` accessory.context.FirmwareRevision: ${accessory.context.FirmwareRevision}`);
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
    if (this.CurrentTemperature === undefined) {
      this.CurrentTemperature = 24;
    } else {
      this.CurrentTemperature = this.accessory.context.CurrentTemperature;
    }
    if (this.accessory.context.CurrentTemperature === undefined) {
      this.CurrentTemperature = 30;
    }
    if (this.device.irair?.hide_automode) {
      this.hide_automode = this.device.irair?.hide_automode;
      this.accessory.context.hide_automode = this.hide_automode;
    } else {
      this.hide_automode = this.device.irair?.hide_automode;
      this.accessory.context.hide_automode = this.hide_automode;
    }
  }

  async config({ device }: { device: irdevice & irDevicesConfig; }): Promise<void> {
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
    if (Object.entries(config).length !== 0) {
      this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Config: ${superStringify(config)}`);
    }
  }

  async logs({ device }: { device: irdevice & irDevicesConfig; }): Promise<void> {
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
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging?.includes('debug')) {
        this.platform.log.warn('[DEBUG]', String(...log));
      }
    }
  }

  errorLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.error(String(...log));
    }
  }

  debugErrorLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      if (this.deviceLogging?.includes('debug')) {
        this.platform.log.error('[DEBUG]', String(...log));
      }
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
