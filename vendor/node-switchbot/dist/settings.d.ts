/**
 * Passive polling interval (24 hours)
 */
export declare const PASSIVE_POLL_INTERVAL: number;
/**
 * OpenAPI Configuration
 */
export declare const DEFAULT_BASE_URL = "https://api.switch-bot.com";
export declare const API_VERSION = "v1.1";
export declare const urls: {
    base: string;
    devices: string;
    scenes: string;
    webhook: string;
};
/**
 * Update the base URL for all API endpoints
 * @param newBaseURL - The new base URL to use
 */
export declare function updateBaseURL(newBaseURL: string): void;
/**
 * BLE Configuration
 */
export declare const BLE_SERVICE_UUID = "cba20d00224d11e69fb80002a5d5c51b";
export declare const BLE_WRITE_CHARACTERISTIC_UUID = "cba20002224d11e69fb80002a5d5c51b";
export declare const BLE_NOTIFY_CHARACTERISTIC_UUID = "cba20003224d11e69fb80002a5d5c51b";
export declare const SERV_UUID_PRIMARY = "cba20d00-224d-11e6-9fb8-0002a5d5c51b";
export declare const CHAR_UUID_WRITE = "cba20002-224d-11e6-9fb8-0002a5d5c51b";
export declare const CHAR_UUID_NOTIFY = "cba20003-224d-11e6-9fb8-0002a5d5c51b";
export declare const CHAR_UUID_DEVICE = "cba20d00-224d-11e6-9fb8-0002a5d5c51b";
/**
 * BLE Timeouts (in milliseconds)
 */
export declare const BLE_SCAN_TIMEOUT = 10000;
export declare const BLE_CONNECT_TIMEOUT = 10000;
export declare const BLE_COMMAND_TIMEOUT = 5000;
export declare const READ_TIMEOUT_MSEC = 10000;
export declare const WRITE_TIMEOUT_MSEC = 10000;
/**
 * Device Command Constants
 */
export declare const DEVICE_COMMANDS: {
    readonly BOT: {
        readonly PRESS: readonly [87, 1, 0];
        readonly TURN_ON: readonly [87, 1, 1];
        readonly TURN_OFF: readonly [87, 1, 2];
        readonly DOWN: readonly [87, 1, 1];
        readonly UP: readonly [87, 1, 2];
        readonly SET_MODE: readonly [87, 15, 71, 1];
        readonly SET_LONG_PRESS: readonly [87, 15, 71, 3];
    };
    readonly CURTAIN: {
        readonly OPEN: readonly [87, 15, 69, 1, 5, 255, 0];
        readonly CLOSE: readonly [87, 15, 69, 1, 5, 255, 100];
        readonly PAUSE: readonly [87, 15, 69, 1, 0, 255];
        readonly POSITION: readonly [87, 15, 69, 1, 5];
        readonly EXTENDED_INFO: readonly [87, 15, 70, 1];
    };
    readonly BLIND_TILT: {
        readonly OPEN: readonly [87, 15, 69, 1, 5, 255, 50];
        readonly CLOSE_UP: readonly [87, 15, 69, 1, 5, 255, 100];
        readonly CLOSE_DOWN: readonly [87, 15, 69, 1, 5, 255, 0];
        readonly PAUSE: readonly [87, 15, 69, 1, 0, 255];
    };
    readonly BULB: {
        readonly BASE: readonly [87, 15, 71, 1];
        readonly READ_STATE: readonly [87, 15, 72, 1];
        readonly TURN_ON: readonly [1, 1];
        readonly TURN_OFF: readonly [1, 2];
        readonly SET_BRIGHTNESS: readonly [2, 20];
        readonly SET_COLOR_TEMP: readonly [2, 23];
        readonly SET_RGB: readonly [2, 18];
        readonly SET_EFFECT: readonly [3];
    };
    readonly HUMIDIFIER: {
        readonly HEADER: "5701";
        readonly TURN_ON: "570101";
        readonly TURN_OFF: "570102";
        readonly INCREASE: "570103";
        readonly DECREASE: "570104";
        readonly SET_AUTO_MODE: "570105";
        readonly SET_MANUAL_MODE: "570106";
    };
    readonly AIR_PURIFIER: {
        readonly TURN_ON: readonly [87, 1, 1];
        readonly TURN_OFF: readonly [87, 1, 2];
        readonly SET_MODE: readonly [87, 2];
        readonly SET_SPEED: readonly [87, 3];
    };
    readonly VACUUM: {
        readonly CLEAN_UP: {
            readonly 1: readonly [87, 15, 90, 0, 255, 255, 112, 1];
            readonly 2: readonly [90, 64, 1, 1, 1, 1, 38];
        };
        readonly RETURN_TO_DOCK: {
            readonly 1: readonly [87, 15, 90, 0, 255, 255, 112, 2];
            readonly 2: readonly [90, 64, 1, 1, 1, 2, 37];
        };
    };
    readonly PLUG: {
        readonly TURN_ON: readonly [87, 15, 80, 1, 1];
        readonly TURN_OFF: readonly [87, 15, 80, 1, 2];
        readonly TOGGLE: readonly [87, 15, 80, 1, 0];
    };
    readonly RELAY: {
        readonly GET_BASIC_INFO: readonly [87, 2];
        readonly CHANNEL1_ON: readonly [87, 15, 80, 1, 1];
        readonly CHANNEL1_OFF: readonly [87, 15, 80, 1, 2];
        readonly CHANNEL2_ON: readonly [87, 15, 80, 2, 1];
        readonly CHANNEL2_OFF: readonly [87, 15, 80, 2, 2];
    };
    readonly COMMON: {
        readonly POWER_ON: readonly [87, 1, 1];
        readonly POWER_OFF: readonly [87, 1, 2];
    };
};
/**
 * Lock Command Constants (WoSmartLock)
 */
export declare const WoSmartLockCommands: {
    readonly LOCK: readonly [87, 15, 78, 1, 0];
    readonly UNLOCK: readonly [87, 15, 78, 1, 1];
};
/**
 * Lock Pro Command Constants (WoSmartLockPro)
 */
export declare const WoSmartLockProCommands: {
    readonly LOCK: readonly [87, 15, 79, 1, 0];
    readonly UNLOCK: readonly [87, 15, 79, 1, 1];
    readonly UNLATCH: readonly [87, 15, 79, 1, 2];
};
/**
 * Device Model to Type Mapping
 */
export declare const DEVICE_MODEL_MAP: Record<string, string>;
/**
 * Device Type to Class Name Mapping
 */
export declare const DEVICE_CLASS_MAP: Record<string, string>;
/**
 * Default configuration values
 */
export declare const DEFAULTS: {
    readonly logLevel: 2;
    readonly scanTimeout: 10000;
    readonly connectTimeout: 10000;
    readonly commandTimeout: 5000;
    readonly enableBLE: true;
    readonly enableFallback: true;
    readonly baseURL: "https://api.switch-bot.com";
    readonly enableConnectionIntelligence: true;
    readonly enableCircuitBreaker: true;
    readonly enableRetry: true;
    readonly maxRetryAttempts: 3;
    readonly retryInitialDelayMs: 100;
    readonly retryMaxDelayMs: 5000;
};
/**
 * Platform detection
 */
export declare const IS_LINUX: boolean;
export declare const IS_MACOS: boolean;
export declare const BLE_SUPPORTED: boolean;
//# sourceMappingURL=settings.d.ts.map