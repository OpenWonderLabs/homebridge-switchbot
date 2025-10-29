/* eslint-disable import/first */
import { describe, expect, it, vi } from 'vitest'
// Mock modules used by the HAP platform constructor to avoid requiring a real Homebridge API
vi.mock('fakegato-history', () => ({ default: () => ({}) }))
vi.mock('homebridge-lib/EveHomeKitTypes', () => ({ EveHomeKitTypes: class { constructor() {} } }))

import { SwitchBotHAPPlatform } from '../../platform-hap.js'
import { makeLogStub } from '../helpers/platform-fixtures.js'

/**
 * Verifies that HAP platform debug logger includes the accessory displayName
 * when loading an accessory from the cache.
 */
describe('platform-hap logging', () => {
  it('prints accessory name when loading HAP cached accessory', async () => {
    const api: any = { on: vi.fn() }
    const log: any = makeLogStub()

    const platform = new SwitchBotHAPPlatform(log as any, {
      name: 'SwitchBot',
      credentials: {},
      options: { logging: 'debug' },
      devices: [],
    } as any, api)

    const accessory: any = { displayName: 'Test HAP Device' }
    await (platform as any).configureAccessory(accessory)

    // Allow async logger to flush
    await new Promise(resolve => setTimeout(resolve, 0))

    const calls = (log.info as any).mock.calls as Array<string[]>
    const hasLine = calls.some(args => String(args[0]).includes('Loading accessory from cache: Test HAP Device'))
    expect(hasLine).toBe(true)
  })
})
