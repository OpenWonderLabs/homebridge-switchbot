/* Copyright(C) 2017-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * settings.ts: @switchbot/homebridge-switchbot platform class.
 */
import type { IClientOptions } from 'async-mqtt'
import type { PlatformConfig } from 'homebridge'
/*
* For Testing Locally:
* import type { device, irdevice, SwitchBotBLEModel, SwitchBotBLEModelFriendlyName, SwitchBotBLEModelName } from '/Users/Shared/GitHub/OpenWonderLabs/node-switchbot/dist/index.js';
*/
import type { device, irdevice, SwitchBotBLEModel, SwitchBotBLEModelFriendlyName, SwitchBotBLEModelName } from 'node-switchbot'
/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = 'SwitchBot'

/**
 * This must match the name of your plugin as defined the package.json
 */
export const PLUGIN_NAME = '@switchbot/homebridge-switchbot'

// Config
export interface SwitchBotPlatformConfig extends PlatformConfig {
  credentials?: credentials
  options?: options
  deviceConfig?: { [deviceType: string]: devicesConfig }
}
interface credentials {
  token?: string
  secret?: string
  notice?: string
}

export interface options {
  devices?: devicesConfig[]
  deviceConfig?: { [deviceType: string]: devicesConfig }
  irdevices?: irDevicesConfig[]
  irdeviceConfig?: { [remoteType: string]: irDevicesConfig }
  allowInvalidCharacters?: boolean
  mqttURL?: string
  mqttOptions?: IClientOptions
  mqttPubOptions?: IClientOptions
  BLE?: boolean
  discoverBLE?: boolean
  disableLogsforBLE?: boolean
  disableLogsforOpenAPI?: boolean
  webhookURL?: string
  maxRetries?: number
  delayBetweenRetries?: number
  refreshRate?: number
  updateRate?: number
  pushRate?: number
  logging?: string
};

export type devicesConfig = botConfig | meterConfig | indoorOutdoorSensorConfig | humidifierConfig | curtainConfig | blindTiltConfig | contactConfig | motionConfig | waterDetectorConfig | plugConfig | colorBulbConfig | stripLightConfig | ceilingLightConfig | lockConfig | hubConfig

export interface BaseDeviceConfig extends device {
  bleMac?: string
  model: string
  bleModel: SwitchBotBLEModel
  bleModelName: SwitchBotBLEModelName
  bleModelFriednlyName: SwitchBotBLEModelFriendlyName
  configDeviceType: string
  configDeviceName?: string
  deviceId: string
  external?: boolean
  refreshRate?: number
  updateRate?: number
  pushRate?: number
  firmware?: string
  logging?: string
  connectionType?: string
  customBLEaddress?: string
  scanDuration?: number
  hide_device?: boolean
  offline?: boolean
  maxRetry?: number
  maxRetries?: number
  delayBetweenRetries?: number
  disableCaching?: boolean
  mqttURL?: string
  mqttOptions?: IClientOptions
  mqttPubOptions?: IClientOptions
  history?: boolean
  webhook?: boolean
}

export interface botConfig extends BaseDeviceConfig {
  configDeviceType: 'Bot'
  mode?: string
  type: string
  doublePress?: number
  pushRatePress?: number
  allowPush?: boolean
  multiPress?: boolean
};

export interface meterConfig extends BaseDeviceConfig {
  configDeviceType: 'Meter' | 'MeterPlus'
  hide_temperature?: boolean
  convertUnitTo?: string
  hide_humidity?: boolean
};

export interface indoorOutdoorSensorConfig extends BaseDeviceConfig {
  configDeviceType: 'WoIOSensor'
  hide_temperature?: boolean
  convertUnitTo?: string
  hide_humidity?: boolean
};

export interface humidifierConfig extends BaseDeviceConfig {
  configDeviceType: 'Humidifier'
  hide_temperature?: boolean
  convertUnitTo?: string
  set_minStep?: number
};

export interface curtainConfig extends BaseDeviceConfig {
  configDeviceType: 'Curtain' | 'Curtain3' | 'WoRollerShade' | 'Roller Shade'
  disable_group?: boolean
  hide_lightsensor?: boolean
  set_minLux?: number
  set_maxLux?: number
  set_max?: number
  set_min?: number
  set_minStep?: number
  setCloseMode?: string
  setOpenMode?: string
  silentModeSwitch?: boolean
};

export interface blindTiltConfig extends BaseDeviceConfig {
  configDeviceType: 'Blind Tilt'
  disable_group?: boolean
  mapping?: string
  hide_lightsensor?: boolean
  set_minLux?: number
  set_maxLux?: number
  set_max?: number
  set_min?: number
  set_minStep?: number
  setCloseMode?: string
  setOpenMode?: string
  silentModeSwitch?: boolean
};

export interface contactConfig extends BaseDeviceConfig {
  configDeviceType: 'Contact Sensor'
  hide_lightsensor?: boolean
  set_minLux?: number
  set_maxLux?: number
  hide_motionsensor?: boolean
};

export interface motionConfig extends BaseDeviceConfig {
  configDeviceType: 'Motion Sensor'
  hide_lightsensor?: boolean
  set_minLux?: number
  set_maxLux?: number
};

export interface waterDetectorConfig extends BaseDeviceConfig {
  configDeviceType: 'Water Detector'
  hide_leak?: boolean
  dry?: boolean
};

export interface plugConfig extends BaseDeviceConfig {
  configDeviceType: 'Plug' | 'Plug Mini (US)' | 'Plug Mini (JP)'
};

export interface colorBulbConfig extends BaseDeviceConfig {
  configDeviceType: 'Color Bulb'
  set_minStep?: number
  adaptiveLightingShift?: number
};

export interface stripLightConfig extends BaseDeviceConfig {
  configDeviceType: 'Strip Light'
  set_minStep?: number
  adaptiveLightingShift?: number
};

export interface ceilingLightConfig extends BaseDeviceConfig {
  configDeviceType: 'Ceiling Light' | 'Ceiling Light Pro'
  set_minStep?: number
  adaptiveLightingShift?: number
};

export interface lockConfig extends BaseDeviceConfig {
  configDeviceType: 'Smart Lock' | 'Smart Lock Pro'
  hide_contactsensor?: boolean
  activate_latchbutton?: boolean
};

export interface hubConfig extends BaseDeviceConfig {
  configDeviceType: 'Hub 2'
  hide_temperature?: boolean
  convertUnitTo?: string
  hide_humidity?: boolean
  hide_lightsensor?: boolean
  set_minLux?: number
  set_maxLux?: number
};

export type irDevicesConfig = irFanConfig | irLightConfig | irAirConfig | irOtherConfig

export interface irBaseDeviceConfig extends irdevice {
  configDeviceName?: string
  configRemoteType?: string
  connectionType?: string
  hide_device?: boolean
  external?: boolean
  firmware?: string
  deviceId: string
  logging?: string
  customOn?: string
  customOff?: string
  customize?: boolean
  commandType?: string
  disablePushOn?: boolean
  disablePushOff?: boolean
  disablePushDetail?: boolean
}

export interface irFanConfig extends irBaseDeviceConfig {
  configRemoteType?: 'Fan' | 'DIY Fan'
  swing_mode?: boolean
  rotation_speed?: boolean
  set_minStep?: number
  set_max?: number
  set_min?: number
};

export interface irLightConfig extends irBaseDeviceConfig {
  configRemoteType?: 'Light' | 'DIY Light'
  stateless?: boolean
};

export interface irAirConfig extends irBaseDeviceConfig {
  configRemoteType?: 'Air Conditioner' | 'DIY Air Conditioner'
  hide_automode?: boolean
  set_max_heat?: number
  set_min_heat?: number
  set_max_cool?: number
  set_min_cool?: number
  meterType?: string
  meterId?: string
  meterUuid?: string
};

export interface irOtherConfig extends irBaseDeviceConfig {
  configRemoteType?: 'Others'
  type?: string
};
