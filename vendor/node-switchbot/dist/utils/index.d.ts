/**
 * Recursively merges two objects, preserving old values when new values are null or undefined.
 * Arrays are not deeply merged (new array replaces old).
 */
/**
 * Merges two BLEAdvertisement objects recursively, preserving old values when new are null/undefined.
 */
import type { BLEAdvertisement } from '../types/ble.js';
/**
 * Extracts all device-relevant options from a SwitchBotConfig object.
 * Ensures future config fields are automatically supported for device instantiation.
 */
import type { LogLevel, SwitchBotConfig } from '../types/index.js';
/**
 * Validates that a Buffer has at least the expected minimum length.
 * Throws an error if the buffer is too short, including actual vs expected length and context.
 */
import { Buffer } from 'node:buffer';
export declare function extractDeviceOptionsFromConfig(config: SwitchBotConfig): Record<string, unknown>;
export declare function deepMerge<T extends Record<string, any>>(oldObj: T, newObj: Partial<T>): T;
export declare function mergeAdvertisement<T extends BLEAdvertisement>(oldAdv: T, newAdv: Partial<T>): T;
export declare function validateResponseLength(buffer: Buffer, minLength: number, context: string): void;
/**
 * Logger utility for consistent logging across the library
 */
export declare class Logger {
    private readonly name;
    private level;
    constructor(name: string, level?: LogLevel);
    setLevel(level: LogLevel): void;
    error(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
}
/**
 * Validate MAC address format
 */
export declare function isValidMAC(mac: string): boolean;
/**
 * Normalize MAC address to lowercase with colons
 */
export declare function normalizeMAC(mac: string): string;
/**
 * Convert MAC address to device ID format
 */
export declare function macToDeviceId(mac: string): string;
/**
 * Extract MAC address from manufacturer data (SwitchBot: company ID 0x0969)
 * Bytes: [2 bytes company ID (69 09)] + [6 bytes MAC] + ...
 */
export declare function extractMacFromManufacturerData(manufacturerDataHex?: unknown): string | undefined;
/**
 * Delay utility
 */
export declare function delay(ms: number): Promise<void>;
/**
 * Timeout promise wrapper
 */
export declare function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage?: string): Promise<T>;
/**
 * Retry utility with exponential backoff
 */
export declare function retry<T>(fn: () => Promise<T>, options?: {
    maxAttempts?: number;
    delayMs?: number;
    backoff?: boolean;
    onRetry?: (attempt: number, error: Error) => void;
}): Promise<T>;
/**
 * Clamp a number between min and max
 */
export declare function clamp(value: number, min: number, max: number): number;
/**
 * Convert temperature from Celsius to Fahrenheit
 */
export declare function celsiusToFahrenheit(celsius: number): number;
/**
 * Convert temperature from Fahrenheit to Celsius
 */
export declare function fahrenheitToCelsius(fahrenheit: number): number;
/**
 * Parse hex string to buffer
 */
export declare function hexToBuffer(hex: string): Buffer;
/**
 * Convert buffer to hex string
 */
export declare function bufferToHex(buffer: Buffer): string;
/**
 * Generate random nonce for API requests
 */
export declare function generateNonce(): string;
/**
 * Generate timestamp for API requests
 */
export declare function generateTimestamp(): string;
/**
 * Create HMAC-SHA256 signature for OpenAPI
 */
export declare function createSignature(token: string, secret: string, timestamp: string, nonce: string): Promise<string>;
/**
 * Safe JSON parse with fallback
 */
export declare function safeJsonParse<T>(json: string, fallback: T): T;
/**
 * Check if value is a promise
 */
export declare function isPromise<T>(value: any): value is Promise<T>;
/**
 * Deep clone an object
 */
export declare function deepClone<T>(obj: T): T;
/**
 * Debounce function
 */
export declare function debounce<T extends (...args: any[]) => any>(fn: T, delayMs: number): (...args: Parameters<T>) => void;
/**
 * Throttle function
 */
export declare function throttle<T extends (...args: any[]) => any>(fn: T, limitMs: number): (...args: Parameters<T>) => void;
export { BOT_BLE_ACTIONS, type BotBleAction, buildBotBleCommand, parseBotBleResponse, validateBotPassword, } from './bot-ble.js';
export { CircuitBreaker, type CircuitBreakerConfig, CircuitBreakerState, type CircuitBreakerStats } from './circuit-breaker.js';
export { type ConnectionStats, ConnectionTracker } from './connection-tracker.js';
export { createAlertHandler, createLoggingFallbackHandler, createMetricsCollectionHandler, type FallbackEvent, type FallbackHandler, FallbackHandlerManager, type FallbackHandlerOptions, } from './fallback-handler.js';
export { type RetryConfig, RetryExecutor, type RetryResult } from './retry.js';
//# sourceMappingURL=index.d.ts.map