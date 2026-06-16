import type { RemoteStatus } from '../types/device.js';
import { SwitchBotDevice } from './base.js';
/**
 * Remote Device (IR remote control)
 * Note: Remote is read-only for battery status
 */
export declare class WoRemote extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    getStatus(): Promise<RemoteStatus>;
}
//# sourceMappingURL=wo-remote.d.ts.map