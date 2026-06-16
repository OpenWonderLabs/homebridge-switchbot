import { WoKeypad } from './wo-keypad.js';
/**
 * SwitchBot Keypad Vision Pro device
 * @extends WoKeypad
 */
export class WoKeypadVisionPro extends WoKeypad {
    /**
     * Get keypad status (inherited from WoKeypad)
     * @returns Promise resolving to KeypadStatus
     */
    async getStatus() {
        return super.getStatus();
    }
}
//# sourceMappingURL=wo-keypad-vision-pro.js.map