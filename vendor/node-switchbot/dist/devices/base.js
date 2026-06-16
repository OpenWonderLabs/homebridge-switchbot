/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * devices/base.ts: SwitchBot v4.0.0 - Base Device Class
 */
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { APINotAvailableError, BLENotAvailableError } from '../errors.js';
import { DEVICE_COMMANDS } from '../settings.js';
import { CircuitBreaker, CircuitBreakerState, ConnectionTracker, FallbackHandlerManager, Logger, RetryExecutor, } from '../utils/index.js';
// Passive polling interval (24 hours)
export const PASSIVE_POLL_INTERVAL = 60 * 60 * 24 * 1000;
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
export class SwitchBotDevice extends EventEmitter {
    info;
    logger;
    bleConnection;
    apiClient;
    enableFallback;
    preferredConnection;
    // Advanced features
    connectionTracker;
    circuitBreakerBLE;
    circuitBreakerAPI;
    fallbackHandlerManager;
    retryExecutor;
    enableConnectionIntelligence;
    enableCircuitBreaker;
    enableRetry;
    bleOperationQueue = Promise.resolve();
    // Passive polling
    lastPolledAt;
    defineCompatibilityProperties() {
        const properties = ['id', 'name', 'deviceType', 'mac', 'activeConnection'];
        for (const property of properties) {
            Object.defineProperty(this, property, {
                enumerable: true,
                configurable: true,
                get: () => {
                    const value = this.info[property];
                    if ((property === 'id' || property === 'mac') && typeof value === 'string' && value.length === 0) {
                        return undefined;
                    }
                    return value;
                },
            });
        }
    }
    constructor(info, options = {}) {
        super();
        this.info = info;
        this.defineCompatibilityProperties();
        this.logger = new Logger(`${info.deviceType}:${info.id}`, options.logLevel);
        this.bleConnection = options.bleConnection;
        this.apiClient = options.apiClient;
        this.enableFallback = options.enableFallback ?? true;
        this.preferredConnection = options.preferredConnection ?? 'ble';
        // Initialize advanced features
        this.enableConnectionIntelligence = options.enableConnectionIntelligence ?? true;
        this.enableCircuitBreaker = options.enableCircuitBreaker ?? true;
        this.enableRetry = options.enableRetry ?? true;
        // Create connection tracker for this device
        this.connectionTracker = new ConnectionTracker(info.id, options.logLevel);
        // Create circuit breakers for each connection type
        this.circuitBreakerBLE = new CircuitBreaker(`${info.deviceType}:${info.id}:BLE`, options.circuitBreakerConfig, options.logLevel);
        this.circuitBreakerAPI = new CircuitBreaker(`${info.deviceType}:${info.id}:API`, options.circuitBreakerConfig, options.logLevel);
        // Create retry executor
        this.retryExecutor = new RetryExecutor(options.retryConfig, options.logLevel);
        // Create fallback handler manager
        this.fallbackHandlerManager = new FallbackHandlerManager(options.logLevel);
    }
    /**
     * Send multiple commands in sequence (all must succeed)
     * Used for Curtain 3, bulbs, strips, and other multi-step devices
     */
    async sendCommandSequence(commands) {
        try {
            for (const command of commands) {
                const success = await command();
                if (!success) {
                    this.logger.warn('Command in sequence failed, stopping execution');
                    return false;
                }
                // Small delay between commands for device processing
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return true;
        }
        catch (error) {
            this.logger.error('Command sequence failed', error);
            return false;
        }
    }
    /**
     * Send multiple commands (returns true if any succeed)
     * Used for fallback operations with complex patterns
     */
    async sendMultipleCommands(commands) {
        let anySucceeded = false;
        for (const command of commands) {
            try {
                const success = await command();
                if (success) {
                    anySucceeded = true;
                }
                // Small delay between commands
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            catch (error) {
                this.logger.debug('Command in multi-command attempt failed', error);
                // Continue trying other commands
            }
        }
        return anySucceeded;
    }
    /**
     * Returns true if device should be polled (passive polling interval elapsed)
     */
    pollNeeded(interval = PASSIVE_POLL_INTERVAL) {
        if (!this.lastPolledAt) {
            return true;
        }
        return Date.now() - this.lastPolledAt > interval;
    }
    /**
     * Poll device status if needed (passive polling)
     */
    async pollIfNeeded(interval = PASSIVE_POLL_INTERVAL) {
        if (this.pollNeeded(interval)) {
            const status = await this.getStatus();
            this.lastPolledAt = Date.now();
            return status;
        }
        return undefined;
    }
    /**
     * Get device information
     */
    getInfo() {
        return { ...this.info };
    }
    /**
     * Get device ID
     */
    getId() {
        return this.info.id;
    }
    /**
     * Get device ID (property accessor for convenience)
     */
    get id() {
        return this.info.id.length > 0 ? this.info.id : undefined;
    }
    /**
     * Get device name
     */
    getName() {
        return this.info.name;
    }
    /**
     * Get device name (property accessor for convenience)
     */
    get name() {
        return this.info.name;
    }
    /**
     * Get device type
     */
    getDeviceType() {
        return this.info.deviceType;
    }
    /**
     * Get device type (property accessor for convenience)
     */
    get deviceType() {
        return this.info.deviceType;
    }
    /**
     * Get MAC address (if available)
     */
    getMAC() {
        return this.info.mac && this.info.mac.length > 0 ? this.info.mac : undefined;
    }
    /**
     * Get MAC address (property accessor for convenience)
     */
    get mac() {
        return this.info.mac && this.info.mac.length > 0 ? this.info.mac : undefined;
    }
    /**
     * Get active connection type
     */
    getActiveConnection() {
        return this.info.activeConnection;
    }
    /**
     * Get active connection type (property accessor for convenience)
     */
    get activeConnection() {
        return this.info.activeConnection;
    }
    /**
     * Check if BLE is available for this device
     */
    hasBLE() {
        return this.info.connectionTypes.includes('ble') && !!this.bleConnection && (!!this.info.mac || !!this.info.bleId);
    }
    /**
     * Check if API is available for this device
     */
    hasAPI() {
        return this.info.connectionTypes.includes('api') && !!this.apiClient && this.info.cloudServiceEnabled !== false;
    }
    emitError(payload) {
        if (this.listenerCount('error') > 0) {
            this.emit('error', payload);
        }
    }
    /**
     * Get device status (abstract - implemented by subclasses)
     */
    /**
     * Get device status with BLE-first/API-fallback logic (centralized)
     * Subclasses should call this and map/normalize fields as needed.
     */
    async getStatusWithFallback(normalizeBLE, normalizeAPI) {
        // Determine connection order
        const preferBLE = this.preferredConnection === 'ble';
        const tryBLE = () => this.getBLEStatus().then(normalizeBLE ?? (d => d));
        const tryAPI = () => this.getAPIStatus().then(normalizeAPI ?? (d => d));
        // BLE-first
        if (preferBLE && this.hasBLE()) {
            try {
                return await tryBLE();
            }
            catch (err) {
                this.logger?.warn?.('BLE getStatus failed, falling back to API', err);
            }
            if (this.enableFallback && this.hasAPI()) {
                return await tryAPI();
            }
        }
        // API-first
        if (!preferBLE && this.hasAPI()) {
            try {
                return await tryAPI();
            }
            catch (err) {
                this.logger?.warn?.('API getStatus failed, falling back to BLE', err);
            }
            if (this.enableFallback && this.hasBLE()) {
                return await tryBLE();
            }
        }
        throw new Error('No connection method available for getStatus');
    }
    /**
     * Send a command via BLE with circuit breaker and retry logic
     */
    async sendBLECommand(command, writeOnly = false) {
        if (!this.hasBLE()) {
            return {
                success: false,
                connectionType: 'ble',
                error: 'BLE not available for this device',
            };
        }
        // Check circuit breaker
        if (this.enableCircuitBreaker && !this.circuitBreakerBLE.canExecute()) {
            const state = this.circuitBreakerBLE.getState();
            if (state === CircuitBreakerState.OPEN) {
                return {
                    success: false,
                    connectionType: 'ble',
                    error: 'BLE circuit breaker is OPEN (too many failures)',
                };
            }
        }
        const executeCommand = async () => {
            this.logger.debug('Sending BLE command', command);
            const buffer = Buffer.isBuffer(command) ? command : Buffer.from(command);
            const startTime = Date.now();
            const mac = this.info.mac && this.info.mac.length > 0 ? this.info.mac : `id:${this.info.bleId}`;
            let response;
            if (this.info.encryptionKey && this.info.encryptionIV && this.bleConnection?.setEncryption) {
                this.bleConnection.setEncryption(mac, this.info.encryptionKey, this.info.encryptionIV, this.info.encryptionMode ?? 'auto');
            }
            if (writeOnly) {
                await this.bleConnection.write(mac, buffer);
            }
            else if (this.bleConnection?.sendCommand) {
                response = await this.bleConnection.sendCommand(mac, buffer, {
                    expectResponse: true,
                    validateResponse: true,
                    responseTimeoutMs: 1200,
                });
            }
            else {
                await this.bleConnection.write(mac, buffer);
            }
            const latencyMs = Date.now() - startTime;
            // Record success
            if (this.enableConnectionIntelligence) {
                this.connectionTracker.recordSuccess('ble', latencyMs);
            }
            if (this.enableCircuitBreaker) {
                this.circuitBreakerBLE.recordSuccess();
            }
            this.info.activeConnection = 'ble';
            this.emit('command', { type: 'ble', success: true });
            return {
                success: true,
                connectionType: 'ble',
                data: response,
            };
        };
        try {
            return await this.runWithBLELock(async () => {
                if (this.enableRetry) {
                    this.circuitBreakerBLE.markHalfOpenAttempt();
                    return await this.retryExecutor.executeOrThrow(executeCommand, `BLE command for ${this.info.id}`);
                }
                else {
                    if (this.enableCircuitBreaker) {
                        this.circuitBreakerBLE.markHalfOpenAttempt();
                    }
                    return await executeCommand();
                }
            });
        }
        catch (error) {
            // Record failure
            if (this.enableConnectionIntelligence) {
                this.connectionTracker.recordFailure('ble');
            }
            if (this.enableCircuitBreaker) {
                this.circuitBreakerBLE.recordFailure();
            }
            this.logger.error('BLE command failed', error);
            this.emitError({ type: 'ble', error });
            return {
                success: false,
                connectionType: 'ble',
                error: error.message,
            };
        }
    }
    /**
     * Send a command via OpenAPI with circuit breaker and retry logic
     */
    async sendAPICommand(command, parameter) {
        if (!this.hasAPI()) {
            return {
                success: false,
                connectionType: 'api',
                error: 'API not available for this device',
            };
        }
        // Check circuit breaker
        if (this.enableCircuitBreaker && !this.circuitBreakerAPI.canExecute()) {
            const state = this.circuitBreakerAPI.getState();
            if (state === CircuitBreakerState.OPEN) {
                return {
                    success: false,
                    connectionType: 'api',
                    error: 'API circuit breaker is OPEN (too many failures)',
                };
            }
        }
        const executeCommand = async () => {
            this.logger.debug('Sending API command', { command, parameter });
            const startTime = Date.now();
            const response = await this.apiClient.sendCommand(this.info.id, command, parameter);
            const latencyMs = Date.now() - startTime;
            // Record success
            if (this.enableConnectionIntelligence) {
                this.connectionTracker.recordSuccess('api', latencyMs);
            }
            if (this.enableCircuitBreaker) {
                this.circuitBreakerAPI.recordSuccess();
            }
            this.info.activeConnection = 'api';
            this.emit('command', { type: 'api', success: true });
            return {
                success: true,
                connectionType: 'api',
                data: response,
            };
        };
        try {
            if (this.enableRetry) {
                this.circuitBreakerAPI.markHalfOpenAttempt();
                return await this.retryExecutor.executeOrThrow(executeCommand, `API command for ${this.info.id}`);
            }
            else {
                if (this.enableCircuitBreaker) {
                    this.circuitBreakerAPI.markHalfOpenAttempt();
                }
                return await executeCommand();
            }
        }
        catch (error) {
            // Record failure
            if (this.enableConnectionIntelligence) {
                this.connectionTracker.recordFailure('api');
            }
            if (this.enableCircuitBreaker) {
                this.circuitBreakerAPI.recordFailure();
            }
            this.logger.error('API command failed', error);
            this.emitError({ type: 'api', error });
            return {
                success: false,
                connectionType: 'api',
                error: error.message,
            };
        }
    }
    /**
     * Get best connection type based on intelligence tracking
     */
    getBestConnection() {
        if (!this.enableConnectionIntelligence) {
            return this.preferredConnection;
        }
        const availableTypes = [];
        if (this.hasBLE()) {
            availableTypes.push('ble');
        }
        if (this.hasAPI()) {
            availableTypes.push('api');
        }
        if (availableTypes.length === 0) {
            return this.preferredConnection;
        }
        // Get best connection based on statistics
        const best = this.connectionTracker.getBestConnection(availableTypes);
        if (best) {
            return best;
        }
        return availableTypes.length > 0 ? availableTypes[0] : this.preferredConnection;
    }
    /**
     * Send a command with automatic BLE/API fallback, circuit breaker, and retry logic
     */
    async sendCommand(bleCommand, apiCommand, apiParameter, writeOnly = false) {
        // Determine connection strategy
        let primaryConnection = this.preferredConnection;
        let secondaryConnection;
        if (this.enableConnectionIntelligence) {
            primaryConnection = this.getBestConnection();
            if (this.preferredConnection === 'ble' && primaryConnection === 'api' && this.hasBLE()) {
                secondaryConnection = 'ble';
            }
            else if (this.preferredConnection === 'api' && primaryConnection === 'ble' && this.hasAPI()) {
                secondaryConnection = 'api';
            }
        }
        else {
            // Fallback based on preferred connection
            if (this.preferredConnection === 'ble' && this.hasBLE()) {
                primaryConnection = 'ble';
                if (this.enableFallback && this.hasAPI()) {
                    secondaryConnection = 'api';
                }
            }
            else if (this.preferredConnection === 'api' && this.hasAPI()) {
                primaryConnection = 'api';
                if (this.enableFallback && this.hasBLE()) {
                    secondaryConnection = 'ble';
                }
            }
            else if (this.hasBLE()) {
                primaryConnection = 'ble';
                if (this.enableFallback && this.hasAPI()) {
                    secondaryConnection = 'api';
                }
            }
            else {
                primaryConnection = 'api';
                secondaryConnection = undefined;
            }
        }
        // Try primary connection
        let result;
        let fallbackUsed = false;
        if (primaryConnection === 'ble') {
            result = await this.sendBLECommand(bleCommand, writeOnly);
        }
        else {
            result = await this.sendAPICommand(apiCommand, apiParameter);
        }
        // Try fallback if primary failed and fallback is enabled
        if (!result.success && this.enableFallback && secondaryConnection) {
            fallbackUsed = true;
            this.logger.warn(`${primaryConnection} failed, attempting fallback to ${secondaryConnection}`);
            // Emit fallback event
            const fallbackEvent = {
                deviceId: this.info.id,
                primaryConnection,
                fallbackConnection: secondaryConnection,
                reason: result.error || 'Connection failed',
                timestamp: new Date(),
                totalTimeMs: 0,
            };
            await this.fallbackHandlerManager.emit(fallbackEvent);
            if (secondaryConnection === 'ble') {
                result = await this.sendBLECommand(bleCommand, writeOnly);
            }
            else {
                result = await this.sendAPICommand(apiCommand, apiParameter);
            }
        }
        if (fallbackUsed) {
            result.usedFallback = true;
        }
        return result;
    }
    /**
     * Get device status via BLE
     */
    async getBLEStatus() {
        if (!this.hasBLE()) {
            throw new BLENotAvailableError('BLE not available for this device');
        }
        try {
            this.logger.debug('Reading BLE status');
            const startTime = Date.now();
            const data = await this.bleConnection.read(this.info.mac ?? `id:${this.info.bleId}`);
            const latencyMs = Date.now() - startTime;
            if (this.enableConnectionIntelligence) {
                this.connectionTracker.recordSuccess('ble', latencyMs);
            }
            if (this.enableCircuitBreaker) {
                this.circuitBreakerBLE.recordSuccess();
            }
            this.info.activeConnection = 'ble';
            return this.normalizeBLEStatusData(data);
        }
        catch (error) {
            if (this.enableConnectionIntelligence) {
                this.connectionTracker.recordFailure('ble');
            }
            if (this.enableCircuitBreaker) {
                this.circuitBreakerBLE.recordFailure();
            }
            this.logger.error('Failed to read BLE status', error);
            throw error;
        }
    }
    normalizeBLEStatusData(data) {
        if (data && typeof data === 'object' && !Buffer.isBuffer(data)) {
            return data;
        }
        return (this.info.bleServiceData ?? {});
    }
    async runWithBLELock(fn) {
        const previous = this.bleOperationQueue;
        let release = () => { };
        this.bleOperationQueue = new Promise((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            return await fn();
        }
        finally {
            release();
        }
    }
    /**
     * Get device status via OpenAPI
     */
    async getAPIStatus() {
        if (!this.hasAPI()) {
            throw new APINotAvailableError('API not available for this device');
        }
        try {
            this.logger.debug('Reading API status');
            const startTime = Date.now();
            const data = await this.apiClient.getStatus(this.info.id);
            const latencyMs = Date.now() - startTime;
            if (this.enableConnectionIntelligence) {
                this.connectionTracker.recordSuccess('api', latencyMs);
            }
            if (this.enableCircuitBreaker) {
                this.circuitBreakerAPI.recordSuccess();
            }
            this.info.activeConnection = 'api';
            return data;
        }
        catch (error) {
            if (this.enableConnectionIntelligence) {
                this.connectionTracker.recordFailure('api');
            }
            if (this.enableCircuitBreaker) {
                this.circuitBreakerAPI.recordFailure();
            }
            this.logger.error('Failed to read API status', error);
            throw error;
        }
    }
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
    async getBasicInfo() {
        // Prefer BLE if available
        if (this.hasBLE()) {
            return this.sendBLECommand(DEVICE_COMMANDS.RELAY.GET_BASIC_INFO);
        }
        // Fallback to API if available
        if (this.hasAPI()) {
            return this.sendAPICommand('getBasicInfo');
        }
        throw new Error('No available connection for getBasicInfo');
    }
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
    async setMode(mode) {
        // TODO: Extend with per-device mode enums/types as needed
        if (this.hasBLE()) {
            // BLE expects [0x57, 0x03, modeByte]
            const modeByte = typeof mode === 'number' ? mode : Number.parseInt(mode, 10);
            return this.sendBLECommand([0x57, 0x03, modeByte]);
        }
        if (this.hasAPI()) {
            // API expects 'setMode' command, parameter may be device-specific
            return this.sendAPICommand('setMode', { mode });
        }
        throw new Error('No available connection for setMode');
    }
    /**
     * Update device information
     */
    updateInfo(newInfo) {
        this.info = { ...this.info, ...newInfo };
        this.emit('info-updated', this.info);
    }
    /**
     * Set preferred connection type
     */
    setPreferredConnection(type) {
        this.preferredConnection = type;
        this.logger.info(`Preferred connection set to ${type}`);
    }
    /**
     * Enable or disable fallback
     */
    setFallbackEnabled(enabled) {
        this.enableFallback = enabled;
        this.logger.info(`Fallback ${enabled ? 'enabled' : 'disabled'}`);
    }
    /**
     * Enable or disable connection intelligence
     */
    setConnectionIntelligenceEnabled(enabled) {
        this.enableConnectionIntelligence = enabled;
        this.logger.info(`Connection intelligence ${enabled ? 'enabled' : 'disabled'}`);
    }
    /**
     * Enable or disable circuit breaker
     */
    setCircuitBreakerEnabled(enabled) {
        this.enableCircuitBreaker = enabled;
        this.logger.info(`Circuit breaker ${enabled ? 'enabled' : 'disabled'}`);
    }
    /**
     * Enable or disable retry logic
     */
    setRetryEnabled(enabled) {
        this.enableRetry = enabled;
        this.logger.info(`Retry logic ${enabled ? 'enabled' : 'disabled'}`);
    }
    /**
     * Get connection tracker for this device
     */
    getConnectionTracker() {
        return this.connectionTracker;
    }
    /**
     * Get circuit breaker for BLE
     */
    getCircuitBreakerBLE() {
        return this.circuitBreakerBLE;
    }
    /**
     * Get circuit breaker for API
     */
    getCircuitBreakerAPI() {
        return this.circuitBreakerAPI;
    }
    /**
     * Register a custom fallback handler
     */
    registerFallbackHandler(handler, options) {
        return this.fallbackHandlerManager.register(handler, options);
    }
    /**
     * Unregister a fallback handler
     */
    unregisterFallbackHandler(id) {
        return this.fallbackHandlerManager.unregister(id);
    }
    /**
     * Get fallback handler manager
     */
    getFallbackHandlerManager() {
        return this.fallbackHandlerManager;
    }
}
/**
 * Device Manager for managing multiple devices
 */
export class DeviceManager extends EventEmitter {
    devices = new Map();
    logger;
    constructor(logLevel) {
        super();
        this.logger = new Logger('DeviceManager', logLevel);
    }
    /**
     * Add a device to the manager
     */
    add(device) {
        const id = device.getId();
        if (this.devices.has(id)) {
            this.logger.warn(`Device ${id} already exists, replacing`);
        }
        this.devices.set(id, device);
        this.emit('device-added', device);
        this.logger.info(`Added device: ${device.getName()} (${id})`);
    }
    /**
     * Remove a device from the manager
     */
    remove(deviceId) {
        const device = this.devices.get(deviceId);
        if (device) {
            this.devices.delete(deviceId);
            this.emit('device-removed', device);
            this.logger.info(`Removed device: ${deviceId}`);
            return true;
        }
        return false;
    }
    /**
     * Get a device by ID
     */
    get(deviceId) {
        return this.devices.get(deviceId);
    }
    /**
     * Get all devices
     */
    list() {
        return [...this.devices.values()];
    }
    /**
     * Get devices filtered by type
     */
    getByType(deviceType) {
        return this.list().filter(device => device.getDeviceType() === deviceType);
    }
    /**
     * Get device by MAC address
     */
    getByMAC(mac) {
        return this.list().find(device => device.getMAC() === mac);
    }
    /**
     * Check if device exists
     */
    has(deviceId) {
        return this.devices.has(deviceId);
    }
    /**
     * Get device count
     */
    count() {
        return this.devices.size;
    }
    /**
     * Clear all devices
     */
    clear() {
        this.devices.clear();
        this.emit('devices-cleared');
        this.logger.info('All devices cleared');
    }
    /**
     * Get all device IDs
     */
    getIds() {
        return [...this.devices.keys()];
    }
    /**
     * Get devices as an object keyed by ID
     */
    toObject() {
        return Object.fromEntries(this.devices.entries());
    }
}
//# sourceMappingURL=base.js.map