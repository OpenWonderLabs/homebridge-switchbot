import type { Buffer } from 'node:buffer';
import type { DeviceStatus } from './index.js';
export type { DeviceStatus };
/**
 * Bot (WoHand) specific types
 */
export interface BotStatus extends DeviceStatus {
    power: 'on' | 'off';
    mode?: 'press' | 'switch' | 'customize';
}
export interface BotCommands {
    turnOn: () => Promise<boolean>;
    turnOff: () => Promise<boolean>;
    press: () => Promise<boolean>;
    setMode?: (mode: 'press' | 'switch') => Promise<import('./index.js').CommandResult>;
    setLongPress?: (duration: number) => Promise<boolean>;
    handUp?: () => Promise<boolean>;
    handDown?: () => Promise<boolean>;
}
/**
 * Curtain (WoCurtain) specific types
 */
export interface CurtainStatus extends DeviceStatus {
    position: number;
    calibrated?: boolean;
    moving?: boolean;
    direction?: 'opening' | 'closing';
    slidePosition?: number;
}
/**
 * Curtain extended info (device chain, grouped status)
 */
export interface CurtainExtendedInfo {
    deviceChain?: {
        masterDevice: string;
        slaveDevices: string[];
    };
    groupStatus?: {
        position: number;
        calibrated: boolean;
        moving: boolean;
    };
}
export interface CurtainCommands {
    open: (speed?: number) => Promise<boolean>;
    close: (speed?: number) => Promise<boolean>;
    pause: () => Promise<boolean>;
    setPosition: (position: number, speed?: number) => Promise<boolean>;
    getExtendedInfo?: () => Promise<CurtainExtendedInfo>;
    sendCommandSequence?: (commands: Array<() => Promise<boolean>>) => Promise<boolean>;
    sendMultipleCommands?: (commands: Array<() => Promise<boolean>>) => Promise<boolean>;
}
/**
 * Lock (WoSmartLock) specific types
 */
export interface LockStatus extends DeviceStatus {
    lockState: 'locked' | 'unlocked' | 'jammed';
    doorState?: 'opened' | 'closed';
    calibrated?: boolean;
}
export interface LockCommands {
    lock: () => Promise<boolean>;
    unlock: () => Promise<boolean>;
    unlockWithoutUnlatch?: () => Promise<boolean>;
    getLockInfo?: () => Promise<Record<string, unknown>>;
    onLockNotification?: (handler: (payload: Buffer) => void) => Promise<void>;
    offLockNotification?: (handler: (payload: Buffer) => void) => void;
}
/**
 * Meter (Temperature/Humidity) specific types
 */
export interface MeterStatus extends DeviceStatus {
    temperature: number;
    humidity: number;
    temperatureScale?: 'c' | 'f';
}
/**
 * Contact Sensor specific types
 */
export interface ContactStatus extends DeviceStatus {
    openState: 'open' | 'closed' | 'timeout';
    moveDetected?: boolean;
    brightness?: 'bright' | 'dim' | 'dark';
}
/**
 * Motion Sensor specific types
 */
export interface MotionStatus extends DeviceStatus {
    moveDetected: boolean;
    brightness?: 'bright' | 'dim' | 'dark';
}
/**
 * Plug specific types
 */
export interface PlugStatus extends DeviceStatus {
    power: 'on' | 'off';
    voltage?: number;
    electricCurrent?: number;
    electricityOfDay?: number;
}
export interface PlugCommands {
    turnOn: () => Promise<boolean>;
    turnOff: () => Promise<boolean>;
    toggle: () => Promise<boolean>;
}
/**
 * Bulb/Light specific types
 */
export interface BulbStatus extends DeviceStatus {
    power: 'on' | 'off';
    brightness?: number;
    colorTemperature?: number;
    color?: {
        r: number;
        g: number;
        b: number;
    };
}
export interface BulbCommands {
    turnOn: () => Promise<boolean>;
    turnOff: () => Promise<boolean>;
    setBrightness: (brightness: number) => Promise<boolean>;
    setColorTemperature: (temperature: number) => Promise<boolean>;
    setColor: (red: number, green: number, blue: number) => Promise<boolean>;
    setEffect?: (effectName: string, speed?: number) => Promise<boolean>;
    setColorTemp?: (minTemp: number, maxTemp: number, temp: number) => Promise<boolean>;
    sendCommandSequence?: (commands: Array<() => Promise<boolean>>) => Promise<boolean>;
    sendMultipleCommands?: (commands: Array<() => Promise<boolean>>) => Promise<boolean>;
}
/**
 * RGBIC Bulb specific types (segmented/multi-zone color control)
 */
export interface RGBICBulbStatus extends BulbStatus {
}
export interface RGBICBulbCommands extends BulbCommands {
    setSegmentColor?: (segmentId: number, red: number, green: number, blue: number) => Promise<boolean>;
    setSegmentEffect?: (segmentId: number, effectName: string, speed?: number) => Promise<boolean>;
}
/**
 * Strip Light specific types
 */
export interface StripStatus extends BulbStatus {
}
export interface StripCommands extends BulbCommands {
}
/**
 * Ceiling Light specific types
 */
export interface CeilingLightStatus extends BulbStatus {
}
export interface CeilingLightCommands extends BulbCommands {
}
/**
 * Blind Tilt specific types
 */
export interface BlindTiltStatus extends DeviceStatus {
    position: number;
    direction?: 'opening' | 'closing';
    moving?: boolean;
    calibrated?: boolean;
}
export interface BlindTiltCommands {
    open: () => Promise<boolean>;
    close: () => Promise<boolean>;
    closeUp: () => Promise<boolean>;
    closeDown: () => Promise<boolean>;
    pause: () => Promise<boolean>;
    setPosition: (position: number) => Promise<boolean>;
}
/**
 * Humidifier specific types
 */
export interface HumidifierStatus extends DeviceStatus {
    power: 'on' | 'off';
    humidity?: number;
    mode?: 'auto' | 'manual';
    nebulizationEfficiency?: number;
    lackWater?: boolean;
    temperature?: number;
}
export interface HumidifierCommands {
    turnOn: () => Promise<boolean>;
    turnOff: () => Promise<boolean>;
    setMode: (mode: 'auto' | 'manual') => Promise<import('./index.js').CommandResult>;
    setEfficiency: (level: number) => Promise<boolean>;
    setLevel?: (level: number) => Promise<boolean>;
    setAuto?: () => Promise<boolean>;
    setManual?: () => Promise<boolean>;
    getTargetLevel?: () => Promise<number | undefined>;
}
/**
 * Air Purifier specific types
 */
export interface AirPurifierStatus extends DeviceStatus {
    power: 'on' | 'off';
    fanSpeed?: number;
    mode?: 'auto' | 'manual' | 'sleep';
    pm25?: number;
    airQuality?: 'excellent' | 'good' | 'fair' | 'poor';
}
export interface AirPurifierCommands {
    turnOn: () => Promise<boolean>;
    turnOff: () => Promise<boolean>;
    setMode: (mode: 'auto' | 'manual' | 'sleep') => Promise<import('./index.js').CommandResult>;
    setFanSpeed: (speed: number) => Promise<boolean>;
    setPresetMode?: (mode: 'level_1' | 'level_2' | 'level_3' | 'auto' | 'sleep' | 'pet') => Promise<boolean>;
}
/**
 * Vacuum specific types
 */
export interface VacuumStatus extends DeviceStatus {
    battery?: number;
    workStatus?: number;
    dustbinBound?: boolean;
    dustbinConnected?: boolean;
    networkConnected?: boolean;
}
export interface VacuumCommands {
    cleanUp: (protocolVersion: number) => Promise<boolean>;
    returnToDock: (protocolVersion: number) => Promise<boolean>;
    getBattery?: () => number | undefined;
    getWorkStatus?: () => number | undefined;
    getDustbinBoundStatus?: () => boolean | undefined;
    getDustbinConnectedStatus?: () => boolean | undefined;
    getNetworkConnectedStatus?: () => boolean | undefined;
}
/**
 * Hub specific types
 */
export interface HubStatus extends DeviceStatus {
    temperature?: number;
    humidity?: number;
    lightLevel?: number;
}
/**
 * Leak Detector specific types
 */
export interface LeakStatus extends DeviceStatus {
    waterLeakDetected: boolean;
}
/**
 * Presence Sensor specific types
 */
export interface PresenceStatus extends DeviceStatus {
    moveDetected: boolean;
    brightness?: 'bright' | 'dim' | 'dark';
}
/**
 * Relay Switch specific types
 */
export interface RelaySwitchStatus extends DeviceStatus {
    power: 'on' | 'off';
    voltage?: number;
    electricCurrent?: number;
    electricityOfDay?: number;
}
export interface RelaySwitchCommands {
    turnOn: () => Promise<boolean>;
    turnOff: () => Promise<boolean>;
    toggle: () => Promise<boolean>;
    /**
     * Get current time and start time for energy tracking (Task 5.4)
     */
    getCurrentTimeAndStartTime?: () => Promise<{
        currentTime: Date;
        startTime: Date;
        [key: string]: any;
    }>;
}
/**
 * Relay Switch 2PM specific types (with channel-specific control)
 */
export interface RelaySwitchChannelCommands extends RelaySwitchCommands {
    setChannel1?: (state: boolean) => Promise<boolean>;
    setChannel2?: (state: boolean) => Promise<boolean>;
}
/**
 * Keypad specific types
 */
export interface KeypadStatus extends DeviceStatus {
    lockState?: 'locked' | 'unlocked';
}
/**
 * Remote specific types
 */
export interface RemoteStatus extends DeviceStatus {
}
//# sourceMappingURL=device.d.ts.map