/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * api.ts: SwitchBot v4.0.0 - OpenAPI Client
 */
import { request } from 'undici';
import { urls } from './settings.js';
import { createSignature, generateNonce, generateTimestamp, Logger } from './utils/index.js';
/**
 * OpenAPI Client for SwitchBot API v1.1
 */
export class OpenAPIClient {
    token;
    secret;
    baseURL;
    logger;
    constructor(token, secret, baseURL = urls.base, logLevel) {
        this.token = token;
        this.secret = secret;
        this.baseURL = baseURL;
        this.logger = new Logger('OpenAPIClient', logLevel);
        if (!token || !secret) {
            throw new Error('OpenAPI token and secret are required');
        }
    }
    /**
     * Generate authentication headers for API requests
     */
    async generateHeaders() {
        const timestamp = generateTimestamp();
        const nonce = generateNonce();
        const sign = await createSignature(this.token, this.secret, timestamp, nonce);
        return {
            'Authorization': this.token,
            'Content-Type': 'application/json',
            't': timestamp,
            'sign': sign,
            'nonce': nonce,
        };
    }
    /**
     * Make an API request
     */
    async makeRequest(method, path, body) {
        const headers = await this.generateHeaders();
        const url = `${this.baseURL}${path}`;
        this.logger.debug(`${method} ${url}`, body ? { body } : {});
        try {
            const response = await request(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
            });
            const data = await response.body.json();
            if (data.statusCode !== 100 && data.statusCode !== 200) {
                this.logger.error('API request failed', data);
                throw new Error(`API Error ${data.statusCode}: ${data.message}`);
            }
            this.logger.debug('API response', data);
            return data;
        }
        catch (error) {
            this.logger.error('API request error', error);
            throw error;
        }
    }
    /**
     * Get all devices
     */
    async getDevices() {
        const response = await this.makeRequest('GET', '/v1.1/devices');
        return response.body;
    }
    /**
     * Get device status
     */
    async getStatus(deviceId) {
        const response = await this.makeRequest('GET', `/v1.1/devices/${deviceId}/status`);
        return response.body;
    }
    /**
     * Send command to device
     */
    async sendCommand(deviceId, command, parameter) {
        const body = {
            command,
            parameter: parameter !== undefined ? parameter : 'default',
        };
        const response = await this.makeRequest('POST', `/v1.1/devices/${deviceId}/commands`, body);
        return {
            statusCode: response.statusCode,
            message: response.message,
            body: response.body,
        };
    }
    /**
     * Get all scenes
     */
    async getScenes() {
        const response = await this.makeRequest('GET', '/v1.1/scenes');
        return response.body;
    }
    /**
     * Execute a scene
     */
    async executeScene(sceneId) {
        await this.makeRequest('POST', `/v1.1/scenes/${sceneId}/execute`);
    }
    /**
     * Setup webhook
     */
    async setupWebhook(config) {
        const response = await this.makeRequest('POST', '/v1.1/webhook/setupWebhook', config);
        return {
            statusCode: response.statusCode,
            message: response.message,
            body: response.body,
        };
    }
    /**
     * Query webhook configuration
     */
    async queryWebhook(urls) {
        const body = urls ? { urls } : {};
        const response = await this.makeRequest('POST', '/v1.1/webhook/queryWebhook', body);
        return {
            statusCode: response.statusCode,
            message: response.message,
            body: response.body,
        };
    }
    /**
     * Update webhook
     */
    async updateWebhook(config) {
        await this.makeRequest('POST', '/v1.1/webhook/updateWebhook', config);
    }
    /**
     * Delete webhook
     */
    async deleteWebhook(url) {
        await this.makeRequest('POST', '/v1.1/webhook/deleteWebhook', { url });
    }
    /**
     * Get specific device information
     */
    async getDevice(deviceId) {
        const devices = await this.getDevices();
        return devices.deviceList.find(d => d.deviceId === deviceId);
    }
    /**
     * Get devices by type
     */
    async getDevicesByType(deviceType) {
        const devices = await this.getDevices();
        return devices.deviceList.filter(d => d.deviceType === deviceType);
    }
    /**
     * Check if device has cloud service enabled
     */
    async isCloudServiceEnabled(deviceId) {
        const device = await this.getDevice(deviceId);
        return device?.enableCloudService ?? false;
    }
    /**
     * Bot-specific commands
     */
    async botPress(deviceId) {
        return this.sendCommand(deviceId, 'press');
    }
    async botTurnOn(deviceId) {
        return this.sendCommand(deviceId, 'turnOn');
    }
    async botTurnOff(deviceId) {
        return this.sendCommand(deviceId, 'turnOff');
    }
    /**
     * Curtain-specific commands
     */
    async curtainOpen(deviceId, speed = 255) {
        const clampedSpeed = Math.min(255, Math.max(1, speed));
        return this.sendCommand(deviceId, 'setPosition', `0,${clampedSpeed.toString(16).padStart(2, '0')},0`);
    }
    async curtainClose(deviceId, speed = 255) {
        const clampedSpeed = Math.min(255, Math.max(1, speed));
        return this.sendCommand(deviceId, 'setPosition', `0,${clampedSpeed.toString(16).padStart(2, '0')},100`);
    }
    async curtainPause(deviceId) {
        return this.sendCommand(deviceId, 'pause');
    }
    async curtainSetPosition(deviceId, position, speed = 255) {
        const clampedSpeed = Math.min(255, Math.max(1, speed));
        return this.sendCommand(deviceId, 'setPosition', `0,${clampedSpeed.toString(16).padStart(2, '0')},${position}`);
    }
    /**
     * Lock-specific commands
     */
    async lockLock(deviceId) {
        return this.sendCommand(deviceId, 'lock');
    }
    async lockUnlock(deviceId) {
        return this.sendCommand(deviceId, 'unlock');
    }
    /**
     * Plug-specific commands
     */
    async plugTurnOn(deviceId) {
        return this.sendCommand(deviceId, 'turnOn');
    }
    async plugTurnOff(deviceId) {
        return this.sendCommand(deviceId, 'turnOff');
    }
    async plugToggle(deviceId) {
        return this.sendCommand(deviceId, 'toggle');
    }
    /**
     * Bulb/Light-specific commands
     */
    async lightTurnOn(deviceId) {
        return this.sendCommand(deviceId, 'turnOn');
    }
    async lightTurnOff(deviceId) {
        return this.sendCommand(deviceId, 'turnOff');
    }
    async lightSetBrightness(deviceId, brightness) {
        return this.sendCommand(deviceId, 'setBrightness', brightness);
    }
    async lightSetColor(deviceId, red, green, blue) {
        return this.sendCommand(deviceId, 'setColor', `${red}:${green}:${blue}`);
    }
    async lightSetColorTemperature(deviceId, temperature) {
        return this.sendCommand(deviceId, 'setColorTemperature', temperature);
    }
    /**
     * Humidifier-specific commands
     */
    async humidifierTurnOn(deviceId) {
        return this.sendCommand(deviceId, 'turnOn');
    }
    async humidifierTurnOff(deviceId) {
        return this.sendCommand(deviceId, 'turnOff');
    }
    async humidifierSetMode(deviceId, mode) {
        return this.sendCommand(deviceId, 'setMode', mode === 'auto' ? 'auto' : '101');
    }
    /**
     * Air Purifier-specific commands
     */
    async airPurifierTurnOn(deviceId) {
        return this.sendCommand(deviceId, 'turnOn');
    }
    async airPurifierTurnOff(deviceId) {
        return this.sendCommand(deviceId, 'turnOff');
    }
    async airPurifierSetMode(deviceId, mode) {
        return this.sendCommand(deviceId, 'setMode', mode);
    }
    async airPurifierSetFanSpeed(deviceId, speed) {
        return this.sendCommand(deviceId, 'setFanSpeed', speed);
    }
    /**
     * Blind Tilt-specific commands
     */
    async blindTiltOpen(deviceId) {
        return this.sendCommand(deviceId, 'setPosition', '0,ff,0');
    }
    async blindTiltClose(deviceId) {
        return this.sendCommand(deviceId, 'setPosition', '0,ff,100');
    }
    async blindTiltSetPosition(deviceId, position) {
        return this.sendCommand(deviceId, 'setPosition', `0,ff,${position}`);
    }
    /**
     * Get client configuration
     */
    getConfig() {
        return {
            token: this.token,
            baseURL: this.baseURL,
        };
    }
    /**
     * Update base URL
     */
    setBaseURL(newBaseURL) {
        this.baseURL = newBaseURL;
        this.logger.info(`Base URL updated to ${newBaseURL}`);
    }
}
//# sourceMappingURL=api.js.map