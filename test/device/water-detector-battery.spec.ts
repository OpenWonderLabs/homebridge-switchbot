import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WaterDetectorDevice } from '../../src/devices/genericDevice'

const openApiMocks = vi.hoisted(() => {
  const getStatus = vi.fn()
  return {
    getStatus,
    OpenAPIClient: vi.fn().mockImplementation(() => ({ getStatus })),

  }
})

vi.mock('node-switchbot', () => ({
  OpenAPIClient: openApiMocks.OpenAPIClient,
}))

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }

const mockApi = {
  hap: {
    HapStatusError: class HapStatusError extends Error {
      constructor(readonly status: number) {
        super(`HAP ${status}`)
      }
    },
    HAPStatus: {
      SERVICE_COMMUNICATION_FAILURE: -70402,
    },
  },
}

function makeDevice(config: Record<string, unknown> = {}) {
  return new WaterDetectorDevice(
    { id: 'wd1', type: 'waterdetector', name: 'Fridge', log: mockLogger, blePollingEnabled: false },
    { log: mockLogger, openApiToken: 'token', openApiSecret: 'secret', ...config } as any,
  )
}

function getBatteryService(device: WaterDetectorDevice) {
  const accessory = device.createHAPAccessory(mockApi)
  return accessory.services.find((service: any) => service.type === 'Battery')
}

describe('water detector device battery service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    openApiMocks.getStatus.mockResolvedValue({ battery: 87 })
  })

  it('adds a Battery service to the HAP accessory descriptor', () => {
    const batteryService = getBatteryService(makeDevice())

    expect(batteryService).toBeDefined()
    expect(batteryService.characteristics.BatteryLevel).toBeDefined()
    expect(batteryService.characteristics.StatusLowBattery).toBeDefined()
    expect(batteryService.characteristics.ChargingState).toBeDefined()
  })

  it('warms the battery cache from direct OpenAPI status', async () => {
    const device = makeDevice()

    await device.init()

    const batteryService = getBatteryService(device)
    expect(openApiMocks.OpenAPIClient).toHaveBeenCalledWith('token', 'secret')
    expect(openApiMocks.getStatus).toHaveBeenCalledWith('wd1')
    expect(batteryService.characteristics.BatteryLevel.get()).toBe(87)
    expect(batteryService.characteristics.StatusLowBattery.get()).toBe(0)
    expect(batteryService.characteristics.ChargingState.get()).toBe(2)
  })

  it('does not fabricate a battery level before one is cached', () => {
    const device = makeDevice({ openApiSecret: undefined })
    const batteryService = getBatteryService(device)

    expect(() => batteryService.characteristics.BatteryLevel.get()).toThrow('HAP -70402')
  })
})
