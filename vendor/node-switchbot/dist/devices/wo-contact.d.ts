import type { ContactStatus } from '../types/device.js';
import { SwitchBotDevice } from './base.js';
/**
 * Contact Sensor (Door/Window Sensor)
 */
export declare class WoContact extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    getStatus(): Promise<ContactStatus>;
}
//# sourceMappingURL=wo-contact.d.ts.map