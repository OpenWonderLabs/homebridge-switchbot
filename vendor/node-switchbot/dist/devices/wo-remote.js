/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * devices/wo-remote.ts: SwitchBot v4.0.0 - Remote Device
 */
import { SwitchBotDevice } from './base.js';
/**
 * Remote Device (IR remote control)
 * Note: Remote is read-only for battery status
 */
export class WoRemote extends SwitchBotDevice {
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
            battery: apiStatus.battery,
            version: apiStatus.version,
            updatedAt: new Date(),
        }));
    }
}
//# sourceMappingURL=wo-remote.js.map