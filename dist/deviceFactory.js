import { DEVICE_TYPE_NORMALIZATION_MAP } from './device-types.js';
import { BlindTiltDevice, BotDevice, ContactSensorDevice, Curtain3Device, CurtainDevice, FanDevice, GenericDevice, Hub2Device, HumidifierDevice, LightDevice, LightStripDevice, LockDevice, MeterDevice, MotionSensorDevice, PlugDevice, PlugMiniDevice, RelaySwitch1PMDevice, RelaySwitchDevice, RollerShadeDevice, SmartFanDevice, StripLightDevice, TemperatureSensorDevice, VacuumDevice, WalletFinderDevice, WaterDetectorDevice, WoSweeperDevice, WoSweeperMiniDevice, WoSweeperMiniProDevice, } from './devices/genericDevice.js';
import { SwitchBotClient } from './switchbotClient.js';
const DEVICE_CLASS_MAP = {
    // Primary device type keys (lowercase, simplified)
    'bot': BotDevice,
    'curtain': CurtainDevice,
    'curtain3': Curtain3Device,
    'fan': FanDevice,
    'light': LightDevice,
    'lightstrip': LightStripDevice,
    'motion': MotionSensorDevice,
    'contact': ContactSensorDevice,
    'vacuum': VacuumDevice,
    // Canonical, normalized device type keys (lowercase, mapped to device classes)
    'video doorbell': GenericDevice,
    'smart radiator thermostat': GenericDevice,
    'woiosensor': GenericDevice,
    'garage door opener': GenericDevice,
    'air purifier table pm2.5': GenericDevice,
    'air purifier voc': GenericDevice,
    'air purifier table voc': GenericDevice,
    'meterplus': MeterDevice,
    'meterpro': MeterDevice,
    'meterpro(co2)': MeterDevice,
    'walletfinder': WalletFinderDevice,
    'plug': PlugDevice,
    'plug mini (eu)': PlugMiniDevice,
    'plug mini (jp)': PlugMiniDevice,
    'plug mini (us)': PlugMiniDevice,
    'relay switch 1pm': RelaySwitch1PMDevice,
    'relay switch 2pm': RelaySwitch1PMDevice,
    'k10+ pro': WoSweeperDevice,
    'robot vacuum cleaner k10+ pro combo': WoSweeperDevice,
    'robot vacuum cleaner k11+': WoSweeperDevice,
    'robot vacuum cleaner k20 plus pro': WoSweeperDevice,
    'ai hub': GenericDevice,
    'hub': GenericDevice,
    'hub 2': Hub2Device,
    'hub 3': GenericDevice,
    'hub mini': GenericDevice,
    'hub plus': GenericDevice,
    'indoor cam': GenericDevice,
    'pan/tilt cam': GenericDevice,
    'pan/tilt cam 2k': GenericDevice,
    'pan/tilt cam plus 2k': GenericDevice,
    'pan/tilt cam plus 3k': GenericDevice,
    'humidifier': HumidifierDevice, // Includes evaporative humidifier mapping
    'roller shade': RollerShadeDevice,
    'strip light 3': StripLightDevice,
    'circulator fan': FanDevice,
    'smart lock pro': LockDevice,
    'lock lite': LockDevice,
    'keypad': LockDevice,
    'lock vision pro': LockDevice,
    'floor lamp': LightDevice,
    'rgbicww floor lamp': LightStripDevice,
    'rgbicww strip light': LightStripDevice,
    'home climate panel': GenericDevice, // Climate panel family
    'lock': LockDevice,
    'humidifier2': HumidifierDevice,
    'temperature': TemperatureSensorDevice,
    'relay switch 1': RelaySwitchDevice,
    'blind tilt': BlindTiltDevice,
    'worollershade': RollerShadeDevice,
    'wo rollershade': RollerShadeDevice,
    'rollershade': RollerShadeDevice,
    'meter': MeterDevice,
    'meter plus (jp)': MeterDevice,
    'water detector': WaterDetectorDevice,
    'waterdetector': WaterDetectorDevice,
    'smart fan': SmartFanDevice,
    'strip light': StripLightDevice,
    'wosweeper': WoSweeperDevice,
    'wosweepermini': WoSweeperMiniDevice,
    'wosweeperminipro': WoSweeperMiniProDevice,
    'k10+': WoSweeperDevice,
    'k10+ pro (wosweeperminipro)': WoSweeperMiniProDevice,
    'battery circulator fan': FanDevice,
    'standing circulator fan': FanDevice,
    'smart lock': LockDevice,
    'smart lock ultra': LockDevice,
    'keypad touch': LockDevice,
    'keypad vision': LockDevice,
    'keypad vision pro': LockDevice,
    'color bulb': LightDevice,
    'ceiling light': LightDevice,
    'ceiling light pro': LightDevice,
    'candle warmer lamp': LightDevice,
    'rgbic neon rope light': LightStripDevice,
    'rgbic neon wire rope light': LightStripDevice,
    'robot vacuum cleaner s1': VacuumDevice,
    'robot vacuum cleaner s1 plus': VacuumDevice,
    'robot vacuum cleaner s10': VacuumDevice,
    'robot vacuum cleaner s20': VacuumDevice,
};
function classForType(type) {
    const rawKey = (type || '').toLowerCase();
    const key = DEVICE_TYPE_NORMALIZATION_MAP[rawKey] ?? rawKey;
    return DEVICE_CLASS_MAP[key] ?? GenericDevice;
}
export async function createDevice(opts, cfg, useMatter, log) {
    // Always pass the logger to both device opts and config
    const logger = log || cfg?.logger || cfg?.log;
    if (opts && opts.name && logger && typeof logger.info === 'function') {
        logger.info(`[Matter/Debug] createDevice: Passing opts for ${opts.name}:`, JSON.stringify(opts, null, 2));
    }
    // Reuse existing client when provided via config to avoid creating
    // a new SwitchBotClient per device (which can be expensive).
    let client = cfg?._client ?? null;
    if (!client) {
        client = new SwitchBotClient(cfg);
        await client.init();
    }
    // Pass client via config so devices can access it
    const mergedCfg = { ...cfg, _client: client };
    // Always pass logger to mergedCfg
    if (logger) {
        mergedCfg.log = logger;
    }
    // Pass encryptionKey and keyId to device opts if present
    const deviceOpts = { ...opts };
    if (opts.encryptionKey) {
        deviceOpts.encryptionKey = opts.encryptionKey;
    }
    if (opts.keyId) {
        deviceOpts.keyId = opts.keyId;
    }
    // Always pass logger to deviceOpts
    if (logger) {
        deviceOpts.log = logger;
    }
    const DeviceCtor = classForType(opts.type);
    const device = new DeviceCtor(deviceOpts, mergedCfg);
    await device.init();
    // Attach a simple getState delegator to the client where appropriate
    const originalGetState = device.getState.bind(device);
    device.getState = async () => {
        try {
            // Prefer client-backed getDevice when available
            const dev = await client.getDevice(opts.id);
            if (dev) {
                return dev;
            }
        }
        catch (e) {
            // ignore and fallback to device implementation
        }
        return originalGetState();
    };
    // Provide accessory factory based on platform selection
    return {
        instance: device,
        createAccessory: useMatter
            ? async (api) => await device.createMatterAccessory(api)
            : (api) => device.createHAPAccessory(api),
        protocol: useMatter ? 'matter' : 'hap',
    };
}
//# sourceMappingURL=deviceFactory.js.map