/**
 * OpenAPI Response base
 */
export interface APIResponse<T = any> {
    statusCode: number;
    message: string;
    body: T;
}
/**
 * Device list response from OpenAPI
 */
export interface DeviceListResponse {
    deviceList: APIDevice[];
    infraredRemoteList?: APIInfraredRemote[];
}
/**
 * Device information from OpenAPI
 */
export interface APIDevice {
    deviceId: string;
    deviceName: string;
    deviceType: string;
    enableCloudService: boolean;
    hubDeviceId: string;
    curtainDevicesIds?: string[];
    calibrate?: boolean;
    openDirection?: 'left' | 'right';
    master?: boolean;
    group?: boolean;
    moving?: boolean;
    slidePosition?: number;
    version?: string;
    lockType?: 'unlatch' | 'latch';
    groupName?: string;
    keyList?: Array<{
        id: number;
        name: string;
        type: string;
        keyId: string;
        status: 'enabled' | 'disabled';
        createTime: number;
    }>;
}
/**
 * Infrared remote device from OpenAPI
 */
export interface APIInfraredRemote {
    deviceId: string;
    deviceName: string;
    remoteType: string;
    hubDeviceId: string;
}
/**
 * Device status from OpenAPI
 */
export interface APIDeviceStatus {
    deviceId: string;
    deviceType: string;
    hubDeviceId: string;
    power?: 'on' | 'off';
    version?: string;
    battery?: number;
    calibrate?: boolean;
    group?: boolean;
    moving?: boolean;
    slidePosition?: number;
    lockState?: 'locked' | 'unlocked' | 'jammed';
    doorState?: 'opened' | 'closed' | 'unknown';
    temperature?: number;
    humidity?: number;
    openState?: 'open' | 'closed' | 'timeout';
    moveDetected?: boolean;
    lightLevel?: number | 'bright' | 'dim' | 'dark';
    voltage?: number;
    weight?: number;
    electricityOfDay?: number;
    electricCurrent?: number;
    brightnessLevel?: number;
    color?: string;
    colorTemperature?: number;
    botMode?: 'press' | 'switch' | 'customize';
    nebulizationEfficiency?: number;
    auto?: boolean;
    childLock?: boolean;
    sound?: boolean;
    lackWater?: boolean;
    fanSpeed?: number;
    airMode?: 'auto' | 'manual' | 'sleep';
    pm25?: number;
    waterLeakDetected?: boolean;
}
/**
 * Command request to OpenAPI
 */
export interface APICommandRequest {
    command: string;
    parameter?: string | number | any;
    commandType?: string;
}
/**
 * Command response from OpenAPI
 */
export interface APICommandResponse {
    statusCode: number;
    message: string;
    body: any;
}
/**
 * Scene list response
 */
export interface SceneListResponse {
    sceneList: APIScene[];
}
/**
 * Scene from OpenAPI
 */
export interface APIScene {
    sceneId: string;
    sceneName: string;
}
/**
 * Webhook configuration
 */
export interface WebhookConfig {
    url: string;
    deviceList?: 'ALL' | string;
}
/**
 * Webhook setup response
 */
export interface WebhookSetupResponse {
    statusCode: number;
    message: string;
    body: any;
}
/**
 * Webhook query response
 */
export interface WebhookQueryResponse {
    statusCode: number;
    message: string;
    body: {
        urls: Array<{
            url: string;
            createTime: number;
            lastUpdateTime: number;
            deviceList: string;
        }>;
    };
}
/**
 * Webhook details
 */
export interface WebhookDetails {
    url: string;
    createTime: number;
    lastUpdateTime: number;
    deviceList: string;
    enable: boolean;
}
/**
 * OpenAPI error response
 */
export interface APIErrorResponse {
    statusCode: number;
    message: string;
    body?: any;
}
/**
 * OpenAPI request headers
 */
export interface APIHeaders {
    'Authorization': string;
    'Content-Type': string;
    't': string;
    'sign': string;
    'nonce': string;
}
/**
 * Physical device types supported by OpenAPI
 */
export type PhysicalDeviceType = 'Bot' | 'Curtain' | 'Curtain3' | 'Plug' | 'Plug Mini (US)' | 'Plug Mini (JP)' | 'Meter' | 'Meter Plus' | 'Meter Pro' | 'Meter Pro (CO2)' | 'Outdoor Meter' | 'Lock' | 'Lock Pro' | 'Keypad' | 'Keypad Touch' | 'Motion Sensor' | 'Contact Sensor' | 'Ceiling Light' | 'Ceiling Light Pro' | 'Strip Light' | 'Color Bulb' | 'Robot Vacuum Cleaner S1' | 'Robot Vacuum Cleaner S1 Plus' | 'Robot Vacuum Cleaner K10 Plus' | 'Humidifier' | 'Humidifier 2' | 'Blind Tilt' | 'Hub 2' | 'Hub Mini' | 'Hub Plus' | 'Remote' | 'Battery Circulator Fan' | 'Air Purifier' | 'Air Purifier Table' | 'Water Leak Detector' | 'Presence Sensor' | 'Relay Switch 1PM' | 'Relay Switch 1' | 'K10+ Pro Combo';
/**
 * Virtual/Infrared device types
 */
export type VirtualDeviceType = 'Air Conditioner' | 'TV' | 'Light' | 'IPTV/Streamer' | 'Set Top Box' | 'DVD' | 'Fan' | 'Projector' | 'Camera' | 'Air Purifier' | 'Speaker' | 'Water Heater' | 'Vacuum Cleaner' | 'Others';
//# sourceMappingURL=api.d.ts.map