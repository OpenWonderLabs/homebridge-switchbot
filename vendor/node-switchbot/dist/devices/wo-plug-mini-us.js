/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * devices/wo-plug-mini-us.ts: SwitchBot v4.0.0 - Plug Mini (US)
 */
import { DEVICE_COMMANDS } from '../settings.js';
import { DeviceOverrideStateDuringConnection } from './device-override-state-during-connection.js';
/**
 * Plug Mini (US) Device
 */
export class WoPlugMiniUS extends DeviceOverrideStateDuringConnection {
    /**
     * Turn on
     */
    async turnOn() {
        const result = await this.sendCommand(DEVICE_COMMANDS.PLUG.TURN_ON, 'turnOn');
        return result.success;
    }
    /**
     * Turn off
     */
    async turnOff() {
        const result = await this.sendCommand(DEVICE_COMMANDS.PLUG.TURN_OFF, 'turnOff');
        return result.success;
    }
    /**
     * Toggle power
     */
    async toggle() {
        const result = await this.sendCommand(DEVICE_COMMANDS.PLUG.TOGGLE, 'toggle');
        return result.success;
    }
    /**
     * Get device status (BLE-first, API-fallback, centralized)
     */
    async getStatus() {
        return this.getStatusWithFallback(
        // BLE normalization
        bleData => ({
            deviceId: this.info.id,
            connectionType: 'ble',
            power: bleData.state ? 'on' : 'off',
            voltage: bleData.voltage,
            electricCurrent: bleData.electricCurrent,
            electricityOfDay: bleData.electricityOfDay,
            updatedAt: new Date(),
        }), 
        // API normalization
        apiStatus => ({
            deviceId: this.info.id,
            connectionType: 'api',
            power: apiStatus.power || 'off',
            voltage: apiStatus.voltage,
            electricCurrent: apiStatus.electricCurrent,
            electricityOfDay: apiStatus.electricityOfDay,
            version: apiStatus.version,
            updatedAt: new Date(),
        }));
    }
}
//# sourceMappingURL=wo-plug-mini-us.js.map