import type { MeterStatus } from '../types/device.js';
import { SwitchBotDevice } from './base.js';
/**
 * Meter (Temperature/Humidity Sensor)
 */
export declare class WoSensorTH extends SwitchBotDevice {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    getStatus(): Promise<MeterStatus>;
}
//# sourceMappingURL=wo-sensor-th.d.ts.map