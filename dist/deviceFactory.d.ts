import type { Logger } from 'homebridge';
import type { DeviceType, SwitchBotPluginConfig } from './settings.js';
export interface DeviceOptions {
    id: string;
    type: DeviceType;
    name?: string;
    [key: string]: any;
}
export declare function createDevice(opts: DeviceOptions, cfg: SwitchBotPluginConfig, useMatter: boolean, log?: Logger): Promise<{
    instance: any;
    createAccessory: (api: any) => any;
    protocol: string;
}>;
//# sourceMappingURL=deviceFactory.d.ts.map