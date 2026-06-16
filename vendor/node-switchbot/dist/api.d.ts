import type { APICommandResponse, APIDevice, APIDeviceStatus, DeviceListResponse, SceneListResponse, WebhookConfig, WebhookQueryResponse, WebhookSetupResponse } from './types/api.js';
/**
 * OpenAPI Client for SwitchBot API v1.1
 */
export declare class OpenAPIClient {
    private token;
    private secret;
    private baseURL;
    private logger;
    constructor(token: string, secret: string, baseURL?: string, logLevel?: number);
    /**
     * Generate authentication headers for API requests
     */
    private generateHeaders;
    /**
     * Make an API request
     */
    private makeRequest;
    /**
     * Get all devices
     */
    getDevices(): Promise<DeviceListResponse>;
    /**
     * Get device status
     */
    getStatus(deviceId: string): Promise<APIDeviceStatus>;
    /**
     * Send command to device
     */
    sendCommand(deviceId: string, command: string, parameter?: any): Promise<APICommandResponse>;
    /**
     * Get all scenes
     */
    getScenes(): Promise<SceneListResponse>;
    /**
     * Execute a scene
     */
    executeScene(sceneId: string): Promise<void>;
    /**
     * Setup webhook
     */
    setupWebhook(config: WebhookConfig): Promise<WebhookSetupResponse>;
    /**
     * Query webhook configuration
     */
    queryWebhook(urls?: string[]): Promise<WebhookQueryResponse>;
    /**
     * Update webhook
     */
    updateWebhook(config: WebhookConfig): Promise<void>;
    /**
     * Delete webhook
     */
    deleteWebhook(url: string): Promise<void>;
    /**
     * Get specific device information
     */
    getDevice(deviceId: string): Promise<APIDevice | undefined>;
    /**
     * Get devices by type
     */
    getDevicesByType(deviceType: string): Promise<APIDevice[]>;
    /**
     * Check if device has cloud service enabled
     */
    isCloudServiceEnabled(deviceId: string): Promise<boolean>;
    /**
     * Bot-specific commands
     */
    botPress(deviceId: string): Promise<APICommandResponse>;
    botTurnOn(deviceId: string): Promise<APICommandResponse>;
    botTurnOff(deviceId: string): Promise<APICommandResponse>;
    /**
     * Curtain-specific commands
     */
    curtainOpen(deviceId: string, speed?: number): Promise<APICommandResponse>;
    curtainClose(deviceId: string, speed?: number): Promise<APICommandResponse>;
    curtainPause(deviceId: string): Promise<APICommandResponse>;
    curtainSetPosition(deviceId: string, position: number, speed?: number): Promise<APICommandResponse>;
    /**
     * Lock-specific commands
     */
    lockLock(deviceId: string): Promise<APICommandResponse>;
    lockUnlock(deviceId: string): Promise<APICommandResponse>;
    /**
     * Plug-specific commands
     */
    plugTurnOn(deviceId: string): Promise<APICommandResponse>;
    plugTurnOff(deviceId: string): Promise<APICommandResponse>;
    plugToggle(deviceId: string): Promise<APICommandResponse>;
    /**
     * Bulb/Light-specific commands
     */
    lightTurnOn(deviceId: string): Promise<APICommandResponse>;
    lightTurnOff(deviceId: string): Promise<APICommandResponse>;
    lightSetBrightness(deviceId: string, brightness: number): Promise<APICommandResponse>;
    lightSetColor(deviceId: string, red: number, green: number, blue: number): Promise<APICommandResponse>;
    lightSetColorTemperature(deviceId: string, temperature: number): Promise<APICommandResponse>;
    /**
     * Humidifier-specific commands
     */
    humidifierTurnOn(deviceId: string): Promise<APICommandResponse>;
    humidifierTurnOff(deviceId: string): Promise<APICommandResponse>;
    humidifierSetMode(deviceId: string, mode: 'auto' | 'manual'): Promise<APICommandResponse>;
    /**
     * Air Purifier-specific commands
     */
    airPurifierTurnOn(deviceId: string): Promise<APICommandResponse>;
    airPurifierTurnOff(deviceId: string): Promise<APICommandResponse>;
    airPurifierSetMode(deviceId: string, mode: 'auto' | 'manual' | 'sleep'): Promise<APICommandResponse>;
    airPurifierSetFanSpeed(deviceId: string, speed: number): Promise<APICommandResponse>;
    /**
     * Blind Tilt-specific commands
     */
    blindTiltOpen(deviceId: string): Promise<APICommandResponse>;
    blindTiltClose(deviceId: string): Promise<APICommandResponse>;
    blindTiltSetPosition(deviceId: string, position: number): Promise<APICommandResponse>;
    /**
     * Get client configuration
     */
    getConfig(): {
        token: string;
        baseURL: string;
    };
    /**
     * Update base URL
     */
    setBaseURL(newBaseURL: string): void;
}
//# sourceMappingURL=api.d.ts.map