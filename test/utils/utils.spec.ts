import { describe, expect, it, vi } from 'vitest'

import {
  createPlatformProxy,
  MATTER_ATTRIBUTE_IDS,
  MATTER_CLUSTER_IDS,
  normalizeConfig,
} from '../../src/utils'

describe('utils', () => {
  it('should expose correct MATTER_CLUSTER_IDS', () => {
    expect(MATTER_CLUSTER_IDS.OnOff).toBe(0x0006)
    expect(MATTER_CLUSTER_IDS.FanControl).toBe(0x0202)
  })

  it('should expose correct MATTER_ATTRIBUTE_IDS', () => {
    expect(MATTER_ATTRIBUTE_IDS.OnOff.OnOff).toBe(0x0000)
    expect(MATTER_ATTRIBUTE_IDS.ColorControl.CurrentHue).toBe(0x0000)
  })

  it('normalizeConfig returns empty object for undefined', () => {
    expect(normalizeConfig(undefined)).toEqual({})
  })

  it('normalizeConfig returns shallow copy of config', () => {
    const input = { foo: 'bar', preferMatter: false }
    const result = normalizeConfig(input as any)
    expect(result).toMatchObject(input)
    expect(result).not.toBe(input)
  })

  // The config from #1424: credentials and options in the v4 layout, read by a v5 plugin that
  // only looked at openApiToken/openApiSecret/enableBLE, so the OpenAPI was never configured.
  it('normalizeConfig reads v4 credentials and options when the v5 keys are missing', () => {
    const devices = [
      { deviceId: 'EA552551B763', configDeviceType: 'Curtain3' },
    ]
    const result = normalizeConfig({
      platform: 'SwitchBot',
      credentials: { token: 'TOKEN', secret: 'SECRET', notice: 'Keep your Token & Secret a secret!' },
      options: {
        BLE: false,
        discoverBLE: false,
        refreshRate: 180,
        logging: 'standard',
        devices,
      },
    } as any)
    expect(result).toMatchObject({
      openApiToken: 'TOKEN',
      openApiSecret: 'SECRET',
      enableBLE: false,
      openApiRefreshRate: 180,
      devices,
    })
  })

  it('normalizeConfig prefers the v5 keys over v4 ones', () => {
    const devices = [
      { deviceId: 'A' },
    ]
    const result = normalizeConfig({
      openApiToken: 'NEW',
      openApiSecret: 'NEWSECRET',
      enableBLE: true,
      openApiRefreshRate: 600,
      devices,
      credentials: { token: 'OLD', secret: 'OLDSECRET' },
      options: {
        BLE: false,
        refreshRate: 60,
        devices: [
          { deviceId: 'B' },
        ],
      },
    } as any)
    expect(result).toMatchObject({
      openApiToken: 'NEW',
      openApiSecret: 'NEWSECRET',
      enableBLE: true,
      openApiRefreshRate: 600,
      devices,
    })
  })

  it('createPlatformProxy instantiates MatterPlatform if available and enabled', () => {
    const HAP = vi.fn()
    const Matter = vi.fn()
    const api = {
      isMatterAvailable: () => true,
      isMatterEnabled: () => true,
    }
    const config = { enableMatter: true, preferMatter: true }
    const Proxy = createPlatformProxy(HAP, Matter)
    new Proxy('log', config, api)
    expect(Matter).toHaveBeenCalled()
    expect(HAP).not.toHaveBeenCalled()
  })

  it('createPlatformProxy falls back to HAPPlatform if Matter not available', () => {
    const HAP = vi.fn()
    const Matter = vi.fn()
    const api = {
      isMatterAvailable: () => false,
      isMatterEnabled: () => false,
    }
    const config = { enableMatter: true, preferMatter: true }
    const Proxy = createPlatformProxy(HAP, Matter)
    new Proxy('log', config, api)
    expect(HAP).toHaveBeenCalled()
    expect(Matter).not.toHaveBeenCalled()
  })
})
