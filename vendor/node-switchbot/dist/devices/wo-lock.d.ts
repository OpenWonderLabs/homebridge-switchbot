import type { Buffer } from 'node:buffer';
import type { LockCommands, LockStatus } from '../types/device.js';
import { SequenceDevice } from './sequence-device.js';
/**
 * Smart Lock Device
 */
export declare class WoSmartLock extends SequenceDevice implements LockCommands {
    private lockNotificationHandlers;
    /**
     * Lock the lock
     */
    lock(): Promise<boolean>;
    /**
     * Unlock the lock
     */
    unlock(): Promise<boolean>;
    getLockInfo(): Promise<Record<string, unknown>>;
    onLockNotification(handler: (payload: Buffer) => void): Promise<void>;
    offLockNotification(handler: (payload: Buffer) => void): void;
    /**
     * Get device status (BLE-first, API-fallback)
     */
    getStatus(): Promise<LockStatus>;
}
//# sourceMappingURL=wo-lock.d.ts.map