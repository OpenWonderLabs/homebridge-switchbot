/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * devices/wo-keypad.ts: SwitchBot v4.0.0 - Keypad Device
 */
import { SwitchBotDevice } from './base.js';
/**
 * Keypad Device (Touch/Physical)
 * Note: Keypad is primarily for lock control, read-only for status
 */
export class WoKeypad extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    async getStatus() {
        return this.getStatusWithFallback(bleData => ({
            deviceId: this.info.id,
            connectionType: 'ble',
            battery: bleData.battery,
            updatedAt: new Date(),
        }), apiStatus => ({
            deviceId: this.info.id,
            connectionType: 'api',
            lockState: apiStatus.lockState,
            battery: apiStatus.battery,
            version: apiStatus.version,
            updatedAt: new Date(),
        }));
    }
}
//# sourceMappingURL=wo-keypad.js.map