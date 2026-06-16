/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * utils/bot-ble.ts: SwitchBot v4.0.0 - Bot BLE Password Helpers
 */
import { Buffer } from 'node:buffer';
/**
 * CRC32 polynomial for password encryption
 */
const CRC32_POLYNOMIAL = 0xEDB88320;
/**
 * Precomputed CRC32 lookup table
 */
const CRC32_TABLE = new Uint32Array(256);
// Initialize CRC32 table
for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
        crc = (crc & 1) !== 0 ? (crc >>> 1) ^ CRC32_POLYNOMIAL : (crc >>> 1);
    }
    CRC32_TABLE[i] = crc >>> 0;
}
/**
 * Calculate CRC32 checksum of a string
 * @param input - String to calculate CRC32 for
 * @returns CRC32 checksum as unsigned 32-bit integer
 */
function calculateCRC32(input) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < input.length; i++) {
        const byte = input.charCodeAt(i);
        crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
/**
 * Valid Bot BLE action values
 */
export const BOT_BLE_ACTIONS = {
    PRESS: 0x00,
    TURN_ON: 0x01,
    TURN_OFF: 0x02,
};
// Regex pattern at module scope to avoid recompilation
const PASSWORD_REGEX = /^[A-Z0-9]{4}$/i;
/**
 * Validate Bot BLE password format
 * Password must be exactly 4 alphanumeric characters (case-sensitive)
 * @param password - Password to validate
 * @throws Error if password format is invalid
 */
export function validateBotPassword(password) {
    if (!PASSWORD_REGEX.test(password)) {
        throw new Error('Invalid Bot password. Password must be exactly 4 alphanumeric characters (case-sensitive).');
    }
}
/**
 * Build Bot BLE command buffer
 * @param action - Bot action (0x00=press, 0x01=on, 0x02=off)
 * @param password - Optional 4-character password for encrypted commands
 * @returns Command buffer ready to send via BLE
 * @throws Error if action or password format is invalid
 */
export function buildBotBleCommand(action, password) {
    // Validate action
    const validActions = [
        BOT_BLE_ACTIONS.PRESS,
        BOT_BLE_ACTIONS.TURN_ON,
        BOT_BLE_ACTIONS.TURN_OFF,
    ];
    if (!validActions.includes(action)) {
        throw new Error(`Invalid Bot BLE action: 0x${action.toString(16)}. Expected 0x00, 0x01, or 0x02.`);
    }
    // Plain command (no password)
    if (!password) {
        return Buffer.from([0x57, 0x01, action]);
    }
    // Encrypted command (with password)
    validateBotPassword(password);
    const crc = calculateCRC32(password);
    // Command format: [0x57, 0x11, CRC32_BE (4 bytes), action]
    return Buffer.from([
        0x57,
        0x11,
        (crc >>> 24) & 0xFF, // MSB first (big-endian)
        (crc >>> 16) & 0xFF,
        (crc >>> 8) & 0xFF,
        crc & 0xFF, // LSB
        action,
    ]);
}
/**
 * Parse Bot BLE response buffer
 * @param response - Response buffer from Bot device
 * @returns True if command was successful
 * @throws Error if response indicates failure
 */
export function parseBotBleResponse(response) {
    if (response.length !== 3) {
        throw new Error(`Invalid Bot response length: ${response.length}, expected 3`);
    }
    const statusCode = response.readUInt8(0);
    // Success codes: 0x01 (success) or 0x05 (success, encrypted)
    if (statusCode === 0x01 || statusCode === 0x05) {
        return true;
    }
    // Error response
    throw new Error(`Bot command failed with status: 0x${response.toString('hex')}`);
}
//# sourceMappingURL=bot-ble.js.map