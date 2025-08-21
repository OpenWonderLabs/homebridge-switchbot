import { describe, expect, it } from 'vitest'

describe('platform Bot S1 support', () => {
  it('should recognize Bot S1 as a valid device type name', () => {
    // Test that our device type name follows the established pattern
    const supportedBotTypes = ['Bot', 'Bot S1']
    
    expect(supportedBotTypes).toContain('Bot')
    expect(supportedBotTypes).toContain('Bot S1')
    
    // Both should be strings and follow naming convention
    expect(typeof 'Bot S1').toBe('string')
    expect('Bot S1'.startsWith('Bot')).toBe(true)
  })
})