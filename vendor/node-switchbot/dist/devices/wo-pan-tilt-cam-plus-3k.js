import { Buffer } from 'node:buffer';
import { SwitchBotDevice } from './base.js';
export class WoPanTiltCamPlus3K extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback, centralized)
     */
    async getStatus() {
        return this.getStatusWithFallback(
        // BLE normalization
        () => ({
            deviceId: this.info.id,
            connectionType: 'ble',
            updatedAt: new Date(),
            // Add more fields if available from BLE
        }), 
        // API normalization
        () => ({
            deviceId: this.info.id,
            connectionType: 'api',
            updatedAt: new Date(),
            // Add more fields if available from API
        }));
    }
    /**
     * Pan the camera (degrees: -180 to 180)
     */
    async pan(degrees) {
        const clamped = Math.max(-180, Math.min(180, degrees));
        // BLE first
        if (this.hasBLE()) {
            // Example BLE command, update as needed
            const command = Buffer.from([0x60, 0x01, clamped & 0xFF]);
            const result = await this.sendCommand(command, 'pan', clamped);
            if (result.success) {
                return true;
            }
        }
        // API fallback
        if (this.hasAPI()) {
            const result = await this.sendAPICommand('pan', clamped);
            return result.success;
        }
        throw new Error('No connection method available');
    }
    /**
     * Tilt the camera (degrees: -90 to 90)
     */
    async tilt(degrees) {
        const clamped = Math.max(-90, Math.min(90, degrees));
        // BLE first
        if (this.hasBLE()) {
            // Example BLE command, update as needed
            const command = Buffer.from([0x60, 0x02, clamped & 0xFF]);
            const result = await this.sendCommand(command, 'tilt', clamped);
            if (result.success) {
                return true;
            }
        }
        // API fallback
        if (this.hasAPI()) {
            const result = await this.sendAPICommand('tilt', clamped);
            return result.success;
        }
        throw new Error('No connection method available');
    }
    /**
     * Reset the camera position
     */
    async reset() {
        // BLE first
        if (this.hasBLE()) {
            // Example BLE command, update as needed
            const command = Buffer.from([0x60, 0x03, 0x00]);
            const result = await this.sendCommand(command, 'reset');
            if (result.success) {
                return true;
            }
        }
        // API fallback
        if (this.hasAPI()) {
            const result = await this.sendAPICommand('reset');
            return result.success;
        }
        throw new Error('No connection method available');
    }
}
//# sourceMappingURL=wo-pan-tilt-cam-plus-3k.js.map