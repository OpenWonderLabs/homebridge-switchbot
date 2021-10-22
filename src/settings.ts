import { PlatformConfig } from 'homebridge';
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
export const AuthURL = 'https://api.switch-bot.com';

/**
 * This is the main url used to access SwitchBot API
 */
export const DeviceURL = 'https://api.switch-bot.com/v1.0/devices';

//Config
export interface SwitchBotPlatformConfig extends PlatformConfig {
  credentials?: credentials;
  options?: options | Record<string, never>;
}

export type credentials = {
  openToken?: any;
};

export type options = {
  refreshRate?: number;
  pushRate?: number;
  debug?: string;
  devices?: Array<devicesConfig>;
};

export interface devicesConfig extends device, irdevice {
  id: any;
  type?: string;
  deviceId: string;
  bot?: bot;
  meter?: meter;
  humidifier?: humidifier;
  curtain?: curtain;
  bulb?: bulb;
  fan?: irfan;
  irair?: irair;
  other?: other;
  ble?: string;
  hide_device?: boolean;
}

export type meter = {
  unit?: number;
  hide_temperature?: boolean;
  hide_humidity?: boolean;
};

export type bot = {
  mode?: string;
};

export type humidifier = {
  hide_temperature?: boolean;
  set_minStep?: number;
};

export type curtain = {
  disable_group?: boolean;
  refreshRate?: number;
  set_max?: number;
  set_min?: number;
  set_minStep?: number;
};

export type bulb = {
  set_minStep?: number;
};

export type irfan = {
  swing_mode?: boolean;
  rotation_speed?: boolean;
  set_minStep?: number; //set_minStep
  set_max?: number; //set_max
  set_min?: number; //set_min
};

//For Potential Future Use
export type set_minStep = {
  set_minStep_device?: boolean;
  set_minStep?: number;
};

//For Potential Future Use
export type set_max = {
  set_max_device?: boolean;
  set_max?: number;
};

//For Potential Future Use
export type set_min = {
  set_min_device?: boolean;
  set_min?: number;
};

export type irair = {
  hide_automode?: boolean;
};

export type other = {
  deviceType?: string;
  commandOn?: string;
  commandOff?: string;
};

export interface AxiosRequestConfig {
  params?: Record<string, unknown>;
  headers?: any;
}

export type deviceResponses = {
  statusCode: number | string;
  message: string;
  body: deviceList | infraredRemoteList;
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
  //only available for Curtain devices. determines if the open position and the close position of a Curtain have been properly calibrated or not.
  calibrate?: boolean;
  //only available for Curtain devices. determines if a Curtain is paired with or grouped with another Curtain or not.
  group?: boolean;
  //only available for Curtain devices. determines if a Curtain is the master device or not when paired with or grouped with another Curtain.
  master?: boolean;
  //only available for Curtain devices. the opening direction of a Curtain.
  openDirection?: string;
  //BLE Mac Address
  bleMac?: string;
};

//a list of virtual infrared remote devices.
export type infraredRemoteList = {
  device: Array<irdevice>;
};

export type irdevice = {
  deviceId?: string; //device ID
  deviceName: string; //device name
  remoteType: string; //device type
  hubDeviceId: string; //remote device's parent Hub ID
};

export type deviceStatusResponse = {
  statusCode: number;
  message: string;
  body: deviceStatus;
};

export type deviceStatus = {
  //device ID.
  deviceId: string;
  //device type.
  deviceType: string;
  //device's parent Hub ID.
  hubDeviceId?: string;
  //only available for Bot/Plug/Humidifier devices. ON/OFF state.
  power?: string;
  //only available for Meter/Humidifier/Color Bulb devices. humidity percentage.
  humidity?: number;
  //only available for Meter/Humidifier devices. temperature in celsius.
  temperature?: number;
  //only available for Humidifier devices. atomization efficiency %.
  nebulizationEfficiency?: number;
  //only available for Humidifier devices. determines if a Humidifier is in Auto Mode or not.
  auto?: boolean;
  //only available for Humidifier devices. determines if a Humidifier's safety lock is on or not.
  childLock?: boolean;
  //only available for Humidifier devices. determines if a Humidifier is muted or not.
  sound?: boolean;
  //only available for Curtain devices. determines if a Curtain has been calibrated or not.
  calibrate?: boolean;
  //only available for Curtain devices. determines if a Curtain is paired with or grouped with another Curtain or not.
  group?: boolean;
  //only available for Curtain devices. determines if a Curtain is moving or not.
  moving?: boolean;
  //only available for Curtain devices. the percentage of the distance between the
  //calibrated open position and close position that a Curtain has moved to.
  slidePosition?: number;
  //available for Smart Fan devices. the fan mode.
  mode?: number;
  //available for Smart Fan devices. the fan speed.
  speed?: number;
  //available for Smart Fan devices. determines if the fan is swinging or not.
  shaking?: boolean;
  //only available for Smart Fan devices. the fan's swing direciton.
  shakeCenter?: string;
  //only available for Smart Fan devices. the fan's swing range, 0~120°.
  shakeRange?: string;
  //only available for Motion Sensor, Contact Sensor devices. determines if motion is detected
  moveDetected?: boolean;
  //only available for Motion Sensor, Contact Sensor devices. tell the ambient environment is bright or dim |
  //only available for Color Bulb devices. the brightness value, range from 1 to 100 |
  brightness?: string | number;
  //only available for Contact Sensor devices. open/close/timeOutNotClose |
  openState?: string;
  //only available for Color Bulb devices. the color value, RGB "255:255:255" |
  color?: string;
  //only available for Color Bulb devices. the color temperature value, range from 2700 to 6500 |
  colorTemperature?: number;
  //only available for Humidifier devices. determines if the water tank empty or not
  lackWater?: boolean;
};
