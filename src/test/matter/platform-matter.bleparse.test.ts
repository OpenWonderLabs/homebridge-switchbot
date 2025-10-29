import { describe, expect, it, vi } from 'vitest'

import { SwitchBotMatterPlatform } from '../../platform-matter.js'
import { makeApiStub, makeLogStub } from '../helpers/platform-fixtures.js'

describe('platform-matter BLE advertisement parser', () => {
  it('parses extended serviceData fields correctly', () => {
    const updateAccessoryState = vi.fn()
    const api: any = makeApiStub({ updateAccessoryState })

    const log: any = makeLogStub()
    const platform = new SwitchBotMatterPlatform(log as any, {} as any, api)

    const dev: any = { deviceId: 'DEV-TEST' }
    const sd = {
      temp: 22.3,
      humid: 45,
      pm25: 12,
      pm10: 34,
      voc: 120,
      co2: 420,
      motion: 1,
      open: 0,
      leak: 0,
      position: 30,
      fanSpeed: 75,
      battery: 88,
      rgb: '255:128:64',
    }

    const parsed = (platform as any).parseAdvertisementForDevice(dev, sd)
    expect(parsed).toBeTruthy()
    expect(parsed.temperature).toBeCloseTo(22.3)
    expect(parsed.humidity).toBe(45)
    expect(parsed.pm25).toBe(12)
    expect(parsed.pm10).toBe(34)
    expect(parsed.voc).toBe(120)
    expect(parsed.co2).toBe(420)
    expect(parsed.motion).toBeTruthy()
    expect(parsed.contact).toBeDefined()
    expect(parsed.leak).toBeFalsy()
    expect(parsed.position).toBe(30)
    expect(parsed.fanSpeed).toBe(75)
    expect(parsed.battery).toBe(88)
    expect(parsed.color).toEqual({ r: 255, g: 128, b: 64 })
  })
})
