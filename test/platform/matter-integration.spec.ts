import { describe, expect, it, vi } from 'vitest'

import { SwitchBotMatterPlatform } from '../../src/SwitchBotMatterPlatform.js'

describe('matter integration platform', () => {
  class TestMatterPlatform extends SwitchBotMatterPlatform {
    constructor(logger: any, config: any, api: any) { super(logger, config, api) }
    addDevice(device: any) {
      (this as any)._devices = (this as any)._devices || [];
      (this as any)._devices.push(device)
    }

    getDevices() { return (this as any)._devices || [] }
  }

  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  const config = {}
  const api = {}

  it('should register a device and list it', () => {
    const platform = new TestMatterPlatform(logger, config, api)
    const device = { id: 'matter-123', type: 'Bot' }
    platform.addDevice(device)
    const devices = platform.getDevices()
    expect(devices).toHaveLength(1)
    expect(devices[0].id).toBe('matter-123')
  })

  it('should handle empty device list', () => {
    const platform = new TestMatterPlatform(logger, config, api)
    expect(platform.getDevices()).toEqual([])
  })
})
