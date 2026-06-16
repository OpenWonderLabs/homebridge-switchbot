import { Buffer } from 'node:buffer';
import { DEVICE_COMMANDS } from '../settings.js';
import { validateResponseLength } from '../utils/index.js';
import { encryptRelayCommandIfNeeded } from '../utils/relay-encryption.js';
import { SequenceDevice } from './sequence-device.js';
/**
 * Relay Switch 1 Device (1-channel)
 */
export class WoRelaySwitch1 extends SequenceDevice {
    /**
     * Returns true if this relay switch requires BLE encryption (encryptionKey present)
     */
    needsEncryption() {
        return !!this.info.encryptionKey;
    }
    /**
     * Encrypts a command if encryption is required for this device
     */
    maybeEncryptCommand(cmd) {
        // Convert readonly arrays to mutable arrays for compatibility
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
            // Try to get status with encryption; if the key is wrong, device will reject or return invalid data
            const command = this.maybeEncryptCommand([...DEVICE_COMMANDS.COMMON.POWER_ON]);
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
    parseRelayPowerResponse(buffer) {
        validateResponseLength(buffer, 11, 'WoRelaySwitch1:parseRelayPowerResponse');
        // Best-effort parsing aligned with relay basic-info responses.
        const voltageRaw = buffer.readUInt16BE(5);
        const currentRaw = buffer.readUInt16BE(7);
        const energyRaw = buffer.readUInt16BE(9);
        return {
            voltage: voltageRaw / 10,
            electricCurrent: currentRaw / 100,
            electricityOfDay: energyRaw / 100,
        };
    }
    async getRelayPowerMonitoring() {
        if (!this.hasBLE()) {
            return {};
        }
        const result = await this.sendBLECommand(DEVICE_COMMANDS.RELAY.GET_BASIC_INFO);
        if (!result.success || !result.data || !Buffer.isBuffer(result.data)) {
            return {};
        }
        return this.parseRelayPowerResponse(result.data);
    }
    /**
     * Turn on
     */
    async turnOn() {
        const command = this.maybeEncryptCommand([...DEVICE_COMMANDS.COMMON.POWER_ON]);
        const result = await this.sendCommand(command, 'turnOn');
        return result.success;
    }
    /**
     * Turn off
     */
    async turnOff() {
        const command = this.maybeEncryptCommand([...DEVICE_COMMANDS.COMMON.POWER_OFF]);
        const result = await this.sendCommand(command, 'turnOff');
        return result.success;
    }
    /**
     * Toggle power
     */
    async toggle() {
        const command = this.maybeEncryptCommand([...DEVICE_COMMANDS.PLUG.TOGGLE]);
        const result = await this.sendCommand(command, 'toggle');
        return result.success;
    }
    /**
     * Get device status (BLE-first, API-fallback)
     */
    async getStatus() {
        return this.getStatusWithFallback(bleData => ({
            deviceId: this.info.id,
            connectionType: 'ble',
            power: bleData.state ? 'on' : 'off',
            voltage: bleData.voltage,
            electricCurrent: bleData.electricCurrent,
            electricityOfDay: bleData.electricityOfDay,
            updatedAt: new Date(),
        }), apiStatus => ({
            deviceId: this.info.id,
            connectionType: 'api',
            power: apiStatus.power || 'off',
            voltage: apiStatus.voltage,
            electricCurrent: apiStatus.electricCurrent,
            electricityOfDay: apiStatus.electricityOfDay,
            version: apiStatus.version,
            updatedAt: new Date(),
        }));
    }
}
//# sourceMappingURL=wo-relay-switch-1.js.map