/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * devices/wo-humi.ts: SwitchBot v4.0.0 - Humidifier Device
 */
import { DEVICE_COMMANDS } from '../settings.js';
import { clamp, hexToBuffer } from '../utils/index.js';
import { SwitchBotDevice } from './base.js';
/**
 * Humidifier Device
 */
export class WoHumi extends SwitchBotDevice {
    /**
     * Turn on
     */
    async turnOn() {
        const result = await this.sendCommand(hexToBuffer(DEVICE_COMMANDS.HUMIDIFIER.TURN_ON), 'turnOn');
        return result.success;
    }
    /**
     * Turn off
     */
    async turnOff() {
        const result = await this.sendCommand(hexToBuffer(DEVICE_COMMANDS.HUMIDIFIER.TURN_OFF), 'turnOff');
        return result.success;
    }
    /**
     * Set mode (auto/manual)
     */
    async setMode(mode) {
        const bleCommand = mode === 'auto'
            ? DEVICE_COMMANDS.HUMIDIFIER.SET_AUTO_MODE
            : DEVICE_COMMANDS.HUMIDIFIER.SET_MANUAL_MODE;
        return this.sendCommand(hexToBuffer(bleCommand), 'setMode', mode === 'auto' ? 'auto' : '101');
    }
    /**
     * Set nebulization efficiency (0-100)
     */
    async setEfficiency(level) {
        const clampedLevel = clamp(level, 0, 100);
        // For BLE, use increase/decrease commands based on desired level
        // This is a simplified approach - full implementation would track current level
        const bleCommand = clampedLevel > 50
            ? hexToBuffer(DEVICE_COMMANDS.HUMIDIFIER.INCREASE)
            : hexToBuffer(DEVICE_COMMANDS.HUMIDIFIER.DECREASE);
        const result = await this.sendCommand(bleCommand, 'setMode', clampedLevel.toString());
        return result.success;
    }
    /**
     * Set target humidity level (1-100)
     */
    async setLevel(level) {
        const clampedLevel = clamp(level, 1, 100);
        return this.setEfficiency(clampedLevel);
    }
    /**
     * Get device status (BLE-first/API-fallback, centralized)
     */
    async getStatus() {
        return this.getStatusWithFallback(bleData => ({
            deviceId: this.info.id,
            connectionType: 'ble',
            power: bleData.onState ? 'on' : 'off',
            mode: bleData.autoMode ? 'auto' : 'manual',
            nebulizationEfficiency: bleData.percentage,
            lackWater: bleData.lackWater,
            updatedAt: new Date(),
        }), apiStatus => ({
            deviceId: this.info.id,
            connectionType: 'api',
            power: apiStatus.power || 'off',
            humidity: apiStatus.humidity,
            mode: apiStatus.auto ? 'auto' : 'manual',
            nebulizationEfficiency: apiStatus.nebulizationEfficiency,
            lackWater: apiStatus.lackWater,
            temperature: apiStatus.temperature,
            version: apiStatus.version,
            updatedAt: new Date(),
        }));
    }
    /**
     * Set auto mode
     */
    async setAuto() {
        const result = await this.setMode('auto');
        return result.success;
    }
    /**
     * Set manual mode
     */
    async setManual() {
        const result = await this.setMode('manual');
        return result.success;
    }
    /**
     * Get target humidity level (if available)
     */
    async getTargetLevel() {
        // Try API first if available
        if (this.hasAPI()) {
            const apiStatus = await this.getAPIStatus();
            if (typeof apiStatus.humidity === 'number') {
                return apiStatus.humidity;
            }
        }
        // Fallback to BLE if available
        if (this.hasBLE()) {
            const bleData = await this.getBLEStatus();
            if (typeof bleData.percentage === 'number') {
                return bleData.percentage;
            }
        }
        return undefined;
    }
}
//# sourceMappingURL=wo-humi.js.map