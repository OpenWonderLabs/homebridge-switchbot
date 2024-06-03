/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * plug.ts: @switchbot/homebridge-switchbot.
 */
import { deviceBase } from './device.js';
import { Subject, debounceTime, interval, skipWhile, take, tap } from 'rxjs';

import type { SwitchBotPlatform } from '../platform.js';
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { device, devicesConfig, serviceData, deviceStatus } from '../settings.js';

export class Fan extends deviceBase {
  // Services
  private Fan: {
    Name: CharacteristicValue;
    Service: Service;
    Active: CharacteristicValue;
    SwingMode: CharacteristicValue;
    RotationSpeed: CharacteristicValue;
  };

  private Battery: {
    Name: CharacteristicValue;
    Service: Service;
    BatteryLevel: CharacteristicValue;
    StatusLowBattery: CharacteristicValue;
    ChargingState: CharacteristicValue;
  };

  private LightBulb: {
    Name: CharacteristicValue;
    Service: Service;
    On: CharacteristicValue;
    Brightness: CharacteristicValue;
  };

  // Updates
  fanUpdateInProgress!: boolean;
  doFanUpdate!: Subject<void>;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device);
    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doFanUpdate = new Subject();
    this.fanUpdateInProgress = false;

    // Initialize Fan Service
    accessory.context.Fan = accessory.context.Fan ?? {};
    this.Fan = {
      Name: accessory.context.Fan.Name ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service.Fanv2) ?? accessory.addService(this.hap.Service.Fanv2) as Service,
      Active: accessory.context.Active ?? this.hap.Characteristic.Active.INACTIVE,
      SwingMode: accessory.context.SwingMode ?? this.hap.Characteristic.SwingMode.SWING_DISABLED,
      RotationSpeed: accessory.context.RotationSpeed ?? 0,
    };
    accessory.context.Fan = this.Fan as object;

    // Initialize Fan Service
    this.Fan.Service
      .setCharacteristic(this.hap.Characteristic.Name, this.Fan.Name)
      .getCharacteristic(this.hap.Characteristic.Active)
      .onGet(() => {
        return this.Fan.Active;
      })
      .onSet(this.ActiveSet.bind(this));

    // Initialize Fan RotationSpeed Characteristic
    this.Fan.Service
      .getCharacteristic(this.hap.Characteristic.RotationSpeed)
      .onGet(() => {
        return this.Fan.RotationSpeed;
      })
      .onSet(this.RotationSpeedSet.bind(this));

    // Initialize Fan SwingMode Characteristic
    this.Fan.Service.getCharacteristic(this.hap.Characteristic.SwingMode)
      .onGet(() => {
        return this.Fan.SwingMode;
      })
      .onSet(this.SwingModeSet.bind(this));

    // Initialize Battery Service
    accessory.context.Battery = accessory.context.Battery ?? {};
    this.Battery = {
      Name: accessory.context.Battery.Name ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service.Battery) ?? accessory.addService(this.hap.Service.Battery) as Service,
      BatteryLevel: accessory.context.BatteryLevel ?? 100,
      StatusLowBattery: accessory.context.StatusLowBattery ?? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      ChargingState: accessory.context.ChargingState ?? this.hap.Characteristic.ChargingState.NOT_CHARGING,
    };
    accessory.context.Battery = this.Battery as object;

    // Initialize Battery Service
    this.Battery.Service
      .setCharacteristic(this.hap.Characteristic.Name, this.Battery.Name)
      .getCharacteristic(this.hap.Characteristic.BatteryLevel)
      .onGet(() => {
        return this.Battery.BatteryLevel;
      });

    // Initialize Battery ChargingState Characteristic
    this.Battery.Service
      .getCharacteristic(this.hap.Characteristic.ChargingState)
      .onGet(() => {
        return this.Battery.ChargingState;
      });

    // Initialize Battery StatusLowBattery Characteristic
    this.Battery.Service
      .getCharacteristic(this.hap.Characteristic.StatusLowBattery)
      .onGet(() => {
        return this.Battery.StatusLowBattery;
      });

    // Initialize LightBulb Service
    accessory.context.LightBulb = accessory.context.LightBulb ?? {};
    this.LightBulb = {
      Name: accessory.context.LightBulb.Name ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service.Lightbulb) ?? accessory.addService(this.hap.Service.Lightbulb) as Service,
      On: accessory.context.On ?? false,
      Brightness: accessory.context.Brightness ?? 0,
    };
    accessory.context.LightBulb = this.LightBulb as object;

    // Initialize LightBulb Characteristics
    this.LightBulb.Service
      .setCharacteristic(this.hap.Characteristic.Name, this.LightBulb.Name)
      .getCharacteristic(this.hap.Characteristic.On)
      .onGet(() => {
        return this.LightBulb.On;
      })
      .onSet(this.OnSet.bind(this));

    // Initialize LightBulb Brightness Characteristic
    this.LightBulb.Service
      .getCharacteristic(this.hap.Characteristic.Brightness)
      .onGet(() => {
        return this.LightBulb.Brightness;
      })
      .onSet(this.BrightnessSet.bind(this));

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.fanUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    //regisiter webhook event handler
    this.registerWebhook(accessory, device);

    // Watch for Plug change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doFanUpdate
      .pipe(
        tap(() => {
          this.fanUpdateInProgress = true;
        }),
        debounceTime(this.devicePushRate * 1000),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges();
        } catch (e: any) {
          this.apiError(e);
          this.errorLog(`${device.deviceType}: ${accessory.displayName} failed pushChanges with ${device.connectionType} Connection,`
            + ` Error Message: ${JSON.stringify(e.message)}`);
        }
        this.fanUpdateInProgress = false;
      });
  }

  async BLEparseStatus(serviceData: serviceData): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);

    // State
    switch (serviceData.state) {
      case 'on':
        this.Fan.Active = true;
        break;
      default:
        this.Fan.Active = false;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.Fan.Active}`);
  }

  async openAPIparseStatus(deviceStatus: deviceStatus) {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);

    // Active
    this.Fan.Active = deviceStatus.body.power === 'on' ? this.hap.Characteristic.Active.ACTIVE : this.hap.Characteristic.Active.INACTIVE;
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Active: ${this.Fan.Active}`);

    // SwingMode
    this.Fan.SwingMode = deviceStatus.body.oscillation === 'on' ?
      this.hap.Characteristic.SwingMode.SWING_ENABLED : this.hap.Characteristic.SwingMode.SWING_DISABLED;

    // RotationSpeed
    this.Fan.RotationSpeed = deviceStatus.body.fanSpeed;

    // ChargingState
    this.Battery.ChargingState = deviceStatus.body.chargingStatus === 'charging' ?
      this.hap.Characteristic.ChargingState.CHARGING : this.hap.Characteristic.ChargingState.NOT_CHARGING;

    // BatteryLevel
    this.Battery.BatteryLevel = Number(deviceStatus.body.battery);
    if (this.Battery.BatteryLevel < 10) {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    if (Number.isNaN(this.Battery.BatteryLevel)) {
      this.Battery.BatteryLevel = 100;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel},`
      + ` StatusLowBattery: ${this.Battery.StatusLowBattery}`);

    // Firmware Version
    const version = deviceStatus.body.version?.toString();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Firmware Version: ${version?.replace(/^V|-.*$/g, '')}`);
    if (deviceStatus.body.version) {
      const deviceVersion = version?.replace(/^V|-.*$/g, '') ?? '0.0.0';
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
        .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
        .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
        .updateValue(deviceVersion);
      this.accessory.context.deviceVersion = deviceVersion;
      this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceVersion: ${this.accessory.context.deviceVersion}`);
    }
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} refreshStatus enableCloudService: ${this.device.enableCloudService}`);
    } else if (this.BLE) {
      await this.BLERefreshStatus();
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIRefreshStatus();
    } else {
      await this.offlineOff();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:`
        + ` ${this.device.connectionType}, refreshStatus will not happen.`);
    }
  }

  async BLERefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLERefreshStatus`);
    const switchbot = await this.switchbotBLE();

    if (switchbot === undefined) {
      await this.BLERefreshConnection(switchbot);
    } else {
      // Start to monitor advertisement packets
      (async () => {
        // Start to monitor advertisement packets
        const serviceData: serviceData = await this.monitorAdvertisementPackets(switchbot);
        // Update HomeKit
        if (serviceData.model !== '' && serviceData.modelName !== '') {
          await this.BLEparseStatus(serviceData);
          await this.updateHomeKitCharacteristics();
        } else {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed to get serviceData, serviceData: ${serviceData}`);
          await this.BLERefreshConnection(switchbot);
        }
      })();
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode } = await this.deviceRefreshStatus();
      const deviceStatus: any = await body.json();
      await this.refreshStatusCodes(statusCode, deviceStatus);;
      if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
        await this.successfulRefreshStatus(statusCode, deviceStatus);
        await this.openAPIparseStatus(deviceStatus);
        await this.updateHomeKitCharacteristics();
      } else {
        await this.statusCodes(statusCode, deviceStatus);
      }
    } catch (e: any) {
      await this.apiError(e);
      await this.openAPIRefreshError(e);
    }
  }

  async registerWebhook(accessory: PlatformAccessory, device: device & devicesConfig) {
    if (device.webhook) {
      this.debugLog(`${device.deviceType}: ${accessory.displayName} is listening webhook.`);
      this.platform.webhookEventHandler[device.deviceId] = async (context) => {
        try {
          this.debugLog(`${device.deviceType}: ${accessory.displayName} received Webhook: ${JSON.stringify(context)}`);
          const { version, battery, powerState, oscillation, chargingStatus, fanSpeed } = context;
          const { Active, SwingMode, RotationSpeed } = this.Fan;
          const { BatteryLevel, ChargingState } = this.Battery;
          const { FirmwareRevision } = accessory.context;
          this.debugLog(`${device.deviceType}: ${accessory.displayName} (version, battery, powerState, oscillation, chargingStatus, fanSpeed) = `
            + `Webhook:(${version}, ${battery}, ${powerState}, ${oscillation}, ${chargingStatus}, ${fanSpeed}), `
            + `current:(${FirmwareRevision}, ${BatteryLevel}, ${Active}, ${SwingMode}, ${ChargingState}, ${RotationSpeed})`);

          // Active
          this.Fan.Active = powerState === 'ON' ? this.hap.Characteristic.Active.ACTIVE : this.hap.Characteristic.Active.INACTIVE;

          // SwingMode
          this.Fan.SwingMode = oscillation === 'on' ?
            this.hap.Characteristic.SwingMode.SWING_ENABLED : this.hap.Characteristic.SwingMode.SWING_DISABLED;

          // RotationSpeed
          this.Fan.RotationSpeed = fanSpeed;

          // ChargingState
          this.Battery.ChargingState = chargingStatus === 'charging' ?
            this.hap.Characteristic.ChargingState.CHARGING : this.hap.Characteristic.ChargingState.NOT_CHARGING;

          // BatteryLevel
          this.Battery.BatteryLevel = battery;

          // Firmware Version
          if (version) {
            accessory.context.version = version;
            accessory
              .getService(this.hap.Service.AccessoryInformation)!
              .setCharacteristic(this.hap.Characteristic.FirmwareRevision, accessory.context.version)
              .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
              .updateValue(accessory.context.version);
          }
          this.updateHomeKitCharacteristics();
        } catch (e: any) {
          this.errorLog(`${device.deviceType}: ${accessory.displayName} failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`);
        }
      };
    } else {
      this.debugLog(`${device.deviceType}: ${accessory.displayName} is not listening webhook.`);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * commandType	 command                 parameter	                               Description
   * "command"     "turnOff"               "default"	                           =   set to OFF state
   * "command"     "turnOn"                "default"	                           =   set to ON state
   * "command"     "setNightLightMode"     "off, 1, or 2"                        =   off, turn off nightlight, (1, bright) (2, dim)
   * "command"     "setWindMode"           "direct, natural, sleep, or baby"     =   Set fan mode
   * "command"     "setWindSpeed"          "{1-100} e.g. 10"                     =   Set fan speed 1~100
   */

  async pushChanges(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} pushChanges enableCloudService: ${this.device.enableCloudService}`);
    } else if (this.BLE) {
      await this.BLEpushChanges();
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges();
    } else {
      await this.offlineOff();
      await this.pushChangeDisabled();
    }
    // Refresh the status from the API
    interval(15000)
      .pipe(skipWhile(() => this.fanUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus();
      });
  }

  async BLEpushChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges`);
    if (this.Fan.Active !== this.accessory.context.Active) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges`
        + ` On: ${this.Fan.Active} OnCached: ${this.accessory.context.Active}`);
      const switchbot = await this.platform.connectBLE();
      // Convert to BLE Address
      await this.convertBLEAddress();
      switchbot
        .discover({ model: this.device.bleModel, id: this.device.bleMac })
        .then(async (device_list: any) => {
          this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.Fan.Active}`);
          return await this.retryBLE({
            max: await this.maxRetryBLE(),
            fn: async () => {
              if (this.Fan.Active) {
                return await device_list[0].turnOn({ id: this.device.bleMac });
              } else {
                return await device_list[0].turnOff({ id: this.device.bleMac });
              }
            },
          });
        })
        .then(async () => {
          await this.successfulPushChange_BLE('Active', this.Fan.Active, 'BLE API');
          await this.updateHomeKitCharacteristics();
        })
        .catch(async (e: any) => {
          await this.apiError(e);
          await this.pushChangeError('BLEpushChanges', e);
          await this.BLEPushConnection();
        });
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No BLEpushChanges,`
        + ` Active: ${this.Fan.Active}, ActiveCached: ${this.accessory.context.Active}`);
    }
  }

  async openAPIpushChanges() {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);
    if (this.Fan.Active !== this.accessory.context.Active) {
      let command = '';
      if (this.Fan.Active) {
        command = 'turnOn';
      } else {
        command = 'turnOff';
      }
      const bodyChange = JSON.stringify({
        command: `${command}`,
        parameter: 'default',
        commandType: 'command',
      });
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await this.pushChangeRequest(bodyChange);
        const deviceStatus: any = await body.json();
        await this.pushStatusCodes(statusCode, deviceStatus);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          await this.successfulPushChange(statusCode, deviceStatus, bodyChange);
          await this.updateHomeKitCharacteristics();
        } else {
          await this.statusCode(statusCode);
          await this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        await this.pushChangeError('openAPIpushChanges', e);
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No openAPIpushChanges.`
        + `On: ${this.Fan.Active}, ActiveCached: ${this.accessory.context.Active}`);
    }
    // Push RotationSpeed Update
    if (this.Fan.Active) {
      await this.pushRotationSpeedChanges();
    }
    // Push SwingMode Update
    if (this.Fan.Active) {
      await this.pushSwingModeChanges();
    }
  }

  async pushRotationSpeedChanges(): Promise<void> {
    await this.pushChange('pushRotationSpeedChanges');
    if (this.Fan.SwingMode !== this.accessory.context.SwingMode) {
      const bodyChange = JSON.stringify({
        command: 'setWindSpeed',
        parameter: `${this.Fan.RotationSpeed}`,
        commandType: 'command',
      });
      await this.bodyChange(bodyChange, 'SwitchBot OpenAPI');
      try {
        const { body, statusCode } = await this.pushChangeRequest(bodyChange);
        const deviceStatus: any = await body.json();
        await this.pushStatusCodes(statusCode, deviceStatus);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          await this.successfulPushChange(statusCode, deviceStatus, bodyChange);
          await this.updateHomeKitCharacteristics();
        } else {
          await this.statusCode(statusCode);
          await this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        await this.pushChangeError('pushRotationSpeedChanges', e);
      }
    } else {
      await this.noChanges('RotationSpeed', this.Fan.RotationSpeed, this.accessory.context.RotationSpeed);
    }
  }

  async pushSwingModeChanges(): Promise<void> {
    await this.pushChange('pushSwingModeChanges');
    if (this.Fan.SwingMode !== this.accessory.context.SwingMode) {
      const parameter = this.Fan.SwingMode === this.hap.Characteristic.SwingMode.SWING_ENABLED ? 'on' : 'off';
      const bodyChange = JSON.stringify({
        command: 'setOscillation',
        parameter: `${parameter}`,
        commandType: 'command',
      });
      await this.bodyChange(bodyChange, 'SwitchBot OpenAPI');
      try {
        const { body, statusCode } = await this.pushChangeRequest(bodyChange);
        const deviceStatus: any = await body.json();
        await this.pushStatusCodes(statusCode, deviceStatus);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          await this.successfulPushChange(statusCode, deviceStatus, bodyChange);
          await this.updateHomeKitCharacteristics();
        } else {
          await this.statusCode(statusCode);
          await this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        await this.pushChangeError('pushSwingModeChanges', e);
      }
    } else {
      await this.noChanges('SwingMode', this.Fan.SwingMode, this.accessory.context.SwingMode);
    }
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async ActiveSet(value: CharacteristicValue): Promise<void> {
    if (this.Fan.Active !== this.accessory.context.Active) {
      await this.changeSet(value, 'Active');
    } else {
      await this.noChangeSet(value, 'Active');
    }

    this.Fan.Active = value;
    this.doFanUpdate.next();
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async RotationSpeedSet(value: CharacteristicValue): Promise<void> {
    if (this.Fan.RotationSpeed !== this.accessory.context.RotationSpeed) {
      await this.changeSet(value, 'RotationSpeed');
    } else {
      await this.noChangeSet(value, 'RotationSpeed');
    }

    this.Fan.RotationSpeed = value;
    this.doFanUpdate.next();
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async SwingModeSet(value: CharacteristicValue): Promise<void> {
    if (this.Fan.SwingMode !== this.accessory.context.SwingMode) {
      await this.changeSet(value, 'SwingMode');
    } else {
      await this.noChangeSet(value, 'SwingMode');
    }

    this.Fan.SwingMode = value;
    this.doFanUpdate.next();
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    if (this.LightBulb.On !== this.accessory.context.On) {
      await this.changeSet(value, 'On');
    } else {
      await this.noChangeSet(value, 'On');
    }

    this.LightBulb.On = value;
    this.doFanUpdate.next();
  }

  /**
   * Handle requests to set the value of the "Brightness" characteristic
   */
  async BrightnessSet(value: CharacteristicValue): Promise<void> {
    if (this.LightBulb.Brightness !== this.accessory.context.Brightness) {
      await this.changeSet(value, 'Brightness');
    } else if (this.LightBulb.On) {
      await this.changeSet(value, 'Brightness');
    } else {
      await this.noChangeSet(value, 'Brightness');
    }

    this.LightBulb.Brightness = value;
    this.doFanUpdate.next();
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    // Active
    if (this.Fan.Active === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Active: ${this.Fan.Active}`);
    } else {
      this.accessory.context.Active = this.Fan.Active;
      this.Fan.Service.updateCharacteristic(this.hap.Characteristic.Active, this.Fan.Active);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.Fan.Active}`);
    }
    // RotationSpeed
    if (this.Fan.RotationSpeed === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} RotationSpeed: ${this.Fan.RotationSpeed}`);
    } else {
      this.accessory.context.RotationSpeed = this.Fan.RotationSpeed;
      this.Fan.Service.updateCharacteristic(this.hap.Characteristic.RotationSpeed, this.Fan.RotationSpeed);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic RotationSpeed: ${this.Fan.RotationSpeed}`);
    }
    // SwingMode
    if (this.Fan.SwingMode === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} SwingMode: ${this.Fan.SwingMode}`);
    } else {
      this.accessory.context.SwingMode = this.Fan.SwingMode;
      this.Fan.Service.updateCharacteristic(this.hap.Characteristic.SwingMode, this.Fan.SwingMode);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic SwingMode: ${this.Fan.SwingMode}`);
    }
    // BateryLevel
    if (this.Battery.BatteryLevel === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel}`);
    } else {
      this.accessory.context.BatteryLevel = this.Battery.BatteryLevel;
      this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, this.Battery.BatteryLevel);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.Battery.BatteryLevel}`);
    }
    // ChargingState
    if (this.Battery.ChargingState === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ChargingState: ${this.Battery.ChargingState}`);
    } else {
      this.accessory.context.ChargingState = this.Battery.ChargingState;
      this.Battery.Service.updateCharacteristic(this.hap.Characteristic.ChargingState, this.Battery.ChargingState);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic ChargingState: ${this.Battery.ChargingState}`);
    }
    // StatusLowBattery
    if (this.Battery.StatusLowBattery === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatusLowBattery: ${this.Battery.StatusLowBattery}`);
    } else {
      this.accessory.context.StatusLowBattery = this.Battery.StatusLowBattery;
      this.Battery.Service.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, this.Battery.StatusLowBattery);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` StatusLowBattery: ${this.Battery.StatusLowBattery}`);
    }
  }

  async BLEPushConnection() {
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Push Changes`);
      await this.openAPIpushChanges();
    }
  }

  async BLERefreshConnection(switchbot: any): Promise<void> {
    this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot:`
      + ` ${JSON.stringify(switchbot)}`);
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Refresh Status`);
      await this.openAPIRefreshStatus();
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      this.Fan.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.INACTIVE);
      this.Fan.Service.updateCharacteristic(this.hap.Characteristic.RotationSpeed, 0);
      this.Fan.Service.updateCharacteristic(this.hap.Characteristic.SwingMode, this.hap.Characteristic.SwingMode.SWING_DISABLED);
    }
  }

  async apiError(e: any): Promise<void> {
    this.Fan.Service.updateCharacteristic(this.hap.Characteristic.Active, e);
    this.Fan.Service.updateCharacteristic(this.hap.Characteristic.RotationSpeed, e);
    this.Fan.Service.updateCharacteristic(this.hap.Characteristic.SwingMode, e);
  }
}
