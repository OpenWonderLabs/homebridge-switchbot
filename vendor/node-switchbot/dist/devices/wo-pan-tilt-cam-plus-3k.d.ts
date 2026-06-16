import type { DeviceStatus } from '../types/index.js';
import { SwitchBotDevice } from './base.js';
export declare class WoPanTiltCamPlus3K extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback, centralized)
     */
    getStatus(): Promise<DeviceStatus>;
    /**
     * Pan the camera (degrees: -180 to 180)
     */
    pan(degrees: number): Promise<boolean>;
    /**
     * Tilt the camera (degrees: -90 to 90)
     */
    tilt(degrees: number): Promise<boolean>;
    /**
     * Reset the camera position
     */
    reset(): Promise<boolean>;
}
//# sourceMappingURL=wo-pan-tilt-cam-plus-3k.d.ts.map