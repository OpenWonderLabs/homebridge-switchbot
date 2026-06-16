import type { BlindTiltCommands, BlindTiltStatus } from '../types/device.js';
import { SwitchBotDevice } from './base.js';
/**
 * Blind Tilt Device
 */
export declare class WoBlindTilt extends SwitchBotDevice implements BlindTiltCommands {
    /**
     * Open blind (position 50%)
     */
    open(): Promise<boolean>;
    /**
     * Close blind up (position 100%)
     */
    closeUp(): Promise<boolean>;
    close(): Promise<boolean>;
    closeDown(): Promise<boolean>;
    pause(): Promise<boolean>;
    setPosition(position: number): Promise<boolean>;
    private _lastPosition?;
    getStatus(): Promise<BlindTiltStatus>;
}
//# sourceMappingURL=wo-blind-tilt.d.ts.map