import type { SwitchBotPluginConfig } from './settings.js';
import type { API, Logger, PlatformConfig } from 'homebridge';
/**
 * Homebridge platform class for SwitchBot Matter integration.
 * Handles device discovery, registration, polling, and accessory lifecycle for Matter-enabled SwitchBot devices.
 *
 * @class SwitchBotMatterPlatform
 * @param {Logger} log - Homebridge logger instance
 * @param {PlatformConfig} config - Platform configuration object
 * @param {API} [api] - Optional Homebridge API instance
 * @property {API | undefined} api - Homebridge API instance
 * @property {Logger} log - Homebridge logger instance
 * @property {SwitchBotPluginConfig} config - Parsed plugin config
 * @property {any[]} devices - All created device instances
 * @property {Map<string, any>} accessories - Map of accessory UUID to accessory object
 * @property {string} lastConfigHash - Hash of last loaded config for change detection
 * @property {NodeJS.Timeout | null} configReloadInterval - Interval for periodic config reload
 * @property {Map<string, NodeJS.Timeout>} openApiPollTimers - Timers for per-device OpenAPI polling
 * @property {NodeJS.Timeout | null} openApiBatchTimer - Timer for batched OpenAPI polling
 * @property {number} openApiRequestsToday - Count of OpenAPI requests made today
 * @property {number} openApiLastReset - Timestamp (ms) of last OpenAPI daily counter reset
 */
export declare class SwitchBotMatterPlatform {
    /** Homebridge API instance */
    api: API | undefined;
    /** Homebridge logger instance */
    log: Logger;
    /** Parsed plugin config */
    config: SwitchBotPluginConfig;
    /** All created device instances */
    devices: any[];
    /** Map of accessory UUID to accessory object */
    accessories: Map<string, any>;
    /** Hash of last loaded config for change detection */
    private lastConfigHash;
    /** Interval for periodic config reload */
    private configReloadInterval;
    /** Timers for per-device OpenAPI polling */
    private openApiPollTimers;
    /** Timer for batched OpenAPI polling */
    private openApiBatchTimer;
    /** Count of OpenAPI requests made today */
    private openApiRequestsToday;
    /** Timestamp (ms) of last OpenAPI daily counter reset */
    private openApiLastReset;
    /**
     * Construct the SwitchBot Matter platform.
     * @param log Homebridge logger
     * @param config Platform config
     * @param api Homebridge API instance
     */
    constructor(log: Logger, config: PlatformConfig, api?: API);
    /**
     * Discover and create all device instances from config.
     * Populates this.devices and logs registration status for each device.
     *
     * @returns {Promise<void>} Resolves when all devices are loaded and registered
     */
    loadDevices(): Promise<void>;
    /**
     * Registers all Matter accessories with the Homebridge Matter API.
     *
     * This method is called after all device instances have been created. It handles both new and restored
     * accessories, updating their context, clusters, and other Matter-specific metadata as needed. Accessories
     * are registered with Homebridge using the Matter API, and the internal accessory map is updated accordingly.
     *
     * @param {Array<{created: any, d: any, type: string, useMatter: boolean, matterAvailable: boolean}>} createdDevices - Array of device descriptors:
     *   - created: The created device instance
     *   - d: The normalized device config object
     *   - type: The normalized device type string
     *   - useMatter: Whether Matter is enabled for this device
     *   - matterAvailable: Whether Matter is available on this bridge
     * @returns {Promise<void>} Resolves when registration is complete
     *
     * Differences from HAP registration:
     *   - Uses the Matter API (not HAP API) for accessory registration.
     *   - Adds Matter clusters and handlers to each accessory based on the device descriptor.
     *   - Only registers accessories where Matter is enabled and supported.
     *   - Accessory context and cluster wiring are Matter-specific.
     *
     * If the Homebridge Matter API is not available, registration is skipped and a log message is emitted.
     * Accessories that are not enabled for Matter are ignored.
     */
    registerMatterAccessories(createdDevices: {
        created: any;
        d: any;
        type: string;
        useMatter: boolean;
        matterAvailable: boolean;
    }[]): Promise<void>;
    /**
     * Returns the timestamp (ms) of the last OpenAPI daily counter reset.
     * @returns {number} Timestamp in ms
     */
    getOpenApiLastReset(): number;
    /**
     * Logs the last OpenAPI reset time in a human-readable format.
     * @returns {void}
     */
    logOpenApiLastReset(): void;
    /**
     * Compute a hash of the current device config for change detection.
     * @returns {string} JSON string hash of device config
     */
    private getConfigHash;
    /**
     * Reload devices if config has changed since last load.
     * Unregisters accessories and removes devices no longer in config.
     * Calls loadDevices to repopulate devices and accessories.
     *
     * @returns {Promise<void>} Resolves when reload is complete
     */
    private checkAndReloadDevices;
    /**
     * Cleanup method to clear config reload interval on shutdown.
     * Called by Homebridge on shutdown event.
     * @returns {void}
     */
    shutdown(): void;
    /**
     * Setup OpenAPI polling for all devices according to config (global, per-device, batch, rate limit).
     * Handles daily request limits, per-device and batch polling, and resets.
     *
     * @returns {void}
     */
    private _setupOpenApiPolling;
    /**
     * Called by Homebridge to restore cached Matter accessories on startup.
     * @param {any} accessory - The cached accessory object
     * @returns {Promise<void>} Resolves when accessory is restored
     */
    configureAccessory(accessory: any): Promise<void>;
    /**
     * Called by Homebridge to restore cached Matter accessories (alternate signature).
     * @param {any} accessory - The cached accessory object
     * @returns {void}
     */
    configureMatterAccessory(accessory: any): void;
}
export default SwitchBotMatterPlatform;
//# sourceMappingURL=SwitchBotMatterPlatform.d.ts.map