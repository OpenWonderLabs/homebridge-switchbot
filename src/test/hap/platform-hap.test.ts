/* eslint-disable import/first */
import { describe, expect, it, vi } from 'vitest'
// Mock modules used by the HAP platform constructor to avoid requiring a real Homebridge API
vi.mock('fakegato-history', () => ({ default: () => ({}) }))
vi.mock('homebridge-lib/EveHomeKitTypes', () => ({ EveHomeKitTypes: class { constructor() {} } }))

import { SwitchBotHAPPlatform } from '../../platform-hap.js'
import { makeLogStub } from '../helpers/platform-fixtures.js'

/**
 * High-level smoke tests for the HAP platform to ensure it initializes,
 * subscribes to lifecycle events, and handles cached accessories.
 */
describe('platform-hap (smoke)', () => {
  it('initializes and subscribes to didFinishLaunching', async () => {
    const api: any = { on: vi.fn() }
    const log: any = makeLogStub()

    // Enable debug so debug* logs print via our shared logger
    // Construct the platform (smoke)
    new SwitchBotHAPPlatform(log as any, {
      name: 'SwitchBot',
      credentials: {},
      options: { logging: 'debug' },
      devices: [],
    } as any, api)

    // Should register didFinishLaunching handler
    expect(api.on).toHaveBeenCalled()
    const calledWithDL = (api.on as any).mock.calls.some((args: any[]) => args[0] === 'didFinishLaunching' && typeof args[1] === 'function')
    expect(calledWithDL).toBe(true)

    // Should log effective platform logging at startup
    const debugCalls = (log.debug as any).mock.calls as Array<string[]>
    const hasStartupLine = debugCalls.some(args => String(args[0]).includes('[SwitchBot HAP] effective platformLogging='))
    expect(hasStartupLine).toBe(true)

    // Missing credentials results in a debug error log
    // Allow async platform logger to flush
    await new Promise(resolve => setTimeout(resolve, 0))
    const errorCalls = (log.error as any).mock.calls as Array<string[]>
    const hasMissingCreds = errorCalls.some(args => String(args[0]).includes('Missing SwitchBot API credentials'))
    expect(hasMissingCreds).toBe(true)
  })

  it('adds cached accessories via configureAccessory', async () => {
    const api: any = { on: vi.fn() }
    const log: any = makeLogStub()

    const platform = new SwitchBotHAPPlatform(log as any, {
      name: 'SwitchBot',
      credentials: {},
      options: { logging: 'debug' },
      devices: [],
    } as any, api)

    const accessory: any = { displayName: 'Cached Device' }
    await (platform as any).configureAccessory(accessory)

    // Should be stored in platform.accessories
    expect(Array.isArray((platform as any).accessories)).toBe(true)
    expect((platform as any).accessories.length).toBe(1)

    // And should log the cache load message including device name
    await new Promise(resolve => setTimeout(resolve, 0))
    const infoCalls = (log.info as any).mock.calls as Array<string[]>
    const hasLine = infoCalls.some(args => String(args[0]).includes('Loading accessory from cache: Cached Device'))
    expect(hasLine).toBe(true)
  })
})
