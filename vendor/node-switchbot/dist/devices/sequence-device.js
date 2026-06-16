/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * devices/sequence-device.ts: SwitchBot v4.0.0 - Sequence Aware Device Base Class
 */
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
export class SequenceDevice extends SwitchBotDevice {
    lastSequenceNumber;
    sequenceUpdateInFlight = false;
    constructor(info, options = {}) {
        super(info, options);
        this.lastSequenceNumber = this.getSequenceNumberFromInfo(info);
    }
    /**
     * Refresh status for this device. Called automatically after sequence changes.
     */
    async update() {
        return this.getStatus();
    }
    /**
     * Update device information and react to sequence number changes.
     */
    updateInfo(newInfo) {
        const previousSequenceNumber = this.lastSequenceNumber;
        super.updateInfo(newInfo);
        const nextSequenceNumber = this.getSequenceNumberFromInfo(this.info);
        if (nextSequenceNumber === undefined) {
            return;
        }
        if (previousSequenceNumber === undefined) {
            this.lastSequenceNumber = nextSequenceNumber;
            return;
        }
        if (nextSequenceNumber === previousSequenceNumber) {
            return;
        }
        this.lastSequenceNumber = nextSequenceNumber;
        this.emit('sequence-changed', {
            deviceId: this.info.id,
            previousSequenceNumber,
            sequenceNumber: nextSequenceNumber,
            updatedAt: new Date(),
        });
        void this.triggerSequenceUpdate();
    }
    getSequenceNumberFromInfo(info) {
        const raw = (info.bleServiceData ?? {});
        const sequenceNumber = raw.sequenceNumber;
        return typeof sequenceNumber === 'number' ? sequenceNumber : undefined;
    }
    async triggerSequenceUpdate() {
        if (this.sequenceUpdateInFlight) {
            return;
        }
        this.sequenceUpdateInFlight = true;
        try {
            const status = await this.update();
            this.emit('status-updated', {
                deviceId: this.info.id,
                status,
                updatedAt: new Date(),
            });
        }
        catch (error) {
            this.logger.debug('Sequence-triggered update failed', error);
        }
        finally {
            this.sequenceUpdateInFlight = false;
        }
    }
}
//# sourceMappingURL=sequence-device.js.map