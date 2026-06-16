import type { ConnectionType } from '../types/index.js';
/**
 * Information about a fallback event
 */
export interface FallbackEvent {
    deviceId: string;
    primaryConnection: ConnectionType;
    fallbackConnection: ConnectionType | undefined;
    reason: string;
    timestamp: Date;
    attemptsCount?: number;
    totalTimeMs?: number;
}
/**
 * Type for custom fallback handler callbacks
 */
export type FallbackHandler = (event: FallbackEvent) => void | Promise<void>;
/**
 * Options for registering a fallback handler
 */
export interface FallbackHandlerOptions {
    /** Handler identifier for later removal */
    id?: string;
    /** Handler priority (higher = executes first) */
    priority?: number;
}
/**
 * Manages custom fallback handlers and events
 */
export declare class FallbackHandlerManager {
    private handlers;
    private logger;
    private handlerCounter;
    constructor(logLevel?: number);
    /**
     * Register a custom fallback handler
     */
    register(handler: FallbackHandler, options?: FallbackHandlerOptions): string;
    /**
     * Unregister a fallback handler
     */
    unregister(id: string): boolean;
    /**
     * Emit a fallback event to all registered handlers
     */
    emit(event: FallbackEvent): Promise<void>;
    /**
     * Clear all handlers
     */
    clear(): void;
    /**
     * Get handler count
     */
    getHandlerCount(): number;
}
/**
 * Built-in fallback handler: Log fallback events
 */
export declare function createLoggingFallbackHandler(logLevel?: number): FallbackHandler;
/**
 * Built-in fallback handler: Metrics/statistics collection
 */
export declare function createMetricsCollectionHandler(): FallbackHandler;
/**
 * Built-in fallback handler: Alert on repeated fallbacks
 */
export declare function createAlertHandler(alertThreshold?: number): FallbackHandler;
//# sourceMappingURL=fallback-handler.d.ts.map