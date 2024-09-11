/* Copyright(C) 2017-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * devicelist.ts: @switchbot/homebridge-switchbot platform class.
 */

export interface deviceList {
  device: device[]
}

export interface device {
  deviceId: string
  deviceName: string
  deviceType: string
  enableCloudService: boolean
  hubDeviceId: string
  version?: number
}

export type bot = device & {}

export type curtain = device & {
  curtainDevicesIds: string[]
  calibrate: boolean
  group: boolean
  master: boolean
  openDirection: string
}

export type curtain3 = device & {
  curtainDevicesIds: string[]
  calibrate: boolean
  group: boolean
  master: boolean
  openDirection?: string
}

export type hub2 = device & {}

export type meter = device & {}

export type meterPlus = device & {}

export type outdoorMeter = device & {}

export type lock = device & {
  group: boolean
  master: boolean
  groupName: string
  lockDevicesIds: string[]
}

export type lockPro = device & {
  group: boolean
  master: boolean
  groupName: string
  lockDevicesIds: string[]
}

export type keypad = device & {
  remoteType: string
  lockDeviceId: string
  keyList: keyList
}

export type keypadTouch = device & {
  remoteType: string
  lockDeviceId: string
  keyList: keyList
}

interface keyList {
  id: number
  name: string
  type: string
  password: string
  iv: string
  status: string
  createTime: number
}

export type remote = device & {}

export type motionSensor = device & {}

export type contactSensor = device & {}

export type waterLeakDetector = device & {}

export type ceilingLight = device & {}

export type ceilingLightPro = device & {}

export type plug = device & {}

export type plugMini = device & {}

export type stripLight = device & {}

export type colorBulb = device & {}

export type robotVacuumCleanerS1 = device & {}

export type robotVacuumCleanerS1Plus = device & {}

export type floorCleaningRobotS10 = device & {}

export type humidifier = device & {}

export type indoorCam = device & {}

export type pantiltCam = device & {}

export type pantiltCam2k = device & {}

export type blindTilt = device & {
  blindTiltDevicesIds: string[]
  calibrate: boolean
  group: boolean
  master: boolean
  direction: string
  slidePosition: number
}

export type batteryCirculatorFan = device & {}
