import { describe, expect, it, vi } from 'vitest'

import { SwitchBotMatterPlatform } from '../../src/SwitchBotMatterPlatform.js'

function makeApi(failFor?: string) {
  const registered = new Set<string>()
  const matter = {
    uuid: {
      generate: (id: string) => `uuid-${id}`,
    },
    deviceTypes: {},
    registerPlatformAccessories: vi.fn(async (_p: string, _n: string, accessories: any[]) => {
      for (const a of accessories) {
        if (a.UUID === failFor) {
          throw new Error('boom')
        }
        if (registered.has(a.UUID)) {
          throw new Error(`Matter accessory with UUID ${a.UUID} is already registered`)
        }
        registered.add(a.UUID)
      }
    }),
    updatePlatformAccessories: vi.fn(async () => {}),
    unregisterPlatformAccessories: vi.fn(async () => {}),
  }
  return {
    api: {
      matter,
      on: vi.fn(),
    } as any,
    matter,
  }
}

function created(name: string) {
  return {
    created: {
      createAccessory: async () => ({
        name,
        clusters: {
          onOff: { onOff: false },
        },
      }),
    },
    d: { id: name, name },
    type: 'plug',
    useMatter: true,
    matterAvailable: true,
  }
}

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  success: vi.fn(),
} as any

describe('matter accessory registration', () => {
  it('updates instead of re-registering on a second load (config reload)', async () => {
    const { api, matter } = makeApi()
    const platform = new SwitchBotMatterPlatform(log, { platform: 'SwitchBot' } as any, api)
    await platform.registerMatterAccessories([
      created('a'),
    ])
    await platform.registerMatterAccessories([
      created('a'),
    ])
    expect(matter.registerPlatformAccessories).toHaveBeenCalledTimes(1)
    expect(matter.updatePlatformAccessories).toHaveBeenCalledTimes(1)
  })

  it('registers cache-restored accessories so handlers attach', async () => {
    const { api, matter } = makeApi()
    const platform = new SwitchBotMatterPlatform(log, { platform: 'SwitchBot' } as any, api)
    platform.configureMatterAccessory({
      UUID: 'uuid-a',
      displayName: 'a',
      context: { deviceId: 'a' },
      _restoredFromCache: true,
    })
    await platform.registerMatterAccessories([
      created('a'),
    ])
    expect(matter.registerPlatformAccessories).toHaveBeenCalledTimes(1)
    expect(matter.registerPlatformAccessories.mock.calls[0][2][0].handlers).toBeDefined()
  })

  it('one failing accessory does not stop the others', async () => {
    const { api, matter } = makeApi('uuid-a')
    const platform = new SwitchBotMatterPlatform(log, { platform: 'SwitchBot' } as any, api)
    await platform.registerMatterAccessories([
      created('a'),
      created('b'),
    ])
    const uuids = matter.registerPlatformAccessories.mock.calls.map(c => c[2][0].UUID)
    expect(uuids).toEqual(['uuid-a', 'uuid-b'])
    // 'a' failed, so it is registered (not updated) on the next attempt
    await platform.registerMatterAccessories([
      created('a'),
    ])
    expect(matter.registerPlatformAccessories).toHaveBeenCalledTimes(3)
  })
})
