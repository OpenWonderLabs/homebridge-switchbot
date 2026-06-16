/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * devices/wo-hand.ts: SwitchBot v4.0.0 - Bot (WoHand) Device
 */
import { DEVICE_COMMANDS } from '../settings.js';
import { BOT_BLE_ACTIONS, buildBotBleCommand, parseBotBleResponse, validateBotPassword } from '../utils/index.js';
import { DeviceOverrideStateDuringConnection } from './device-override-state-during-connection.js';
const BOT_BLE_COMMAND_WRITE_ONLY = true;
/**
 * Bot (WoHand) Device - Press or switch button device
 * Supports optional BLE password protection
 */
export class WoHand extends DeviceOverrideStateDuringConnection {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    async getStatus() {
        return this.getStatusWithFallback(bleData => ({
            deviceId: this.info.id,
            connectionType: 'ble',
            power: bleData.state ? 'on' : 'off',
            state: bleData.state,
            mode: bleData.mode,
            battery: bleData.battery,
            version: bleData.version,
            updatedAt: new Date(),
        }), apiStatus => ({
            deviceId: this.info.id,
            connectionType: 'api',
            power: apiStatus.power || 'off',
            state: apiStatus.state,
            mode: apiStatus.mode,
            battery: apiStatus.battery,
            version: apiStatus.version,
            updatedAt: new Date(),
        }));
    }
    password;
    constructor(info, options = {}) {
        super(info, options);
        // Validate and store password if provided
        if (options.password) {
            try {
                validateBotPassword(options.password);
                this.password = options.password;
                this.logger.info('Bot password configured');
            }
            catch (error) {
                this.logger.error('Invalid password format', error);
                throw error;
            }
        }
    }
    /**
     * Turn on (switch mode)
     */
    async turnOn() {
        // Use password-protected command if password is configured
        if (this.password) {
            return await this.executePasswordCommand(BOT_BLE_ACTIONS.TURN_ON);
        }
        // Standard command
        const result = await this.sendCommand(DEVICE_COMMANDS.BOT.TURN_ON, 'turnOn', undefined, BOT_BLE_COMMAND_WRITE_ONLY);
        return result.success;
    }
    /**
     * Turn off (switch mode)
     */
    async turnOff() {
        // Use password-protected command if password is configured
        if (this.password) {
            return await this.executePasswordCommand(BOT_BLE_ACTIONS.TURN_OFF);
        }
        // Standard command
        const result = await this.sendCommand(DEVICE_COMMANDS.BOT.TURN_OFF, 'turnOff', undefined, BOT_BLE_COMMAND_WRITE_ONLY);
        return result.success;
    }
    /**
     * Press (press mode)
     */
    async press() {
        // Use password-protected command if password is configured
        if (this.password) {
            return await this.executePasswordCommand(BOT_BLE_ACTIONS.PRESS);
        }
        // Standard command
        const result = await this.sendCommand(DEVICE_COMMANDS.BOT.PRESS, 'press', undefined, BOT_BLE_COMMAND_WRITE_ONLY);
        return result.success;
    }
    /**
     * Set Bot mode
     */
    async setMode(mode) {
        const modeByte = mode === 'switch' ? 0x01 : 0x00;
        return this.sendCommand([...DEVICE_COMMANDS.BOT.SET_MODE, modeByte], 'setMode', mode);
    }
    /**
     * Set Bot long-press duration (1-255 deciseconds)
     */
    async setLongPress(duration) {
        const clampedDuration = Math.min(255, Math.max(1, Math.trunc(duration)));
        const result = await this.sendCommand([...DEVICE_COMMANDS.BOT.SET_LONG_PRESS, clampedDuration], 'setLongPress', clampedDuration);
        return result.success;
    }
    /**
     * Raise Bot arm
     */
    async handUp() {
        const result = await this.sendCommand(DEVICE_COMMANDS.BOT.UP, 'turnOff', undefined, BOT_BLE_COMMAND_WRITE_ONLY);
        return result.success;
    }
    /**
     * Lower Bot arm
     */
    async handDown() {
        const result = await this.sendCommand(DEVICE_COMMANDS.BOT.DOWN, 'turnOn', undefined, BOT_BLE_COMMAND_WRITE_ONLY);
        return result.success;
    }
    /**
     * Execute password-protected Bot command
     * @param action - Bot action to perform
     * @returns True if command was successful
     */
    async executePasswordCommand(action) {
        if (!this.password) {
            throw new Error('Password not configured for this Bot device');
        }
        if (!this.hasBLE()) {
            throw new Error('BLE not available - password-protected commands require BLE connection');
        }
        try {
            // Build encrypted command
            const command = buildBotBleCommand(action, this.password);
            this.logger.debug('Sending password-protected command', { action });
            // Send command via BLE
            const mac = this.info.mac ?? `id:${this.info.bleId}`;
            await this.bleConnection.write(mac, command);
            // Read response
            const responseBuffer = await this.bleConnection.read(mac);
            // Parse and validate response
            parseBotBleResponse(responseBuffer);
            this.info.activeConnection = 'ble';
            this.emit('command', { type: 'ble', success: true, encrypted: true });
            return true;
        }
        catch (error) {
            this.logger.error('Password-protected command failed', error);
            this.emitError({ type: 'ble', error, encrypted: true });
            throw error;
        }
    }
    /**
     * Set or update Bot password
     * @param password - 4-character alphanumeric password (case-sensitive)
     */
    setPassword(password) {
        validateBotPassword(password);
        this.password = password;
        this.logger.info('Bot password updated');
    }
    /**
     * Clear Bot password
     */
    clearPassword() {
        this.password = undefined;
        this.logger.info('Bot password cleared');
    }
    /**
     * Check if password is configured
     */
    hasPassword() {
        return !!this.password;
    }
}
//# sourceMappingURL=wo-hand.js.map