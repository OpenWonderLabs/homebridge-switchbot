import type { LeakStatus } from '../types/device.js';
import { SwitchBotDevice } from './base.js';
/**
 * Water Leak Detector Device
 */
export declare class WoLeak extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    getStatus(): Promise<LeakStatus>;
}
//# sourceMappingURL=wo-leak.d.ts.map