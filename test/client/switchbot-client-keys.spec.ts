import { describe, expect, it, vi } from 'vitest'

import { SwitchBotClient } from '../../src/switchbotClient'

const logger = { info: () => {}, warn: vi.fn(), error: () => {}, debug: () => {} }

function client(devices: any[]) {
  const c = new SwitchBotClient({ logger } as any)
  ;(c as any).client = {
    discover: vi.fn(async () => devices),
    devices: { get: (id: string) => devices.find(d => d.id === id), list: () => devices },
  }
  return c
}

function device(id: string, mac?: string) {
  return { id, setKey: vi.fn(), getInfo: () => ({ id, mac }) }
}

// genericDevice used to call client.devices.get(), which the plugin's client wrapper does not have,
// so BLE encryption keys were never passed to node-switchbot.
describe('switchBotClient device keys', () => {
  it('applies a key set before the device is discovered', async () => {
    const devices: any[] = []
    const c = client(devices)
    c.setDeviceKey('AA:BB:CC:DD:EE:FF', { encryptionKey: '0'.repeat(32), keyId: 'ab' })
    const relay = device('aabbccddeeff', 'AA:BB:CC:DD:EE:FF')
    devices.push(relay)
    await c.getDevice('aabbccddeeff')
    expect(relay.setKey).toHaveBeenCalledWith({ encryptionKey: '0'.repeat(32), keyId: 'ab' })
  })

  it('applies a key immediately when the device already exists, and only once', async () => {
    const relay = device('relay-1')
    const c = client([relay])
    c.setDeviceKey('relay-1', { encryptionKey: '1'.repeat(32), keyId: '01' })
    await c.getDevice('relay-1')
    await c.getDevices()
    expect(relay.setKey).toHaveBeenCalledOnce()
  })

  it('logs and continues when node-switchbot rejects the key', async () => {
    const relay = device('relay-2')
    relay.setKey.mockImplementation(() => {
      throw new Error('bad key')
    })
    const c = client([relay])
    c.setDeviceKey('relay-2', { encryptionKey: 'nope' })
    await expect(c.getDevice('relay-2')).resolves.toBe(relay)
    expect(logger.warn).toHaveBeenCalled()
  })

  it('leaves devices without setKey (node-switchbot 5.x) alone', async () => {
    const plain = { id: 'plain' }
    const c = client([plain])
    c.setDeviceKey('plain', { encryptionKey: '2'.repeat(32) })
    await expect(c.getDevice('plain')).resolves.toBe(plain)
  })
})
