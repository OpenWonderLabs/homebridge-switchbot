import { Context } from 'vm';
import { request } from 'undici';
import { sleep } from '../utils';
import { interval, Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { device, devicesConfig, deviceStatus, switchbot, ad, serviceData, Devices } from '../settings';

export class Lock {
  // Services
  lockService: Service;
  contactSensorService?: Service;

  // Characteristic Values
  ContactSensorState!: CharacteristicValue;
  LockCurrentState!: CharacteristicValue;
  LockTargetState!: CharacteristicValue;

  // OpenAPI Others
  doorState!: deviceStatus['doorState'];
  lockState!: deviceStatus['lockState'];
  deviceStatus!: any; //deviceStatusResponse;

  // BLE Others
  connected?: boolean;
  switchbot!: switchbot;
  address!: ad['address'];
  serviceData!: serviceData;

  // Config
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;

  // Updates
  lockUpdateInProgress!: boolean;
  doLockUpdate!: Subject<void>;

  // Connection
  private readonly BLE = (this.device.connectionType === 'BLE' || this.device.connectionType === 'BLE/OpenAPI');
  private readonly OpenAPI = (this.device.connectionType === 'OpenAPI' || this.device.connectionType === 'BLE/OpenAPI');
  battery: any;
  calibration: any;
  status: any;
  update_from_secondary_lock: any;
  door_open: any;
  double_lock_mode: any;
  unclosed_alarm: any;
  unlocked_alarm: any;
  auto_lock_paused: any;

  constructor(private readonly platform: SwitchBotPlatform, private accessory: PlatformAccessory, public device: device & devicesConfig) {
    // default placeholders
    this.logs(device);
    this.scan(device);
    this.refreshRate(device);
    this.config(device);
    this.context();

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doLockUpdate = new Subject();
    this.lockUpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'W1601700')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision(accessory, device))
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
      .updateValue(this.FirmwareRevision(accessory, device));

    // get the LockMechanism service if it exists, otherwise create a new LockMechanism service
    // you can create multiple services for each accessory
    (this.lockService = accessory.getService(this.platform.Service.LockMechanism) || accessory.addService(this.platform.Service.LockMechanism)),
    `${device.deviceName} ${device.deviceType}`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.LockMechanism, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.lockService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
    if (!this.lockService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
      this.lockService.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
    }

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/LockMechanism

    // create handlers for required characteristics
    this.lockService.getCharacteristic(this.platform.Characteristic.LockTargetState).onSet(this.LockTargetStateSet.bind(this));

    // Contact Sensor Service
    if (device.lock?.hide_contactsensor) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Contact Sensor Service`);
      this.contactSensorService = this.accessory.getService(this.platform.Service.ContactSensor);
      accessory.removeService(this.contactSensorService!);
    } else if (!this.contactSensorService) {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Contact Sensor Service`);
      (this.contactSensorService =
        this.accessory.getService(this.platform.Service.ContactSensor) || this.accessory.addService(this.platform.Service.ContactSensor)),
      `${accessory.displayName} Contact Sensor`;

      this.contactSensorService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Contact Sensor`);
      if (!this.contactSensorService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
        this.contactSensorService.addCharacteristic(this.platform.Characteristic.ConfiguredName, `${accessory.displayName} Contact Sensor`);
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Contact Sensor Service Not Added`);
    }

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.lockUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

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
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType} Connection,`
            + ` Error Message: ${JSON.stringify(e.message)}`);
        }
        this.lockUpdateInProgress = false;
      });
  }

  /**
   * Parse the device status from the SwitchBot api
   */
  async parseStatus(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} parseStatus enableCloudService: ${this.device.enableCloudService}`);
    } else/*if (this.BLE) {
      await this.BLEparseStatus();
    } else*/ if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIparseStatus();
    } else {
      await this.offlineOff();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:`
          + ` ${this.device.connectionType}, parseStatus will not happen.`);
    }
  }

  async BLEparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);
    switch (this.lockState) {
      case 'locked':
        this.LockCurrentState = this.platform.Characteristic.LockCurrentState.SECURED;
        this.LockTargetState = this.platform.Characteristic.LockTargetState.SECURED;
        break;
      default:
        this.LockCurrentState = this.platform.Characteristic.LockCurrentState.UNSECURED;
        this.LockTargetState = this.platform.Characteristic.LockTargetState.UNSECURED;
    }
    switch (this.doorState) {
      case 'opened':
        this.ContactSensorState = this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
        break;
      default:
        this.ContactSensorState = this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.LockTargetState}`);
  }

  async openAPIparseStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
    switch (this.lockState) {
      case 'locked':
        this.LockCurrentState = this.platform.Characteristic.LockCurrentState.SECURED;
        this.LockTargetState = this.platform.Characteristic.LockTargetState.SECURED;
        break;
      default:
        this.LockCurrentState = this.platform.Characteristic.LockCurrentState.UNSECURED;
        this.LockTargetState = this.platform.Characteristic.LockTargetState.UNSECURED;
    }
    switch (this.doorState) {
      case 'opened':
        this.ContactSensorState = this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
        break;
      default:
        this.ContactSensorState = this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;
    }
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.LockTargetState}`);
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
    const switchbot = await this.platform.connectBLE();
    // Convert to BLE Address
    this.device.bleMac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(':')
      .toLowerCase();
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    this.getCustomBLEAddress(switchbot);
    // Start to monitor advertisement packets
    if (switchbot !== false) {
      switchbot
        .startScan({
          model: 'o',
          id: this.device.bleMac,
        })
        .then(async () => {
          // Set an event hander
          switchbot.onadvertisement = async (ad: any) => {
            this.address = ad.address;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac},`
              + ` BLE Address Found: ${this.address}`);
            this.serviceData = ad.serviceData;
            this.battery = ad.serviceData.battery;
            this.calibration = ad.serviceData.calibration;
            this.status = ad.serviceData.status;
            this.update_from_secondary_lock = ad.serviceData.update_from_secondary_lock;
            this.door_open = ad.serviceData.door_open;
            this.double_lock_mode = ad.serviceData.double_lock_mode;
            this.unclosed_alarm = ad.serviceData.unclosed_alarm;
            this.unlocked_alarm = ad.serviceData.unlocked_alarm;
            this.auto_lock_paused = ad.serviceData.auto_lock_paused;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
            this.debugLog(
              `${this.device.deviceType}: ${this.accessory.displayName} battery: ${ad.serviceData.battery}, ` +
              `calibration: ${ad.serviceData.calibration}, status: ${ad.serviceData.status}, battery: ${ad.serviceData.battery}, ` +
              `door_open: ${ad.serviceData.door_open}`);

            if (this.serviceData) {
              this.connected = true;
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.connected}`);
              await this.stopScanning(switchbot);
            } else {
              this.connected = false;
              this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.connected}`);
            }
          };
          // Wait
          return await sleep(this.scanDuration * 1000);
        })
        .then(async () => {
          // Stop to monitor
          await this.stopScanning(switchbot);
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLERefreshStatus with ${this.device.connectionType}`
            + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
          await this.BLERefreshConnection(switchbot);
        });
    } else {
      await this.BLERefreshConnection(switchbot);
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
    try {
      const { body, statusCode, headers } = await request(`${Devices}/${this.device.deviceId}/status`, {
        headers: this.platform.generateHeaders(),
      });
      const deviceStatus = await body.json();
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Devices: ${JSON.stringify(deviceStatus.body)}`);
      this.statusCode(statusCode);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Headers: ${JSON.stringify(headers)}`);
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName
        } refreshStatus: ${JSON.stringify(deviceStatus)}`,
      );
      this.lockState = deviceStatus.body.lockState;
      this.doorState = deviceStatus.body.doorState;
      this.openAPIparseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.apiError(e);
      this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIRefreshStatus with ${this.device.connectionType}`
        + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
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
    } else /*if (this.BLE) {
      await this.BLEpushChanges();
    } else*/ if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges();
    } else {
      await this.offlineOff();
      this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:`
          + ` ${this.device.connectionType}, pushChanges will not happen.`);
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
    if (this.LockTargetState !== this.accessory.context.LockTargetState) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges LockTargetState: ${this.LockTargetState}`
        + ` LockTargetStateCached: ${this.accessory.context.LockTargetState}`);
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
          this.LockTargetState = this.platform.Characteristic.LockTargetState.SECURED;
        })
        .catch(async (e: any) => {
          this.apiError(e);
          this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}`
            + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
          await this.BLEPushConnection();
        });
    } else {
      this.debugLog(
        `${this.device.deviceType}: ${this.accessory.displayName} No BLEpushChanges.` + `LockTargetState: ${this.LockTargetState}, `
        + `LockTargetStateCached: ${this.accessory.context.LockTargetState}`,
      );
    }
  }

  async openAPIpushChanges(): Promise<void> {
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);
    if (this.LockTargetState !== this.accessory.context.LockTargetState) {
      let command = '';
      if (this.LockTargetState) {
        command = 'lock';
      } else {
        command = 'unlock';
      }
      const bodyChange = JSON.stringify({
        'command': `${command}`,
        'parameter': 'default',
        'commandType': 'command',
      });
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
      try {
        const { body, statusCode, headers } = await request(`${Devices}/${this.device.deviceId}/commands`, {
          body: bodyChange,
          method: 'POST',
          headers: this.platform.generateHeaders(),
        });
        const deviceStatus = await body.json();
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Devices: ${JSON.stringify(deviceStatus.body)}`);
        this.statusCode(statusCode);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Headers: ${JSON.stringify(headers)}`);
      } catch (e: any) {
        this.apiError(e);
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIpushChanges with ${this.device.connectionType}`
          + ` Connection, Error Message: ${JSON.stringify(e.message)}`,
        );
      }
    } else {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No openAPIpushChanges.` + `LockTargetState: ${this.LockTargetState}, `
        + `LockTargetStateCached: ${this.accessory.context.LockTargetState}`);
    }
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async LockTargetStateSet(value: CharacteristicValue): Promise<void> {
    if (this.LockTargetState === this.accessory.context.LockTargetState) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set LockTargetState: ${value}`);
    } else {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set LockTargetState: ${value}`);
    }

    this.LockTargetState = value;
    this.doLockUpdate.next();
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    if (!this.device.lock?.hide_contactsensor) {
      if (this.ContactSensorState === undefined) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ContactSensorState: ${this.ContactSensorState}`);
      } else {
        this.accessory.context.ContactSensorState = this.ContactSensorState;
        this.contactSensorService?.updateCharacteristic(this.platform.Characteristic.ContactSensorState, this.ContactSensorState);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic ContactSensorState: ${this.ContactSensorState}`);
      }
    }
    if (this.LockTargetState === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LockTargetState: ${this.LockTargetState}`);
    } else {
      this.accessory.context.LockTargetState = this.LockTargetState;
      this.lockService.updateCharacteristic(this.platform.Characteristic.LockTargetState, this.LockTargetState);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic LockTargetState: ${this.LockTargetState}`);
    }
    if (this.LockCurrentState === undefined) {
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LockCurrentState: ${this.LockCurrentState}`);
    } else {
      this.accessory.context.LockCurrentState = this.LockCurrentState;
      this.lockService.updateCharacteristic(this.platform.Characteristic.LockCurrentState, this.LockCurrentState);
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic LockCurrentState: ${this.LockCurrentState}`);
    }
  }

  async stopScanning(switchbot: any) {
    switchbot.stopScan();
    if (this.connected) {
      await this.BLEparseStatus();
      await this.updateHomeKitCharacteristics();
    } else {
      await this.BLERefreshConnection(switchbot);
    }
  }

  async getCustomBLEAddress(switchbot: any) {
    if (this.device.customBLEaddress && this.deviceLogging.includes('debug')) {
      (async () => {
        // Start to monitor advertisement packets
        await switchbot.startScan({
          model: 'c',
        });
        // Set an event handler
        switchbot.onadvertisement = (ad: any) => {
          this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} ad: ${JSON.stringify(ad, null, '  ')}`);
        };
        await sleep(10000);
        // Stop to monitor
        switchbot.stopScan();
      })();
    }
  }

  async BLEPushConnection() {
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Push Changes`);
      await this.openAPIpushChanges();
    }
  }

  async BLERefreshConnection(switchbot: any): Promise<void> {
    this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`);
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Refresh Status`);
      await this.openAPIRefreshStatus();
    }
  }

  async scan(device: device & devicesConfig): Promise<void> {
    if (device.scanDuration) {
      this.scanDuration = this.accessory.context.scanDuration = device.scanDuration;
      if (this.BLE) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config scanDuration: ${this.scanDuration}`);
      }
    } else {
      this.scanDuration = this.accessory.context.scanDuration = 1;
      if (this.BLE) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Default scanDuration: ${this.scanDuration}`);
      }
    }
  }

  async statusCode(statusCode: number): Promise<void> {
    switch (statusCode) {
      case 151:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Command not supported by this deviceType, statusCode: ${statusCode}`);
        break;
      case 152:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Device not found, statusCode: ${statusCode}`);
        break;
      case 160:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Command is not supported, statusCode: ${statusCode}`);
        break;
      case 161:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Device is offline, statusCode: ${statusCode}`);
        this.offlineOff();
        break;
      case 171:
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Hub Device is offline, statusCode: ${statusCode}. `
          + `Hub: ${this.device.hubDeviceId}`);
        this.offlineOff();
        break;
      case 190:
        this.errorLog(
          `${this.device.deviceType}: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
          ` Or command format is invalid, statusCode: ${statusCode}`,
        );
        break;
      case 100:
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Command successfully sent, statusCode: ${statusCode}`);
        break;
      case 200:
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Request successful, statusCode: ${statusCode}`);
        break;
      default:
        this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Unknown statusCode: `
          + `${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`);
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      await this.context();
      await this.updateHomeKitCharacteristics();
    }
  }

  async apiError(e: any): Promise<void> {
    if (!this.device.lock?.hide_contactsensor) {
      this.contactSensorService?.updateCharacteristic(this.platform.Characteristic.ContactSensorState, e);
    }
    this.lockService.updateCharacteristic(this.platform.Characteristic.LockTargetState, e);
    this.lockService.updateCharacteristic(this.platform.Characteristic.LockCurrentState, e);
  }

  FirmwareRevision(accessory: PlatformAccessory<Context>, device: device & devicesConfig): CharacteristicValue {
    let FirmwareRevision: string;
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
      + ` accessory.context.FirmwareRevision: ${accessory.context.FirmwareRevision}`);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} device.firmware: ${device.firmware}`);
    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} this.platform.version: ${this.platform.version}`);
    if (accessory.context.FirmwareRevision) {
      FirmwareRevision = accessory.context.FirmwareRevision;
    } else if (device.firmware) {
      FirmwareRevision = device.firmware;
    } else {
      FirmwareRevision = this.platform.version;
    }
    return FirmwareRevision;
  }

  async context() {
    if (this.LockTargetState === undefined) {
      this.LockTargetState = false;
    } else {
      this.LockTargetState = this.accessory.context.On;
    }
  }

  async refreshRate(device: device & devicesConfig): Promise<void> {
    if (device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = device.refreshRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options!.refreshRate;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
    }
  }

  async config(device: device & devicesConfig): Promise<void> {
    let config = {};
    if (device.lock) {
      config = device.lock;
    }
    if (device.connectionType !== undefined) {
      config['connectionType'] = device.connectionType;
    }
    if (device.external !== undefined) {
      config['external'] = device.external;
    }
    if (device.logging !== undefined) {
      config['logging'] = device.logging;
    }
    if (device.refreshRate !== undefined) {
      config['refreshRate'] = device.refreshRate;
    }
    if (device.scanDuration !== undefined) {
      config['scanDuration'] = device.scanDuration;
    }
    if (Object.entries(config).length !== 0) {
      this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  async logs(device: device & devicesConfig): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
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
