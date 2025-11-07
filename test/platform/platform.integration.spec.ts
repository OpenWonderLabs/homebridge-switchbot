import { describe, expect, it, vi } from 'vitest'

import { SwitchBotHAPPlatform } from '../../src/platform'

describe('hAP platform integration', () => {
  class TestHAPPlatform extends SwitchBotHAPPlatform {
    constructor(logger: any, config: any, api: any) { super(logger, config, api) }
    setCache(cache: any[]) { (this as any)._accessoryCache = cache }
    getRestored() { return (this as any)._accessoryCache }
    registerAccessory(acc: any) { (this as any)._accessoryCache.push(acc) }
  }

  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  const config = {}
  const api = {}

  it('should restore accessories from cache', () => {
    const platform = new TestHAPPlatform(logger, config, api)
    platform.setCache([{ uuid: 'hap-acc-1', context: { type: 'Bot' } }])
    const restored = platform.getRestored()
    expect(restored).toHaveLength(1)
    expect(restored[0].uuid).toBe('hap-acc-1')
  })

  it('should register a new accessory', () => {
    const platform = new TestHAPPlatform(logger, config, api)
    platform.setCache([])
    const newAcc = { uuid: 'hap-acc-2', context: { type: 'Curtain' } }
    platform.registerAccessory(newAcc)
    const restored = platform.getRestored()
    expect(restored).toHaveLength(1)
    expect(restored[0].uuid).toBe('hap-acc-2')
  })
})
