import { describe, expect, it } from 'vitest'

import { WaterDetectorDevice } from '../../src/devices/genericDevice'

const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }

const mockApi = {
  hap: {
    HapStatusError: class HapStatusError extends Error {
      constructor(public status: number) {
        super(`HAP status ${status}`)
      }
    },
    HAPStatus: {
      SERVICE_COMMUNICATION_FAILURE: -70402,
    },
  },
}

describe('WaterDetectorDevice leak state', () => {
  it('warms leak state and serves LeakDetected synchronously from cache', async () => {
    let reads = 0
    const device = new WaterDetectorDevice({ id: 'wd1', type: 'waterdetector' }, { log: mockLogger })
    device.getState = async () => {
      reads += 1
      return { waterLeakDetected: true }
    }

    await device.init()
    const leakDetected = device.createHAPAccessory(mockApi).services[0].characteristics.LeakDetected.get()

    expect(leakDetected).toBe(1)
    expect(leakDetected).not.toBeInstanceOf(Promise)
    expect(reads).toBe(1)
  })

  it('throws a HAP communication failure instead of blocking when no leak state is cached', () => {
    const device = new WaterDetectorDevice({ id: 'wd1', type: 'waterdetector' }, { log: mockLogger })
    device.getState = async () => ({ waterLeakDetected: false })

    expect(() => device.createHAPAccessory(mockApi).services[0].characteristics.LeakDetected.get()).toThrow('HAP status -70402')
  })
})
