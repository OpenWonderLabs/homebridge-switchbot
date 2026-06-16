/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * devices/wo-presence.ts: SwitchBot v4.0.0 - Motion/Presence Sensor
 */
import { SwitchBotDevice } from './base.js';
/**
 * Motion/Presence Sensor
 */
export class WoPresence extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    async getStatus() {
        return this.getStatusWithFallback(bleData => ({
            deviceId: this.info.id,
            connectionType: 'ble',
            moveDetected: bleData.movement || false,
            brightness: bleData.lightLevel,
            battery: bleData.battery,
            updatedAt: new Date(),
        }), apiStatus => ({
            deviceId: this.info.id,
            connectionType: 'api',
            moveDetected: apiStatus.moveDetected || false,
            brightness: apiStatus.brightness,
            battery: apiStatus.battery,
            version: apiStatus.version,
            updatedAt: new Date(),
        }));
    }
}
//# sourceMappingURL=wo-presence.js.map