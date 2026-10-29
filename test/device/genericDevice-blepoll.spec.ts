import { describe, expect, it, vi } from 'vitest'

import { GenericDevice } from '../../src/devices/genericDevice'

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}

describe('genericDevice BLE polling config', () => {
  it('enforces minimum blePollIntervalMs', () => {
    const device = new GenericDevice({
      id: 'test',
      type: 'Unknown',
      log: mockLogger,
      blePollingEnabled: true,
      blePollIntervalMs: 1000, // too low
    }, { log: mockLogger })
    // Should clamp to 60000
    expect((device as any)._blePollIntervalMs).toBe(60000)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid blePollIntervalMs'),
    )
  })

  it('accepts valid blePollIntervalMs', () => {
    const device = new GenericDevice({
      id: 'test',
      type: 'Unknown',
      log: mockLogger,
      blePollingEnabled: true,
      blePollIntervalMs: 300000,
    }, { log: mockLogger })
    expect((device as any)._blePollIntervalMs).toBe(300000)
  })

  it('uses default when not set', () => {
    const device = new GenericDevice({
      id: 'test',
      type: 'Unknown',
      log: mockLogger,
    }, { log: mockLogger })
    expect((device as any)._blePollIntervalMs).toBe(600000)
  })
})

// "BLE polling" called getState() for every device every 10 minutes, even with BLE disabled or for
// a cloud-only device. getState() then reads status over the OpenAPI, outside the plugin's daily
// API budget and on top of the normal refresh, which can use up the 10,000 calls a day.
describe('genericDevice BLE polling only polls over BLE', () => {
  function device(cfg: Record<string, unknown>, hasBLE: boolean | undefined) {
    const nodeDevice = hasBLE === undefined
      ? undefined
      : {
          hasBLE: () => hasBLE,
        }
    const client = {
      devices: {
        get: () => nodeDevice,
      },
      getDevice: vi.fn(async () => nodeDevice),
    }
    const d = new GenericDevice({
      id: 'dev',
      type: 'Unknown',
      log: mockLogger,
      blePollIntervalMs: 60_000,
    }, { log: mockLogger, _client: client, ...cfg } as any)
    const getState = vi.spyOn(d, 'getState').mockResolvedValue({})
    return { d, getState }
  }

  it('does not start when BLE is disabled', () => {
    const { d } = device({ enableBLE: false }, true)
    expect((d as any)._blePollTimer).toBeNull()
  })

  it('skips devices without a BLE connection', async () => {
    vi.useFakeTimers()
    try {
      const { d, getState } = device({}, false)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(getState).not.toHaveBeenCalled()
      await d.destroy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('polls devices that have BLE', async () => {
    vi.useFakeTimers()
    try {
      const { d, getState } = device({}, true)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(getState).toHaveBeenCalledOnce()
      await d.destroy()
    } finally {
      vi.useRealTimers()
    }
  })
})
