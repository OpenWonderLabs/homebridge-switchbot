import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { buildBotBleCommand, validateBotPassword } from './utils.js'

describe('Bot BLE helpers', () => {
  it('builds plain Bot BLE command bytes without password', () => {
    expect(buildBotBleCommand(0x00)).toEqual(Buffer.from([0x57, 0x01, 0x00]))
    expect(buildBotBleCommand(0x01)).toEqual(Buffer.from([0x57, 0x01, 0x01]))
    expect(buildBotBleCommand(0x02)).toEqual(Buffer.from([0x57, 0x01, 0x02]))
  })

  it('builds encrypted Bot BLE command bytes with password', () => {
    expect(buildBotBleCommand(0x01, 'A1b2')).toEqual(Buffer.from([0x57, 0x11, 0xB8, 0x59, 0x37, 0x46, 0x01]))
    expect(buildBotBleCommand(0x01, 'A1b2').length).toBe(7)
  })

  it('validates password format', () => {
    expect(() => validateBotPassword('A1b2')).not.toThrow()
    expect(() => validateBotPassword('abc')).toThrow()
    expect(() => validateBotPassword('abcde')).toThrow()
    expect(() => validateBotPassword('ab!2')).toThrow()
  })

  it('uses case-sensitive CRC32 for password bytes', () => {
    const upper = buildBotBleCommand(0x00, 'Ab1C')
    const lower = buildBotBleCommand(0x00, 'ab1c')
    expect(upper.equals(lower)).toBe(false)
  })
})
