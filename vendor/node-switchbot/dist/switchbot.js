/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * switchbot.ts: SwitchBot v4.0.0 - Main Hybrid BLE/API Class
 */
import { EventEmitter } from 'node:events';
import { OpenAPIClient } from './api.js';
import { BLEConnection, BLEScanner } from './ble.js';
import { DeviceManager } from './devices/base.js';
import { WoAIHub } from './devices/wo-ai-hub.js';
import { WoAirPurifierPM25 } from './devices/wo-air-purifier-pm25.js';
import { WoAirPurifierTable } from './devices/wo-air-purifier-table.js';
import { WoAirPurifier } from './devices/wo-air-purifier.js';
import { WoArtFrame } from './devices/wo-art-frame.js';
import { WoBlindTilt } from './devices/wo-blind-tilt.js';
import { WoBulb } from './devices/wo-bulb.js';
import { WoCandleWarmerLamp } from './devices/wo-candle-warmer-lamp.js';
import { WoCeilingLight } from './devices/wo-ceiling-light.js';
import { WoCirculatorFan } from './devices/wo-circulator-fan.js';
import { WoClimatePanel } from './devices/wo-climate-panel.js';
import { WoContact } from './devices/wo-contact.js';
import { WoCurtain } from './devices/wo-curtain.js';
import { WoFloorLamp } from './devices/wo-floor-lamp.js';
import { WoGarageDoorOpener } from './devices/wo-garage-door-opener.js';
import { WoHand } from './devices/wo-hand.js';
import { WoHub2 } from './devices/wo-hub2.js';
import { WoHub3 } from './devices/wo-hub3.js';
import { WoHubMiniMatter } from './devices/wo-hubmini-matter.js';
import { WoHumi2 } from './devices/wo-humi2.js';
import { WoHumi } from './devices/wo-humi.js';
import { WoIOSensorTH } from './devices/wo-io-sensor-th.js';
import { WoKeypadVisionPro } from './devices/wo-keypad-vision-pro.js';
import { WoKeypadVision } from './devices/wo-keypad-vision.js';
import { WoKeypad } from './devices/wo-keypad.js';
import { WoLeak } from './devices/wo-leak.js';
import { WoSmartLockLite } from './devices/wo-lock-lite.js';
import { WoSmartLockProWiFi } from './devices/wo-lock-pro-wifi.js';
import { WoSmartLockPro } from './devices/wo-lock-pro.js';
import { WoSmartLockVisionPro } from './devices/wo-lock-vision-pro.js';
import { WoSmartLockVision } from './devices/wo-lock-vision.js';
import { WoSmartLock } from './devices/wo-lock.js';
import { WoPanTiltCamPlus3K } from './devices/wo-pan-tilt-cam-plus-3k.js';
import { WoPlugMiniJP } from './devices/wo-plug-mini-jp.js';
import { WoPlugMiniUS } from './devices/wo-plug-mini-us.js';
import { WoPresence } from './devices/wo-presence.js';
import { WoRelaySwitch1 } from './devices/wo-relay-switch-1.js';
import { WoRelaySwitch1PM } from './devices/wo-relay-switch-1pm.js';
import { WoRelaySwitch2PM } from './devices/wo-relay-switch-2pm.js';
import { WoRemoteWithScreen } from './devices/wo-remote-with-screen.js';
import { WoRemote } from './devices/wo-remote.js';
import { WoRGBICBulb } from './devices/wo-rgbic-bulb.js';
import { WoRGBICNeonWireRopeLight } from './devices/wo-rgbic-neon-wire-rope-light.js';
import { WoRGBICWWFloorLamp } from './devices/wo-rgbicww-floor-lamp.js';
import { WoRGBICWWStripLight } from './devices/wo-rgbicww-strip-light.js';
import { WoRollerShade } from './devices/wo-roller-shade.js';
import { WoSensorTHPlus } from './devices/wo-sensor-th-plus.js';
import { WoSensorTHProCO2 } from './devices/wo-sensor-th-pro-co2.js';
import { WoSensorTHPro } from './devices/wo-sensor-th-pro.js';
import { WoSensorTH } from './devices/wo-sensor-th.js';
import { WoSmartThermostatRadiator } from './devices/wo-smart-thermostat-radiator.js';
import { WoStripLight3 } from './devices/wo-strip-light-3.js';
import { WoStrip } from './devices/wo-strip.js';
import { WoVacuumK10Plus } from './devices/wo-vacuum-k10-plus.js';
import { WoVacuumK10ProCombo } from './devices/wo-vacuum-k10-pro-combo.js';
import { WoVacuumK10Pro } from './devices/wo-vacuum-k10-pro.js';
import { WoVacuumK11Plus } from './devices/wo-vacuum-k11-plus.js';
import { WoVacuumK20 } from './devices/wo-vacuum-k20.js';
import { WoVacuumS10 } from './devices/wo-vacuum-s10.js';
import { WoVacuumS20 } from './devices/wo-vacuum-s20.js';
import { WoVacuum } from './devices/wo-vacuum.js';
import { WoWaterDetector } from './devices/wo-water-detector.js';
import { BLE_SUPPORTED, DEFAULTS, DEVICE_CLASS_MAP } from './settings.js';
import { Logger, macToDeviceId } from './utils/index.js';
/**
 * Device class registry
 */
const DEVICE_CLASSES = {
    WoHand,
    WoCurtain,
    WoRollerShade,
    WoSmartLock,
    WoSmartLockLite,
    WoSmartLockPro,
    WoSmartLockProWiFi,
    WoSmartThermostatRadiator,
    WoSmartLockVision,
    WoSmartLockVisionPro,
    WoSensorTH,
    WoSensorTHPlus,
    WoSensorTHPro,
    WoSensorTHProCO2,
    WoIOSensorTH,
    WoContact,
    WoPresence,
    WoPlugMiniUS,
    WoPlugMiniJP,
    WoPlugMiniEU: WoPlugMiniUS, // Use same class
    WoBulb,
    WoStrip,
    WoStripLight3,
    WoRGBICWWStripLight,
    WoArtFrame,
    WoCeilingLight,
    WoCirculatorFan,
    WoClimatePanel,
    WoFloorLamp,
    WoBlindTilt,
    WoHumi,
    WoHumi2,
    WoAirPurifier,
    WoAirPurifierTable,
    WoHub2,
    WoHub3,
    WoHubMiniMatter,
    WoLeak,
    WoGarageDoorOpener,
    WoRelaySwitch1,
    WoRelaySwitch1PM,
    WoRelaySwitch2PM,
    WoRemote,
    WoRGBICBulb,
    WoRGBICWWFloorLamp,
    WoKeypad,
    WoKeypadVision,
    WoKeypadVisionPro,
    WoVacuumK10Plus,
    WoVacuumK10ProCombo,
    WoVacuumK10Pro,
    WoVacuumK11Plus,
    WoVacuumK20,
    WoVacuumS10,
    WoVacuumS20,
    WoVacuum,
    WoAirPurifierPM25,
    WoRGBICNeonWireRopeLight,
    WoCandleWarmerLamp,
    WoPanTiltCamPlus3K,
    WoRemoteWithScreen,
    WoAIHub,
    WoWaterDetector,
};
/**
 * Main SwitchBot class - Hybrid BLE/API with automatic fallback
 */
export class SwitchBot extends EventEmitter {
    config;
    logger;
    bleScanner;
    bleConnection;
    apiClient;
    deviceManager;
    initialized = false;
    // Track pending device creations for async API discovery
    _pendingDeviceCreations = [];
    constructor(config = {}) {
        super();
        // Set defaults
        this.config = {
            token: config.token || '',
            secret: config.secret || '',
            baseURL: config.baseURL || DEFAULTS.baseURL,
            enableBLE: config.enableBLE ?? (BLE_SUPPORTED && DEFAULTS.enableBLE),
            scanTimeout: config.scanTimeout || DEFAULTS.scanTimeout,
            enableFallback: config.enableFallback ?? DEFAULTS.enableFallback,
            logLevel: config.logLevel ?? DEFAULTS.logLevel,
            noble: config.noble,
            enableConnectionIntelligence: config.enableConnectionIntelligence ?? true,
            enableCircuitBreaker: config.enableCircuitBreaker ?? true,
            enableRetry: config.enableRetry ?? true,
            maxRetryAttempts: config.maxRetryAttempts ?? 3,
            retryInitialDelayMs: config.retryInitialDelayMs ?? 100,
            retryMaxDelayMs: config.retryMaxDelayMs ?? 5000,
            detailedErrors: config.detailedErrors ?? false,
            logger: config.logger ?? {
                error: () => { },
                warn: () => { },
                info: () => { },
                debug: () => { },
            },
            _internal: config._internal ?? {},
        };
        this.logger = new Logger('SwitchBot', this.config.logLevel);
        this.deviceManager = new DeviceManager(this.config.logLevel);
        // Initialize based on configuration
        this.initialize();
    }
    /**
     * Initialize BLE and API clients
     */
    initialize() {
        // Initialize BLE if enabled and supported
        if (this.config.enableBLE) {
            if (!BLE_SUPPORTED) {
                this.logger.warn('BLE not supported on this platform (Linux/macOS only)');
            }
            else {
                try {
                    this.bleScanner = new BLEScanner({
                        noble: this.config.noble,
                        logLevel: this.config.logLevel,
                    });
                    this.bleConnection = new BLEConnection({
                        noble: this.config.noble,
                        logLevel: this.config.logLevel,
                    });
                    this.logger.info('BLE initialized');
                }
                catch (error) {
                    this.logger.error('Failed to initialize BLE', error);
                }
            }
        }
        // Initialize OpenAPI if credentials provided
        if (this.config.token && this.config.secret) {
            try {
                this.apiClient = new OpenAPIClient(this.config.token, this.config.secret, this.config.baseURL, this.config.logLevel);
                this.logger.info('OpenAPI client initialized');
            }
            catch (error) {
                this.logger.error('Failed to initialize OpenAPI client', error);
            }
        }
        // Check if at least one method is available
        if (!this.bleScanner && !this.apiClient) {
            this.logger.warn('No discovery methods available - provide OpenAPI credentials or enable BLE');
        }
        this.initialized = true;
    }
    /**
     * Discover devices (BLE + OpenAPI)
     * BLE discovery runs first, then API discovery to enable proper device matching
     */
    async discover(options = {}) {
        if (!this.initialized) {
            throw new Error('SwitchBot not initialized');
        }
        const { scanBLE = !!this.bleScanner, fetchAPI = !!this.apiClient, timeout = this.config.scanTimeout, } = options;
        this.logger.info('Starting device discovery', { scanBLE, fetchAPI });
        // BLE discovery first (sequential)
        if (scanBLE && this.bleScanner) {
            this.logger.info('Step 1: Starting BLE discovery...');
            try {
                await this.discoverBLE(timeout);
                this.logger.info('Step 1: BLE discovery complete');
            }
            catch (err) {
                this.logger.error('BLE discovery failed', {
                    error: err,
                    message: err?.message,
                    stack: err?.stack,
                });
            }
        }
        // API discovery second (sequential)
        if (fetchAPI && this.apiClient) {
            this.logger.info('Step 2: Starting API discovery...');
            try {
                await this.discoverAPI();
                this.logger.info('Step 2: API discovery complete');
            }
            catch (err) {
                this.logger.error('API discovery failed (outer)', {
                    error: err,
                    message: err?.message,
                    stack: err?.stack,
                });
            }
        }
        // Wait for all pending device creations to finish (API discovery is async)
        if (this._pendingDeviceCreations && this._pendingDeviceCreations.length > 0) {
            await Promise.all(this._pendingDeviceCreations);
            this._pendingDeviceCreations = [];
        }
        const devices = this.deviceManager.list();
        this.logger.info(`Discovery complete: ${devices.length} unique devices found`);
        this.emit('discovery-complete', devices);
        return devices;
    }
    /**
     * Discover devices via BLE
     */
    async discoverBLE(timeout) {
        if (!this.bleScanner || !this.bleConnection) {
            return;
        }
        this.logger.info('Starting BLE discovery');
        // Listen for discoveries
        const handler = (advertisement) => {
            this.handleBLEDiscovery(advertisement);
        };
        this.bleScanner.on('discover', handler);
        try {
            await this.bleScanner.startScan({ duration: timeout });
            // Wait for scan to complete
            await new Promise(resolve => setTimeout(resolve, timeout));
        }
        catch (err) {
            this.logger.error('BLE scan error', {
                error: err,
                message: err?.message,
                stack: err?.stack,
            });
            throw err;
        }
        finally {
            this.bleScanner.off('discover', handler);
        }
    }
    /**
     * Handle BLE device discovery
     */
    async handleBLEDiscovery(advertisement) {
        const { id: advertisementId, address, serviceData, rssi } = advertisement;
        const deviceType = serviceData.modelName;
        const mac = typeof address === 'string' && address.length > 0 ? address : undefined;
        const deviceId = mac ? macToDeviceId(mac) : advertisementId;
        if (!deviceId) {
            this.logger.warn(`Skipping ${deviceType} BLE discovery: no address or advertisement id`);
            return;
        }
        // Create device info
        const info = {
            id: deviceId,
            name: deviceType,
            deviceType,
            mac,
            bleId: advertisementId,
            connectionTypes: ['ble'],
            activeConnection: undefined,
            battery: serviceData.battery,
            bleServiceData: serviceData,
            rssi,
        };
        // Check if device already exists (may have been discovered via API)
        const device = this.deviceManager.get(info.id);
        if (device) {
            // Update existing device info
            device.updateInfo({
                mac: mac ?? device.getInfo().mac,
                connectionTypes: [...new Set([...device.getInfo().connectionTypes, 'ble'])],
                battery: serviceData.battery,
                bleServiceData: serviceData,
                rssi,
            });
            this.logger.debug(`Updated device: ${info.name} (${info.id})`);
        }
        else {
            // Create new device
            const newDevice = await this.createDevice(info);
            if (newDevice) {
                this.deviceManager.add(newDevice);
                this.emit('device-discovered', newDevice);
                this.logger.info(`Discovered ${info.name} via BLE (${info.id})`);
            }
        }
    }
    /**
     * Discover devices via OpenAPI
     */
    async discoverAPI() {
        if (!this.apiClient) {
            return;
        }
        this.logger.info('Starting API discovery');
        try {
            const response = await this.apiClient.getDevices();
            this.logger.debug('API getDevices() raw response', {
                statusCode: response?.statusCode,
                response,
            });
            // Track all pending device creations
            if (!this._pendingDeviceCreations) {
                this._pendingDeviceCreations = [];
            }
            for (const apiDevice of response.deviceList) {
                this._pendingDeviceCreations.push(this.handleAPIDiscovery(apiDevice));
            }
        }
        catch (error) {
            this.logger.error('API discovery failed', {
                error,
                message: error?.message,
                stack: error?.stack,
                statusCode: error?.statusCode,
                response: error?.response,
            });
            throw error;
        }
    }
    /**
     * Handle API device discovery
     * Tries to match with existing BLE devices and combines them into one entry
     */
    async handleAPIDiscovery(apiDevice) {
        const { deviceId, deviceName, deviceType, enableCloudService, hubDeviceId, version } = apiDevice;
        this.logger.debug(`Processing API device: ${deviceName} (${deviceId}, type: ${deviceType})`);
        // Try to find matching BLE device
        // Strategy: look for BLE devices of the same type that haven't been fully populated yet
        const matchedBLEDevice = this.findMatchingBLEDevice(deviceType, deviceName);
        if (matchedBLEDevice) {
            // Update existing BLE device with API information
            const deviceId_internal = matchedBLEDevice.getId();
            matchedBLEDevice.updateInfo({
                name: deviceName,
                connectionTypes: [...new Set([...matchedBLEDevice.getInfo().connectionTypes, 'api'])],
                hubDeviceId,
                version,
                cloudServiceEnabled: enableCloudService,
            });
            this.logger.info(`Matched API device to existing BLE device: ${deviceName} (${deviceId_internal})`);
            this.emit('device-updated', matchedBLEDevice);
        }
        else {
            // No matching BLE device found, create new API-only device
            const info = {
                id: deviceId,
                name: deviceName,
                deviceType,
                connectionTypes: ['api'],
                activeConnection: undefined,
                hubDeviceId,
                version,
                cloudServiceEnabled: enableCloudService,
            };
            // Check if device already exists (shouldn't happen but safety check)
            const device = this.deviceManager.get(info.id);
            if (!device) {
                // Await device creation and addition
                const newDevice = await this.createDevice(info);
                if (newDevice) {
                    this.deviceManager.add(newDevice);
                    this.emit('device-discovered', newDevice);
                    this.logger.info(`Discovered ${deviceName} via API only (${deviceId})`);
                }
            }
        }
    }
    /**
     * Find matching BLE device for an API device
     * Returns a BLE device if a good match is found
     */
    findMatchingBLEDevice(apiDeviceType, apiDeviceName) {
        // Get all BLE devices
        const bleDevices = this.deviceManager.list().filter((device) => {
            const info = device.getInfo();
            return info.connectionTypes.includes('ble') && !info.connectionTypes.includes('api');
        });
        // Try exact device type match first
        const typeMatches = bleDevices.filter(device => device.getDeviceType() === apiDeviceType);
        if (typeMatches.length === 1) {
            // If only one device of this type, it's likely a match
            this.logger.debug(`Found exact type match for ${apiDeviceType}`);
            return typeMatches[0];
        }
        if (typeMatches.length > 1) {
            // If multiple devices of same type, try to match by name similarity
            const nameMatch = typeMatches.find((device) => {
                const devName = device.getName();
                // Simple name comparison (could be enhanced)
                return devName === apiDeviceName || devName.includes(apiDeviceName) || apiDeviceName.includes(devName);
            });
            if (nameMatch) {
                this.logger.debug(`Found name match for ${apiDeviceName}`);
                return nameMatch;
            }
            // No good name match, return the first one as fallback for single device
            // (better to merge than to duplicate)
            if (typeMatches.length === 1) {
                return typeMatches[0];
            }
        }
        return undefined;
    }
    /**
     * Create device instance
     */
    async createDevice(info) {
        const className = DEVICE_CLASS_MAP[info.deviceType];
        this.logger.debug(`createDevice: deviceType='${info.deviceType}', resolved className='${className}', info=`, info);
        if (!className) {
            this.logger.warn(`createDevice: Unknown device type: ${info.deviceType}`);
            return undefined;
        }
        const DeviceClass = DEVICE_CLASSES[className];
        this.logger.debug(`createDevice: DeviceClass for '${className}' is ${DeviceClass ? 'found' : 'undefined'}`);
        if (!DeviceClass) {
            this.logger.warn(`createDevice: Device class not implemented: ${className}`);
            return undefined;
        }
        try {
            // Use utility to extract all device-relevant options from config
            const { extractDeviceOptionsFromConfig } = await import('./utils/index.js');
            return new DeviceClass(info, {
                ...extractDeviceOptionsFromConfig(this.config),
                apiClient: this.apiClient,
                bleConnection: this.bleConnection,
            });
        }
        catch (error) {
            this.logger.error(`createDevice: Failed to create device ${className}`, error);
            return undefined;
        }
    }
    /**
     * Get device manager (for accessing devices)
     */
    get devices() {
        return this.deviceManager;
    }
    /**
     * Get BLE scanner (if available)
     */
    getBLEScanner() {
        return this.bleScanner;
    }
    /**
     * Get API client (if available)
     */
    getAPIClient() {
        return this.apiClient;
    }
    /**
     * Get configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Set log level
     */
    setLogLevel(level) {
        this.config.logLevel = level;
        this.logger.setLevel(level);
        // Update all device log levels
        for (const device of this.deviceManager.list()) {
            device.logger?.setLevel(level);
        }
    }
    /**
     * Check if BLE is available
     */
    isBLEAvailable() {
        return !!this.bleScanner && !!this.bleConnection;
    }
    /**
     * Check if API is available
     */
    isAPIAvailable() {
        return !!this.apiClient;
    }
    /**
     * Cleanup and disconnect
     */
    async cleanup() {
        this.logger.info('Cleaning up');
        if (this.bleScanner) {
            this.bleScanner.destroy();
        }
        if (this.bleConnection) {
            await this.bleConnection.disconnectAll();
        }
        this.deviceManager.clear();
        this.emit('cleanup');
    }
}
//# sourceMappingURL=switchbot.js.map