import { createDevice } from './deviceFactory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { SwitchBotClient } from './switchbotClient.js';
import { normalizeTypeForMatter } from './utils.js';
/**
 * Homebridge platform class for SwitchBot HAP (HomeKit Accessory Protocol) integration.
 * Handles device discovery, registration, polling, and accessory lifecycle for HAP-enabled SwitchBot devices.
 *
 * @class SwitchBotHAPPlatform
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
export class SwitchBotHAPPlatform {
    /** Homebridge API instance */
    api;
    /** Homebridge logger instance */
    log;
    /** Parsed plugin config */
    config;
    /** All created device instances */
    devices = [];
    /** Map of accessory UUID to accessory object */
    accessories;
    /** Hash of last loaded config for change detection */
    lastConfigHash = '';
    /** Interval for periodic config reload */
    configReloadInterval = null;
    /** Timers for per-device OpenAPI polling */
    openApiPollTimers = new Map();
    /** Timer for batched OpenAPI polling */
    openApiBatchTimer = null;
    /** Count of OpenAPI requests made today */
    openApiRequestsToday = 0;
    /** Timestamp (ms) of last OpenAPI daily counter reset */
    openApiLastReset = 0;
    /**
     * Construct the SwitchBot HAP platform.
     * @param log Homebridge logger
     * @param config Platform config
     * @param api Homebridge API instance
     */
    constructor(log, config, api) {
        this.log = log;
        // Ensure both log and logger are set for downstream device constructors
        this.config = { ...config, log, logger: log };
        this.api = api;
        this.accessories = new Map();
        this.log.info('SwitchBot HAP platform initialized');
        // Create/shared SwitchBot client and attach to config so child devices reuse it.
        try {
            const client = new SwitchBotClient(this.config);
            void client.init();
            this.config._client = client;
        }
        catch (e) {
            this.log.debug('Failed to create shared SwitchBot client', e);
        }
        // Wait for Homebridge to finish launching to create/register accessories
        if (this.api && typeof this.api.on === 'function') {
            this.api.on('didFinishLaunching', async () => {
                await this.loadDevices();
                this._setupOpenApiPolling();
                // Start periodic config reload to pick up UI changes
                this.configReloadInterval = setInterval(() => {
                    void this.checkAndReloadDevices();
                }, 10000); // Check every 10 seconds
                // Listen for Homebridge shutdown to clear interval
                if (typeof this.api.on === 'function') {
                    this.api.on('shutdown', () => {
                        this.shutdown();
                    });
                }
            });
        }
        else {
            void this.loadDevices();
            this._setupOpenApiPolling();
            // Start periodic config reload to pick up UI changes
            this.configReloadInterval = setInterval(() => {
                void this.checkAndReloadDevices();
            }, 10000); // Check every 10 seconds
        }
    }
    /**
     * Discover and create all device instances from config.
     * Populates this.devices and registers HAP accessories for each device.
     * Ensures Matter API is loaded before loading devices if available.
     *
     * @returns {Promise<void>} Resolves when all devices are loaded and registered
     */
    async loadDevices() {
        // Matter API readiness logic (hybrid only)
        const maxAttempts = 20;
        let attempt = 0;
        let matterLoaded = false;
        if (this.api && typeof this.api.isMatterAvailable === 'function' && typeof this.api.isMatterEnabled === 'function' && typeof this.api.loadMatterAPI === 'function') {
            if (this.api.isMatterAvailable() && this.api.isMatterEnabled()) {
                try {
                    await this.api.loadMatterAPI();
                    this.log.info('Homebridge Matter API loaded successfully');
                }
                catch (e) {
                    this.log.warn('Failed to load Homebridge Matter API', e);
                }
                while (attempt < maxAttempts) {
                    if (this.api.matter) {
                        matterLoaded = true;
                        break;
                    }
                    await new Promise(res => setTimeout(res, 500));
                    attempt++;
                }
                if (!matterLoaded) {
                    this.log.warn('Matter API did not become available after loadMatterAPI()');
                }
            }
        }
        const newHash = this.getConfigHash();
        if (newHash === this.lastConfigHash) {
            this.log.debug('Config unchanged, skipping device reload');
            return;
        }
        const devices = this.config?.devices ?? [];
        const createdDevices = [];
        for (const raw of devices) {
            // Normalize config keys from UI schema to internal shape (for cross-platform consistency)
            const d = {
                id: raw.deviceId ?? raw.id,
                name: raw.configDeviceName ?? raw.name,
                type: raw.configDeviceType ?? raw.type ?? raw.deviceType ?? 'unknown',
                encryptionKey: raw.encryptionKey,
                keyId: raw.keyId,
                _raw: raw,
            };
            const type = normalizeTypeForMatter(d.type);
            const deviceOpts = { id: d.id, type, name: d.name, encryptionKey: d.encryptionKey, keyId: d.keyId, log: this.log };
            this.log.debug(`[HAP/Debug] Device options for ${d.name ?? d.id}:`, JSON.stringify(deviceOpts, null, 2));
            try {
                const created = await createDevice(deviceOpts, this.config, false);
                this.devices.push(created);
                createdDevices.push({ created, d, type });
            }
            catch (e) {
                this.log.error(`Failed to create HAP device ${d.id}:`, e instanceof Error ? e.stack || e.message : e);
            }
        }
        // Register HAP accessories after all devices are created for symmetry with Matter platform
        await this.registerHAPAccessories(createdDevices);
        this.lastConfigHash = newHash;
    }
    /**
     * Registers all HAP accessories with the Homebridge HAP API.
     *
     * This method is called after all device instances have been created. It handles both new and restored
     * accessories, updating their context and adding or updating HAP services and characteristics as needed.
     * Accessories are registered with Homebridge using the HAP API, and the internal accessory map is updated accordingly.
     *
     * @param {Array<{created: any, d: any, type: string}>} createdDevices - Array of device descriptors:
     *   - created: The created device instance
     *   - d: The normalized device config object
     *   - type: The normalized device type string
     * @returns {Promise<void>} Resolves when registration is complete
     *
     * Differences from Matter registration:
     *   - Uses the HAP API (not Matter API) for accessory registration.
     *   - Adds HAP services and characteristics to each accessory based on the device descriptor.
     *   - Does not require or check for Matter support or availability.
     *   - Accessory context and service wiring are HAP-specific.
     *
     * If the Homebridge HAP API is not available, registration is skipped and a log message is emitted.
     */
    async registerHAPAccessories(createdDevices) {
        if (!this.api || !this.api.hap || typeof this.api.registerPlatformAccessories !== 'function') {
            this.log.info('HAP API not available to register accessories');
            return;
        }
        const hap = this.api.hap;
        const accessoriesToRegister = [];
        for (const { created, d, type } of createdDevices) {
            try {
                const uuid = hap.uuid.generate(`${d.id}`);
                let accessory = this.accessories.get(uuid);
                if (!accessory) {
                    for (const [, a] of this.accessories.entries()) {
                        try {
                            if (a && a.context && a.context.deviceId === d.id) {
                                accessory = a;
                                break;
                            }
                        }
                        catch (e) {
                            // ignore
                        }
                    }
                }
                if (!accessory) {
                    accessory = new this.api.platformAccessory(d.name || type, uuid);
                    try {
                        accessory.context = accessory.context || {};
                        accessory.context.deviceId = d.id;
                        accessory.context.type = type;
                    }
                    catch (e) {
                        // ignore context failures
                    }
                    accessoriesToRegister.push(accessory);
                    this.accessories.set(uuid, accessory);
                }
                else {
                    try {
                        accessory.context = accessory.context || {};
                        accessory.context.deviceId = accessory.context.deviceId || d.id;
                        accessory.context.type = accessory.context.type || type;
                        accessory.deviceType = type;
                        const accDesc = await created.createAccessory?.(this.api);
                        accessory.displayName = (accDesc && accDesc.name) || d.name || type;
                        accessory.manufacturer = (accDesc && accDesc.manufacturer) || accessory.manufacturer || 'SwitchBot';
                        accessory.model = (accDesc && accDesc.model) || accessory.model || type;
                        accessory.serialNumber = (accDesc && accDesc.serialNumber) || accessory.serialNumber || d.id;
                        accessory.firmwareRevision = (accDesc && accDesc.firmwareRevision) || accessory.firmwareRevision || '1.0.0';
                        accessory.hardwareRevision = (accDesc && accDesc.hardwareRevision) || accessory.hardwareRevision || '';
                        accessory.UUID = accessory.UUID || accessory.uuid || uuid;
                    }
                    catch (e) {
                        // ignore
                    }
                }
                // Add basic service descriptor from device (symmetrical to Matter: remove stale services/chars)
                const accDesc = await created.createAccessory?.(this.api);
                if (accDesc && accDesc.services) {
                    const serviceTypes = accDesc.services.map((s) => s.type);
                    for (const existingService of accessory.services.slice()) {
                        if (existingService.constructor && existingService.constructor.name && !serviceTypes.includes(existingService.constructor.name)) {
                            accessory.removeService(existingService);
                        }
                    }
                    for (const s of accDesc.services) {
                        const Service = hap.Service[s.type] || hap.Service[s.type];
                        if (!Service) {
                            continue;
                        }
                        const service = accessory.getService(Service) || accessory.addService(Service);
                        const charNames = Object.keys(s.characteristics || {});
                        for (const existingChar of service.characteristics.slice()) {
                            if (!charNames.includes(existingChar.displayName)) {
                                service.removeCharacteristic(existingChar);
                            }
                        }
                        for (const [charName, getterSetterRaw] of Object.entries(s.characteristics || {})) {
                            const getterSetter = getterSetterRaw;
                            const Characteristic = hap.Characteristic[charName];
                            if (!Characteristic) {
                                continue;
                            }
                            if (getterSetter && getterSetter.props) {
                                try {
                                    service.getCharacteristic(Characteristic).setProps(getterSetter.props);
                                }
                                catch (e) {
                                    // ignore setProps failures on older HAP implementations
                                }
                            }
                            if (getterSetter && typeof getterSetter.get === 'function') {
                                service.getCharacteristic(Characteristic).onGet(getterSetter.get);
                            }
                            if (getterSetter && typeof getterSetter.set === 'function') {
                                service.getCharacteristic(Characteristic).onSet(getterSetter.set);
                            }
                        }
                    }
                }
                this.log.info(`Created/updated HAP accessory ${d.id} (${type})`);
            }
            catch (e) {
                this.log.warn('HAP accessory creation failed', e);
            }
        }
        if (accessoriesToRegister.length > 0) {
            try {
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRegister);
                this.log.info(`Registered ${accessoriesToRegister.length} HAP accessory(ies) with Homebridge`);
            }
            catch (e) {
                this.log.warn('Failed to register HAP accessories', e);
            }
        }
        else {
            this.log.info('No HAP accessories to register');
        }
    }
    /**
     * Returns the timestamp (ms) of the last OpenAPI daily counter reset.
     * @returns {number} Timestamp in ms
     */
    getOpenApiLastReset() {
        return this.openApiLastReset;
    }
    /**
     * Logs the last OpenAPI reset time in a human-readable format.
     * @returns {void}
     */
    logOpenApiLastReset() {
        if (this.openApiLastReset) {
            const date = new Date(this.openApiLastReset);
            this.log.info(`[OpenAPI] Last daily counter reset: ${date.toLocaleString()}`);
        }
        else {
            this.log.info('[OpenAPI] Daily counter has not been reset yet.');
        }
    }
    /**
     * Compute a hash of the current device config for change detection.
     * @returns {string} JSON string hash of device config
     */
    getConfigHash() {
        // Create a simple hash of current device config to detect changes
        const devices = this.config?.devices ?? [];
        return JSON.stringify(devices.map((d) => ({
            id: d.deviceId ?? d.id,
            type: d.configDeviceType ?? d.type,
            name: d.configDeviceName ?? d.name,
        })));
    }
    /**
     * Reload devices if config has changed since last load.
     * Unregisters accessories and removes devices no longer in config.
     * Calls loadDevices to repopulate devices and accessories.
     *
     * @returns {Promise<void>} Resolves when reload is complete
     */
    async checkAndReloadDevices() {
        const currentHash = this.getConfigHash();
        if (currentHash !== this.lastConfigHash) {
            this.log.info('[SwitchBot] Detected config changes, reloading devices...');
            // Identify device IDs in new config
            const devicesInConfig = new Set((this.config?.devices ?? []).map((d) => d.deviceId ?? d.id));
            // Find accessories to remove (not in config)
            const accessoriesToRemove = [];
            for (const [uuid, accessory] of this.accessories.entries()) {
                const deviceId = accessory?.context?.deviceId;
                if (deviceId && !devicesInConfig.has(deviceId)) {
                    accessoriesToRemove.push({ accessory, uuid });
                }
            }
            // Unregister removed accessories from Homebridge
            if (accessoriesToRemove.length > 0 && this.api && this.api.unregisterPlatformAccessories) {
                try {
                    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRemove.map(a => a.accessory));
                    this.log.info(`Unregistered ${accessoriesToRemove.length} accessory(ies) removed from config`);
                    for (const { uuid } of accessoriesToRemove) {
                        this.accessories.delete(uuid);
                    }
                }
                catch (e) {
                    this.log.warn('Failed to unregister removed accessories', e);
                }
            }
            // Remove devices from this.devices that are no longer in config
            this.devices = this.devices.filter((dev) => devicesInConfig.has(dev?.id));
            await this.loadDevices();
            this.lastConfigHash = currentHash;
        }
    }
    /**
     * Cleanup method to clear config reload interval on shutdown.
     * Called by Homebridge on shutdown event.
     * @returns {void}
     */
    shutdown() {
        if (this.configReloadInterval) {
            clearInterval(this.configReloadInterval);
            this.configReloadInterval = null;
            this.log.info('Cleared config reload interval on shutdown');
        }
    }
    /**
     * Setup OpenAPI polling for all devices according to config (global, per-device, batch, rate limit).
     * Handles daily request limits, per-device and batch polling, and resets.
     *
     * @returns {void}
     */
    _setupOpenApiPolling() {
        // Clear any existing timers
        for (const t of this.openApiPollTimers.values())
            clearInterval(t);
        this.openApiPollTimers.clear();
        if (this.openApiBatchTimer) {
            clearInterval(this.openApiBatchTimer);
        }
        this.openApiBatchTimer = null;
        const cfg = this.config;
        const devices = cfg.devices ?? [];
        const globalRate = Math.max(Number(cfg.openApiRefreshRate) || 300, 30);
        const batchEnabled = cfg.matterBatchEnabled !== false;
        const batchRate = Math.max(Number(cfg.matterBatchRefreshRate) || globalRate, 30);
        const batchConcurrency = Math.max(Number(cfg.matterBatchConcurrency) || 5, 1);
        const batchJitter = Math.max(Number(cfg.matterBatchJitter) || 0, 0);
        const dailyLimit = Math.max(Number(cfg.dailyApiLimit) || 10000, 1000);
        const dailyReserve = Math.max(Number(cfg.dailyApiReserveForCommands) || 1000, 0);
        const resetAtLocalMidnight = !!cfg.dailyApiResetLocalMidnight;
        const webhookOnlyOnReserve = !!cfg.webhookOnlyOnReserve;
        // Helper to reset daily counter
        const resetCounter = () => {
            this.openApiRequestsToday = 0;
            this.openApiLastReset = Date.now();
            this.log.info('[OpenAPI] Daily request counter reset');
        };
        // Schedule reset at midnight
        const scheduleMidnightReset = () => {
            const now = new Date();
            let nextReset;
            if (resetAtLocalMidnight) {
                nextReset = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
            }
            else {
                nextReset = new Date(now);
                nextReset.setUTCHours(24, 0, 1, 0);
            }
            const ms = nextReset.getTime() - now.getTime();
            setTimeout(() => {
                resetCounter();
                scheduleMidnightReset();
            }, ms);
        };
        scheduleMidnightReset();
        // Helper to check if polling is allowed
        const canPoll = () => {
            if (this.openApiRequestsToday + dailyReserve >= dailyLimit) {
                if (!webhookOnlyOnReserve) {
                    this.log.warn('[OpenAPI] Daily request limit reached, pausing background polling');
                }
                return false;
            }
            return true;
        };
        // Per-device polling (devices with per-device refreshRate)
        for (const dev of devices) {
            const id = dev.deviceId ?? dev.id;
            const enabled = dev.enabled !== false;
            if (!id || !enabled) {
                continue;
            }
            const perDeviceRate = dev.refreshRate ? Math.max(Number(dev.refreshRate), 30) : null;
            if (perDeviceRate) {
                // Individual polling interval for this device
                const timer = setInterval(async () => {
                    if (!canPoll()) {
                        return;
                    }
                    try {
                        const client = this.config._client;
                        if (client && typeof client.getDevice === 'function') {
                            await client.getDevice(id);
                            this.openApiRequestsToday++;
                            this.log.debug(`[OpenAPI] Polled device ${id} (per-device interval ${perDeviceRate}s) [${this.openApiRequestsToday}/${dailyLimit}]`);
                        }
                    }
                    catch (e) {
                        this.log.debug(`[OpenAPI] Polling failed for device ${id}:`, e?.message);
                    }
                }, perDeviceRate * 1000);
                this.openApiPollTimers.set(id, timer);
            }
        }
        // Batched polling for all other devices
        if (batchEnabled) {
            // Devices not already polled individually
            const batchDevices = devices.filter((dev) => {
                const id = dev.deviceId ?? dev.id;
                const enabled = dev.enabled !== false;
                const perDeviceRate = dev.refreshRate ? Math.max(Number(dev.refreshRate), 30) : null;
                return id && enabled && !perDeviceRate;
            });
            // Optional jitter before first batch
            const startBatch = () => {
                this.openApiBatchTimer = setInterval(async () => {
                    if (!canPoll()) {
                        return;
                    }
                    const client = this.config._client;
                    if (!client || typeof client.getDevice !== 'function') {
                        return;
                    }
                    // Limit concurrency
                    const chunks = [];
                    for (let i = 0; i < batchDevices.length; i += batchConcurrency) {
                        chunks.push(batchDevices.slice(i, i + batchConcurrency));
                    }
                    for (const chunk of chunks) {
                        await Promise.all(chunk.map(async (dev) => {
                            try {
                                await client.getDevice(dev.deviceId ?? dev.id);
                                this.openApiRequestsToday++;
                                this.log.debug(`[OpenAPI] Batched poll device ${dev.deviceId ?? dev.id} [${this.openApiRequestsToday}/${dailyLimit}]`);
                            }
                            catch (e) {
                                this.log.debug(`[OpenAPI] Batched polling failed for device ${dev.deviceId ?? dev.id}:`, e?.message);
                            }
                        }));
                    }
                }, batchRate * 1000);
            };
            if (batchJitter > 0) {
                setTimeout(startBatch, Math.floor(Math.random() * batchJitter * 1000));
            }
            else {
                startBatch();
            }
        }
    }
    /**
     * Called by Homebridge to restore cached HAP accessories on startup.
     * @param {any} accessory - The cached accessory object
     * @returns {Promise<void>} Resolves when accessory is restored
     */
    async configureAccessory(accessory) {
        try {
            const uuid = accessory.UUID || accessory.UUID;
            this.accessories.set(uuid, accessory);
            this.log.info(`Restored cached accessory ${accessory.displayName || uuid}`);
        }
        catch (e) {
            this.log.warn('configureAccessory failed to restore accessory', e);
        }
    }
    /**
     * Called by Homebridge when a cached Matter accessory is restored (optional signature).
     * @param {any} accessory - The cached accessory object
     * @returns {void}
     */
    configureMatterAccessory(accessory) {
        try {
            const uuid = accessory.uuid || accessory.UUID || accessory.uuid;
            this.accessories.set(uuid, accessory);
            this.log.info(`Restored cached Matter accessory ${accessory.displayName || uuid}`);
        }
        catch (e) {
            this.log.warn('configureMatterAccessory failed to restore accessory', e);
        }
    }
}
export default SwitchBotHAPPlatform;
//# sourceMappingURL=SwitchBotHAPPlatform.js.map