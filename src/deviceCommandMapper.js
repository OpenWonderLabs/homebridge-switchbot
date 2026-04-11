// deviceCommandMapper.ts
// Maps HAP/Matter commands to node-switchbot device methods for all supported device types
export const deviceTypeCommandMap = {
    // SwitchBot AI Hub (read-only/generic)
    'ai hub': {},
    // SwitchBot Cameras (read-only/generic)
    'indoor cam': {},
    'pan/tilt cam': {},
    'pan/tilt cam 2k': {},
    'pan/tilt cam plus 2k': {},
    'pan/tilt cam plus 3k': {},
    // SwitchBot Air Purifiers (read-only/generic)
    'air purifier pm2.5': {},
    'air purifier table pm2.5': {},
    'air purifier voc': {},
    'air purifier table voc': {},
    // SwitchBot Home Climate Panel (read-only/generic)
    'home climate panel': {},
    // SwitchBot WoIOSensor (read-only/generic)
    'woiosensor': {},
    // SwitchBot Candle Warmer Lamp
    'candle warmer lamp': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
    },
    // SwitchBot Hubs (read-only/generic)
    'hub': {},
    'hub 2': {},
    'hub 3': {},
    'hub mini': {},
    'hub plus': {},
    // SwitchBot Robot Vacuum Cleaner K20 Plus Pro
    'robot vacuum cleaner k20 plus pro': {
        start: async (device) => device.start(),
        stop: async (device) => device.stop(),
        pause: async (device) => device.pause(),
        dock: async (device) => device.dock(),
        resume: async (device) => device.resume(),
        locate: async (device) => device.locate(),
    },
    // SwitchBot Robot Vacuum Cleaner S1
    'robot vacuum cleaner s1': {
        start: async (device) => device.start(),
        stop: async (device) => device.stop(),
        pause: async (device) => device.pause(),
        dock: async (device) => device.dock(),
        resume: async (device) => device.resume(),
        locate: async (device) => device.locate(),
    },
    // SwitchBot Robot Vacuum Cleaner S1 Plus
    'robot vacuum cleaner s1 plus': {
        start: async (device) => device.start(),
        stop: async (device) => device.stop(),
        pause: async (device) => device.pause(),
        dock: async (device) => device.dock(),
        resume: async (device) => device.resume(),
        locate: async (device) => device.locate(),
    },
    // SwitchBot Robot Vacuum Cleaner S10
    'robot vacuum cleaner s10': {
        start: async (device) => device.start(),
        stop: async (device) => device.stop(),
        pause: async (device) => device.pause(),
        dock: async (device) => device.dock(),
        resume: async (device) => device.resume(),
        locate: async (device) => device.locate(),
    },
    // SwitchBot Robot Vacuum Cleaner S20
    'robot vacuum cleaner s20': {
        start: async (device) => device.start(),
        stop: async (device) => device.stop(),
        pause: async (device) => device.pause(),
        dock: async (device) => device.dock(),
        resume: async (device) => device.resume(),
        locate: async (device) => device.locate(),
    },
    // SwitchBot Relay Switch 2PM
    'relay switch 2pm': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
    },
    // SwitchBot K10+
    'k10+': {
        start: async (device) => device.start(),
        stop: async (device) => device.stop(),
        pause: async (device) => device.pause(),
        dock: async (device) => device.dock(),
        resume: async (device) => device.resume(),
        locate: async (device) => device.locate(),
    },
    // SwitchBot K10+ Pro
    'k10+ pro': {
        start: async (device) => device.start(),
        stop: async (device) => device.stop(),
        pause: async (device) => device.pause(),
        dock: async (device) => device.dock(),
        resume: async (device) => device.resume(),
        locate: async (device) => device.locate(),
    },
    // SwitchBot Robot Vacuum Cleaner K10+ Pro Combo
    'robot vacuum cleaner k10+ pro combo': {
        start: async (device) => device.start(),
        stop: async (device) => device.stop(),
        pause: async (device) => device.pause(),
        dock: async (device) => device.dock(),
        resume: async (device) => device.resume(),
        locate: async (device) => device.locate(),
    },
    // SwitchBot Robot Vacuum Cleaner K11+
    'robot vacuum cleaner k11+': {
        start: async (device) => device.start(),
        stop: async (device) => device.stop(),
        pause: async (device) => device.pause(),
        dock: async (device) => device.dock(),
        resume: async (device) => device.resume(),
        locate: async (device) => device.locate(),
    },
    // SwitchBot MeterPro(CO2) (read-only)
    'meterpro(co2)': {},
    // SwitchBot Water Detector (read-only)
    'water detector': {},
    // SwitchBot Garage Door Opener
    'garage door opener': {
        open: async (device) => device.open(),
        close: async (device) => device.close(),
        stop: async (device) => device.stop(),
    },
    // SwitchBot Relay Switch 1
    'relay switch 1': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
    },
    // SwitchBot Relay Switch 1PM
    'relay switch 1pm': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
    },
    // SwitchBot Smart Radiator Thermostat (read-only or not directly controllable)
    'smart radiator thermostat': {},
    // SwitchBot Humidifier2
    'humidifier2': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
        setMode: async (device, body) => device.setMode(body?.parameter),
        setHumidity: async (device, body) => device.setHumidity(body?.parameter),
    },
    // SwitchBot MeterPlus (read-only)
    'meterplus': {},
    // SwitchBot Meter Pro (read-only)
    'meter pro': {},
    // SwitchBot MeterPro (read-only)
    'meterpro': {},
    // SwitchBot RGBICWW Floor Lamp
    'rgbicww floor lamp': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
        setBrightness: async (device, body) => device.setBrightness(body?.parameter),
        setColor: async (device, body) => device.setColor(body?.parameter),
    },
    // SwitchBot RGBICWW Strip Light
    'rgbicww strip light': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
        setBrightness: async (device, body) => device.setBrightness(body?.parameter),
        setColor: async (device, body) => device.setColor(body?.parameter),
    },
    // SwitchBot Circulator Fan
    'circulator fan': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
        setSpeed: async (device, body) => device.setSpeed(body?.parameter),
        swing: async (device) => device.swing(),
    },
    // SwitchBot Battery Circulator Fan
    'battery circulator fan': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
        setSpeed: async (device, body) => device.setSpeed(body?.parameter),
        swing: async (device) => device.swing(),
    },
    // SwitchBot Standing Circulator Fan
    'standing circulator fan': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
        setSpeed: async (device, body) => device.setSpeed(body?.parameter),
        swing: async (device) => device.swing(),
    },
    // SwitchBot Bot
    'bot': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
        press: async (device) => device.press(),
    },
    // SwitchBot Curtain
    'curtain': {
        open: async (device) => device.open(),
        close: async (device) => device.close(),
        pause: async (device) => device.pause(),
        setPosition: async (device, body) => device.setPosition(body?.parameter),
    },
    // SwitchBot Blind Tilt
    'blind tilt': {
        open: async (device) => device.open(),
        close: async (device) => device.close(),
        pause: async (device) => device.pause(),
        setPosition: async (device, body) => device.setPosition(body?.parameter),
    },
    // SwitchBot Roller Shade
    'roller shade': {
        open: async (device) => device.open(),
        close: async (device) => device.close(),
        pause: async (device) => device.pause(),
        setPosition: async (device, body) => device.setPosition(body?.parameter),
    },
    // SwitchBot Plug
    'plug': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
    },
    // SwitchBot Strip Light 3
    'strip light 3': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
        setBrightness: async (device, body) => device.setBrightness(body?.parameter),
        setColor: async (device, body) => device.setColor(body?.parameter),
    },
    // SwitchBot Floor Lamp
    'floor lamp': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
        setBrightness: async (device, body) => device.setBrightness(body?.parameter),
        setColor: async (device, body) => device.setColor(body?.parameter),
    },
    // SwitchBot RGBIC Neon Rope Light
    'rgbic neon rope light': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
        setBrightness: async (device, body) => device.setBrightness(body?.parameter),
        setColor: async (device, body) => device.setColor(body?.parameter),
    },
    // SwitchBot RGBIC Neon Wire Rope Light
    'rgbic neon wire rope light': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
        setBrightness: async (device, body) => device.setBrightness(body?.parameter),
        setColor: async (device, body) => device.setColor(body?.parameter),
    },
    // SwitchBot Plug Mini
    'plug mini': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
    },
    // SwitchBot Color Bulb
    'color bulb': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
        setBrightness: async (device, body) => device.setBrightness(body?.parameter),
        setColor: async (device, body) => device.setColor(body?.parameter),
    },
    // SwitchBot Light Strip
    'light strip': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
        setBrightness: async (device, body) => device.setBrightness(body?.parameter),
        setColor: async (device, body) => device.setColor(body?.parameter),
    },
    // SwitchBot Fan
    'fan': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
        setSpeed: async (device, body) => device.setSpeed(body?.parameter),
        swing: async (device) => device.swing(),
    },
    // SwitchBot Lock
    'lock': {
        lock: async (device) => device.lock(),
        unlock: async (device) => device.unlock(),
    },
    // SwitchBot Curtain 3
    'curtain3': {
        open: async (device) => device.open(),
        close: async (device) => device.close(),
        pause: async (device) => device.pause(),
        setPosition: async (device, body) => device.setPosition(body?.parameter),
    },
    // SwitchBot Meter
    'meter': {}, // Read-only
    // SwitchBot Motion Sensor
    'motion sensor': {}, // Read-only
    // SwitchBot Contact Sensor
    'contact sensor': {}, // Read-only
    // SwitchBot Humidifier
    'humidifier': {
        turnOn: async (device) => device.turnOn(),
        turnOff: async (device) => device.turnOff(),
        setMode: async (device, body) => device.setMode(body?.parameter),
        setHumidity: async (device, body) => device.setHumidity(body?.parameter),
    },
    // SwitchBot Vacuum
    'vacuum': {
        start: async (device) => device.start(),
        stop: async (device) => device.stop(),
        pause: async (device) => device.pause(),
        dock: async (device) => device.dock(),
        resume: async (device) => device.resume(),
        locate: async (device) => device.locate(),
    },
    // Add more device types and commands as needed
};
// Helper to get the handler for a device type and command
export function getDeviceCommandHandler(deviceType, command) {
    const typeKey = deviceType.toLowerCase();
    const typeMap = deviceTypeCommandMap[typeKey];
    if (!typeMap) {
        return undefined;
    }
    return typeMap[command];
}
//# sourceMappingURL=deviceCommandMapper.js.map