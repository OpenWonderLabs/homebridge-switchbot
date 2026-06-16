import type { OpenAPIClient } from '../api.js';
import type { BLEConnection } from '../ble.js';
import type { BotCommands, BotStatus } from '../types/device.js';
import type { DeviceInfo } from '../types/index.js';
import { DeviceOverrideStateDuringConnection } from './device-override-state-during-connection.js';
/**
 * Bot (WoHand) Device - Press or switch button device
 * Supports optional BLE password protection
 */
export declare class WoHand extends DeviceOverrideStateDuringConnection implements BotCommands {
    /**
     * Get device status (BLE-first, API-fallback)
     */
    getStatus(): Promise<BotStatus>;
    private password?;
    constructor(info: DeviceInfo, options?: {
        bleConnection?: BLEConnection;
        apiClient?: OpenAPIClient;
        enableFallback?: boolean;
        preferredConnection?: 'ble' | 'api';
        enableConnectionIntelligence?: boolean;
        enableCircuitBreaker?: boolean;
        enableRetry?: boolean;
        password?: string;
        logLevel?: number;
    });
    /**
     * Turn on (switch mode)
     */
    turnOn(): Promise<boolean>;
    /**
     * Turn off (switch mode)
     */
    turnOff(): Promise<boolean>;
    /**
     * Press (press mode)
     */
    press(): Promise<boolean>;
    /**
     * Set Bot mode
     */
    setMode(mode: 'press' | 'switch'): Promise<import('../types/index.js').CommandResult>;
    /**
     * Set Bot long-press duration (1-255 deciseconds)
     */
    setLongPress(duration: number): Promise<boolean>;
    /**
     * Raise Bot arm
     */
    handUp(): Promise<boolean>;
    /**
     * Lower Bot arm
     */
    handDown(): Promise<boolean>;
    /**
     * Execute password-protected Bot command
     * @param action - Bot action to perform
     * @returns True if command was successful
     */
    private executePasswordCommand;
    /**
     * Set or update Bot password
     * @param password - 4-character alphanumeric password (case-sensitive)
     */
    setPassword(password: string): void;
    /**
     * Clear Bot password
     */
    clearPassword(): void;
    /**
     * Check if password is configured
     */
    hasPassword(): boolean;
}
//# sourceMappingURL=wo-hand.d.ts.map