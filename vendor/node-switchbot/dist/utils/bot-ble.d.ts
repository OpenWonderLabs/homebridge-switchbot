import { Buffer } from 'node:buffer';
/**
 * Bot BLE action types
 */
export type BotBleAction = 0x00 | 0x01 | 0x02;
/**
 * Valid Bot BLE action values
 */
export declare const BOT_BLE_ACTIONS: {
    PRESS: BotBleAction;
    TURN_ON: BotBleAction;
    TURN_OFF: BotBleAction;
};
/**
 * Validate Bot BLE password format
 * Password must be exactly 4 alphanumeric characters (case-sensitive)
 * @param password - Password to validate
 * @throws Error if password format is invalid
 */
export declare function validateBotPassword(password: string): void;
/**
 * Build Bot BLE command buffer
 * @param action - Bot action (0x00=press, 0x01=on, 0x02=off)
 * @param password - Optional 4-character password for encrypted commands
 * @returns Command buffer ready to send via BLE
 * @throws Error if action or password format is invalid
 */
export declare function buildBotBleCommand(action: BotBleAction, password?: string): Buffer;
/**
 * Parse Bot BLE response buffer
 * @param response - Response buffer from Bot device
 * @returns True if command was successful
 * @throws Error if response indicates failure
 */
export declare function parseBotBleResponse(response: Buffer): boolean;
//# sourceMappingURL=bot-ble.d.ts.map