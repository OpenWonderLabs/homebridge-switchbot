import { describe, expect, it } from 'vitest'

import { DeviceBase } from '../../src/devices/deviceBase'

describe('deviceBase', () => {
  const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }

  // Concrete subclass for testing abstract DeviceBase
  class TestDevice extends DeviceBase {
    // Implement required abstract methods with no-op or dummy values
    async getState() { return {} }
    async setState() { return {} }
  }

  it('should instantiate with default properties', () => {
    const device = new TestDevice({ id: 'test', type: 'Unknown', log: mockLogger }, { logger: mockLogger })
    // DeviceBase stores options in .opts and config in .cfg
    expect((device as any).opts.id).toBe('test')
    expect((device as any).opts.type).toBe('Unknown')
    expect(device).toHaveProperty('opts')
    expect(device).toHaveProperty('cfg')
  })

  // Remove event emitter test, as DeviceBase does not implement on/emit by default
  // Add more base behavior/event tests as needed
})
