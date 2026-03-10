/* Copyright(C) 2021-2024, SwitchBot (https://github.com/SwitchBot). All rights reserved.
 *
 * index.ts: @switchbot/homebridge-switchbot plugin registration.
 */
import type { API } from 'homebridge'

import { SwitchBotHAPPlatform, SwitchBotMatterPlatform } from './platform.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'
import { createPlatformProxy } from './utils.js'

// Register our platform with homebridge.
export default (api: API): void => {
  const ProxyCtor = createPlatformProxy(SwitchBotHAPPlatform, SwitchBotMatterPlatform)
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, ProxyCtor as any)
}
