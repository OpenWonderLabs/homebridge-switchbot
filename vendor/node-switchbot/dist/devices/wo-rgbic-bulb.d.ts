import type { RGBICBulbCommands, RGBICBulbStatus } from '../types/device.js';
import { WoBulb } from './wo-bulb.js';
/**
 * RGBIC Bulb Device with segmented/multi-zone color control
 * Supports individual LED segment control for addressable RGB+IC strips
 */
export declare class WoRGBICBulb extends WoBulb implements RGBICBulbCommands {
    private static readonly RGBIC_EFFECTS;
    /**
     * Set color for individual LED segment
     * @param segmentId - Segment identifier (0-based index)
     * @param red - Red value (0-255)
     * @param green - Green value (0-255)
     * @param blue - Blue value (0-255)
     */
    setSegmentColor(segmentId: number, red: number, green: number, blue: number): Promise<boolean>;
    /**
     * Set effect for individual LED segment
     * @param segmentId - Segment identifier (0-based index)
     * @param effectName - Effect name from RGBIC_EFFECTS
     * @param speed - Effect speed (1-100, default: 50)
     */
    setSegmentEffect(segmentId: number, effectName: string, speed?: number): Promise<boolean>;
    /**
     * Get device status (inherited from WoBulb, centralized fallback)
     */
    getStatus(): Promise<RGBICBulbStatus>;
}
//# sourceMappingURL=wo-rgbic-bulb.d.ts.map