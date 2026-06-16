import type { RelaySwitchCommands, RelaySwitchStatus } from '../types/device.js';
import { Buffer } from 'node:buffer';
import { SequenceDevice } from './sequence-device.js';
/**
 * Relay Switch 1 Device (1-channel)
 */
export declare class WoRelaySwitch1 extends SequenceDevice implements RelaySwitchCommands {
    /**
     * Returns true if this relay switch requires BLE encryption (encryptionKey present)
     */
    private needsEncryption;
    /**
     * Encrypts a command if encryption is required for this device
     */
    protected maybeEncryptCommand(cmd: Buffer | readonly number[]): Buffer;
    /**
     * Verifies the BLE encryption key by attempting a status read with encryption.
     * Throws an error if the key is invalid or the device rejects the command.
     */
    verifyEncryptionKey(): Promise<boolean>;
    private parseRelayPowerResponse;
    private getRelayPowerMonitoring;
    /**
     * Turn on
     */
    turnOn(): Promise<boolean>;
    /**
     * Turn off
     */
    turnOff(): Promise<boolean>;
    /**
     * Toggle power
     */
    toggle(): Promise<boolean>;
    /**
     * Get device status (BLE-first, API-fallback)
     */
    getStatus(): Promise<RelaySwitchStatus>;
}
//# sourceMappingURL=wo-relay-switch-1.d.ts.map