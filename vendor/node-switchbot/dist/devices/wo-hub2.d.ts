import type { HubStatus } from '../types/device.js';
import { SwitchBotDevice } from './base.js';
/**
 * Hub 2 Device (Hub Mini/Hub Plus also use this)
 */
export declare class WoHub2 extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    getStatus(): Promise<HubStatus>;
}
//# sourceMappingURL=wo-hub2.d.ts.map