import { describe, expect, it, vi } from 'vitest'

import { SwitchBotClient } from '../../src/switchbotClient'

function client(devices: any[] = []) {
  const c = new SwitchBotClient({
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  } as any)
  const discover = vi.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 10))
    return devices
  })
  ;(c as any).client = {
    discover,
    devices: {
      get: () => undefined,
      list: () => devices,
    },
  }
  return { c, discover }
}

// A configured device that is offline or out of range is not in the device list. Every lookup
// forced a full discovery (BLE scan plus an OpenAPI getDevices call), and concurrent lookups each
// started their own.
describe('switchBotClient rediscovery for a missing device', () => {
  it('shares one discovery between concurrent lookups', async () => {
    const { c, discover } = client([
      { id: 'present' },
    ])
    await Promise.all([
      c.getDevice('missing-1'),
      c.getDevice('missing-2'),
      c.getDevice('missing-3'),
    ])
    expect(discover).toHaveBeenCalledOnce()
  })

  it('does not rediscover again within the cache period', async () => {
    const { c, discover } = client([
      { id: 'present' },
    ])
    await c.getDevice('missing')
    await c.getDevice('missing')
    await c.getDevice('missing')
    expect(discover).toHaveBeenCalledOnce()
  })

  it('still finds a device that appears after a rediscovery', async () => {
    const devices: any[] = []
    const { c, discover } = client(devices)
    devices.push({ id: 'late' })
    await expect(c.getDevice('late')).resolves.toEqual({ id: 'late' })
    expect(discover).toHaveBeenCalledOnce()
  })
})
