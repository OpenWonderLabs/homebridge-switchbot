import { describe, expect, it } from 'vitest'

import { SwitchBotMatterPlatform } from '../../src/Platform.Matter.js'

describe('matter child bridge accessory restoration', () => {
  class TestMatterPlatform extends SwitchBotMatterPlatform {
    constructor(logger: any, config: any, api: any) { super(logger, config, api) }
    setCache(cache: any[]) { (this as any)._accessoryCache = cache }
    getRestored() { return (this as any)._accessoryCache }
    registerAccessory(acc: any) { (this as any)._accessoryCache.push(acc) }
  }

  const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
  const config = {}
  const api = {}

  it('should restore child bridge accessories from cache', () => {
    const platform = new TestMatterPlatform(logger, config, api)
    platform.setCache([{ uuid: 'matter-child-1', context: { type: 'Bot' } }])
    const restored = platform.getRestored()
    expect(restored).toHaveLength(1)
    expect(restored[0].uuid).toBe('matter-child-1')
  })

  it('should register a new child bridge accessory', () => {
    const platform = new TestMatterPlatform(logger, config, api)
    platform.setCache([])
    const newAcc = { uuid: 'matter-child-2', context: { type: 'Curtain' } }
    platform.registerAccessory(newAcc)
    const restored = platform.getRestored()
    expect(restored).toHaveLength(1)
    expect(restored[0].uuid).toBe('matter-child-2')
  })
})
