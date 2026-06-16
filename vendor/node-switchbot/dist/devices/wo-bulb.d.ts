import type { BulbCommands, BulbStatus } from '../types/device.js';
import { SwitchBotDevice } from './base.js';
/**
 * Color Bulb Device
 */
export declare class WoBulb extends SwitchBotDevice implements BulbCommands {
    /**
     * Returns true if this bulb/strip requires BLE encryption (encryptionKey present)
     */
    private needsEncryption;
    /**
     * Encrypts a command if encryption is required for this device
     */
    private maybeEncryptCommand;
    /**
     * Verifies the BLE encryption key by attempting a status read with encryption.
     * Throws an error if the key is invalid or the device rejects the command.
     */
    verifyEncryptionKey(): Promise<boolean>;
    /**
     * Turn on
     */
    turnOn(): Promise<boolean>;
    /**
     * Turn off
     */
    turnOff(): Promise<boolean>;
    /**
     * Set brightness (0-100)
     */
    setBrightness(brightness: number): Promise<boolean>;
    /**
     * Set color temperature (2700-6500K)
     */
    setColorTemperature(temperature: number): Promise<boolean>;
    /**
     * Set color temperature with min/max bounds
     * For advanced bulbs that support color temperature range control
     */
    setColorTemp(minTemp: number, maxTemp: number, temp: number): Promise<boolean>;
    /**
     * Set RGB color
     */
    setColor(red: number, green: number, blue: number): Promise<boolean>;
    /**
     * Preset effect name to effect ID mapping
     */
    static EFFECTS: Record<string, number>;
    /**
     * Set preset light effect
     */
    setEffect(effectName: string, speed?: number): Promise<boolean>;
    /**
     * Get device status (BLE-first/API-fallback, centralized)
     */
    getStatus(): Promise<BulbStatus>;
    /**
     * Send multiple commands in sequence (all must succeed)
     * Used for Strip Light 3 and complex light patterns
     */
    sendCommandSequence(commands: Array<() => Promise<boolean>>): Promise<boolean>;
    /**
     * Send multiple commands (returns true if any succeed)
     * Used for fallback operations with complex light patterns
     */
    sendMultipleCommands(commands: Array<() => Promise<boolean>>): Promise<boolean>;
}
//# sourceMappingURL=wo-bulb.d.ts.map