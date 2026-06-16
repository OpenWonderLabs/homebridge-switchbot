/**
 * Validates that a Buffer has at least the expected minimum length.
 * Throws an error if the buffer is too short, including actual vs expected length and context.
 */
/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * utils/index.ts: SwitchBot v4.0.0 - Utility Functions
 */
import { Buffer } from 'node:buffer';
export function extractDeviceOptionsFromConfig(config) {
    return {
        bleConnection: config.bleConnection,
        apiClient: config.apiClient,
        enableFallback: config.enableFallback,
        preferredConnection: config.preferredConnection,
        enableConnectionIntelligence: config.enableConnectionIntelligence,
        enableCircuitBreaker: config.enableCircuitBreaker,
        enableRetry: config.enableRetry,
        retryConfig: config.retryConfig,
        circuitBreakerConfig: config.circuitBreakerConfig,
        logLevel: config.logLevel,
        // Add more fields here as needed in the future
    };
}
export function deepMerge(oldObj, newObj) {
    const result = Array.isArray(oldObj) ? [...oldObj] : { ...oldObj };
    for (const key of Object.keys(newObj)) {
        const newVal = newObj[key];
        const oldVal = oldObj[key];
        if (newVal === undefined || newVal === null) {
            // Preserve old value
            result[key] = oldVal;
        }
        else if (typeof oldVal === 'object' && oldVal !== null
            && typeof newVal === 'object' && newVal !== null
            && !Array.isArray(newVal) && !Array.isArray(oldVal)) {
            // Recursively merge nested objects
            result[key] = deepMerge(oldVal, newVal);
        }
        else {
            // Use new value
            result[key] = newVal;
        }
    }
    return result;
}
export function mergeAdvertisement(oldAdv, newAdv) {
    return deepMerge(oldAdv, newAdv);
}
export function validateResponseLength(buffer, minLength, context) {
    if (!buffer || buffer.length < minLength) {
        throw new Error(`Truncated response in ${context}: expected at least ${minLength} bytes, got ${buffer ? buffer.length : 0}`);
    }
}
/**
 * Logger utility for consistent logging across the library
 */
export class Logger {
    name;
    level;
    constructor(name, level = 2) {
        this.name = name;
        this.level = level;
    }
    setLevel(level) {
        this.level = level;
    }
    error(message, ...args) {
        if (this.level >= 1) {
            console.error(`[${this.name}] ERROR:`, message, ...args);
        }
    }
    warn(message, ...args) {
        if (this.level >= 2) {
            console.warn(`[${this.name}] WARN:`, message, ...args);
        }
    }
    info(message, ...args) {
        if (this.level >= 3) {
            console.warn(`[${this.name}] INFO:`, message, ...args);
        }
    }
    debug(message, ...args) {
        if (this.level >= 4) {
            console.warn(`[${this.name}] DEBUG:`, message, ...args);
        }
    }
}
// Regex patterns at module scope to avoid recompilation
const MAC_REGEX = /^(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/i;
const DASH_REGEX = /-/g;
const COLON_REGEX = /:/g;
/**
 * Validate MAC address format
 */
export function isValidMAC(mac) {
    return MAC_REGEX.test(mac);
}
/**
 * Normalize MAC address to lowercase with colons
 */
export function normalizeMAC(mac) {
    return mac.toLowerCase().replace(DASH_REGEX, ':');
}
/**
 * Convert MAC address to device ID format
 */
export function macToDeviceId(mac) {
    return mac.replace(COLON_REGEX, '').toUpperCase();
}
/**
 * Extract MAC address from manufacturer data (SwitchBot: company ID 0x0969)
 * Bytes: [2 bytes company ID (69 09)] + [6 bytes MAC] + ...
 */
export function extractMacFromManufacturerData(manufacturerDataHex) {
    if (!manufacturerDataHex || typeof manufacturerDataHex !== 'string') {
        return undefined;
    }
    // Check if hex string starts with 6909 (SwitchBot company ID in little-endian)
    if (!manufacturerDataHex.startsWith('6909')) {
        return undefined;
    }
    // Extract 6 bytes (12 hex chars) starting at position 4 (after company ID)
    const macHex = manufacturerDataHex.substring(4, 16);
    if (macHex.length !== 12) {
        return undefined;
    }
    // Convert to MAC address format: XX:XX:XX:XX:XX:XX
    return [
        macHex.substring(0, 2),
        macHex.substring(2, 4),
        macHex.substring(4, 6),
        macHex.substring(6, 8),
        macHex.substring(8, 10),
        macHex.substring(10, 12),
    ].join(':').toUpperCase();
}
/**
 * Delay utility
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Timeout promise wrapper
 */
export async function withTimeout(promise, timeoutMs, errorMessage = 'Operation timed out') {
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });
    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutHandle);
        return result;
    }
    catch (error) {
        clearTimeout(timeoutHandle);
        throw error;
    }
}
/**
 * Retry utility with exponential backoff
 */
export async function retry(fn, options = {}) {
    const { maxAttempts = 3, delayMs = 1000, backoff = true, onRetry, } = options;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt < maxAttempts) {
                const waitTime = backoff ? delayMs * attempt : delayMs;
                onRetry?.(attempt, lastError);
                await delay(waitTime);
            }
        }
    }
    throw lastError ?? new Error('Retry failed without a captured error');
}
/**
 * Clamp a number between min and max
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
/**
 * Convert temperature from Celsius to Fahrenheit
 */
export function celsiusToFahrenheit(celsius) {
    return (celsius * 9 / 5) + 32;
}
/**
 * Convert temperature from Fahrenheit to Celsius
 */
export function fahrenheitToCelsius(fahrenheit) {
    return (fahrenheit - 32) * 5 / 9;
}
/**
 * Parse hex string to buffer
 */
export function hexToBuffer(hex) {
    return Buffer.from(hex, 'hex');
}
/**
 * Convert buffer to hex string
 */
export function bufferToHex(buffer) {
    return buffer.toString('hex');
}
/**
 * Generate random nonce for API requests
 */
export function generateNonce() {
    return Math.random().toString(36).substring(2, 15)
        + Math.random().toString(36).substring(2, 15);
}
/**
 * Generate timestamp for API requests
 */
export function generateTimestamp() {
    return Date.now().toString();
}
/**
 * Create HMAC-SHA256 signature for OpenAPI
 */
export async function createSignature(token, secret, timestamp, nonce) {
    const crypto = await import('node:crypto');
    const data = `${token}${timestamp}${nonce}`;
    return crypto.createHmac('sha256', secret).update(data).digest('base64');
}
/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse(json, fallback) {
    try {
        return JSON.parse(json);
    }
    catch {
        return fallback;
    }
}
/**
 * Check if value is a promise
 */
export function isPromise(value) {
    return value && typeof value.then === 'function';
}
/**
 * Deep clone an object
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
/**
 * Debounce function
 */
export function debounce(fn, delayMs) {
    let timeoutId = null;
    return (...args) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            fn(...args);
            timeoutId = null;
        }, delayMs);
    };
}
/**
 * Throttle function
 */
export function throttle(fn, limitMs) {
    let lastRun = 0;
    return (...args) => {
        const now = Date.now();
        if (now - lastRun >= limitMs) {
            fn(...args);
            lastRun = now;
        }
    };
}
// Export Bot BLE password utilities
export { BOT_BLE_ACTIONS, buildBotBleCommand, parseBotBleResponse, validateBotPassword, } from './bot-ble.js';
export { CircuitBreaker, CircuitBreakerState } from './circuit-breaker.js';
export { ConnectionTracker } from './connection-tracker.js';
export { createAlertHandler, createLoggingFallbackHandler, createMetricsCollectionHandler, FallbackHandlerManager, } from './fallback-handler.js';
// Export advanced utilities
export { RetryExecutor } from './retry.js';
//# sourceMappingURL=index.js.map