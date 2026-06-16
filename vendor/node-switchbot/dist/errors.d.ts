/**
 * Base error class for SwitchBot errors
 */
export declare class SwitchBotError extends Error {
    readonly code?: string | undefined;
    constructor(message: string, code?: string | undefined);
}
/**
 * Error thrown for generic BLE operation failures
 */
export declare class SwitchbotOperationError extends SwitchBotError {
    readonly originalError?: Error | undefined;
    constructor(message: string, originalError?: Error | undefined);
}
/**
 * Error thrown for BLE authentication failures (e.g., encryption key invalid)
 */
export declare class SwitchbotAuthenticationError extends SwitchBotError {
    readonly originalError?: Error | undefined;
    constructor(message: string, originalError?: Error | undefined);
}
/**
 * Error thrown when a required BLE characteristic is missing
 */
export declare class CharacteristicMissingError extends SwitchBotError {
    constructor(characteristic: string);
}
/**
 * Error thrown when BLE is not available or supported
 */
export declare class BLENotAvailableError extends SwitchBotError {
    constructor(message?: string);
}
/**
 * Error thrown when API is not available or credentials are missing
 */
export declare class APINotAvailableError extends SwitchBotError {
    constructor(message?: string);
}
/**
 * Error thrown when a device is not found
 */
export declare class DeviceNotFoundError extends SwitchBotError {
    constructor(deviceId: string);
}
/**
 * Error thrown when a command fails
 */
export declare class CommandFailedError extends SwitchBotError {
    readonly connectionType?: "ble" | "api" | undefined;
    readonly originalError?: Error | undefined;
    constructor(message: string, connectionType?: "ble" | "api" | undefined, originalError?: Error | undefined);
}
/**
 * Error thrown when a connection timeout occurs
 */
export declare class ConnectionTimeoutError extends SwitchBotError {
    readonly timeoutMs?: number | undefined;
    constructor(message?: string, timeoutMs?: number | undefined);
}
/**
 * Error thrown when device discovery fails
 */
export declare class DiscoveryError extends SwitchBotError {
    readonly originalError?: Error | undefined;
    constructor(message: string, originalError?: Error | undefined);
}
/**
 * Error thrown when API request fails
 */
export declare class APIError extends SwitchBotError {
    readonly statusCode?: number | undefined;
    readonly statusMessage?: string | undefined;
    constructor(message: string, statusCode?: number | undefined, statusMessage?: string | undefined);
}
/**
 * Error thrown when invalid parameters are provided
 */
export declare class ValidationError extends SwitchBotError {
    readonly parameter?: string | undefined;
    constructor(message: string, parameter?: string | undefined);
}
//# sourceMappingURL=errors.d.ts.map