/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * devices/wo-vacuum.ts: SwitchBot v4.0.0 - Vacuum Device
 */
import { DEVICE_COMMANDS } from '../settings.js';
import { SequenceDevice } from './sequence-device.js';
/**
 * Vacuum Device
 */
export class WoVacuum extends SequenceDevice {
    /**
     * Start cleaning (BLE-first, API-fallback)
     */
    async cleanUp(protocolVersion) {
        // Validate protocol version first
        if (protocolVersion !== 1 && protocolVersion !== 2) {
            throw new Error(`Unsupported vacuum protocol version: ${protocolVersion}`);
        }
        // Try BLE first
        if (this.hasBLE()) {
            try {
                const command = this.getCommandForProtocol(DEVICE_COMMANDS.VACUUM.CLEAN_UP, protocolVersion);
                const result = await this.sendCommand(command, 'start', { protocolVersion });
                if (result.success) {
                    return true;
                }
            }
            catch (err) {
                this.logger.warn('BLE cleanUp failed, falling back to API', err);
            }
        }
        // Fallback to API
        if (this.hasAPI()) {
            const apiResult = await this.sendAPICommand('start', { protocolVersion });
            return apiResult.success;
        }
        throw new Error('No connection method available for cleanUp');
    }
    /**
     * Return to dock (BLE-first, API-fallback)
     */
    async returnToDock(protocolVersion) {
        // Validate protocol version first
        if (protocolVersion !== 1 && protocolVersion !== 2) {
            throw new Error(`Unsupported vacuum protocol version: ${protocolVersion}`);
        }
        // Try BLE first
        if (this.hasBLE()) {
            try {
                const command = this.getCommandForProtocol(DEVICE_COMMANDS.VACUUM.RETURN_TO_DOCK, protocolVersion);
                const result = await this.sendCommand(command, 'dock', { protocolVersion });
                if (result.success) {
                    return true;
                }
            }
            catch (err) {
                this.logger.warn('BLE returnToDock failed, falling back to API', err);
            }
        }
        // Fallback to API
        if (this.hasAPI()) {
            const apiResult = await this.sendAPICommand('dock', { protocolVersion });
            return apiResult.success;
        }
        throw new Error('No connection method available for returnToDock');
    }
    /**
     * Return advertised battery value
     */
    getBattery() {
        const data = this.getAdvertisementStatusData();
        return this.asNumber(data.battery);
    }
    /**
     * Return advertised work status value
     */
    getWorkStatus() {
        const data = this.getAdvertisementStatusData();
        return this.asNumber(data.workStatus ?? data.work_status);
    }
    /**
     * Return advertised dustbin bound state
     */
    getDustbinBoundStatus() {
        const data = this.getAdvertisementStatusData();
        return this.asBoolean(data.dustbinBound ?? data.dustbin_bound);
    }
    /**
     * Return advertised dustbin connected state
     */
    getDustbinConnectedStatus() {
        const data = this.getAdvertisementStatusData();
        return this.asBoolean(data.dustbinConnected ?? data.dusbin_connected);
    }
    /**
     * Return advertised network connected state
     */
    getNetworkConnectedStatus() {
        const data = this.getAdvertisementStatusData();
        return this.asBoolean(data.networkConnected ?? data.network_connected);
    }
    /**
     * Get device status (BLE-first/API-fallback, centralized)
     */
    async getStatus() {
        return this.getStatusWithFallback(bleData => ({
            deviceId: this.info.id,
            connectionType: 'ble',
            battery: this.asNumber(bleData.battery),
            workStatus: this.asNumber(bleData.workStatus ?? bleData.work_status),
            dustbinBound: this.asBoolean(bleData.dustbinBound ?? bleData.dustbin_bound),
            dustbinConnected: this.asBoolean(bleData.dustbinConnected ?? bleData.dusbin_connected),
            networkConnected: this.asBoolean(bleData.networkConnected ?? bleData.network_connected),
            updatedAt: new Date(),
        }), apiStatus => ({
            deviceId: this.info.id,
            connectionType: 'api',
            battery: apiStatus.battery,
            workStatus: apiStatus.workStatus ?? apiStatus.work_status,
            dustbinBound: apiStatus.dustbinBound ?? apiStatus.dustbin_bound,
            dustbinConnected: apiStatus.dustbinConnected ?? apiStatus.dusbin_connected,
            networkConnected: apiStatus.networkConnected ?? apiStatus.network_connected,
            version: apiStatus.version,
            updatedAt: new Date(),
        }));
    }
    getCommandForProtocol(commands, protocolVersion) {
        if (protocolVersion !== 1 && protocolVersion !== 2) {
            throw new Error(`Unsupported vacuum protocol version: ${protocolVersion}`);
        }
        return commands[protocolVersion];
    }
    getAdvertisementStatusData() {
        return this.normalizeBLEStatusData(undefined);
    }
    asNumber(value) {
        return typeof value === 'number' ? value : undefined;
    }
    asBoolean(value) {
        return typeof value === 'boolean' ? value : undefined;
    }
}
//# sourceMappingURL=wo-vacuum.js.map