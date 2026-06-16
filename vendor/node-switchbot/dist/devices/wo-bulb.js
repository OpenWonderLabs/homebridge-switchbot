import { Buffer } from 'node:buffer';
import { DEVICE_COMMANDS } from '../settings.js';
import { clamp, validateResponseLength } from '../utils/index.js';
import { encryptRelayCommandIfNeeded } from '../utils/relay-encryption.js';
import { SwitchBotDevice } from './base.js';
/**
 * Color Bulb Device
 */
export class WoBulb extends SwitchBotDevice {
    /**
     * Returns true if this bulb/strip requires BLE encryption (encryptionKey present)
     */
    needsEncryption() {
        return !!this.info.encryptionKey;
    }
    /**
     * Encrypts a command if encryption is required for this device
     */
    maybeEncryptCommand(cmd) {
        const arr = Buffer.isBuffer(cmd) ? cmd : Buffer.from([...cmd]);
        if (!this.needsEncryption()) {
            return arr;
        }
        return encryptRelayCommandIfNeeded(arr, this.info.encryptionKey, this.info.encryptionIV);
    }
    /**
     * Verifies the BLE encryption key by attempting a status read with encryption.
     * Throws an error if the key is invalid or the device rejects the command.
     */
    async verifyEncryptionKey() {
        if (!this.needsEncryption()) {
            throw new Error('No encryptionKey set for this device');
        }
        try {
            // Try to turn on with encryption; if the key is wrong, device will reject or return invalid data
            const command = this.maybeEncryptCommand([...DEVICE_COMMANDS.BULB.BASE, ...DEVICE_COMMANDS.BULB.TURN_ON]);
            const result = await this.sendCommand(command, 'verifyEncryptionKey');
            if (!result.success) {
                throw new Error('Encryption key verification failed: device did not accept encrypted command');
            }
            return true;
        }
        catch (err) {
            throw new Error(`Encryption key verification failed: ${err?.message || err}`);
        }
    }
    /**
     * Turn on
     */
    async turnOn() {
        const command = this.maybeEncryptCommand([...DEVICE_COMMANDS.BULB.BASE, ...DEVICE_COMMANDS.BULB.TURN_ON]);
        const result = await this.sendCommand(command, 'turnOn');
        return result.success;
    }
    /**
     * Turn off
     */
    async turnOff() {
        const command = this.maybeEncryptCommand([...DEVICE_COMMANDS.BULB.BASE, ...DEVICE_COMMANDS.BULB.TURN_OFF]);
        const result = await this.sendCommand(command, 'turnOff');
        return result.success;
    }
    /**
     * Set brightness (0-100)
     */
    async setBrightness(brightness) {
        const clampedBrightness = clamp(brightness, 0, 100);
        const bleCommand = [...DEVICE_COMMANDS.BULB.BASE, ...DEVICE_COMMANDS.BULB.SET_BRIGHTNESS, clampedBrightness];
        const command = this.maybeEncryptCommand(bleCommand);
        const result = await this.sendCommand(command, 'setBrightness', clampedBrightness);
        return result.success;
    }
    /**
     * Set color temperature (2700-6500K)
     */
    async setColorTemperature(temperature) {
        const clampedTemp = clamp(temperature, 2700, 6500);
        // Convert to bytes for BLE
        const tempBytes = [(clampedTemp >> 8) & 0xFF, clampedTemp & 0xFF];
        const bleCommand = [...DEVICE_COMMANDS.BULB.BASE, ...DEVICE_COMMANDS.BULB.SET_COLOR_TEMP, ...tempBytes];
        const command = this.maybeEncryptCommand(bleCommand);
        const result = await this.sendCommand(command, 'setColorTemperature', clampedTemp);
        return result.success;
    }
    /**
     * Set color temperature with min/max bounds
     * For advanced bulbs that support color temperature range control
     */
    async setColorTemp(minTemp, maxTemp, temp) {
        // Validate and clamp temperatures
        const clampedMinTemp = clamp(minTemp, 2700, 6500);
        const clampedMaxTemp = clamp(maxTemp, 2700, 6500);
        const clampedTemp = clamp(temp, clampedMinTemp, clampedMaxTemp);
        // Ensure min <= max
        const finalMinTemp = Math.min(clampedMinTemp, clampedMaxTemp);
        const finalMaxTemp = Math.max(clampedMinTemp, clampedMaxTemp);
        // Build command: 0x57 0x0F 0x47 0x01 0x17 BRIGHTNESS MIN_KEL MAX_KEL TEMP
        // Note: Brightness is required but not specified, use default 100 (0x64)
        const minTempBytes = [
            (finalMinTemp >> 8) & 0xFF,
            finalMinTemp & 0xFF,
        ];
        const maxTempBytes = [
            (finalMaxTemp >> 8) & 0xFF,
            finalMaxTemp & 0xFF,
        ];
        const tempBytes = [(clampedTemp >> 8) & 0xFF, clampedTemp & 0xFF];
        const bleCommand = [
            ...DEVICE_COMMANDS.BULB.BASE,
            0x17,
            0x64, // brightness (default: 100/255)
            ...minTempBytes,
            ...maxTempBytes,
            ...tempBytes,
        ];
        const command = this.maybeEncryptCommand(bleCommand);
        const result = await this.sendCommand(command, 'setColorTemp', `${finalMinTemp}-${finalMaxTemp}:${clampedTemp}`);
        return result.success;
    }
    /**
     * Set RGB color
     */
    async setColor(red, green, blue) {
        const r = clamp(red, 0, 255);
        const g = clamp(green, 0, 255);
        const b = clamp(blue, 0, 255);
        const bleCommand = [...DEVICE_COMMANDS.BULB.BASE, ...DEVICE_COMMANDS.BULB.SET_RGB, r, g, b];
        const command = this.maybeEncryptCommand(bleCommand);
        const result = await this.sendCommand(command, 'setColor', `${r}:${g}:${b}`);
        return result.success;
    }
    /**
     * Preset effect name to effect ID mapping
     */
    static EFFECTS = {
        rainbow: 0x01,
        sunrise: 0x02,
        sunset: 0x03,
        ocean: 0x04,
        forest: 0x05,
        party: 0x06,
        christmas: 0x07,
        birthday: 0x08,
        romantic: 0x09,
        candlelight: 0x0A,
        reading: 0x0B,
        night: 0x0C,
        relax: 0x0D,
        soft: 0x0E,
        colorful: 0x0F,
        flicker: 0x10,
        // Add more as needed
    };
    /**
     * Set preset light effect
     */
    async setEffect(effectName, speed = 100) {
        const effectId = WoBulb.EFFECTS[effectName.toLowerCase()];
        if (effectId === undefined) {
            throw new Error(`Unsupported effect: ${effectName}`);
        }
        const effectSpeed = clamp(speed, 1, 100);
        const bleCommand = [...DEVICE_COMMANDS.BULB.BASE, effectId, 0xFF, effectSpeed, 0x00, 0x00, 0x00];
        const command = this.maybeEncryptCommand(bleCommand);
        const result = await this.sendCommand(command, 'setEffect', `${effectName}:${effectSpeed}`);
        return result.success;
    }
    /**
     * Get device status (BLE-first/API-fallback, centralized)
     */
    async getStatus() {
        return this.getStatusWithFallback((bleData) => {
            if (bleData.rawData && Buffer.isBuffer(bleData.rawData)) {
                validateResponseLength(bleData.rawData, 8, 'WoBulb:getStatus BLE');
            }
            return {
                deviceId: this.info.id,
                connectionType: 'ble',
                power: bleData.state ? 'on' : 'off',
                brightness: bleData.brightness,
                colorTemperature: bleData.colorTemperature,
                color: bleData.red !== undefined
                    ? {
                        r: bleData.red,
                        g: bleData.green,
                        b: bleData.blue,
                    }
                    : undefined,
                updatedAt: new Date(),
            };
        }, (apiStatus) => {
            let color;
            if (apiStatus.color) {
                const [r, g, b] = apiStatus.color.split(':').map(Number);
                color = { r, g, b };
            }
            return {
                deviceId: this.info.id,
                connectionType: 'api',
                power: apiStatus.power || 'off',
                brightness: apiStatus.brightness,
                colorTemperature: apiStatus.colorTemperature,
                color,
                version: apiStatus.version,
                updatedAt: new Date(),
            };
        });
    }
    /**
     * Send multiple commands in sequence (all must succeed)
     * Used for Strip Light 3 and complex light patterns
     */
    async sendCommandSequence(commands) {
        try {
            for (const command of commands) {
                const success = await command();
                if (!success) {
                    this.logger.warn('Command in sequence failed, stopping execution');
                    return false;
                }
                // Small delay between commands for device processing
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
     * Used for fallback operations with complex light patterns
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
//# sourceMappingURL=wo-bulb.js.map