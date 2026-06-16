import type { SwitchBotDevice } from './devices/base.js';
import type { DiscoveryOptions, LogLevel, SwitchBotConfig } from './types/index.js';
import { EventEmitter } from 'node:events';
import { OpenAPIClient } from './api.js';
import { BLEScanner } from './ble.js';
import { DeviceManager } from './devices/base.js';
/**
 * Main SwitchBot class - Hybrid BLE/API with automatic fallback
 */
export declare class SwitchBot extends EventEmitter {
    private config;
    private logger;
    private bleScanner?;
    private bleConnection?;
    private apiClient?;
    private deviceManager;
    private initialized;
    private _pendingDeviceCreations;
    constructor(config?: SwitchBotConfig);
    /**
     * Initialize BLE and API clients
     */
    private initialize;
    /**
     * Discover devices (BLE + OpenAPI)
     * BLE discovery runs first, then API discovery to enable proper device matching
     */
    discover(options?: DiscoveryOptions): Promise<SwitchBotDevice[]>;
    /**
     * Discover devices via BLE
     */
    private discoverBLE;
    /**
     * Handle BLE device discovery
     */
    private handleBLEDiscovery;
    /**
     * Discover devices via OpenAPI
     */
    private discoverAPI;
    /**
     * Handle API device discovery
     * Tries to match with existing BLE devices and combines them into one entry
     */
    private handleAPIDiscovery;
    /**
     * Find matching BLE device for an API device
     * Returns a BLE device if a good match is found
     */
    private findMatchingBLEDevice;
    /**
     * Create device instance
     */
    private createDevice;
    /**
     * Get device manager (for accessing devices)
     */
    get devices(): DeviceManager;
    /**
     * Get BLE scanner (if available)
     */
    getBLEScanner(): BLEScanner | undefined;
    /**
     * Get API client (if available)
     */
    getAPIClient(): OpenAPIClient | undefined;
    /**
     * Get configuration
     */
    getConfig(): Required<SwitchBotConfig>;
    /**
     * Set log level
     */
    setLogLevel(level: LogLevel): void;
    /**
     * Check if BLE is available
     */
    isBLEAvailable(): boolean;
    /**
     * Check if API is available
     */
    isAPIAvailable(): boolean;
    /**
     * Cleanup and disconnect
     */
    cleanup(): Promise<void>;
}
//# sourceMappingURL=switchbot.d.ts.map