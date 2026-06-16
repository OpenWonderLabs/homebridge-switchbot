import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { SwitchBotHAPPlatform } from './SwitchBotHAPPlatform.js';
import { SwitchBotMatterPlatform } from './SwitchBotMatterPlatform.js';
import { createPlatformProxy } from './utils.js';
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
export default (api) => {
    const ProxyCtor = createPlatformProxy(SwitchBotHAPPlatform, SwitchBotMatterPlatform);
    api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, ProxyCtor);
};
//# sourceMappingURL=index.js.map