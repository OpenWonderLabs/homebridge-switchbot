/**
 * Passive polling interval (24 hours)
 */
// ms
/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * settings.ts: SwitchBot v4.0.0 - Configuration and Constants
 */
import process from 'node:process';
export const PASSIVE_POLL_INTERVAL = 60 * 60 * 24 * 1000;
/**
 * OpenAPI Configuration
 */
export const DEFAULT_BASE_URL = 'https://api.switch-bot.com';
export const API_VERSION = 'v1.1';
export const urls = {
    base: DEFAULT_BASE_URL,
    devices: `${DEFAULT_BASE_URL}/${API_VERSION}/devices`,
    scenes: `${DEFAULT_BASE_URL}/${API_VERSION}/scenes`,
    webhook: `${DEFAULT_BASE_URL}/${API_VERSION}/webhook`,
};
/**
 * Update the base URL for all API endpoints
 * @param newBaseURL - The new base URL to use
 */
export function updateBaseURL(newBaseURL) {
    urls.base = newBaseURL;
    urls.devices = `${newBaseURL}/${API_VERSION}/devices`;
    urls.scenes = `${newBaseURL}/${API_VERSION}/scenes`;
    urls.webhook = `${newBaseURL}/${API_VERSION}/webhook`;
}
/**
 * BLE Configuration
 */
export const BLE_SERVICE_UUID = 'cba20d00224d11e69fb80002a5d5c51b';
export const BLE_WRITE_CHARACTERISTIC_UUID = 'cba20002224d11e69fb80002a5d5c51b';
export const BLE_NOTIFY_CHARACTERISTIC_UUID = 'cba20003224d11e69fb80002a5d5c51b';
// Alternative UUIDs for specific devices
export const SERV_UUID_PRIMARY = 'cba20d00-224d-11e6-9fb8-0002a5d5c51b';
export const CHAR_UUID_WRITE = 'cba20002-224d-11e6-9fb8-0002a5d5c51b';
export const CHAR_UUID_NOTIFY = 'cba20003-224d-11e6-9fb8-0002a5d5c51b';
export const CHAR_UUID_DEVICE = 'cba20d00-224d-11e6-9fb8-0002a5d5c51b';
/**
 * BLE Timeouts (in milliseconds)
 */
export const BLE_SCAN_TIMEOUT = 10000;
export const BLE_CONNECT_TIMEOUT = 10000;
export const BLE_COMMAND_TIMEOUT = 5000;
export const READ_TIMEOUT_MSEC = 10000;
export const WRITE_TIMEOUT_MSEC = 10000;
/**
 * Device Command Constants
 */
export const DEVICE_COMMANDS = {
    // Bot (WoHand)
    BOT: {
        PRESS: [0x57, 0x01, 0x00],
        TURN_ON: [0x57, 0x01, 0x01],
        TURN_OFF: [0x57, 0x01, 0x02],
        DOWN: [0x57, 0x01, 0x01],
        UP: [0x57, 0x01, 0x02],
        SET_MODE: [0x57, 0x0F, 0x47, 0x01],
        SET_LONG_PRESS: [0x57, 0x0F, 0x47, 0x03],
    },
    // Curtain (WoCurtain)
    CURTAIN: {
        OPEN: [0x57, 0x0F, 0x45, 0x01, 0x05, 0xFF, 0x00],
        CLOSE: [0x57, 0x0F, 0x45, 0x01, 0x05, 0xFF, 0x64],
        PAUSE: [0x57, 0x0F, 0x45, 0x01, 0x00, 0xFF],
        POSITION: [0x57, 0x0F, 0x45, 0x01, 0x05], // Append mode byte and position byte
        EXTENDED_INFO: [0x57, 0x0F, 0x46, 0x01], // Get device chain and grouped status
    },
    // Blind Tilt
    BLIND_TILT: {
        OPEN: [0x57, 0x0F, 0x45, 0x01, 0x05, 0xFF, 0x32],
        CLOSE_UP: [0x57, 0x0F, 0x45, 0x01, 0x05, 0xFF, 0x64],
        CLOSE_DOWN: [0x57, 0x0F, 0x45, 0x01, 0x05, 0xFF, 0x00],
        PAUSE: [0x57, 0x0F, 0x45, 0x01, 0x00, 0xFF],
    },
    // Bulb (WoBulb)
    BULB: {
        BASE: [0x57, 0x0F, 0x47, 0x01],
        READ_STATE: [0x57, 0x0F, 0x48, 0x01],
        TURN_ON: [0x01, 0x01],
        TURN_OFF: [0x01, 0x02],
        SET_BRIGHTNESS: [0x02, 0x14], // Add brightness byte
        SET_COLOR_TEMP: [0x02, 0x17], // Add temp bytes
        SET_RGB: [0x02, 0x12], // Add RGB bytes
        SET_EFFECT: [0x03],
    },
    // Humidifier
    HUMIDIFIER: {
        HEADER: '5701',
        TURN_ON: '570101',
        TURN_OFF: '570102',
        INCREASE: '570103',
        DECREASE: '570104',
        SET_AUTO_MODE: '570105',
        SET_MANUAL_MODE: '570106',
    },
    // Air Purifier
    AIR_PURIFIER: {
        TURN_ON: [0x57, 0x01, 0x01],
        TURN_OFF: [0x57, 0x01, 0x02],
        SET_MODE: [0x57, 0x02], // Add mode byte
        SET_SPEED: [0x57, 0x03], // Add speed byte
    },
    // Vacuum
    VACUUM: {
        CLEAN_UP: {
            1: [0x57, 0x0F, 0x5A, 0x00, 0xFF, 0xFF, 0x70, 0x01],
            2: [0x5A, 0x40, 0x01, 0x01, 0x01, 0x01, 0x26],
        },
        RETURN_TO_DOCK: {
            1: [0x57, 0x0F, 0x5A, 0x00, 0xFF, 0xFF, 0x70, 0x02],
            2: [0x5A, 0x40, 0x01, 0x01, 0x01, 0x02, 0x25],
        },
    },
    // Plug
    PLUG: {
        TURN_ON: [0x57, 0x0F, 0x50, 0x01, 0x01],
        TURN_OFF: [0x57, 0x0F, 0x50, 0x01, 0x02],
        TOGGLE: [0x57, 0x0F, 0x50, 0x01, 0x00],
    },
    RELAY: {
        GET_BASIC_INFO: [0x57, 0x02],
        CHANNEL1_ON: [0x57, 0x0F, 0x50, 0x01, 0x01],
        CHANNEL1_OFF: [0x57, 0x0F, 0x50, 0x01, 0x02],
        CHANNEL2_ON: [0x57, 0x0F, 0x50, 0x02, 0x01],
        CHANNEL2_OFF: [0x57, 0x0F, 0x50, 0x02, 0x02],
    },
    // Common commands
    COMMON: {
        POWER_ON: [0x57, 0x01, 0x01],
        POWER_OFF: [0x57, 0x01, 0x02],
    },
};
/**
 * Lock Command Constants (WoSmartLock)
 */
export const WoSmartLockCommands = {
    LOCK: [0x57, 0x0F, 0x4E, 0x01, 0x00],
    UNLOCK: [0x57, 0x0F, 0x4E, 0x01, 0x01],
};
/**
 * Lock Pro Command Constants (WoSmartLockPro)
 */
export const WoSmartLockProCommands = {
    LOCK: [0x57, 0x0F, 0x4F, 0x01, 0x00],
    UNLOCK: [0x57, 0x0F, 0x4F, 0x01, 0x01],
    UNLATCH: [0x57, 0x0F, 0x4F, 0x01, 0x02],
};
/**
 * Device Model to Type Mapping
 */
export const DEVICE_MODEL_MAP = {
    'H': 'Bot',
    'c': 'Curtain',
    '{': 'Curtain3',
    'g': 'Plug',
    'j': 'Plug Mini (US)',
    'T': 'Meter',
    'i': 'Meter Plus',
    'o': 'Lock',
    '\x11': 'Lock Pro',
    'k': 'Keypad',
    '\x0B': 'Keypad Touch',
    's': 'Motion Sensor',
    'd': 'Contact Sensor',
    'q': 'Ceiling Light',
    'r': 'Ceiling Light Pro',
    'p': 'Strip Light',
    'u': 'Color Bulb',
    '\x0A': 'Robot Vacuum Cleaner S1',
    '\x0C': 'Robot Vacuum Cleaner S1 Plus',
    '\x0F': 'Robot Vacuum Cleaner K10 Plus',
    'e': 'Humidifier',
    '\x07': 'Humidifier 2',
    'x': 'Blind Tilt',
    '\x01': 'Hub 2',
    '\x02': 'Hub 3',
    '\x05': 'Remote',
    '\x04': 'Battery Circulator Fan',
    '\x08': 'Air Purifier',
    '\x09': 'Air Purifier Table',
    'y': 'Water Leak Detector',
    '\x06': 'Presence Sensor',
    '\x0D': 'Relay Switch 1PM',
    '\x0E': 'Relay Switch 1',
    '\x10': 'K10+ Pro Combo',
    'w': 'Meter Pro (CO2)',
    'n': 'Outdoor Meter',
};
/**
 * Device Type to Class Name Mapping
 */
export const DEVICE_CLASS_MAP = {
    'Bot': 'WoHand',
    'Curtain': 'WoCurtain',
    'Curtain3': 'WoCurtain',
    'Roller Shade': 'WoRollerShade',
    'SwitchBot Roller Shade': 'WoRollerShade',
    'Plug': 'WoPlugMiniUS',
    'WoPlugUS': 'WoPlugMiniUS',
    'Plug Mini (US)': 'WoPlugMiniUS',
    'Plug Mini (JP)': 'WoPlugMiniJP',
    'Plug Mini (EU)': 'WoPlugMiniEU',
    'Meter': 'WoSensorTH',
    'Meter Plus': 'WoSensorTHPlus',
    'Meter Pro': 'WoSensorTHPro',
    'Meter Pro (CO2)': 'WoSensorTHProCO2',
    'Outdoor Meter': 'WoIOSensorTH',
    'Lock': 'WoSmartLock',
    'Lock Lite': 'WoSmartLockLite',
    'Lock Pro': 'WoSmartLockPro',
    'Lock Pro WiFi': 'WoSmartLockProWiFi',
    'Lock Vision': 'WoSmartLockVision',
    'Lock Vision Pro': 'WoSmartLockVisionPro',
    'Keypad': 'WoKeypad',
    'Keypad Touch': 'WoKeypad',
    'Keypad Vision': 'WoKeypadVision',
    'SwitchBot Keypad Vision': 'WoKeypadVision',
    'Keypad Vision Pro': 'WoKeypadVisionPro',
    'SwitchBot Keypad Vision Pro': 'WoKeypadVisionPro',
    'Motion Sensor': 'WoPresence',
    'Contact Sensor': 'WoContact',
    'Ceiling Light': 'WoCeilingLight',
    'Ceiling Light Pro': 'WoCeilingLight',
    'Strip Light': 'WoStrip',
    'Strip Light 3': 'WoStripLight3',
    'SwitchBot Strip Light 3': 'WoStripLight3',
    'Color Bulb': 'WoBulb',
    'Floor Lamp': 'WoFloorLamp',
    'SwitchBot Floor Lamp': 'WoFloorLamp',
    'RGBICWW Strip Light': 'WoRGBICWWStripLight',
    'SwitchBot RGBICWW Strip Light': 'WoRGBICWWStripLight',
    'RGBICWW Floor Lamp': 'WoRGBICWWFloorLamp',
    'SwitchBot RGBICWW Floor Lamp': 'WoRGBICWWFloorLamp',
    'Art Frame': 'WoArtFrame',
    'SwitchBot Art Frame': 'WoArtFrame',
    'Robot Vacuum Cleaner S1': 'WoVacuumS10',
    'Robot Vacuum Cleaner S1 Plus': 'WoVacuumS20',
    'Robot Vacuum Cleaner K10 Plus': 'WoVacuumK10Plus',
    'Robot Vacuum Cleaner K10+': 'WoVacuumK10Plus',
    'Robot Vacuum Cleaner K10+ Pro': 'WoVacuumK10Pro',
    'Robot Vacuum Cleaner K11+': 'WoVacuumK11Plus',
    'Robot Vacuum Cleaner K20': 'WoVacuumK20',
    'Robot Vacuum Cleaner S10': 'WoVacuumS10',
    'Robot Vacuum Cleaner S20': 'WoVacuumS20',
    'Humidifier': 'WoHumi',
    'Humidifier 2': 'WoHumi2',
    'Evaporative Humidifier': 'WoHumi2',
    'Evaporative Humidifier (Auto-refill)': 'WoHumi2',
    'SwitchBot Evaporative Humidifier (Auto-refill)': 'WoHumi2',
    'Blind Tilt': 'WoBlindTilt',
    'Hub 2': 'WoHub2',
    'Hub 3': 'WoHub3',
    'SwitchBot Hub 3': 'WoHub3',
    'Hub Mini': 'WoHub2',
    'HubMini Matter': 'WoHubMiniMatter',
    'SwitchBot HubMini Matter': 'WoHubMiniMatter',
    'Hub Plus': 'WoHub2',
    'Remote': 'WoRemote',
    'Battery Circulator Fan': 'WoCirculatorFan',
    'Circulator Fan': 'WoCirculatorFan',
    'USB Circulator Fan': 'WoCirculatorFan',
    'Smart Thermostat Radiator': 'WoSmartThermostatRadiator',
    'Thermostat Radiator': 'WoSmartThermostatRadiator',
    'Radiator Thermostat': 'WoSmartThermostatRadiator',
    'Climate Panel': 'WoClimatePanel',
    'Smart Climate Panel': 'WoClimatePanel',
    'Air Purifier': 'WoAirPurifier',
    'Air Purifier Table': 'WoAirPurifierTable',
    'Water Leak Detector': 'WoLeak',
    'Presence Sensor': 'WoPresence',
    'Relay Switch 1PM': 'WoRelaySwitch1PM',
    'Relay Switch 1': 'WoRelaySwitch1',
    'Relay Switch 2PM': 'WoRelaySwitch2PM',
    'Garage Door Opener': 'WoGarageDoorOpener',
    'K10+ Pro Combo': 'WoVacuumK10ProCombo',
    'Robot Vacuum Cleaner K10+ Pro Combo': 'WoVacuumK10ProCombo',
    // User-reported unknown device types
    'Air Purifier PM2.5': 'WoAirPurifierPM25',
    'K10+': 'WoVacuumK10Plus',
    'K10+ Pro': 'WoVacuumK10Pro',
    'RGBIC Neon Wire Rope Light': 'WoRGBICNeonWireRopeLight',
    'Candle Warmer Lamp': 'WoCandleWarmerLamp',
    'Pan/Tilt Cam Plus 3K': 'WoPanTiltCamPlus3K',
    'remote with screen': 'WoRemoteWithScreen',
    'AI Hub': 'WoAIHub',
    'Water Detector': 'WoWaterDetector',
};
/**
 * Default configuration values
 */
export const DEFAULTS = {
    logLevel: 2, // WARN
    scanTimeout: BLE_SCAN_TIMEOUT,
    connectTimeout: BLE_CONNECT_TIMEOUT,
    commandTimeout: BLE_COMMAND_TIMEOUT,
    enableBLE: true,
    enableFallback: true,
    baseURL: DEFAULT_BASE_URL,
    enableConnectionIntelligence: true,
    enableCircuitBreaker: true,
    enableRetry: true,
    maxRetryAttempts: 3,
    retryInitialDelayMs: 100,
    retryMaxDelayMs: 5000,
};
/**
 * Platform detection
 */
export const IS_LINUX = process.platform === 'linux';
export const IS_MACOS = process.platform === 'darwin';
export const BLE_SUPPORTED = IS_LINUX || IS_MACOS;
//# sourceMappingURL=settings.js.map