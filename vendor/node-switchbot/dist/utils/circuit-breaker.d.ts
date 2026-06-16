/**
 * Circuit breaker states
 */
export declare enum CircuitBreakerState {
    CLOSED = "CLOSED",// Normal operation
    OPEN = "OPEN",// Failing, reject requests
    HALF_OPEN = "HALF_OPEN"
}
/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
    /** Failure threshold (0-1) to open circuit (default: 0.5) */
    failureThreshold?: number;
    /** Minimum number of requests before checking threshold (default: 5) */
    minRequests?: number;
    /** Time to wait before attempting recovery in milliseconds (default: 30000) */
    resetTimeoutMs?: number;
    /** Maximum number of requests in half-open state (default: 1) */
    maxHalfOpenRequests?: number;
}
/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
    state: CircuitBreakerState;
    successCount: number;
    failureCount: number;
    successRate: number;
    totalRequests: number;
    lastFailureTime?: Date;
    lastRecoveryTime?: Date;
}
/**
 * Circuit breaker for managing connection reliability
 */
export declare class CircuitBreaker {
    private name;
    private state;
    private successCount;
    private failureCount;
    private halfOpenAttempts;
    private lastFailureTime?;
    private lastRecoveryTime?;
    private resetTimer?;
    private logger;
    private config;
    constructor(name: string, config?: CircuitBreakerConfig, logLevel?: number);
    /**
     * Record a successful operation
     */
    recordSuccess(): void;
    /**
     * Record a failed operation
     */
    recordFailure(): void;
    /**
     * Check if circuit should open based on failure rate
     */
    private shouldOpen;
    /**
     * Transition to CLOSED state (recovered)
     */
    private transitionToClosed;
    /**
     * Transition to OPEN state (failing)
     */
    private transitionToOpen;
    /**
     * Check if the circuit allows operations
     */
    canExecute(): boolean;
    /**
     * Mark that we tried to execute in half-open state
     */
    markHalfOpenAttempt(): void;
    /**
     * Get current state
     */
    getState(): CircuitBreakerState;
    /**
     * Get current failure rate (0-1)
     */
    getFailureRate(): number;
    /**
     * Get statistics
     */
    getStats(): CircuitBreakerStats;
    /**
     * Reset circuit breaker (for testing)
     */
    reset(): void;
    /**
     * Cleanup
     */
    cleanup(): void;
}
//# sourceMappingURL=circuit-breaker.d.ts.map