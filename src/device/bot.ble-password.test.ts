import { Buffer } from 'node:buffer'

import type { WoHand } from 'node-switchbot'
import { describe, expect, it, vi } from 'vitest'

import { executeBotBleAction } from './bot.js'

describe('executeBotBleAction', () => {
  it('uses legacy press/turnOn/turnOff methods when no password is configured', async () => {
    const device = {
      press: vi.fn().mockResolvedValue(undefined),
      turnOn: vi.fn().mockResolvedValue(undefined),
      turnOff: vi.fn().mockResolvedValue(undefined),
      command: vi.fn(),
    }
    const botDevice = device as unknown as WoHand

    await executeBotBleAction(botDevice, 0x00)
    await executeBotBleAction(botDevice, 0x01)
    await executeBotBleAction(botDevice, 0x02)

    expect(device.press).toHaveBeenCalledOnce()
    expect(device.turnOn).toHaveBeenCalledOnce()
    expect(device.turnOff).toHaveBeenCalledOnce()
    expect(device.command).not.toHaveBeenCalled()
  })

  it('uses encrypted command path when password is configured', async () => {
    const device = {
      press: vi.fn().mockResolvedValue(undefined),
      turnOn: vi.fn().mockResolvedValue(undefined),
      turnOff: vi.fn().mockResolvedValue(undefined),
      command: vi.fn().mockResolvedValue(Buffer.from([0x01, 0x00, 0x00])),
    }
    const botDevice = device as unknown as WoHand

    await executeBotBleAction(botDevice, 0x01, 'A1b2')

    expect(device.command).toHaveBeenCalledOnce()
    expect(device.command).toHaveBeenCalledWith(Buffer.from([0x57, 0x11, 0xB8, 0x59, 0x37, 0x46, 0x01]))
    expect(device.turnOn).not.toHaveBeenCalled()
  })

  it('throws on invalid password', async () => {
    const device = {
      press: vi.fn().mockResolvedValue(undefined),
      turnOn: vi.fn().mockResolvedValue(undefined),
      turnOff: vi.fn().mockResolvedValue(undefined),
      command: vi.fn().mockResolvedValue(Buffer.from([0x01, 0x00, 0x00])),
    }
    const botDevice = device as unknown as WoHand

    await expect(executeBotBleAction(botDevice, 0x00, 'abc')).rejects.toThrow('Invalid Bot password')
  })

  it('throws when encrypted command response is invalid', async () => {
    const device = {
      press: vi.fn().mockResolvedValue(undefined),
      turnOn: vi.fn().mockResolvedValue(undefined),
      turnOff: vi.fn().mockResolvedValue(undefined),
      command: vi.fn().mockResolvedValue(Buffer.from([0x00, 0x00, 0x00])),
    }
    const botDevice = device as unknown as WoHand

    await expect(executeBotBleAction(botDevice, 0x02, 'A1b2')).rejects.toThrow('The device returned an error')
  })
})
