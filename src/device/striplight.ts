import https from 'https';
import crypto from 'crypto';
import { Context } from 'vm';
import { IncomingMessage } from 'http';
import { interval, Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform';
import { debounceTime, skipWhile, tap } from 'rxjs/operators';
import { Service, PlatformAccessory, CharacteristicValue, ControllerConstructor, Controller, ControllerServiceMap } from 'homebridge';
import { device, devicesConfig, switchbot, hs2rgb, rgb2hs, deviceStatus, HostDomain, DevicePath, ad, serviceData } from '../settings';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class StripLight {
  // Services
  lightBulbService!: Service;

  // Characteristic Values
  On!: CharacteristicValue;
  Hue!: CharacteristicValue;
  Saturation!: CharacteristicValue;
  Brightness!: CharacteristicValue;

  // OpenAPI Others
  power: deviceStatus['power'];
  color: deviceStatus['color'];
  brightness: deviceStatus['brightness'];
  deviceStatus!: any; //deviceStatusResponse;

  // BLE Others
  connected?: boolean;
  switchbot!: switchbot;
  address!: ad['address'];
  SwitchToOpenAPI?: boolean;
  serviceData!: serviceData;
  state: serviceData['state'];
  delay: serviceData['delay'];
  wifiRssi: serviceData['wifiRssi'];

  // Config
  set_minStep?: number;
  scanDuration!: number;
  deviceLogging!: string;
  deviceRefreshRate!: number;
  adaptiveLightingShift?: number;

  // Adaptive Lighting
  AdaptiveLightingController?: ControllerConstructor | Controller<ControllerServiceMap>;
  minKelvin!: number;
  maxKelvin!: number;

  // Others
  cacheKelvin!: number;

  // Updates
  colorBulbUpdateInProgress!: boolean;
  doColorBulbUpdate!: Subject<void>;

  constructor(private readonly platform: SwitchBotPlatform, private accessory: PlatformAccessory, public device: device & devicesConfig) {
    // default placeholders
    this.logs(device);
    this.scan(device);
    this.refreshRate(device);
    this.config(device);
    if (this.On === undefined) {
      this.On = false;
    } else {
      this.On = this.accessory.context.On;
    }
    this.Hue = 0;
    this.Brightness = 0;
    this.Saturation = 0;
    this.minKelvin = 2000;
    this.maxKelvin = 9000;
    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doColorBulbUpdate = new Subject();
    this.colorBulbUpdateInProgress = false;

    // Retrieve initial values and updateHomekit
    this.refreshStatus();

    // set accessory information
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.platform.Characteristic.Model, 'W1701100')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId!)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision(accessory, device))
      .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
      .updateValue(this.FirmwareRevision(accessory, device));

    // get the Lightbulb service if it exists, otherwise create a new Lightbulb service
    // you can create multiple services for each accessory
    (this.lightBulbService = accessory.getService(this.platform.Service.Lightbulb) || accessory.addService(this.platform.Service.Lightbulb)),
    `${accessory.displayName} Strip Light`;

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Outlet, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.lightBulbService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // handle on / off events using the On characteristic
    this.lightBulbService.getCharacteristic(this.platform.Characteristic.On).onSet(this.OnSet.bind(this));

    // handle Brightness events using the Brightness characteristic
    this.lightBulbService
      .getCharacteristic(this.platform.Characteristic.Brightness)
      .setProps({
        minStep: this.minStep(device),
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onGet(() => {
        return this.Brightness;
      })
      .onSet(this.BrightnessSet.bind(this));

    // handle Hue events using the Hue characteristic
    this.lightBulbService
      .getCharacteristic(this.platform.Characteristic.Hue)
      .setProps({
        minValue: 0,
        maxValue: 360,
        validValueRanges: [0, 360],
      })
      .onGet(() => {
        return this.Hue;
      })
      .onSet(this.HueSet.bind(this));

    // handle Hue events using the Hue characteristic
    this.lightBulbService
      .getCharacteristic(this.platform.Characteristic.Saturation)
      .setProps({
        minValue: 0,
        maxValue: 100,
        validValueRanges: [0, 100],
      })
      .onGet(() => {
        return this.Saturation;
      })
      .onSet(this.SaturationSet.bind(this));

    // Update Homekit
    this.updateHomeKitCharacteristics();

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.colorBulbUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus();
      });

    // Watch for Bulb change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doColorBulbUpdate
      .pipe(
        tap(() => {
          this.colorBulbUpdateInProgress = true;
        }),
        debounceTime(this.platform.config.options!.pushRate! * 1000),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges();
        } catch (e: any) {
          this.errorLog(`Strip Light: ${this.accessory.displayName} failed pushChanges`);
          if (this.deviceLogging.includes('debug')) {
            this.errorLog(`Strip Light: ${this.accessory.displayName} failed pushChanges,` + ` Error Message: ${JSON.stringify(e.message)}`);
          }
          this.apiError(e);
        }
        this.colorBulbUpdateInProgress = false;
      });
  }

  async parseStatus(): Promise<void> {
    if (this.SwitchToOpenAPI || !this.device.ble) {
      await this.openAPIparseStatus();
    } else {
      await this.BLEparseStatus();
    }
  }

  async BLEparseStatus(): Promise<void> {
    this.debugLog(`Strip Light: ${this.accessory.displayName} BLE parseStatus`);
    // State
    switch (this.state) {
      case 'on':
        this.On = true;
        break;
      default:
        this.On = false;
    }
    this.debugLog(`Strip Light: ${this.accessory.displayName} On: ${this.On}`);
  }

  async openAPIparseStatus(): Promise<void> {
    switch (this.power) {
      case 'on':
        this.On = true;
        break;
      default:
        this.On = false;
    }
    this.debugLog(`Strip Light: ${this.accessory.displayName} On: ${this.On}`);

    // Brightness
    this.Brightness = Number(this.brightness);
    this.debugLog(`Strip Light: ${this.accessory.displayName} Brightness: ${this.Brightness}`);

    // Color, Hue & Brightness
    if (this.color) {
      this.debugLog(`Strip Light: ${this.accessory.displayName} color: ${JSON.stringify(this.color)}`);
      const [red, green, blue] = this.color!.split(':');
      this.debugLog(`Strip Light: ${this.accessory.displayName} red: ${JSON.stringify(red)}`);
      this.debugLog(`Strip Light: ${this.accessory.displayName} green: ${JSON.stringify(green)}`);
      this.debugLog(`Strip Light: ${this.accessory.displayName} blue: ${JSON.stringify(blue)}`);

      const [hue, saturation] = rgb2hs(Number(red), Number(green), Number(blue));
      this.debugLog(`Strip Light: ${this.accessory.displayName} hs: ${JSON.stringify(rgb2hs(Number(red), Number(green), Number(blue)))}`);

      // Hue
      this.Hue = hue;
      this.debugLog(`Strip Light: ${this.accessory.displayName} Hue: ${this.Hue}`);

      // Saturation
      this.Saturation = saturation;
      this.debugLog(`Strip Light: ${this.accessory.displayName} Saturation: ${this.Saturation}`);
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
    this.debugLog(`Strip Light: ${this.accessory.displayName} BLE refreshStatus`);
    const switchbot = await this.platform.connectBLE();
    // Convert to BLE Address
    this.device.bleMac = this.device
      .deviceId!.match(/.{1,2}/g)!
      .join(':')
      .toLowerCase();
    this.debugLog(`Strip Light: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
    this.getCustomBLEAddress(switchbot);
    // Start to monitor advertisement packets
    if (switchbot !== false) {
      switchbot
        .startScan({
          model: 'r',
          id: this.device.bleMac,
        })
        .then(() => {
          // Set an event hander
          switchbot.onadvertisement = (ad: any) => {
            this.address = ad.address;
            if (this.deviceLogging.includes('debug')) {
              this.infoLog(this.address);
              this.infoLog(this.device.bleMac);
              this.infoLog(`Strip Light: ${this.accessory.displayName} BLE Address Found: ${this.address}`);
              this.infoLog(`Strip Light: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac}`);
            }
            this.errorLog(`Strip Light: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
            this.serviceData = ad.serviceData;
            //this.state = ad.serviceData.state;
            //this.delay = ad.serviceData.delay;
            //this.timer = ad.serviceData.timer;
            //this.syncUtcTime = ad.serviceData.syncUtcTime;
            //this.wifiRssi = ad.serviceData.wifiRssi;
            //this.overload = ad.serviceData.overload;
            //this.currentPower = ad.serviceData.currentPower;
            this.debugLog(`Strip Light: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
            /*this.debugLog(
              `Strip Light: ${this.accessory.displayName} state: ${ad.serviceData.state}, ` +
                `delay: ${ad.serviceData.delay}, timer: ${ad.serviceData.timer}, syncUtcTime: ${ad.serviceData.syncUtcTime} ` +
                `wifiRssi: ${ad.serviceData.wifiRssi}, overload: ${ad.serviceData.overload}, currentPower: ${ad.serviceData.currentPower}`,
            );*/

            if (this.serviceData) {
              this.connected = true;
              this.debugLog(`Strip Light: ${this.accessory.displayName} connected: ${this.connected}`);
            } else {
              this.connected = false;
              this.debugLog(`Strip Light: ${this.accessory.displayName} connected: ${this.connected}`);
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
            this.errorLog(`Strip Light: ${this.accessory.displayName} wasn't able to establish BLE Connection`);
            if (this.platform.config.credentials?.token) {
              this.warnLog(`Strip Light: ${this.accessory.displayName} Using OpenAPI Connection`);
              this.SwitchToOpenAPI = true;
              await this.openAPIRefreshStatus();
            }
          }
        })
        .catch(async (e: any) => {
          this.errorLog(`Strip Light: ${this.accessory.displayName} failed refreshStatus with BLE Connection`);
          if (this.deviceLogging.includes('debug')) {
            this.errorLog(
              `Strip Light: ${this.accessory.displayName} failed refreshStatus with BLE Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
            );
          }
          if (this.platform.config.credentials?.token) {
            this.warnLog(`Strip Light: ${this.accessory.displayName} Using OpenAPI Connection`);
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
      this.debugLog(`Strip Light: ${this.accessory.displayName} customBLEaddress: ${this.device.customBLEaddress}`);
      (async () => {
        // Start to monitor advertisement packets
        await switchbot.startScan({
          model: 'r',
        });
        // Set an event handler
        switchbot.onadvertisement = (ad: any) => {
          this.warnLog(`Strip Light: ${this.accessory.displayName} ad: ${JSON.stringify(ad, null, '  ')}`);
        };
        await switchbot.wait(10000);
        // Stop to monitor
        switchbot.stopScan();
      })();
    }
  }

  async BLEconnection(switchbot: any): Promise<void> {
    this.errorLog(`Strip Light: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`);
    if (this.platform.config.credentials?.token) {
      this.warnLog(`Strip Light: ${this.accessory.displayName} Using OpenAPI Connection`);
      this.SwitchToOpenAPI = true;
      await this.openAPIRefreshStatus();
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    try {
      const t = Date.now();
      const nonce = 'requestID';
      const data = this.platform.config.credentials?.token + t + nonce;
      const signTerm = crypto.createHmac('sha256', this.platform.config.credentials?.secret).update(Buffer.from(data, 'utf-8')).digest();
      const sign = signTerm.toString('base64');
      this.debugLog(`Strip Light: ${this.accessory.displayName} sign: ${sign}`);
      const options = {
        hostname: HostDomain,
        port: 443,
        path: `${DevicePath}/${this.device.deviceId}/status`,
        method: 'GET',
        headers: {
          Authorization: this.platform.config.credentials?.token,
          sign: sign,
          nonce: nonce,
          t: t,
          'Content-Type': 'application/json',
        },
      };
      const req = https.request(options, (res) => {
        this.debugLog(`Strip Light: ${this.accessory.displayName} statusCode: ${res.statusCode}`);
        let rawData = '';
        res.on('data', (d) => {
          rawData += d;
          this.debugLog(`Strip Light: ${this.accessory.displayName} d: ${d}`);
        });
        res.on('end', () => {
          try {
            this.deviceStatus = JSON.parse(rawData);
            this.debugLog(`Strip Light: ${this.accessory.displayName} refreshStatus: ${JSON.stringify(this.deviceStatus)}`);
            this.power = this.deviceStatus.body.power;
            this.color = this.deviceStatus.body.color;
            this.brightness = this.deviceStatus.body.brightness;
            this.parseStatus();
            this.updateHomeKitCharacteristics();
          } catch (e: any) {
            this.errorLog(`Strip Light: ${this.accessory.displayName} error message: ${e.message}`);
          }
        });
      });
      req.on('error', (e: any) => {
        this.errorLog(`Strip Light: ${this.accessory.displayName} error message: ${e.message}`);
      });
      req.end();
    } catch (e: any) {
      this.errorLog(`Strip Light: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection`);
      if (this.deviceLogging.includes('debug')) {
        this.errorLog(
          `Strip Light: ${this.accessory.displayName} failed refreshStatus with OpenAPI Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      this.apiError(e);
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * deviceType	      commandType	          Command	               command parameter	                     Description
   * Strip Light  -    "command"            "turnOn"                   "default"                =        set to ON state |
   * Strip Light  -    "command"           "turnOff"                   "default"                =        set to OFF state |
   * Strip Light  -    "command"            "toggle"                   "default"                =        toggle state |
   * Strip Light  -    "command"        "setBrightness"               "`{1-100}`"               =        set brightness |
   * Strip Light  -    "command"          "setColor"           "`"{0-255}:{0-255}:{0-255}"`"    =        set RGB color value |
   *
   */
  async pushChanges(): Promise<void> {
    try {
      if (this.On !== this.accessory.context.On) {
        // Make Push On request to the API
        const t = Date.now();
        const nonce = 'requestID';
        const data = this.platform.config.credentials?.token + t + nonce;
        const signTerm = crypto.createHmac('sha256', this.platform.config.credentials?.secret)
          .update(Buffer.from(data, 'utf-8'))
          .digest();
        const sign = signTerm.toString('base64');
        this.debugLog(`Strip Light: ${this.accessory.displayName} sign: ${sign}`);

        let command = '';
        if (this.On) {
          command = 'turnOn';
        } else {
          command = 'turnOff';
        }
        const body = JSON.stringify({
          'command': `${command}`,
          'parameter': 'default',
          'commandType': 'command',
        });
        this.infoLog(`Strip Light: ${this.accessory.displayName} Sending request to SwitchBot API. body: ${body},`);
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
          this.debugLog(`Strip Light: ${this.accessory.displayName} statusCode: ${res.statusCode}`);
          this.statusCode({ res });
          res.on('data', d => {
            this.debugLog(`Strip Light: ${this.accessory.displayName} d: ${d}`);
          });
        });
        req.on('error', (e: any) => {
          this.errorLog(`Strip Light: ${this.accessory.displayName} error message: ${e.message}`);
        });
        req.write(body);
        req.end();
        this.debugLog(`Strip Light: ${this.accessory.displayName} pushchanges: ${JSON.stringify(req)}`);
      }
      // Push Brightness Update
      if (this.On) {
        await this.pushBrightnessChanges();
      }

      // Push Hue & Saturation Update
      if (this.On) {
        await this.pushHueSaturationChanges();
      }
    } catch (e: any) {
      this.errorLog(`Strip Light: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection`);
      if (this.deviceLogging.includes('debug')) {
        this.errorLog(
          `Strip Light: ${this.accessory.displayName} failed pushChanges with OpenAPI Connection,` + ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      this.apiError(e);
    }
  }

  async pushHueSaturationChanges(): Promise<void> {
    try {
      if (this.Hue !== this.accessory.context.Hue || this.Saturation !== this.accessory.context.Saturation) {
        this.debugLog(`Strip Light: ${this.accessory.displayName} Hue: ${JSON.stringify(this.Hue)}`);
        this.debugLog(`Strip Light: ${this.accessory.displayName} Saturation: ${JSON.stringify(this.Saturation)}`);

        const [red, green, blue] = hs2rgb(Number(this.Hue), Number(this.Saturation));
        this.debugLog(`Strip Light: ${this.accessory.displayName} rgb: ${JSON.stringify([red, green, blue])}`);
        // Make Push On request to the API
        const t = Date.now();
        const nonce = 'requestID';
        const data = this.platform.config.credentials?.token + t + nonce;
        const signTerm = crypto.createHmac('sha256', this.platform.config.credentials?.secret)
          .update(Buffer.from(data, 'utf-8'))
          .digest();
        const sign = signTerm.toString('base64');
        this.debugLog(`Strip Light: ${this.accessory.displayName} sign: ${sign}`);
        const body = JSON.stringify({
          'command': 'setColor',
          'parameter': `${red}:${green}:${blue}`,
          'commandType': 'command',
        });
        this.infoLog(`Strip Light: ${this.accessory.displayName} Sending request to SwitchBot API. body: ${body},`);
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
          this.debugLog(`Strip Light: ${this.accessory.displayName} statusCode: ${res.statusCode}`);
          this.statusCode({ res });
          res.on('data', d => {
            this.debugLog(`Strip Light: ${this.accessory.displayName} d: ${d}`);
          });
        });
        req.on('error', (e: any) => {
          this.errorLog(`Strip Light: ${this.accessory.displayName} error message: ${e.message}`);
        });
        req.write(body);
        req.end();
        this.debugLog(`Strip Light: ${this.accessory.displayName} pushHueSaturationChanges: ${JSON.stringify(req)}`);
      } else {
        this.debugLog(
          `Strip Light: ${this.accessory.displayName} No Changes.` +
            `Hue: ${this.Hue}, HueCached: ${this.accessory.context.Hue}, Saturation: ${this.Saturation}, `
            +`SaturationCached: ${this.accessory.context.Saturation}`,
        );
      }
    } catch (e: any) {
      this.errorLog(`Strip Light: ${this.accessory.displayName} failed pushHueSaturationChanges with OpenAPI Connection`);
      if (this.deviceLogging.includes('debug')) {
        this.errorLog(
          `Strip Light: ${this.accessory.displayName} failed pushHueSaturationChanges with OpenAPI Connection,`
          + ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      this.apiError(e);
    }
  }

  async pushBrightnessChanges(): Promise<void> {
    try {
      if (this.Brightness !== this.accessory.context.Brightness) {
        // Make Push On request to the API
        const t = Date.now();
        const nonce = 'requestID';
        const data = this.platform.config.credentials?.token + t + nonce;
        const signTerm = crypto.createHmac('sha256', this.platform.config.credentials?.secret)
          .update(Buffer.from(data, 'utf-8'))
          .digest();
        const sign = signTerm.toString('base64');
        this.debugLog(`Strip Light: ${this.accessory.displayName} sign: ${sign}`);
        const body = JSON.stringify({
          'command': 'setBrightness',
          'parameter': `${this.Brightness}`,
          'commandType': 'command',
        });
        this.infoLog(`Strip Light: ${this.accessory.displayName} Sending request to SwitchBot API. body: ${body},`);
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
          this.debugLog(`Strip Light: ${this.accessory.displayName} statusCode: ${res.statusCode}`);
          this.statusCode({ res });
          res.on('data', d => {
            this.debugLog(`Strip Light: ${this.accessory.displayName} d: ${d}`);
          });
        });
        req.on('error', (e: any) => {
          this.errorLog(`Strip Light: ${this.accessory.displayName} error message: ${e.message}`);
        });
        req.write(body);
        req.end();
        this.debugLog(`Strip Light: ${this.accessory.displayName} pushBrightnessChanges: ${JSON.stringify(req)}`);
      } else {
        this.debugLog(
          `Strip Light: ${this.accessory.displayName} No Changes.` + `Brightness: ${this.Brightness}, `
          +`BrightnessCached: ${this.accessory.context.Brightness}`,
        );
      }
    } catch (e: any) {
      this.errorLog(`Strip Light: ${this.accessory.displayName} failed pushBrightnessChanges with OpenAPI Connection`);
      if (this.deviceLogging.includes('debug')) {
        this.errorLog(
          `Strip Light: ${this.accessory.displayName} failed pushBrightnessChanges with OpenAPI Connection,`
          + ` Error Message: ${JSON.stringify(e.message)}`,
        );
      }
      this.apiError(e);
    }
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    if (this.On === undefined) {
      this.debugLog(`Strip Light: ${this.accessory.displayName} On: ${this.On}`);
    } else {
      this.accessory.context.On = this.On;
      this.lightBulbService.updateCharacteristic(this.platform.Characteristic.On, this.On);
      this.debugLog(`Strip Light: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
    }
    if (this.Brightness === undefined) {
      this.debugLog(`Strip Light: ${this.accessory.displayName} Brightness: ${this.Brightness}`);
    } else {
      this.accessory.context.Brightness = this.Brightness;
      this.lightBulbService.updateCharacteristic(this.platform.Characteristic.Brightness, this.Brightness);
      this.debugLog(`Strip Light: ${this.accessory.displayName} updateCharacteristic Brightness: ${this.Brightness}`);
    }
    if (this.Hue === undefined) {
      this.debugLog(`Strip Light: ${this.accessory.displayName} Hue: ${this.Hue}`);
    } else {
      this.accessory.context.Hue = this.Hue;
      this.lightBulbService.updateCharacteristic(this.platform.Characteristic.Hue, this.Hue);
      this.debugLog(`Strip Light: ${this.accessory.displayName} updateCharacteristic Hue: ${this.Hue}`);
    }
    if (this.Saturation === undefined) {
      this.debugLog(`Strip Light: ${this.accessory.displayName} Saturation: ${this.Saturation}`);
    } else {
      this.accessory.context.Saturation = this.Saturation;
      this.lightBulbService.updateCharacteristic(this.platform.Characteristic.Saturation, this.Saturation);
      this.debugLog(`Strip Light: ${this.accessory.displayName} updateCharacteristic Saturation: ${this.Saturation}`);
    }
  }

  apiError(e: any): void {
    this.lightBulbService.updateCharacteristic(this.platform.Characteristic.On, e);
    this.lightBulbService.updateCharacteristic(this.platform.Characteristic.Hue, e);
    this.lightBulbService.updateCharacteristic(this.platform.Characteristic.Brightness, e);
    this.lightBulbService.updateCharacteristic(this.platform.Characteristic.Saturation, e);
    //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  async statusCode({ res }: { res: IncomingMessage }): Promise<void> {
    switch (res.statusCode) {
      case 151:
        this.errorLog(`Strip Light: ${this.accessory.displayName} Command not supported by this device type.`);
        break;
      case 152:
        this.errorLog(`Strip Light: ${this.accessory.displayName} Device not found.`);
        break;
      case 160:
        this.errorLog(`Strip Light: ${this.accessory.displayName} Command is not supported.`);
        break;
      case 161:
        this.errorLog(`Strip Light: ${this.accessory.displayName} Device is offline.`);
        this.offlineOff();
        break;
      case 171:
        this.errorLog(`Strip Light: ${this.accessory.displayName} is offline. Hub: ${this.device.hubDeviceId}`);
        this.offlineOff();
        break;
      case 190:
        this.errorLog(
          `Strip Light: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
            ` Or command: ${JSON.stringify(res)} format is invalid`,
        );
        break;
      case 100:
        if (this.platform.debugMode) {
          this.debugLog(`Strip Light: ${this.accessory.displayName} Command successfully sent.`);
        }
        break;
      default:
        if (this.platform.debugMode) {
          this.debugLog(`Strip Light: ${this.accessory.displayName} Unknown statusCode.`);
        }
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      this.On = false;
      this.lightBulbService.getCharacteristic(this.platform.Characteristic.On).updateValue(this.On);
    }
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`Strip Light: ${this.accessory.displayName} On: ${value}`);

    this.On = value;
    this.doColorBulbUpdate.next();
  }

  /**
   * Handle requests to set the value of the "Brightness" characteristic
   */
  async BrightnessSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`Strip Light: ${this.accessory.displayName} Brightness: ${value}`);

    this.Brightness = value;
    this.doColorBulbUpdate.next();
  }

  /**
   * Handle requests to set the value of the "Hue" characteristic
   */
  async HueSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`Strip Light: ${this.accessory.displayName} Hue: ${value}`);

    this.Hue = value;
    this.doColorBulbUpdate.next();
  }

  /**
   * Handle requests to set the value of the "Saturation" characteristic
   */
  async SaturationSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`Strip Light: ${this.accessory.displayName} Saturation: ${value}`);

    this.Saturation = value;
    this.doColorBulbUpdate.next();
  }

  async config(device: device & devicesConfig): Promise<void> {
    let config = {};
    if (device.colorbulb) {
      config = device.colorbulb;
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
    if (device.offline !== undefined) {
      config['offline'] = device.offline;
    }
    if (Object.entries(config).length !== 0) {
      this.infoLog(`Strip Light: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
    }
  }

  async refreshRate(device: device & devicesConfig): Promise<void> {
    if (device.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = device.refreshRate;
      this.debugLog(`Strip Light: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
    } else if (this.platform.config.options!.refreshRate) {
      this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options!.refreshRate;
      this.debugLog(`Strip Light: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
    }
  }

  async scan(device: device & devicesConfig): Promise<void> {
    if (device.scanDuration) {
      this.scanDuration = this.accessory.context.scanDuration = device.scanDuration;
      if (device.ble) {
        this.debugLog(`Bot: ${this.accessory.displayName} Using Device Config scanDuration: ${this.scanDuration}`);
      }
    } else {
      this.scanDuration = this.accessory.context.scanDuration = 1;
      if (this.device.ble) {
        this.debugLog(`Bot: ${this.accessory.displayName} Using Default scanDuration: ${this.scanDuration}`);
      }
    }
  }

  async logs(device: device & devicesConfig): Promise<void> {
    if (this.platform.debugMode) {
      this.deviceLogging = this.accessory.context.logging = 'debugMode';
      this.debugLog(`Strip Light: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
    } else if (device.logging) {
      this.deviceLogging = this.accessory.context.logging = device.logging;
      this.debugLog(`Strip Light: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
    } else if (this.platform.config.options?.logging) {
      this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
      this.debugLog(`Strip Light: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
    } else {
      this.deviceLogging = this.accessory.context.logging = 'standard';
      this.debugLog(`Strip Light: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
    }
  }

  FirmwareRevision(accessory: PlatformAccessory<Context>, device: device & devicesConfig): CharacteristicValue {
    let FirmwareRevision: string;
    this.debugLog(`Strip Light: ${this.accessory.displayName} accessory.context.FirmwareRevision: ${accessory.context.FirmwareRevision}`);
    this.debugLog(`Strip Light: ${this.accessory.displayName} device.firmware: ${device.firmware}`);
    this.debugLog(`Strip Light: ${this.accessory.displayName} this.platform.version: ${this.platform.version}`);
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
    if (device.colorbulb?.set_minStep) {
      this.set_minStep = device.colorbulb?.set_minStep;
    } else {
      this.set_minStep = 1;
    }
    return this.set_minStep;
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
