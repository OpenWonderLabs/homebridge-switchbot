import { describe, expect, it, vi } from 'vitest'

import { FanDevice } from '../../src/devices/genericDevice'

const failRegex = /fail/
const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }

function makeFan(id: string) {
  const fan = new FanDevice({ id, type: 'Fan' }, { log: mockLogger });
  (fan as any).client = { setDeviceState: vi.fn().mockResolvedValue({ status: 'success' }) }
  return fan
}

describe('fanDevice swing', () => {
  it('should set swing mode to ON', async () => {
    const fan = makeFan('fan1')
    await fan.setState({ swing: true })
    expect((fan as any).client.setDeviceState).toHaveBeenCalledWith('fan1', { command: 'setSwing', parameter: 'on', commandType: 'command' })
  })

  it('should set swing mode to OFF', async () => {
    const fan = makeFan('fan2')
    await fan.setState({ swing: false })
    expect((fan as any).client.setDeviceState).toHaveBeenCalledWith('fan2', { command: 'setSwing', parameter: 'off', commandType: 'command' })
  })

  it('should return error if setDeviceState fails', async () => {
    const fan = makeFan('fan3');
    ((fan as any).client.setDeviceState as any).mockRejectedValueOnce(new Error('fail'))
    const result = await fan.setState({ swing: true })
    expect(result.success).toBe(false)
    expect(result.reason).toMatch(failRegex)
  })
})
