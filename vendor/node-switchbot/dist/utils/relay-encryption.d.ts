import { Buffer } from 'node:buffer';
/**
 * Encrypts a relay switch BLE command using AES-128-CTR if key is provided.
 * @param cmd - Command as Buffer or number[]
 * @param keyHex - 16-byte hex string
 * @param ivHex - 16-byte hex string (optional, defaults to 0)
 * @returns Encrypted command as Buffer
 */
export declare function encryptRelayCommandIfNeeded(cmd: Buffer | number[], keyHex: string, ivHex?: string): Buffer;
//# sourceMappingURL=relay-encryption.d.ts.map