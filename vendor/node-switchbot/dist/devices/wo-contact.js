/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * devices/wo-contact.ts: SwitchBot v4.0.0 - Contact Sensor
 */
import { SwitchBotDevice } from './base.js';
/**
 * Contact Sensor (Door/Window Sensor)
 */
export class WoContact extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    async getStatus() {
        return this.getStatusWithFallback(bleData => ({
            deviceId: this.info.id,
            connectionType: 'ble',
            openState: bleData.position || 'closed',
            moveDetected: bleData.movement,
            brightness: bleData.lightLevel,
            battery: bleData.battery,
            updatedAt: new Date(),
        }), apiStatus => ({
            deviceId: this.info.id,
            connectionType: 'api',
            openState: apiStatus.openState || 'closed',
            moveDetected: apiStatus.moveDetected,
            brightness: apiStatus.brightness,
            battery: apiStatus.battery,
            version: apiStatus.version,
            updatedAt: new Date(),
        }));
    }
}
//# sourceMappingURL=wo-contact.js.map