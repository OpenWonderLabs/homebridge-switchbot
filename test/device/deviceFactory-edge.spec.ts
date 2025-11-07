import { describe, expect, it } from 'vitest'

import { createDevice } from '../../src/deviceFactory'

describe('deviceFactory edge cases', () => {
  it('should throw if config is missing (logger required)', async () => {
    await expect(createDevice({ id: 'abc', type: 'Bot' }, undefined as any, false)).rejects.toThrow('logger')
  })
  it('should handle unknown protocol', async () => {
    const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
    const result = await createDevice({ id: 'abc', type: 'Bot', protocol: 'unknown', log: mockLogger }, { logger: mockLogger } as any, false)
    expect(result).toBeDefined()
  })
  // Add more edge case tests as needed
})
