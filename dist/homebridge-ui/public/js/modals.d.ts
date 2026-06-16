export type ImportDiscoveredDeviceResult = {
    configDeviceName: string;
    configDeviceType: string;
    address?: string;
    connectionPreference?: string;
    room?: string;
    encryptionKey?: string;
    keyId?: string;
    refreshRate?: number;
    blePollingEnabled?: boolean;
    blePollIntervalMs?: number;
} | null;
export declare function importDiscoveredDevice(device: any): Promise<ImportDiscoveredDeviceResult>;
export declare function editDevice(device: any): Promise<void>;
//# sourceMappingURL=modals.d.ts.map