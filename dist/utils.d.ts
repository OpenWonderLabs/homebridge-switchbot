import type { SwitchBotPluginConfig } from './settings.js';
import type { Logger, PlatformConfig } from 'homebridge';
/**
 * Indicates which device types should prefer Matter if available.
 * Based on HAP service mappings: device implementations use specific HomeKit services
 * that map to corresponding Matter clusters when Matter is enabled.
 *
 * @property {boolean} [deviceType] - True if the device type supports Matter, false otherwise.
 * @example
 * DEVICE_MATTER_SUPPORTED['bot'] // true
 */
/**
 * Factory function to create Matter handlers with Homebridge logger integration.
 * Returns handler objects for supported device types, mapping Matter cluster actions to SwitchBot API calls.
 *
 * @param log - Homebridge logger instance
 * @param deviceId - SwitchBot device ID
 * @param type - Device type string
 * @param client - SwitchBot client instance
 * @returns Handler object for Matter clusters
 */
export declare const DEVICE_MATTER_SUPPORTED: Record<string, boolean>;
/**
 * Default Matter cluster configurations by device type.
 * Maps device types to their Matter cluster states (used when device doesn't provide clusters).
 * Note: wosweeper/curtain/plug variants are normalized before cluster lookup (see loadDevices).
 *
 * @property {object} [deviceType] - The default cluster state for the device type.
 * @example
 * DEVICE_MATTER_CLUSTERS['bot'] // { onOff: { onOff: false } }
 */
export declare const DEVICE_MATTER_CLUSTERS: Record<string, any>;
export declare function createMatterHandlers(log: Logger, deviceId: string, type: string, client: any): any;
export declare function resolveMatterDeviceType(matterApi: any, type: string, createdDeviceType?: any, clusters?: any): any;
/**
 * Canonical Matter cluster ID mapping (from matter.js clusters).
 * Maps cluster names to their numeric cluster IDs.
 *
 * @example
 * MATTER_CLUSTER_IDS.OnOff // 0x0006
 */
export declare const MATTER_CLUSTER_IDS: {
    readonly OnOff: 6;
    readonly LevelControl: 8;
    readonly ColorControl: 768;
    readonly WindowCovering: 258;
    readonly DoorLock: 257;
    readonly FanControl: 514;
    readonly RelativeHumidityMeasurement: 1029;
};
/**
 * Common Matter attribute IDs grouped by cluster.
 * Maps cluster names to objects mapping attribute names to their numeric attribute IDs.
 *
 * @example
 * MATTER_ATTRIBUTE_IDS.OnOff.OnOff // 0x0000
 */
export declare const MATTER_ATTRIBUTE_IDS: {
    readonly OnOff: {
        readonly OnOff: 0;
    };
    readonly LevelControl: {
        readonly CurrentLevel: 0;
    };
    readonly ColorControl: {
        readonly CurrentHue: 0;
        readonly CurrentSaturation: 1;
        readonly ColorTemperatureMireds: 2;
    };
    readonly WindowCovering: {
        readonly CurrentPosition: 0;
        readonly TargetPosition: 1;
    };
    readonly FanControl: {
        readonly SpeedCurrent: 0;
    };
    readonly DoorLock: {
        readonly LockState: 0;
    };
    readonly RelativeHumidityMeasurement: {
        readonly MeasuredValue: 0;
    };
};
/**
 * Normalizes a device type string for Matter integration.
 * Maps various device type aliases and variants to canonical Matter device types.
 *
 * @param {string | undefined | null} typeValue - The device type string to normalize.
 * @returns {string} The normalized device type string for Matter.
 *
 * @example
 * normalizeTypeForMatter('wosweeper') // 'vacuum'
 * normalizeTypeForMatter('curtain3') // 'curtain'
 * normalizeTypeForMatter('plug mini (us)') // 'plug'
 */
export declare function normalizeTypeForMatter(typeValue: string | undefined | null): string;
/**
 * Normalizes a Homebridge PlatformConfig object to a SwitchBotPluginConfig.
 *
 * @param raw The raw Homebridge platform config object.
 * @returns The normalized plugin config object.
 */
export declare function normalizeConfig(raw?: PlatformConfig): SwitchBotPluginConfig;
/**
 * Creates a proxy class that instantiates the correct platform implementation (HAP or Matter) at runtime.
 *
 * @param HAPPlatform The HAP platform class constructor.
 * @param MatterPlatform The Matter platform class constructor.
 * @returns A proxy class that delegates to the correct platform implementation.
 *
 * @class SwitchBotPlatformProxy
 * @property impl The instantiated platform implementation (HAP or Matter).
 */
export declare function createPlatformProxy(HAPPlatform: any, MatterPlatform: any): any;
//# sourceMappingURL=utils.d.ts.map