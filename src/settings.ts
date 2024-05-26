/* Copyright(C) 2017-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * settings.ts: @switchbot/homebridge-switchbot platform class.
 */
import type { IClientOptions } from 'async-mqtt';
import type { MacAddress, PlatformConfig } from 'homebridge';
/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = 'SwitchBot';

/**
 * This must match the name of your plugin as defined the package.json
 */
export const PLUGIN_NAME = '@switchbot/homebridge-switchbot';

/**
 * This is the main url used to access SwitchBot API
 */
export const Devices = 'https://api.switch-bot.com/v1.1/devices';

/**
 * This is the updateWebhook url used to access SwitchBot API
 */
export const setupWebhook = 'https://api.switch-bot.com/v1.1/webhook/setupWebhook';

/**
 * This is the updateWebhook url used to access SwitchBot API
 */
export const queryWebhook = 'https://api.switch-bot.com/v1.1/webhook/queryWebhook';

/**
 * This is the updateWebhook url used to access SwitchBot API
 */
export const updateWebhook = 'https://api.switch-bot.com/v1.1/webhook/updateWebhook';

/**
 * This is the deleteWebhook url used to access SwitchBot API
 */
export const deleteWebhook = 'https://api.switch-bot.com/v1.1/webhook/deleteWebhook';

//Config
export interface SwitchBotPlatformConfig extends PlatformConfig {
  credentials?: credentials;
  options?: options | Record<string, never>;
}

export type credentials = {
  token?: any;
  secret?: any;
  notice?: any;
  openToken?: any;
};

export type options = {
  refreshRate?: number;
  updateRate?: number;
  pushRate?: number;
  maxRetries?: number;
  delayBetweenRetries?: number;
  logging?: string;
  devices?: devicesConfig[];
  irdevices?: irDevicesConfig[];
  webhookURL?: string;
  mqttURL?: string;
  mqttOptions?: IClientOptions;
  mqttPubOptions?: IClientOptions;
};

export interface devicesConfig extends device {
  bleMac?: string;
  model?: string;
  bleModel?: string;
  configDeviceType: string;
  configDeviceName?: string;
  deviceId: string;
  external?: boolean;
  refreshRate?: number;
  updateRate?: number;
  pushRate?: number;
  firmware?: string;
  logging?: string;
  connectionType?: string;
  customBLEaddress?: string;
  scanDuration?: number;
  hide_device?: boolean;
  offline?: boolean;
  maxRetry?: number;
  maxRetries?: number;
  delayBetweenRetries?: number;
  disableCaching?: boolean;
  mqttURL?: string;
  mqttOptions?: IClientOptions;
  mqttPubOptions?: IClientOptions;
  history?: boolean;
  webhook?: boolean;
  bot?: bot;
  meter?: meter;
  iosensor?: iosensor;
  humidifier?: humidifier;
  curtain?: curtain;
  blindTilt?: blindTilt;
  contact?: contact;
  motion?: motion;
  waterdetector?: waterdetector;
  colorbulb?: colorbulb;
  striplight?: striplight;
  ceilinglight?: ceilinglight;
  plug?: Record<any, any>;
  lock?: lock;
  hub?: hub;
}

export type meter = {
  hide_temperature?: boolean;
  convertUnitTo?: string;
  hide_humidity?: boolean;
};

export type iosensor = {
  hide_temperature?: boolean;
  convertUnitTo?: string;
  hide_humidity?: boolean;
};

export type bot = {
  mode?: string;
  deviceType?: string;
  doublePress?: number;
  pushRatePress?: number;
  allowPush?: boolean;
  multiPress?: boolean;
};

export type humidifier = {
  hide_temperature?: boolean;
  set_minStep?: number;
};

export type curtain = {
  disable_group?: boolean;
  hide_lightsensor?: boolean;
  set_minLux?: number;
  set_maxLux?: number;
  set_max?: number;
  set_min?: number;
  set_minStep?: number;
  setCloseMode?: string;
  setOpenMode?: string;
};

export type blindTilt = {
  mode?: string;
  hide_lightsensor?: boolean;
  set_minLux?: number;
  set_maxLux?: number;
  set_max?: number;
  set_min?: number;
  set_minStep?: number;
  setCloseMode?: string;
  setOpenMode?: string;
};

export type contact = {
  hide_lightsensor?: boolean;
  set_minLux?: number;
  set_maxLux?: number;
  hide_motionsensor?: boolean;
};

export type motion = {
  hide_lightsensor?: boolean;
  set_minLux?: number;
  set_maxLux?: number;
};

export type waterdetector = {
  hide_leak?: boolean;
};

export type colorbulb = {
  set_minStep?: number;
  adaptiveLightingShift?: number;
};

export type striplight = {
  set_minStep?: number;
  adaptiveLightingShift?: number;
};

export type ceilinglight = {
  set_minStep?: number;
  adaptiveLightingShift?: number;
};

export type lock = {
  hide_contactsensor?: boolean;
  activate_latchbutton?: boolean;
};

export type hub = {
  hide_temperature?: boolean;
  convertUnitTo?: string;
  hide_humidity?: boolean;
  hide_lightsensor?: boolean;
};

export interface irDevicesConfig extends irdevice {
  configRemoteType?: string;
  connectionType?: string;
  hide_device?: boolean;
  external?: boolean;
  firmware?: string;
  deviceId: string;
  logging?: string;
  customOn?: string;
  customOff?: string;
  customize?: boolean;
  commandType?: string;
  disablePushOn?: boolean;
  disablePushOff?: boolean;
  disablePushDetail?: boolean;
  irfan?: irfan;
  irair?: irair;
  irpur?: Record<any, any>;
  ircam?: Record<any, any>;
  irlight?: irlight;
  irvc?: Record<any, any>;
  irwh?: Record<any, any>;
  irtv?: Record<any, any>;
  other?: other;
}

export type irfan = {
  swing_mode?: boolean;
  rotation_speed?: boolean;
  set_minStep?: number;
  set_max?: number;
  set_min?: number;
};

export type irlight = {
  stateless?: boolean;
};

export type irair = {
  hide_automode?: boolean;
  set_max_heat?: number;
  set_min_heat?: number;
  set_max_cool?: number;
  set_min_cool?: number;
  meterType?: string;
  meterId?: string;
  meterUuid?: string;
};

export type other = {
  deviceType?: string;
};

export type body = {
  command: string;
  parameter: string;
  commandType: string;
};

//a list of physical devices.
export type deviceList = {
  device: device[];
};

export type device = {
  //device ID.
  deviceId?: string;
  //device name.
  deviceName: string;
  //device type.
  deviceType: string;
  //determines if Cloud Service is enabled or not for the current device.
  enableCloudService: boolean;
  //device's parent Hub ID.
  hubDeviceId: string;
  //only available for Curtain devices. a list of Curtain device IDs such that the Curtain devices are being paired or grouped.
  curtainDevicesIds?: string[];
  //only available for Blind Titl devices. a list of Blind Tilt device IDs such that the Blind Tilt devices are being paired or grouped.
  blindTiltDevicesIds?: string[];
  //only available for Curtain/Lock devices. determines if the open position and the close position of a device have been properly calibrated or not
  calibrate?: boolean;
  //only available for Curtain devices. determines if a Curtain is paired with or grouped with another Curtain or not.
  group?: boolean;
  //only available for Curtain devices. determines if a Curtain is the master device or not when paired with or grouped with another Curtain.
  master?: boolean;
  //only available for Curtain devices. the opening direction of a Curtain.
  openDirection?: string;
  //the opening direction of a Blind Tilt device
  direction?: string;
  //the current position, 0-100
  slidePosition?: string;
  //the version of the device
  version?: string;
  // Fan Mode:  direct mode: direct; natural mode: "natural"; sleep mode: "sleep"; ultra quiet mode: "baby"
  mode: string;
  //the current battery level
  battery: number;
  //ON/OFF state
  power: string;
  //set nightlight status. turn off: off; mode 1: 1; mode 2: 2
  nightStatus: number;
  //set horizontal oscillation. turn on: on; turn off: off
  oscillation: string;
  //set vertical oscillation. turn on: on; turn off: off
  verticalOscillation: string;
  //battery charge status. charging or uncharged
  chargingStatus: string;
  //fan speed. 1~100
  fanSpeed: number;
};

//a list of virtual infrared remote devices.
export type infraredRemoteList = {
  device: irdevice[];
};

export type irdevice = {
  deviceId?: string; //device ID
  deviceName: string; //device name
  remoteType: string; //device type
  hubDeviceId: string; //remote device's parent Hub ID
  model: string; //device model
};

export type deviceStatus = {
  statusCode: number;
  message: string;
  body: deviceStatusBody;
};

export type deviceStatusBody = {
  //v1.1 of API
  deviceId: string;
  deviceType: string;
  hubDeviceId: string;
  power?: string;
  calibrate?: boolean;
  group?: boolean;
  moving?: boolean;
  slidePosition?: number;
  temperature?: number;
  humidity?: number;
  lockState?: string;
  doorState?: string;
  moveDetected?: boolean;
  brightness?: string | number;
  openState?: string;
  colorTemperature?: number;
  voltage?: number;
  weight?: number;
  electricityOfDay?: number;
  electricCurrent?: number;
  color?: string;
  workingStatus?: string;
  onlineStatus?: string;
  battery?: number;
  deviceName?: string;
  nebulizationEfficiency?: number;
  auto?: boolean;
  childLock?: boolean;
  sound?: boolean;
  lackWater?: boolean;
  version?: number;
  direction?: string;
  runStatus?: string;
  mode?: number | string;
  speed?: number;
  shaking?: boolean;
  shakeCenter?: string;
  shakeRange?: string;
  status?: number;
  lightLevel?: number;
  nightStatus: number;
  oscillation: string;
  verticalOscillation: string;
  chargingStatus: string;
  fanSpeed: number;
};

export type ad = {
  id: string;
  address: string;
  rssi: number;
  serviceData: serviceData;
};

export type serviceData = {
  //Model of BLE SwitchBot Device
  model: string;
  //Model Name of BLE SwitchBot Device
  modelName: string;
  //Mode for Bot either Press or Switch
  mode?: boolean;
  //Bot/ColorBulb State
  state?: string | boolean;
  //Lock door open
  door_open?: string;
  //Lock Status
  status?: string;
  //ColorBulb Power
  power?: boolean;
  //ColorBulb R
  red?: number;
  //ColorBulb G
  green?: number;
  //ColorBulb B
  blue?: number;
  //ColorBulb Color temperature
  color_temperature?: number;
  //Battery percentage left on Bot, Meter, Motion, Contact, PlugMini, and Curtain
  battery?: number;
  //Humidifier's humidity level percentage
  percentage?: boolean | string;
  //Humidifier's state
  onState?: boolean;
  //Humidifier's AutoMode
  autoMode?: boolean;
  //Meter Temperature Levels
  temperature?: temperature;
  // Fahrenheit enabled for Meter
  fahrenheit: boolean;
  // Humidity level for Meter
  humidity?: number;
  //Motion Detected for Contact or Motion Sensors
  movement?: boolean;
  //Motion ((lightLevel == 1) ? 'dark' : ((lightLevel == 2) ? 'bright' : 'unknown'))
  //Contact ((lightLevel == 0) ? 'dark' : 'bright')
  //Curtain (light sensor level (1-10))
  //Light Level
  lightLevel?: number | string | boolean;
  //Contact DoorState
  doorState?: number | string;
  //Is Curtain Calibrated
  calibration?: boolean;
  //Current Curtain Positon %
  position?: number;
  //Is Curtain Moving?
  inMotion?: boolean;
  //PlugMini - Is there a delay?
  delay?: boolean;
  //PlugMini - Is there a Timer?
  timer?: boolean;
  //PlugMini - Is the UTC time has been synchronized?
  syncUtcTime?: boolean;
  //PlugMini - The Wifi RSSI Signal
  wifiRssi?: number;
  //PlugMini - Whether the Plug Mini is overloaded, more than 15A current overload
  overload?: boolean;
  //PlugMini - Plug Mini current power value of the load
  currentPower?: number;
  //Color Bulb's brightness level
  brightness?: boolean | string;
};

export type temperature = {
  c: number;
  f: number;
};

export type switchbot = {
  discover: (arg0: { duration?: any; model: string; quick: boolean; id?: MacAddress }) => Promise<any>;
  wait: (arg0: number) => any;
};

