import type { LeakStatus } from '../types/device.js';
import { SwitchBotDevice } from './base.js';
export declare class WoWaterDetector extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    getStatus(): Promise<LeakStatus>;
}
//# sourceMappingURL=wo-water-detector.d.ts.map