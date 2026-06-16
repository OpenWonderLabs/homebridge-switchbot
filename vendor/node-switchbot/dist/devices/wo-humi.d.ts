import type { HumidifierCommands, HumidifierStatus } from '../types/device.js';
import { SwitchBotDevice } from './base.js';
/**
 * Humidifier Device
 */
export declare class WoHumi extends SwitchBotDevice implements HumidifierCommands {
    /**
     * Turn on
     */
    turnOn(): Promise<boolean>;
    /**
     * Turn off
     */
    turnOff(): Promise<boolean>;
    /**
     * Set mode (auto/manual)
     */
    setMode(mode: 'auto' | 'manual'): Promise<import('../types/index.js').CommandResult>;
    /**
     * Set nebulization efficiency (0-100)
     */
    setEfficiency(level: number): Promise<boolean>;
    /**
     * Set target humidity level (1-100)
     */
    setLevel(level: number): Promise<boolean>;
    /**
     * Get device status (BLE-first/API-fallback, centralized)
     */
    getStatus(): Promise<HumidifierStatus>;
    /**
     * Set auto mode
     */
    setAuto(): Promise<boolean>;
    /**
     * Set manual mode
     */
    setManual(): Promise<boolean>;
    /**
     * Get target humidity level (if available)
     */
    getTargetLevel(): Promise<number | undefined>;
}
//# sourceMappingURL=wo-humi.d.ts.map