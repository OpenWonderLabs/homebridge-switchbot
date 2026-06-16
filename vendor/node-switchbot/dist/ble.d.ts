import type { BLEAdvertisement, BLEScanOptions } from './types/ble.js';
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { Logger } from './utils/index.js';
/**
 * BLE Scanner for discovering SwitchBot devices
 */
export declare class BLEScanner extends EventEmitter {
    private noble;
    private logger;
    private scanning;
    private discoveredDevices;
    private discoveredModelCache;
    private nobleStateHandler?;
    private nobleDiscoverHandler?;
    private nobleScanStartHandler?;
    private nobleScanStopHandler?;
    private noblePromise;
    constructor(options?: {
        noble?: any;
        logLevel?: number;
    });
    /**
     * Initialize Noble lazily
     */
    private initializeNoble;
    /**
     * Ensure Noble is loaded before operations
     */
    private ensureNoble;
    /**
     * Setup Noble event handlers
     */
    private setupNobleHandlers;
    /**
     * Remove Noble event handlers
     */
    private removeNobleHandlers;
    /**
     * Handle device discovery
     */
    private handleDiscovery;
    /**
     * Parse service data from BLE advertisement
     */
    private parseServiceData;
    /**
     * Start scanning for devices
     */
    startScan(options?: BLEScanOptions): Promise<void>;
    /**
     * Stop scanning
     */
    stopScan(): void;
    /**
     * Cleanup all resources
     */
    destroy(): void;
    /**
     * Get all discovered devices
     */
    getDiscoveredDevices(): BLEAdvertisement[];
    /**
     * Get discovered device by MAC or BLE ID
     */
    getDevice(mac: string, bleId?: string): BLEAdvertisement | undefined;
    /**
     * Check if currently scanning
     */
    isScanning(): boolean;
    /**
     * Wait for specific device
     */
    waitForDevice(mac: string, timeoutMs?: number, bleId?: string): Promise<BLEAdvertisement>;
}
/**
 * BLE Connection for communicating with SwitchBot devices
 */
export declare class BLEConnection {
    private noble;
    private logger;
    private connections;
    private characteristics;
    private disconnectTimers;
    private operationLocks;
    private encryptionConfig;
    private notificationHandlers;
    private persistentConnectionMs;
    private noblePromise;
    private notificationFutures;
    private expectedDisconnects;
    /**
     * Mark the next disconnect for this MAC as expected
     */
    markExpectedDisconnect(mac: string): void;
    constructor(options?: {
        noble?: any;
        logLevel?: number;
        logger?: Logger;
    });
    /**
     * Initialize Noble lazily
     */
    private initializeNoble;
    /**
     * Ensure Noble is loaded before operations
     */
    private ensureNoble;
    private withMacLock;
    private clearDisconnectTimer;
    private scheduleDisconnect;
    setPersistentConnectionTimeout(timeoutMs: number): void;
    setEncryption(mac: string, keyHex: string, ivHex: string, mode?: 'auto' | 'ctr' | 'gcm'): void;
    clearEncryption(mac: string): void;
    private getKnownPeripherals;
    private incrementIv;
    private encryptIfConfigured;
    private validateCommandResult;
    sendCommand(mac: string, data: Buffer, options?: {
        expectResponse?: boolean;
        validateResponse?: boolean;
        responseTimeoutMs?: number;
        expectNotification?: boolean;
        notificationTimeoutMs?: number;
    }): Promise<Buffer | undefined>;
    subscribeNotifications(mac: string, handler: (payload: Buffer) => void): Promise<void>;
    unsubscribeNotifications(mac: string, handler: (payload: Buffer) => void): void;
    /**
     * Connect to a device
     */
    connect(mac: string): Promise<void>;
    /**
     * Discover service characteristics
     */
    private discoverCharacteristics;
    /**
     * Disconnect from a device
     */
    disconnect(mac: string): Promise<void>;
    /**
     * Write data to device
     */
    write(mac: string, data: Buffer): Promise<void>;
    /**
     * Read data from device
     */
    read(mac: string): Promise<Buffer>;
    /**
     * Check if connected to device
     */
    isConnected(mac: string): boolean;
    /**
     * Disconnect all devices
     */
    disconnectAll(): Promise<void>;
    /**
     * Get connected device count
     */
    getConnectionCount(): number;
}
//# sourceMappingURL=ble.d.ts.map