import type { Buffer } from 'node:buffer';
/**
 * BLE Service Data for various SwitchBot devices
 */
export interface BLEServiceData {
    /** Device model */
    model: string;
    /** Model name string */
    modelName: string;
    /** Battery level (0-100) */
    battery?: number;
    /** Raw service data buffer */
    rawData?: Buffer;
    /** Parsed on/off state where available */
    state?: boolean;
    /** Parsed mode where available */
    mode?: 'press' | 'switch' | 'customize' | 'auto' | 'manual' | 'sleep';
    /** Parsed movement state where available */
    inMotion?: boolean;
    /** Parsed lock state where available */
    lockState?: 'locked' | 'unlocked' | 'jammed';
    /** Parsed lock raw status value where available */
    status?: number;
    /** Parsed door-open flag where available */
    doorOpen?: boolean;
    /** Parsed sequence number where available */
    sequenceNumber?: number;
    /** Parsed relay channel 2 state where available */
    channel2State?: boolean;
    /** Allow model-specific parser extensions */
    [key: string]: unknown;
}
/**
 * Bot (WoHand) BLE Service Data
 */
export interface BotServiceData extends BLEServiceData {
    mode: 'press' | 'switch' | 'customize';
    state: boolean;
    battery: number;
}
/**
 * Curtain BLE Service Data
 */
export interface CurtainServiceData extends BLEServiceData {
    calibration: boolean;
    battery: number;
    position: number;
    lightLevel: number;
    deviceChain?: number;
}
/**
 * Lock BLE Service Data
 */
export interface LockServiceData extends BLEServiceData {
    battery: number;
    calibration: boolean;
    status: number;
    doorOpen: boolean;
    lockState: 'locked' | 'unlocked' | 'jammed';
    autoLockDelay?: number;
}
/**
 * Meter BLE Service Data
 */
export interface MeterServiceData extends BLEServiceData {
    temperature: number;
    fahrenheit: boolean;
    humidity: number;
    battery: number;
}
/**
 * Contact Sensor BLE Service Data
 */
export interface ContactServiceData extends BLEServiceData {
    movement: boolean;
    position: 'open' | 'closed' | 'timeout';
    battery: number;
    lightLevel: 'bright' | 'dim' | 'dark';
}
/**
 * Motion Sensor BLE Service Data
 */
export interface MotionServiceData extends BLEServiceData {
    movement: boolean;
    battery: number;
    lightLevel: 'bright' | 'dim' | 'dark';
    iotButton?: boolean;
}
/**
 * Plug BLE Service Data
 */
export interface PlugServiceData extends BLEServiceData {
    state: boolean;
    delay: boolean;
    timer: boolean;
    syncUtcTime: boolean;
    wifiRssi: number;
    overload: boolean;
    currentPower: number;
}
/**
 * Bulb BLE Service Data
 */
export interface BulbServiceData extends BLEServiceData {
    state: boolean;
    brightness: number;
    red?: number;
    green?: number;
    blue?: number;
    colorTemperature?: number;
    delay?: boolean;
    preset?: boolean;
    colorMode?: boolean;
}
/**
 * Strip Light BLE Service Data
 */
export interface StripServiceData extends BulbServiceData {
}
/**
 * Ceiling Light BLE Service Data
 */
export interface CeilingLightServiceData extends BulbServiceData {
}
/**
 * Blind Tilt BLE Service Data
 */
export interface BlindTiltServiceData extends BLEServiceData {
    calibration: boolean;
    battery: number;
    position: number;
    lightLevel: number;
    inMotion: boolean;
}
/**
 * Humidifier BLE Service Data
 */
export interface HumidifierServiceData extends BLEServiceData {
    onState: boolean;
    autoMode: boolean;
    percentage: number;
    lackWater: boolean;
}
/**
 * Air Purifier BLE Service Data
 */
export interface AirPurifierServiceData extends BLEServiceData {
    state: boolean;
    fanSpeed: number;
    mode: 'auto' | 'manual' | 'sleep';
    pm25?: number;
}
/**
 * Hub BLE Service Data
 */
export interface HubServiceData extends BLEServiceData {
    temperature: number;
    fahrenheit: boolean;
    humidity: number;
    lightLevel: number;
}
/**
 * Leak Detector BLE Service Data
 */
export interface LeakServiceData extends BLEServiceData {
    waterLeakDetected: boolean;
    battery: number;
}
/**
 * Presence Sensor BLE Service Data
 */
export interface PresenceServiceData extends BLEServiceData {
    movement: boolean;
    battery: number;
    lightLevel: 'bright' | 'dim' | 'dark';
}
/**
 * Relay Switch BLE Service Data
 */
export interface RelaySwitchServiceData extends BLEServiceData {
    state: boolean;
    power?: number;
    voltage?: number;
    current?: number;
}
/**
 * BLE Device Advertisement
 */
export interface BLEAdvertisement {
    id: string;
    address?: string;
    isAddressable: boolean;
    rssi: number;
    serviceData: BLEServiceData;
    /** Raw BLE advertisement data (entire buffer) */
    rawAdvData?: Buffer;
    /** True if advertisement is encrypted */
    isEncrypted?: boolean;
    /** User-friendly model name (e.g., "WoHand") */
    modelFriendlyName?: string;
}
/**
 * BLE Scanner options
 */
export interface BLEScanOptions {
    /** Scan duration in milliseconds */
    duration?: number;
    /** Filter by specific MAC addresses */
    macs?: string[];
    /** Filter by device model */
    model?: string;
    /** Active scanning (default: true) */
    active?: boolean;
}
/**
 * SwitchBot BLE Model identifiers
 */
export declare enum SwitchBotBLEModel {
    Bot = "H",
    Curtain = "c",
    Curtain3 = "{",
    Plug = "g",
    PlugMiniUS = "j",
    PlugMiniJP = "j",
    Meter = "T",
    MeterPlus = "i",
    MeterPro = "o",
    MeterProCO2 = "w",
    OutdoorMeter = "n",
    Lock = "o",
    LockPro = "\u0011",
    Keypad = "k",
    KeypadTouch = "\v",
    MotionSensor = "s",
    ContactSensor = "d",
    CeilingLight = "q",
    CeilingLightPro = "r",
    StripLight = "p",
    ColorBulb = "u",
    RobotVacuumCleanerS1 = "\n",
    RobotVacuumCleanerS1Plus = "\f",
    RobotVacuumCleanerK10Plus = "\u000F",
    Humidifier = "e",
    Humidifier2 = "\u0007",
    BlindTilt = "x",
    Hub2 = "\u0001",
    Hub3 = "\u0002",
    Remote = "\u0005",
    BatteryCirculatorFan = "\u0004",
    AirPurifier = "\b",
    AirPurifierTable = "\t",
    WaterLeakDetector = "y",
    PresenceSensor = "\u0006",
    RelaySwitch1PM = "\r",
    RelaySwitch1 = "\u000E",
    K10ProComboK10Pro = "\u0010"
}
/**
 * SwitchBot BLE Model Names
 */
export declare enum SwitchBotBLEModelName {
    Bot = "WoHand",
    Curtain = "WoCurtain",
    Curtain3 = "WoCurtain3",
    Plug = "WoPlugUS",
    PlugMiniUS = "WoPlugMiniUS",
    PlugMiniJP = "WoPlugMiniJP",
    Meter = "WoSensorTH",
    MeterPlus = "WoSensorTHPlus",
    MeterPro = "WoSensorTHPro",
    MeterProCO2 = "WoSensorTHProCO2",
    OutdoorMeter = "WoIOSensorTH",
    Lock = "WoSmartLock",
    LockPro = "WoSmartLockPro",
    Keypad = "WoKeypad",
    KeypadTouch = "WoKeypadTouch",
    MotionSensor = "WoMotion",
    ContactSensor = "WoContact",
    CeilingLight = "WoCeilingLight",
    CeilingLightPro = "WoCeilingLightPro",
    StripLight = "WoStrip",
    ColorBulb = "WoBulb",
    RobotVacuumCleanerS1 = "WoVacS1",
    RobotVacuumCleanerS1Plus = "WoVacS1Plus",
    RobotVacuumCleanerK10Plus = "WoVacK10Plus",
    Humidifier = "WoHumi",
    Humidifier2 = "WoHumi2",
    BlindTilt = "WoBlindTilt",
    Hub2 = "WoHub2",
    Hub3 = "WoHub3",
    Remote = "WoRemote",
    BatteryCirculatorFan = "WoCirculatorFan",
    AirPurifier = "WoAirPurifier",
    AirPurifierTable = "WoAirPurifierTable",
    WaterLeakDetector = "WoLeak",
    PresenceSensor = "WoPresence",
    RelaySwitch1PM = "WoRelaySwitch1PM",
    RelaySwitch1 = "WoRelaySwitch1",
    K10ProComboK10Pro = "WoVacK10ProCombo"
}
/**
 * Noble types (for BLE communication)
 */
export interface NobleTypes {
    Peripheral?: any;
    Service?: any;
    Characteristic?: any;
    Noble?: any;
}
//# sourceMappingURL=ble.d.ts.map