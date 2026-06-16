import type { KeypadStatus } from '../types/device.js';
import { SwitchBotDevice } from './base.js';
/**
 * Keypad Device (Touch/Physical)
 * Note: Keypad is primarily for lock control, read-only for status
 */
export declare class WoKeypad extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    getStatus(): Promise<KeypadStatus>;
}
//# sourceMappingURL=wo-keypad.d.ts.map