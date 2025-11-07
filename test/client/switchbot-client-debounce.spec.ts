import { describe, expect, it, vi } from 'vitest'

import { SwitchBotClient } from '../../src/switchbotClient'

describe('switchBotClient debounce', () => {
  it('should debounce rapid setDeviceState calls to the same device', async () => {
    const client = new SwitchBotClient({ logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } } as any)
    const doSetDeviceState = vi.spyOn(client as any, '_doSetDeviceState').mockResolvedValue({ status: 'success' })

    // Simulate rapid calls
    await Promise.all([
      client.setDeviceState('device-1', { command: 'turnOn' }),
      client.setDeviceState('device-1', { command: 'turnOff' }),
      client.setDeviceState('device-1', { command: 'turnOn' }),
    ])

    // Only the last command should be sent after debounce
    expect(doSetDeviceState).toHaveBeenCalledTimes(1)
    expect(doSetDeviceState).toHaveBeenCalledWith('device-1', { command: 'turnOn' })
  })

  it('should not debounce setDeviceState calls to different devices', async () => {
    const client = new SwitchBotClient({ logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } } as any)
    const doSetDeviceState = vi.spyOn(client as any, '_doSetDeviceState').mockResolvedValue({ status: 'success' })

    await Promise.all([
      client.setDeviceState('device-1', { command: 'turnOn' }),
      client.setDeviceState('device-2', { command: 'turnOff' }),
    ])

    expect(doSetDeviceState).toHaveBeenCalledTimes(2)
    expect(doSetDeviceState).toHaveBeenCalledWith('device-1', { command: 'turnOn' })
    expect(doSetDeviceState).toHaveBeenCalledWith('device-2', { command: 'turnOff' })
  })
})
