import type { PlugCommands, PlugStatus } from '../types/device.js';
import { DeviceOverrideStateDuringConnection } from './device-override-state-during-connection.js';
/**
 * Plug Mini (US) Device
 */
export declare class WoPlugMiniUS extends DeviceOverrideStateDuringConnection implements PlugCommands {
    /**
     * Turn on
     */
    turnOn(): Promise<boolean>;
    /**
     * Turn off
     */
    turnOff(): Promise<boolean>;
    /**
     * Toggle power
     */
    toggle(): Promise<boolean>;
    /**
     * Get device status (BLE-first, API-fallback, centralized)
     */
    getStatus(): Promise<PlugStatus>;
}
//# sourceMappingURL=wo-plug-mini-us.d.ts.map