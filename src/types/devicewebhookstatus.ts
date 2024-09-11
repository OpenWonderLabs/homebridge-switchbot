/* Copyright(C) 2017-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * devicestatus.ts: @switchbot/homebridge-switchbot platform class.
 */
interface deviceWebhook {
  eventType: string
  eventVersion: string
  context: deviceWebhookContext
}

export { deviceWebhook }

export interface deviceWebhookContext {
  // properties on all devices
  deviceMac: string
  deviceType: string
  timeOfSample: number
}

export type botWebhookContext = deviceWebhookContext & {
  power: string // "on"or"off"
  battery: number
  deviceMode: 'pressMode' | 'switchMode' | 'customizeMode'
}

export type curtainWebhookContext = deviceWebhookContext & {
  calibrate: boolean
  group: boolean
  slidePosition: number // 0~100
  battery: number
}

export type curtain3WebhookContext = deviceWebhookContext & {
  calibrate: boolean
  group: boolean
  slidePosition: number // 0~100
  battery: number
}

export type motionSensorWebhookContext = deviceWebhookContext & {
  detectionState: 'NOT_DETECTED' | 'DETECTED'
}

export type contactSensorWebhookContext = deviceWebhookContext & {
  detectionState: 'NOT_DETECTED' | 'DETECTED'
  doorMode: 'IN_DOOR' | 'OUT_DOOR'
  brightness: 'dim' | 'bright'
  openState: 'open' | 'close' | 'timeOutNotClose'
}

export type waterLeakDetectorWebhookContext = deviceWebhookContext & {
  detectionState: 0 | 1
  battery: number // 0~100
}

export type meterWebhookContext = deviceWebhookContext & {
  temperature: number
  scale: 'CELSIUS' | 'FAHRENHEIT'
  humidity: number
}

export type meterPlusWebhookContext = deviceWebhookContext & {
  temperature: number
  scale: 'CELSIUS' | 'FAHRENHEIT'
  humidity: number
}

export type outdoorMeterWebhookContext = deviceWebhookContext & {
  temperature: number
  scale: 'CELSIUS' | 'FAHRENHEIT'
  humidity: number
}

export type lockWebhookContext = deviceWebhookContext & {
  lockState: 'UNLOCKED' | 'LOCKED' | 'JAMMED'
}

export type lockProWebhookContext = deviceWebhookContext & {
  lockState: 'UNLOCKED' | 'LOCKED' | 'JAMMED'
}

export type indoorCameraWebhookContext = deviceWebhookContext & {
  detectionState: 'DETECTED'
}

export type panTiltCamWebhookContext = deviceWebhookContext & {
  detectionState: 'DETECTED'
}

export type colorBulbWebhookContext = deviceWebhookContext & {
  powerState: 'ON' | 'OFF'
  brightness: number
  color: string // RGB 255:255:255
  colorTemperature: number // 2700~6500
}

export type stripLightWebhookContext = deviceWebhookContext & {
  powerState: 'ON' | 'OFF'
  brightness: number
  color: string // RGB 255:255:255
}

export type plugWebhookContext = deviceWebhookContext & {
  powerState: 'ON' | 'OFF'
}

export type plugMiniUSWebhookContext = deviceWebhookContext & {
  powerState: 'ON' | 'OFF'
}

export type plugMiniJPWebhookContext = deviceWebhookContext & {
  powerState: 'ON' | 'OFF'
}

export type robotVacuumCleanerS1WebhookContext = deviceWebhookContext & {
  workingStatus: 'Standby' | 'Clearing' | 'Paused' | 'GotoChargeBase' | 'Charging' | 'ChargeDone' | 'Dormant' | 'InTrouble' | 'InRemoteControl' | 'InDustCollecting'
  onlineStatus: 'online' | 'offline'
  battery: number // 0~100
}

export type robotVacuumCleanerS1PlusWebhookContext = deviceWebhookContext & {
  workingStatus: 'Standby' | 'Clearing' | 'Paused' | 'GotoChargeBase' | 'Charging' | 'ChargeDone' | 'Dormant' | 'InTrouble' | 'InRemoteControl' | 'InDustCollecting'
  onlineStatus: 'online' | 'offline'
  battery: number // 0~100
}

export type floorCleaningRobotS10WebhookContext = deviceWebhookContext & {
  workingStatus: 'Standby' | 'Clearing' | 'Paused' | 'GotoChargeBase' | 'Charging' | 'ChargeDone' | 'Dormant' | 'InTrouble' | 'InRemoteControl' | 'InDustCollecting'
  onlineStatus: 'online' | 'offline'
  battery: number // 0~100
  waterBaseBattery: number // 0~100
  taskType: 'standBy' | 'explore' | 'cleanAll' | 'cleanArea' | 'cleanRoom' | 'fillWater' | 'deepWashing' | 'backToCharge' | 'markingWaterBase' | 'drying' | 'collectDust' | 'remoteControl' | 'cleanWithExplorer' | 'fillWaterForHumi' | 'markingHumi'
}

export type ceilingLightWebhookContext = deviceWebhookContext & {
  powerState: 'ON' | 'OFF'
  brightness: number
  colorTemperature: number // 2700~6500
}

export type ceilingLightProWebhookContext = deviceWebhookContext & {
  powerState: 'ON' | 'OFF'
  brightness: number
  colorTemperature: number // 2700~6500
}

export type keypadWebhookContext = deviceWebhookContext & {
  eventName: 'createKey' | 'deleteKey'
  commandId: string
  result: 'success' | 'failed' | 'timeout'
}

export type keypadTouchWebhookContext = deviceWebhookContext & {
  eventName: 'createKey' | 'deleteKey'
  commandId: string
  result: 'success' | 'failed' | 'timeout'
}

export type hub2WebhookContext = deviceWebhookContext & {
  temperature: number
  humidity: number
  lightLevel: number
  scale: 'CELSIUS' | 'FAHRENHEIT'
}

export type batteryCirculatorFanWebhookContext = deviceWebhookContext & {
  mode: 'direct' | 'natural' | 'sleep' | 'baby'
  version: string
  battery: number
  powerState: 'ON' | 'OFF'
  nightStatus: 'off' | 1 | 2
  oscillation: 'on' | 'off'
  verticalOscillation: 'on' | 'off'
  chargingStatus: 'charging' | 'uncharged'
  fanSpeed: number // 1~100
}

export type blindTiltWebhookContext = deviceWebhookContext & {
  version: string
  calibrate: boolean
  group: boolean
  direction: string
  slidePosition: number // 0~100
  battery: number
}

export type humidifierWebhookContext = deviceWebhookContext & {
  temperature: number
  humidity: number
  scale: 'CELSIUS' | 'FAHRENHEIT'
}
