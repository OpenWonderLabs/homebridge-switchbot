declare global {
    interface Window {
        _discoverySelectedIds: Set<string>;
    }
}
export declare function initializeDiscoverySettings(): Promise<void>;
export declare function discoverDevices(): Promise<void>;
export declare function addDeviceToConfig(device: any): Promise<void>;
//# sourceMappingURL=discovery.d.ts.map