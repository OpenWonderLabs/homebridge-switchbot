import { describe, expect, it, vi } from 'vitest'

import { CurtainDevice } from '../../src/devices/genericDevice'

describe('curtain BLE position', () => {
  it('keeps a commanded position when an old advertisement reappears', async () => {
    let advertisement = { position: 39 }
    const nodeDevice = {
      hasBLE: () => true,
      getInfo: () => ({ bleServiceData: advertisement }),
    }
    const client = {
      getCachedDevice: () => nodeDevice,
    }
    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }
    const curtain = new CurtainDevice({
      id: 'curtain',
      type: 'Curtain',
      log,
      blePollingEnabled: false,
    }, { _client: client, log } as any)
    const getState = vi.spyOn(curtain, 'getState')
    vi.spyOn(curtain, 'setState').mockResolvedValue(true)
    const characteristics = curtain.createHAPAccessory({}).services[0].characteristics

    expect(await characteristics.CurrentPosition.get()).toBe(61)
    await characteristics.TargetPosition.set(69)
    expect(await characteristics.CurrentPosition.get()).toBe(69)

    advertisement = { position: 39 }
    expect(await characteristics.CurrentPosition.get()).toBe(69)
    expect(await characteristics.TargetPosition.get()).toBe(69)

    advertisement = { position: 31 }
    expect(await characteristics.CurrentPosition.get()).toBe(69)

    advertisement = { position: 39 }
    expect(await characteristics.CurrentPosition.get()).toBe(69)
    expect(getState).not.toHaveBeenCalled()
  })
})
