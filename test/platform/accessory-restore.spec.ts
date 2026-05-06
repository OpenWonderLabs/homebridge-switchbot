import { describe, expect, it } from 'vitest'

import { SwitchBotHAPPlatform } from '../../src/Platform.HAP.js'
import { SwitchBotMatterPlatform } from '../../src/Platform.Matter.js'

describe('accessory restoration', () => {
  class TestHAPPlatform extends SwitchBotHAPPlatform {
    constructor(logger: any, config: any, api: any) { super(logger, config, api) }
    setCache(cache: any[]) { (this as any)._accessoryCache = cache }
    getRestored() { return (this as any)._accessoryCache }
  }
  class TestMatterPlatform extends SwitchBotMatterPlatform {
    constructor(logger: any, config: any, api: any) { super(logger, config, api) }
    setCache(cache: any[]) { (this as any)._accessoryCache = cache }
    getRestored() { return (this as any)._accessoryCache }
  }

  const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
  const config = {}
  const api = {}

  it('should restore HAP accessories from cache', () => {
    const platform = new TestHAPPlatform(logger, config, api)
    platform.setCache([{ uuid: 'hap-1', context: { type: 'Bot' } }])
    const restored = platform.getRestored()
    expect(restored).toHaveLength(1)
    expect(restored[0].uuid).toBe('hap-1')
  })

  it('should restore Matter accessories from cache', () => {
    const platform = new TestMatterPlatform(logger, config, api)
    platform.setCache([{ uuid: 'matter-1', context: { type: 'Curtain' } }])
    const restored = platform.getRestored()
    expect(restored).toHaveLength(1)
    expect(restored[0].uuid).toBe('matter-1')
  })
})
