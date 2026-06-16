import { SwitchBotDevice } from './base.js';
export class WoWaterDetector extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    async getStatus() {
        return this.getStatusWithFallback(bleData => ({
            deviceId: this.info.id,
            connectionType: 'ble',
            updatedAt: new Date(),
            waterLeakDetected: !!bleData.waterLeakDetected,
        }), apiStatus => ({
            deviceId: this.info.id,
            connectionType: 'api',
            updatedAt: new Date(),
            waterLeakDetected: !!apiStatus.waterLeakDetected,
        }));
    }
}
//# sourceMappingURL=wo-water-detector.js.map