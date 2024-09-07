/* Copyright(C) 2017-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * irdevicelist.ts: @switchbot/homebridge-switchbot platform class.
 */
// a list of virtual infrared remote devices that are linked to SwitchBot Hubs.
export interface infraredRemoteList {
  device: irdevice[]
}

export interface irdevice {
  deviceId?: string
  deviceName: string
  remoteType: string
  hubDeviceId: string
}
