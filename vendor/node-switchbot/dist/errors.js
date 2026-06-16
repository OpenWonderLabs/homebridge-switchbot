/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * errors.ts: SwitchBot v4.0.0 - Custom Error Classes
 */
/**
 * Base error class for SwitchBot errors
 */
export class SwitchBotError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'SwitchBotError';
    }
}
/**
 * Error thrown for generic BLE operation failures
 */
export class SwitchbotOperationError extends SwitchBotError {
    originalError;
    constructor(message, originalError) {
        super(message, 'BLE_OPERATION_FAILED');
        this.originalError = originalError;
        this.name = 'SwitchbotOperationError';
    }
}
/**
 * Error thrown for BLE authentication failures (e.g., encryption key invalid)
 */
export class SwitchbotAuthenticationError extends SwitchBotError {
    originalError;
    constructor(message, originalError) {
        super(message, 'BLE_AUTH_FAILED');
        this.originalError = originalError;
        this.name = 'SwitchbotAuthenticationError';
    }
}
/**
 * Error thrown when a required BLE characteristic is missing
 */
export class CharacteristicMissingError extends SwitchBotError {
    constructor(characteristic) {
        super(`BLE characteristic missing: ${characteristic}`, 'BLE_CHARACTERISTIC_MISSING');
        this.name = 'CharacteristicMissingError';
    }
}
/**
 * Error thrown when BLE is not available or supported
 */
export class BLENotAvailableError extends SwitchBotError {
    constructor(message = 'BLE not available on this platform or device') {
        super(message, 'BLE_NOT_AVAILABLE');
        this.name = 'BLENotAvailableError';
    }
}
/**
 * Error thrown when API is not available or credentials are missing
 */
export class APINotAvailableError extends SwitchBotError {
    constructor(message = 'API not available or credentials not provided') {
        super(message, 'API_NOT_AVAILABLE');
        this.name = 'APINotAvailableError';
    }
}
/**
 * Error thrown when a device is not found
 */
export class DeviceNotFoundError extends SwitchBotError {
    constructor(deviceId) {
        super(`Device not found: ${deviceId}`, 'DEVICE_NOT_FOUND');
        this.name = 'DeviceNotFoundError';
    }
}
/**
 * Error thrown when a command fails
 */
export class CommandFailedError extends SwitchBotError {
    connectionType;
    originalError;
    constructor(message, connectionType, originalError) {
        super(message, 'COMMAND_FAILED');
        this.connectionType = connectionType;
        this.originalError = originalError;
        this.name = 'CommandFailedError';
    }
}
/**
 * Error thrown when a connection timeout occurs
 */
export class ConnectionTimeoutError extends SwitchBotError {
    timeoutMs;
    constructor(message = 'Connection timeout', timeoutMs) {
        super(message, 'CONNECTION_TIMEOUT');
        this.timeoutMs = timeoutMs;
        this.name = 'ConnectionTimeoutError';
    }
}
/**
 * Error thrown when device discovery fails
 */
export class DiscoveryError extends SwitchBotError {
    originalError;
    constructor(message, originalError) {
        super(message, 'DISCOVERY_ERROR');
        this.originalError = originalError;
        this.name = 'DiscoveryError';
    }
}
/**
 * Error thrown when API request fails
 */
export class APIError extends SwitchBotError {
    statusCode;
    statusMessage;
    constructor(message, statusCode, statusMessage) {
        super(message, 'API_ERROR');
        this.statusCode = statusCode;
        this.statusMessage = statusMessage;
        this.name = 'APIError';
    }
}
/**
 * Error thrown when invalid parameters are provided
 */
export class ValidationError extends SwitchBotError {
    parameter;
    constructor(message, parameter) {
        super(message, 'VALIDATION_ERROR');
        this.parameter = parameter;
        this.name = 'ValidationError';
    }
}
//# sourceMappingURL=errors.js.map