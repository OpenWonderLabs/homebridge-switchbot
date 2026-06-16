/**
 * Retry configuration options
 */
export interface RetryConfig {
    /** Maximum number of retry attempts (default: 3) */
    maxAttempts?: number;
    /** Initial delay in milliseconds (default: 100) */
    initialDelayMs?: number;
    /** Maximum delay in milliseconds (default: 5000) */
    maxDelayMs?: number;
    /** Exponential backoff multiplier (default: 2) */
    backoffMultiplier?: number;
    /** Jitter factor 0-1 to randomize delays (default: 0.1) */
    jitterFactor?: number;
}
/**
 * Retry execution result
 */
export interface RetryResult<T> {
    /** Whether the operation succeeded */
    success: boolean;
    /** The result (if successful) */
    result?: T;
    /** The error (if failed) */
    error?: Error;
    /** Number of attempts made */
    attemptsCount: number;
    /** Total time spent retrying in milliseconds */
    totalTimeMs: number;
}
/**
 * Retry executor with exponential backoff
 */
export declare class RetryExecutor {
    private logger;
    private config;
    constructor(config?: RetryConfig, logLevel?: number);
    /**
     * Calculate delay for next attempt with exponential backoff
     */
    private calculateDelay;
    /**
     * Execute a function with automatic retries and exponential backoff
     */
    execute<T>(fn: () => Promise<T>, description?: string): Promise<RetryResult<T>>;
    /**
     * Convenience method: execute with retries, throw on final failure
     */
    executeOrThrow<T>(fn: () => Promise<T>, description?: string): Promise<T>;
}
/**
 * Convenience function: retry a promise with automatic backoff
 */
export declare function retry<T>(fn: () => Promise<T>, config?: RetryConfig, logLevel?: number): Promise<T>;
//# sourceMappingURL=retry.d.ts.map