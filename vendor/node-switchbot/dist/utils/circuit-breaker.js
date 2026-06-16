/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * utils/circuit-breaker.ts: SwitchBot v4.0.0 - Circuit Breaker Pattern
 */
import { Logger } from './index.js';
/**
 * Circuit breaker states
 */
export var CircuitBreakerState;
(function (CircuitBreakerState) {
    CircuitBreakerState["CLOSED"] = "CLOSED";
    CircuitBreakerState["OPEN"] = "OPEN";
    CircuitBreakerState["HALF_OPEN"] = "HALF_OPEN";
})(CircuitBreakerState || (CircuitBreakerState = {}));
/**
 * Circuit breaker for managing connection reliability
 */
export class CircuitBreaker {
    name;
    state = CircuitBreakerState.CLOSED;
    successCount = 0;
    failureCount = 0;
    halfOpenAttempts = 0;
    lastFailureTime;
    lastRecoveryTime;
    resetTimer;
    logger;
    config;
    constructor(name, config = {}, logLevel) {
        this.name = name;
        this.config = {
            failureThreshold: config.failureThreshold ?? 0.5,
            minRequests: config.minRequests ?? 5,
            resetTimeoutMs: config.resetTimeoutMs ?? 30000,
            maxHalfOpenRequests: config.maxHalfOpenRequests ?? 1,
        };
        this.logger = new Logger(`CircuitBreaker:${name}`, logLevel);
    }
    /**
     * Record a successful operation
     */
    recordSuccess() {
        this.successCount++;
        if (this.state === CircuitBreakerState.HALF_OPEN) {
            // Successful in Half-Open -> recover
            this.logger.info(`${this.name}: circuit recovered (HALF_OPEN -> CLOSED)`);
            this.transitionToClosed();
        }
    }
    /**
     * Record a failed operation
     */
    recordFailure() {
        this.failureCount++;
        this.lastFailureTime = new Date();
        if (this.state === CircuitBreakerState.CLOSED) {
            // Check if we should open the circuit
            if (this.shouldOpen()) {
                this.logger.warn(`${this.name}: circuit opened - failure rate ${this.getFailureRate().toFixed(2)}`);
                this.transitionToOpen();
            }
        }
        else if (this.state === CircuitBreakerState.HALF_OPEN) {
            // Failed during recovery -> reopen
            this.logger.warn(`${this.name}: circuit reopened (HALF_OPEN -> OPEN)`);
            this.transitionToOpen();
        }
    }
    /**
     * Check if circuit should open based on failure rate
     */
    shouldOpen() {
        const totalRequests = this.successCount + this.failureCount;
        if (totalRequests < this.config.minRequests) {
            return false;
        }
        const failureRate = this.failureCount / totalRequests;
        return failureRate >= this.config.failureThreshold;
    }
    /**
     * Transition to CLOSED state (recovered)
     */
    transitionToClosed() {
        this.state = CircuitBreakerState.CLOSED;
        this.successCount = 0;
        this.failureCount = 0;
        this.halfOpenAttempts = 0;
        this.lastRecoveryTime = new Date();
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = undefined;
        }
    }
    /**
     * Transition to OPEN state (failing)
     */
    transitionToOpen() {
        this.state = CircuitBreakerState.OPEN;
        this.successCount = 0;
        this.failureCount = 0;
        this.halfOpenAttempts = 0;
        // Schedule recovery attempt
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
        }
        this.resetTimer = setTimeout(() => {
            this.logger.info(`${this.name}: attempting recovery (OPEN -> HALF_OPEN)`);
            this.state = CircuitBreakerState.HALF_OPEN;
            this.halfOpenAttempts = 0;
        }, this.config.resetTimeoutMs);
    }
    /**
     * Check if the circuit allows operations
     */
    canExecute() {
        if (this.state === CircuitBreakerState.CLOSED) {
            return true;
        }
        if (this.state === CircuitBreakerState.HALF_OPEN) {
            return this.halfOpenAttempts < this.config.maxHalfOpenRequests;
        }
        // OPEN state
        return false;
    }
    /**
     * Mark that we tried to execute in half-open state
     */
    markHalfOpenAttempt() {
        if (this.state === CircuitBreakerState.HALF_OPEN) {
            this.halfOpenAttempts++;
        }
    }
    /**
     * Get current state
     */
    getState() {
        return this.state;
    }
    /**
     * Get current failure rate (0-1)
     */
    getFailureRate() {
        const total = this.successCount + this.failureCount;
        return total === 0 ? 0 : this.failureCount / total;
    }
    /**
     * Get statistics
     */
    getStats() {
        const totalRequests = this.successCount + this.failureCount;
        return {
            state: this.state,
            successCount: this.successCount,
            failureCount: this.failureCount,
            successRate: totalRequests === 0 ? 1 : this.successCount / totalRequests,
            totalRequests,
            lastFailureTime: this.lastFailureTime,
            lastRecoveryTime: this.lastRecoveryTime,
        };
    }
    /**
     * Reset circuit breaker (for testing)
     */
    reset() {
        this.logger.debug(`${this.name}: reset`);
        this.state = CircuitBreakerState.CLOSED;
        this.successCount = 0;
        this.failureCount = 0;
        this.halfOpenAttempts = 0;
        this.lastFailureTime = undefined;
        this.lastRecoveryTime = undefined;
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = undefined;
        }
    }
    /**
     * Cleanup
     */
    cleanup() {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = undefined;
        }
    }
}
//# sourceMappingURL=circuit-breaker.js.map