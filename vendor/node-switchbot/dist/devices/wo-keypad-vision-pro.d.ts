/**
 * WoKeypadVisionPro device class for SwitchBot Keypad Vision Pro
 * Extends base WoKeypad functionality for lock keypad operations
 */
import type { KeypadStatus } from '../types/device.js';
import { WoKeypad } from './wo-keypad.js';
/**
 * SwitchBot Keypad Vision Pro device
 * @extends WoKeypad
 */
export declare class WoKeypadVisionPro extends WoKeypad {
    /**
     * Get keypad status (inherited from WoKeypad)
     * @returns Promise resolving to KeypadStatus
     */
    getStatus(): Promise<KeypadStatus>;
}
//# sourceMappingURL=wo-keypad-vision-pro.d.ts.map