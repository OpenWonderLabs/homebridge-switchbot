import { SwitchBotDevice } from './base.js';
export class WoRemoteWithScreen extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    async getStatus() {
        return this.getStatusWithFallback(bleData => ({
            deviceId: this.info.id,
            connectionType: 'ble',
            updatedAt: new Date(),
            battery: bleData.battery,
            version: bleData.version,
        }), apiStatus => ({
            deviceId: this.info.id,
            connectionType: 'api',
            updatedAt: new Date(),
            battery: apiStatus.battery,
            version: apiStatus.version,
        }));
    }
}
//# sourceMappingURL=wo-remote-with-screen.js.map