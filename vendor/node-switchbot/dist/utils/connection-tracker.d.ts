import type { ConnectionType } from '../types/index.js';
/**
 * Statistics for a single connection type
 */
export interface ConnectionStats {
    connectionType: ConnectionType;
    successCount: number;
    failureCount: number;
    totalAttempts: number;
    successRate: number;
    averageLatencyMs: number;
    lastAttemptTime?: Date;
    lastSuccessTime?: Date;
    lastFailureTime?: Date;
}
/**
 * Tracks connection success/failure statistics per device per connection type
 */
export declare class ConnectionTracker {
    private deviceId;
    private stats;
    private logger;
    constructor(deviceId: string, logLevel?: number);
    /**
     * Record a successful attempt
     */
    recordSuccess(connectionType: ConnectionType, latencyMs?: number): void;
    /**
     * Record a failed attempt
     */
    recordFailure(connectionType: ConnectionType): void;
    /**
     * Get statistics for a connection type
     */
    getStats(connectionType: ConnectionType): ConnectionStats | undefined;
    /**
     * Get all statistics
     */
    getAllStats(): ConnectionStats[];
    /**
     * Get the best connection type (highest success rate)
     */
    getBestConnection(availableTypes?: ConnectionType[]): ConnectionType | undefined;
    /**
     * Get the most recent successful connection type
     */
    getMostRecentSuccessful(availableTypes?: ConnectionType[]): ConnectionType | undefined;
    /**
     * Check if a connection type is considered reliable
     * (e.g., success rate > 75% with at least 5 attempts)
     */
    isReliable(connectionType: ConnectionType, minAttempts?: number, minRate?: number): boolean;
    /**
     * Get connection recommendation with reasoning
     */
    getRecommendation(availableTypes?: ConnectionType[]): {
        recommended: ConnectionType | undefined;
        reason: string;
        stats: ConnectionStats[];
    };
    /**
     * Reset all statistics
     */
    reset(): void;
}
//# sourceMappingURL=connection-tracker.d.ts.map