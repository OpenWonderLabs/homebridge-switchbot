import { describe, expect, it, vi } from 'vitest'

import {
  createPlatformProxy,
  MATTER_ATTRIBUTE_IDS,
  MATTER_CLUSTER_IDS,
  normalizeConfig,
  resolveExternalPublishProtocol,
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

  it('createPlatformProxy instantiates MatterPlatform if available and enabled', () => {
    const HAP = vi.fn()
    const Matter = vi.fn()
    const api = { isMatterAvailable: () => true, isMatterEnabled: () => true }
    const config = { enableMatter: true, preferMatter: true }
    const Proxy = createPlatformProxy(HAP, Matter)
    new Proxy('log', config, api)
    expect(Matter).toHaveBeenCalled()
    expect(HAP).not.toHaveBeenCalled()
  })

  it('createPlatformProxy falls back to HAPPlatform if Matter not available', () => {
    const HAP = vi.fn()
    const Matter = vi.fn()
    const api = { isMatterAvailable: () => false, isMatterEnabled: () => false }
    const config = { enableMatter: true, preferMatter: true }
    const Proxy = createPlatformProxy(HAP, Matter)
    new Proxy('log', config, api)
    expect(HAP).toHaveBeenCalled()
    expect(Matter).not.toHaveBeenCalled()
  })

  it('resolveExternalPublishProtocol normalizes known values and aliases', () => {
    expect(resolveExternalPublishProtocol({ externalPublishProtocol: 'hap' })).toBe('hap')
    expect(resolveExternalPublishProtocol({ externalPublishProtocol: 'matter' })).toBe('matter')
    expect(resolveExternalPublishProtocol({ externalPublishProtocol: 'none' })).toBe('none')
    expect(resolveExternalPublishProtocol({ externalPublishProtocol: 'homekit' })).toBe('hap')
    expect(resolveExternalPublishProtocol({ publishExternal: true })).toBe('hap')
    expect(resolveExternalPublishProtocol({ publishExternal: false })).toBe('none')
  })

  it('resolveExternalPublishProtocol defaults to none for unknown values', () => {
    expect(resolveExternalPublishProtocol({ externalPublishProtocol: 'invalid' })).toBe('none')
    expect(resolveExternalPublishProtocol({})).toBe('none')
  })
})
