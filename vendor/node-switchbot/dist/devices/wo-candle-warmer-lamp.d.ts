import type { DeviceStatus } from '../types/index.js';
import { SwitchBotDevice } from './base.js';
export interface CandleWarmerLampStatus extends DeviceStatus {
    power?: 'on' | 'off';
    brightness?: number;
}
export declare class WoCandleWarmerLamp extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    getStatus(): Promise<CandleWarmerLampStatus>;
    /**
     * Turn on the candle warmer lamp
     */
    turnOn(): Promise<boolean>;
    /**
     * Turn off the candle warmer lamp
     */
    turnOff(): Promise<boolean>;
    /**
     * Set brightness (1-100)
     */
    setBrightness(level: number): Promise<boolean>;
}
//# sourceMappingURL=wo-candle-warmer-lamp.d.ts.map