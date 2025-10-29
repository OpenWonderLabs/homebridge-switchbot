import { describe, expect, it } from 'vitest'

import { SwitchBotMatterPlatform } from '../../platform-matter.js'
import { makeApiStub, makeLogStub } from '../helpers/platform-fixtures.js'

/**
 * Verifies that debug logger formats arguments so that accessory displayName
 * appears in the output for cached accessory load logs.
 */
describe('platform-matter logging', () => {
  it('prints accessory name when loading cached Matter accessory', async () => {
    const api: any = makeApiStub()
    const log: any = makeLogStub()

    const platform = new SwitchBotMatterPlatform(log as any, {
      name: 'SwitchBot',
      credentials: {},
      options: { logging: 'debug' },
    } as any, api)

    // Simulate Homebridge restoring a cached Matter accessory
    const acc: any = { uuid: 'uuid-TEST', displayName: 'Test Device', context: { deviceId: 'DEV1' } }
    ;(platform as any).configureMatterAccessory(acc)
    // debugLog is async and gated; yield to allow the logger to run
    await new Promise(resolve => setTimeout(resolve, 0))

    // In 'debug' mode, debugLog uses log.info with a [DEBUG] prefix
    // Ensure one of the info calls contains the message with the device name
    const calls = (log.info as any).mock.calls as Array<string[]>
    const hasLine = calls.some(args => String(args[0]).includes('Loading cached Matter accessory: Test Device'))
    expect(hasLine).toBe(true)
  })
})
