import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { DeviceURL, device, devicesConfig, serviceData, ad, switchbot, deviceStatusResponse } from '../settings';
import { AxiosResponse } from 'axios';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Bot {
  // Services
  private service: Service;
  private batteryService?: Service;

  // Characteristic Values
  SwitchOn!: CharacteristicValue;
  BatteryLevel!: CharacteristicValue;
  StatusLowBattery!: CharacteristicValue;

  // Others
  deviceStatus!: deviceStatusResponse;
  RunTimer!: NodeJS.Timeout;
  switchbot!: switchbot;
  serviceData!: serviceData;
  Mode!: serviceData['mode'];
  state!: serviceData['state'];
  battery!: serviceData['battery'];
  ScanDuration: number;
  TargetState!: boolean;

  // Updates
  botUpdateInProgress!: boolean;
  doBotUpdate!: Subject<void>;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device & devicesConfig,
  ) {
    // default placeholders
    this.SwitchOn = false;
    this.ScanDuration = this.platform.config.options!.refreshRate!;

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doBotUpdate = new Subject();
    this.botUpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'SWITCHBOT-BOT-S1')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!);

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    if (device.bot?.mode === 'switch') {
      (this.service =
        accessory.getService(this.platform.Service.Switch) ||
        accessory.addService(this.platform.Service.Switch)), `${accessory.displayName} Switch`;
    } else {
      (this.service =
        accessory.getService(this.platform.Service.Outlet) ||
        accessory.addService(this.platform.Service.Outlet)), `${accessory.displayName} Outlet`;
    }

    if (device.ble) {
      (this.batteryService =
        accessory.getService(this.platform.Service.Battery) ||
        accessory.addService(this.platform.Service.Battery)), `${accessory.displayName} Battery`;

      this.batteryService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Battery`);
    }

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Outlet, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Outlet

    this.service.getCharacteristic(this.platform.Characteristic.On).onSet(this.handleOnSet.bind(this));

    // Retrieve initial values and updateHomekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.platform.config.options!.refreshRate! * 1000)
      .pipe(skipWhile(() => this.botUpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });

    // Watch for Bot change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doBotUpdate
      .pipe(
        tap(() => {
          this.botUpdateInProgress = true;
        }),
        debounceTime(100),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges();
        } catch (e: any) {
          this.platform.log.error(JSON.stringify(e.message));
          this.platform.debug(`Bot ${accessory.displayName} - ${JSON.stringify(e)}`);
          this.apiError(e);
        }
        this.botUpdateInProgress = false;
      });
  }

  /**
   * Parse the device status from the SwitchBot api
   */
  async parseStatus() {
    if (this.device.ble) {
      this.platform.device('BLE');
      await this.BLEparseStatus();
    } else {
      this.platform.device('OpenAPI');
      await this.openAPIparseStatus();
    }
  }

  private async BLEparseStatus() {
    this.platform.debug('Bots BLE Device parseStatus');
    // BLEmode (true if Switch Mode) | (false if Press Mode)
    if (this.Mode) {
      this.platform.device(`Switch Mode, Mode: ${JSON.stringify(this.Mode)}`);
    }
    this.SwitchOn = Boolean(this.state);
    this.BatteryLevel = Number(this.battery);
    if (this.BatteryLevel < 10) {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.platform.debug(`Bot ${this.accessory.displayName} On: ${this.SwitchOn}, BatteryLevel: ${this.BatteryLevel}`);
  }

  private async openAPIparseStatus() {
    this.SwitchOn = false;
    this.platform.debug(`Bot ${this.accessory.displayName} On: ${this.SwitchOn}`);
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus() {
    if (this.device.ble) {
      this.platform.device('BLE');
      await this.BLERefreshStatus();
    } else {
      this.platform.device('OpenAPI');
      await this.openAPIRefreshStatus();
    }
  }

  private connectBLE() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Switchbot = require('node-switchbot');
    const switchbot = new Switchbot();
    const colon = this.device.deviceId!.match(/.{1,2}/g);
    const bleMac = colon!.join(':'); //returns 1A:23:B4:56:78:9A;
    this.device.bleMac = bleMac.toLowerCase();
    this.platform.device(this.device.bleMac!);
    return switchbot;
  }

  private async BLERefreshStatus() {
    this.platform.device('Bot BLE Device refreshStatus');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const switchbot = this.connectBLE();
    // Start to monitor advertisement packets
    switchbot.startScan({
      model: 'H',
      id: this.device.bleMac,
    }).then(() => {
      // Set an event hander
      switchbot.onadvertisement = (ad: ad) => {
        this.serviceData = ad.serviceData;
        this.Mode = ad.serviceData.mode;
        this.state = ad.serviceData.state;
        this.battery = ad.serviceData.battery;
        this.platform.device(`${this.device.bleMac}: ${JSON.stringify(ad.serviceData)}`);
        this.platform.device(`${this.accessory.displayName}, Model: ${ad.serviceData.model}, Model Name: ${ad.serviceData.modelName},`
          + ` Mode: ${ad.serviceData.mode}, State: ${ad.serviceData.state}, Battery: ${ad.serviceData.battery}`);
      };
      // Wait 10 seconds
      return switchbot.wait(10000);
    }).then(() => {
      // Stop to monitor
      switchbot.stopScan();
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    }).catch(async (e: any) => {
      this.platform.log.error(`BLE Connection Failed: ${e.message}`);
      this.platform.log.warn('Using OpenAPI Connection');
      await this.openAPIRefreshStatus();
    });
  }

  private async openAPIRefreshStatus() {
    try {
      this.deviceStatus = {
        statusCode: 100,
        body: {
          deviceId: this.device.deviceId!,
          deviceType: this.device.deviceType!,
          hubDeviceId: this.device.hubDeviceId,
          power: 'on',
        },
        message: 'success',
      };
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.platform.log.error(`Bot ${this.accessory.displayName} failed to refresh status, Error Message: ${JSON.stringify(e.message)}`);
      this.platform.debug(`Bot ${this.accessory.displayName}, Error: ${JSON.stringify(e)}`);
      this.apiError(e);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	commandType	  Command	    command parameter	  Description
   * Bot   -    "command"     "turnOff"   "default"	  =        set to OFF state
   * Bot   -    "command"     "turnOn"    "default"	  =        set to ON state
   * Bot   -    "command"     "press"     "default"	  =        trigger press
   */
  async pushChanges() {
    if (this.device.ble) {
      this.platform.device('BLE');
      await this.BLEpushChanges();
    } else {
      this.platform.device('OpenAPI');
      await this.openAPIpushChanges();
    }
    this.refreshStatus();
  }

  private async BLEpushChanges() {
    this.platform.device('Bot BLE Device pushChanges');
    const switchbot = this.connectBLE();
    if (this.device.bot?.mode === 'press') {
      this.platform.device(`Press Mode: ${this.device.bot?.mode}`);
      switchbot.discover({ model: 'H', quick: true, id: this.device.bleMac }).then((device_list) => {
        this.platform.log.info(`${this.accessory.displayName}, On: ${this.SwitchOn}`);
        return device_list[0].press({ id: this.device.bleMac });
      }).then(() => {
        this.platform.device('Done.');
      }).catch((e: any) => {
        this.platform.log.error(`BLE pushChanges Error Message: ${e.message}`);
      });
    } else if (this.device.bot?.mode === 'switch') {
      this.platform.device(`Press Mode: ${this.device.bot?.mode}`);
      switchbot.discover({ model: 'H', quick: true, id: this.device.bleMac }).then((device_list) => {
        this.platform.log.info(`${this.accessory.displayName}, On: ${this.SwitchOn}`);
        return this.turnOnOff(device_list);
      }).then(() => {
        this.platform.device('Done.');
      }).catch((e: any) => {
        this.platform.log.error(`BLE pushChanges Error Message: ${e.message}`);
      });
    } else {
      this.platform.log.error('Mode Not Set.');
    }
  }

  private turnOnOff(device_list: any) {
    if (this.SwitchOn) {
      return device_list[0].turnOn({ id: this.device.bleMac });
    } else {
      return device_list[0].turnOff({ id: this.device.bleMac });
    }
  }

  private async openAPIpushChanges() {
    const payload = {
      commandType: 'command',
      parameter: 'default',
    } as any;

    if (this.device.bot?.mode === 'switch' && (this.SwitchOn)) {
      payload.command = 'turnOn';
      this.SwitchOn = true;
      this.platform.debug(`Switch Mode, Turning ${this.SwitchOn}`);
    } else if (this.device.bot?.mode === 'switch' && (!this.SwitchOn)) {
      payload.command = 'turnOff';
      this.SwitchOn = false;
      this.platform.debug(`Switch Mode, Turning ${this.SwitchOn}`);
    } else if (this.device.bot?.mode === 'press') {
      payload.command = 'press';
      this.platform.debug('Press Mode');
      this.SwitchOn = false;
    } else {
      throw new Error('Bot Device Paramters not set for this Bot.');
    }

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
    this.platform.debug(`Bot ${this.accessory.displayName} pushchanges: ${JSON.stringify(payload)}`);

    // Make the API request
    const push: any = (await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload));
    this.platform.debug(`Bot ${this.accessory.displayName} Changes pushed: ${JSON.stringify(push.data)}`);
    this.statusCode(push);
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    if (this.SwitchOn === undefined) {
      this.platform.debug(`Bot ${this.accessory.displayName} On: ${this.SwitchOn}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.On, this.SwitchOn);
      this.platform.device(`Bot ${this.accessory.displayName} updateCharacteristic On: ${this.SwitchOn}`);
    }
    if (this.BatteryLevel === undefined) {
      this.platform.debug(`Bot ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
    } else {
      this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
      this.platform.device(`Bot ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
    }
    if (this.StatusLowBattery === undefined) {
      this.platform.debug(`Bot ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
    } else {
      this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
      this.platform.device(`Bot ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.On, e);
    this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, e);
    this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, e);
  }

  private statusCode(push: AxiosResponse<{ statusCode: number;}>) {
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

  /**
   * Handle requests to set the "On" characteristic
   */
  private handleOnSet(value: CharacteristicValue) {
    this.platform.debug(`Bot ${this.accessory.displayName} - Set On: ${value}`);
    this.SwitchOn === this.TargetState === value;
    this.doBotUpdate.next();
  }
}
