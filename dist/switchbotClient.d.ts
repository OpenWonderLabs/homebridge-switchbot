import type { SwitchBotPluginConfig } from './settings.js';
export interface ISwitchBotClient {
    init: () => Promise<void>;
    getDevice: (id: string) => Promise<any>;
    getDevices: () => Promise<any[]>;
    setDeviceState: (id: string, body: any) => Promise<any>;
    destroy: () => Promise<void>;
}
/**
 * Thin wrapper around node-switchbot v4.0.0+
 * Leverages upstream resilience features (retry, circuit breaker, connection intelligence)
 * while maintaining plugin-specific features like write debouncing and OpenAPI fallback.
 */
export declare class SwitchBotClient implements ISwitchBotClient {
    private cfg;
    private client;
    private writeDebounceMs;
    private discoveryCacheTtlMs;
    private lastDiscoveryAt;
    private logger;
    private pendingWrites;
    constructor(cfg: SwitchBotPluginConfig);
    init(): Promise<void>;
    getDevice(id: string): Promise<any>;
    getDevices(): Promise<any[]>;
    setDeviceState(id: string, body: any): Promise<any>;
    private _doSetDeviceState;
    destroy(): Promise<void>;
    private resolveScanTimeoutMs;
    private getManagedDevice;
    private getManagedDevices;
    private ensureDiscovered;
}
//# sourceMappingURL=switchbotClient.d.ts.map