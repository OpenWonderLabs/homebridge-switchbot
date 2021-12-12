
import { AxiosResponse } from 'axios';
import Switchbot from 'node-switchbot';
import { interval, Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { DeviceURL, device, devicesConfig, serviceData, ad, switchbot, deviceStatusResponse, payload } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Bot {
  // Services
  private outletService?: Service;
  private switchService?: Service;
  private batteryService?: Service;

  // Characteristic Values
  On!: CharacteristicValue;
  OnCached!: CharacteristicValue;
  BatteryLevel!: CharacteristicValue;
  StatusLowBattery!: CharacteristicValue;

  // OpenAPI Others
  deviceStatus!: deviceStatusResponse;

  // BLE Others
  connected?: boolean;
  switchbot!: switchbot;
  serviceData!: serviceData;
  mode!: serviceData['mode'];
  state!: serviceData['state'];
  battery!: serviceData['battery'];

  // Config
  private readonly deviceDebug = this.platform.config.options?.debug === 'device' || this.platform.debugMode;
  private readonly debugDebug = this.platform.config.options?.debug === 'debug' || this.platform.debugMode;

  // Updates
  botUpdateInProgress!: boolean;
  doBotUpdate!: Subject<void>;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device & devicesConfig,
  ) {
    // Bot Config
    this.platform.device(`Bot: ${this.accessory.displayName} Config: (ble: ${device.ble}, offline: ${device.offline}, mode: ${device.bot?.mode},`
      + ` deviceType: ${device.bot?.deviceType})`);

    // default placeholders
    if (this.On === undefined) {
      this.On = false;
    } else {
      this.On = this.accessory.context.On;
    }
    this.BatteryLevel = 100;
    this.StatusLowBattery = 1;

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
    if (device.bot?.deviceType === 'switch') {
      // If outletService still pressent, then remove first
      if (this.outletService) {
        this.platform.device(`Bot: ${accessory.displayName} Removing Leftover outletService first`);
      }
      this.outletService = this.accessory.getService(this.platform.Service.Outlet);
      accessory.removeService(this.outletService!);

      // Add switchService
      (this.switchService =
        accessory.getService(this.platform.Service.Switch) ||
        accessory.addService(this.platform.Service.Switch)), `${accessory.displayName} Switch`;
      this.platform.log.info(`Bot: ${accessory.displayName} Displaying as Switch`);

      this.switchService?.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
    } else {
      // If switchService still pressent, then remove first
      if (this.switchService) {
        this.platform.device(`Bot: ${accessory.displayName} Removing Leftover switchService first`);
      }
      this.switchService = this.accessory.getService(this.platform.Service.Switch);
      accessory.removeService(this.switchService!);

      // Add outletService
      (this.outletService =
        accessory.getService(this.platform.Service.Outlet) ||
        accessory.addService(this.platform.Service.Outlet)), `${accessory.displayName} Outlet`;
      this.platform.log.info(`Bot: ${accessory.displayName} Displaying as Outlet`);

      this.outletService?.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
    }

    if (device.ble) {
      (this.batteryService =
        accessory.getService(this.platform.Service.Battery) ||
        accessory.addService(this.platform.Service.Battery)), `${accessory.displayName} Battery`;

      this.batteryService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Battery`);
    }

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Outlet

    if (device.bot?.deviceType === 'switch') {
      this.switchService!.getCharacteristic(this.platform.Characteristic.On).onSet(this.handleOnSet.bind(this));
    } else {
      this.outletService!.getCharacteristic(this.platform.Characteristic.On).onSet(this.handleOnSet.bind(this));
    }

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
          this.platform.log.error(`Bot: ${this.accessory.displayName} failed pushChanges`);
          if (this.deviceDebug) {
            this.platform.log.error(`Bot: ${this.accessory.displayName} failed pushChanges,`
              + ` Error Message: ${JSON.stringify(e.message)}`);
          }
          if (this.debugDebug) {
            this.platform.log.error(`Bot: ${this.accessory.displayName} failed pushChanges,`
              + ` Error: ${JSON.stringify(e)}`);
          }
        }
        this.botUpdateInProgress = false;
      });
  }

  /**
   * Parse the device status from the SwitchBot api
   */
  async parseStatus() {
    if (this.device.ble) {
      await this.BLEparseStatus();
    } else {
      await this.openAPIparseStatus();
    }
  }

  private async BLEparseStatus() {
    this.platform.debug(`Bot: ${this.accessory.displayName} BLE parseStatus`);
    // BLEmode (true if Switch Mode) | (false if Press Mode)
    if (this.mode) {
      this.On = Boolean(this.state);
      this.platform.device(`Bot: ${this.accessory.displayName} Switch Mode, mode: ${JSON.stringify(this.mode)}, On: ${JSON.stringify(this.On)}`);
    } else {
      this.platform.device(`Bot: ${this.accessory.displayName} Press Mode, mode: ${JSON.stringify(this.mode)}, On: ${JSON.stringify(this.On)}`);
    }

    this.BatteryLevel = Number(this.battery);
    if (this.BatteryLevel < 10) {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    if (Number.isNaN(this.BatteryLevel)) {
      this.BatteryLevel = 100;
    }
    this.platform.debug(`Bot: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
  }

  private async openAPIparseStatus() {
    if (this.platform.config.credentials?.openToken) {
      this.platform.debug(`Bot: ${this.accessory.displayName} OpenAPI parseStatus`);
      if (this.device.bot?.mode === 'press') {
        this.On = false;
      } else {
        if (this.deviceStatus.body.power === 'on') {
          this.On = true;
        } else {
          this.On = false;
        }
      }
      this.platform.debug(`Bot ${this.accessory.displayName} On: ${this.On}`);
    }
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus() {
    if (this.device.ble) {
      await this.BLERefreshStatus();
    } else {
      await this.openAPIRefreshStatus();
    }
  }

  private connectBLE() {
    const switchbot = new Switchbot();
    this.device.bleMac = ((this.device.deviceId!.match(/.{1,2}/g))!.join(':')).toLowerCase();
    this.platform.device(`Bot: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    return switchbot;
  }

  private async BLERefreshStatus() {
    this.platform.debug(`Bot: ${this.accessory.displayName} BLE refreshStatus`);
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
        this.mode = ad.serviceData.mode;
        this.state = ad.serviceData.state;
        this.battery = ad.serviceData.battery;
        this.platform.device(`Bot: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
        this.platform.device(`Bot: ${this.accessory.displayName}, model: ${ad.serviceData.model}, modelName: ${ad.serviceData.modelName},`
          + ` mode: ${ad.serviceData.mode}, state: ${ad.serviceData.state}, battery: ${ad.serviceData.battery}`);

        if (this.serviceData) {
          this.connected = true;
          this.platform.device(`Bot: ${this.accessory.displayName} connected: ${this.connected}`);
        } else {
          this.connected = false;
          this.platform.device(`Bot: ${this.accessory.displayName} connected: ${this.connected}`);
        }
      };
      // Wait 10 seconds
      return switchbot.wait(10000);
    }).then(async () => {
      // Stop to monitor
      switchbot.stopScan();
      if (this.connected) {
        this.parseStatus();
        this.updateHomeKitCharacteristics();
      } else {
        this.platform.log.error(`Bot: ${this.accessory.displayName} wasn't able to establish BLE Connection`);
        if (this.platform.config.credentials?.openToken) {
          this.platform.log.warn(`Bot: ${this.accessory.displayName} Using OpenAPI Connection`);
          await this.openAPIRefreshStatus();
        }
      }
    }).catch(async (e: any) => {
      this.platform.log.error(`Bot: ${this.accessory.displayName} failed refreshStatus with BLE Connection`);
      if (this.deviceDebug) {
        this.platform.log.error(`Bot: ${this.accessory.displayName} failed refreshStatus with BLE Connection,`
          + ` Error Message: ${JSON.stringify(e.message)}`);
      }
      if (this.debugDebug) {
        this.platform.log.error(`Bot: ${this.accessory.displayName} failed refreshStatus with BLE Connection,`
          + ` Error: ${JSON.stringify(e)}`);
      }
      if (this.platform.config.credentials?.openToken) {
        this.platform.log.warn(`Bot: ${this.accessory.displayName} Using OpenAPI Connection`);
        await this.openAPIRefreshStatus();
      }
      this.apiError(e);
    });
  }

  private async openAPIRefreshStatus() {
    if (this.platform.config.credentials?.openToken) {
      this.platform.debug(`Bot: ${this.accessory.displayName} OpenAPI refreshStatus`);
      try {
        this.deviceStatus = (await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)).data;
        this.platform.device(`Bot: ${this.accessory.displayName} refreshStatus: ${JSON.stringify(this.deviceStatus)}`);
        /*this.deviceStatus = {
          statusCode: 100,
          body: {
            deviceId: this.device.deviceId!,
            deviceType: this.device.deviceType!,
            hubDeviceId: this.device.hubDeviceId,
            power: 'on',
          },
          message: 'success',
        };*/
        this.parseStatus();
        this.updateHomeKitCharacteristics();
      } catch (e: any) {
        this.platform.log.error(`Bot: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection`);
        if (this.deviceDebug) {
          this.platform.log.error(`Bot: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,`
            + ` Error Message: ${JSON.stringify(e.message)}`);
        }
        if (this.debugDebug) {
          this.platform.log.error(`Bot: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,`
            + ` Error: ${JSON.stringify(e)}`);
        }
        this.apiError(e);
      }
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
      await this.BLEpushChanges();
    } else {
      await this.openAPIpushChanges();
    }
    interval(5000)
      .pipe(skipWhile(() => this.botUpdateInProgress))
      .pipe(take(1))
      .subscribe(() => {
        this.refreshStatus();
      });
  }

  private async BLEpushChanges() {
    if (this.On !== this.OnCached) {
      this.platform.debug(`Bot: ${this.accessory.displayName} BLE pushChanges`);
      const switchbot = this.connectBLE();
      if (this.device.bot?.mode === 'press') {
        this.platform.device(`Bot: ${this.accessory.displayName} Press Mode: ${this.device.bot?.mode}`);
        switchbot.discover({ model: 'H', quick: true, id: this.device.bleMac })
          .then((device_list: { press: (arg0: { id: string | undefined; }) => any; }[]) => {
            this.platform.log.info(`Bot: ${this.accessory.displayName}, On: ${this.On}`);
            return device_list[0].press({ id: this.device.bleMac });
          }).then(() => {
            this.platform.device(`Bot: ${this.accessory.displayName} Done.`);
          }).catch(async (e: any) => {
            this.platform.log.error(`Bot: ${this.accessory.displayName} failed pushChanges with BLE Connection`);
            if (this.deviceDebug) {
              this.platform.log.error(`Bot: ${this.accessory.displayName} failed pushChanges with BLE Connection,`
                + ` Error Message: ${JSON.stringify(e.message)}`);
            }
            if (this.debugDebug) {
              this.platform.log.error(`Bot: ${this.accessory.displayName} failed pushChanges with BLE Connection,`
                + ` Error: ${JSON.stringify(e)}`);
            }
            if (this.platform.config.credentials?.openToken) {
              this.platform.log.warn(`Bot: ${this.accessory.displayName} Using OpenAPI Connection`);
              await this.openAPIpushChanges();
            }
            this.apiError(e);
          });
      } else if (this.device.bot?.mode === 'switch') {
        this.platform.device(`Bot: ${this.accessory.displayName} Press Mode: ${this.device.bot?.mode}`);
        switchbot.discover({ model: 'H', quick: true, id: this.device.bleMac }).then((device_list: any) => {
          this.platform.log.info(`Bot: ${this.accessory.displayName} On: ${this.On}`);
          return this.turnOnOff(device_list);
        }).then(() => {
          this.platform.device(`Bot: ${this.accessory.displayName} Done.`);
        }).catch(async (e: any) => {
          this.platform.log.error(`Bot: ${this.accessory.displayName} failed pushChanges with BLE Connection`);
          if (this.deviceDebug) {
            this.platform.log.error(`Bot: ${this.accessory.displayName} failed pushChanges with BLE Connection,`
              + ` Error Message: ${JSON.stringify(e.message)}`);
          }
          if (this.debugDebug) {
            this.platform.log.error(`Bot: ${this.accessory.displayName} failed pushChanges with BLE Connection,`
              + ` Error: ${JSON.stringify(e)}`);
          }
          if (this.platform.config.credentials?.openToken) {
            this.platform.log.warn(`Bot: ${this.accessory.displayName} Using OpenAPI Connection`);
            await this.openAPIpushChanges();
          }
          this.apiError(e);
        });
      } else {
        this.platform.log.error(`Bot: ${this.accessory.displayName} Mode Not Set, mode: ${this.device.bot?.mode}`);
      }
    }
    this.OnCached = this.On;
    this.accessory.context.On = this.OnCached;
  }

  private turnOnOff(device_list: any) {
    if (this.On) {
      return device_list[0].turnOn({ id: this.device.bleMac });
    } else {
      return device_list[0].turnOff({ id: this.device.bleMac });
    }
  }

  private async openAPIpushChanges() {
    if (this.platform.config.credentials?.openToken) {
      try {
        if (this.On !== this.OnCached) {
          this.platform.debug(`Bot: ${this.accessory.displayName} OpenAPI pushChanges`);
          const payload = {
            commandType: 'command',
            parameter: 'default',
          } as payload;

          if (this.device.bot?.mode === 'switch' && this.On) {
            payload.command = 'turnOn';
            this.On = true;
            this.platform.debug(`Bot: ${this.accessory.displayName} Switch Mode, Turning ${this.On}`);
          } else if (this.device.bot?.mode === 'switch' && !this.On) {
            payload.command = 'turnOff';
            this.On = false;
            this.platform.debug(`Bot: ${this.accessory.displayName} Switch Mode, Turning ${this.On}`);
          } else if (this.device.bot?.mode === 'press') {
            payload.command = 'press';
            this.platform.debug(`Bot: ${this.accessory.displayName} Press Mode`);
            this.On = false;
          } else {
            throw new Error(`Bot: ${this.accessory.displayName} Device Paramters not set for this Bot.`);
          }

          this.platform.log.info(`Bot: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},`
            + ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`);

          // Make the API request
          const push: any = (await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload));
          this.platform.debug(`Bot ${this.accessory.displayName} pushchanges: ${JSON.stringify(push.data)}`);
          this.statusCode(push);
          this.OnCached = this.On;
          this.accessory.context.On = this.OnCached;
        }
      } catch (e: any) {
        this.platform.log.error(`Bot: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection`);
        if (this.deviceDebug) {
          this.platform.log.error(`Bot: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,`
            + ` Error Message: ${JSON.stringify(e.message)}`);
        }
        if (this.debugDebug) {
          this.platform.log.error(`Bot: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,`
            + ` Error: ${JSON.stringify(e)}`);
        }
        this.apiError(e);
      }
    }
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  updateHomeKitCharacteristics() {
    if (this.On === undefined) {
      this.platform.debug(`Bot: ${this.accessory.displayName} On: ${this.On}`);
    } else {
      if (this.device.bot?.deviceType === 'switch') {
        this.switchService?.updateCharacteristic(this.platform.Characteristic.On, this.On);
      } else {
        this.outletService?.updateCharacteristic(this.platform.Characteristic.On, this.On);
      }
      this.platform.device(`Bot: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
    }
    if (this.device.ble) {
      if (this.BatteryLevel === undefined) {
        this.platform.debug(`Bot: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
      } else {
        this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
        this.platform.device(`Bot: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
      }
      if (this.StatusLowBattery === undefined) {
        this.platform.debug(`Bot: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
      } else {
        this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
        this.platform.device(`Bot: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
      }
    }
  }

  public apiError(e: any) {
    if (this.device.bot?.deviceType === 'switch') {
      this.switchService?.updateCharacteristic(this.platform.Characteristic.On, e);
    } else {
      this.outletService?.updateCharacteristic(this.platform.Characteristic.On, e);
    }
    if (this.device.ble) {
      this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, e);
      this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, e);
    }
  }

  private statusCode(push: AxiosResponse<{ statusCode: number; }>) {
    switch (push.data.statusCode) {
      case 151:
        this.platform.log.error(`Bot: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.platform.log.error(`Bot: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.platform.log.error(`Bot: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.platform.log.error(`Bot: ${this.accessory.displayName} Device is offline.`);
        this.offlineOff();
        break;
      case 171:
        this.platform.log.error(`Bot: ${this.accessory.displayName} Hub Device is offline. Hub: ${this.device.hubDeviceId}`);
        this.offlineOff();
        break;
      case 190:
        this.platform.log.error(`Bot: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,`
          + ` Or command: ${JSON.stringify(push.data)} format is invalid`);
        break;
      case 100:
        this.platform.debug(`Bot: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.platform.debug(`Bot: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  private offlineOff() {
    if (this.device.offline) {
      this.On = false;
      if (this.device.bot?.deviceType === 'switch') {
        this.switchService?.getCharacteristic(this.platform.Characteristic.On).updateValue(this.On);
      } else {
        this.outletService?.getCharacteristic(this.platform.Characteristic.On).updateValue(this.On);
      }
    }
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  private handleOnSet(value: CharacteristicValue) {
    this.platform.debug(`Bot: ${this.accessory.displayName} On: ${value}`);
    this.On = value;
    this.doBotUpdate.next();
  }
}
