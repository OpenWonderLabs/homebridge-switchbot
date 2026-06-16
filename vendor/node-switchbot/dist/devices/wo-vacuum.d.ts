import type { VacuumCommands, VacuumStatus } from '../types/device.js';
import { SequenceDevice } from './sequence-device.js';
/**
 * Vacuum Device
 */
export declare class WoVacuum extends SequenceDevice implements VacuumCommands {
    /**
     * Start cleaning (BLE-first, API-fallback)
     */
    cleanUp(protocolVersion: number): Promise<boolean>;
    /**
     * Return to dock (BLE-first, API-fallback)
     */
    returnToDock(protocolVersion: number): Promise<boolean>;
    /**
     * Return advertised battery value
     */
    getBattery(): number | undefined;
    /**
     * Return advertised work status value
     */
    getWorkStatus(): number | undefined;
    /**
     * Return advertised dustbin bound state
     */
    getDustbinBoundStatus(): boolean | undefined;
    /**
     * Return advertised dustbin connected state
     */
    getDustbinConnectedStatus(): boolean | undefined;
    /**
     * Return advertised network connected state
     */
    getNetworkConnectedStatus(): boolean | undefined;
    /**
     * Get device status (BLE-first/API-fallback, centralized)
     */
    getStatus(): Promise<VacuumStatus>;
    private getCommandForProtocol;
    private getAdvertisementStatusData;
    private asNumber;
    private asBoolean;
}
//# sourceMappingURL=wo-vacuum.d.ts.map