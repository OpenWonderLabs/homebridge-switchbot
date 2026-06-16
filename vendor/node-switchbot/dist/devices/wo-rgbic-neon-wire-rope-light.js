import { Buffer } from 'node:buffer';
import { SwitchBotDevice } from './base.js';
export class WoRGBICNeonWireRopeLight extends SwitchBotDevice {
    /**
     * Get device status (BLE-first/API-fallback, centralized)
     */
    async getStatus() {
        return this.getStatusWithFallback(bleData => ({
            deviceId: this.info.id,
            connectionType: 'ble',
            updatedAt: new Date(),
            power: bleData.state ? 'on' : 'off',
            brightness: bleData.brightness,
            colorTemperature: bleData.colorTemperature,
            color: bleData.red !== undefined ? { r: bleData.red, g: bleData.green, b: bleData.blue } : undefined,
        }), apiStatus => ({
            deviceId: this.info.id,
            connectionType: 'api',
            updatedAt: new Date(),
            power: apiStatus.power,
            brightness: apiStatus.brightness,
            colorTemperature: apiStatus.colorTemperature,
            color: apiStatus.color,
        }));
    }
    /**
     * Turn on the neon wire rope light
     */
    async turnOn() {
        if (this.hasBLE()) {
            const command = Buffer.from([0x57, 0x01, 0x01]);
            const result = await this.sendCommand(command, 'turnOn');
            if (result.success) {
                return true;
            }
        }
        if (this.hasAPI()) {
            const result = await this.sendAPICommand('turnOn');
            return result.success;
        }
        throw new Error('No connection method available');
    }
    /**
     * Turn off the neon wire rope light
     */
    async turnOff() {
        if (this.hasBLE()) {
            const command = Buffer.from([0x57, 0x01, 0x02]);
            const result = await this.sendCommand(command, 'turnOff');
            if (result.success) {
                return true;
            }
        }
        if (this.hasAPI()) {
            const result = await this.sendAPICommand('turnOff');
            return result.success;
        }
        throw new Error('No connection method available');
    }
    /**
     * Set brightness (1-100)
     */
    async setBrightness(level) {
        const clamped = Math.max(1, Math.min(100, level));
        if (this.hasBLE()) {
            const command = Buffer.from([0x57, 0x02, clamped]);
            const result = await this.sendCommand(command, 'setBrightness', clamped);
            if (result.success) {
                return true;
            }
        }
        if (this.hasAPI()) {
            const result = await this.sendAPICommand('setBrightness', clamped);
            return result.success;
        }
        throw new Error('No connection method available');
    }
    /**
     * Set color (RGB)
     */
    async setColor(red, green, blue) {
        if (this.hasBLE()) {
            const command = Buffer.from([0x57, 0x03, red, green, blue]);
            const result = await this.sendCommand(command, 'setColor', { red, green, blue });
            if (result.success) {
                return true;
            }
        }
        if (this.hasAPI()) {
            const result = await this.sendAPICommand('setColor', { red, green, blue });
            return result.success;
        }
        throw new Error('No connection method available');
    }
    /**
     * Set color temperature (Kelvin)
     */
    async setColorTemperature(temperature) {
        if (this.hasBLE()) {
            const command = Buffer.from([0x57, 0x04, temperature & 0xFF, (temperature >> 8) & 0xFF]);
            const result = await this.sendCommand(command, 'setColorTemperature', temperature);
            if (result.success) {
                return true;
            }
        }
        if (this.hasAPI()) {
            const result = await this.sendAPICommand('setColorTemperature', temperature);
            return result.success;
        }
        throw new Error('No connection method available');
    }
}
//# sourceMappingURL=wo-rgbic-neon-wire-rope-light.js.map