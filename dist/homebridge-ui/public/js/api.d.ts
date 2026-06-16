import './types.js';
export declare function fetchDevices(): Promise<any[]>;
/**
 * Validate and auto-correct device types in the config array before saving.
 * Returns an array of errors for devices that cannot be fixed.
 */
export declare function validateAndFixDeviceTypes(devices: Array<{
    deviceId: string;
    configDeviceName: string;
    configDeviceType: string;
}>): {
    deviceId: string;
    name: string;
    type: string;
}[];
export declare function syncParentPluginConfigFromDisk(autoSave?: boolean): Promise<boolean>;
export declare function fetchCredentialStatus(): Promise<any>;
export declare function saveCredentials(token: string, secret: string): Promise<any>;
export interface DiscoverRequestOptions {
    bleEnabled?: boolean;
    bleScanDurationSeconds?: number;
    bleTimeoutSeconds?: number;
}
export declare function discoverDevices(mode?: 'all' | 'ble' | 'openapi', options?: DiscoverRequestOptions): Promise<any[]>;
export declare function fetchBluetoothStatus(): Promise<{
    available: boolean;
    message: string;
}>;
export declare function testDeviceConnection(payload: {
    deviceId: string;
    connectionType?: string;
    address?: string;
}): Promise<{
    success: boolean;
    deviceId: string;
    method: string;
    latencyMs: number;
    message: string;
    state?: Record<string, any>;
}>;
export declare function addDevice(deviceId: string, name: string, type: string, options?: {
    address?: string;
    model?: string;
    rssi?: number;
    encryptionKey?: string;
    keyId?: string;
}): Promise<any>;
export declare function addDevicesInBulk(devices: Array<{
    deviceId: string;
    name: string;
    type: string;
    rssi?: number;
    address?: string;
    model?: string;
}>): Promise<any>;
export declare function normalizeBulkAddDevicesResponse(resp: any): any;
export declare function updateDevice(deviceId: string, configDeviceName?: string, configDeviceType?: string, options?: {
    refreshRate?: number;
    connectionPreference?: string;
    encryptionKey?: string;
    keyId?: string;
    room?: string;
    [key: string]: any;
}): Promise<any>;
export declare function deleteDevice(deviceId: string): Promise<any>;
export declare function deleteAllDevices(): Promise<any>;
//# sourceMappingURL=api.d.ts.map