/* Copyright(C) 2021-2024, SwitchBot (https://github.com/SwitchBot). All rights reserved.
 *
 * index.ts: @switchbot/homebridge-switchbot plugin registration.
 */
import { SwitchBotPlatform } from './platform.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

import type { API } from 'homebridge';

// Register our platform with homebridge.
export default (api: API): void => {

  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, SwitchBotPlatform);
};
