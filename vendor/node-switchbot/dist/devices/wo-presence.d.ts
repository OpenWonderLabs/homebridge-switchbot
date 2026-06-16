import type { MotionStatus } from '../types/device.js';
import { SwitchBotDevice } from './base.js';
/**
 * Motion/Presence Sensor
 */
export declare class WoPresence extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    getStatus(): Promise<MotionStatus>;
}
//# sourceMappingURL=wo-presence.d.ts.map