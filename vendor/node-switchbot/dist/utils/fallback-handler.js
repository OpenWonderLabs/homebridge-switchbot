/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * utils/fallback-handler.ts: SwitchBot v4.0.0 - Custom Fallback Handlers
 */
import { Logger } from './index.js';
/**
 * Manages custom fallback handlers and events
 */
export class FallbackHandlerManager {
    handlers = new Map();
    logger;
    handlerCounter = 0;
    constructor(logLevel) {
        this.logger = new Logger('FallbackHandlerManager', logLevel);
    }
    /**
     * Register a custom fallback handler
     */
    register(handler, options = {}) {
        const id = options.id || `handler_${++this.handlerCounter}`;
        const priority = options.priority ?? 0;
        this.handlers.set(id, { handler, priority });
        this.logger.debug(`Registered fallback handler: ${id} (priority: ${priority})`);
        return id;
    }
    /**
     * Unregister a fallback handler
     */
    unregister(id) {
        const removed = this.handlers.delete(id);
        if (removed) {
            this.logger.debug(`Unregistered fallback handler: ${id}`);
        }
        return removed;
    }
    /**
     * Emit a fallback event to all registered handlers
     */
    async emit(event) {
        // Sort handlers by priority (descending)
        const sortedHandlers = [...this.handlers.entries()].sort((a, b) => b[1].priority - a[1].priority);
        this.logger.debug(`Emitting fallback event to ${sortedHandlers.length} handlers`, {
            device: event.deviceId,
            primary: event.primaryConnection,
            fallback: event.fallbackConnection,
        });
        for (const [id, { handler }] of sortedHandlers) {
            try {
                await Promise.resolve(handler(event));
            }
            catch (error) {
                this.logger.error(`Fallback handler ${id} threw error`, error);
                // Continue with other handlers even if one fails
            }
        }
    }
    /**
     * Clear all handlers
     */
    clear() {
        this.logger.debug(`Clearing ${this.handlers.size} fallback handlers`);
        this.handlers.clear();
    }
    /**
     * Get handler count
     */
    getHandlerCount() {
        return this.handlers.size;
    }
}
/**
 * Built-in fallback handler: Log fallback events
 */
export function createLoggingFallbackHandler(logLevel = 3) {
    const logger = new Logger('FallbackLogger', logLevel);
    return (event) => {
        if (!event.fallbackConnection) {
            logger.error(`Device ${event.deviceId}: ${event.primaryConnection} failed and no fallback available`);
        }
        else {
            logger.warn(`Device ${event.deviceId}: ${event.primaryConnection} failed, falling back to ${event.fallbackConnection}`, {
                reason: event.reason,
                attempts: event.attemptsCount,
                timeMs: event.totalTimeMs,
            });
        }
    };
}
/**
 * Built-in fallback handler: Metrics/statistics collection
 */
export function createMetricsCollectionHandler() {
    const metrics = {
        totalFallbacks: 0,
        fallbacksByDevice: new Map(),
        fallbacksByConnection: new Map(),
        lastFallbackTime: undefined,
    };
    const handler = (event) => {
        metrics.totalFallbacks++;
        metrics.lastFallbackTime = event.timestamp;
        const deviceCount = metrics.fallbacksByDevice.get(event.deviceId) || 0;
        metrics.fallbacksByDevice.set(event.deviceId, deviceCount + 1);
        if (event.fallbackConnection) {
            const connectionKey = `${event.primaryConnection}->${event.fallbackConnection}`;
            const count = metrics.fallbacksByConnection.get(connectionKey) || 0;
            metrics.fallbacksByConnection.set(connectionKey, count + 1);
        }
    };
    handler.getMetrics = () => ({ ...metrics });
    return handler;
}
/**
 * Built-in fallback handler: Alert on repeated fallbacks
 */
export function createAlertHandler(alertThreshold = 3) {
    const fallbackCounts = new Map();
    const logger = new Logger('FallbackAlertHandler');
    return (event) => {
        const count = (fallbackCounts.get(event.deviceId) || 0) + 1;
        fallbackCounts.set(event.deviceId, count);
        if (count === alertThreshold) {
            logger.error(`ALERT: Device ${event.deviceId} has fallen back ${count} times - check connection`);
        }
        if (count > alertThreshold && count % alertThreshold === 0) {
            logger.error(`ALERT: Device ${event.deviceId} has fallen back ${count} times`);
        }
    };
}
//# sourceMappingURL=fallback-handler.js.map