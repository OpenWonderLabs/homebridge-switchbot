import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
/**
 * Encrypts a relay switch BLE command using AES-128-CTR if key is provided.
 * @param cmd - Command as Buffer or number[]
 * @param keyHex - 16-byte hex string
 * @param ivHex - 16-byte hex string (optional, defaults to 0)
 * @returns Encrypted command as Buffer
 */
export function encryptRelayCommandIfNeeded(cmd, keyHex, ivHex) {
    const key = Buffer.from(keyHex, 'hex');
    if (key.length !== 16) {
        throw new Error('Relay encryptionKey must be 16 bytes (32 hex chars)');
    }
    const iv = ivHex ? Buffer.from(ivHex, 'hex') : Buffer.alloc(16, 0);
    const input = Buffer.isBuffer(cmd) ? cmd : Buffer.from(cmd);
    // For now, always use CTR mode (SwitchBot default for relay/lock)
    const cipher = crypto.createCipheriv('aes-128-ctr', key, iv);
    const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
    // Prepend 0x11 to indicate encrypted command (SwitchBot convention)
    return Buffer.concat([Buffer.from([0x11]), encrypted]);
}
//# sourceMappingURL=relay-encryption.js.map