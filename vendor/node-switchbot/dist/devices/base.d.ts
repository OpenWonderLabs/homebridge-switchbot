import type { OpenAPIClient } from '../api.js';
import type { BLEConnection } from '../ble.js';
import type { CommandResult, ConnectionType, DeviceInfo, DeviceStatus } from '../types/index.js';
import type { CircuitBreakerConfig, FallbackHandler, FallbackHandlerOptions, RetryConfig } from '../utils/index.js';
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { CircuitBreaker, ConnectionTracker, FallbackHandlerManager, Logger, RetryExecutor } from '../utils/index.js';
export declare const PASSIVE_POLL_INTERVAL: number;
/**
 * Base class for all SwitchBot devices
 *
 * ## BLE-first, API-fallback Logic
 *
 * This class provides a centralized, robust hybrid connection strategy for all SwitchBot devices:
 *
 * - **BLE-first, API-fallback**: By default, status and command methods attempt BLE first (if available), then fall back to OpenAPI if BLE fails or is unavailable. This is controlled by `preferredConnection` and `enableFallback`.
 * - **Centralized Fallback**: The `getStatusWithFallback()` and `sendCommand()` methods implement this logic. Device subclasses should call these methods and provide normalization/mapping as needed.
 * - **Connection Intelligence**: Tracks connection health and performance, automatically preferring the most reliable connection if enabled.
 * - **Circuit Breaker & Retry**: Both BLE and API commands are protected by circuit breaker and retry logic to handle transient failures gracefully.
 *
 * ### Usage in Subclasses
 *
 * - For status: Call `await this.getStatusWithFallback(normalizeBLE, normalizeAPI)` in your `getStatus()` implementation.
 * - For commands: Use `await this.sendCommand(bleCommand, apiCommand, apiParameter)` to automatically select the best connection and handle fallback.
 * - For custom logic: You may override or extend these methods, but should preserve the fallback and error-handling patterns for consistency.
 *
 * ### Example (in a device subclass)
 *
 * ```typescript
 * async getStatus(): Promise<DeviceStatus> {
 *   return this.getStatusWithFallback(
 *     bleData => ({ ... }), // normalize BLE data
 *     apiData => ({ ... }), // normalize API data
 *   )
 * }
 *
 * async turnOn(): Promise<boolean> {
 *   const result = await this.sendCommand([0x57, 0x01, 0x01], 'turnOn')
 *   return result.success
 * }
 * ```
 *
 * ### Configuration
 *
 * - `preferredConnection`: 'ble' | 'api' (default: 'ble')
 * - `enableFallback`: boolean (default: true)
 * - `enableConnectionIntelligence`: boolean (default: true)
 * - `enableCircuitBreaker`: boolean (default: true)
 * - `enableRetry`: boolean (default: true)
 *
 * ### See Also
 * - `getStatusWithFallback()`
 * - `sendCommand()`
 * - `hasBLE()`, `hasAPI()`
 * - `setPreferredConnection()`, `setFallbackEnabled()`
 *
 * This pattern ensures all device classes benefit from robust, testable, and consistent connection logic.
 */
export declare abstract class SwitchBotDevice extends EventEmitter {
    protected info: DeviceInfo;
    protected logger: Logger;
    protected bleConnection?: BLEConnection;
    protected apiClient?: OpenAPIClient;
    protected enableFallback: boolean;
    protected preferredConnection: ConnectionType;
    protected connectionTracker: ConnectionTracker;
    protected circuitBreakerBLE: CircuitBreaker;
    protected circuitBreakerAPI: CircuitBreaker;
    protected fallbackHandlerManager: FallbackHandlerManager;
    protected retryExecutor: RetryExecutor;
    protected enableConnectionIntelligence: boolean;
    protected enableCircuitBreaker: boolean;
    protected enableRetry: boolean;
    private bleOperationQueue;
    private lastPolledAt?;
    private defineCompatibilityProperties;
    constructor(info: DeviceInfo, options?: {
        bleConnection?: BLEConnection;
        apiClient?: OpenAPIClient;
        enableFallback?: boolean;
        preferredConnection?: ConnectionType;
        enableConnectionIntelligence?: boolean;
        enableCircuitBreaker?: boolean;
        enableRetry?: boolean;
        retryConfig?: RetryConfig;
        circuitBreakerConfig?: CircuitBreakerConfig;
        logLevel?: number;
    });
    /**
     * Send multiple commands in sequence (all must succeed)
     * Used for Curtain 3, bulbs, strips, and other multi-step devices
     */
    sendCommandSequence(commands: Array<() => Promise<boolean>>): Promise<boolean>;
    /**
     * Send multiple commands (returns true if any succeed)
     * Used for fallback operations with complex patterns
     */
    sendMultipleCommands(commands: Array<() => Promise<boolean>>): Promise<boolean>;
    /**
     * Returns true if device should be polled (passive polling interval elapsed)
     */
    pollNeeded(interval?: number): boolean;
    /**
     * Poll device status if needed (passive polling)
     */
    pollIfNeeded(interval?: number): Promise<DeviceStatus | undefined>;
    /**
     * Get device information
     */
    getInfo(): DeviceInfo;
    /**
     * Get device ID
     */
    getId(): string;
    /**
     * Get device ID (property accessor for convenience)
     */
    get id(): string | undefined;
    /**
     * Get device name
     */
    getName(): string;
    /**
     * Get device name (property accessor for convenience)
     */
    get name(): string;
    /**
     * Get device type
     */
    getDeviceType(): string;
    /**
     * Get device type (property accessor for convenience)
     */
    get deviceType(): string;
    /**
     * Get MAC address (if available)
     */
    getMAC(): string | undefined;
    /**
     * Get MAC address (property accessor for convenience)
     */
    get mac(): string | undefined;
    /**
     * Get active connection type
     */
    getActiveConnection(): ConnectionType | undefined;
    /**
     * Get active connection type (property accessor for convenience)
     */
    get activeConnection(): ConnectionType | undefined;
    /**
     * Check if BLE is available for this device
     */
    hasBLE(): boolean;
    /**
     * Check if API is available for this device
     */
    hasAPI(): boolean;
    protected emitError(payload: Record<string, unknown>): void;
    /**
     * Get device status (abstract - implemented by subclasses)
     */
    /**
     * Get device status with BLE-first/API-fallback logic (centralized)
     * Subclasses should call this and map/normalize fields as needed.
     */
    protected getStatusWithFallback<TStatus = DeviceStatus>(normalizeBLE?: (bleData: any) => TStatus, normalizeAPI?: (apiData: any) => TStatus): Promise<TStatus>;
    abstract getStatus(): Promise<DeviceStatus>;
    /**
     * Send a command via BLE with circuit breaker and retry logic
     */
    protected sendBLECommand(command: readonly number[] | number[] | Buffer, writeOnly?: boolean): Promise<CommandResult>;
    /**
     * Send a command via OpenAPI with circuit breaker and retry logic
     */
    protected sendAPICommand(command: string, parameter?: any): Promise<CommandResult>;
    /**
     * Get best connection type based on intelligence tracking
     */
    private getBestConnection;
    /**
     * Send a command with automatic BLE/API fallback, circuit breaker, and retry logic
     */
    protected sendCommand(bleCommand: readonly number[] | number[] | Buffer, apiCommand: string, apiParameter?: any, writeOnly?: boolean): Promise<CommandResult>;
    /**
     * Get device status via BLE
     */
    protected getBLEStatus(): Promise<any>;
    protected normalizeBLEStatusData(data: any): Record<string, unknown>;
    private runWithBLELock;
    /**
     * Get device status via OpenAPI
     */
    protected getAPIStatus(): Promise<any>;
    /**
     * Get basic device info (universal settings retrieval)
     * Returns: battery, firmware, device-specific settings, etc.
     * Command: 0x57 0x02 (BLE), 'getBasicInfo' (API)
     *
     * Example usage:
     *   const info = await device.getBasicInfo();
     *   console.log(info);
     *
     * Returns a CommandResult object with device info fields.
     */
    getBasicInfo(): Promise<CommandResult>;
    /**
     * Universal mode setting command
     * BLE: 0x57 0x03 [modeByte]
     * API: 'setMode' (if available)
     * @param mode - Mode value (number or string, per-device enum recommended)
     *
     * Example usage:
     * await device.setMode('auto')
     * await device.setMode(1)
     *
     * Returns a CommandResult object indicating success and mode info.
     */
    setMode(mode: number | string): Promise<CommandResult>;
    /**
     * Update device information
     */
    updateInfo(newInfo: Partial<DeviceInfo>): void;
    /**
     * Set preferred connection type
     */
    setPreferredConnection(type: ConnectionType): void;
    /**
     * Enable or disable fallback
     */
    setFallbackEnabled(enabled: boolean): void;
    /**
     * Enable or disable connection intelligence
     */
    setConnectionIntelligenceEnabled(enabled: boolean): void;
    /**
     * Enable or disable circuit breaker
     */
    setCircuitBreakerEnabled(enabled: boolean): void;
    /**
     * Enable or disable retry logic
     */
    setRetryEnabled(enabled: boolean): void;
    /**
     * Get connection tracker for this device
     */
    getConnectionTracker(): ConnectionTracker;
    /**
     * Get circuit breaker for BLE
     */
    getCircuitBreakerBLE(): CircuitBreaker;
    /**
     * Get circuit breaker for API
     */
    getCircuitBreakerAPI(): CircuitBreaker;
    /**
     * Register a custom fallback handler
     */
    registerFallbackHandler(handler: FallbackHandler, options?: FallbackHandlerOptions): string;
    /**
     * Unregister a fallback handler
     */
    unregisterFallbackHandler(id: string): boolean;
    /**
     * Get fallback handler manager
     */
    getFallbackHandlerManager(): FallbackHandlerManager;
}
/**
 * Device Manager for managing multiple devices
 */
export declare class DeviceManager extends EventEmitter {
    private devices;
    private logger;
    constructor(logLevel?: number);
    /**
     * Add a device to the manager
     */
    add(device: SwitchBotDevice): void;
    /**
     * Remove a device from the manager
     */
    remove(deviceId: string): boolean;
    /**
     * Get a device by ID
     */
    get(deviceId: string): SwitchBotDevice | undefined;
    /**
     * Get all devices
     */
    list(): SwitchBotDevice[];
    /**
     * Get devices filtered by type
     */
    getByType(deviceType: string): SwitchBotDevice[];
    /**
     * Get device by MAC address
     */
    getByMAC(mac: string): SwitchBotDevice | undefined;
    /**
     * Check if device exists
     */
    has(deviceId: string): boolean;
    /**
     * Get device count
     */
    count(): number;
    /**
     * Clear all devices
     */
    clear(): void;
    /**
     * Get all device IDs
     */
    getIds(): string[];
    /**
     * Get devices as an object keyed by ID
     */
    toObject(): Record<string, SwitchBotDevice>;
}
//# sourceMappingURL=base.d.ts.map