/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * devices/wo-curtain.ts: SwitchBot v4.0.0 - Curtain Device
 */
import { Buffer } from 'node:buffer';
import { DEVICE_COMMANDS } from '../settings.js';
import { clamp } from '../utils/index.js';
import { SwitchBotDevice } from './base.js';
/**
 * Curtain Device - Smart curtain controller
 */
export class WoCurtain extends SwitchBotDevice {
    /**
     * Open curtain (position 0%)
     */
    async open(speed = 255) {
        const clampedSpeed = clamp(speed, 1, 255);
        const result = await this.sendCommand([...DEVICE_COMMANDS.CURTAIN.POSITION, clampedSpeed, 0], 'setPosition', `0,${clampedSpeed.toString(16).padStart(2, '0')},0`, true);
        return result.success;
    }
    /**
     * Close curtain (position 100%)
     */
    async close(speed = 255) {
        const clampedSpeed = clamp(speed, 1, 255);
        const result = await this.sendCommand([...DEVICE_COMMANDS.CURTAIN.POSITION, clampedSpeed, 100], 'setPosition', `0,${clampedSpeed.toString(16).padStart(2, '0')},100`, true);
        return result.success;
    }
    /**
     * Pause curtain movement
     */
    async pause() {
        const result = await this.sendCommand(DEVICE_COMMANDS.CURTAIN.PAUSE, 'pause', undefined, true);
        return result.success;
    }
    /**
     * Set curtain position (0-100%)
     */
    async setPosition(position, speed = 255) {
        const clampedPosition = clamp(position, 0, 100);
        const clampedSpeed = clamp(speed, 1, 255);
        // BLE command with speed and position bytes
        const bleCommand = [...DEVICE_COMMANDS.CURTAIN.POSITION, clampedSpeed, clampedPosition];
        const result = await this.sendCommand(bleCommand, 'setPosition', `0,${clampedSpeed.toString(16).padStart(2, '0')},${clampedPosition}`, true);
        return result.success;
    }
    /**
     * Get device status
     */
    _lastPosition;
    async getStatus() {
        return this.getStatusWithFallback((bleData) => {
            let direction;
            const position = typeof bleData.position === 'number' ? bleData.position : 0;
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
                connectionType: 'ble',
                position,
                direction,
                calibrated: bleData.calibration,
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
                calibrated: apiStatus.calibrate,
                moving: apiStatus.moving,
                battery: apiStatus.battery,
                version: apiStatus.version,
                updatedAt: new Date(),
            };
        });
    }
    /**
     * Get extended device information (Curtain 3)
     * Returns device chain information and grouped curtain status
     */
    async getExtendedInfo() {
        if (!this.hasBLE()) {
            throw new Error('Extended info only available via BLE');
        }
        try {
            const result = await this.sendBLECommand(DEVICE_COMMANDS.CURTAIN.EXTENDED_INFO);
            if (!result.success || !result.data) {
                throw new Error('Failed to get extended info');
            }
            const response = Buffer.isBuffer(result.data) ? result.data : Buffer.from(result.data);
            // Parse extended info from response
            // Response format (example): [device_chain_info, group_status_bytes]
            // This is a simplified implementation - actual parsing depends on device response format
            return {
                deviceChain: {
                    masterDevice: this.info.id,
                    slaveDevices: [], // Would parse from response bytes
                },
                groupStatus: {
                    position: response.length > 2 ? response[2] : 0,
                    calibrated: response.length > 3 ? (response[3] & 0x40) !== 0 : false,
                    moving: response.length > 3 ? (response[3] & 0x03) !== 0 : false,
                },
            };
        }
        catch (error) {
            this.logger.error('Failed to get extended info', error);
            throw error;
        }
    }
    /**
     * Send multiple commands in sequence (all must succeed)
     * Used for Curtain 3 complex operations
     */
    async sendCommandSequence(commands) {
        try {
            for (const command of commands) {
                const success = await command();
                if (!success) {
                    this.logger.warn('Command in sequence failed, stopping execution');
                    return false;
                }
                // Small delay between commands
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return true;
        }
        catch (error) {
            this.logger.error('Command sequence failed', error);
            return false;
        }
    }
    /**
     * Send multiple commands (returns true if any succeed)
     * Used for Curtain 3 fallback operations
     */
    async sendMultipleCommands(commands) {
        let anySucceeded = false;
        for (const command of commands) {
            try {
                const success = await command();
                if (success) {
                    anySucceeded = true;
                }
                // Small delay between commands
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            catch (error) {
                this.logger.debug('Command in multi-command attempt failed', error);
                // Continue trying other commands
            }
        }
        return anySucceeded;
    }
}
//# sourceMappingURL=wo-curtain.js.map
