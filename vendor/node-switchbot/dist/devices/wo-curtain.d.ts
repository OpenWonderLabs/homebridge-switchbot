import type { CurtainCommands, CurtainExtendedInfo, CurtainStatus } from '../types/device.js';
import { SwitchBotDevice } from './base.js';
/**
 * Curtain Device - Smart curtain controller
 */
export declare class WoCurtain extends SwitchBotDevice implements CurtainCommands {
    /**
     * Open curtain (position 0%)
     */
    open(speed?: number): Promise<boolean>;
    /**
     * Close curtain (position 100%)
     */
    close(speed?: number): Promise<boolean>;
    /**
     * Pause curtain movement
     */
    pause(): Promise<boolean>;
    /**
     * Set curtain position (0-100%)
     */
    setPosition(position: number, speed?: number): Promise<boolean>;
    /**
     * Get device status
     */
    _lastPosition?: number;
    getStatus(): Promise<CurtainStatus>;
    /**
     * Get extended device information (Curtain 3)
     * Returns device chain information and grouped curtain status
     */
    getExtendedInfo(): Promise<CurtainExtendedInfo>;
    /**
     * Send multiple commands in sequence (all must succeed)
     * Used for Curtain 3 complex operations
     */
    sendCommandSequence(commands: Array<() => Promise<boolean>>): Promise<boolean>;
    /**
     * Send multiple commands (returns true if any succeed)
     * Used for Curtain 3 fallback operations
     */
    sendMultipleCommands(commands: Array<() => Promise<boolean>>): Promise<boolean>;
}
//# sourceMappingURL=wo-curtain.d.ts.map