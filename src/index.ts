/* Copyright(C) 2021-2024, SwitchBot (https://github.com/SwitchBot). All rights reserved.
 *
 * index.ts: @switchbot/homebridge-switchbot plugin registration.
 */
import type { API } from 'homebridge'

import { SwitchBotHAPPlatform } from './platform-hap.js'
import { SwitchBotMatterPlatform } from './platform-matter.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'
import { createPlatformProxy } from './utils.js'

// Register our platform with homebridge.
export default (api: API): void => {
  // Create and register a small proxy that selects the correct platform (HAP or Matter) at runtime.
  const ProxyCtor = createPlatformProxy(SwitchBotHAPPlatform, SwitchBotMatterPlatform)
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, ProxyCtor as any)
}
