/* Copyright(C) 2017-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * settings.ts: @switchbot/homebridge-switchbot platform class.
 */
/* eslint-disable max-len */
import { MacAddress, PlatformConfig } from 'homebridge';
import { IClientOptions } from 'async-mqtt';
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
  pushRate?: number;
  maxRetries?: number;
  delayBetweenRetries?: number;
  logging?: string;
  devices?: Array<devicesConfig>;
  irdevices?: Array<irDevicesConfig>;
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
  device: Array<device>;
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
  curtainDevicesIds?: Array<string>;
  //only available for Blind Titl devices. a list of Blind Tilt device IDs such that the Blind Tilt devices are being paired or grouped.
  blindTiltDevicesIds?: Array<string>;
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

// values defined but not displayed by API
export interface deviceInfo extends device {
}

//a list of virtual infrared remote devices.
export type infraredRemoteList = {
  device: Array<irdevice>;
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
  deviceId: string; //device ID. (Used by the following deviceTypes: Bot, Curtain, Meter, Meter Plus, Lock, Keypad, Keypad Touch, Motion Sensor, Contact Sensor, Ceiling Light, Ceiling Light Pro, Plug Mini (US), Plug Mini (JP), Strip Light, Color Bulb, Robot Vacuum Cleaner S1, Robot Vacuum Cleaner S1 Plus, Humidifier, Blind Tilt, Battery Circulator Fan)
  deviceType: string; //device type. (Used by the following deviceTypes: Bot, Curtain, Meter, Meter Plus, Lock, Keypad, Keypad Touch, Motion Sensor, Contact Sensor, Ceiling Light, Ceiling Light Pro, Plug Mini (US), Plug Mini (JP), Strip Light, Color Bulb, Robot Vacuum Cleaner S1, Robot Vacuum Cleaner S1 Plus, Humidifier, Blind Tilt)
  hubDeviceId: string; //device's parent Hub ID. 000000000000 when the device itself is a Hub or it is connected through Wi-Fi. (Used by the following deviceTypes: Bot, Curtain, Meter, Meter Plus, Lock, Keypad, Keypad Touch, Motion Sensor, Contact Sensor, Ceiling Light, Ceiling Light Pro, Plug Mini (JP), Strip Light, Color Bulb, Robot Vacuum Cleaner S1, Robot Vacuum Cleaner S1 Plus, Humidifier, Blind Tilt)
  power?: string; //ON/OFF state. (Used by the following deviceTypes: Bot, Ceiling Light, Ceiling Light Pro, PLug, Plug Mini (US), Plug Mini (JP), Strip Light, Color Bulb, Humidifier)
  calibrate?: boolean; //determines if device has been calibrated or not. (Used by the following deviceTypes: Curtain, Lock, Blind Tilt)
  group?: boolean; //determines if a device is paired with or grouped with another device or not. (Used by the following deviceTypes: Curtain, Blind Tilt)
  moving?: boolean; //determines if a device is moving or not. (Used by the following deviceTypes: Curtain, Blind Tilt)
  slidePosition?: number; //the current position (0-100) the percentage of the distance between the calibrated open position and closed position. (Used by the following deviceTypes: Curtain, Blind Tilt)
  temperature?: number; //temperature in celsius (Used by the following deviceTypes: Meter, Meter Plus, Humidifier, IOSensor)
  humidity?: number; //humidity percentage. (Used by the following deviceTypes: Meter, Meter Plus, Humidifier, IOSensor)
  lockState?: string; //determines if locked or not. (Used by the following deviceTypes: Lock)
  doorState?: string; //determines if the door is closed or not. (Used by the following deviceTypes: Lock)
  moveDetected?: boolean; //determines if motion is detected. (Used by the following deviceTypes: Motion Sensor, Contact Sensor)
  brightness?: string | number; //the ambient brightness picked up by the sensor. bright or dim. (Used by the following deviceTypes: Motion Sensor, Contact Sensor) | the brightness value, range from 1 to 100. (Used by the following deviceTypes: Ceiling Light, Ceiling Light Pro, Strip Light, Color Bulb)
  openState?: string; //the open state of the sensor. open, close, or timeOutNotClose. (Used by the following deviceTypes: Contact Sensor)
  colorTemperature?: number; //the color temperature value, range from 2700 to 6500. (Used by the following deviceTypes: Ceiling Light, Ceiling Light Pro, Color Bulb)
  voltage?: number; //the voltage of the device, measured in Volt. (Used by the following deviceTypes: Plug Mini (US), Plug Mini (JP))
  weight?: number; //the power consumed in a day, measured in Watts. (Used by the following deviceTypes: Plug Mini (US), Plug Mini (JP))
  electricityOfDay?: number; //the duration that the device has been used during a day, measured in minutes. (Used by the following deviceTypes: Plug Mini (US), Plug Mini (JP))
  electricCurrent?: number; //the current of the device at the moment, measured in Amp. (Used by the following deviceTypes: Plug Mini (US), Plug Mini (JP))
  color?: string; //the color value, RGB "255:255:255". (Used by the following deviceTypes: Strip Light, Color Bulb)
  workingStatus?: string; //the working status of the device. StandBy, Clearing, Paused, GotoChargeBase, Charging, ChargeDone, Dormant, InTrouble, InRemoteControl, or InDustCollecting. (Used by the following deviceTypes: Robot Vacuum Cleaner S1, Robot Vacuum Cleaner S1 Plus)
  onlineStatus?: string; //the connection status of the device. online or offline. (Used by the following deviceTypes: Robot Vacuum Cleaner S1, Robot Vacuum Cleaner S1 Plus)
  battery?: number; //the current battery level. (Used by the following deviceTypes: Robot Vacuum Cleaner S1, Robot Vacuum Cleaner S1 Plus, Blind Tilt, IOSensor)
  deviceName?: string; //device name. (Used by the following deviceTypes: Robot Vacuum Cleaner S1 Plus)
  nebulizationEfficiency?: number; //atomization efficiency percentage. (Used by the following deviceTypes: Humidifier)
  auto?: boolean; //determines if a Humidifier is in Auto Mode or not. (Used by the following deviceTypes: Humidifier)
  childLock?: boolean; //determines if a Humidifier's safety lock is on or not. (Used by the following deviceTypes: Humidifier)
  sound?: boolean; //determines if a Humidifier is muted or not. (Used by the following deviceTypes: Humidifier)
  lackWater?: boolean; //determines if the water tank is empty or not. (Used by the following deviceTypes: Humidifier)
  version?: number; //the version of the device.
  direction?: string; //the opening direction of a Blind Tilt device. (Used by the following deviceTypes: Blind Tilt)
  runStatus?: string; //'static' when not moving. (Used by the following deviceTypes: Blind Tilt)
  mode?: number | string; //available for  devices. the fan mode. (Used by the following deviceTypes: Smart Fan, Battery Circulator Fan):(direct mode: direct; natural mode: "natural"; sleep mode: "sleep"; ultra quiet mode: "baby")
  speed?: number; //the fan speed. (Used by the following deviceTypes: Smart Fan)
  shaking?: boolean; //determines if the fan is swinging or not. (Used by the following deviceTypes: Smart Fan)
  shakeCenter?: string; //the fan's swing direction. (Used by the following deviceTypes: Smart Fan)
  shakeRange?: string; //the fan's swing range, 0~120°. (Used by the following deviceTypes: Smart Fan)
  status?: number //the leak status. 0 for no leak, 1 for leak. (Used by the following deviceTypes: Water Detector)
  lightLevel?: number; //the light level. (Used by the following deviceTypes: Hub)
  nightStatus: number  //	set nightlight status. turn off: off; mode 1: 1; mode 2: 2
  oscillation: string  //	set horizontal oscillation. turn on: on; turn off: off
  verticalOscillation: string  //	set vertical oscillation. turn on: on; turn off: off
  chargingStatus: string  //	battery charge status. charging or uncharged
  fanSpeed: number  //	fan speed. 1~100
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

