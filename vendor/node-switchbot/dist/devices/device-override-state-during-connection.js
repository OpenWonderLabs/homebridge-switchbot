/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * devices/device-override-state-during-connection.ts: SwitchBot v4.0.0 - Device Override State During Connection Base Class
 */
import { SwitchBotDevice } from './base.js';
/**
 * Base class for devices that should ignore advertisement state while connected.
 * Prevents stale BLE advertisement data from overriding active connection state.
 */
export class DeviceOverrideStateDuringConnection extends SwitchBotDevice {
    constructor(info, options = {}) {
        super(info, options);
    }
    updateInfo(newInfo) {
        if (!this.isBLEConnected()) {
            super.updateInfo(newInfo);
            return;
        }
        const filtered = { ...newInfo };
        delete filtered.bleServiceData;
        delete filtered.battery;
        delete filtered.rssi;
        super.updateInfo(filtered);
    }
    normalizeBLEStatusData(data) {
        if (data && typeof data === 'object') {
            return super.normalizeBLEStatusData(data);
        }
        if (this.isBLEConnected()) {
            return {};
        }
        return super.normalizeBLEStatusData(data);
    }
    isBLEConnected() {
        if (!this.bleConnection?.isConnected) {
            return false;
        }
        const macOrBleId = this.info.mac ?? (this.info.bleId ? `id:${this.info.bleId}` : undefined);
        if (!macOrBleId) {
            return false;
        }
        return this.bleConnection.isConnected(macOrBleId);
    }
}
//# sourceMappingURL=device-override-state-during-connection.js.map