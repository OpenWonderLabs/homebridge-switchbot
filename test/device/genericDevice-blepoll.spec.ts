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
