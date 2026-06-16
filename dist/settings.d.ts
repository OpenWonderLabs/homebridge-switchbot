export declare const PLUGIN_NAME = "@switchbot/homebridge-switchbot";
export declare const PLATFORM_NAME = "SwitchBot";
export interface SwitchBotPluginConfig {
    openApiToken?: string;
    openApiSecret?: string;
    preferMatter?: boolean;
    enableMatter?: boolean;
    enableBLE?: boolean;
    [key: string]: any;
}
export declare const DEFAULT_CONFIG: Partial<SwitchBotPluginConfig>;
export type DeviceType = string;
//# sourceMappingURL=settings.d.ts.map