export const DEVICE_TYPES = {
  'Window Coverings': ['Blind Tilt', 'Curtain', 'Curtain3', 'Roller Shade'],
  'Locks & Access': [
    'Keypad',
    'Keypad Touch',
    'Keypad Vision',
    'Keypad Vision Pro',
    'Lock Vision Pro',
    'Lock Lite',
    'Smart Lock',
    'Smart Lock Pro',
    'Smart Lock Ultra',
    'Video Doorbell',
  ],
  'Sensors': ['Contact Sensor', 'Motion Sensor', 'Presence Sensor', 'Water Detector'],
  'Lighting': [
    'Candle Warmer Lamp',
    'Ceiling Light',
    'Ceiling Light Pro',
    'Color Bulb',
    'Floor Lamp',
    'RGBIC Neon Rope Light',
    'RGBIC Neon Wire Rope Light',
    'RGBICWW Floor Lamp',
    'RGBICWW Strip Light',
    'Strip Light',
    'Strip Light 3',
  ],
  'Climate Control': [
    'Air Purifier PM2.5',
    'Air Purifier Table PM2.5',
    'Air Purifier VOC',
    'Air Purifier Table VOC',
    'Battery Circulator Fan',
    'Circulator Fan',
    'Humidifier',
    'Humidifier2',
    'Meter',
    'MeterPlus',
    'Meter Plus',
    'MeterPro',
    'Meter Pro',
    'MeterPro(CO2)',
    'Meter Pro (CO2)',
    'Smart Radiator Thermostat',
    'Standing Circulator Fan',
    'WoIOSensor',
  ],
  'Plugs & Switches': [
    'Garage Door Opener',
    'Plug',
    'Plug Mini (EU)',
    'Plug Mini (JP)',
    'Plug Mini (US)',
    'Relay Switch 1',
    'Relay Switch 1PM',
    'Relay Switch 2PM',
  ],
  'Robot Vacuums': [
    'K10+',
    'K10+ Pro',
    'Robot Vacuum Cleaner K10+ Pro Combo',
    'Robot Vacuum Cleaner K11+',
    'Robot Vacuum Cleaner K20 Plus Pro',
    'Robot Vacuum Cleaner S1',
    'Robot Vacuum Cleaner S1 Plus',
    'Robot Vacuum Cleaner S10',
    'Robot Vacuum Cleaner S20',
  ],
  'Hubs': ['AI Hub', 'Hub', 'Hub 2', 'Hub 3', 'Hub Mini', 'Hub Plus'],
  'Cameras': [
    'Indoor Cam',
    'Pan/Tilt Cam',
    'Pan/Tilt Cam 2K',
    'Pan/Tilt Cam Plus 2K',
    'Pan/Tilt Cam Plus 3K',
  ],
  'IR Devices': [
    'Air Conditioner',
    'Air Purifier',
    'Camera',
    'DVD',
    'Fan',
    'Light',
    'Others',
    'Projector',
    'Set Top Box',
    'Speaker',
    'Streamer',
    'TV',
    'Vacuum Cleaner',
    'Water Heater',
  ],
  'Other Devices': ['AI Art Frame', 'Bot', 'Home Climate Panel', 'Remote', 'remote with screen'],
} as const

export const DEVICE_TYPE_NORMALIZATION_MAP: Record<string, string> = {
  // --- node-switchbot v4 normalization additions ---
  'hub mini': 'Hub Mini',
  'hub 3': 'Hub 3',
  'keypad': 'Keypad',
  'plug mini': 'Plug Mini (US)', // fallback to US if region not specified
  'art frame': 'AI Art Frame',
  'rgbicww': 'RGBICWW Strip Light',
  'lock vision': 'Lock Vision Pro', // alias for new lock vision
  'lock pro': 'Smart Lock Pro',
  'lock lite': 'Lock Lite',
  'circulator fan': 'Circulator Fan',
  'smart thermostat radiator': 'Smart Radiator Thermostat',
  'climate panel': 'Home Climate Panel',
  'evaporative humidifier': 'Humidifier',
  // --- end node-switchbot v4 additions ---
  // Only keep the last occurrence for each key, all values canonical
  'air purifier pm2.5': 'Air Purifier PM2.5',
  'pan/tilt cam plus 3k': 'Pan/Tilt Cam Plus 3K',
  'remote with screen': 'Remote with Screen',
  'ai hub': 'AI Hub',
  'water detector': 'Water Detector',
  'video doorbell': 'Video Doorbell',
  'smart radiator thermostat': 'Smart Radiator Thermostat',
  'woiosensor': 'WoIOSensor',
  'garage door opener': 'Garage Door Opener',
  'air purifier table pm2.5': 'Air Purifier Table PM2.5',
  'air purifier voc': 'Air Purifier VOC',
  'air purifier table voc': 'Air Purifier Table VOC',
  'plug mini (eu)': 'Plug Mini (EU)',
  // Only last occurrence for each key is kept above. Removed duplicates here.

  // Climate control conversions
  'humidifier2': 'Humidifier2',
  'battery circulator fan': 'Battery Circulator Fan',
  'standing circulator fan': 'Standing Circulator Fan',

  // Lock/keypad conversions
  'smart lock': 'Smart Lock',
  'smart lock pro': 'Smart Lock Pro',
  'smart lock ultra': 'Smart Lock Ultra',
  'keypad touch': 'Keypad Touch',
  'keypad vision': 'Keypad Vision',
  'keypad vision pro': 'Keypad Vision Pro',

  // Light conversions
  'color bulb': 'Color Bulb',
  'ceiling light': 'Ceiling Light',
  'ceiling light pro': 'Ceiling Light Pro',
  'candle warmer lamp': 'Candle Warmer Lamp',
  'floor lamp': 'Floor Lamp',
  'rgbic neon rope light': 'RGBIC Neon Rope Light',
  'rgbic neon wire rope light': 'RGBIC Neon Wire Rope Light',
  'rgbicww floor lamp': 'RGBICWW Floor Lamp',
  'rgbicww strip light': 'RGBICWW Strip Light',
  'strip light': 'Strip Light',
  'strip light 3': 'Strip Light 3',

  // Vacuum conversions
  'robot vacuum cleaner s1': 'Robot Vacuum Cleaner S1',
  'robot vacuum cleaner s1 plus': 'Robot Vacuum Cleaner S1 Plus',
  'robot vacuum cleaner s10': 'Robot Vacuum Cleaner S10',
  'robot vacuum cleaner s20': 'Robot Vacuum Cleaner S20',
  'robot vacuum cleaner k10+ pro combo': 'Robot Vacuum Cleaner K10+ Pro Combo',
  'robot vacuum cleaner k11+': 'Robot Vacuum Cleaner K11+',
  'robot vacuum cleaner k20 plus pro': 'Robot Vacuum Cleaner K20 Plus Pro',

  // Exact device type mappings (API format → canonical format)
  'relay switch 1': 'Relay Switch 1',
  'blind tilt': 'Blind Tilt',
  'roller shade': 'Roller Shade',
  'curtain3': 'Curtain3',
  'hub 2': 'Hub 2',
  'meterplus': 'MeterPlus',
  'meterpro': 'MeterPro',
  'meterpro(co2)': 'MeterPro(CO2)',
  'walletfinder': 'WalletFinder',
  'k10+': 'K10+',
  'k10+ pro (wosweeperminipro)': 'K10+ Pro (wosweeperminipro)',

  // Handle spaced variants from config files (normalize back to canonical type)
  'meter pro': 'Meter Pro',
  'meter pro (co2)': 'Meter Pro (CO2)',
  'meter plus': 'Meter Plus',
  'relay switch 1 pm': 'Relay Switch 1PM',
  'relay switch 2 pm': 'Relay Switch 2PM',
  'plug mini eu': 'Plug Mini (EU)',
  'plug mini jp': 'Plug Mini (JP)',
  'plug mini us': 'Plug Mini (US)',

  // Migration mappings for invalid/legacy device types
  'lock vision pro': 'Lock Vision Pro', // Valid alias; map to canonical
  // 'lock vision': 'Keypad Vision', // Invalid type (removed, now alias above)
  'lock touch': 'Keypad Touch', // Invalid type

  // Additional normalization for new/unknown types from logs
  'woplugus': 'Plug Mini (US)',
  // Removed duplicate keys below, only last occurrence kept
  // 'plug mini us': 'plug mini (us)', // duplicate, removed
  // 'plug us': 'plug mini (us)', // duplicate, removed
  // 'plug': 'plug', // duplicate, removed
  // 'air purifier pm2.5': 'air purifier pm2.5', // duplicate, removed
  // 'rgbic neon wire rope light': 'rgbic neon wire rope light', // duplicate, removed
  // 'candle warmer lamp': 'candle warmer lamp', // duplicate, removed
  // 'pan/tilt cam plus 3k': 'pan/tilt cam plus 3k', // duplicate, removed
  // 'remote with screen': 'remote with screen', // duplicate, removed
  // 'ai hub': 'ai hub', // duplicate, removed
  // 'lock vision pro': 'lock vision pro', // duplicate, remove this line
  // Add any other device types from logs as needed
}

/**
 * Get all valid device types as a flat set for validation
 */
export function getValidDeviceTypes(): Set<string> {
  const validTypes = new Set<string>()
  for (const category of Object.values(DEVICE_TYPES)) {
    for (const type of category) {
      validTypes.add(type)
    }
  }
  return validTypes
}

/**
 * Normalize and validate a device type, returning a valid type or null
 * @param deviceType The device type to validate/normalize
 * @returns Valid device type string or null if no valid mapping found
 */
export function normalizeDeviceType(deviceType: string | undefined | null): string | null {
  if (!deviceType || typeof deviceType !== 'string') {
    return null
  }

  const trimmed = deviceType.trim()
  const lowercase = trimmed.toLowerCase()

  // Check if already valid
  const validTypes = getValidDeviceTypes()
  if (validTypes.has(trimmed)) {
    return trimmed
  }

  // Check normalization map
  const normalized = DEVICE_TYPE_NORMALIZATION_MAP[lowercase]
  if (normalized && validTypes.has(normalized)) {
    return normalized
  }

  // No valid mapping found
  return null
}

/**
 * Check if a device type is valid
 * @param deviceType The device type to check
 * @returns true if device type is in DEVICE_TYPES
 */
export function isValidDeviceType(deviceType: string | undefined | null): boolean {
  if (!deviceType || typeof deviceType !== 'string') {
    return false
  }
  const validTypes = getValidDeviceTypes()
  return validTypes.has(deviceType.trim())
}
