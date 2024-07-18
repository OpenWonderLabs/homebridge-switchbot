/* Copyright(C) 2017-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * platform.ts: @switchbot/homebridge-switchbot platform class.
 */
import { Hub } from './device/hub.js';
import { Bot } from './device/bot.js';
import { Plug } from './device/plug.js';
import { Lock } from './device/lock.js';
import { Meter } from './device/meter.js';
import { Motion } from './device/motion.js';
import { Contact } from './device/contact.js';
import { Curtain } from './device/curtain.js';
import { IOSensor } from './device/iosensor.js';
import { MeterPlus } from './device/meterplus.js';
import { ColorBulb } from './device/colorbulb.js';
import { StripLight } from './device/lightstrip.js';
import { Humidifier } from './device/humidifier.js';
import { CeilingLight } from './device/ceilinglight.js';
import { WaterDetector } from './device/waterdetector.js';
import { RobotVacuumCleaner } from './device/robotvacuumcleaner.js';

import { Fan } from './device/fan.js';
import { TV } from './irdevice/tv.js';
import { IRFan } from './irdevice/fan.js';
import { Light } from './irdevice/light.js';
import { Others } from './irdevice/other.js';
import { Camera } from './irdevice/camera.js';
import { BlindTilt } from './device/blindtilt.js';
import { AirPurifier } from './irdevice/airpurifier.js';
import { WaterHeater } from './irdevice/waterheater.js';
import { VacuumCleaner } from './irdevice/vacuumcleaner.js';
import { AirConditioner } from './irdevice/airconditioner.js';

import { Buffer } from 'buffer';
import { request } from 'undici';
import asyncmqtt from 'async-mqtt';
import { createServer } from 'http';
import { queueScheduler } from 'rxjs';
import fakegato from 'fakegato-history';
import crypto, { randomUUID } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { EveHomeKitTypes } from 'homebridge-lib/EveHomeKitTypes';
import { PLATFORM_NAME, PLUGIN_NAME, Devices, deleteWebhook, queryWebhook, setupWebhook, updateWebhook } from './settings.js';
import { isBlindTiltDevice, isCurtainDevice, sleep } from './utils.js';

import type { UrlObject } from 'url';
import type { MqttClient } from 'mqtt';
import type { Dispatcher } from 'undici';
import type { irdevice } from './types/irdevicelist.js';
import type { blindTilt, curtain, curtain3, device } from './types/devicelist.js';
import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory } from 'homebridge';
import type { SwitchBotPlatformConfig, devicesConfig, irDevicesConfig } from './settings.js';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import { SwitchBotModel } from 'node-switchbot';

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
  maxRetries!: number;
  delayBetweenRetries!: number;
  platformConfig!: SwitchBotPlatformConfig['options'];
  platformLogging!: SwitchBotPlatformConfig['logging'];
  config!: SwitchBotPlatformConfig;

  mqttClient: MqttClient | null = null;
  webhookEventListener: Server | null = null;

  public readonly eve: any;
  public readonly fakegatoAPI: any;
  public readonly webhookEventHandler: { [x: string]: (context: any) => void } = {};
  public readonly bleEventHandler: { [x: string]: (context: any) => void } = {};

  constructor(
    log: Logging,
    config: SwitchBotPlatformConfig,
    api: API,
  ) {
    // initialize
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

    // Plugin Configuration
    this.getPlatformLogSettings();
    this.getPlatformConfigSettings();
    this.getVersion();

    // Finish initializing the platform
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

          this.errorLog('"secret" config is not populated, you must populate then please restart Homebridge.');
        } else {
          this.discoverDevices();
        }
      } catch (e: any) {
        this.errorLog(`Failed to Discover, Error Message: ${e.message}, Submit Bugs Here: ` + 'https://tinyurl.com/SwitchBotBug');
        await this.debugErrorLog(`Failed to Discover, Error: ${e}`);
      }
    });

    this.setupMqtt();
    this.setupwebhook();
    this.setupBlE();
  }

  async setupMqtt(): Promise<void> {
    if (this.config.options?.mqttURL) {
      try {
        const { connectAsync } = asyncmqtt;
        this.mqttClient = await connectAsync(this.config.options?.mqttURL, this.config.options.mqttOptions || {});
        await this.debugLog('MQTT connection has been established successfully.');
        this.mqttClient.on('error', async (e: Error) => {
          await this.errorLog(`Failed to publish MQTT messages. ${e}`);
        });
        if (!this.config.options?.webhookURL) {
          // receive webhook events via MQTT
          await this.infoLog(`Webhook is configured to be received through ${this.config.options.mqttURL}/homebridge-switchbot/webhook.`);
          this.mqttClient.subscribe('homebridge-switchbot/webhook/+');
          this.mqttClient.on('message', async (topic: string, message) => {
            try {
              await await this.debugLog(`Received Webhook via MQTT: ${topic}=${message}`);
              const context = JSON.parse(message.toString());
              this.webhookEventHandler[context.deviceMac]?.(context);
            } catch (e: any) {
              await this.errorLog(`Failed to handle webhook event. Error:${e}`);
            }
          });
        }
      } catch (e) {
        this.mqttClient = null;
        await this.errorLog(`Failed to establish MQTT connection. ${e}`);
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
        this.webhookEventListener = createServer((request: IncomingMessage, response: ServerResponse) => {
          try {
            if (request.url === path && request.method === 'POST') {
              request.on('data', async (data) => {
                try {
                  const body = JSON.parse(data);
                  await this.debugLog(`Received Webhook: ${JSON.stringify(body)}`);
                  if (this.config.options?.mqttURL) {
                    const mac = body.context.deviceMac
                      ?.toLowerCase()
                      .match(/[\s\S]{1,2}/g)
                      ?.join(':');
                    const options = this.config.options?.mqttPubOptions || {};
                    this.mqttClient?.publish(`homebridge-switchbot/webhook/${mac}`, `${JSON.stringify(body.context)}`, options);
                  }
                  this.webhookEventHandler[body.context.deviceMac]?.(body.context);
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
        const { body, statusCode } = await request(setupWebhook, {
          method: 'POST',
          headers: this.generateHeaders(),
          body: JSON.stringify({
            'action': 'setupWebhook',
            'url': url,
            'deviceList': 'ALL',
          }),
        });
        const response: any = await body.json();
        await this.debugLog(`setupWebhook: url:${url}`);
        await this.debugLog(`setupWebhook: body:${JSON.stringify(response)}`);
        await this.debugLog(`setupWebhook: statusCode:${statusCode}`);
        if (statusCode !== 200 || response?.statusCode !== 100) {
          this.errorLog(`Failed to configure webhook. Existing webhook well be overridden. HTTP:${statusCode} API:${response?.statusCode} `
            + `message:${response?.message}`);
        }
      } catch (e: any) {
        this.errorLog(`Failed to configure webhook. Error: ${e.message}`);
      }

      try {
        const { body, statusCode } = await request(updateWebhook, {
          method: 'POST', headers: this.generateHeaders(), body: JSON.stringify({
            'action': 'updateWebhook',
            'config': {
              'url': url,
              'enable': true,
            },
          }),
        });
        const response: any = await body.json();
        await this.debugLog(`updateWebhook: url:${url}`);
        await this.debugLog(`updateWebhook: body:${JSON.stringify(response)}`);
        await this.debugLog(`updateWebhook: statusCode:${statusCode}`);
        if (statusCode !== 200 || response?.statusCode !== 100) {
          this.errorLog(`Failed to update webhook. HTTP:${statusCode} API:${response?.statusCode} message:${response?.message}`);
        }
      } catch (e: any) {
        this.errorLog(`Failed to update webhook. Error:${e.message}`);
      }

      try {
        const { body, statusCode } = await request(queryWebhook, {
          method: 'POST',
          headers: this.generateHeaders(),
          body: JSON.stringify({
            'action': 'queryUrl',
          }),
        });
        const response: any = await body.json();
        await this.debugLog(`queryWebhook: body:${JSON.stringify(response)}`);
        await this.debugLog(`queryWebhook: statusCode:${statusCode}`);
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
          const { body, statusCode } = await request(deleteWebhook, {
            method: 'POST',
            headers: this.generateHeaders(),
            body: JSON.stringify({
              'action': 'deleteWebhook',
              'url': url,
            }),
          });
          const response: any = await body.json();
          await this.debugLog(`deleteWebhook: url:${url}, body:${JSON.stringify(response)}, statusCode:${statusCode}`);
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

  async setupBlE() {
    if (this.config.options?.BLE) {
      await this.debugLog('setupBLE');
      const SwitchBot = (await import('node-switchbot')).SwitchBot;
      const switchbot = new SwitchBot();
      if (switchbot === undefined) {
        await this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`);
      } else {
        // Start to monitor advertisement packets
        (async () => {
          // Start to monitor advertisement packets
          await this.debugLog('Scanning for BLE SwitchBot devices...');
          await switchbot.startScan();
          // Set an event handler to monitor advertisement packets
          switchbot.onadvertisement = async (ad: any) => {
            try {
              this.bleEventHandler[ad.address]?.(ad.serviceData);
            } catch (e: any) {
              await this.errorLog(`Failed to handle BLE event. Error:${e}`);
            }
          };
        })();

        this.api.on('shutdown', async () => {
          try {
            switchbot.stopScan();
            this.infoLog('Stopped BLE scanning to close listening.');
          } catch (e: any) {
            this.errorLog(`Failed to stop Platform BLE scanning. Error:${e.message}`);
          }
        });
      }
    } else {
      await this.debugLog('Platform BLE is not enabled');
    }
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  async configureAccessory(accessory: PlatformAccessory) {
    await this.debugLog(`Loading accessory from cache: ${accessory.displayName}`);

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
      await this.debugWarnLog(`Platform Config: ${JSON.stringify(platformConfig)}`);
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

    if (!this.config.options.maxRetries) {
      this.config.options.maxRetries = 5;
      this.debugWarnLog('Using Default Max Retries.');
    } else {
      this.maxRetries = this.config.options.maxRetries;
    }

    if (!this.config.options.delayBetweenRetries) {
      // default 3 seconds
      this.config.options!.delayBetweenRetries! = 3000;
      this.debugWarnLog('Using Default Delay Between Retries.');
    } else {
      this.delayBetweenRetries = this.config.options.delayBetweenRetries * 1000;
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
        this.warnLog('This plugin has been updated to use OpenAPI v1.1, config is set with openToken,'
          + ' "openToken" cconfig has been moved to the "token" config');
        this.errorLog('"secret" config is not populated, you must populate then please restart Homebridge.');
      } else {
        this.warnLog('This plugin has been updated to use OpenAPI v1.1, config is set with openToken, '
          + '"openToken" config has been moved to the "token" config, please restart Homebridge.');
      }

      // set the refresh token
      pluginConfig.credentials.token = this.config.credentials?.openToken;
      if (pluginConfig.credentials.token) {
        pluginConfig.credentials.openToken = undefined;
      }

      await this.debugWarnLog(`token: ${pluginConfig.credentials.token}`);

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
      let retryCount = 0;
      const maxRetries = this.maxRetries; // Maximum number of retries
      const delayBetweenRetries = this.delayBetweenRetries; // Delay between retries in milliseconds
      await this.debugWarnLog(`Retry Count: ${retryCount}`);
      await this.debugWarnLog(`Max Retries: ${maxRetries}`);
      await this.debugWarnLog(`Delay Between Retries: ${delayBetweenRetries}`);
      while (retryCount < maxRetries) {
        try {
          const { body, statusCode } = await request(Devices, {
            headers: this.generateHeaders(),
          });
          await this.debugWarnLog(`statusCode: ${statusCode}`);
          const devicesAPI: any = await body.json();
          await this.debugWarnLog(`devicesAPI: ${JSON.stringify(devicesAPI)}`);
          await this.debugWarnLog(`devicesAPI Body: ${JSON.stringify(devicesAPI.body)}`);
          await this.debugWarnLog(`devicesAPI StatusCode: ${devicesAPI.statusCode}`);
          if ((statusCode === 200 || statusCode === 100) && (devicesAPI.statusCode === 200 || devicesAPI.statusCode === 100)) {
            await this.debugErrorLog(`statusCode: ${statusCode} & devicesAPI StatusCode: ${devicesAPI.statusCode}`);
            // SwitchBot Devices
            const deviceLists = devicesAPI.body.deviceList;
            await this.debugWarnLog(`DeviceLists: ${JSON.stringify(deviceLists)}`);
            await this.debugWarnLog(`DeviceLists Length: ${deviceLists.length}`);
            if (!this.config.options?.devices) {
              await this.debugLog(`SwitchBot Device Config Not Set: ${JSON.stringify(this.config.options?.devices)}`);
              if (deviceLists.length === 0) {
                await this.debugLog(`SwitchBot API Has No Devices With Cloud Services Enabled: ${JSON.stringify(devicesAPI.body)}`);
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
              await this.debugLog(`SwitchBot Device Config Set: ${JSON.stringify(this.config.options?.devices)}`);
              if (deviceLists.length === 0) {
                await this.debugLog(`SwitchBot API Has No Devices With Cloud Services Enabled: ${JSON.stringify(devicesAPI.body)}`);
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
                await this.debugLog(`SwitchBot Devices: ${JSON.stringify(devices)}`);
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
              await this.debugLog(`Total SwitchBot Devices Found: ${devicesAPI.body.deviceList.length}`);
            }

            // IR Devices
            const irDeviceLists = devicesAPI.body.infraredRemoteList;
            if (!this.config.options?.irdevices) {
              await this.debugLog(`IR Device Config Not Set: ${JSON.stringify(this.config.options?.irdevices)}`);
              const devices = irDeviceLists.map((v: any) => v);
              for (const device of devices) {
                if (device.remoteType) {
                  this.createIRDevice(device);
                }
              }
            } else {
              await this.debugLog(`IR Device Config Set: ${JSON.stringify(this.config.options?.irdevices)}`);
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
              await this.debugLog(`IR Devices: ${JSON.stringify(devices)}`);
              for (const device of devices) {
                this.createIRDevice(device);
              }
            }
            if (devicesAPI.body.infraredRemoteList.length !== 0) {
              this.infoLog(`Total IR Devices Found: ${devicesAPI.body.infraredRemoteList.length}`);
            } else {
              await this.debugLog(`Total IR Devices Found: ${devicesAPI.body.infraredRemoteList.length}`);
            }
            break;
          } else {
            this.statusCode(statusCode);
            this.statusCode(devicesAPI.statusCode);
            if (statusCode === 500) {
              retryCount++;
              this.infoLog(`statusCode: ${statusCode} Attempt ${retryCount} of ${maxRetries}`);
              await sleep(delayBetweenRetries);
            }
          }
        } catch (e: any) {
          retryCount++;
          this.debugErrorLog(
            `Failed to Discover Devices, Error Message: ${JSON.stringify(e.message)}, Submit Bugs Here: ` + 'https://tinyurl.com/SwitchBotBug');
          await this.debugErrorLog(`Failed to Discover Devices, Error: ${e}`);
        }
      }
    } else if (!this.config.credentials?.token && this.config.options?.devices) {
      await this.debugLog(`SwitchBot Device Manual Config Set: ${JSON.stringify(this.config.options?.devices)}`);
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

  private async createDevice(device: device & devicesConfig) {
    switch (device.deviceType!) {
      case 'Humidifier':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createHumidifier(device);
        break;
      case 'Hub Mini':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        break;
      case 'Hub Plus':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        break;
      case 'Hub 2':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createHub2(device);
        break;
      case 'Bot':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createBot(device);
        break;
      case 'Meter':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createMeter(device);
        break;
      case 'MeterPlus':
      case 'Meter Plus (JP)':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createMeterPlus(device);
        break;
      case 'WoIOSensor':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createIOSensor(device);
        break;
      case 'Water Detector':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createWaterDetector(device);
        break;
      case 'Motion Sensor':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createMotion(device);
        break;
      case 'Contact Sensor':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createContact(device);
        break;
      case 'Curtain':
      case 'Curtain3':
        await this.debugLog(`Discovered ${device.deviceType} ${device.deviceName}: ${device.deviceId}`);
        this.createCurtain(device);
        break;
      case 'Blind Tilt':
        await this.debugLog(`Discovered ${device.deviceType} ${device.deviceName}: ${device.deviceId}`);
        this.createBlindTilt(device);
        break;
      case 'Plug':
      case 'Plug Mini (US)':
      case 'Plug Mini (JP)':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createPlug(device);
        break;
      case 'Smart Lock':
      case 'Smart Lock Pro':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createLock(device);
        break;
      case 'Color Bulb':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createColorBulb(device);
        break;
      case 'K10+':
      case 'WoSweeper':
      case 'WoSweeperMini':
      case 'Robot Vacuum Cleaner S1':
      case 'Robot Vacuum Cleaner S1 Plus':
      case 'Robot Vacuum Cleaner S10':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createRobotVacuumCleaner(device);
        break;
      case 'Ceiling Light':
      case 'Ceiling Light Pro':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createCeilingLight(device);
        break;
      case 'Strip Light':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createStripLight(device);
        break;
      case 'Battery Circulator Fan':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
        this.createFan(device);
        break;
      case 'Remote':
      case 'Indoor Cam':
      case 'remote with screen+':
        await this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}, is currently not supported, device: ${JSON.stringify(device)}`);
        break;
      default:
        this.warnLog(`Device: ${device.deviceName} with Device Type: ${device.deviceType}, is currently not supported.`,
          + `Submit Feature Requests Here: https://tinyurl.com/SwitchBotFeatureRequest, device: ${JSON.stringify(device)}`);
    }
  }

  private async createIRDevice(device: irdevice & devicesConfig) {
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
        await this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        if (device.external === undefined) {
          device.external = true;
          this.createTV(device);
        } else {
          this.createTV(device);
        }
        break;
      case 'Fan':
      case 'DIY Fan':
        await this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createIRFan(device);
        break;
      case 'Air Conditioner':
      case 'DIY Air Conditioner':
        await this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createAirConditioner(device);
        break;
      case 'Light':
      case 'DIY Light':
        await this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createLight(device);
        break;
      case 'Air Purifier':
      case 'DIY Air Purifier':
        await this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createAirPurifier(device);
        break;
      case 'Water Heater':
      case 'DIY Water Heater':
        await this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createWaterHeater(device);
        break;
      case 'Vacuum Cleaner':
      case 'DIY Vacuum Cleaner':
        await this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createVacuumCleaner(device);
        break;
      case 'Camera':
      case 'DIY Camera':
        await this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createCamera(device);
        break;
      case 'Others':
        await this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
        this.createOthers(device);
        break;
      default:
        await this.debugLog(`Unsupported Device: ${JSON.stringify(device)}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = device.deviceType;
        existingAccessory.context.model = SwitchBotModel.Humidifier;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        existingAccessory.context.connectionType = await this.connectionType(device);
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
        await this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Humidifier(this, existingAccessory, device);
        await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = device.deviceType;
      accessory.context.model = SwitchBotModel.Humidifier;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Humidifier(this, accessory, device);
      await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = device.deviceType;
        existingAccessory.context.model = SwitchBotModel.Bot;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        existingAccessory.context.connectionType = await this.connectionType(device);
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Bot(this, existingAccessory, device);
        await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = device.deviceType;
      accessory.context.model = SwitchBotModel.Bot;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // accessory.context.version = findaccessories.accessoryAttribute.softwareRevision;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Bot(this, accessory, device);
      await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.model = SwitchBotModel.Meter;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = device.deviceType;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        existingAccessory.context.connectionType = await this.connectionType(device);
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Meter(this, existingAccessory, device);
        await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = SwitchBotModel.Meter;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = device.deviceType;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Meter(this, accessory, device);
      await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.model = SwitchBotModel.MeterPlusUS ?? SwitchBotModel.MeterPlusJP;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = device.deviceType;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        existingAccessory.context.connectionType = await this.connectionType(device);
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new MeterPlus(this, existingAccessory, device);
        await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = SwitchBotModel.MeterPlusUS ?? SwitchBotModel.MeterPlusJP;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = device.deviceType;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new MeterPlus(this, accessory, device);
      await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.model = SwitchBotModel.Hub2;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = device.deviceType;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        existingAccessory.context.connectionType = await this.connectionType(device);
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Hub(this, existingAccessory, device);
        await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = SwitchBotModel.Hub2;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = device.deviceType;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Hub(this, accessory, device);
      await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.model = SwitchBotModel.OutdoorMeter;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = device.deviceType;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        existingAccessory.context.connectionType = await this.connectionType(device);
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
        await this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new IOSensor(this, existingAccessory, device);
        await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.model = SwitchBotModel.OutdoorMeter;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = device.deviceType;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new IOSensor(this, accessory, device);
      await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`);
    }
  }

  private async createWaterDetector(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = device.deviceType;
        existingAccessory.context.model = SwitchBotModel.WaterDetector;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        existingAccessory.context.connectionType = await this.connectionType(device);
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new WaterDetector(this, existingAccessory, device);
        await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = device.deviceType;
      accessory.context.model = SwitchBotModel.WaterDetector;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      accessory.context.connectionType = await this.connectionType(device);
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new WaterDetector(this, accessory, device);
      await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = device.deviceType;
        existingAccessory.context.model = SwitchBotModel.MotionSensor;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        existingAccessory.context.connectionType = await this.connectionType(device);
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Motion(this, existingAccessory, device);
        await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = device.deviceType;
      accessory.context.model = SwitchBotModel.MotionSensor;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Motion(this, accessory, device);
      await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = device.deviceType;
        existingAccessory.context.model = SwitchBotModel.ContactSensor;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        existingAccessory.context.connectionType = await this.connectionType(device);
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Contact(this, existingAccessory, device);
        await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = device.deviceType;
      accessory.context.model = SwitchBotModel.ContactSensor;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Contact(this, accessory, device);
      await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = device.deviceType;
        existingAccessory.context.model = SwitchBotModel.BlindTilt;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        existingAccessory.context.connectionType = await this.connectionType(device);
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new BlindTilt(this, existingAccessory, device);
        await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      if (isBlindTiltDevice(device)) {
        if (device.group && !device.curtain?.disable_group) {
          this.debugLog(
            'Your Curtains are grouped, ' +
            `, Secondary curtain automatically hidden. Main Curtain: ${device.deviceName}, deviceId: ${device.deviceId}`);
        } else {
          if (device.master) {
            this.warnLog(`Main Curtain: ${device.deviceName}, deviceId: ${device.deviceId}`);
          } else {
            this.errorLog(`Secondary Curtain: ${device.deviceName}, deviceId: ${device.deviceId}`);
          }
        }
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = device.deviceType;
      accessory.context.model = SwitchBotModel.BlindTilt;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new BlindTilt(this, accessory, device);
      await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = device.deviceType;
        existingAccessory.context.model = device.deviceType === 'Curtain3' ? SwitchBotModel.Curtain3 : SwitchBotModel.Curtain;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        existingAccessory.context.connectionType = await this.connectionType(device);
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
        await this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Curtain(this, existingAccessory, device);
        await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      if (isCurtainDevice(device)) {
        if (device.group && !device.curtain?.disable_group) {
          this.debugLog(
            'Your Curtains are grouped, ' +
            `, Secondary curtain automatically hidden. Main Curtain: ${device.deviceName}, deviceId: ${device.deviceId}`);
        } else {
          if (device.master) {
            this.warnLog(`Main Curtain: ${device.deviceName}, deviceId: ${device.deviceId}`);
          } else {
            this.errorLog(`Secondary Curtain: ${device.deviceName}, deviceId: ${device.deviceId}`);
          }
        }
      }

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = device.deviceType;
      accessory.context.model = device.deviceType === 'Curtain3' ? SwitchBotModel.Curtain3 : SwitchBotModel.Curtain;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Curtain(this, accessory, device);
      await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = device.deviceType;
        existingAccessory.context.model = device.deviceType === 'Plug Mini (US)' ? SwitchBotModel.PlugMiniUS : device.deviceType === 'Plug Mini (JP)'
          ? SwitchBotModel.PlugMiniJP : SwitchBotModel.Plug;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        existingAccessory.context.connectionType = await this.connectionType(device);
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
        await this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Plug(this, existingAccessory, device);
        await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = device.deviceType;
      accessory.context.model = device.deviceType === 'Plug Mini (US)' ? SwitchBotModel.PlugMiniUS : device.deviceType === 'Plug Mini (JP)'
        ? SwitchBotModel.PlugMiniJP : SwitchBotModel.Plug;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Plug(this, accessory, device);
      await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = device.deviceType;
        existingAccessory.context.model = device.deviceType === 'Smart Lock Pro' ? SwitchBotModel.LockPro : SwitchBotModel.Lock;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        existingAccessory.context.connectionType = await this.connectionType(device);
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
        this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Lock(this, existingAccessory, device);
        await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = device.deviceType;
      accessory.context.model = device.deviceType === 'Smart Lock Pro' ? SwitchBotModel.LockPro : SwitchBotModel.Lock;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Lock(this, accessory, device);
      await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = device.deviceType;
        existingAccessory.context.model = SwitchBotModel.ColorBulb;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        existingAccessory.context.connectionType = await this.connectionType(device);
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
        await this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new ColorBulb(this, existingAccessory, device);
        await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = device.deviceType;
      accessory.context.model = SwitchBotModel.ColorBulb;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new ColorBulb(this, accessory, device);
      await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = device.deviceType;
        existingAccessory.context.model = device.deviceType === 'Ceiling Light Pro' ? SwitchBotModel.CeilingLightPro : SwitchBotModel.CeilingLight;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        existingAccessory.context.connectionType = await this.connectionType(device);
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
        await this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new CeilingLight(this, existingAccessory, device);
        await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = device.deviceType;
      accessory.context.model = device.deviceType === 'Ceiling Light Pro' ? SwitchBotModel.CeilingLightPro : SwitchBotModel.CeilingLight;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new CeilingLight(this, accessory, device);
      await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = device.deviceType;
        existingAccessory.context.model = SwitchBotModel.StripLight;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        existingAccessory.context.connectionType = await this.connectionType(device);
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
        await this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new StripLight(this, existingAccessory, device);
        await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = device.deviceType;
      accessory.context.model = SwitchBotModel.StripLight;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new StripLight(this, accessory, device);
      await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`);
    }
  }

  private async createFan(device: device & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (await this.registerDevice(device)) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = device.deviceType;
        existingAccessory.context.model = SwitchBotModel.BatteryCirculatorFan;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        existingAccessory.context.connectionType = await this.connectionType(device);
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
        await this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Fan(this, existingAccessory, device);
        await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = device.deviceType;
      accessory.context.model = SwitchBotModel.BatteryCirculatorFan;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Fan(this, accessory, device);
      await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = device.deviceType;
        existingAccessory.context.model = device.deviceType === 'Robot Vacuum Cleaner S1' ? SwitchBotModel.RobotVacuumCleanerS1
          : device.deviceType === 'Robot Vacuum Cleaner S1 Plus' ? SwitchBotModel.RobotVacuumCleanerS1Plus
            : device.deviceType === 'Robot Vacuum Cleaner S10' ? SwitchBotModel.RobotVacuumCleanerS10
              : device.deviceType === 'WoSweeper' ? SwitchBotModel.WoSweeper : device.deviceType === 'WoSweeperMini' ? SwitchBotModel.WoSweeperMini
                : SwitchBotModel.Unknown;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        existingAccessory.context.connectionType = await this.connectionType(device);
        existingAccessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
        await this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new RobotVacuumCleaner(this, existingAccessory, device);
        await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (await this.registerDevice(device)) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = device.deviceType;
      accessory.context.model = device.deviceType === 'Robot Vacuum Cleaner S1' ? SwitchBotModel.RobotVacuumCleanerS1
        : device.deviceType === 'Robot Vacuum Cleaner S1 Plus' ? SwitchBotModel.RobotVacuumCleanerS1Plus
          : device.deviceType === 'Robot Vacuum Cleaner S10' ? SwitchBotModel.RobotVacuumCleanerS10
            : device.deviceType === 'WoSweeper' ? SwitchBotModel.WoSweeper : device.deviceType === 'WoSweeperMini' ? SwitchBotModel.WoSweeperMini
              : SwitchBotModel.Unknown;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new RobotVacuumCleaner(this, accessory, device);
      await this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatform(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} deviceId: ${device.deviceId}`);
    }
  }

  private async createTV(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (!device.hide_device && existingAccessory) {
      // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
      existingAccessory.context.device = device;
      existingAccessory.context.deviceId = device.deviceId;
      existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
      existingAccessory.context.model = device.remoteType;
      existingAccessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      await this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
      existingAccessory.context.connectionType = device.connectionType;
      this.api.updatePlatformAccessories([existingAccessory]);
      // create the accessory handler for the restored accessory
      // this is imported from `platformAccessory.ts`
      new TV(this, existingAccessory, device);
      await this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
    } else if (!device.hide_device && device.hubDeviceId) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.model = device.remoteType;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = device.connectionType;
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new TV(this, accessory, device);
      await this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} deviceId: ${device.deviceId}`);
    }
  }

  private async createIRFan(device: irdevice & devicesConfig) {
    const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (!device.hide_device && device.hubDeviceId) {
        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        existingAccessory.context.model = device.remoteType;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        await this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new IRFan(this, existingAccessory, device);
        await this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.model = device.remoteType;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = device.connectionType;
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new IRFan(this, accessory, device);
      await this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        existingAccessory.context.model = device.remoteType;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        await this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Light(this, existingAccessory, device);
        await this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.model = device.remoteType;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = device.connectionType;
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Light(this, accessory, device);
      await this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        existingAccessory.context.model = device.remoteType;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        await this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new AirConditioner(this, existingAccessory, device);
        await this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.model = device.remoteType;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = device.connectionType;
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new AirConditioner(this, accessory, device);
      await this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        existingAccessory.context.model = device.remoteType;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        await this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new AirPurifier(this, existingAccessory, device);
        await this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.model = device.remoteType;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = device.connectionType;
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new AirPurifier(this, accessory, device);
      await this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        existingAccessory.context.model = device.remoteType;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        await this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new WaterHeater(this, existingAccessory, device);
        await this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.model = device.remoteType;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = device.connectionType;
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new WaterHeater(this, accessory, device);
      await this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        existingAccessory.context.model = device.remoteType;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        await this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new VacuumCleaner(this, existingAccessory, device);
        await this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.model = device.remoteType;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = device.connectionType;
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new VacuumCleaner(this, accessory, device);
      await this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        existingAccessory.context.model = device.remoteType;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        await this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Camera(this, existingAccessory, device);
        await this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.model = device.remoteType;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = device.connectionType;
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Camera(this, accessory, device);
      await this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} deviceId: ${device.deviceId}`);
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
        existingAccessory.context.device = device;
        existingAccessory.context.deviceId = device.deviceId;
        existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
        existingAccessory.context.model = device.remoteType;
        existingAccessory.displayName = device.configDeviceName
          ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
          : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
        await this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} deviceId: ${device.deviceId}`);
        existingAccessory.context.connectionType = device.connectionType;
        this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Others(this, existingAccessory, device);
        await this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
      } else {
        this.unregisterPlatformAccessories(existingAccessory);
      }
    } else if (!device.hide_device && device.hubDeviceId) {
      // create a new accessory
      const accessory = new this.api.platformAccessory(device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName), uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;
      accessory.context.deviceId = device.deviceId;
      accessory.context.deviceType = `IR: ${device.remoteType}`;
      accessory.context.model = device.remoteType;
      accessory.displayName = device.configDeviceName
        ? await this.validateAndCleanDisplayName(device.configDeviceName, 'configDeviceName', device.configDeviceName)
        : await this.validateAndCleanDisplayName(device.deviceName, 'deviceName', device.deviceName);
      accessory.context.connectionType = await this.connectionType(device);
      accessory.context.connectionType = device.connectionType;
      accessory.context.version = device.firmware ?? device.version ?? this.version ?? '0.0.0';
      const newOrExternal = !device.external ? 'Adding new' : 'Loading external';
      await this.infoLog(`${newOrExternal} accessory: ${accessory.displayName} deviceId: ${device.deviceId}`);
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new Others(this, accessory, device);
      await this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);

      // publish device externally or link the accessory to your platform
      this.externalOrPlatformIR(device, accessory);
      this.accessories.push(accessory);
    } else {
      await this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} deviceId: ${device.deviceId}`);
    }
  }

  async registerCurtains(device: device & devicesConfig): Promise<boolean> {
    /*function isCurtainDevice(device: device & devicesConfig): device is (curtain | curtain3) & devicesConfig {
      return device.deviceType === 'Curtain' || device.deviceType === 'Curtain3';
    }

    function isBlindTiltDevice(device: device & devicesConfig): device is blindTilt & devicesConfig {
      return device.deviceType === 'Blind Tilt';
    }*/
    let registerWindowCovering: boolean;
    if (isCurtainDevice(device)) {
      await this.debugWarnLog(`deviceName: ${device.deviceName} deviceId: ${device.deviceId}, curtainDevicesIds: ${device.curtainDevicesIds},`
        + ` master: ${device.master}, group: ${device.group}, disable_group: ${device.curtain?.disable_group},`
        + ` connectionType: ${device.connectionType}`);
      registerWindowCovering = await this.registerWindowCovering(device);
    } else if (isBlindTiltDevice(device)) {
      await this.debugWarnLog(`deviceName: ${device.deviceName} deviceId: ${device.deviceId}, blindTiltDevicesIds: ${device.blindTiltDevicesIds},`
        + ` master: ${device.master}, group: ${device.group}, disable_group: ${device.curtain?.disable_group},`
        + ` connectionType: ${device.connectionType}`);
      registerWindowCovering = await this.registerWindowCovering(device);
    } else {
      registerWindowCovering = false;
    }
    return registerWindowCovering;
  }

  async registerWindowCovering(device: ((curtain | curtain3) & devicesConfig) | (blindTilt & devicesConfig)) {
    await this.debugLog(`master: ${device.master}`);
    let registerCurtain: boolean;
    if (device.master && device.group) {
      // OpenAPI: Master Curtains/Blind Tilt in Group
      registerCurtain = true;
      await this.debugLog(`deviceName: ${device.deviceName} [${device.deviceType} Config] device.master: ${device.master},`
        + ` device.group: ${device.group} connectionType; ${device.connectionType}`);
      await this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`);
    } else if (!device.master && device.curtain?.disable_group) {
      //!device.group && device.connectionType === 'BLE'
      // OpenAPI: Non-Master Curtains/Blind Tilts that has Disable Grouping Checked
      registerCurtain = true;
      await this.debugLog(`deviceName: ${device.deviceName} [${device.deviceType} Config] device.master: ${device.master}, disable_group: `
        + `${device.curtain?.disable_group}, connectionType; ${device.connectionType}`);
      await this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`);
    } else if (device.master && !device.group) {
      // OpenAPI: Master Curtains/Blind Tilts not in Group
      registerCurtain = true;
      await this.debugLog(`deviceName: ${device.deviceName} [${device.deviceType} Config] device.master: ${device.master},`
        + ` device.group: ${device.group} connectionType; ${device.connectionType}`);
      await this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`);
    } else if (device.connectionType === 'BLE') {
      // BLE: Curtains/Blind Tilt
      registerCurtain = true;
      await this.debugLog(`deviceName: ${device.deviceName} [${device.deviceType} Config] connectionType: ${device.connectionType}, `
        + ` group: ${device.group}`);
      await this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`);
    } else {
      registerCurtain = false;
      await this.debugErrorLog(`deviceName: ${device.deviceName} [${device.deviceType} Config] disable_group: ${device.curtain?.disable_group},`
        + ` device.master: ${device.master}, device.group: ${device.group}`);
      await this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}, device.connectionType: ${device.connectionType}`);
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
          await this.debugWarnLog(`Device: ${device.deviceName} ${device.deviceType} registerDevice: ${registerDevice}`);
          break;
        default:
          registerDevice = true;
          await this.debugWarnLog(`Device: ${device.deviceName} registerDevice: ${registerDevice}`);
      }
      if (registerDevice === true) {
        await this.debugWarnLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will display in HomeKit`);
      } else {
        await this.debugErrorLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will not display in HomeKit`);
      }
    } else if (!device.hide_device && device.deviceId && device.configDeviceType && device.configDeviceName && device.connectionType === 'BLE') {
      switch (device.deviceType) {
        case 'Curtain':
        case 'Curtain3':
        case 'Blind Tilt':
          registerDevice = await this.registerCurtains(device);
          await this.debugWarnLog(`Device: ${device.deviceName} ${device.deviceType} registerDevice: ${registerDevice}`);
          break;
        default:
          registerDevice = true;
          await this.debugWarnLog(`Device: ${device.deviceName} registerDevice: ${registerDevice}`);
      }
      if (registerDevice === true) {
        await this.debugWarnLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will display in HomeKit`);
      } else {
        await this.debugErrorLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will not display in HomeKit`);
      }
    } else if (!device.hide_device && device.connectionType === 'OpenAPI') {
      switch (device.deviceType) {
        case 'Curtain':
        case 'Curtain3':
        case 'Blind Tilt':
          registerDevice = await this.registerCurtains(device);
          await this.debugWarnLog(`Device: ${device.deviceName} ${device.deviceType} registerDevice: ${registerDevice}`);
          break;
        default:
          registerDevice = true;
          await this.debugWarnLog(`Device: ${device.deviceName} registerDevice: ${registerDevice}`);
      }
      if (registerDevice === true) {
        await this.debugWarnLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will display in HomeKit`);
      } else {
        await this.debugErrorLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will not display in HomeKit`);
      }
    } else if (!device.hide_device && device.connectionType === 'Disabled') {
      switch (device.deviceType) {
        case 'Curtain':
        case 'Curtain3':
        case 'Blind Tilt':
          registerDevice = await this.registerCurtains(device);
          await this.debugWarnLog(`Device: ${device.deviceName} ${device.deviceType} registerDevice: ${registerDevice}`);
          break;
        default:
          registerDevice = true;
          await this.debugWarnLog(`Device: ${device.deviceName} registerDevice: ${registerDevice}`);
      }
      await this.debugWarnLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will continue to display in HomeKit`);
    } else if (!device.connectionType && !device.hide_device) {
      registerDevice = false;
      await this.debugErrorLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will not display in HomeKit`);
    } else if (device.hide_device) {
      registerDevice = false;
      await this.debugErrorLog(`Device: ${device.deviceName} hide_device: ${device.hide_device}, will not display in HomeKit`);
    } else {
      registerDevice = false;
      await this.debugErrorLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, hide_device: `
        + `${device.hide_device},  will not display in HomeKit`);
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
      await this.debugWarnLog(`${accessory.displayName} External Accessory Mode`);
      this.externalAccessory(accessory);
    } else {
      await this.debugLog(`${accessory.displayName} External Accessory Mode: ${device.external}`);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  public async externalOrPlatform(device: device & devicesConfig, accessory: PlatformAccessory) {
    if (device.external) {
      await this.debugWarnLog(`${accessory.displayName} External Accessory Mode`);
      await this.externalAccessory(accessory);
    } else {
      await this.debugLog(`${accessory.displayName} External Accessory Mode: ${device.external}`);
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
        await this.errorLog(`Command not supported by this device type, statusCode: ${statusCode}, Submit Feature Request Here: ` +
          'https://tinyurl.com/SwitchBotFeatureRequest');
        break;
      case 152:
        await this.errorLog(`Device not found, statusCode: ${statusCode}`);
        break;
      case 160:
        await this.errorLog(`Command is not supported, statusCode: ${statusCode}, Submit Bugs Here: https://tinyurl.com/SwitchBotBug`);
        break;
      case 161:
        await this.errorLog(`Device is offline, statusCode: ${statusCode}`);
        break;
      case 171:
        await this.errorLog(`is offline, statusCode: ${statusCode}`);
        break;
      case 190:
        await this.errorLog(`Requests reached the daily limit, statusCode: ${statusCode}`);
        break;
      case 100:
        await this.debugLog(`Command successfully sent, statusCode: ${statusCode}`);
        break;
      case 200:
        await this.debugLog(`Request successful, statusCode: ${statusCode}`);
        break;
      case 400:
        await this.errorLog('Bad Request, The client has issued an invalid request. This is commonly used to specify validation errors in a request '
          + `payload, statusCode: ${statusCode}`);
        break;
      case 401:
        await this.errorLog('Unauthorized,	Authorization for the API is required, but the request has not been authenticated, '
          + `statusCode: ${statusCode}`);
        break;
      case 403:
        await this.errorLog('Forbidden,	The request has been authenticated but does not have appropriate permissions, or a requested resource is not '
          + `found, statusCode: ${statusCode}`);
        break;
      case 404:
        await this.errorLog(`Not Found,	Specifies the requested path does not exist, statusCode: ${statusCode}`);
        break;
      case 406:
        await this.errorLog('Not Acceptable,	The client has requested a MIME type via the Accept header for a value not supported by the server, '
          + `statusCode: ${statusCode}`);
        break;
      case 415:
        await this.errorLog('Unsupported Media Type,	The client has defined a contentType header that is not supported by the server, '
          + `statusCode: ${statusCode}`);
        break;
      case 422:
        await this.errorLog('Unprocessable Entity,	The client has made a valid request, but the server cannot process it. This is often used for '
          + `APIs for which certain limits have been exceeded, statusCode: ${statusCode}`);
        break;
      case 429:
        await this.errorLog('Too Many Requests,	The client has exceeded the number of requests allowed for a given time window, '
          + `statusCode: ${statusCode}`);
        break;
      case 500:
        await this.errorLog('Internal Server Error,	An unexpected error on the SmartThings servers has occurred. These errors should be rare, '
          + `statusCode: ${statusCode}`);
        break;
      default:
        await this.errorLog(`Unknown statusCode, statusCode: ${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`);
    }
  }

  async retryRequest(deviceMaxRetries: number, deviceDelayBetweenRetries: number, url: string | URL | UrlObject,
    options?: { dispatcher?: Dispatcher } & Omit<Dispatcher.RequestOptions,
      'origin' | 'path' | 'method'> & Partial<Pick<Dispatcher.RequestOptions, 'method'>>): Promise<{ body: any; statusCode: number }> {
    let retryCount = 0;
    const maxRetries = deviceMaxRetries;
    const delayBetweenRetries = deviceDelayBetweenRetries;
    while (retryCount < maxRetries) {
      try {
        const { body, statusCode } = await request(url, options);
        if (statusCode === 200 || statusCode === 100) {
          return { body, statusCode };
        } else {
          await this.debugLog(`Received status code: ${statusCode}`);
        }
      } catch (error: any) {
        await this.errorLog(`Error making request: ${error.message}`);
      }
      retryCount++;
      await this.debugLog(`Retry attempt ${retryCount} of ${maxRetries}`);
      await sleep(delayBetweenRetries);
    }
    return { body: null, statusCode: -1 };
  }

  // BLE Connection
  async connectBLE(accessory: PlatformAccessory, device: device & devicesConfig) {
    let switchbot: any;
    try {
      const SwitchBot = (await import('node-switchbot')).SwitchBot;
      queueScheduler.schedule(() => (switchbot = new SwitchBot()));
      await this.debugLog(`${device.deviceType}: ${accessory.displayName} 'node-switchbot' found: ${switchbot}`);
    } catch (e: any) {
      switchbot = false;
      await this.errorLog(`${device.deviceType}: ${accessory.displayName} 'node-switchbot' found: ${switchbot}, Error: ${e}`);
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
    await this.debugLog(`Plugin Version: ${json.version}`);
    this.version = json.version;
  }

  async getPlatformConfigSettings() {
    const platformConfig: SwitchBotPlatformConfig['options'] = {};
    if (this.config.options) {
      if (this.config.options.logging) {
        platformConfig.logging = this.config.options.logging;
      }
      if (this.config.options.refreshRate) {
        platformConfig.refreshRate = this.config.options.refreshRate;
      }
      if (this.config.options.updateRate) {
        platformConfig.updateRate = this.config.options.updateRate;
      }
      if (this.config.options.pushRate) {
        platformConfig.pushRate = this.config.options.pushRate;
      }
      if (this.config.options.maxRetries) {
        this.maxRetries = this.config.options.maxRetries;
        platformConfig.maxRetries = this.config.options.maxRetries;
      } else {
        this.maxRetries = 3;
        this.debugWarnLog('Using Default Max Retries');
        platformConfig.maxRetries = this.maxRetries;
      }
      if (this.config.options.delayBetweenRetries) {
        this.delayBetweenRetries = this.config.options.delayBetweenRetries * 1000;
        platformConfig.delayBetweenRetries = this.config.options.delayBetweenRetries;
      } else {
        this.delayBetweenRetries = 3000;
        this.debugWarnLog('Using Default Delay Between Retries');
        platformConfig.delayBetweenRetries = this.delayBetweenRetries / 1000;
      }
      if (Object.entries(platformConfig).length !== 0) {
        await this.debugLog(`Platform Config: ${JSON.stringify(platformConfig)}`);
      }
      this.platformConfig = platformConfig;
    }
  }

  async getPlatformLogSettings() {
    this.debugMode = process.argv.includes('-D') ?? process.argv.includes('--debug');
    if (this.config.options?.logging === 'debug' || this.config.options?.logging === 'standard' || this.config.options?.logging === 'none') {
      this.platformLogging = this.config.options.logging;
      await this.debugWarnLog(`Using Config Logging: ${this.platformLogging}`);
    } else if (this.debugMode) {
      this.platformLogging = 'debugMode';
      await this.debugWarnLog(`Using ${this.platformLogging} Logging`);
    } else {
      this.platformLogging = 'standard';
      await this.debugWarnLog(`Using ${this.platformLogging} Logging`);
    }
  }

  /**
   * Validate and clean a string value for a Name Characteristic.
 * @param displayName
 * @param name
 * @param value
 * @returns string value
 */
  async validateAndCleanDisplayName(displayName: string, name: string, value: string): Promise<string> {
    const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9 ']*[a-zA-Z0-9]$/;
    const invalidCharsPattern = /[^a-zA-Z0-9 ']/g;
    const invalidStartEndPattern = /^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g;

    if (!validPattern.test(value)) {
      this.warnLog(`WARNING: The accessory '${displayName}' has an invalid '${name}' characteristic ('${value}'). Please use only alphanumeric,`
        + ' space, and apostrophe characters. Ensure it starts and ends with an alphabetic or numeric character, and avoid emojis. This may'
        + ' prevent the accessory from being added in the Home App or cause unresponsiveness.');

      // Remove invalid characters
      if (invalidCharsPattern.test(value)) {
        this.warnLog(`Removing invalid characters from '${name}' characteristic`);
        value = value.replace(invalidCharsPattern, '');
      }

      // Ensure it starts and ends with an alphanumeric character
      if (invalidStartEndPattern.test(value)) {
        this.warnLog(`Removing invalid starting or ending characters from '${name}' characteristic`);
        value = value.replace(invalidStartEndPattern, '');
      }
    }

    return value;
  }

  /**
   * If device level logging is turned on, log to log.warn
   * Otherwise send debug logs to log.debug
   */
  async infoLog(...log: any[]): Promise<void> {
    if (await this.enablingPlatformLogging()) {
      this.log.info(String(...log));
    }
  }

  async successLog(...log: any[]): Promise<void> {
    if (await this.enablingPlatformLogging()) {
      this.log.success(String(...log));
    }
  }

  async debugSuccessLog(...log: any[]): Promise<void> {
    if (await this.enablingPlatformLogging()) {
      if (await this.loggingIsDebug()) {
        this.log.success('[DEBUG]', String(...log));
      }
    }
  }

  async warnLog(...log: any[]): Promise<void> {
    if (await this.enablingPlatformLogging()) {
      this.log.warn(String(...log));
    }
  }

  async debugWarnLog(...log: any[]): Promise<void> {
    if (await this.enablingPlatformLogging()) {
      if (await this.loggingIsDebug()) {
        this.log.warn('[DEBUG]', String(...log));
      }
    }
  }

  async errorLog(...log: any[]): Promise<void> {
    if (await this.enablingPlatformLogging()) {
      this.log.error(String(...log));
    }
  }

  async debugErrorLog(...log: any[]): Promise<void> {
    if (await this.enablingPlatformLogging()) {
      if (await this.loggingIsDebug()) {
        this.log.error('[DEBUG]', String(...log));
      }
    }
  }

  async debugLog(...log: any[]): Promise<void> {
    if (await this.enablingPlatformLogging()) {
      if (this.platformLogging === 'debug') {
        this.log.info('[DEBUG]', String(...log));
      } else if (this.platformLogging === 'debugMode') {
        this.log.debug(String(...log));
      }
    }
  }

  async loggingIsDebug(): Promise<boolean> {
    return this.platformLogging === 'debugMode' || this.platformLogging === 'debug';
  }

  async enablingPlatformLogging(): Promise<boolean> {
    return this.platformLogging === 'debugMode' || this.platformLogging === 'debug' || this.platformLogging === 'standard';
  }
}
