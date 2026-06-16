/**
 * Log levels for debugging and diagnostics
 */
export declare enum LogLevel {
    NONE = 0,
    ERROR = 1,
    WARN = 2,
    INFO = 3,
    DEBUG = 4
}
/**
 * Device connection type
 */
export type ConnectionType = 'ble' | 'api' | 'hybrid';
/**
 * SwitchBot configuration options
 */
export interface SwitchBotConfig {
    /** OpenAPI token (optional - required for API/Hybrid mode) */
    token?: string;
    /** OpenAPI secret (optional - required for API/Hybrid mode) */
    secret?: string;
    /** OpenAPI base URL (optional - defaults to official API) */
    baseURL?: string;
    /** Enable BLE scanning (default: true on Linux) */
    enableBLE?: boolean;
    /** BLE scan timeout in milliseconds (default: 10000) */
    scanTimeout?: number;
    /** Enable BLE to API fallback on errors (default: true) */
    enableFallback?: boolean;
    /** Log level (default: WARN) */
    logLevel?: LogLevel;
    /** Noble instance (optional - for custom BLE configuration) */
    noble?: any;
    /** Enable intelligent connection selection based on success history (default: true) */
    enableConnectionIntelligence?: boolean;
    /** Enable circuit breaker for connection reliability (default: true) */
    enableCircuitBreaker?: boolean;
    /** Enable automatic retry with exponential backoff (default: true) */
    enableRetry?: boolean;
    /** Maximum retry attempts per command (default: 3) */
    maxRetryAttempts?: number;
    /** Initial retry delay in milliseconds (default: 100) */
    retryInitialDelayMs?: number;
    /** Maximum retry delay in milliseconds (default: 5000) */
    retryMaxDelayMs?: number;
    /** Enable detailed error reporting in command results (default: false) */
    detailedErrors?: boolean;
    /** Custom logger instance (optional) */
    logger?: {
        error: (message: string, ...args: any[]) => void;
        warn: (message: string, ...args: any[]) => void;
        info: (message: string, ...args: any[]) => void;
        debug: (message: string, ...args: any[]) => void;
    };
    /** Additional custom options can be added as needed */
    [key: string]: any;
    /** Internal options for testing and advanced use (not part of public API) */
    _internal?: {
        /** Force use of BLE for testing (overrides intelligent selection) */
        forceBLE?: boolean;
        /** Force use of API for testing (overrides intelligent selection) */
        forceAPI?: boolean;
    };
}
/**
 * Device discovery options
 */
export interface DiscoveryOptions {
    /** Scan for BLE devices (default: true if BLE enabled) */
    scanBLE?: boolean;
    /** Fetch devices from API (default: true if credentials provided) */
    fetchAPI?: boolean;
    /** Discovery timeout in milliseconds (default: 10000) */
    timeout?: number;
    /** Filter by device ID (optional) */
    deviceId?: string;
    /** Filter by device MAC address (optional) */
    mac?: string;
    /** Filter by device type (optional) */
    deviceType?: string;
}
/**
 * Base device information
 */
export interface DeviceInfo {
    /** Device ID */
    id: string;
    /** Device name */
    name: string;
    /** Device type (e.g., 'Bot', 'Curtain', 'Lock') */
    deviceType: string;
    /** Device model */
    model?: string;
    /** MAC address (for BLE devices) */
    mac?: string;
    /** BLE peripheral/advertisement ID (for ID-based lookups on macOS) */
    bleId?: string;
    /** Available connection types */
    connectionTypes: ConnectionType[];
    /** Current active connection type */
    activeConnection?: ConnectionType;
    /** Hub device ID (if device is controlled through a hub) */
    hubDeviceId?: string;
    /** Battery level (0-100) */
    battery?: number;
    /** RSSI signal strength (for BLE) */
    rssi?: number;
    /** Last parsed BLE advertisement service data */
    bleServiceData?: Record<string, unknown>;
    /** Optional BLE encryption key as hex (16 bytes / 32 hex chars) */
    encryptionKey?: string;
    /** Optional BLE encryption IV as hex */
    encryptionIV?: string;
    /** Optional BLE encryption mode */
    encryptionMode?: 'auto' | 'ctr' | 'gcm';
    /** Firmware version */
    version?: string;
    /** CloudService enabled in OpenAPI */
    cloudServiceEnabled?: boolean;
}
/**
 * Device command result
 */
export interface CommandResult {
    /** Success status */
    success: boolean;
    /** Connection type used */
    connectionType: ConnectionType;
    /** Error message (if failed) */
    error?: string;
    /** Response data */
    data?: any;
    /** Whether API fallback was used */
    usedFallback?: boolean;
}
/**
 * Device status (generic - specific devices extend this)
 */
export interface DeviceStatus {
    /** Device ID */
    deviceId: string;
    /** Connection type used to retrieve status */
    connectionType: ConnectionType;
    /** Firmware version */
    version?: string;
    /** Battery level (0-100) */
    battery?: number;
    /** Last updated timestamp */
    updatedAt?: Date;
}
export * from './api.js';
export * from './ble.js';
export * from './device.js';
//# sourceMappingURL=index.d.ts.map