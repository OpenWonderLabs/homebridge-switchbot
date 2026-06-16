/**
 * Ensure required fields are present on the SwitchBot platform config
 */
export declare function enforcePlatformConfigFields(platform: any): void;
import type { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
export declare const SWITCHBOT_PLATFORM_REGEX: RegExp;
/**
 * Get reference to the devices array in platform config
 */
export declare function getDevicesRef(platform: any): any[];
/**
 * Get all device arrays from platform config
 */
export declare function getDeviceArrays(platform: any): any[][];
/**
 * Get all unique devices from platform config
 */
export declare function getAllDevices(platform: any): any[];
/**
 * Get credential from platform config
 */
export declare function getCredential(platform: any, key: 'openApiToken' | 'openApiSecret'): string | undefined;
/**
 * Set credential in platform config
 */
export declare function setCredential(platform: any, key: 'openApiToken' | 'openApiSecret', value: string): void;
/**
 * Find and parse the SwitchBot platform config from Homebridge config file
 */
export declare function getSwitchBotPlatformConfig(server: HomebridgePluginUiServer): Promise<{
    platform: any;
    cfg: any;
    cfgPath: string;
}>;
/**
 * Save the Homebridge config file
 */
export declare function saveConfig(cfgPath: string, cfg: any): Promise<void>;
//# sourceMappingURL=config-parser.d.ts.map