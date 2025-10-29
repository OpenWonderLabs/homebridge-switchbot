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
import type { device, irdevice, SwitchBotBLEModel, SwitchBotBLEModelFriendlyName, SwitchBotBLEModelName, SwitchBotModel } from 'node-switchbot'
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
}
interface credentials {
  token?: string
  secret?: string
  notice?: string
}

export interface options {
  devices?: devicesConfig[]
  irdevices?: irDevicesConfig[]
  allowInvalidCharacters?: boolean
  // When true, devices declared in config.options.devices that are not
  // discovered via the SwitchBot OpenAPI will still be included (config-only
  // devices). Default: false.
  allowConfigOnlyDevices?: boolean
  /**
   * When true, previously-registered accessories for devices that are no
   * longer discovered or configured will be kept on the bridge. Default: false.
   * When false (default), stale accessories are removed automatically.
   */
  keepStaleAccessories?: boolean
  mqttURL?: string
  mqttOptions?: IClientOptions
  mqttPubOptions?: IClientOptions
  BLE?: boolean
  discoverBLE?: boolean
  disableLogsforBLE?: boolean
  disableLogsforOpenAPI?: boolean
  hostname?: string
  webhookURL?: string
  /**
   * When true, enables webhook support for all devices by default.
   * Individual devices can override this with their own webhook setting.
   * Requires webhookURL to be configured.
   */
  webhook?: boolean
  maxRetries?: number
  delayBetweenRetries?: number
  refreshRate?: number
  updateRate?: number
  pushRate?: number
  logging?: string
  /**
   * Maximum number of SwitchBot OpenAPI requests allowed per day.
   * Defaults to 10,000 if not specified.
   */
  dailyApiLimit?: number
  /**
   * Number of daily API requests reserved for user-initiated commands.
   * When remaining budget falls below this reserve, background polling and discovery
   * are paused until the daily counter resets. Defaults to 1,000.
   */
  dailyApiReserveForCommands?: number
  /**
   * When true, the plugin will completely stop background polling/discovery
   * once the remaining daily budget reaches the reserve (webhook-only mode).
   * When false, polling continues until the hard daily limit is reached.
   * Default: false.
   */
  webhookOnlyOnReserve?: boolean
  /**
   * When true, reset the daily API request counter at LOCAL midnight (system timezone).
   * When false (default), reset at UTC midnight. Default: false.
   */
  dailyApiResetAtLocalMidnight?: boolean
  // Matter platform batch refresh options
  matterBatchRefreshRate?: number
  matterBatchConcurrency?: number
  matterBatchEnabled?: boolean
  matterBatchJitter?: number
};

export type devicesConfig = botConfig | relaySwitch1Config | relaySwitch1PMConfig | meterConfig | meterProConfig | indoorOutdoorSensorConfig | humidifierConfig | curtainConfig | blindTiltConfig | contactConfig | motionConfig | waterDetectorConfig | plugConfig | colorBulbConfig | stripLightConfig | ceilingLightConfig | lockConfig | hubConfig

export interface BaseDeviceConfig extends device {
  bleMac?: string
  model: SwitchBotModel
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
  disablePlatformBLE?: boolean
  mqttURL?: string
  mqttOptions?: IClientOptions
  mqttPubOptions?: IClientOptions
  history?: boolean
  webhook?: boolean
  /**
   * When true, applies this device's configuration to all other devices
   * of the same deviceType/configDeviceType (e.g., all Humidifiers).
   * Specific per-device settings will override these template settings.
   */
  applyToAllDevicesOfType?: boolean
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

export interface relaySwitch1Config extends BaseDeviceConfig {
  configDeviceType: 'Relay Switch 1'
  type: string
  allowPush?: boolean
};

export interface relaySwitch1PMConfig extends BaseDeviceConfig {
  configDeviceType: 'Relay Switch 1PM'
  type: string
  allowPush?: boolean
};

export interface meterConfig extends BaseDeviceConfig {
  configDeviceType: 'Meter' | 'MeterPlus'
  hide_temperature?: boolean
  convertUnitTo?: string
  hide_humidity?: boolean
};

export interface meterProConfig extends BaseDeviceConfig {
  configDeviceType: 'Meter Pro' | 'MeterPro(CO2)'
  hide_temperature?: boolean
  convertUnitTo?: string
  hide_humidity?: boolean
  hide_co2?: boolean
};

export interface indoorOutdoorSensorConfig extends BaseDeviceConfig {
  configDeviceType: 'WoIOSensor'
  hide_temperature?: boolean
  convertUnitTo?: string
  hide_humidity?: boolean
};

export interface humidifierConfig extends BaseDeviceConfig {
  configDeviceType: 'Humidifier' | 'Humidifier2'
  hide_temperature?: boolean
  convertUnitTo?: string
  set_minStep?: number
  /**
   * When true (Humidifier2 only), exposes a Switch service in HomeKit
   * to trigger the built-in Drying Filter mode via OpenAPI (setMode 8).
   */
  activate_dryingfilter?: boolean
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
  configDeviceType: 'Smart Lock' | 'Smart Lock Pro' | 'Smart Lock Ultra'
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
  refreshRate?: number
  updateRate?: number
  pushRate?: number
  maxRetries?: number
  delayBetweenRetries?: number
  firmware?: string
  deviceId: string
  logging?: string
  customOn?: string
  customOff?: string
  /**
   * When true, applies this IR device's configuration to all other IR devices
   * of the same remoteType/configRemoteType (e.g., all IR Fans).
   * Specific per-device settings will override these template settings.
   */
  applyToAllDevicesOfType?: boolean
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
