/**
 * Status Update Strategy for BLE and OpenAPI
 *
 * BLE (Bluetooth Low Energy):
 * - Primary: Subscribes to device notifications for real-time state updates using _subscribeBLENotifications().
 * - Fallback: (Recommended) Optionally, a low-frequency polling timer (e.g., every 5–10 minutes) can call getState() to recover from missed notifications or connection loss.
 *   - This ensures state stays in sync even if notifications are unreliable or the device reconnects.
 *   - Polling should be infrequent to avoid battery drain and BLE congestion.
 *
 * BLE Polling Options (config & per-device):
 * - blePollingEnabled (boolean): Enable/disable BLE polling fallback (default: true).
 * - blePollIntervalMs (integer): Polling interval in ms (default: 600000, min: 60000).
 *   - These can be set globally in config or overridden per device.
 *   - Setting a lower interval increases update frequency but may drain battery faster.
 *   - Setting a higher interval reduces battery impact but may delay state recovery.
 *
 * OpenAPI (Cloud):
 * - Uses periodic polling to fetch device status at a configurable interval (default: 300 seconds, can be set per device or platform).
 * - Platform supports batched refresh (matterBatchEnabled, matterBatchRefreshRate, etc.) and per-device refreshRate overrides.
 * - Rate limiting:
 *   - Default daily limit: 10,000 OpenAPI requests (configurable via options.dailyApiLimit).
 *   - Reserve: 1,000 requests for user commands (options.dailyApiReserveForCommands).
 *   - When the remaining budget reaches the reserve, background polling/discovery pauses, but user commands and webhooks continue.
 *   - Counter resets at local or UTC midnight (options.dailyApiResetLocalMidnight).
 *
 * Best Practices:
 * - BLE: Use notifications for instant updates, add periodic polling as a safety net.
 * - OpenAPI: Tune polling intervals to balance freshness and rate limit budget.
 * - Both: Document and expose polling intervals and rate limit settings in config.
 *
 * See README.md and docs for more details.
 */
import type { SwitchBotPluginConfig } from '../settings.js';
import { Buffer } from 'node:buffer';
import { DeviceBase } from './deviceBase.js';
export declare class GenericDevice extends DeviceBase {
    protected log: import('homebridge').Logger;
    private _blePollTimer;
    private _blePollIntervalMs;
    private _blePollingEnabled;
    constructor(opts: any, cfg: SwitchBotPluginConfig);
    /**
     * Start periodic BLE polling as a fallback to notifications.
     */
    private _startBlePolling;
    /**
     * Clean up BLE polling timer on destroy.
     */
    destroy(): Promise<void>;
    /**
     * Subscribe to BLE notifications for this device (if supported by node-switchbot)
     * Logs unsolicited notifications and enables per-command notification futures.
     */
    private _subscribeBLENotifications;
    /**
     * Await a BLE notification for this device (for advanced use in subclasses)
     * Returns the notification payload or throws on timeout.
     */
    protected _awaitBLENotification(timeoutMs?: number): Promise<Buffer>;
    getState(): Promise<any>;
    setState(change: any): Promise<any>;
    createHAPAccessory(api: any): any;
    createMatterAccessory(api: any): Promise<any>;
}
export declare class BotDevice extends GenericDevice {
    createHAPAccessory(api: any): any;
}
export declare class CurtainDevice extends GenericDevice {
    private lastKnownPosition;
    private lastTargetPosition;
    private positionState;
    private preferLocalPositionUntil;
    private clampHomeKitPosition;
    private toHomeKitPosition;
    private toSwitchBotPosition;
    private getPositionForHomeKit;
    createHAPAccessory(api: any): {
        services: {
            type: string;
            characteristics: {
                CurrentPosition: {
                    get: () => Promise<number>;
                };
                PositionState: {
                    get: () => Promise<number>;
                };
                TargetPosition: {
                    get: () => Promise<number>;
                    set: (v: any) => Promise<void>;
                };
            };
        }[];
    };
    createMatterAccessory(api: any): Promise<any>;
}
export declare class FanDevice extends GenericDevice {
    createHAPAccessory(api: any): {
        services: {
            type: string;
            characteristics: {
                On: {
                    get: () => Promise<boolean>;
                    set: (v: any) => Promise<void>;
                };
                RotationSpeed: {
                    get: () => Promise<any>;
                    set: (v: any) => Promise<void>;
                };
            };
        }[];
    };
    setState(change: any): Promise<any>;
    createMatterAccessory(api: any): any;
}
export declare class LightDevice extends GenericDevice {
    createHAPAccessory(api: any): {
        services: {
            type: string;
            characteristics: {
                On: {
                    get: () => Promise<boolean>;
                    set: (v: any) => Promise<void>;
                };
                Brightness: {
                    props: {
                        minValue: number;
                        maxValue: number;
                        minStep: number;
                    };
                    get: () => Promise<any>;
                    set: (v: any) => Promise<void>;
                };
                Hue: {
                    props: {
                        minValue: number;
                        maxValue: number;
                        minStep: number;
                    };
                    get: () => Promise<any>;
                    set: (v: any) => Promise<void>;
                };
                Saturation: {
                    props: {
                        minValue: number;
                        maxValue: number;
                        minStep: number;
                    };
                    get: () => Promise<any>;
                    set: (v: any) => Promise<void>;
                };
                ColorTemperature: {
                    props: {
                        minValue: number;
                        maxValue: number;
                        minStep: number;
                    };
                    get: () => Promise<any>;
                    set: (v: any) => Promise<void>;
                };
            };
        }[];
    };
    setState(change: any): Promise<any>;
    createMatterAccessory(api: any): any;
}
export declare class LightStripDevice extends LightDevice {
}
export declare class MotionSensorDevice extends GenericDevice {
    createHAPAccessory(api: any): {
        services: {
            type: string;
            characteristics: {
                MotionDetected: {
                    get: () => Promise<boolean>;
                };
            };
        }[];
    };
    setState(change: any): Promise<any>;
}
export declare class ContactSensorDevice extends GenericDevice {
    createHAPAccessory(api: any): {
        services: {
            type: string;
            characteristics: {
                ContactSensorState: {
                    get: () => Promise<0 | 1>;
                };
            };
        }[];
    };
}
export declare class VacuumDevice extends GenericDevice {
    createHAPAccessory(api: any): any;
}
export declare class LockDevice extends GenericDevice {
    createHAPAccessory(api: any): {
        services: {
            type: string;
            characteristics: {
                LockCurrentState: {
                    get: () => Promise<0 | 1>;
                };
                LockTargetState: {
                    get: () => Promise<0 | 1>;
                    set: (v: any) => Promise<void>;
                };
            };
        }[];
    };
    setState(change: any): Promise<any>;
    createMatterAccessory(api: any): any;
}
export declare class HumidifierDevice extends GenericDevice {
    createHAPAccessory(api: any): {
        services: {
            type: string;
            characteristics: {
                Active: {
                    get: () => Promise<0 | 1>;
                    set: (v: any) => Promise<void>;
                };
                CurrentHumidifierDehumidifierState: {
                    get: () => Promise<0 | 2>;
                };
                TargetHumidifierDehumidifierState: {
                    get: () => Promise<number>;
                    set: (v: any) => Promise<void>;
                };
                CurrentRelativeHumidity: {
                    get: () => Promise<any>;
                };
                RelativeHumidityHumidifierThreshold: {
                    get: () => Promise<any>;
                    set: (v: any) => Promise<void>;
                };
            };
        }[];
    };
    setState(change: any): Promise<any>;
}
export declare class HumidifierMatterDevice extends HumidifierDevice {
    createMatterAccessory(api: any): Promise<any>;
}
export declare class TemperatureSensorDevice extends GenericDevice {
    createHAPAccessory(api: any): {
        services: {
            type: string;
            characteristics: {
                CurrentTemperature: {
                    get: () => Promise<any>;
                };
            };
        }[];
    };
}
export declare class RelaySwitchDevice extends GenericDevice {
}
export declare class RelaySwitch1PMDevice extends GenericDevice {
}
export declare class PlugDevice extends GenericDevice {
    createHAPAccessory(api: any): {
        services: {
            type: string;
            characteristics: {
                On: {
                    get: () => Promise<boolean>;
                    set: (v: any) => Promise<void>;
                };
                OutletInUse: {
                    get: () => Promise<0 | 1>;
                };
            };
        }[];
    };
}
export declare class PlugMiniDevice extends PlugDevice {
}
export declare class BlindTiltDevice extends CurtainDevice {
}
export declare class Curtain3Device extends CurtainDevice {
}
export declare class RollerShadeDevice extends CurtainDevice {
}
export declare class Hub2Device extends GenericDevice {
}
export declare class MeterDevice extends GenericDevice {
    createHAPAccessory(api: any): {
        services: ({
            type: string;
            characteristics: {
                CurrentTemperature: {
                    get: () => Promise<any>;
                };
                CurrentRelativeHumidity?: undefined;
            };
        } | {
            type: string;
            characteristics: {
                CurrentRelativeHumidity: {
                    get: () => Promise<any>;
                };
                CurrentTemperature?: undefined;
            };
        })[];
    };
}
export declare class WaterDetectorDevice extends GenericDevice {
    private _leakRefreshing;
    private _leakRefreshTs;
    private lastLeakDetected?;
    private readonly LEAK_REFRESH_TTL_MS;
    init(): Promise<void>;
    private normalizeLeakDetected;
    private readLeakDetectedFromOpenAPI;
    private readLeakDetected;
    private _refreshLeakState;
    private getLeakDetectedFast;
    createHAPAccessory(api: any): {
        services: {
            type: string;
            characteristics: {
                LeakDetected: {
                    get: () => number;
                };
            };
        }[];
    };
}
export declare class SmartFanDevice extends FanDevice {
}
export declare class StripLightDevice extends LightStripDevice {
}
export declare class WalletFinderDevice extends GenericDevice {
}
export declare class WoSweeperDevice extends VacuumDevice {
}
export declare class WoSweeperMiniDevice extends VacuumDevice {
}
export declare class WoSweeperMiniProDevice extends VacuumDevice {
}
//# sourceMappingURL=genericDevice.d.ts.map