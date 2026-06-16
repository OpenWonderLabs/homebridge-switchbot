/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * devices/wo-blind-tilt.ts: SwitchBot v4.0.0 - Blind Tilt Device
 */
import { Buffer } from 'node:buffer';
import { DEVICE_COMMANDS } from '../settings.js';
import { clamp } from '../utils/index.js';
import { SwitchBotDevice } from './base.js';
/**
 * Blind Tilt Device
 */
export class WoBlindTilt extends SwitchBotDevice {
    /**
     * Open blind (position 50%)
     */
    async open() {
        // BLE-first, OpenAPI-fallback
        if (this.hasBLE()) {
            const result = await this.sendCommand(DEVICE_COMMANDS.BLIND_TILT.OPEN, 'turnOn');
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
     * Close blind up (position 100%)
     */
    async closeUp() {
        // BLE-first, OpenAPI-fallback
        if (this.hasBLE()) {
            const result = await this.sendCommand(DEVICE_COMMANDS.BLIND_TILT.CLOSE_UP, 'setPosition');
            if (result.success) {
                return true;
            }
        }
        if (this.hasAPI()) {
            const result = await this.sendAPICommand('setPosition', { position: 100 });
            return result.success;
        }
        throw new Error('No connection method available');
    }
    // Add stubs for required BlindTiltCommands interface methods
    async close() {
        // BLE-first, OpenAPI-fallback
        if (this.hasBLE()) {
            const result = await this.sendCommand(DEVICE_COMMANDS.BLIND_TILT.CLOSE_UP, 'turnOff');
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
    async closeDown() {
        // BLE-first, OpenAPI-fallback
        if (this.hasBLE()) {
            const result = await this.sendCommand(DEVICE_COMMANDS.BLIND_TILT.CLOSE_DOWN, 'setPosition');
            if (result.success) {
                return true;
            }
        }
        if (this.hasAPI()) {
            const result = await this.sendAPICommand('setPosition', { position: 0 });
            return result.success;
        }
        throw new Error('No connection method available');
    }
    async pause() {
        // BLE-first, OpenAPI-fallback
        if (this.hasBLE()) {
            const result = await this.sendCommand(DEVICE_COMMANDS.BLIND_TILT.PAUSE, 'pause');
            if (result.success) {
                return true;
            }
        }
        if (this.hasAPI()) {
            const result = await this.sendAPICommand('pause');
            return result.success;
        }
        throw new Error('No connection method available');
    }
    async setPosition(position) {
        // BLE-first, OpenAPI-fallback
        const pos = clamp(position, 0, 100);
        if (this.hasBLE()) {
            // Copy the OPEN command and replace the last byte with the desired position
            const base = [...DEVICE_COMMANDS.BLIND_TILT.OPEN];
            base[base.length - 1] = pos;
            const result = await this.sendCommand(base, 'setPosition');
            if (result.success) {
                return true;
            }
        }
        if (this.hasAPI()) {
            const result = await this.sendAPICommand('setPosition', { position: pos });
            return result.success;
        }
        throw new Error('No connection method available');
    }
    _lastPosition;
    async getStatus() {
        return this.getStatusWithFallback((bleData) => {
            let direction;
            const position = typeof bleData.position === 'number' ? bleData.position : 0;
            let calibrated;
            if (bleData.rawData && Buffer.isBuffer(bleData.rawData) && bleData.rawData.length > 3) {
                calibrated = (bleData.rawData[3] & 0x40) !== 0;
            }
            else if (typeof bleData.calibration === 'boolean') {
                calibrated = bleData.calibration;
            }
            if (typeof this._lastPosition === 'number') {
                if (position > this._lastPosition) {
                    direction = 'opening';
                }
                else if (position < this._lastPosition) {
                    direction = 'closing';
                }
            }
            this._lastPosition = position;
            if (calibrated === false) {
                this.logger.warn('Blind Tilt not calibrated!');
            }
            return {
                deviceId: this.info.id,
                connectionType: 'ble',
                position,
                direction,
                moving: bleData.inMotion,
                calibrated,
                battery: bleData.battery,
                updatedAt: new Date(),
            };
        }, (apiStatus) => {
            let direction;
            const position = typeof apiStatus.slidePosition === 'number' ? apiStatus.slidePosition : 0;
            if (typeof this._lastPosition === 'number') {
                if (position > this._lastPosition) {
                    direction = 'opening';
                }
                else if (position < this._lastPosition) {
                    direction = 'closing';
                }
            }
            this._lastPosition = position;
            return {
                deviceId: this.info.id,
                connectionType: 'api',
                position,
                direction,
                moving: apiStatus.moving,
                calibrated: apiStatus.calibrate ?? undefined,
                battery: apiStatus.battery,
                version: apiStatus.version,
                updatedAt: new Date(),
            };
        });
    }
}
//# sourceMappingURL=wo-blind-tilt.js.map