/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * types/index.ts: SwitchBot v4.0.0 - Core Type Definitions
 */
/**
 * Log levels for debugging and diagnostics
 */
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["NONE"] = 0] = "NONE";
    LogLevel[LogLevel["ERROR"] = 1] = "ERROR";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["INFO"] = 3] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 4] = "DEBUG";
})(LogLevel || (LogLevel = {}));
export * from './api.js';
export * from './ble.js';
export * from './device.js';
//# sourceMappingURL=index.js.map