import { describe, expect, it } from 'vitest'

import { normalizeDeviceType } from '../../src/device-types'
import { createDevice } from '../../src/deviceFactory'

// node-switchbot 5 reports product-specific identities (pySwitchbot 3.0.0 parity).
// Every identity must reach the same accessory class as its canonical display name.
describe('product-specific model identities', () => {
  const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }
  const dummyConfig = { logger: mockLogger, log: mockLogger }

  it.each([
    ['WoPlugUS', 'Plug Mini (US)'],
    ['WoPlugJP', 'Plug Mini (JP)'],
    ['WoCurtain3', 'Curtain3'],
    ['WoMeterPlus', 'Meter Plus'],
    ['WoTHPc', 'Meter Pro (CO2)'],
    ['WoCeilingPro', 'Ceiling Light Pro'],
    ['WoLinkMini', 'Hub Mini'],
    ['WoIOSensorTH', 'WoIOSensor'],
    ['Outdoor Meter', 'WoIOSensor'],
    ['Indoor/Outdoor Thermo-Hygrometer', 'WoIOSensor'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeDeviceType(input)).toBe(expected)
  })

  it.each([
    ['WoPlugUS', 'PlugMiniDevice'],
    ['Plug Mini (US)', 'PlugMiniDevice'],
    ['WoPlugJP', 'PlugMiniDevice'],
    ['Plug Mini (JP)', 'PlugMiniDevice'],
    ['WoCurtain3', 'Curtain3Device'],
    ['Curtain3', 'Curtain3Device'],
    ['WoMeterPlus', 'MeterDevice'],
    ['Meter Plus', 'MeterDevice'],
    ['WoTHPc', 'MeterDevice'],
    ['Meter Pro (CO2)', 'MeterDevice'],
    ['Meter Pro', 'MeterDevice'],
    ['WoCeilingPro', 'LightDevice'],
    ['Ceiling Light Pro', 'LightDevice'],
  ])('creates the right accessory for %s', async (type, className) => {
    const result = await createDevice({ id: `id-${type}`, type } as any, dummyConfig as any, false)
    expect(result.instance.constructor.name).toBe(className)
  })

  // OpenAPI-only light strip (node-switchbot 6.0.4: WoRGBICWWStripLight)
  it('normalizes Permanent Outdoor Lights and creates a light strip', async () => {
    expect(normalizeDeviceType('permanent outdoor lights')).toBe('Permanent Outdoor Lights')
    const result = await createDevice({ id: 'id-pol', type: 'Permanent Outdoor Lights' } as any, dummyConfig as any, false)
    expect(result.instance.constructor.name).toBe('LightStripDevice')
  })

  // pySwitchbot 3.2.0-3.8.1 products (node-switchbot 6.1.0)
  it.each([
    ['Lock Nano', 'Lock Nano', 'LockDevice'],
    ['UWB Lock', 'UWB Lock', 'LockDevice'],
    ['Lock Ultra Max', 'Smart Lock Ultra Max', 'LockDevice'],
    ['Smart Lock Ultra Max', 'Smart Lock Ultra Max', 'LockDevice'],
    ['Lock Ultra', 'Smart Lock Ultra', 'LockDevice'],
    ['Plug Mini (IT)', 'Plug Mini (IT)', 'PlugMiniDevice'],
    ['Outdoor Plug (EU)', 'Outdoor Plug (EU)', 'PlugMiniDevice'],
    ['Hub 4', 'Hub 4', 'GenericDevice'],
  ])('normalizes %s to %s and creates a %s', async (type, canonical, className) => {
    expect(normalizeDeviceType(type)).toBe(canonical)
    const result = await createDevice({ id: `id-${type}`, type } as any, dummyConfig as any, false)
    expect(result.instance.constructor.name).toBe(className)
  })
})
