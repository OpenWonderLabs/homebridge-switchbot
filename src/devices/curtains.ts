/* eslint-disable @typescript-eslint/no-var-requires */
import { Service, PlatformAccessory, CharacteristicValue, MacAddress } from 'homebridge';
import { SwitchBotPlatform } from '../platform';
import { interval, Subject } from 'rxjs';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { DeviceURL, device, deviceStatusResponse } from '../settings';
import { AxiosResponse } from 'axios';

export class Curtain {
  // Services
  private service: Service;

  // Characteristic Values
  CurrentPosition!: CharacteristicValue;
  PositionState!: CharacteristicValue;
  TargetPosition!: CharacteristicValue;
  CurrentAmbientLightLevel!: CharacteristicValue;
  
  // Others
  deviceStatus!: deviceStatusResponse;
  setNewTarget!: boolean;
  setNewTargetTimer!: NodeJS.Timeout;
  moveTimer!: NodeJS.Timeout;
  moveTime!: number;
  ScanDuration: any;
  ReverseDir: any;
  FastScanEnabled!: boolean;
  ScanIntervalId!: NodeJS.Timeout;
  FastScanInterval!: number;
  SlowScanInterval!: number;
  OpenCloseThreshold: any;
  PreviousPosition: any;
  Position: any;
  AutoDisableFastScanTimeoutId!: NodeJS.Timeout;
  FastScanDuration: number | undefined;
  switchbot!: {
    discover: (
      arg0:
        {
          duration: any;
          model: string;
          quick: boolean;
          id: MacAddress;
        }
    ) => Promise<any>;
    wait: (
      arg0: number
    ) => any;
  };

  // Updates
  curtainUpdateInProgress!: boolean;
  doCurtainUpdate;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device,
  ) {
    // default placeholders
    this.setMinMax();
    this.CurrentPosition = 0;
    this.TargetPosition = 0;
    this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
    this.ScanDuration = this.platform.config.options!.refreshRate!;
    if (this.platform.config.options?.ble?.includes(this.device.deviceId!)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const SwitchBot = require('node-switchbot');
      this.switchbot = new SwitchBot();
      const colon = device.deviceId!.match(/.{1,2}/g);
      const bleMac = colon!.join(':'); //returns 1A:23:B4:56:78:9A;
      this.device.bleMac = bleMac.toLowerCase();
      if (this.platform.config.options.debug) {
        this.platform.log.warn(this.device.bleMac.toLowerCase());
      }
    }

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doCurtainUpdate = new Subject();
    this.curtainUpdateInProgress = false;
    this.setNewTarget = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'SWITCHBOT-CURTAIN-W0701600')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!);

    // get the WindowCovering service if it exists, otherwise create a new WindowCovering service
    // you can create multiple services for each accessory
    (this.service =
      accessory.getService(this.platform.Service.WindowCovering) ||
      accessory.addService(this.platform.Service.WindowCovering)), `${device.deviceName} ${device.deviceType}`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/WindowCovering

    // create handlers for required characteristics
    this.service.setCharacteristic(this.platform.Characteristic.PositionState, this.PositionState);

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentPosition)
      .setProps({
        minStep: this.platform.config.options?.curtain?.set_minStep || 1,
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onGet(() => {
        return this.CurrentPosition;
      });

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetPosition)
      .setProps({
        minStep: this.platform.config.options?.curtain?.set_minStep || 1,
        validValueRanges: [0, 100],
      })
      .onSet(this.TargetPositionSet.bind(this));
    
    //set up brightness level from the builtin sensor as light bulb accessory
    (this.service =
      accessory.getService(this.platform.Service.LightSensor) ||
      accessory.addService(this.platform.Service.LightSensor)), 'Builtin Lightsensor of %s %s', device.deviceName, device.deviceType;
      this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
      // handle on / off events using the On characteristic
      this.service.getCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel).onGet(() => {
        if (this.Brightness == "bright") {
          return 1;
        }
        else {
          return 0;
        }
      });
  
    
    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.platform.config.options!.refreshRate! * 1000)
      .pipe(skipWhile(() => this.curtainUpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });

    // update slide progress
    interval(this.platform.config.options!.curtain!.refreshRate! * 1000)
      .pipe(skipWhile(() => this.curtainUpdateInProgress))
      .subscribe(() => {
        if (this.PositionState === this.platform.Characteristic.PositionState.STOPPED) {
          return;
        }
        this.platform.debug('Refresh status when moving', this.PositionState);
        this.refreshStatus();
      });


    // Watch for Curtain change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doCurtainUpdate
      .pipe(
        tap(() => {
          this.curtainUpdateInProgress = true;
        }),
        debounceTime(this.platform.config.options!.pushRate! * 1000),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges();
        } catch (e: any) {
          this.platform.log.error(JSON.stringify(e.message));
          this.platform.debug(`Curtain ${accessory.displayName} - ${JSON.stringify(e)}`);
          this.apiError(e);
        }
        this.curtainUpdateInProgress = false;
      });
  }

  parseStatus() {
    if (this.platform.config.options?.ble?.includes(this.device.deviceId!)) {
      this.platform.log.warn('BLE DEVICE-3');
    } else {
      // CurrentPosition
      this.setMinMax();
      this.CurrentPosition = 100 - this.deviceStatus.body.slidePosition!;
      this.setMinMax();
      this.platform.debug(`Curtain ${this.accessory.displayName} CurrentPosition - Device is Currently: ${this.CurrentPosition}`);
      if (this.setNewTarget) {
        this.platform.log.info(`Checking ${this.accessory.displayName} Status ...`);
      }

      if (this.deviceStatus.body.moving) {
        if (this.TargetPosition > this.CurrentPosition) {
          this.platform.debug(`Curtain ${this.accessory.displayName} - Current position: ${this.CurrentPosition} closing`);
          this.PositionState = this.platform.Characteristic.PositionState.INCREASING;
        } else if (this.TargetPosition < this.CurrentPosition) {
          this.platform.debug(`Curtain ${this.accessory.displayName} - Current position: ${this.CurrentPosition} opening`);
          this.PositionState = this.platform.Characteristic.PositionState.DECREASING;
        } else {
          this.platform.debug(`Curtain ${this.CurrentPosition} - standby`);
          this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
        }
      } else {
        this.platform.debug(`Curtain ${this.accessory.displayName} - Current position: ${this.CurrentPosition} standby`);
        if (!this.setNewTarget) {
          /*If Curtain calibration distance is short, there will be an error between the current percentage and the target percentage.*/
          this.TargetPosition = this.CurrentPosition;
          this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
        }
      }
    }
    // Brightness
    switch (this.deviceStatus.body.brightness) {
      case 'dim':
        this.Brightness = this.platform.Characteristic.Brightness.DIM;
        break;
      default:
        this.Brightness = this.platform.Characteristic.Brightness.BRIGHT;
    }
    this.platform.debug(
      `Curtain ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition}, 
      TargetPosition: ${this.TargetPosition}, PositionState: ${this.PositionState}`);
  }

  async refreshStatus() {
    if (this.platform.config.options?.ble?.includes(this.device.deviceId!)) {
      this.platform.log.warn('BLE DEVICE-REFRESH-1');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Switchbot = require('node-switchbot');
      const switchbot = new Switchbot();
      const colon = this.device.deviceId!.match(/.{1,2}/g);
      const bleMac = colon!.join(':'); //returns 1A:23:B4:56:78:9A;
      this.device.bleMac = bleMac.toLowerCase();
      if (this.platform.config.options.debug) {
        this.platform.log.warn(this.device.bleMac!);
      }
      switchbot.onadvertisement = (ad: any) => {
        this.platform.log.info(JSON.stringify(ad, null, '  '));
        this.platform.log.warn('ad:', JSON.stringify(ad));
      };
      switchbot
        .startScan({
          id: this.device.bleMac,
        })
        .then(() => {
          return switchbot.wait(this.platform.config.options!.refreshRate! * 1000);
        })
        .then(() => {
          switchbot.stopScan();
        })
        .catch(async (error: any) => {
          this.platform.log.error(error);
          await this.openAPIRefreshStatus();
        });
      setInterval(() => {
        this.platform.log.info('Start scan ' + this.device.deviceName + '(' + this.device.bleMac + ')');
        switchbot
          .startScan({
            mode: 'T',
            id: bleMac,
          })
          .then(() => {
            return switchbot.wait(this.platform.config.options!.refreshRate! * 1000);
          })
          .then(() => {
            switchbot.stopScan();
            this.platform.log.info('Stop scan ' + this.device.deviceName + '(' + this.device.bleMac + ')');
          })
          .catch(async (error: any) => {
            this.platform.log.error(error);
            await this.openAPIRefreshStatus();
          });
      }, this.platform.config.options!.refreshRate! * 60000);
    } else {
      await this.openAPIRefreshStatus();
    }
  }

  private async openAPIRefreshStatus() {
    try {
      this.platform.debug('Curtain - Reading', `${DeviceURL}/${this.device.deviceId}/status`);
      const deviceStatus: deviceStatusResponse = (
        await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)
      ).data;
      if (deviceStatus.message === 'success') {
        this.deviceStatus = deviceStatus;
        this.platform.debug(`Curtain ${this.accessory.displayName} refreshStatus - ${JSON.stringify(this.deviceStatus)}`);
        this.setMinMax();
        this.parseStatus();
        this.updateHomeKitCharacteristics();
      }
    } catch (e: any) {
      this.platform.log.error(
        `Curtain - Failed to refresh status of ${this.device.deviceName}`,
        JSON.stringify(e.message),
        this.platform.debug(`Curtain ${this.accessory.displayName} - ${JSON.stringify(e)}`),
      );
      this.apiError(e);
    }
  }

  async pushChanges() {
    if (this.platform.config.options?.ble?.includes(this.device.deviceId!)) {
      this.platform.log.warn('BLE DEVICE-2');
    } else {
      if (this.TargetPosition !== this.CurrentPosition) {
        this.platform.debug(`Pushing ${this.TargetPosition}`);
        const adjustedTargetPosition = 100 - Number(this.TargetPosition);
        const payload = {
          commandType: 'command',
          command: 'setPosition',
          parameter: `0,ff,${adjustedTargetPosition}`,
        } as any;

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
        this.platform.debug(`Curtain ${this.accessory.displayName} pushChanges - ${JSON.stringify(payload)}`);

        // Make the API request
        const push = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
        this.platform.debug(`Curtain ${this.accessory.displayName} Changes pushed - ${push.data}`);
        this.statusCode(push);
      }
    }
  }

  updateHomeKitCharacteristics() {
    this.platform.debug(
      `Curtain ${this.accessory.displayName} updateHomeKitCharacteristics - ${JSON.stringify({
        CurrentPosition: this.CurrentPosition,
        PositionState: this.PositionState,
        TargetPosition: this.TargetPosition,
        CurrentAmbientLightLevel: this.CurrentAmbientLightLevel,
      }),
    );
    this.setMinMax();
    if (this.CurrentPosition !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, this.CurrentPosition);
    }
    if (this.PositionState !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.PositionState);
    }
    if (this.TargetPosition !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, this.TargetPosition);
    }
    if (this.CurrentAmbientLightLevel !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, this.CurrentAmbientLightLevel);
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, e);
    this.service.updateCharacteristic(this.platform.Characteristic.PositionState, e);
    this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, e);
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, e);
  }


  private statusCode(push: AxiosResponse<any>) {
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
   * Handle requests to set the value of the "Target Position" characteristic
   */
  TargetPositionSet(value: CharacteristicValue) {
    if (this.platform.config.options?.ble?.includes(this.device.deviceId!)) {
      this.TargetPosition = value as number;
      this.platform.log.info('Target position of Curtain setting: ' + this.TargetPosition + '%');
      clearTimeout(this.moveTimer);
      if (this.TargetPosition > this.CurrentPosition) {
        this.PositionState = this.platform.Characteristic.PositionState.INCREASING;
      } else if (this.TargetPosition < this.CurrentPosition) {
        this.PositionState = this.platform.Characteristic.PositionState.DECREASING;
      } else {
        this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
      }

      if (this.PositionState === this.platform.Characteristic.PositionState.STOPPED) {
        this.service?.getCharacteristic(this.platform.Characteristic.TargetPosition).updateValue(this.TargetPosition);
        this.service?.getCharacteristic(this.platform.Characteristic.CurrentPosition).updateValue(this.CurrentPosition);
        this.service?.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
      } else {
        this.runToPosition(this.convertFromHomeKitPosition(this.TargetPosition))
          .then(() => {
            this.platform.log.info('Done.');
            this.platform.log.info('Target position of Curtain has been set to: ' + this.TargetPosition + '%');
            this.moveTimer = setTimeout(() => {
              // log.info("setTimeout", this.positionState.toString(), this.currentPosition.toString(), this.targetPosition.toString());
              this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
              // this.curtainService?.getCharacteristic(hap.Characteristic.TargetPosition).updateValue(this.targetPosition);
              this.service?.getCharacteristic(this.platform.Characteristic.CurrentPosition).updateValue(this.CurrentPosition);
              this.service?.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
            }, this.moveTime);
          })
          .catch((error: any) => {
            this.platform.log.error(error);
            this.moveTimer = setTimeout(() => {
              this.TargetPosition = this.CurrentPosition;
              this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
              this.service?.getCharacteristic(this.platform.Characteristic.TargetPosition).updateValue(this.TargetPosition);
              // this.curtainService?.getCharacteristic(hap.Characteristic.CurrentPosition).updateValue(this.currentPosition);
              this.service?.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
            }, 1000);
            this.platform.log.info('Target position of Curtain failed to be set to: ' + this.TargetPosition + '%');
          });
      }
    } else {
      this.platform.debug(`Curtain ${this.accessory.displayName} - Set TargetPosition: ${value}`);

      this.TargetPosition = value;

      if (value > this.CurrentPosition) {
        this.PositionState = this.platform.Characteristic.PositionState.INCREASING;
        this.setNewTarget = true;
        this.setMinMax();
      } else if (value < this.CurrentPosition) {
        this.PositionState = this.platform.Characteristic.PositionState.DECREASING;
        this.setNewTarget = true;
        this.setMinMax();
      } else {
        this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
        this.setNewTarget = false;
        this.setMinMax();
      }
      this.service.setCharacteristic(this.platform.Characteristic.PositionState, this.PositionState);

      /**
     * If Curtain movement time is short, the moving flag from backend is always false.
     * The minimum time depends on the network control latency.
     */
      clearTimeout(this.setNewTargetTimer);
      if (this.setNewTarget) {
        this.setNewTargetTimer = setTimeout(() => {
          this.platform.debug(`Curtain ${this.accessory.displayName} - setNewTarget ${this.setNewTarget} timeout`);
          this.setNewTarget = false;
        }, 10000);
      }
      this.doCurtainUpdate.next();
    }
  }

  /**
   * Convert to/from device/HomeKit's position, since:
   *
   * - opened is 0% in HomeKit and 100% in Curtain device.
   * - closed is 100% in HomeKit, 0% in Curtain device.
   */
  convertFromHomeKitPosition(n: number): number {
    let covertToDevicePosition: number;
    if (this.ReverseDir) {
      covertToDevicePosition = n;
    } else {
      covertToDevicePosition = 100 - n;
    }
    return covertToDevicePosition;
  }

  /**
   * Ask the device to start moving to the given position (which must be a device value and not an HomeKit value).
   * Returns a Promise that's resolved as soon as the command was sent to the device.
   */
  public runToPosition(pos: number): Promise<void> {
    const SwitchBot = require('node-switchbot');
    const switchbot = new SwitchBot();

    return switchbot
      .discover({ duration: this.ScanDuration, model: 'c', quick: false })
      .then((device_list: any) => {
        let targetDevice: any = null;

        for (const device of device_list) {
          this.platform.log.info(device.modelName, device.address);
          if (device.address === this.device.bleMac!.toLowerCase()) {
            targetDevice = device;
            break;
          }
        }

        if (!targetDevice) {
          return new Promise((resolve, reject) => {
            reject(new Error('Curtain \'' + this.device.deviceName + '\' (' + this.device.bleMac!.toLowerCase() + '): device not found.'));
          });
        }

        this.startFastScan();

        this.platform.log.info(`Curtain ${this.device.deviceName} (${this.device.bleMac!.toLowerCase()}) is moving to ${pos}...`);
        return targetDevice.runToPos(pos);
      });
  }

  /**
   * Start a faster scan loop (using fastScanInterval). Used in calls to `runToPosition` to
   * report quicker on device position change. Will disable on its own as soon if the curtain's
   * device position does not change for more than `fastScanDuration`.
   */
  private startFastScan() {
    if (this.FastScanEnabled) {
      return;
    }
    this.FastScanEnabled = true;
    this.startScanLoop();
  }

  private stopFastScan() {
    if (!this.FastScanEnabled) {
      return;
    }
    this.FastScanEnabled = false;
    this.startScanLoop();
  }

  private get scanInterval(): number {
    return this.FastScanEnabled ? this.FastScanInterval : this.SlowScanInterval;
  }

  private startScanLoop() {
    if (this.ScanIntervalId !== null) {
      clearInterval(this.ScanIntervalId);
    }

    this.platform.log.info(`Curtain ${this.device.deviceName}: starting scan loop with interval ${this.scanInterval}`);

    this.ScanIntervalId = setInterval(() => {
      this.scan().catch((err) => {
        this.platform.log.error(`error while scanning for Curtain ${this.device.deviceName}: ${err}`);
      });
    }, this.scanInterval);
  }

  private scan(): Promise<void> {
    return new Promise((resolve, reject) => {
      const SwitchBot = require('node-switchbot');
      const switchbot = new SwitchBot();
      switchbot.onadvertisement = (ad: any) => {
        this.applyPosition(ad);
      };
      switchbot.startScan({ id: this.device.bleMac!.toLowerCase() })
        .then(() => {
          return switchbot.wait(this.ScanDuration);
        })
        .then(() => {
          resolve();
          switchbot.stopScan();
        })
        .catch((err: any) => {
          reject(err);
        });
    });
  }

  private applyPosition(ad: any) {
    let pos = ad.serviceData.position;

    if (pos + this.OpenCloseThreshold >= 100) {
      pos = 100;
    } else if (pos - this.OpenCloseThreshold <= 0) {
      pos = 0;
    }

    if (pos === this.PreviousPosition) {
      return;
    }

    this.PreviousPosition = this.Position;
    this.Position = pos;

    if (this.AutoDisableFastScanTimeoutId !== null) {
      clearTimeout(this.AutoDisableFastScanTimeoutId);
    }

    this.AutoDisableFastScanTimeoutId = setTimeout(() => {
      this.stopFastScan();
    }, this.FastScanDuration);
  }

  public setMinMax() {
    if (this.platform.config.options?.curtain?.set_min) {
      if (this.CurrentPosition <= this.platform.config.options?.curtain?.set_min) {
        this.CurrentPosition = 0;
      }
    }
    if (this.platform.config.options?.curtain?.set_max) {
      if (this.CurrentPosition >= this.platform.config.options?.curtain?.set_max) {
        this.CurrentPosition = 100;
      }
    }
  }
}
