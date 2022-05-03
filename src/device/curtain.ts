import { AxiosResponse } from 'axios';
import { interval, Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform';
import { debounceTime, skipWhile, take, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { DeviceURL, device, devicesConfig, serviceData, switchbot, deviceStatusResponse, payload, deviceStatus, ad } from '../settings';
import { Context } from 'vm';
import { MqttClient } from 'mqtt';
import { connectAsync } from 'async-mqtt';

export class Curtain {
  // Services
  windowCoveringService: Service;
  lightSensorService?: Service;
  batteryService?: Service;

  // Characteristic Values
  CurrentPosition!: CharacteristicValue;
  PositionState!: CharacteristicValue;
  TargetPosition!: CharacteristicValue;
  CurrentAmbientLightLevel?: CharacteristicValue;
  BatteryLevel?: CharacteristicValue;
  StatusLowBattery?: CharacteristicValue;

  // OpenAPI Others
  deviceStatus!: deviceStatusResponse;
  slidePosition: deviceStatus['slidePosition'];
  moving: deviceStatus['moving'];
  brightness: deviceStatus['brightness'];
  setPositionMode?: string | number;
  Mode!: string;

  // BLE Others
  connected?: boolean;
  switchbot!: switchbot;
  SwitchToOpenAPI?: boolean;
  serviceData!: serviceData;
  spaceBetweenLevels!: number;
  address!: ad['address'];
  calibration: serviceData['calibration'];
  battery: serviceData['battery'];
  position: serviceData['position'];
  lightLevel: serviceData['lightLevel'];

  // Target
  setNewTarget!: boolean;
  setNewTargetTimer!: NodeJS.Timeout;

  // Config
  set_minStep!: number;
  updateRate!: number;
  set_minLux!: number;
  set_maxLux!: number;
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;
  setCloseMode!: string;
  setOpenMode!: string;

  // Updates
  curtainUpdateInProgress!: boolean;
  doCurtainUpdate!: Subject<void>;

  //MQTT stuff
  mqttClient: MqttClient | null = null;

  constructor(private readonly platform: SwitchBotPlatform, private accessory: PlatformAccessory, public device: device & devicesConfig) {
    // default placeholders
    this.logs(device);
    this.refreshRate(device);
    this.scan(device);
    this.config(device);
    this.setupMqtt(device);
    this.CurrentPosition = 0;
    this.TargetPosition = 0;
    this.PositionState = this.platform.Characteristic.PositionState.STOPPED;

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
      .setCharacteristic(this.platform.Characteristic.Model, 'W0701600')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision(accessory, device))
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision).updateValue(this.FirmwareRevision(accessory, device));

    // get the WindowCovering service if it exists, otherwise create a new WindowCovering service
    // you can create multiple services for each accessory
    (this.windowCoveringService =
      accessory.getService(this.platform.Service.WindowCovering) || accessory.addService(this.platform.Service.WindowCovering)),
    `${device.deviceName} ${device.deviceType}`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.WindowCovering, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.windowCoveringService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/WindowCovering

    // create handlers for required characteristics
    this.windowCoveringService.setCharacteristic(this.platform.Characteristic.PositionState, this.PositionState);

    this.windowCoveringService
      .getCharacteristic(this.platform.Characteristic.CurrentPosition)
      .setProps({
        minStep: this.minStep(device),
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onGet(() => {
        return this.CurrentPosition;
      });

    this.windowCoveringService
      .getCharacteristic(this.platform.Characteristic.TargetPosition)
      .setProps({
        minStep: this.minStep(device),
        validValueRanges: [0, 100],
      })
      .onSet(this.TargetPositionSet.bind(this));

    // Light Sensor Service
    if (device.curtain?.hide_lightsensor) {
      this.debugLog(`Curtain: ${accessory.displayName} Removing Light Sensor Service`);
      this.lightSensorService = this.accessory.getService(this.platform.Service.LightSensor);
      accessory.removeService(this.lightSensorService!);
    } else if (!this.lightSensorService) {
      this.debugLog(`Curtain: ${accessory.displayName} Add Light Sensor Service`);
      (this.lightSensorService =
        this.accessory.getService(this.platform.Service.LightSensor) || this.accessory.addService(this.platform.Service.LightSensor)),
      `${accessory.displayName} Light Sensor`;

      this.lightSensorService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Light Sensor`);
    } else {
      this.debugLog(`Curtain: ${accessory.displayName} Light Sensor Service Not Added`);
    }

    // Battery Service
    if (!device.ble) {
      this.debugLog(`Curtain: ${accessory.displayName} Removing Battery Service`);
      this.batteryService = this.accessory.getService(this.platform.Service.Battery);
      accessory.removeService(this.batteryService!);
    } else if (device.ble && !this.batteryService) {
      this.debugLog(`Curtain: ${accessory.displayName} Add Battery Service`);
      (this.batteryService = this.accessory.getService(this.platform.Service.Battery) || this.accessory.addService(this.platform.Service.Battery)),
      `${accessory.displayName} Battery`;

      this.batteryService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Battery`);
    } else {
      this.debugLog(`Curtain: ${accessory.displayName} Battery Service Not Added`);
    }

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.curtainUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    // update slide progress
    interval(this.updateRate * 1000)
      .pipe(skipWhile(() => this.curtainUpdateInProgress))
      .subscribe(async () => {
        if (this.PositionState === this.platform.Characteristic.PositionState.STOPPED) {
          return;
        }
        this.debugLog(`Curtain: ${accessory.displayName} Refresh Status When Moving, PositionState: ${this.PositionState}`);
        await this.refreshStatus();
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
          this.errorLog(`Curtain: ${this.accessory.displayName} failed pushChanges`);
          if (this.deviceLogging.includes('debug')) {
            this.errorLog(`Curtain: ${this.accessory.displayName} failed pushChanges,` + ` Error Message: ${JSON.stringify(e.message)}`);
          }
          this.apiError(e);
        }
        this.curtainUpdateInProgress = false;
      });
  }

  /*
   * Publish MQTT message for topics of
   * 'homebridge-switchbot/curtain/xx:xx:xx:xx:xx:xx'
   */
  mqttPublish(topic: string, message: any) {
    const mac = this.device.deviceId?.toLowerCase().match(/[\s\S]{1,2}/g)?.join(':');
    const options = this.device.mqttPubOptions || {};
    this.mqttClient?.publish(`homebridge-switchbot/curtain/${mac}/${topic}`, `${message}`, options);
    this.debugLog(`Meter: ${this.accessory.displayName} MQTT message: ${topic}/${message} options:${JSON.stringify(options)}`);
  }

  /*
   * Setup MQTT hadler if URL is specifed.
   */
  async setupMqtt(device: device & devicesConfig): Promise<void> {
    if (device.mqttURL) {
      try {
	this.mqttClient = await connectAsync(device.mqttURL, device.mqttOptions || {});
	this.debugLog(`Meter: ${this.accessory.displayName} MQTT connection has been established successfully.`)
	this.mqttClient.on('error', (e: Error) => {
	  this.errorLog(`Meter: ${this.accessory.displayName} Failed to publish MQTT messages. ${e}`)
	});
      } catch (e) {
	this.mqttClient = null;
	this.errorLog(`Meter: ${this.accessory.displayName} Failed to establish MQTT connection. ${e}`)
      }
    }
  }

  /**
   * Parse the device status from the SwitchBot api
   */
  async parseStatus(): Promise<void> {
    if (this.SwitchToOpenAPI || !this.device.ble) {
      await this.openAPIparseStatus();
    } else {
      await this.BLEparseStatus();
    }
  }

  async BLEparseStatus(): Promise<void> {
    this.debugLog(`Curtain: ${this.accessory.displayName} BLE parseStatus`);
    // CurrentPosition
    this.CurrentPosition = 100 - Number(this.position);
    await this.setMinMax();
    this.debugLog(`Curtain: ${this.accessory.displayName} CurrentPosition ${this.CurrentPosition}`);
    if (this.setNewTarget) {
      this.infoLog(`Curtain: ${this.accessory.displayName} Checking Status ...`);
    }

    if (this.setNewTarget) {
      await this.setMinMax();
      if (this.TargetPosition > this.CurrentPosition) {
        this.debugLog(`Curtain: ${this.accessory.displayName} Closing, CurrentPosition: ${this.CurrentPosition}`);
        this.PositionState = this.platform.Characteristic.PositionState.INCREASING;
        this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
        this.warnLog(`Curtain: ${this.CurrentPosition} INCREASING PositionState: ${this.PositionState}`);
      } else if (this.TargetPosition < this.CurrentPosition) {
        this.debugLog(`Curtain: ${this.accessory.displayName} Opening, CurrentPosition: ${this.CurrentPosition}`);
        this.PositionState = this.platform.Characteristic.PositionState.DECREASING;
        this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
        this.warnLog(`Curtain: ${this.CurrentPosition} DECREASING PositionState: ${this.PositionState}`);
      } else {
        this.debugLog(`Curtain: ${this.CurrentPosition} Standby, CurrentPosition: ${this.CurrentPosition}`);
        this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
        this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
        this.warnLog(`Curtain: ${this.CurrentPosition} STOPPED PositionState: ${this.PositionState}`);
      }
    } else {
      this.debugLog(`Curtain: ${this.accessory.displayName} Standby, CurrentPosition: ${this.CurrentPosition}`);
      this.TargetPosition = this.CurrentPosition;
      this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
      this.debugLog(`Curtain: ${this.accessory.displayName} Stopped`);
    }
    this.debugLog(
      `Curtain: ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition},` +
        ` TargetPosition: ${this.TargetPosition}, PositionState: ${this.PositionState},`,
    );

    if (!this.device.curtain?.hide_lightsensor) {
      this.set_minLux = this.minLux();
      this.set_maxLux = this.maxLux();
      this.spaceBetweenLevels = 9;

      // Brightness
      switch (this.lightLevel) {
        case 1:
          this.CurrentAmbientLightLevel = this.set_minLux;
          this.debugLog(`Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 2:
          this.CurrentAmbientLightLevel = (this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels;
          this.debugLog(
            `Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel},` +
              ` Calculation: ${(this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels}`,
          );
          break;
        case 3:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 2;
          this.debugLog(`Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 4:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 3;
          this.debugLog(`Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 5:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 4;
          this.debugLog(`Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 6:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 5;
          this.debugLog(`Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 7:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 6;
          this.debugLog(`Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 8:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 7;
          this.debugLog(`Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 9:
          this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 8;
          this.debugLog(`Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
          break;
        case 10:
        default:
          this.CurrentAmbientLightLevel = this.set_maxLux;
          this.debugLog();
      }
      this.debugLog(
        `Curtain: ${this.accessory.displayName} LightLevel: ${this.lightLevel},` + ` CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`,
      );
    }
    // Battery
    this.BatteryLevel = Number(this.battery);
    if (this.BatteryLevel < 10) {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    } else {
      this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    this.debugLog(`Curtain: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}, StatusLowBattery: ${this.StatusLowBattery}`);
  }

  async openAPIparseStatus(): Promise<void> {
    if (this.device.ble) {
      this.SwitchToOpenAPI = false;
    }
    if (this.platform.config.credentials?.openToken) {
      this.debugLog(`Curtain: ${this.accessory.displayName} OpenAPI parseStatus`);
      // CurrentPosition
      this.CurrentPosition = 100 - Number(this.slidePosition);
      await this.setMinMax();
      this.debugLog(`Curtain ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition}`);
      if (this.setNewTarget) {
        this.infoLog(`Curtain: ${this.accessory.displayName} Checking Status ...`);
      }

      if (this.setNewTarget && this.moving) {
        await this.setMinMax();
        if (this.TargetPosition > this.CurrentPosition) {
          this.debugLog(`Curtain: ${this.accessory.displayName} Closing, CurrentPosition: ${this.CurrentPosition} `);
          this.PositionState = this.platform.Characteristic.PositionState.INCREASING;
          this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
          this.debugLog(`Curtain: ${this.CurrentPosition} INCREASING PositionState: ${this.PositionState}`);
        } else if (this.TargetPosition < this.CurrentPosition) {
          this.debugLog(`Curtain: ${this.accessory.displayName} Opening, CurrentPosition: ${this.CurrentPosition} `);
          this.PositionState = this.platform.Characteristic.PositionState.DECREASING;
          this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
          this.debugLog(`Curtain: ${this.CurrentPosition} DECREASING PositionState: ${this.PositionState}`);
        } else {
          this.debugLog(`Curtain: ${this.CurrentPosition} Standby, CurrentPosition: ${this.CurrentPosition}`);
          this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
          this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
          this.debugLog(`Curtain: ${this.CurrentPosition} STOPPED PositionState: ${this.PositionState}`);
        }
      } else {
        this.debugLog(`Curtain: ${this.accessory.displayName} Standby, CurrentPosition: ${this.CurrentPosition}`);
        this.TargetPosition = this.CurrentPosition;
        this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
        this.debugLog(`Curtain: ${this.accessory.displayName} Stopped`);
      }
      this.debugLog(
        `Curtain: ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition},` +
          ` TargetPosition: ${this.TargetPosition}, PositionState: ${this.PositionState},`,
      );

      if (!this.device.curtain?.hide_lightsensor) {
        this.set_minLux = this.minLux();
        this.set_maxLux = this.maxLux();
        // Brightness
        switch (this.brightness) {
          case 'dim':
            this.CurrentAmbientLightLevel = this.set_minLux;
            break;
          case 'bright':
          default:
            this.CurrentAmbientLightLevel = this.set_maxLux;
        }
        this.debugLog(`Curtain: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
      }
    }
  }

  async refreshStatus(): Promise<void> {
    if (this.device.ble) {
      await this.BLERefreshStatus();
    } else {
      await this.openAPIRefreshStatus();
    }
  }

  async BLERefreshStatus(): Promise<void> {
    this.debugLog(`Curtain: ${this.accessory.displayName} BLE refreshStatus`);
    const switchbot = await this.platform.connectBLE();
    // Convert to BLE Address
    this.device.bleMac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(':')
      .toLowerCase();
    this.debugLog(`Curtain: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    this.getCustomBLEAddress(switchbot);
    // Start to monitor advertisement packets
    if (switchbot !== false) {
      switchbot
        .startScan({
          model: 'c',
          id: this.device.bleMac,
        })
        .then(() => {
          // Set an event hander
          switchbot.onadvertisement = (ad: any) => {
            this.address = ad.address;
            if (this.deviceLogging.includes('debug')) {
              this.infoLog(this.address);
              this.infoLog(this.device.bleMac);
              this.infoLog(`Curtain: ${this.accessory.displayName} BLE Address Found: ${this.address}`);
              this.infoLog(`Curtain: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac}`);
            }
            this.serviceData = ad.serviceData;
            this.calibration = ad.serviceData.calibration;
            this.battery = ad.serviceData.battery;
            this.position = ad.serviceData.position;
            this.lightLevel = ad.serviceData.lightLevel;
            this.debugLog(`Curtain: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
            this.debugLog(
              `Curtain: ${this.accessory.displayName} calibration: ${ad.serviceData.calibration}, ` +
                `position: ${ad.serviceData.position}, lightLevel: ${ad.serviceData.lightLevel}, battery: ${ad.serviceData.battery}`,
            );

            if (this.serviceData) {
              this.connected = true;
              this.debugLog(`Curtain: ${this.accessory.displayName} connected: ${this.connected}`);
            } else {
              this.connected = false;
              this.debugLog(`Curtain: ${this.accessory.displayName} connected: ${this.connected}`);
            }
          };
          // Wait 2 seconds
          return switchbot.wait(this.scanDuration * 1000);
        })
        .then(async () => {
          // Stop to monitor
          switchbot.stopScan();
          if (this.connected) {
            this.parseStatus();
            this.updateHomeKitCharacteristics();
          } else {
            await this.BLEconnection(switchbot);
          }
        })
        .catch(async (e: any) => {
          this.errorLog(`Curtain: ${this.accessory.displayName} failed refreshStatus with BLE Connection`);
          if (this.deviceLogging.includes('debug')) {
            this.errorLog(
              `Curtain: ${this.accessory.displayName} failed refreshStatus with BLE Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
            );
          }
          if (this.platform.config.credentials?.openToken) {
            this.warnLog(`Curtain: ${this.accessory.displayName} Using OpenAPI Connection`);
            this.SwitchToOpenAPI = true;
            await this.openAPIRefreshStatus();
          }
          this.apiError(e);
        });
    } else {
      await this.BLEconnection(switchbot);
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
          this.warnLog(JSON.stringify(ad, null, '  '));
        };
        await switchbot.wait(10000);
        // Stop to monitor
        switchbot.stopScan();
      })();
    }
  }

  async BLEconnection(switchbot: any): Promise<void> {
    this.errorLog(`Curtain: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`);
    if (this.platform.config.credentials?.openToken) {
      this.warnLog(`Curtain: ${this.accessory.displayName} Using OpenAPI Connection`);
      this.SwitchToOpenAPI = true;
      await this.openAPIRefreshStatus();
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    if (this.platform.config.credentials?.openToken) {
      this.debugLog(`Curtain: ${this.accessory.displayName} OpenAPI refreshStatus`);
      try {
        this.deviceStatus = (await this.platform.axios.get(`${DeviceURL}/${this.device.deviceId}/status`)).data;
        this.debugLog(`Curtain: ${this.accessory.displayName} refreshStatus: ${JSON.stringify(this.deviceStatus)}`);
        this.slidePosition = this.deviceStatus.body.slidePosition;
        this.moving = this.deviceStatus.body.moving;
        this.brightness = this.deviceStatus.body.brightness;
        this.parseStatus();
        this.updateHomeKitCharacteristics();
      } catch (e: any) {
        this.errorLog(`Curtain: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection`);
        if (this.deviceLogging.includes('debug')) {
          this.errorLog(
            `Curtain: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
          );
        }
        this.apiError(e);
      }
    }
  }

  async pushChanges(): Promise<void> {
    if (this.device.ble) {
      await this.BLEpushChanges();
    } else {
      await this.openAPIpushChanges();
    }
    interval(this.updateRate * 1000)
      .pipe(take(2))
      .subscribe(async () => {
        await this.refreshStatus();
      });
  }

  async BLEpushChanges(): Promise<void> {
    if (this.TargetPosition !== this.CurrentPosition) {
      this.debugLog(`Curtain: ${this.accessory.displayName} BLE pushChanges`);
      const switchbot = await this.platform.connectBLE();
      // Convert to BLE Address
      this.device.bleMac = this.device
        .deviceId!.match(/.{1,2}/g)!
        .join(':')
        .toLowerCase();
      this.debugLog(`Curtain: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
      if (this.TargetPosition > 50) {
        if (this.device.curtain?.setOpenMode === '1') {
          this.setPositionMode = 1;
          this.Mode = 'Silent Mode';
        } else {
          this.setPositionMode = 0;
          this.Mode = 'Performance Mode';
        }
      } else {
        if (this.device.curtain?.setCloseMode === '1') {
          this.setPositionMode = 1;
          this.Mode = 'Silent Mode';
        } else {
          this.setPositionMode = 0;
          this.Mode = 'Performance Mode';
        }
      }
      const adjustedMode = this.setPositionMode || null;
      if (adjustedMode === null) {
        this.Mode = 'Default Mode';
      }
      this.debugLog(`${this.accessory.displayName} Mode: ${this.Mode}`);
      if (switchbot !== false) {
        switchbot
          .discover({ model: 'c', quick: true, id: this.device.bleMac })
          .then((device_list) => {
            this.infoLog(`${this.accessory.displayName} Target Position: ${this.TargetPosition}`);
            return device_list[0].runToPos(100 - Number(this.TargetPosition), adjustedMode);
          })
          .then(() => {
            this.debugLog(`Curtain: ${this.accessory.displayName} Done.`);
          })
          .catch(async (e: any) => {
            this.errorLog(`Curtain: ${this.accessory.displayName} failed pushChanges with BLE Connection`);
            if (this.deviceLogging.includes('debug')) {
              this.errorLog(
                `Curtain: ${this.accessory.displayName} failed pushChanges with BLE Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
              );
            }
            if (this.platform.config.credentials?.openToken) {
              this.warnLog(`Curtain: ${this.accessory.displayName} Using OpenAPI Connection`);
              await this.openAPIpushChanges();
            }
            this.apiError(e);
          });
      } else {
        this.errorLog(`Curtain: ${this.accessory.displayName} wasn't able to establish BLE Connection`);
        if (this.platform.config.credentials?.openToken) {
          this.warnLog(`Curtain: ${this.accessory.displayName} Using OpenAPI Connection`);
          await this.openAPIpushChanges();
        }
      }
    } else {
      this.debugLog(
        `Curtain: ${this.accessory.displayName} No BLE Changes, CurrentPosition & TargetPosition Are the Same.` +
          `  CurrentPosition: ${this.CurrentPosition}, TargetPosition  ${this.TargetPosition}`,
      );
    }
  }

  async openAPIpushChanges(): Promise<void> {
    if (this.platform.config.credentials?.openToken) {
      try {
        this.debugLog(`Curtain: ${this.accessory.displayName} OpenAPI pushChanges`);
        if (this.TargetPosition !== this.CurrentPosition) {
          this.debugLog(`Pushing ${this.TargetPosition}`);
          const adjustedTargetPosition = 100 - Number(this.TargetPosition);
          if (this.TargetPosition > 50) {
            this.setPositionMode = this.device.curtain?.setOpenMode;
          } else {
            this.setPositionMode = this.device.curtain?.setCloseMode;
          }
          if (this.setPositionMode === '1') {
            this.Mode = 'Silent Mode';
          } else if (this.setPositionMode === '0') {
            this.Mode = 'Performance Mode';
          } else {
            this.Mode = 'Default Mode';
          }
          this.debugLog(`${this.accessory.displayName} Mode: ${this.Mode}`);
          const adjustedMode = this.setPositionMode || 'ff';
          const payload = {
            commandType: 'command',
            command: 'setPosition',
            parameter: `0,${adjustedMode},${adjustedTargetPosition}`,
          } as payload;

          this.infoLog(
            `Curtain: ${this.accessory.displayName} Sending request to SwitchBot API. command: ${payload.command},` +
              ` parameter: ${payload.parameter}, commandType: ${payload.commandType}`,
          );

          // Make the API request
          const push: any = await this.platform.axios.post(`${DeviceURL}/${this.device.deviceId!}/commands`, payload);
          this.debugLog(`Curtain: ${this.accessory.displayName} pushchanges: ${JSON.stringify(push.data)}`);
          this.statusCode(push);
        } else {
          this.debugLog(
            `Curtain: ${this.accessory.displayName} No OpenAPI Changes, CurrentPosition & TargetPosition Are the Same.` +
              `  CurrentPosition: ${this.CurrentPosition}, TargetPosition  ${this.TargetPosition}`,
          );
        }
      } catch (e: any) {
        this.errorLog(`Curtain: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection`);
        if (this.deviceLogging.includes('debug')) {
          this.errorLog(
            `Curtain: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
          );
        }
        this.apiError(e);
      }
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    await this.setMinMax();
    if (this.CurrentPosition === undefined || Number.isNaN(this.CurrentPosition)) {
      this.debugLog(`Curtain: ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition}`);
    } else {
      this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.CurrentPosition, Number(this.CurrentPosition));
      this.debugLog(`Curtain: ${this.accessory.displayName} updateCharacteristic CurrentPosition: ${this.CurrentPosition}`);
      this.mqttPublish('CurrentPosition', this.CurrentPosition);
    }
    if (this.PositionState === undefined) {
      this.debugLog(`Curtain: ${this.accessory.displayName} PositionState: ${this.PositionState}`);
    } else {
      this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.PositionState, Number(this.PositionState));
      this.debugLog(`Curtain: ${this.accessory.displayName} updateCharacteristic PositionState: ${this.PositionState}`);
      this.mqttPublish('PositionState', this.PositionState);
    }
    if (this.TargetPosition === undefined || Number.isNaN(this.TargetPosition)) {
      this.debugLog(`Curtain: ${this.accessory.displayName} TargetPosition: ${this.TargetPosition}`);
    } else {
      this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.TargetPosition, Number(this.TargetPosition));
      this.debugLog(`Curtain: ${this.accessory.displayName} updateCharacteristic TargetPosition: ${this.TargetPosition}`);
      this.mqttPublish('TargetPosition', this.TargetPosition);
    }
    if (!this.device.curtain?.hide_lightsensor) {
      if (this.CurrentAmbientLightLevel === undefined || Number.isNaN(this.CurrentAmbientLightLevel)) {
        this.debugLog(`Curtain: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
      } else {
        this.lightSensorService?.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, this.CurrentAmbientLightLevel);
        this.debugLog(`Curtain: ${this.accessory.displayName}` + ` updateCharacteristic CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
	this.mqttPublish('CurrentAmbientLightLevel', this.CurrentAmbientLightLevel);
      }
    }
    if (this.device.ble) {
      if (this.BatteryLevel === undefined) {
        this.debugLog(`Curtain: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
      } else {
        this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
        this.debugLog(`Curtain: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
	this.mqttPublish('BatteryLevel', this.BatteryLevel);
      }
      if (this.StatusLowBattery === undefined) {
        this.debugLog(`Curtain: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
      } else {
        this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
        this.debugLog(`Curtain: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
	this.mqttPublish('StatusLowBattery', this.StatusLowBattery);
      }
    }
  }

  async apiError(e: any): Promise<void> {
    this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.CurrentPosition, e);
    this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.PositionState, e);
    this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.TargetPosition, e);
    if (!this.device.curtain?.hide_lightsensor) {
      this.lightSensorService?.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, e);
    }
    if (this.device.ble) {
      this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, e);
      this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, e);
    }
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  async statusCode(push: AxiosResponse<{ statusCode: number }>): Promise<void> {
    switch (push.data.statusCode) {
      case 151:
        this.errorLog(`Curtain: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.errorLog(`Curtain: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.errorLog(`Curtain: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.errorLog(`Curtain: ${this.accessory.displayName} Device is offline.`);
        break;
      case 171:
        this.errorLog(`Curtain: ${this.accessory.displayName} Hub Device is offline. Hub: ${this.device.hubDeviceId}`);
        break;
      case 190:
        this.errorLog(
          `Curtain: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
            ` Or command: ${JSON.stringify(push.data)} format is invalid`,
        );
        break;
      case 100:
        this.debugLog(`Curtain: ${this.accessory.displayName} Command successfully sent.`);
        break;
      default:
        this.debugLog(`Curtain: ${this.accessory.displayName} Unknown statusCode.`);
    }
  }

  /**
   * Handle requests to set the value of the "Target Position" characteristic
   */
  async TargetPositionSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`Curtain: ${this.accessory.displayName} TargetPosition: ${value}`);

    this.TargetPosition = value;
    this.mqttPublish('TargetPosition', this.TargetPosition);

    await this.setMinMax();
    if (value > this.CurrentPosition) {
      this.PositionState = this.platform.Characteristic.PositionState.INCREASING;
      this.setNewTarget = true;
      this.debugLog(`Curtain: ${this.accessory.displayName} value: ${value}, CurrentPosition: ${this.CurrentPosition}`);
    } else if (value < this.CurrentPosition) {
      this.PositionState = this.platform.Characteristic.PositionState.DECREASING;
      this.setNewTarget = true;
      this.debugLog(`Curtain: ${this.accessory.displayName} value: ${value}, CurrentPosition: ${this.CurrentPosition}`);
    } else {
      this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
      this.setNewTarget = false;
      this.debugLog(`Curtain: ${this.accessory.displayName} value: ${value}, CurrentPosition: ${this.CurrentPosition}`);
    }
    this.windowCoveringService.setCharacteristic(this.platform.Characteristic.PositionState, this.PositionState);
    this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);

    /**
     * If Curtain movement time is short, the moving flag from backend is always false.
     * The minimum time depends on the network control latency.
     */
    clearTimeout(this.setNewTargetTimer);
    this.debugLog(`Curtain: ${this.accessory.displayName} updateRate: ${this.updateRate}`);
    if (this.setNewTarget) {
      this.setNewTargetTimer = setTimeout(() => {
        this.debugLog(`Curtain: ${this.accessory.displayName} setNewTarget ${this.setNewTarget} timeout`);
        this.setNewTarget = false;
      }, this.updateRate * 1000);
    }
    this.doCurtainUpdate.next();
  }

  async setMinMax(): Promise<void> {
    if (this.device.curtain?.set_min) {
      if (this.CurrentPosition <= this.device.curtain?.set_min) {
        this.CurrentPosition = 0;
      }
    }
    if (this.device.curtain?.set_max) {
      if (this.CurrentPosition >= this.device.curtain?.set_max) {
        this.CurrentPosition = 100;
      }
    }
  }

  async config(device: device & devicesConfig): Promise<void> {
    let config = {};
    if (device.curtain) {
      config = device.curtain;
    }
    if (device.ble) {
      config['ble'] = device.ble;
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
      this.infoLog(`Curtain: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  async refreshRate(device: device & devicesConfig): Promise<void> {
    // refreshRate
    if (device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = device.refreshRate;
      this.debugLog(`Curtain: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options!.refreshRate;
      this.debugLog(`Curtain: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
    }
    // updateRate
    if (device?.curtain?.updateRate) {
      this.updateRate = device?.curtain?.updateRate;
      this.debugLog(`Curtain: ${this.accessory.displayName} Using Device Config Curtain refreshRate: ${this.deviceRefreshRate}`);
    } else {
      this.updateRate = 7;
      this.debugLog(`Curtain: ${this.accessory.displayName} Using Default Curtain Refresh Rate.`);
    }
  }

  async scan(device: device & devicesConfig): Promise<void> {
    if (device.scanDuration) {
      if (this.updateRate > device.scanDuration) {
        this.scanDuration = this.updateRate;
        this.warnLog(`Curtain: ${this.accessory.displayName} scanDuration is less then updateRate, overriding scanDuration with updateRate`);
      } else {
        this.scanDuration = this.accessory.context.scanDuration = device.scanDuration;
      }
      if (device.ble) {
        this.debugLog(`Curtain: ${this.accessory.displayName} Using Device Config scanDuration: ${this.scanDuration}`);
      }
    } else {
      if (this.updateRate > 1) {
        this.scanDuration = this.updateRate;
        this.warnLog(`Curtain: ${this.accessory.displayName} scanDuration is less then updateRate, overriding scanDuration with updateRate`);
      } else {
        this.scanDuration = this.accessory.context.scanDuration = 1;
      }
      if (this.device.ble) {
        this.debugLog(`Curtain: ${this.accessory.displayName} Using Default scanDuration: ${this.scanDuration}`);
      }
    }
  }

  async logs(device: device & devicesConfig): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugLog(`Curtain: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(`Curtain: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      this.debugLog(`Curtain: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugLog(`Curtain: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
    }
  }

  FirmwareRevision(accessory: PlatformAccessory<Context>, device: device & devicesConfig): CharacteristicValue {
    let FirmwareRevision: string;
    this.debugLog(`Color Bulb: ${this.accessory.displayName} accessory.context.FirmwareRevision: ${accessory.context.FirmwareRevision}`);
    this.debugLog(`Color Bulb: ${this.accessory.displayName} device.firmware: ${device.firmware}`);
    this.debugLog(`Color Bulb: ${this.accessory.displayName} this.platform.version: ${this.platform.version}`);
    if (accessory.context.FirmwareRevision) {
      FirmwareRevision = accessory.context.FirmwareRevision;
    } else if (device.firmware) {
      FirmwareRevision = device.firmware;
    } else {
      FirmwareRevision = this.platform.version;
    }
    return FirmwareRevision;
  }

  minStep(device: device & devicesConfig): number {
    if (device.curtain?.set_minStep) {
      this.set_minStep = device.curtain?.set_minStep;
    } else {
      this.set_minStep = 1;
    }
    return this.set_minStep;
  }

  minLux(): number {
    if (this.device.curtain?.set_minLux) {
      this.set_minLux = this.device.curtain?.set_minLux;
    } else {
      this.set_minLux = 1;
    }
    return this.set_minLux;
  }

  maxLux(): number {
    if (this.device.curtain?.set_maxLux) {
      this.set_maxLux = this.device.curtain?.set_maxLux;
    } else {
      this.set_maxLux = 6001;
    }
    return this.set_maxLux;
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

  errorLog(...log: any[]): void {
    if (this.enablingDeviceLogging()) {
      this.platform.log.error(String(...log));
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
