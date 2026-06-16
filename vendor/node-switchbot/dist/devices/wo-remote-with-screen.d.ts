import type { DeviceStatus } from '../types/index.js';
import { SwitchBotDevice } from './base.js';
export declare class WoRemoteWithScreen extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    getStatus(): Promise<DeviceStatus>;
}
//# sourceMappingURL=wo-remote-with-screen.d.ts.map