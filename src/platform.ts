/* Copyright(C) 2017-2023, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * platform.ts: @switchbot/homebridge-switchbot platform class.
 */
import { API, DynamicPlatformPlugin, Logging, PlatformAccessory } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME, irdevice, device, SwitchBotPlatformConfig, devicesConfig, irDevicesConfig, Devices } from './settings.js';
import { Bot } from './device/bot.js';
import { Plug } from './device/plug.js';
import { Lock } from './device/lock.js';
import { Meter } from './device/meter.js';
import { Motion } from './device/motion.js';
import { Hub } from './device/hub.js';
import { Contact } from './device/contact.js';
import { Curtain } from './device/curtain.js';
import { IOSensor } from './device/iosensor.js';
import { MeterPlus } from './device/meterplus.js';
import { ColorBulb } from './device/colorbulb.js';
import { CeilingLight } from './device/ceilinglight.js';
import { StripLight } from './device/lightstrip.js';
import { Humidifier } from './device/humidifier.js';
import { RobotVacuumCleaner } from './device/robotvacuumcleaner.js';
import { TV } from './irdevice/tv.js';
import { Fan } from './irdevice/fan.js';
import { Light } from './irdevice/light.js';
import { Others } from './irdevice/other.js';
import { Camera } from './irdevice/camera.js';
import { BlindTilt } from './device/blindtilt.js';
import { AirPurifier } from './irdevice/airpurifier.js';
import { WaterHeater } from './irdevice/waterheater.js';
import { VacuumCleaner } from './irdevice/vacuumcleaner.js';
import { AirConditioner } from './irdevice/airconditioner.js';
import * as http from 'http';
import { Buffer } from 'buffer';
import { request } from 'undici';
import { MqttClient } from 'mqtt';
import { queueScheduler } from 'rxjs';
import fakegato from 'fakegato-history';
import asyncmqtt from 'async-mqtt';
import crypto, { randomUUID } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import hbLib from 'homebridge-lib';



/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class SwitchBotPlatform implements DynamicPlatformPlugin {
  public accessories: PlatformAccessory[];
  public readonly api: API;
  public readonly log: Logging;

  version!: string;
  Logging?: string;
  debugMode!: boolean;
  platformConfig!: SwitchBotPlatformConfig['options'];
  platformLogging!: SwitchBotPlatformConfig['logging'];
  config!: SwitchBotPlatformConfig;

  webhookEventListener: http.Server | null = null;
  mqttClient: MqttClient | null = null;

  public readonly fakegatoAPI: any;
  public readonly eve: any;
  public readonly webhookEventHandler: { [x: string]: (context: { [x: string]: any }) => void } = {};

  constructor(
    log: Logging,
    config: SwitchBotPlatformConfig,
    api: API,
  ) {
    this.accessories = [];
    this.api = api;
    this.log = log;
    // only load if configured
    if (!config) {
      return;
    }

    // Plugin options into our config variables.
    this.config = {
      platform: 'SwitchBotPlatform',
      name: config.name,
      credentials: config.credentials as object,
      options: config.options as object,
    };
    this.platformLogging = this.config.options?.logging ?? 'standard';
    this.platformConfigOptions();
    this.platformLogs();
    this.getVersion();
    this.debugLog(`Finished initializing platform: ${config.name}`);

    // verify the config
    try {
      this.verifyConfig();
      this.debugLog('Config OK');
    } catch (e: any) {
      this.errorLog(`Verify Config, Error Message: ${e.message}, Submit Bugs Here: ` + 'https://tinyurl.com/SwitchBotBug');
      this.debugErrorLog(`Verify Config, Error: ${e}`);
      return;
    }

    // import fakegato-history module and EVE characteristics
    const { EveHomeKitTypes } = hbLib;
    this.fakegatoAPI = fakegato(api);
    this.eve = new EveHomeKitTypes(api);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', async () => {
      this.debugLog('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      try {
        if (this.config.credentials?.openToken && !this.config.credentials.token) {
          await this.updateToken();
        } else if (this.config.credentials?.token && !this.config.credentials?.secret) {
          // eslint-disable-next-line no-useless-escape
          this.errorLog('"secret" config is not populated, you must populate then please restart Homebridge.');
        } else {
          this.discoverDevices();
        }
      } catch (e: any) {
        this.errorLog(`Failed to Discover, Error Message: ${e.message}, Submit Bugs Here: ` + 'https://tinyurl.com/SwitchBotBug');
        this.debugErrorLog(`Failed to Discover, Error: ${e}`);
      }
    });

    this.setupMqtt();
    this.setupwebhook();
  }

  async setupMqtt(): Promise<void> {
    if (this.config.options?.mqttURL) {
      try {
        const { connectAsync } = asyncmqtt;
        this.mqttClient = await connectAsync(this.config.options?.mqttURL, this.config.options.mqttOptions || {});
        this.debugLog('MQTT connection has been established successfully.');
        this.mqttClient.on('error', (e: Error) => {
          this.errorLog(`Failed to publish MQTT messages. ${e}`);
        });
        if (!this.config.options?.webhookURL) {
          // receive webhook events via MQTT
          this.infoLog(`Webhook is configured to be received through ${this.config.options.mqttURL}/homebridge-switchbot/webhook.`);
          this.mqttClient.subscribe('homebridge-switchbot/webhook/+');
          this.mqttClient.on('message', async (topic: string, message) => {
            try {
              this.debugLog(`Received Webhook via MQTT: ${topic}=${message}`);
              const context = JSON.parse(message.toString());
              await this.webhookEventHandler[context.deviceMac]?.(context);
            } catch (e: any) {
              this.errorLog(`Failed to handle webhook event. Error:${e}`);
            }
          });
        }
      } catch (e) {
        this.mqttClient = null;
        this.errorLog(`Failed to establish MQTT connection. ${e}`);
      }
    }
  }

  async setupwebhook() {
    //webhook configuration
    if (this.config.options?.webhookURL) {
      const url = this.config.options?.webhookURL;

      try {
        const xurl = new URL(url);
        const port = Number(xurl.port);
        const path = xurl.pathname;
        this.webhookEventListener = http.createServer((request: http.IncomingMessage, response: http.ServerResponse) => {
          try {
            if (request.url === path && request.method === 'POST') {
              request.on('data', async (data) => {
                try {
                  const body = JSON.parse(data);
                  this.debugLog(`Received Webhook: ${JSON.stringify(body)}`);
                  if (this.config.options?.mqttURL) {
                    const mac = body.context.deviceMac
                      ?.toLowerCase()
                      .match(/[\s\S]{1,2}/g)
                      ?.join(':');
                    const options = this.config.options?.mqttPubOptions || {};
                    this.mqttClient?.publish(`homebridge-switchbot/webhook/${mac}`, `${JSON.stringify(body.context)}`, options);
                  }
                  await this.webhookEventHandler[body.context.deviceMac]?.(body.context);
                } catch (e: any) {
                  this.errorLog(`Failed to handle webhook event. Error:${e}`);
                }
              });
              response.writeHead(200, { 'Content-Type': 'text/plain' });
              response.end('OK');
            }
            // else {
            //   response.writeHead(403, {'Content-Type': 'text/plain'});
            //   response.end(`NG`);
            // }
          } catch (e: any) {
            this.errorLog(`Failed to handle webhook event. Error:${e}`);
          }
        }).listen(port ? port : 80);
      } catch (e: any) {
        this.errorLog(`Failed to create webhook listener. Error:${e.message}`);
        return;
      }

      try {
        const { body, statusCode } = await request(
          'https://api.switch-bot.com/v1.1/webhook/setupWebhook', {
            method: 'POST',
            headers: this.generateHeaders(),
            body: JSON.stringify({
              'action': 'setupWebhook',
              'url': url,
              'deviceList': 'ALL',
            }),
          });
        const response: any = await body.json();
        this.debugLog(`setupWebhook: url:${url}`);
        this.debugLog(`setupWebhook: body:${JSON.stringify(response)}`);
        this.debugLog(`setupWebhook: statusCode:${statusCode}`);
        if (statusCode !== 200 || response?.statusCode !== 100) {
          this.errorLog(`Failed to configure webhook. Existing webhook well be overridden. HTTP:${statusCode} API:${response?.statusCode} `
            + `message:${response?.message}`);
        }
      } catch (e: any) {
        this.errorLog(`Failed to configure webhook. Error: ${e.message}`);
      }

      try {
        const { body, statusCode } = await request(
          'https://api.switch-bot.com/v1.1/webhook/updateWebhook', {
            method: 'POST',
            headers: this.generateHeaders(),
            body: JSON.stringify({
              'action': 'updateWebhook',
              'config': {
                'url': url,
                'enable': true,
              },
            }),
          });
        const response: any = await body.json();
        this.debugLog(`updateWebhook: url:${url}`);
        this.debugLog(`updateWebhook: body:${JSON.stringify(response)}`);
        this.debugLog(`updateWebhook: statusCode:${statusCode}`);
        if (statusCode !== 200 || response?.statusCode !== 100) {
          this.errorLog(`Failed to update webhook. HTTP:${statusCode} API:${response?.statusCode} message:${response?.message}`);
        }
      } catch (e: any) {
        this.errorLog(`Failed to update webhook. Error:${e.message}`);
      }

      try {
        const { body, statusCode } = await request(
          'https://api.switch-bot.com/v1.1/webhook/queryWebhook', {
            method: 'POST',
            headers: this.generateHeaders(),
            body: JSON.stringify({
              'action': 'queryUrl',
            }),
          });
        const response: any = await body.json();
        this.debugLog(`queryWebhook: body:${JSON.stringify(response)}`);
        this.debugLog(`queryWebhook: statusCode:${statusCode}`);
        if (statusCode !== 200 || response?.statusCode !== 100) {
          this.errorLog(`Failed to query webhook. HTTP:${statusCode} API:${response?.statusCode} message:${response?.message}`);
        } else {
          this.infoLog(`Listening webhook on ${response?.body?.urls[0]}`);
        }
      } catch (e: any) {
        this.errorLog(`Failed to query webhook. Error:${e}`);
      }

      this.api.on('shutdown', async () => {
        try {
          const { body, statusCode } = await request(
            'https://api.switch-bot.com/v1.1/webhook/deleteWebhook', {
              method: 'POST',
              headers: this.generateHeaders(),
              body: JSON.stringify({
                'action': 'deleteWebhook',
                'url': url,
              }),
            });
          const response: any = await body.json();
          this.debugLog(`deleteWebhook: url:${url}`);
          this.debugLog(`deleteWebhook: body:${JSON.stringify(response)}`);
          this.debugLog(`deleteWebhook: statusCode:${statusCode}`);
          if (statusCode !== 200 || response?.statusCode !== 100) {
            this.errorLog(`Failed to delete webhook. HTTP:${statusCode} API:${response?.statusCode} message:${response?.message}`);
          } else {
            this.infoLog('Unregistered webhook to close listening.');
          }
        } catch (e: any) {
          this.errorLog(`Failed to delete webhook. Error:${e.message}`);
        }
      });
    }
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.debugLog(`Loading accessory from cache: ${accessory.displayName}`);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * Verify the config passed to the plugin is valid
   */
  async verifyConfig() {
    this.debugLog('Verifying Config');
    this.config = this.config || {};
    this.config.options = this.config.options || {};

    const platformConfig = {};
    if (this.config.options.logging) {
      platformConfig['logging'] = this.config.options.logging;
    }
    if (this.config.options.logging && this.config.options.refreshRate) {
      platformConfig['refreshRate'] = this.config.options.refreshRate;
    }
    if (this.config.options.logging && this.config.options.pushRate) {
      platformConfig['pushRate'] = this.config.options.pushRate;
    }
    if (Object.entries(platformConfig).length !== 0) {
      this.debugWarnLog(`Platform Config: ${JSON.stringify(platformConfig)}`);
    }

    if (this.config.options) {
      // Device Config
      if (this.config.options.devices) {
        for (const deviceConfig of this.config.options.devices) {
          if (!deviceConfig.hide_device) {
            if (!deviceConfig.deviceId) {
              throw new Error('The devices config section is missing the *Device ID* in the config. Please check your config.');
            }
            if (!deviceConfig.configDeviceType && deviceConfig.connectionType) {
              throw new Error('The devices config section is missing the *Device Type* in the config. Please check your config.');
            }
          }
        }
      }

      // IR Device Config
      if (this.config.options.irdevices) {
        for (const irDeviceConfig of this.config.options.irdevices) {
          if (!irDeviceConfig.hide_device) {
            if (!irDeviceConfig.deviceId) {
              this.errorLog('The devices config section is missing the *Device ID* in the config. Please check your config.');
            }
            if (!irDeviceConfig.deviceId && !irDeviceConfig.configRemoteType) {
              this.errorLog('The devices config section is missing the *Device Type* in the config. Please check your config.');
            }
          }
        }
      }
    }

    if (this.config.options!.refreshRate! < 5) {
      throw new Error('Refresh Rate must be above 5 (5 seconds).');
    }

    if (!this.config.options.refreshRate) {
      // default 120 seconds (2 minutes)
      this.config.options!.refreshRate! = 120;
      this.debugWarnLog('Using Default Refresh Rate (2 minutes).');
    }

    if (!this.config.options.pushRate) {
      // default 100 milliseconds
      this.config.options!.pushRate! = 0.1;
      this.debugWarnLog('Using Default Push Rate.');
    }

    if (!this.config.credentials && !this.config.options) {
      this.debugWarnLog('Missing Credentials');
    } else if (this.config.credentials && !this.config.credentials.notice) {
      if (!this.config.credentials?.token) {
        this.debugErrorLog('Missing token');
        this.debugWarnLog('Cloud Enabled SwitchBot Devices & IR Devices will not work');
      }
      if (this.config.credentials?.token) {
        if (!this.config.credentials?.secret) {
          this.debugErrorLog('Missing secret');
          this.debugWarnLog('Cloud Enabled SwitchBot Devices & IR Devices will not work');
        }
      }
    }
  }

  /**
   * The openToken was old config.
   * This method saves the openToken as the token in the config.json file
   * @param this.config.credentials.openToken
   */
  async updateToken() {
    try {
      // check the new token was provided
      if (!this.config.credentials?.openToken) {
        throw new Error('New token not provided');
      }

      // load in the current config
      const currentConfig = JSON.parse(readFileSync(this.api.user.configPath(), 'utf8'));

      // check the platforms section is an array before we do array things on it
      if (!Array.isArray(currentConfig.platforms)) {
        throw new Error('Cannot find platforms array in config');
      }

      // find this plugins current config
      const pluginConfig = currentConfig.platforms.find((x: { platform: string }) => x.platform === PLATFORM_NAME);

      if (!pluginConfig) {
        throw new Error(`Cannot find config for ${PLATFORM_NAME} in platforms array`);
      }

      // check the .credentials is an object before doing object things with it
      if (typeof pluginConfig.credentials !== 'object') {
        throw new Error('pluginConfig.credentials is not an object');
      }
      // Move openToken to token
      if (!this.config.credentials.secret) {
        // eslint-disable-next-line no-useless-escape, max-len
        this.warnLog(
          'This plugin has been updated to use OpenAPI v1.1, config is set with openToken, "openToken" cconfig has been moved to the "token" config',
        );
        // eslint-disable-next-line no-useless-escape
        this.errorLog('"secret" config is not populated, you must populate then please restart Homebridge.');
      } else {
        // eslint-disable-next-line no-useless-escape, max-len
        this.warnLog(
          'This plugin has been updated to use OpenAPI v1.1, config is set with openToken, '
          + '"openToken" config has been moved to the "token" config, please restart Homebridge.',
        );
      }

      // set the refresh token
      pluginConfig.credentials.token = this.config.credentials?.openToken;
      if (pluginConfig.credentials.token) {
        pluginConfig.credentials.openToken = undefined;
      }

      this.debugWarnLog(`token: ${pluginConfig.credentials.token}`);

      // save the config, ensuring we maintain pretty json
      writeFileSync(this.api.user.configPath(), JSON.stringify(currentConfig, null, 4));
      this.verifyConfig();
    } catch (e: any) {
      this.errorLog(`Update Token: ${e}`);
    }
  }

  generateHeaders = () => {
    const t = `${Date.now()}`;
    const nonce = randomUUID();
    const data = this.config.credentials?.token + t + nonce;
    const signTerm = crypto
      .createHmac('sha256', this.config.credentials?.secret)
      .update(Buffer.from(data, 'utf-8'))
      .digest();
    const sign = signTerm.toString('base64');

    return {
      Authorization: this.config.credentials?.token,
      sign: sign,
      nonce: nonce,
      t: t,
      'Content-Type': 'application/json',
    };
  };

  /**
   * this method discovers devices
   *
      const t = `${Date.now()}`;
      const nonce = 'requestID';
      const data = this.config.credentials?.token + t + nonce;
      const signTerm = crypto.createHmac('sha256', this.config.credentials?.secret).update(Buffer.from(data, 'utf-8')).digest();
      const sign = signTerm.toString('base64');
   */
  async discoverDevices() {
    if (this.config.credentials?.token) {
      try {
        const { body, statusCode } = await request(Devices, {
          headers: this.generateHeaders(),
        });
        this.debugWarnLog(`statusCode: ${statusCode}`);
        const devicesAPI: any = await body.json();
        this.debugWarnLog(`devicesAPI: ${JSON.stringify(devicesAPI)}`);
        this.debugWarnLog(`devicesAPI Body: ${JSON.stringify(devicesAPI.body)}`);
        this.debugWarnLog(`devicesAPI StatusCode: ${devicesAPI.statusCode}`);
        if ((statusCode === 200 || statusCode === 100) && (devicesAPI.statusCode === 200 || devicesAPI.statusCode === 100)) {
          this.debugErrorLog(`statusCode: ${statusCode} & devicesAPI StatusCode: ${devicesAPI.statusCode}`);
          // SwitchBot Devices
          const deviceLists = devicesAPI.body.deviceList;
          this.debugWarnLog(`DeviceLists: ${JSON.stringify(deviceLists)}`);
          this.debugWarnLog(`DeviceLists Length: ${deviceLists.length}`);
          if (!this.config.options?.devices) {
            this.debugLog(`SwitchBot Device Config Not Set: ${JSON.stringify(this.config.options?.devices)}`);
            if (deviceLists.length === 0) {
              this.debugLog(`SwitchBot API Currently Doesn't Have Any Devices With Cloud Services Enabled: ${JSON.stringify(devicesAPI.body)}`);
            } else {
              const devices = deviceLists.map((v: any) => v);
              for (const device of devices) {
                if (device.deviceType) {
                  if (device.configDeviceName) {
                    device.deviceName = device.configDeviceName;
                  }
                  this.createDevice(device);
                }
              }
            }
          } else if (this.config.credentials?.token && this.config.options.devices) {
            this.debugLog(`SwitchBot Device Config Set: ${JSON.stringify(this.config.options?.devices)}`);
            if (deviceLists.length === 0) {
              this.debugLog(`SwitchBot API Currently Doesn't Have Any Devices With Cloud Services Enabled: ${JSON.stringify(devicesAPI.body)}`);
            } else {
              const deviceConfigs = this.config.options?.devices;

              const mergeBydeviceId = (a1: { deviceId: string }[], a2: any[]) =>
                a1.map((itm: { deviceId: string }) => ({
                  ...a2.find(
                    (item: { deviceId: string }) =>
                      item.deviceId.toUpperCase().replace(/[^A-Z0-9]+/g, '') === itm.deviceId.toUpperCase().replace(/[^A-Z0-9]+/g, '') && item,
                  ),
                  ...itm,
                }));

              const devices = mergeBydeviceId(deviceLists, deviceConfigs);
              this.debugLog(`SwitchBot Devices: ${JSON.stringify(devices)}`);
              for (const device of devices) {
                if (!device.deviceType) {
                  device.deviceType = device.configDeviceType;
                  this.errorLog(`API has displaying no deviceType: ${device.deviceType}, So using configDeviceType: ${device.configDeviceType}`);
                }
                if (device.deviceType) {
                  if (device.configDeviceName) {
                    device.deviceName = device.configDeviceName;
                  }
                  this.createDevice(device);
                }
              }
            }
          } else {
            this.errorLog('SwitchBot Token Supplied, Issue with Auth.');
          }
          if (devicesAPI.body.deviceList.length !== 0) {
            this.infoLog(`Total SwitchBot Devices Found: ${devicesAPI.body.deviceList.length}`);
          } else {
            this.debugLog(`Total SwitchBot Devices Found: ${devicesAPI.body.deviceList.length}`);
          }

          // IR Devices
          const irDeviceLists = devicesAPI.body.infraredRemoteList;
          if (!this.config.options?.irdevices) {
            this.debugLog(`IR Device Config Not Set: ${JSON.stringify(this.config.options?.irdevices)}`);
            const devices = irDeviceLists.map((v: any) => v);
            for (const device of devices) {
              if (device.remoteType) {
                this.createIRDevice(device);
              }
            }
          } else {
            this.debugLog(`IR Device Config Set: ${JSON.stringify(this.config.options?.irdevices)}`);
            const irDeviceConfig = this.config.options?.irdevices;

            const mergeIRBydeviceId = (a1: { deviceId: string }[], a2: any[]) =>
              a1.map((itm: { deviceId: string }) => ({
                ...a2.find(
                  (item: { deviceId: string }) =>
                    item.deviceId.toUpperCase().replace(/[^A-Z0-9]+/g, '') === itm.deviceId.toUpperCase().replace(/[^A-Z0-9]+/g, '') && item,
                ),
                ...itm,
              }));

            const devices = mergeIRBydeviceId(irDeviceLists, irDeviceConfig);
            this.debugLog(`IR Devices: ${JSON.stringify(devices)}`);
            for (const device of devices) {
              this.createIRDevice(device);
            }
          }
          if (devicesAPI.body.infraredRemoteList.length !== 0) {
            this.infoLog(`Total IR Devices Found: ${devicesAPI.body.infraredRemoteList.length}`);
          } else {
            this.debugLog(`Total IR Devices Found: ${devicesAPI.body.infraredRemoteList.length}`);
          }
        } else {
          this.statusCode(statusCode);
          this.statusCode(devicesAPI.statusCode);
        }
      } catch (e: any) {
        this.debugErrorLog(
          `Failed to Discover Devices, Error Message: ${JSON.stringify(e.message)}, Submit Bugs Here: ` + 'https://tinyurl.com/SwitchBotBug',
        );
        this.debugErrorLog(`Failed to Discover Devices, Error: ${e}`);
      }
    } else if (!this.config.credentials?.token && this.config.options?.devices) {
      this.debugLog(`SwitchBot Device Manual Config Set: ${JSON.stringify(this.config.options?.devices)}`);
      const deviceConfigs = this.config.options?.devices;
      const devices = deviceConfigs.map((v: any) => v);
      for (const device of devices) {
        device.deviceType = device.configDeviceType;
        device.deviceName = device.configDeviceName;
        if (device.deviceType) {
          this.createDevice(device);
        }
      }
    } else {
      this.errorLog('Neither SwitchBot Token or Device Config are not set.');
    }
  }

  private createDevice(device: device & devicesConfig) {
    switch (device.deviceType!) {
      case 'Humidifier':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createHumidifier(device);
        break;
      case 'Hub Mini':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        break;
      case 'Hub Plus':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        break;
      case 'Hub 2':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createHub2(device);
        break;
      case 'Bot':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createBot(device);
        break;
      case 'Meter':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createMeter(device);
        break;
      case 'MeterPlus':
      case 'Meter Plus (JP)':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createMeterPlus(device);
        break;
      case 'WoIOSensor':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createIOSensor(device);
        break;
      case 'Motion Sensor':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createMotion(device);
        break;
      case 'Contact Sensor':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createContact(device);
        break;
      case 'Curtain':
      case 'Curtain3':
        this.debugLog(`Discovered ${device.deviceType} ${device.deviceName}: ${device.deviceId}`);
        this.createCurtain(device);
        break;
      case 'Blind Tilt':
        this.debugLog(`Discovered ${device.deviceType} ${device.deviceName}: ${device.deviceId}`);
        this.createBlindTilt(device);
        break;
      case 'Plug':
      case 'Plug Mini (US)':
      case 'Plug Mini (JP)':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createPlug(device);
        break;
      case 'Smart Lock':
      case 'Smart Lock Pro':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createLock(device);
        break;
      case 'Color Bulb':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createColorBulb(device);
        break;
      case 'WoSweeper':
      case 'WoSweeperMini':
      case 'Robot Vacuum Cleaner S1':
      case 'Robot Vacuum Cleaner S1 Plus':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createRobotVacuumCleaner(device);
        break;
      case 'Ceiling Light':
      case 'Ceiling Light Pro':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createCeilingLight(device);
        break;
      case 'Strip Light':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createStripLight(device);
        break;
      case 'Indoor Cam':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.warnLog(`Device: ${device.deviceName} with Device Type: ${device.deviceType}, is currently not supported.`);
        break;
      case 'Remote':
        this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId} is Not Supported.`);
        break;
      default:
        this.warnLog(`Device: ${device.deviceName} with Device Type: ${device.deviceType}, is currently not supported.`);
        // eslint-disable-next-line max-len
        this.warnLog('Submit Feature Requests Here: ' + 'https://tinyurl.com/SwitchBotFeatureRequest');
    }
  }

  private createIRDevice(device: irdevice & devicesConfig) {
    if (device.connectionType === undefined) {
      device.connectionType = 'OpenAPI';
    }
    switch (device.remoteType) {
      case 'TV':
      case 'DIY TV':
      case 'Projector':
      case 'DIY Projector':
      case 'Set Top Box':
      case 'DIY Set Top Box':
      case 'IPTV':
      case 'DIY IPTV':
      case 'DVD':
      case 'DIY DVD':
      case 'Speaker':
      case 'DIY Speaker':
        this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        if (device.external === undefined) {
          device.external = true;
          this.createTV(device);
        } else {
          this.createTV(device);
        }
        break;
      case 'Fan':
      case 'DIY Fan':
        this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createFan(device);
        break;
      case 'Air Conditioner':
      case 'DIY Air Conditioner':
        this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createAirConditioner(device);
        break;
      case 'Light':
      case 'DIY Light':
        this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createLight(device);
        break;
      case 'Air Purifier':
      case 'DIY Air Purifier':
        this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createAirPurifier(device);
        break;
      case 'Water Heater':
      case 'DIY Water Heater':
        this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createWaterHeater(device);
        break;
      case 'Vacuum Cleaner':
      case 'DIY Vacuum Cleaner':
        this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createVacuumCleaner(device);
        break;
      case 'Camera':
      case 'DIY Camera':
        this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createCamera(device);
        break;
      case 'Others':
        this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createOthers(device);
        break;
      default:
        this.debugLog(`Unsupported Device: ${JSON.stringify(device)}`);
        this.warnLog(`Device: ${device.deviceName} with Device Type: ${device.remoteType}, is currently not supported.`);
        this.warnLog('Submit Feature Requests Here: ' + 'https://tinyurl.com/SwitchBotFeatureRequest');
    }
  }

  private async createHumidifier(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Humidifier(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Humidifier(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createBot(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Bot(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      accessory.context.connectionType = await this.connectionType(device);
      // accessory.context.FirmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Bot(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createMeter(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Meter(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Meter(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createMeterPlus(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // console.log("existingAccessory", existingAccessory);
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new MeterPlus(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new MeterPlus(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createHub2(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // console.log("existingAccessory", existingAccessory);
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Hub(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Hub(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createIOSensor(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new IOSensor(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new IOSensor(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createMotion(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Motion(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Motion(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createContact(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Contact(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Contact(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createBlindTilt(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new BlindTilt(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
      }

      if (device.group && !device.curtain?.disable_group) {
        this.debugLog(
          'Your Curtains are grouped, ' +
          `, Secondary curtain automatically hidden. Main Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`,
        );
      } else {
        if (device.master) {
          this.warnLog(`Main Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
        } else {
          this.errorLog(`Secondary Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
        }
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new BlindTilt(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createCurtain(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Curtain(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
      }

      if (device.group && !device.curtain?.disable_group) {
        this.debugLog(
          'Your Curtains are grouped, ' +
          `, Secondary curtain automatically hidden. Main Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`,
        );
      } else {
        if (device.master) {
          this.warnLog(`Main Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
        } else {
          this.errorLog(`Secondary Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
        }
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Curtain(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createPlug(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Plug(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Plug(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createLock(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Lock(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Lock(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createColorBulb(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new ColorBulb(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new ColorBulb(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createCeilingLight(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new CeilingLight(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new CeilingLight(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createStripLight(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new StripLight(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new StripLight(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createRobotVacuumCleaner(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.deviceType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = await this.connectionType(device);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new RobotVacuumCleaner(this, existingAccessory, device);
        this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.deviceType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
      accessory.context.connectionType = await this.connectionType(device);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new RobotVacuumCleaner(this, accessory, device);
      this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createTV(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (!device.hide_device && existingAccessory) {
      // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
      existingAccessory.context.model = device.remoteType;
      existingAccessory.context.deviceID = device.deviceId;
      existingAccessory.displayName = device.configDeviceName || device.deviceName;
      existingAccessory.context.FirmwareRevision = device.firmware;
      existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
      this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
      existingAccessory.context.connectionType = device.connectionType;
      this.api.updatePlatformAccessories([existingAccessory]);
      // create the accessory handler for the restored accessory
      // this is imported from `platformAccessory.ts`
      new TV(this, existingAccessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.connectionType = device.connectionType;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new TV(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createFan(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Fan(this, existingAccessory, device);
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.connectionType = device.connectionType;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Fan(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createLight(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Light(this, existingAccessory, device);
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.connectionType = device.connectionType;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Light(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createAirConditioner(device: irdevice & devicesConfig & irDevicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new AirConditioner(this, existingAccessory, device);
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.connectionType = device.connectionType;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new AirConditioner(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createAirPurifier(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new AirPurifier(this, existingAccessory, device);
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.connectionType = device.connectionType;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new AirPurifier(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createWaterHeater(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new WaterHeater(this, existingAccessory, device);
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.connectionType = device.connectionType;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new WaterHeater(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createVacuumCleaner(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new VacuumCleaner(this, existingAccessory, device);
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.connectionType = device.connectionType;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new VacuumCleaner(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createCamera(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Camera(this, existingAccessory, device);
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.connectionType = device.connectionType;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Camera(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
    }
  }

  private async createOthers(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.model = device.remoteType;
        existingAccessory.context.deviceID = device.deviceId;
        existingAccessory.displayName = device.configDeviceName || device.deviceName;
        if (device.firmware) {
          existingAccessory.context.FirmwareRevision = device.firmware;
        }
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Others(this, existingAccessory, device);
        this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // the accessory does not yet exist, so we need to create it
      if (!device.external) {
        this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.deviceName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = device.remoteType;
      accessory.context.deviceID = device.deviceId;
      if (device.firmware) {
        accessory.context.FirmwareRevision = device.firmware;
      }
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.connectionType = device.connectionType;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Others(this, accessory, device);
      this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
    }
  }

  async registerCurtains(device: device & devicesConfig) {
    switch (device.deviceType) {
      case 'Curtain':
      case 'Curtain3':
        this.debugWarnLog(`deviceName: ${device.deviceName} deviceId: ${device.deviceId}, curtainDevicesIds: ${device.curtainDevicesIds}, master: ` +
          `${device.master}, group: ${device.group}, disable_group: ${device.curtain?.disable_group}, connectionType: ${device.connectionType}`);
        break;
      default:
        this.debugWarnLog(`deviceName: ${device.deviceName} deviceId: ${device.deviceId}, blindTiltDevicesIds: ${device.blindTiltDevicesIds}, master:`
          + ` ${device.master}, group: ${device.group}, disable_group: ${device.curtain?.disable_group}, connectionType: ${device.connectionType}`);
    }

    let registerCurtain: boolean;
    if (device.master && device.group) {
      // OpenAPI: Master Curtains/Blind Tilt in Group
      registerCurtain = true;
      this.debugLog(
        `deviceName: ${device.deviceName} [${device.deviceType} Config] device.master: ${device.master}, device.group: ${device.group}` +
        ` connectionType; ${device.connectionType}`,
      );
      this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`);
    } else if (!device.master && device.curtain?.disable_group) {
      //!device.group && device.connectionType === 'BLE'
      // OpenAPI: Non-Master Curtains/Blind Tilts that has Disable Grouping Checked
      registerCurtain = true;
      this.debugLog(
        `deviceName: ${device.deviceName} [${device.deviceType} Config] device.master: ${device.master}, disable_group: ` +
        `${device.curtain?.disable_group}, connectionType; ${device.connectionType}`,
      );
      this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`);
    } else if (device.master && !device.group) {
      // OpenAPI: Master Curtains/Blind Tilts not in Group
      registerCurtain = true;
      this.debugLog(
        `deviceName: ${device.deviceName} [${device.deviceType} Config] device.master: ${device.master}, device.group: ${device.group}` +
        ` connectionType; ${device.connectionType}`,
      );
      this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`);
    } else if (device.connectionType === 'BLE') {
      // BLE: Curtains/Blind Tilt
      registerCurtain = true;
      this.debugLog(
        `deviceName: ${device.deviceName} [${device.deviceType} Config] connectionType: ${device.connectionType}, ` + ` group: ${device.group}`,
      );
      this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`);
    } else {
      registerCurtain = false;
      this.debugErrorLog(
        `deviceName: ${device.deviceName} [${device.deviceType} Config] disable_group: ${device.curtain?.disable_group},` +
        ` device.master: ${device.master}, device.group: ${device.group}`,
      );
      this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}, device.connectionType: ${device.connectionType}`);
    }
    return registerCurtain;
  }

  async connectionType(device: device & devicesConfig): Promise<any> {
    let connectionType: string;
    if (!device.connectionType && this.config.credentials?.token && this.config.credentials.secret) {
      connectionType = 'OpenAPI';
    } else {
      connectionType = device.connectionType!;
    }
    return connectionType;
  }

  async registerDevice(device: device & devicesConfig) {
    device.connectionType = await this.connectionType(device);
    let registerDevice: boolean;
    if (!device.hide_device && device.connectionType === 'BLE/OpenAPI') {
      switch (device.deviceType) {
        case 'Curtain':
        case 'Curtain3':
        case 'Blind Tilt':
          registerDevice = await this.registerCurtains(device);
          this.debugWarnLog(`Device: ${device.deviceName} ${device.deviceType} registerDevice: ${registerDevice}`);
          break;
        default:
          registerDevice = true;
          this.debugWarnLog(`Device: ${device.deviceName} registerDevice: ${registerDevice}`);
      }
      if (registerDevice === true) {
        this.debugWarnLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will display in HomeKit`);
      } else {
        this.debugErrorLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will not display in HomeKit`);
      }
    } else if (!device.hide_device && device.deviceId && device.configDeviceType && device.configDeviceName && device.connectionType === 'BLE') {
      switch (device.deviceType) {
        case 'Curtain':
        case 'Curtain3':
        case 'Blind Tilt':
          registerDevice = await this.registerCurtains(device);
          this.debugWarnLog(`Device: ${device.deviceName} ${device.deviceType} registerDevice: ${registerDevice}`);
          break;
        default:
          registerDevice = true;
          this.debugWarnLog(`Device: ${device.deviceName} registerDevice: ${registerDevice}`);
      }
      if (registerDevice === true) {
        this.debugWarnLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will display in HomeKit`);
      } else {
        this.debugErrorLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will not display in HomeKit`);
      }
    } else if (!device.hide_device && device.connectionType === 'OpenAPI') {
      switch (device.deviceType) {
        case 'Curtain':
        case 'Curtain3':
        case 'Blind Tilt':
          registerDevice = await this.registerCurtains(device);
          this.debugWarnLog(`Device: ${device.deviceName} ${device.deviceType} registerDevice: ${registerDevice}`);
          break;
        default:
          registerDevice = true;
          this.debugWarnLog(`Device: ${device.deviceName} registerDevice: ${registerDevice}`);
      }
      if (registerDevice === true) {
        this.debugWarnLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will display in HomeKit`);
      } else {
        this.debugErrorLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will not display in HomeKit`);
      }
    } else if (!device.hide_device && device.connectionType === 'Disabled') {
      switch (device.deviceType) {
        case 'Curtain':
        case 'Curtain3':
        case 'Blind Tilt':
          registerDevice = await this.registerCurtains(device);
          this.debugWarnLog(`Device: ${device.deviceName} ${device.deviceType} registerDevice: ${registerDevice}`);
          break;
        default:
          registerDevice = true;
          this.debugWarnLog(`Device: ${device.deviceName} registerDevice: ${registerDevice}`);
      }
      this.debugWarnLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will continue to display in HomeKit`);
    } else if (!device.connectionType && !device.hide_device) {
      registerDevice = false;
      this.debugErrorLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will not display in HomeKit`);
    } else if (device.hide_device) {
      registerDevice = false;
      this.debugErrorLog(`Device: ${device.deviceName} hide_device: ${device.hide_device}, will not display in HomeKit`);
    } else {
      registerDevice = false;
      this.debugErrorLog(
        `Device: ${device.deviceName} connectionType: ${device.connectionType}, hide_device: ` +
        `${device.hide_device},  will not display in HomeKit`,
      );
    }
    return registerDevice;
  }

  public async externalOrPlatformIR(device: device & irDevicesConfig, accessory: PlatformAccessory) {
    /**
     * Publish as external accessory
     * Only one TV can exist per bridge, to bypass this limitation, you should
     * publish your TV as an external accessory.
     */
    if (device.external) {
      this.debugWarnLog(`${accessory.displayName} External Accessory Mode`);
      this.externalAccessory(accessory);
    } else {
      this.debugLog(`${accessory.displayName} External Accessory Mode: ${device.external}`);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  public async externalOrPlatform(device: device & devicesConfig, accessory: PlatformAccessory) {
    if (device.external) {
      this.debugWarnLog(`${accessory.displayName} External Accessory Mode`);
      this.externalAccessory(accessory);
    } else {
      this.debugLog(`${accessory.displayName} External Accessory Mode: ${device.external}`);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  public async externalAccessory(accessory: PlatformAccessory) {
    this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
  }

  public unregisterPlatformAccessories(existingAccessory: PlatformAccessory) {
    // remove platform accessories when no longer present
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
    this.warnLog(`Removing existing accessory from cache: ${existingAccessory.displayName}`);
  }

  async statusCode(statusCode: number): Promise<void> {
    switch (statusCode) {
      case 151:
        this.errorLog(
          `Command not supported by this device type, statusCode: ${statusCode}, Submit Feature Request Here: ` +
          'https://tinyurl.com/SwitchBotFeatureRequest',
        );
        break;
      case 152:
        this.errorLog(`Device not found, statusCode: ${statusCode}`);
        break;
      case 160:
        this.errorLog(`Command is not supported, statusCode: ${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`);
        break;
      case 161:
        this.errorLog(`Device is offline, statusCode: ${statusCode}`);
        break;
      case 171:
        this.errorLog(`is offline, statusCode: ${statusCode}`);
        break;
      case 190:
        this.errorLog(`Requests reached the daily limit, statusCode: ${statusCode}`);
        break;
      case 100:
        this.debugLog(`Command successfully sent, statusCode: ${statusCode}`);
        break;
      case 200:
        this.debugLog(`Request successful, statusCode: ${statusCode}`);
        break;
      case 400:
        this.errorLog('Bad Request, The client has issued an invalid request. This is commonly used to specify validation errors in a request '
          + `payload, statusCode: ${statusCode}`);
        break;
      case 401:
        this.errorLog('Unauthorized,	Authorization for the API is required, but the request has not been authenticated, '
          + `statusCode: ${statusCode}`);
        break;
      case 403:
        this.errorLog('Forbidden,	The request has been authenticated but does not have appropriate permissions, or a requested resource is not '
          + `found, statusCode: ${statusCode}`);
        break;
      case 404:
        this.errorLog(`Not Found,	Specifies the requested path does not exist, statusCode: ${statusCode}`);
        break;
      case 406:
        this.errorLog('Not Acceptable,	The client has requested a MIME type via the Accept header for a value not supported by the server, '
          + `statusCode: ${statusCode}`);
        break;
      case 415:
        this.errorLog('Unsupported Media Type,	The client has defined a contentType header that is not supported by the server, '
          + `statusCode: ${statusCode}`);
        break;
      case 422:
        this.errorLog('Unprocessable Entity,	The client has made a valid request, but the server cannot process it. This is often used for '
          + `APIs for which certain limits have been exceeded, statusCode: ${statusCode}`);
        break;
      case 429:
        this.errorLog('Too Many Requests,	The client has exceeded the number of requests allowed for a given time window, '
          + `statusCode: ${statusCode}`);
        break;
      case 500:
        this.errorLog('Internal Server Error,	An unexpected error on the SmartThings servers has occurred. These errors should be rare, '
          + `statusCode: ${statusCode}`);
        break;
      default:
        this.errorLog(`Unknown statusCode, statusCode: ${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`);
    }
  }

  // BLE Connection
  async connectBLE() {
    let switchbot: any;
    try {
      const SwitchBot = (await import('node-switchbot')).SwitchBot;
      queueScheduler.schedule(() => (switchbot = new SwitchBot()));
    } catch (e: any) {
      switchbot = false;
      this.errorLog(`Was 'node-switchbot' found: ${switchbot}, Error: ${e}`);
    }
    return switchbot;
  }

  async getVersion() {
    const json = JSON.parse(
      readFileSync(
        new URL('../package.json', import.meta.url),
        'utf-8',
      ),
    );
    this.debugLog(`Plugin Version: ${json.version}`);
    this.version = json.version;
  }

  async platformConfigOptions() {
    const platformConfig: SwitchBotPlatformConfig['options'] = {};
    if (this.config.options) {
      if (this.config.options.logging) {
        platformConfig.logging = this.config.options.logging;
      }
      if (this.config.options.refreshRate) {
        platformConfig.refreshRate = this.config.options.refreshRate;
      }
      if (this.config.options.pushRate) {
        platformConfig.pushRate = this.config.options.pushRate;
      }
      if (Object.entries(platformConfig).length !== 0) {
        this.debugLog(`Platform Config: ${JSON.stringify(platformConfig)}`);
      }
      this.platformConfig = platformConfig;
    }
  }

  async platformLogs() {
    this.debugMode = process.argv.includes('-D') || process.argv.includes('--debug');
    if (this.config.options?.logging === 'debug' || this.config.options?.logging === 'standard' || this.config.options?.logging === 'none') {
      this.platformLogging = this.config.options!.logging;
      this.debugWarnLog(`Using Config Logging: ${this.platformLogging}`);
    } else if (this.debugMode) {
      this.platformLogging = 'debugMode';
      this.debugWarnLog(`Using ${this.platformLogging} Logging`);
    } else {
      this.platformLogging = 'standard';
      this.debugWarnLog(`Using ${this.platformLogging} Logging`);
    }
  }

  /**
   * If device level logging is turned on, log to log.warn
   * Otherwise send debug logs to log.debug
   */
  infoLog(...log: any[]): void {
    if (this.enablingPlatformLogging()) {
      this.log.info(String(...log));
    }
  }

  warnLog(...log: any[]): void {
    if (this.enablingPlatformLogging()) {
      this.log.warn(String(...log));
    }
  }

  debugWarnLog(...log: any[]): void {
    if (this.enablingPlatformLogging()) {
      if (this.platformLogging?.includes('debug')) {
        this.log.warn('[DEBUG]', String(...log));
      }
    }
  }

  errorLog(...log: any[]): void {
    if (this.enablingPlatformLogging()) {
      this.log.error(String(...log));
    }
  }

  debugErrorLog(...log: any[]): void {
    if (this.enablingPlatformLogging()) {
      if (this.platformLogging?.includes('debug')) {
        this.log.error('[DEBUG]', String(...log));
      }
    }
  }

  debugLog(...log: any[]): void {
    if (this.enablingPlatformLogging()) {
      if (this.platformLogging === 'debugMode') {
        this.log.debug(String(...log));
      } else if (this.platformLogging === 'debug') {
        this.log.info('[DEBUG]', String(...log));
      }
    }
  }

  enablingPlatformLogging(): boolean {
    return this.platformLogging?.includes('debug') || this.platformLogging === 'standard';
  }
}
