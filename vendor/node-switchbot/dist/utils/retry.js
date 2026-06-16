/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * utils/retry.ts: SwitchBot v4.0.0 - Retry Logic with Exponential Backoff
 */
import { Logger } from './index.js';
// BLEAK_RETRY_EXCEPTIONS: error messages/types that should trigger a retry
const BLEAK_RETRY_EXCEPTIONS = [
    'Device with address',
    'Failed to connect to peripheral',
    'org.freedesktop.DBus.Error',
    'org.bluez.Error',
    'Connection was reset',
    'Connection timed out',
    'Operation already in progress',
    'Operation failed',
    'Not connected',
    'No such device',
    'Resource temporarily unavailable',
    'Software caused connection abort',
    'Connection refused',
    'Connection reset by peer',
    'Connection aborted',
    'Connection error',
    'TimeoutError',
];
/**
 * DBus/BlueZ error regex (moved to module scope for performance)
 */
const DBUS_ERROR_REGEX = /org\.freedesktop\.DBus|org\.bluez|DBus|BlueZ/i;
/**
 * Retry executor with exponential backoff
 */
export class RetryExecutor {
    logger;
    config;
    constructor(config = {}, logLevel) {
        this.config = {
            maxAttempts: config.maxAttempts ?? 3,
            initialDelayMs: config.initialDelayMs ?? 100,
            maxDelayMs: config.maxDelayMs ?? 5000,
            backoffMultiplier: config.backoffMultiplier ?? 2,
            jitterFactor: config.jitterFactor ?? 0.1,
        };
        this.logger = new Logger('RetryExecutor', logLevel);
    }
    /**
     * Calculate delay for next attempt with exponential backoff
     */
    calculateDelay(attemptNumber) {
        const exponentialDelay = this.config.initialDelayMs * this.config.backoffMultiplier ** (attemptNumber - 1);
        const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);
        // Add jitter to prevent thundering herd
        const jitter = cappedDelay * this.config.jitterFactor * (Math.random() * 2 - 1);
        return Math.max(0, cappedDelay + jitter);
    }
    /**
     * Execute a function with automatic retries and exponential backoff
     */
    async execute(fn, description = 'Operation') {
        let lastError;
        let totalTimeMs = 0;
        let attemptNumber = 0;
        for (attemptNumber = 1; attemptNumber <= this.config.maxAttempts; attemptNumber++) {
            try {
                const startTime = Date.now();
                const result = await fn();
                const elapsedMs = Date.now() - startTime;
                totalTimeMs += elapsedMs;
                if (attemptNumber > 1) {
                    this.logger.info(`${description} succeeded on attempt ${attemptNumber}/${this.config.maxAttempts}`);
                }
                return {
                    success: true,
                    result,
                    attemptsCount: attemptNumber,
                    totalTimeMs,
                };
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                const errorMsg = lastError.message || String(lastError);
                const isDBusError = DBUS_ERROR_REGEX.test(errorMsg);
                const isBleakRetry = BLEAK_RETRY_EXCEPTIONS.some(msg => errorMsg.includes(msg));
                const elapsedMs = Date.now() - (Date.now() - totalTimeMs);
                totalTimeMs += elapsedMs;
                if (attemptNumber < this.config.maxAttempts && (isDBusError || isBleakRetry || attemptNumber < this.config.maxAttempts)) {
                    // DBus error: always backoff 0.25s (250ms) before normal backoff
                    if (isDBusError) {
                        this.logger.warn(`${description} DBus error detected on attempt ${attemptNumber}, applying 250ms backoff`, { error: errorMsg });
                        await new Promise(resolve => setTimeout(resolve, 250));
                    }
                    const delayMs = this.calculateDelay(attemptNumber);
                    this.logger.warn(`${description} failed on attempt ${attemptNumber}/${this.config.maxAttempts}, retrying in ${delayMs}ms`, {
                        error: errorMsg,
                        attempt: attemptNumber,
                        errorType: lastError.name,
                        isDBusError,
                        isBleakRetry,
                    });
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
                else {
                    this.logger.error(`${description} failed after ${attemptNumber} attempts`, {
                        error: errorMsg,
                        attempt: attemptNumber,
                        errorType: lastError.name,
                        isDBusError,
                        isBleakRetry,
                    });
                }
            }
        }
        return {
            success: false,
            error: new Error(`Retry failed after ${attemptNumber - 1} attempts. Last error: ${lastError?.name || 'Unknown'}: ${lastError?.message || 'Unknown error'}`),
            attemptsCount: attemptNumber - 1,
            totalTimeMs,
        };
    }
    /**
     * Convenience method: execute with retries, throw on final failure
     */
    async executeOrThrow(fn, description = 'Operation') {
        const result = await this.execute(fn, description);
        if (result.success) {
            return result.result;
        }
        throw result.error;
    }
}
/**
 * Convenience function: retry a promise with automatic backoff
 */
export async function retry(fn, config = {}, logLevel) {
    const executor = new RetryExecutor(config, logLevel);
    return executor.executeOrThrow(fn);
}
//# sourceMappingURL=retry.js.map