import { describe, expect, it, vi } from 'vitest'

import { SwitchBotMatterPlatform } from '../../src/SwitchBotMatterPlatform.js'

describe('matter integration platform', () => {
  class TestMatterPlatform extends SwitchBotMatterPlatform {
    constructor(logger: any, config: any, api: any) { super(logger, config, api) }
    addDevice(device: any) {
      (this as any)._devices = (this as any)._devices || [];
      (this as any)._devices.push(device)
    }

    getDevices() { return (this as any)._devices || [] }
  }

  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  const config = {}
  const api = {}

  it('should register a device and list it', () => {
    const platform = new TestMatterPlatform(logger, config, api)
    const device = { id: 'matter-123', type: 'Bot' }
    platform.addDevice(device)
    const devices = platform.getDevices()
    expect(devices).toHaveLength(1)
    expect(devices[0].id).toBe('matter-123')
  })

  it('should handle empty device list', () => {
    const platform = new TestMatterPlatform(logger, config, api)
    expect(platform.getDevices()).toEqual([])
  })

  it('should publish per-device external Matter accessories via the Homebridge external event', async () => {
    const emit = vi.fn((event: string, accessories: any[], registrationId: string) => {
      if (event === 'publishExternalMatterAccessories') {
        const resolve = apiWithMatter._pendingExternalRegistrations.get(registrationId)
        resolve?.()
      }
      return true
    })
    const apiWithMatter: any = {
      matter: {
        uuid: { generate: (value: string) => `m-${value}` },
        registerPlatformAccessories: vi.fn(async () => {}),
      },
      hap: { uuid: { generate: (value: string) => `h-${value}` } },
      isMatterAvailable: () => true,
      isMatterEnabled: () => true,
      on: vi.fn(),
      emit,
      _pendingExternalRegistrations: new Map(),
    }
    const platform = new TestMatterPlatform(logger, config, apiWithMatter)
    const created = {
      createAccessory: vi.fn(async () => ({
        name: 'Curtain3',
        manufacturer: 'SwitchBot',
        model: 'Curtain3',
        serialNumber: 'serial-1',
        deviceType: { deviceType: 514 },
        clusters: { windowCovering: { currentPositionLiftPercent100ths: 0 } },
        handlers: {},
      })),
    }

    await platform.registerMatterAccessories([
      {
        created,
        d: { id: 'device-1', name: 'Curtain3' },
        type: 'curtain',
        useMatter: true,
        matterAvailable: true,
        externalPublishProtocol: 'matter',
      },
    ])

    expect(emit).toHaveBeenCalledWith('publishExternalMatterAccessories', expect.any(Array), expect.any(String))
    expect(apiWithMatter.matter.registerPlatformAccessories).not.toHaveBeenCalled()
  })
})
