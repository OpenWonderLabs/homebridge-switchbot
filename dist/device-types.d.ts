export declare const DEVICE_TYPES: {
    readonly 'Window Coverings': readonly ["Blind Tilt", "Curtain", "Curtain3", "Roller Shade"];
    readonly 'Locks & Access': readonly ["Keypad", "Keypad Touch", "Keypad Vision", "Keypad Vision Pro", "Lock Vision Pro", "Lock Lite", "Smart Lock", "Smart Lock Pro", "Smart Lock Ultra", "Video Doorbell"];
    readonly Sensors: readonly ["Contact Sensor", "Motion Sensor", "Presence Sensor", "Water Detector"];
    readonly Lighting: readonly ["Candle Warmer Lamp", "Ceiling Light", "Ceiling Light Pro", "Color Bulb", "Floor Lamp", "RGBIC Neon Rope Light", "RGBIC Neon Wire Rope Light", "RGBICWW Floor Lamp", "RGBICWW Strip Light", "Strip Light", "Strip Light 3"];
    readonly 'Climate Control': readonly ["Air Purifier PM2.5", "Air Purifier Table PM2.5", "Air Purifier VOC", "Air Purifier Table VOC", "Battery Circulator Fan", "Circulator Fan", "Humidifier", "Humidifier2", "Meter", "MeterPlus", "Meter Plus", "MeterPro", "Meter Pro", "MeterPro(CO2)", "Meter Pro (CO2)", "Smart Radiator Thermostat", "Standing Circulator Fan", "WoIOSensor"];
    readonly 'Plugs & Switches': readonly ["Garage Door Opener", "Plug", "Plug Mini (EU)", "Plug Mini (JP)", "Plug Mini (US)", "Relay Switch 1", "Relay Switch 1PM", "Relay Switch 2PM"];
    readonly 'Robot Vacuums': readonly ["K10+", "K10+ Pro", "Robot Vacuum Cleaner K10+ Pro Combo", "Robot Vacuum Cleaner K11+", "Robot Vacuum Cleaner K20 Plus Pro", "Robot Vacuum Cleaner S1", "Robot Vacuum Cleaner S1 Plus", "Robot Vacuum Cleaner S10", "Robot Vacuum Cleaner S20"];
    readonly Hubs: readonly ["AI Hub", "Hub", "Hub 2", "Hub 3", "Hub Mini", "Hub Plus"];
    readonly Cameras: readonly ["Indoor Cam", "Pan/Tilt Cam", "Pan/Tilt Cam 2K", "Pan/Tilt Cam Plus 2K", "Pan/Tilt Cam Plus 3K"];
    readonly 'IR Devices': readonly ["Air Conditioner", "Air Purifier", "Camera", "DVD", "Fan", "Light", "Others", "Projector", "Set Top Box", "Speaker", "Streamer", "TV", "Vacuum Cleaner", "Water Heater"];
    readonly 'Other Devices': readonly ["AI Art Frame", "Bot", "Home Climate Panel", "Remote", "remote with screen"];
};
export declare const DEVICE_TYPE_NORMALIZATION_MAP: Record<string, string>;
/**
 * Get all valid device types as a flat set for validation
 */
export declare function getValidDeviceTypes(): Set<string>;
/**
 * Normalize and validate a device type, returning a valid type or null
 * @param deviceType The device type to validate/normalize
 * @returns Valid device type string or null if no valid mapping found
 */
export declare function normalizeDeviceType(deviceType: string | undefined | null): string | null;
/**
 * Check if a device type is valid
 * @param deviceType The device type to check
 * @returns true if device type is in DEVICE_TYPES
 */
export declare function isValidDeviceType(deviceType: string | undefined | null): boolean;
//# sourceMappingURL=device-types.d.ts.map