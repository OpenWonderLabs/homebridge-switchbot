/* Copyright(C) 2017-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * settings.ts: @switchbot/homebridge-switchbot platform class.
 */
import type { IClientOptions } from 'async-mqtt'
import type { PlatformConfig } from 'homebridge'
import type { SwitchBotBLEModel, SwitchBotBLEModelFriendlyName, SwitchBotBLEModelName } from 'node-switchbot'

import type { device } from './types/devicelist'
import type { irdevice } from './types/irdevicelist'
/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = 'SwitchBot'

/**
 * This must match the name of your plugin as defined the package.json
 */
export const PLUGIN_NAME = '@switchbot/homebridge-switchbot'

/**
 * This is the main url used to access SwitchBot API
 */
export const Devices = 'https://api.switch-bot.com/v1.1/devices'

/**
 * This is the updateWebhook url used to access SwitchBot API
 */
export const setupWebhook = 'https://api.switch-bot.com/v1.1/webhook/setupWebhook'

/**
 * This is the updateWebhook url used to access SwitchBot API
 */
export const queryWebhook = 'https://api.switch-bot.com/v1.1/webhook/queryWebhook'

/**
 * This is the updateWebhook url used to access SwitchBot API
 */
export const updateWebhook = 'https://api.switch-bot.com/v1.1/webhook/updateWebhook'

/**
 * This is the deleteWebhook url used to access SwitchBot API
 */
export const deleteWebhook = 'https://api.switch-bot.com/v1.1/webhook/deleteWebhook'

// Config
export interface SwitchBotPlatformConfig extends PlatformConfig {
  credentials?: credentials
  options?: options
}
interface credentials {
  token?: any
  secret?: any
  notice?: any
  openToken?: any
}

export interface options {
  devices?: devicesConfig[]
  irdevices?: irDevicesConfig[]
  allowInvalidCharacters?: boolean
  mqttURL?: string
  mqttOptions?: IClientOptions
  mqttPubOptions?: IClientOptions
  BLE?: boolean
  webhookURL?: string
  maxRetries?: number
  delayBetweenRetries?: number
  refreshRate?: number
  updateRate?: number
  pushRate?: number
  logging?: string
};

export interface devicesConfig extends device {
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
  bot?: bot
  meter?: meter
  iosensor?: iosensor
  humidifier?: humidifier
  curtain?: curtain
  blindTilt?: blindTilt
  contact?: contact
  motion?: motion
  waterdetector?: waterdetector
  colorbulb?: colorbulb
  striplight?: striplight
  ceilinglight?: ceilinglight
  plug?: plug
  lock?: lock
  hub?: hub
}

interface meter {
  hide_temperature?: boolean
  convertUnitTo?: string
  hide_humidity?: boolean
};

interface iosensor {
  hide_temperature?: boolean
  convertUnitTo?: string
  hide_humidity?: boolean
};

interface bot {
  mode?: string
  deviceType?: string
  doublePress?: number
  pushRatePress?: number
  allowPush?: boolean
  multiPress?: boolean
};

interface humidifier {
  hide_temperature?: boolean
  set_minStep?: number
};

interface curtain {
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

interface blindTilt {
  mode?: string
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

interface contact {
  hide_lightsensor?: boolean
  set_minLux?: number
  set_maxLux?: number
  hide_motionsensor?: boolean
};

interface motion {
  hide_lightsensor?: boolean
  set_minLux?: number
  set_maxLux?: number
};

interface waterdetector {
  hide_leak?: boolean
  dry?: boolean
};

interface colorbulb {
  set_minStep?: number
  adaptiveLightingShift?: number
};

interface striplight {
  set_minStep?: number
  adaptiveLightingShift?: number
};

interface ceilinglight {
  set_minStep?: number
  adaptiveLightingShift?: number
};

type plug = object

interface lock {
  hide_contactsensor?: boolean
  activate_latchbutton?: boolean
};

interface hub {
  hide_temperature?: boolean
  convertUnitTo?: string
  hide_humidity?: boolean
  hide_lightsensor?: boolean
};

export interface irDevicesConfig extends irdevice {
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
  irfan?: irfan
  irair?: irair
  irpur?: Record<any, any>
  ircam?: Record<any, any>
  irlight?: irlight
  irvc?: Record<any, any>
  irwh?: Record<any, any>
  irtv?: Record<any, any>
  other?: other
}

interface irfan {
  swing_mode?: boolean
  rotation_speed?: boolean
  set_minStep?: number
  set_max?: number
  set_min?: number
};

interface irlight {
  stateless?: boolean
};

interface irair {
  hide_automode?: boolean
  set_max_heat?: number
  set_min_heat?: number
  set_max_cool?: number
  set_min_cool?: number
  meterType?: string
  meterId?: string
  meterUuid?: string
};

interface other {
  deviceType?: string
};
