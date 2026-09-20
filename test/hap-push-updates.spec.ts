/* Copyright(C) 2021-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * hap-push-updates.spec.ts: polled values reach HomeKit, fallbacks do not
 */

import { describe, expect, it, vi } from 'vitest'

import { SwitchBotHAPPlatform } from '../src/SwitchBotHAPPlatform.js'

const ID = 'B0E9FED044E3'

/**
 * Drive the push directly with a stubbed platform, so the test covers the push
 * logic without standing up Homebridge.
 */
function platform(state: any, getters: Record<string, () => Promise<any>>) {
  const chars: Record<string, { updateValue: ReturnType<typeof vi.fn> }> = {}
  const entries = Object.entries(getters).map(([name, get]) => {
    chars[name] = { updateValue: vi.fn() }
    return { service: { getCharacteristic: () => chars[name] }, characteristic: { name }, get }
  })
  const device = { getState: vi.fn(async () => state) }
  const self: any = {
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    hapPushTargets: new Map([[ID, { device, entries }]]),
  }
  return {
    push: () => (SwitchBotHAPPlatform.prototype as any)._pushDeviceState.call(self, ID),
    chars,
    device,
    self,
  }
}

const READING = { temperature: 23.7, humidity: 59, co2: 403 }

describe('pushing polled values to HomeKit', () => {
  it('pushes every known value', async () => {
    const { push, chars } = platform(READING, {
      CurrentTemperature: async () => 23.7,
      CurrentRelativeHumidity: async () => 59,
    })

    await push()

    expect(chars.CurrentTemperature.updateValue).toHaveBeenCalledWith(23.7)
    expect(chars.CurrentRelativeHumidity.updateValue).toHaveBeenCalledWith(59)
  })

  // Pushing a fallback would replace a good value in HomeKit with one that
  // looks like a measurement, and nothing would correct it.
  it('pushes nothing when the device is unreadable', async () => {
    const { push, chars } = platform({ id: ID, type: 'meter', unreadable: true }, {
      CurrentTemperature: async () => 0,
      CurrentRelativeHumidity: async () => 0,
    })

    await push()

    expect(chars.CurrentTemperature.updateValue).not.toHaveBeenCalled()
    expect(chars.CurrentRelativeHumidity.updateValue).not.toHaveBeenCalled()
  })

  it('pushes nothing when reading the state throws', async () => {
    const { push, chars, device } = platform(READING, { CurrentTemperature: async () => 23.7 })
    device.getState.mockRejectedValueOnce(new Error('offline'))

    await push()

    expect(chars.CurrentTemperature.updateValue).not.toHaveBeenCalled()
  })

  it('pushes a genuine zero', async () => {
    const { push, chars } = platform({ ...READING, co2: 0 }, { CarbonDioxideLevel: async () => 0 })

    await push()

    expect(chars.CarbonDioxideLevel.updateValue).toHaveBeenCalledWith(0)
  })

  it('skips a value the getter does not know', async () => {
    const { push, chars } = platform(READING, {
      CurrentTemperature: async () => 23.7,
      BatteryLevel: async () => undefined,
    })

    await push()

    expect(chars.CurrentTemperature.updateValue).toHaveBeenCalledWith(23.7)
    expect(chars.BatteryLevel.updateValue).not.toHaveBeenCalled()
  })

  it('keeps going when one getter throws', async () => {
    const { push, chars } = platform(READING, {
      CurrentTemperature: async () => {
        throw new Error('read failed')
      },
      CurrentRelativeHumidity: async () => 59,
    })

    await push()

    expect(chars.CurrentTemperature.updateValue).not.toHaveBeenCalled()
    expect(chars.CurrentRelativeHumidity.updateValue).toHaveBeenCalledWith(59)
  })

  it('reads the device state once for the whole accessory', async () => {
    const { push, device } = platform(READING, {
      CurrentTemperature: async () => 23.7,
      CurrentRelativeHumidity: async () => 59,
      CarbonDioxideLevel: async () => 403,
    })

    await push()

    expect(device.getState).toHaveBeenCalledTimes(1)
  })

  it('does nothing for a device with no readable characteristics', async () => {
    const { push, self } = platform(READING, {})
    self.hapPushTargets.set(ID, { device: { getState: vi.fn() }, entries: [] })

    await expect(push()).resolves.toBeUndefined()
  })
})

describe('priming values at startup', () => {
  it('pushes every registered device once', async () => {
    const pushed: string[] = []
    const self: any = {
      log: { debug: vi.fn() },
      hapPushTargets: new Map([['a', {}], ['b', {}]]),
      _pushDeviceState: vi.fn(async (id: string) => {
        pushed.push(id)
      }),
    }

    ;(SwitchBotHAPPlatform.prototype as any).primeHapValues.call(self)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(pushed.sort()).toEqual(['a', 'b'])
  })

  it('does nothing when no devices are registered', () => {
    const self: any = { log: { debug: vi.fn() }, hapPushTargets: new Map(), _pushDeviceState: vi.fn() }

    expect(() => (SwitchBotHAPPlatform.prototype as any).primeHapValues.call(self)).not.toThrow()
    expect(self._pushDeviceState).not.toHaveBeenCalled()
  })
})
