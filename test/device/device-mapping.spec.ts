import { describe, expect, it } from 'vitest'

import { isValidDeviceType, normalizeDeviceType } from '../../src/device-types'

describe('device Type Mapping', () => {
  it('should normalize Bot device type to canonical', () => {
    const norm = normalizeDeviceType('Bot')
    expect(norm).toBe('Bot')
    expect(isValidDeviceType(norm)).toBe(true)
  })

  it('should normalize Curtain device type to canonical', () => {
    const norm = normalizeDeviceType('Curtain')
    expect(norm).toBe('Curtain')
    expect(isValidDeviceType(norm)).toBe(true)
  })

  it('should return null for unknown device type', () => {
    const norm = normalizeDeviceType('UnknownType')
    expect(norm).toBeNull()
    expect(isValidDeviceType(norm)).toBe(false)
  })
})
