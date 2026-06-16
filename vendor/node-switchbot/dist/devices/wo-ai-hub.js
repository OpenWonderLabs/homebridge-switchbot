import { SwitchBotDevice } from './base.js';
export class WoAIHub extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    async getStatus() {
        return this.getStatusWithFallback(bleData => ({
            deviceId: this.info.id,
            connectionType: 'ble',
            temperature: bleData.temperature,
            humidity: bleData.humidity,
            lightLevel: bleData.lightLevel,
            updatedAt: new Date(),
        }), apiStatus => ({
            deviceId: this.info.id,
            connectionType: 'api',
            temperature: apiStatus.temperature,
            humidity: apiStatus.humidity,
            lightLevel: apiStatus.lightLevel,
            version: apiStatus.version,
            updatedAt: new Date(),
        }));
    }
}
//# sourceMappingURL=wo-ai-hub.js.map