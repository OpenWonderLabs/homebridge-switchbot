import type { HubStatus } from '../types/device.js';
import { SwitchBotDevice } from './base.js';
export declare class WoAIHub extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    getStatus(): Promise<HubStatus>;
}
//# sourceMappingURL=wo-ai-hub.d.ts.map