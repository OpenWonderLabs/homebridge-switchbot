/* Copyright(C) 2021-2024, SwitchBot (https://github.com/SwitchBot). All rights reserved.
 *
 * index.ts: @switchbot/homebridge-switchbot plugin registration.
 */
import type { API } from 'homebridge'

import { SwitchBotHAPPlatform } from './Platform.HAP.js'
import { SwitchBotMatterPlatform } from './Platform.Matter.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'
import { createPlatformProxy } from './utils.js'

/**
 * Registers the SwitchBot platform with Homebridge.
 *
 * @param api The Homebridge API instance.
 * @property {string} PLATFORM_NAME - The Homebridge platform name.
 * @property {string} PLUGIN_NAME - The Homebridge plugin name.
 * @property {typeof SwitchBotHAPPlatform} SwitchBotHAPPlatform - The HAP platform class.
 * @property {typeof SwitchBotMatterPlatform} SwitchBotMatterPlatform - The Matter platform class.
 * @property {Function} createPlatformProxy - Factory for the platform proxy constructor.
 */
export default (api: API): void => {
  const ProxyCtor = createPlatformProxy(SwitchBotHAPPlatform, SwitchBotMatterPlatform)
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, ProxyCtor as any)
}
