import type { RGBICBulbStatus } from '../types/device.js';
import { SwitchBotDevice } from './base.js';
export declare class WoRGBICNeonWireRopeLight extends SwitchBotDevice {
    /**
     * Get device status (BLE-first/API-fallback, centralized)
     */
    getStatus(): Promise<RGBICBulbStatus>;
    /**
     * Turn on the neon wire rope light
     */
    turnOn(): Promise<boolean>;
    /**
     * Turn off the neon wire rope light
     */
    turnOff(): Promise<boolean>;
    /**
     * Set brightness (1-100)
     */
    setBrightness(level: number): Promise<boolean>;
    /**
     * Set color (RGB)
     */
    setColor(red: number, green: number, blue: number): Promise<boolean>;
    /**
     * Set color temperature (Kelvin)
     */
    setColorTemperature(temperature: number): Promise<boolean>;
}
//# sourceMappingURL=wo-rgbic-neon-wire-rope-light.d.ts.map