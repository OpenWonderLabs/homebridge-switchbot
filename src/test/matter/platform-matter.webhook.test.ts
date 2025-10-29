import { describe, expect, it } from 'vitest'

import { SwitchBotMatterPlatform } from '../../platform-matter.js'
import { makeApiStub, makeLogStub } from '../helpers/platform-fixtures.js'

/**
 * Verify that Matter accessories receive the effective webhook flag
 * in their context when a global webhook option is enabled and the
 * per-device webhook setting is undefined.
 */
describe('platform-matter webhook context propagation', () => {
  it('sets context.webhook=true when global webhook is enabled and device.webhook is undefined', async () => {
    const api: any = makeApiStub()
    const log: any = makeLogStub()

    const platform = new SwitchBotMatterPlatform(log as any, {
      name: 'SwitchBot',
      options: { webhook: true },
    } as any, api)

    // Minimal device that maps to a known Matter accessory constructor
    const dev: any = {
      deviceId: 'DEV-WH-1',
      deviceName: 'Webhook Plug',
      deviceType: 'Plug',
      // webhook intentionally undefined to test fallback
    }

    const acc = await (platform as any).createAccessoryFromDevice(dev)
    expect(acc).toBeDefined()
    expect((acc as any).context?.webhook).toBe(true)
  })

  it('keeps explicit device.webhook=false even when global webhook is true', async () => {
    const api: any = makeApiStub()
    const log: any = makeLogStub()

    const platform = new SwitchBotMatterPlatform(log as any, {
      name: 'SwitchBot',
      options: { webhook: true },
    } as any, api)

    const dev: any = {
      deviceId: 'DEV-WH-2',
      deviceName: 'No Webhook Plug',
      deviceType: 'Plug',
      webhook: false,
    }

    const acc = await (platform as any).createAccessoryFromDevice(dev)
    expect(acc).toBeDefined()
    expect((acc as any).context?.webhook).toBe(false)
  })
})
