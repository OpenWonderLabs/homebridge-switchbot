import { Buffer } from 'node:buffer';
import { SwitchBotDevice } from './base.js';
export class WoAirPurifierPM25 extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    async getStatus() {
        return this.getStatusWithFallback(bleData => ({
            deviceId: this.info.id,
            connectionType: 'ble',
            power: bleData.state ? 'on' : 'off',
            fanSpeed: bleData.fanSpeed,
            mode: bleData.mode,
            pm25: bleData.pm25,
            updatedAt: new Date(),
        }), (apiStatus) => {
            let airQuality;
            if (apiStatus.pm25 !== undefined) {
                if (apiStatus.pm25 <= 35) {
                    airQuality = 'excellent';
                }
                else if (apiStatus.pm25 <= 75) {
                    airQuality = 'good';
                }
                else if (apiStatus.pm25 <= 115) {
                    airQuality = 'fair';
                }
                else {
                    airQuality = 'poor';
                }
            }
            return {
                deviceId: this.info.id,
                connectionType: 'api',
                power: apiStatus.power || 'off',
                fanSpeed: apiStatus.fanSpeed,
                mode: apiStatus.mode,
                pm25: apiStatus.pm25,
                airQuality,
                version: apiStatus.version,
                updatedAt: new Date(),
            };
        });
    }
    /**
     * Turn on
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
     * Turn off
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
     * Set mode (auto/manual/sleep)
     */
    async setMode(mode) {
        const modeMap = { auto: 0, manual: 1, sleep: 2 };
        if (this.hasBLE()) {
            const bleCommand = Buffer.from([0x57, 0x02, modeMap[mode]]);
            const result = await this.sendCommand(bleCommand, 'setMode', mode);
            if (result.success) {
                return result;
            }
        }
        if (this.hasAPI()) {
            return this.sendAPICommand('setMode', mode);
        }
        throw new Error('No connection method available');
    }
    /**
     * Set fan speed (1-4)
     */
    async setFanSpeed(speed) {
        const clampedSpeed = Math.max(1, Math.min(4, speed));
        if (this.hasBLE()) {
            const bleCommand = Buffer.from([0x57, 0x03, clampedSpeed]);
            const result = await this.sendCommand(bleCommand, 'setFanSpeed', clampedSpeed);
            if (result.success) {
                return true;
            }
        }
        if (this.hasAPI()) {
            const result = await this.sendAPICommand('setFanSpeed', clampedSpeed);
            return result.success;
        }
        throw new Error('No connection method available');
    }
    /**
     * Set preset mode (level_1, level_2, level_3, auto, sleep, pet)
     */
    async setPresetMode(mode) {
        const modeMap = {
            level_1: 1,
            level_2: 2,
            level_3: 3,
            auto: 4,
            sleep: 5,
            pet: 6,
        };
        const modeId = modeMap[mode];
        if (modeId === undefined) {
            throw new Error(`Unsupported preset mode: ${mode}`);
        }
        if (this.hasBLE()) {
            const bleCommand = Buffer.from([0x57, 0x02, modeId]);
            const result = await this.sendCommand(bleCommand, 'setPresetMode', mode);
            if (result.success) {
                return true;
            }
        }
        if (this.hasAPI()) {
            const result = await this.sendAPICommand('setPresetMode', mode);
            return result.success;
        }
        throw new Error('No connection method available');
    }
}
//# sourceMappingURL=wo-air-purifier-pm25.js.map