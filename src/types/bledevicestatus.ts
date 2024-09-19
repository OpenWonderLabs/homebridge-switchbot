/* Copyright(C) 2017-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * bledevicestatus.ts: @switchbot/homebridge-switchbot platform class.
 */
import type { MacAddress } from 'homebridge'
import type { SwitchBotBLEModel, SwitchBotBLEModelFriendlyName, SwitchBotBLEModelName } from 'node-switchbot'

export interface switchbot {
  discover: (arg0: { duration?: any, model: string, quick: boolean, id?: MacAddress }) => Promise<any>
  wait: (arg0: number) => any
}

export interface ad {
  id: string
  address: string
  rssi: number
  serviceData: botServiceData | colorBulbServiceData | contactSensorServiceData | curtainServiceData | curtain3ServiceData | stripLightServiceData | lockServiceData | lockProServiceData | meterServiceData | meterPlusServiceData | motionSensorServiceData | outdoorMeterServiceData | plugMiniUSServiceData | plugMiniJPServiceData | blindTiltServiceData | ceilingLightServiceData | ceilingLightProServiceData | hub2ServiceData | batteryCirculatorFanServiceData | waterLeakDetectorServiceData | humidifierServiceData | robotVacuumCleanerServiceData
}

interface serviceData {
  model: string
  modelName: string
}

export type botServiceData = serviceData & {
  model: SwitchBotBLEModel.Bot
  modelName: SwitchBotBLEModelName.Bot
  modelFriendlyName: SwitchBotBLEModelFriendlyName.Bot
  mode: string
  state: boolean
  battery: number
}

export type colorBulbServiceData = serviceData & {
  model: SwitchBotBLEModel.ColorBulb
  modelName: SwitchBotBLEModelName.ColorBulb
  modelFriendlyName: SwitchBotBLEModelFriendlyName.ColorBulb
  color_temperature: number
  power: boolean
  state: boolean
  red: number
  green: number
  blue: number
  brightness: number
  delay: number
  preset: number
  color_mode: number
  speed: number
  loop_index: number
}

export type contactSensorServiceData = serviceData & {
  model: SwitchBotBLEModel.ContactSensor
  modelName: SwitchBotBLEModelName.ContactSensor
  modelFriendlyName: SwitchBotBLEModelFriendlyName.ContactSensor
  movement: boolean
  tested: boolean
  battery: number
  contact_open: boolean
  contact_timeout: boolean
  lightLevel: string
  button_count: number
  doorState: string
}

export type curtainServiceData = serviceData & {
  model: SwitchBotBLEModel.Curtain
  modelName: SwitchBotBLEModelName.Curtain
  modelFriendlyName: SwitchBotBLEModelFriendlyName.Curtain
  calibration: boolean
  battery: number
  inMotion: boolean
  position: number
  lightLevel: number
  deviceChain: number
}

export type curtain3ServiceData = serviceData & {
  model: SwitchBotBLEModel.Curtain3
  modelName: SwitchBotBLEModelName.Curtain3
  modelFriendlyName: SwitchBotBLEModelFriendlyName.Curtain3
  calibration: boolean
  battery: number
  inMotion: boolean
  position: number
  lightLevel: number
  deviceChain: number
}

export type stripLightServiceData = serviceData & {
  model: SwitchBotBLEModel.StripLight
  modelName: SwitchBotBLEModelName.StripLight
  modelFriendlyName: SwitchBotBLEModelFriendlyName.StripLight
  power: boolean
  state: boolean
  red: number
  green: number
  blue: number
  brightness: number
  delay: number
  preset: number
  color_mode: number
  speed: number
  loop_index: number
}

export type lockServiceData = serviceData & {
  model: SwitchBotBLEModel.Lock
  modelName: SwitchBotBLEModelName.Lock
  modelFriendlyName: SwitchBotBLEModelFriendlyName.Lock
  battery: number
  calibration: boolean
  status: string
  update_from_secondary_lock: boolean
  door_open: string
  double_lock_mode: boolean
  unclosed_alarm: boolean
  unlocked_alarm: boolean
  auto_lock_paused: boolean
  night_latch: boolean
}

export type lockProServiceData = serviceData & {
  model: SwitchBotBLEModel.LockPro
  modelName: SwitchBotBLEModelName.LockPro
  modelFriendlyName: SwitchBotBLEModelFriendlyName.LockPro
  battery: number
  calibration: boolean
  status: string
  update_from_secondary_lock: boolean
  door_open: string
  double_lock_mode: boolean
  unclosed_alarm: boolean
  unlocked_alarm: boolean
  auto_lock_paused: boolean
  night_latch: boolean
}

export type meterServiceData = serviceData & {
  model: SwitchBotBLEModel.Meter
  modelName: SwitchBotBLEModelName.Meter
  modelFriendlyName: SwitchBotBLEModelFriendlyName.Meter
  celsius: number
  fahrenheit: number
  fahrenheit_mode: boolean
  humidity: number
  battery: number
}

export type meterPlusServiceData = serviceData & {
  model: SwitchBotBLEModel.MeterPlus
  modelName: SwitchBotBLEModelName.MeterPlus
  modelFriendlyName: SwitchBotBLEModelFriendlyName.MeterPlus
  celsius: number
  fahrenheit: number
  fahrenheit_mode: boolean
  humidity: number
  battery: number
}

export type outdoorMeterServiceData = serviceData & {
  model: SwitchBotBLEModel.OutdoorMeter
  modelName: SwitchBotBLEModelName.OutdoorMeter
  modelFriendlyName: SwitchBotBLEModelFriendlyName.OutdoorMeter
  celsius: number
  fahrenheit: number
  fahrenheit_mode: boolean
  humidity: number
  battery: number
}

export type motionSensorServiceData = serviceData & {
  model: SwitchBotBLEModel.MotionSensor
  modelName: SwitchBotBLEModelName.MotionSensor
  modelFriendlyName: SwitchBotBLEModelFriendlyName.MotionSensor
  tested: boolean
  movement: boolean
  battery: number
  led: number
  iot: number
  sense_distance: number
  lightLevel: string
  is_light: boolean
}

export type plugMiniUSServiceData = serviceData & {
  model: SwitchBotBLEModel.PlugMiniUS
  modelName: SwitchBotBLEModelName.PlugMini
  modelFriendlyName: SwitchBotBLEModelFriendlyName.PlugMini
  state: string
  delay: boolean
  timer: boolean
  syncUtcTime: boolean
  wifiRssi: number
  overload: boolean
  currentPower: number
}

export type plugMiniJPServiceData = serviceData & {
  model: SwitchBotBLEModel.PlugMiniUS
  modelName: SwitchBotBLEModelName.PlugMini
  modelFriendlyName: SwitchBotBLEModelFriendlyName.PlugMini
  state: string
  delay: boolean
  timer: boolean
  syncUtcTime: boolean
  wifiRssi: number
  overload: boolean
  currentPower: number
}

export type blindTiltServiceData = serviceData & {
  model: SwitchBotBLEModel.BlindTilt
  modelName: SwitchBotBLEModelName.BlindTilt
  modelFriendlyName: SwitchBotBLEModelFriendlyName.BlindTilt
  calibration: boolean
  battery: number
  inMotion: boolean
  tilt: number
  lightLevel: number
}

export type ceilingLightServiceData = serviceData & {
  model: SwitchBotBLEModel.CeilingLight
  modelName: SwitchBotBLEModelName.CeilingLight
  modelFriendlyName: SwitchBotBLEModelFriendlyName.CeilingLight
  color_temperature: number
  power: boolean
  state: boolean
  red: number
  green: number
  blue: number
  brightness: number
  delay: number
  preset: number
  color_mode: number
  speed: number
  loop_index: number
}

export type ceilingLightProServiceData = serviceData & {
  model: SwitchBotBLEModel.CeilingLightPro
  modelName: SwitchBotBLEModelName.CeilingLightPro
  modelFriendlyName: SwitchBotBLEModelFriendlyName.CeilingLightPro
  color_temperature: number
  power: boolean
  state: boolean
  red: number
  green: number
  blue: number
  brightness: number
  delay: number
  preset: number
  color_mode: number
  speed: number
  loop_index: number
}

export type hub2ServiceData = serviceData & {
  model: SwitchBotBLEModel.Hub2
  modelName: SwitchBotBLEModelName.Hub2
  modelFriendlyName: SwitchBotBLEModelFriendlyName.Hub2
  celsius: number
  fahrenheit: number
  fahrenheit_mode: boolean
  humidity: number
  lightLevel: number
}

export type batteryCirculatorFanServiceData = serviceData & {
  model: SwitchBotBLEModel.Unknown
  modelName: SwitchBotBLEModelName.Unknown
  modelFriendlyName: SwitchBotBLEModelFriendlyName.Unknown
  state: string
  fanSpeed: number
}

export type waterLeakDetectorServiceData = serviceData & {
  model: SwitchBotBLEModel.Unknown
  modelName: SwitchBotBLEModelName.Unknown
  modelFriendlyName: SwitchBotBLEModelFriendlyName.Unknown
  state: boolean
  status: number
  battery: number
}

export type humidifierServiceData = serviceData & {
  model: SwitchBotBLEModel.Humidifier
  modelName: SwitchBotBLEModelName.Humidifier
  modelFriendlyName: SwitchBotBLEModelFriendlyName.Humidifier
  onState: boolean
  autoMode: boolean
  percentage: number
  humidity: number
}

export type robotVacuumCleanerServiceData = serviceData & {
  model: SwitchBotBLEModel.Unknown
  modelName: SwitchBotBLEModelName.Unknown
  modelFriendlyName: SwitchBotBLEModelFriendlyName.Unknown
  state: string
  battery: number
}
