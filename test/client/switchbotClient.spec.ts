import { describe, expect, it, vi } from 'vitest'

import { SwitchBotClient } from '../../src/switchbotClient'

describe('switchBotClient', () => {
  it('should throw if logger is missing in config', () => {
    expect(() => new SwitchBotClient({} as any)).toThrow('SwitchBotClient requires a logger')
  })

  it('should initialize with logger and config', () => {
    const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
    const cfg = { logger }
    const client = new SwitchBotClient(cfg as any)
    expect(client).toBeDefined()
  })

  it('should set custom debounce from config', () => {
    const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
    const cfg = { logger, writeDebounceMs: 321 }
    const client = new SwitchBotClient(cfg as any)
    expect((client as any).writeDebounceMs).toBe(321)
  })

  it('should prefer managed devices before discovery', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    const client = new SwitchBotClient({ logger } as any)

    const managedDevices = [{ id: 'managed-1' }]
    const discover = vi.fn().mockResolvedValue([{ id: 'discovered-1' }])
    ;(client as any).client = {
      devices: {
        list: () => managedDevices,
        get: () => managedDevices[0],
      },
      discover,
    }

    const devices = await client.getDevices()
    const device = await client.getDevice('managed-1')

    expect(devices).toEqual(managedDevices)
    expect(device).toEqual(managedDevices[0])
    expect(discover).not.toHaveBeenCalled()
  })

  it('should discover device when manager does not have it', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    const client = new SwitchBotClient({ logger } as any)

    const discovered = { id: 'abc123' }
    const discover = vi.fn().mockResolvedValue([discovered])
    ;(client as any).client = {
      devices: {
        list: () => [],
        get: () => undefined,
      },
      discover,
    }

    const out = await client.getDevice('abc123')
    expect(out).toEqual(discovered)
    expect(discover).toHaveBeenCalledTimes(1)
  })
})
