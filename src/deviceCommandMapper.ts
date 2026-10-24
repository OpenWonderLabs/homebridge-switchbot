// deviceCommandMapper.ts
// Maps HAP/Matter commands to node-switchbot device methods.
//
// Accessories send generic commands (turnOn, setBrightness, setPosition, ...). Each command maps to
// the node-switchbot method that performs it, and is used when the device has that method. This
// works for every node-switchbot device class without listing device type strings, which differ
// between the OpenAPI ("Plug Mini (US)") and BLE ("Meter Plus") and were often missing here.

export type DeviceCommandHandler = (device: any, body: any) => Promise<any>

export interface DeviceCommandMap {
  [command: string]: DeviceCommandHandler
}

interface CommandSpec {
  /** Methods that can carry out the command; the first one the device has is used */
  methods: string[]
  handler: (device: any, body: any, method: string) => Promise<any>
}

function numberParameter(body: any): number {
  const value = Number(body?.parameter)
  if (!Number.isFinite(value)) {
    throw new TypeError(`Expected a number, got ${JSON.stringify(body?.parameter)}`)
  }
  return value
}

/**
 * HomeKit and Matter send color temperature in mireds (about 140-500); node-switchbot expects
 * kelvin (2700-6500). Values above 1000 are taken as kelvin already.
 */
export function toKelvin(value: number): number {
  const kelvin = value > 1000 ? value : 1_000_000 / value
  return Math.round(Math.min(6500, Math.max(2700, kelvin)))
}

/** Hue 0-360, saturation 0-100, at full value, to RGB 0-255 */
export function hsToRgb(hue: number, saturation: number): [number, number, number] {
  const h = (((hue % 360) + 360) % 360) / 60
  const s = Math.min(100, Math.max(0, saturation)) / 100
  const c = s
  const x = c * (1 - Math.abs((h % 2) - 1))
  const [r, g, b] = h < 1
    ? [c, x, 0]
    : h < 2
      ? [x, c, 0]
      : h < 3
        ? [0, c, x]
        : h < 4
          ? [0, x, c]
          : h < 5 ? [x, 0, c] : [c, 0, x]
  const m = 1 - c
  return [r, g, b].map(v => Math.round((v + m) * 255)) as [number, number, number]
}

/**
 * Parse a color parameter: `"hue,saturation"` (from HomeKit), `"r:g:b"` (OpenAPI style) or
 * `"#rrggbb"`.
 */
export function toRgb(parameter: unknown): [number, number, number] {
  const text = String(parameter ?? '').trim()
  const hex = /^#?([0-9a-f]{6})$/i.exec(text)
  if (hex) {
    const n = Number.parseInt(hex[1], 16)
    return [(n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF]
  }
  if (text.includes(':')) {
    const parts = text.split(':').map(Number)
    if (parts.length === 3 && parts.every(Number.isFinite)) {
      return parts.map(v => Math.round(Math.min(255, Math.max(0, v)))) as [number, number, number]
    }
  }
  if (text.includes(',')) {
    const [hue, saturation] = text.split(',').map(Number)
    if (Number.isFinite(hue) && Number.isFinite(saturation)) {
      return hsToRgb(hue, saturation)
    }
  }
  throw new TypeError(`Unrecognised color ${JSON.stringify(parameter)}`)
}

const call = (method: string) => ({ methods: [method], handler: (device: any) => device[method]() })

const commandSpecs: Record<string, CommandSpec> = {
  turnOn: call('turnOn'),
  turnOff: call('turnOff'),
  toggle: call('toggle'),
  press: call('press'),
  open: call('open'),
  close: call('close'),
  pause: call('pause'),
  lock: call('lock'),
  unlock: call('unlock'),
  setBrightness: {
    methods: ['setBrightness'],
    handler: (device, body) => device.setBrightness(numberParameter(body)),
  },
  setColorTemperature: {
    methods: ['setColorTemperature', 'setColorTemp'],
    handler: (device, body, method) => {
      const kelvin = toKelvin(numberParameter(body))
      return method === 'setColorTemp' ? device.setColorTemp(2700, 6500, kelvin) : device.setColorTemperature(kelvin)
    },
  },
  setColor: {
    methods: ['setColor'],
    handler: (device, body) => device.setColor(...toRgb(body?.parameter)),
  },
  setPosition: {
    methods: ['setPosition'],
    handler: (device, body) => device.setPosition(numberParameter(body)),
  },
  setFanSpeed: {
    methods: ['setFanSpeed', 'setSpeed'],
    handler: (device, body, method) => device[method](numberParameter(body)),
  },
  setMode: {
    methods: ['setMode'],
    handler: (device, body) => device.setMode(body?.parameter),
  },
  setHumidity: {
    methods: ['setTargetHumidity', 'setHumidity', 'setLevel'],
    handler: (device, body, method) => device[method](numberParameter(body)),
  },
  // Vacuums: node-switchbot uses cleanUp/returnToDock with the BLE protocol version
  start: {
    methods: ['cleanUp', 'start'],
    handler: (device, body, method) => method === 'cleanUp' ? device.cleanUp(Number(body?.protocolVersion) || 1) : device.start(),
  },
  dock: {
    methods: ['returnToDock', 'dock'],
    handler: (device, body, method) => method === 'returnToDock' ? device.returnToDock(Number(body?.protocolVersion) || 1) : device.dock(),
  },
  stop: {
    methods: ['returnToDock', 'stop', 'pause'],
    handler: (device, body, method) => method === 'returnToDock' ? device.returnToDock(Number(body?.protocolVersion) || 1) : device[method](),
  },
}

/** Commands this module can map, for documentation and tests */
export const supportedCommands = Object.keys(commandSpecs)

/**
 * Get the handler for a command on a node-switchbot device, or undefined when the device has no
 * method for it. `deviceType` is kept for callers and logging; dispatch uses the device itself.
 */
export function getDeviceCommandHandler(deviceType: string, command: string, device?: any): DeviceCommandHandler | undefined {
  const spec = Object.hasOwn(commandSpecs, command) ? commandSpecs[command] : undefined
  if (!spec) {
    return undefined
  }
  const method = device ? spec.methods.find(name => typeof device[name] === 'function') : spec.methods[0]
  if (!method) {
    return undefined
  }
  return async (target: any, body: any) => spec.handler(target, body, method)
}
