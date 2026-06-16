import type { AirPurifierStatus } from '../types/device.js';
import { SwitchBotDevice } from './base.js';
export declare class WoAirPurifierPM25 extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    getStatus(): Promise<AirPurifierStatus>;
    /**
     * Turn on
     */
    turnOn(): Promise<boolean>;
    /**
     * Turn off
     */
    turnOff(): Promise<boolean>;
    /**
     * Set mode (auto/manual/sleep)
     */
    setMode(mode: 'auto' | 'manual' | 'sleep'): Promise<import('../types/index.js').CommandResult>;
    /**
     * Set fan speed (1-4)
     */
    setFanSpeed(speed: number): Promise<boolean>;
    /**
     * Set preset mode (level_1, level_2, level_3, auto, sleep, pet)
     */
    setPresetMode(mode: 'level_1' | 'level_2' | 'level_3' | 'auto' | 'sleep' | 'pet'): Promise<boolean>;
}
//# sourceMappingURL=wo-air-purifier-pm25.d.ts.map