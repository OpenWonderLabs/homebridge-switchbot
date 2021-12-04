import { AxiosResponse } from 'axios';
import { interval, Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { DeviceURL, device, devicesConfig, deviceStatusResponse, payload } from '../settings';

export class IndoorCam {
  // Services
  private service: Service;

  // Characteristic Values
  Active!: CharacteristicValue;
  SetupEndpoints!: CharacteristicValue;
  StreamingStatus!: CharacteristicValue;
  SupportedRTPConfiguration!: CharacteristicValue;
  SelectedRTPStreamConfiguration!: CharacteristicValue;
  SupportedVideoStreamConfiguration!: CharacteristicValue;
  SupportedAudioStreamConfiguration!: CharacteristicValue;

  // OpenAPI Others
  deviceStatus!: deviceStatusResponse;

  // Config
  private readonly deviceDebug = this.platform.config.options?.debug === 'device' || this.platform.debugMode;
  private readonly debugDebug = this.platform.config.options?.debug === 'debug' || this.platform.debugMode;

  // Updates
  cameraUpdateInProgress!: boolean;
  doCameraUpdate!: Subject<void>;

  constructor(
    private readonly platform: SwitchBotPlatform,
    private accessory: PlatformAccessory,
    public device: device & devicesConfig,
  ) {
    // Indoor Cam Config
    this.platform.device(`Indoor Cam: ${this.accessory.displayName} Config: (hide_device: ${device.hide_device})`);

    this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} was added but will not work as OpenAPI doesn't support it yet.`);
    // default placeholders
    this.SelectedRTPStreamConfiguration;

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doCameraUpdate = new Subject();
    this.cameraUpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'SWITCHBOT-CAMERA-')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!);

    // get the WindowCovering service if it exists, otherwise create a new WindowCovering service
    // you can create multiple services for each accessory
    (this.service =
      accessory.getService(this.platform.Service.CameraRTPStreamManagement) ||
      accessory.addService(this.platform.Service.CameraRTPStreamManagement)), `${accessory.displayName} Indoor Camera`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/WindowCovering

    // create handlers for required characteristics
    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onSet(this.ActiveSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.SelectedRTPStreamConfiguration)
      .onSet(this.SelectedRTPStreamConfigurationSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.SetupEndpoints)
      .onSet(this.SetupEndpointsSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.StreamingStatus)
      .onSet(this.StreamingStatusSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.SupportedAudioStreamConfiguration)
      .onSet(this.SupportedAudioStreamConfigurationSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.SupportedRTPConfiguration)
      .onSet(this.SupportedRTPConfigurationSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.SupportedVideoStreamConfiguration)
      .onSet(this.SupportedVideoStreamConfigurationSet.bind(this));

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.platform.config.options!.refreshRate! * 1000)
      .pipe(skipWhile(() => this.cameraUpdateInProgress))
      .subscribe(() => {
        this.refreshStatus();
      });

    // Watch for Camera change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doCameraUpdate
      .pipe(
        tap(() => {
          this.cameraUpdateInProgress = true;
        }),
        debounceTime(this.platform.config.options!.pushRate! * 1000),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges();
        } catch (e: any) {
          this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} failed pushChanges`);
          if (this.deviceDebug) {
            this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} failed pushChanges,`
              + ` Error Message: ${JSON.stringify(e.message)}`);
          }
          if (this.debugDebug) {
            this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} failed pushChanges,`
              + ` Error: ${JSON.stringify(e)}`);
          }
          this.apiError(e);
        }
        this.cameraUpdateInProgress = false;
      });
  }

  parseStatus() {
    this.platform.debug(`Indoor Cam ${this.accessory.displayName} SelectedRTPStreamConfiguration: ${this.SelectedRTPStreamConfiguration}`);
  }


  private async refreshStatus() {
    try {
      this.deviceStatus = (await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)).data;
      this.platform.device(`Indoor Cam: ${this.accessory.displayName} refreshStatus: ${JSON.stringify(this.deviceStatus)}`);
      this.parseStatus();
      this.updateHomeKitCharacteristics();
    } catch (e: any) {
      this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} failed refreshStatus with BLE Connection`);
      if (this.deviceDebug) {
        this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} failed refreshStatus with BLE Connection,`
          + ` Error Message: ${JSON.stringify(e.message)}`);
      }
      if (this.debugDebug) {
        this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} failed refreshStatus with BLE Connection,`
          + ` Error: ${JSON.stringify(e)}`);
      }
      this.apiError(e);
    }
  }

  /**
 * Pushes the requested changes to the SwitchBot API
 * deviceType	commandType	  Command	    command parameter	  Description
 * Camera   -    "command"     "turnOff"   "default"	  =        set to OFF state
 * Camera   -    "command"     "turnOn"    "default"	  =        set to ON state
 */
  async pushChanges() {
    if (!this.Active) {
      const payload = {
        commandType: 'command',
        parameter: 'default',
        command: 'turnOn',
      } as payload;

      this.platform.log.info(`Indoor Cam: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},`
        + ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`);

      // Make the API request
      const push: any = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId}/commands`, payload);
      this.platform.debug(`Indoor Cam: ${this.accessory.displayName} pushChanges: ${JSON.stringify(push.data)}`);
      this.statusCode(push);
      this.refreshStatus();
    } else {
      this.platform.device(`Indoor Cam: ${this.accessory.displayName} No pushChanges. Active: ${this.Active}`);
    }
  }

  updateHomeKitCharacteristics() {
    if (this.SelectedRTPStreamConfiguration === undefined) {
      this.platform.debug(`Indoor Cam: ${this.accessory.displayName} On: ${this.SelectedRTPStreamConfiguration}`);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.SelectedRTPStreamConfiguration, this.SelectedRTPStreamConfiguration);
      this.platform.device(`Indoor Cam: ${this.accessory.displayName} updateCharacteristic On: ${this.SelectedRTPStreamConfiguration}`);
    }
  }

  public apiError(e: any) {
    this.service.updateCharacteristic(this.platform.Characteristic.SelectedRTPStreamConfiguration, e);
  }

  private statusCode(push: AxiosResponse<{ statusCode: number; }>) {
    switch (push.data.statusCode) {
      case 151:
        this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} Device is offline.`);
        break;
      case 171:
        this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} Hub Device is offline. Hub: ${this.device.hubDeviceId}`);
        break;
      case 190:
        this.platform.log.error(`Indoor Cam: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,`
          + ` Or command: ${JSON.stringify(push.data)} format is invalid`);
        break;
      case 100:
        this.platform.debug(`Indoor Cam: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.platform.debug(`Indoor Cam: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  /**
   * Handle requests to set the value of the "Active" characteristic
   */
  ActiveSet(value: CharacteristicValue) {
    this.platform.debug(`Indoor Cam: ${this.accessory.displayName} Active: ${value}`);

    this.Active = value;
    this.doCameraUpdate.next();
  }

  /**
   * Handle requests to set the value of the "SelectedRTPStreamConfiguration" characteristic
   */
  SelectedRTPStreamConfigurationSet(value: CharacteristicValue) {
    this.platform.debug(`Indoor Cam: ${this.accessory.displayName} SelectedRTPStreamConfiguration: ${value}`);

    this.SelectedRTPStreamConfiguration = value;
    this.doCameraUpdate.next();
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  SetupEndpointsSet(value: CharacteristicValue) {
    this.platform.debug(`Indoor Cam: ${this.accessory.displayName} SetupEndpoints: ${value}`);

    this.SetupEndpoints = value;
    this.doCameraUpdate.next();
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  SupportedAudioStreamConfigurationSet(value: CharacteristicValue) {
    this.platform.debug(`Indoor Cam: ${this.accessory.displayName} SupportedAudioStreamConfiguration: ${value}`);

    this.SupportedAudioStreamConfiguration = value;
    this.doCameraUpdate.next();
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  SupportedRTPConfigurationSet(value: CharacteristicValue) {
    this.platform.debug(`Indoor Cam: ${this.accessory.displayName} SupportedRTPConfiguration: ${value}`);

    this.SupportedRTPConfiguration = value;
    this.doCameraUpdate.next();
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  StreamingStatusSet(value: CharacteristicValue) {
    this.platform.debug(`Indoor Cam: ${this.accessory.displayName} StreamingStatus: ${value}`);

    this.StreamingStatus = value;
    this.doCameraUpdate.next();
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  SupportedVideoStreamConfigurationSet(value: CharacteristicValue) {
    this.platform.debug(`Indoor Cam: ${this.accessory.displayName} SupportedVideoStreamConfiguration: ${value}`);

    this.SupportedVideoStreamConfiguration = value;
    this.doCameraUpdate.next();
  }
}