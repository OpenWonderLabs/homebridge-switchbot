import type { OpenAPIClient } from '../api.js';
import type { BLEConnection } from '../ble.js';
import type { ConnectionType, DeviceInfo, DeviceStatus } from '../types/index.js';
import type { CircuitBreakerConfig, RetryConfig } from '../utils/index.js';
import { SwitchBotDevice } from './base.js';
/**
 * Base class for devices that expose an advertisement sequence number.
 * Automatically triggers a status refresh when the sequence number changes.
 *
 * ## BLE-first, API-fallback Status Pattern
 *
 * Subclasses should implement their `getStatus()` using the centralized
 * `getStatusWithFallback()` method from SwitchBotDevice for robust BLE-first,
 * API-fallback logic. See SwitchBotDevice for details.
 *
 * Example:
 * ```typescript
 * async getStatus(): Promise<DeviceStatus> {
 *   return this.getStatusWithFallback(
 *     bleData => ({ ... }),
 *     apiData => ({ ... })
 *   )
 * }
 * ```
 */
export declare abstract class SequenceDevice extends SwitchBotDevice {
    private lastSequenceNumber;
    private sequenceUpdateInFlight;
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
    /**
     * Refresh status for this device. Called automatically after sequence changes.
     */
    update(): Promise<DeviceStatus>;
    /**
     * Update device information and react to sequence number changes.
     */
    updateInfo(newInfo: Partial<DeviceInfo>): void;
    private getSequenceNumberFromInfo;
    private triggerSequenceUpdate;
}
//# sourceMappingURL=sequence-device.d.ts.map