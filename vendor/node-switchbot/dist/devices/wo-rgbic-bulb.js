/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * devices/wo-rgbic-bulb.ts: SwitchBot v4.0.0 - RGBIC Color Bulb with Segmented Control
 */
import { clamp } from '../utils/index.js';
import { WoBulb } from './wo-bulb.js';
/**
 * RGBIC Bulb Device with segmented/multi-zone color control
 * Supports individual LED segment control for addressable RGB+IC strips
 */
export class WoRGBICBulb extends WoBulb {
    static RGBIC_EFFECTS = {
        // Standard effects (compatible with WoBulb)
        christmas: 0x00,
        candle: 0x01,
        halloween: 0x02,
        sunset: 0x03,
        party: 0x04,
        reading: 0x05,
        rainbow: 0x06,
        forest: 0x07,
        ocean: 0x08,
        spring: 0x09,
        summer: 0x0A,
        autumn: 0x0B,
        winter: 0x0C,
        aurora: 0x0D,
        meteor: 0x0E,
        firework: 0x0F,
        breathe: 0x10,
        pulse: 0x11,
        flicker: 0x12,
        pet: 0x13,
        // RGBIC-specific effects
        segment_cycle: 0x20,
        segment_wave: 0x21,
        segment_chase: 0x22,
        segment_strobe: 0x23,
        segment_twinkle: 0x24,
    };
    /**
     * Set color for individual LED segment
     * @param segmentId - Segment identifier (0-based index)
     * @param red - Red value (0-255)
     * @param green - Green value (0-255)
     * @param blue - Blue value (0-255)
     */
    async setSegmentColor(segmentId, red, green, blue) {
        const segId = clamp(segmentId, 0, 255);
        const r = clamp(red, 0, 255);
        const g = clamp(green, 0, 255);
        const b = clamp(blue, 0, 255);
        // Command format for segment color: varies by device
        // Using extended command format: 0x57 0x0F 0x47 0x01 0x13 SEG_ID R G B
        const bleCommand = [0x57, 0x0F, 0x47, 0x01, 0x13, segId, r, g, b];
        const result = await this.sendCommand(bleCommand, 'setSegmentColor', `seg${segId}:${r}:${g}:${b}`);
        return result.success;
    }
    /**
     * Set effect for individual LED segment
     * @param segmentId - Segment identifier (0-based index)
     * @param effectName - Effect name from RGBIC_EFFECTS
     * @param speed - Effect speed (1-100, default: 50)
     */
    async setSegmentEffect(segmentId, effectName, speed = 50) {
        const effectId = WoRGBICBulb.RGBIC_EFFECTS[effectName.toLowerCase()];
        if (effectId === undefined) {
            throw new Error(`Unsupported RGBIC effect: ${effectName}`);
        }
        const segId = clamp(segmentId, 0, 255);
        const effectSpeed = clamp(speed, 1, 100);
        // Command format for segment effect: 0x57 0x0F 0x47 0x01 0x14 SEG_ID EFFECT_ID SPEED
        const bleCommand = [0x57, 0x0F, 0x47, 0x01, 0x14, segId, effectId, effectSpeed];
        const result = await this.sendCommand(bleCommand, 'setSegmentEffect', `seg${segId}:${effectName}:${effectSpeed}`);
        return result.success;
    }
    /**
     * Get device status (inherited from WoBulb, centralized fallback)
     */
    async getStatus() {
        return super.getStatus();
    }
}
//# sourceMappingURL=wo-rgbic-bulb.js.map