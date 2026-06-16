/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * devices/wo-sensor-th.ts: SwitchBot v4.0.0 - Meter (Temp/Humidity Sensor)
 */
import { SwitchBotDevice } from './base.js';
/**
 * Meter (Temperature/Humidity Sensor)
 */
export class WoSensorTH extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    async getStatus() {
        return this.getStatusWithFallback(bleData => ({
            deviceId: this.info.id,
            connectionType: 'ble',
            temperature: bleData.temperature || 0,
            humidity: bleData.humidity || 0,
            temperatureScale: bleData.fahrenheit ? 'f' : 'c',
            battery: bleData.battery,
            updatedAt: new Date(),
        }), apiStatus => ({
            deviceId: this.info.id,
            connectionType: 'api',
            temperature: apiStatus.temperature || 0,
            humidity: apiStatus.humidity || 0,
            battery: apiStatus.battery,
            version: apiStatus.version,
            updatedAt: new Date(),
        }));
    }
}
//# sourceMappingURL=wo-sensor-th.js.map