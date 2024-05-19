import { request } from 'undici';
import { deviceBase } from './device.js';
import { interval, Subject } from 'rxjs';
import { Devices } from '../settings.js';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';

import type { SwitchBotPlatform } from '../platform.js';
import type { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import type { device, devicesConfig, deviceStatus, serviceData } from '../settings.js';

export class Lock extends deviceBase {
  // Services
  private LockMechanism: {
    Name: CharacteristicValue;
    Service: Service;
    LockTargetState: CharacteristicValue;
    LockCurrentState: CharacteristicValue;
  };

  private Battery: {
    Name: CharacteristicValue;
    Service: Service;
    BatteryLevel: CharacteristicValue;
    StatusLowBattery: CharacteristicValue;
  };

  private ContactSensor?: {
    Name: CharacteristicValue;
    Service: Service;
    ContactSensorState: CharacteristicValue;
  };

  private Switch?: {
    Name: CharacteristicValue;
    Service: Service;
    On: CharacteristicValue;
  };

  // Updates
  lockUpdateInProgress!: boolean;
  doLockUpdate!: Subject<void>;

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device);
    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doLockUpdate = new Subject();
    this.lockUpdateInProgress = false;

    // Initialize LockMechanism Service
    this.LockMechanism = {
      Name: accessory.context.LockMechanismName ?? accessory.displayName,
      Service: accessory.getService(this.hap.Service.LockMechanism) ?? accessory.addService(this.hap.Service.LockMechanism) as Service,
      LockTargetState: accessory.context.LockTargetState ?? this.hap.Characteristic.LockTargetState.SECURED,
      LockCurrentState: accessory.context.LockCurrentState ?? this.hap.Characteristic.LockCurrentState.SECURED,
    };

    // Initialize LockMechanism Characteristics
    this.LockMechanism.Service
      .setCharacteristic(this.hap.Characteristic.Name, this.LockMechanism.Name)
      .getCharacteristic(this.hap.Characteristic.LockTargetState)
      .onGet(() => {
        return this.LockMechanism.LockTargetState;
      })
      .onSet(this.LockTargetStateSet.bind(this));
    accessory.context.LockMechanismName = this.LockMechanism.Name;

    // Initialize Battery property
    this.Battery = {
      Name: accessory.context.BatteryName ?? `${accessory.displayName} Battery`,
      Service: accessory.getService(this.hap.Service.Battery) ?? accessory.addService(this.hap.Service.Battery) as Service,
      BatteryLevel: accessory.context.BatteryLevel ?? 100,
      StatusLowBattery: accessory.context.StatusLowBattery ?? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
    };

    // Initialize Battery Characteristics
    this.Battery.Service
      .setCharacteristic(this.hap.Characteristic.Name, this.Battery.Name)
      .setCharacteristic(this.hap.Characteristic.ChargingState, this.hap.Characteristic.ChargingState.NOT_CHARGEABLE)
      .getCharacteristic(this.hap.Characteristic.BatteryLevel)
      .onGet(() => {
        return this.Battery.BatteryLevel;
      });

    this.Battery.Service
      .getCharacteristic(this.hap.Characteristic.StatusLowBattery)
      .onGet(() => {
        return this.Battery.StatusLowBattery;
      });
    accessory.context.BatteryName = this.Battery.Name;

    // Contact Sensor Service
    if (device.lock?.hide_contactsensor) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Contact Sensor Service`);
      this.ContactSensor!.Service = this.accessory.getService(this.hap.Service.ContactSensor) as Service;
      accessory.removeService(this.ContactSensor!.Service);
    } else {
      this.ContactSensor = {
        Name: accessory.context.ContactSensorName ?? `${accessory.displayName} Contact Sensor`,
        Service: accessory.getService(this.hap.Service.ContactSensor) ?? this.accessory.addService(this.hap.Service.ContactSensor) as Service,
        ContactSensorState: accessory.context.ContactSensorState ?? this.hap.Characteristic.ContactSensorState.CONTACT_DETECTED,
      };

      // Initialize Contact Sensor Characteristics
      this.ContactSensor.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.ContactSensor.Name)
        .setCharacteristic(this.hap.Characteristic.StatusActive, true)
        .getCharacteristic(this.hap.Characteristic.ContactSensorState)
        .onGet(() => {
          return this.ContactSensor!.ContactSensorState;
        });
      accessory.context.ContactSensorName = this.ContactSensor.Name;
    }

    // Initialize Latch Button Service
    if (device.lock?.activate_latchbutton === false) { // remove the service when this variable is false
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Latch Button Service`);
      this.Switch!.Service = accessory.getService(this.hap.Service.Switch) as Service;
      accessory.removeService(this.Switch!.Service);
    } else {
      this.Switch = {
        Name: accessory.context.SwitchName ?? `${accessory.displayName} Latch`,
        Service: accessory.getService(this.hap.Service.Switch) ?? accessory.addService(this.hap.Service.Switch) as Service,
        On: accessory.context.On ?? false,
      };

      // Initialize Latch Button Characteristics
      this.Switch.Service
        .setCharacteristic(this.hap.Characteristic.Name, this.Switch.Name)
        .getCharacteristic(this.hap.Characteristic.On)
        .onGet(() => {
          return this.Switch!.On;
        })
        .onSet(this.OnSet.bind(this));
      accessory.context.SwitchName = this.Switch.Name;
    }

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.lockUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    //regisiter webhook event handler
    if (device.webhook) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} is listening webhook.`);
      this.platform.webhookEventHandler[this.device.deviceId] = async (context) => {
        try {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} received Webhook: ${JSON.stringify(context)}`);
          const { lockState } = context;
          const { LockCurrentState } = this.LockMechanism;
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ` +
            '(lockState) = ' +
            `Webhook:(${lockState}), ` +
            `current:(${LockCurrentState})`);
          this.LockMechanism.LockCurrentState = lockState === 'LOCKED' ? 1 : 0;
          this.updateHomeKitCharacteristics();
        } catch (e: any) {
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`);
        }
      };
    }

    // Watch for Lock change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doLockUpdate
      .pipe(
        tap(() => {
          this.lockUpdateInProgress = true;
        }),
        debounceTime(this.platform.config.options!.pushRate! * 1000),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges();
        } catch (e: any) {
          this.apiError(e);
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType} Connection,` +
            ` Error Message: ${JSON.stringify(e.message)}`,
          );
        }
        this.lockUpdateInProgress = false;
      });
  }

  async BLEparseStatus(serviceData: serviceData): Promise<void> {
    // BLE Status
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);
    switch (serviceData.status) {
      case 'locked':
        this.LockMechanism.LockCurrentState = this.hap.Characteristic.LockCurrentState.SECURED;
        this.LockMechanism.LockTargetState = this.hap.Characteristic.LockTargetState.SECURED;
        break;
      default:
        this.LockMechanism.LockCurrentState = this.hap.Characteristic.LockCurrentState.UNSECURED;
        this.LockMechanism.LockTargetState = this.hap.Characteristic.LockTargetState.UNSECURED;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
      + ` LockTargetState: ${this.LockMechanism.LockTargetState}, LockCurrentState: ${this.LockMechanism.LockCurrentState}`);

    // Contact Sensor
    if (!this.device.lock?.hide_contactsensor) {
      switch (serviceData.door_open) {
        case 'opened':
          this.ContactSensor!.ContactSensorState = this.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
          break;
        default:
          this.ContactSensor!.ContactSensorState = this.hap.Characteristic.ContactSensorState.CONTACT_DETECTED;
      }
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ContactSensorState: ${this.ContactSensor!.ContactSensorState}`);

    }
    // Battery
    this.Battery.BatteryLevel = Number(serviceData.battery);
    if (this.Battery.BatteryLevel < 10) {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.Battery.StatusLowBattery = this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
      + ` BatteryLevel: ${this.Battery.BatteryLevel}, StatusLowBattery: ${this.Battery.StatusLowBattery}`);
  }

  async openAPIparseStatus(deviceStatus: deviceStatus): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
    switch (deviceStatus.body.lockState) {
      case 'locked':
        this.LockMechanism.LockCurrentState = this.hap.Characteristic.LockCurrentState.SECURED;
        this.LockMechanism.LockTargetState = this.hap.Characteristic.LockTargetState.SECURED;
        break;
      default:
        this.LockMechanism.LockCurrentState = this.hap.Characteristic.LockCurrentState.UNSECURED;
        this.LockMechanism.LockTargetState = this.hap.Characteristic.LockTargetState.UNSECURED;
    }
    switch (deviceStatus.body.doorState) {
      case 'opened':
        this.ContactSensor!.ContactSensorState = this.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
        break;
      default:
        this.ContactSensor!.ContactSensorState = this.hap.Characteristic.ContactSensorState.CONTACT_DETECTED;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.LockMechanism.LockTargetState}`);

    // Battery
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
      this.accessory.context.version = version?.replace(/^V|-.*$/g, '');
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.hap.Characteristic.FirmwareRevision, this.accessory.context.version)
        .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
        .updateValue(this.accessory.context.version);
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
      this.debugWarnLog(
        `${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` +
        ` ${this.device.connectionType}, refreshStatus will not happen.`,
      );
    }
  }

  async BLERefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLERefreshStatus`);
    const switchbot = await this.platform.connectBLE();
    // Convert to BLE Address
    this.device.bleMac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(':')
      .toLowerCase();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    this.getCustomBLEAddress(switchbot);
    // Start to monitor advertisement packets
    (async () => {
      // Start to monitor advertisement packets
      await switchbot.startScan({ model: this.device.bleModel, id: this.device.bleMac });
      // Set an event handler
      switchbot.onadvertisement = (ad: any) => {
        if (this.device.bleMac === ad.address && ad.model === this.device.bleModel) {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ${JSON.stringify(ad, null, '  ')}`);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} address: ${ad.address}, model: ${ad.model}`);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        } else {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        }
      };
      // Wait 10 seconds
      await switchbot.wait(this.scanDuration * 1000);
      // Stop to monitor
      await switchbot.stopScan();
      // Update HomeKit
      await this.BLEparseStatus(switchbot.onadvertisement.serviceData);
      await this.updateHomeKitCharacteristics();
    })();
    if (switchbot === undefined) {
      await this.BLERefreshConnection(switchbot);
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode } = await this.platform.retryRequest(this.deviceMaxRetries, this.deviceDelayBetweenRetries,
        `${Devices}/${this.device.deviceId}/status`, { headers: this.platform.generateHeaders() });
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
      const deviceStatus: any = await body.json();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
      if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
        this.debugSuccessLog(`${this.device.deviceType}: ${this.accessory.displayName} `
          + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
        this.openAPIparseStatus(deviceStatus);
        this.updateHomeKitCharacteristics();
      } else {
        this.statusCode(statusCode);
        this.statusCode(deviceStatus.statusCode);
      }
    } catch (e: any) {
      this.apiError(e);
      this.errorLog(
        `${this.device.deviceType}: ${this.accessory.displayName} failed openAPIRefreshStatus with ${this.device.connectionType}` +
        ` Connection, Error Message: ${JSON.stringify(e.message)}`,
      );
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	commandType	  Command	    command parameter	  Description
   * Lock   -    "command"     "lock"     "default"	 =        set to ???? state
   * Lock   -    "command"     "unlock"   "default"	 =        set to ???? state - LockCurrentState
   */
  async pushChanges(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} pushChanges enableCloudService: ${this.device.enableCloudService}`);
      /*} else if (this.BLE) {
        await this.BLEpushChanges();*/
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges();
    } else {
      await this.offlineOff();
      this.debugWarnLog(
        `${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` + ` ${this.device.connectionType}, pushChanges will not happen.`,
      );
    }
    // Refresh the status from the API
    interval(15000)
      .pipe(skipWhile(() => this.lockUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus();
      });
  }

  async BLEpushChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges`);
    if (this.LockMechanism.LockTargetState !== this.accessory.context.LockTargetState) {
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges LockTargetState: ${this.LockMechanism.LockTargetState}` +
        ` LockTargetStateCached: ${this.accessory.context.LockTargetState}`,
      );
      const switchbot = await this.platform.connectBLE();
      // Convert to BLE Address
      this.device.bleMac = this.device
        .deviceId!.match(/.{1,2}/g)!
        .join(':')
        .toLowerCase();
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
      switchbot
        .discover({
          model: '',
          id: this.device.bleMac,
        })
        .then(() => {
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
          this.successLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `LockTargetState: ${this.LockMechanism.LockTargetState} sent over BLE,  sent successfully`);
          this.LockMechanism.LockTargetState = this.hap.Characteristic.LockTargetState.SECURED;
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(
            `${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}` +
            ` Connection, Error Message: ${JSON.stringify(e.message)}`,
          );
          await this.BLEPushConnection();
        });
    } else {
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} No BLEpushChanges.` +
        `LockTargetState: ${this.LockMechanism.LockTargetState}, ` +
        `LockTargetStateCached: ${this.accessory.context.LockTargetState}`,
      );
    }
  }

  async openAPIpushChanges(LatchUnlock?): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);

    if ((this.LockMechanism.LockTargetState !== this.accessory.context.LockTargetState) || LatchUnlock) {
      // Determine the command based on the LockTargetState or the forceUnlock parameter
      let command = '';
      if (LatchUnlock) {
        command = 'unlock';
      } else {
        command = this.LockMechanism.LockTargetState ? 'lock' : 'unlock';
      }
      const bodyChange = JSON.stringify({
        command: `${command}`,
        parameter: 'default',
        commandType: 'command',
      });
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} statusCode: ${statusCode}`);
        const deviceStatus: any = await body.json();
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus: ${JSON.stringify(deviceStatus)}`);
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus body: ${JSON.stringify(deviceStatus.body)}`);
        this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} deviceStatus statusCode: ${deviceStatus.statusCode}`);
        if ((statusCode === 200 || statusCode === 100) && (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)) {
          this.debugErrorLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `statusCode: ${statusCode} & deviceStatus StatusCode: ${deviceStatus.statusCode}`);
          this.successLog(`${this.device.deviceType}: ${this.accessory.displayName} `
            + `request to SwitchBot API, body: ${JSON.stringify(deviceStatus)} sent successfully`);
        } else {
          this.statusCode(statusCode);
          this.statusCode(deviceStatus.statusCode);
        }
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} failed openAPIpushChanges with ${this.device.connectionType}` +
          ` Connection, Error Message: ${JSON.stringify(e.message)}`,
        );
      }
    } else {
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} No openAPIpushChanges.` +
        `LockTargetState: ${this.LockMechanism.LockTargetState}, ` +
        `LockTargetStateCached: ${this.accessory.context.LockTargetState}`,
      );
    }
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async LockTargetStateSet(value: CharacteristicValue): Promise<void> {
    if (this.LockMechanism.LockTargetState === this.accessory.context.LockTargetState) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set LockTargetState: ${value}`);
    } else {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set LockTargetState: ${value}`);
    }

    this.LockMechanism.LockTargetState = value;
    this.doLockUpdate.next();
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Latch Button Set On: ${value}`);
    if (value) {
      this.debugLog('Attempting to open the latch');

      this.openAPIpushChanges(value).then(() => {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Latch opened successfully`);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
          + ` SwitchService is: ${this.Switch!.Service ? 'available' : 'not available'}`);

        // simulate button press to turn the switch back off
        if (this.Switch!.Service) {
          const SwitchService = this.Switch!.Service;
          // Simulate a button press by waiting a short period before turning the switch off
          setTimeout(() => {
            SwitchService.getCharacteristic(this.hap.Characteristic.On).updateValue(false);
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Latch button switched off automatically.`);
          }, 500); // 500 ms delay
        }
      }).catch((e: any) => {
        // Log the error if the operation failed
        this.debugLog(`Error opening latch: ${e}`);
        // Ensure we turn the switch back off even in case of an error
        if (this.Switch!.Service) {
          this.Switch!.Service.getCharacteristic(this.hap.Characteristic.On).updateValue(false);
          this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Latch button switched off after an error.`);
        }
      });
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Switch is off, nothing to do`);
    }

    this.Switch!.On = value;
    this.doLockUpdate.next();
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    if (!this.device.lock?.hide_contactsensor) {
      if (this.ContactSensor!.ContactSensorState === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ContactSensorState: ${this.ContactSensor!.ContactSensorState}`);
      } else {
        this.accessory.context.ContactSensorState = this.ContactSensor!.ContactSensorState;
        this.ContactSensor!.Service.updateCharacteristic(this.hap.Characteristic.ContactSensorState, this.ContactSensor!.ContactSensorState);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
          + ` ContactSensorState: ${this.ContactSensor!.ContactSensorState}`);
      }
    }
    if (this.LockMechanism.LockTargetState === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LockTargetState: ${this.LockMechanism.LockTargetState}`);
    } else {
      this.accessory.context.LockTargetState = this.LockMechanism.LockTargetState;
      this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState, this.LockMechanism.LockTargetState);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` LockTargetState: ${this.LockMechanism.LockTargetState}`);
    }
    if (this.LockMechanism.LockCurrentState === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LockCurrentState: ${this.LockMechanism.LockCurrentState}`);
    } else {
      this.accessory.context.LockCurrentState = this.LockMechanism.LockCurrentState;
      this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState, this.LockMechanism.LockCurrentState);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` LockCurrentState: ${this.LockMechanism.LockCurrentState}`);
    }
    if (this.Battery.BatteryLevel === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.Battery.BatteryLevel}`);
    } else {
      this.accessory.context.BatteryLevel = this.Battery.BatteryLevel;
      this.Battery.Service.updateCharacteristic(this.hap.Characteristic.BatteryLevel, this.Battery.BatteryLevel);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic`
        + ` BatteryLevel: ${this.Battery.BatteryLevel}`);
    }
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
      if (!this.device.lock?.hide_contactsensor) {
        this.ContactSensor!.Service.updateCharacteristic(this.hap.Characteristic.ContactSensorState,
          this.hap.Characteristic.ContactSensorState.CONTACT_DETECTED);
      }
      this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState, this.hap.Characteristic.LockTargetState.SECURED);
      this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState, this.hap.Characteristic.LockCurrentState.SECURED);
    }
  }

  async apiError(e: any): Promise<void> {
    if (!this.device.lock?.hide_contactsensor) {
      this.ContactSensor!.Service.updateCharacteristic(this.hap.Characteristic.ContactSensorState, e);
    }
    this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockTargetState, e);
    this.LockMechanism.Service.updateCharacteristic(this.hap.Characteristic.LockCurrentState, e);
  }
}
