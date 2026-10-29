import { SwitchBot } from 'node-switchbot'
import { describe, expect, it, vi } from 'vitest'

import { hsToRgb, toKelvin, toRgb } from '../../src/deviceCommandMapper'
import { SwitchBotClient } from '../../src/switchbotClient'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

// Drive real node-switchbot devices (OpenAPI only) through the plugin client and record what
// reaches the OpenAPI. Commands used to be looked up by device type string, and most real types
// ("Plug Mini (US)", "Strip Light", "Lock Pro", ...) had no entry, so they failed as unsupported.
async function send(deviceType: string, ...bodies: any[]) {
  const switchbot = new SwitchBot({
    enableBLE: false,
    token: 'token',
    secret: 'secret',
    enableRetry: false,
  })
  const api = switchbot.getAPIClient()!
  vi.spyOn(api, 'getDevices').mockResolvedValue({
    deviceList: [
      {
        deviceId: 'DEV',
        deviceName: 'Test',
        deviceType,
        enableCloudService: true,
        hubDeviceId: 'HUB',
      },
    ],
    infraredRemoteList: [],
  } as any)
  const sendCommand = vi.spyOn(api, 'sendCommand').mockResolvedValue({ statusCode: 100, message: 'success', body: {} } as any)
  const client = new SwitchBotClient({ logger, writeDebounceMs: 0 } as any)
  ;(client as any).client = switchbot
  for (const body of bodies) {
    await client.setDeviceState('DEV', body)
  }
  return sendCommand.mock.calls.map(([, command, parameter]) => [command, parameter])
}

describe('commands reach node-switchbot devices', () => {
  it.each([
    'Plug Mini (US)',
    'Plug Mini (JP)',
    'Plug',
    'Relay Switch 1',
    'Strip Light',
    'Color Bulb',
    'Ceiling Light',
  ])('%s turns on and off', async (type) => {
    expect(await send(type, { command: 'turnOn' }, { command: 'turnOff' })).toEqual([
      ['turnOn', undefined],
      ['turnOff', undefined],
    ])
  })

  it('lock Pro locks and unlocks', async () => {
    const calls = await send('Smart Lock Pro', { command: 'lock' }, { command: 'unlock' })
    expect(calls.map(([command]) => command)).toEqual(['lock', 'unlock'])
  })

  // Brightness arrives as a string; color as "hue,saturation"; color temperature in mireds.
  it('color Bulb converts brightness, color and color temperature', async () => {
    const calls = await send(
      'Color Bulb',
      { command: 'setBrightness', parameter: '40' },
      { command: 'setColor', parameter: '120,100' },
      { command: 'setColorTemperature', parameter: '250' },
    )
    expect(calls).toEqual([
      ['setBrightness', 40],
      ['setColor', '0:255:0'],
      ['setColorTemperature', 4000],
    ])
  })

  it('curtain and Blind Tilt set their position', async () => {
    expect(await send('Curtain3', { command: 'setPosition', parameter: '30' })).toEqual([
      ['setPosition', '0,ff,30'],
    ])
    expect(await send('Blind Tilt', { command: 'setPosition', parameter: '50' })).toEqual([
      ['setPosition', 'down;100'],
    ])
  })

  it('a vacuum starts and docks', async () => {
    expect(await send('K10+', { command: 'start' }, { command: 'dock' })).toEqual([
      ['start', undefined],
      ['dock', undefined],
    ])
  })

  it('an unsupported command is rejected', async () => {
    await expect(send('Meter', { command: 'turnOn' })).rejects.toThrow('Unsupported command')
  })
})

describe('parameter conversion', () => {
  it('converts mireds to kelvin and passes kelvin through', () => {
    expect(toKelvin(140)).toBe(6500)
    expect(toKelvin(500)).toBe(2700)
    expect(toKelvin(4000)).toBe(4000)
  })

  it('converts hue and saturation to RGB', () => {
    expect(hsToRgb(0, 100)).toEqual([255, 0, 0])
    expect(hsToRgb(240, 100)).toEqual([0, 0, 255])
    expect(hsToRgb(0, 0)).toEqual([255, 255, 255])
  })

  it('accepts hex and r:g:b colors', () => {
    expect(toRgb('#FF8000')).toEqual([255, 128, 0])
    expect(toRgb('10:20:30')).toEqual([10, 20, 30])
    expect(() => toRgb('nope')).toThrow('Unrecognised color')
  })
})
