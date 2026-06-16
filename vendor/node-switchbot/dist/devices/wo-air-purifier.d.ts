import type { AirPurifierCommands, AirPurifierStatus } from '../types/device.js';
import { SequenceDevice } from './sequence-device.js';
/**
 * Air Purifier Device
 */
export declare class WoAirPurifier extends SequenceDevice implements AirPurifierCommands {
    /**
     * Returns true if this air purifier requires BLE encryption (encryptionKey present)
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
     * Set mode
     */
    setMode(mode: 'auto' | 'manual' | 'sleep'): Promise<import('../types/index.js').CommandResult>;
    /**
     * Set fan speed (1-4)
     */
    setFanSpeed(speed: number): Promise<boolean>;
    /**
     * Get device status (BLE-first, API-fallback)
     */
    getStatus(): Promise<AirPurifierStatus>;
    /**
     * Set preset mode (level_1, level_2, level_3, auto, sleep, pet)
     */
    setPresetMode(mode: 'level_1' | 'level_2' | 'level_3' | 'auto' | 'sleep' | 'pet'): Promise<boolean>;
}
//# sourceMappingURL=wo-air-purifier.d.ts.map