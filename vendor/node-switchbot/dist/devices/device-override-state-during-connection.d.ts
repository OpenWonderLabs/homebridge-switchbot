import type { OpenAPIClient } from '../api.js';
import type { BLEConnection } from '../ble.js';
import type { ConnectionType, DeviceInfo } from '../types/index.js';
import type { CircuitBreakerConfig, RetryConfig } from '../utils/index.js';
import { SwitchBotDevice } from './base.js';
/**
 * Base class for devices that should ignore advertisement state while connected.
 * Prevents stale BLE advertisement data from overriding active connection state.
 */
export declare abstract class DeviceOverrideStateDuringConnection extends SwitchBotDevice {
    constructor(info: DeviceInfo, options?: {
        bleConnection?: BLEConnection;
        apiClient?: OpenAPIClient;
        enableFallback?: boolean;
        preferredConnection?: ConnectionType;
        enableConnectionIntelligence?: boolean;
        enableCircuitBreaker?: boolean;
        enableRetry?: boolean;
        retryConfig?: RetryConfig;
        circuitBreakerConfig?: CircuitBreakerConfig;
        logLevel?: number;
    });
    updateInfo(newInfo: Partial<DeviceInfo>): void;
    protected normalizeBLEStatusData(data: any): Record<string, unknown>;
    protected isBLEConnected(): boolean;
}
//# sourceMappingURL=device-override-state-during-connection.d.ts.map