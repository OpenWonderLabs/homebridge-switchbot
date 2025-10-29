import { describe, expect, it, vi } from 'vitest'

import { createPlatformProxy, detectMatter } from '../utils.js'

describe('detectMatter', () => {
  it('returns enabled true when api.isMatterEnabled is a function that returns true', () => {
    const api: any = { isMatterEnabled: () => true }
    const info = detectMatter(api)
    expect(info.enabled).toBe(true)
    expect(info.reason).toMatch(/isMatterEnabled\(\)/)
  })

  it('returns enabled true when api.isMatterEnabled is a truthy property', () => {
    const api: any = { isMatterEnabled: true }
    const info = detectMatter(api)
    expect(info.enabled).toBe(true)
    expect(info.reason).toMatch(/property present/)
  })

  it('uses server fallback when present', () => {
    const api: any = { server: { isMatterEnabled: () => false } }
    const info = detectMatter(api)
    expect(info.enabled).toBe(false)
    expect(info.reason).toMatch(/server.isMatterEnabled\(\)/)
  })

  it('returns enabled false with a reason when no API is present', () => {
    const api: any = {}
    const info = detectMatter(api)
    expect(info.enabled).toBe(false)
    expect(typeof info.reason).toBe('string')
  })
})

describe('createPlatformProxy', () => {
  it('selects HAP platform when Matter is disabled and delegates configureAccessory', () => {
    class HapStub {
      public static created = false
      public configured: any = undefined
      constructor(public log: any, public config: any, public api: any) {
        HapStub.created = true
      }

      configureAccessory(acc: any) {
        this.configured = acc
      }
    }

    class MatterStub {
      constructor() {
        throw new Error('should not be constructed')
      }
    }

    const ProxyCtor = createPlatformProxy(HapStub as any, MatterStub as any)
    const log = { info: vi.fn() }
    const api = { isMatterEnabled: false }
    const proxy = new (ProxyCtor as any)(log, {}, api)

    // delegate should be instance of HapStub
    expect(HapStub.created).toBe(true)
    expect(typeof proxy.delegate.configureAccessory).toBe('function')
    proxy.configureAccessory('accessory')
    expect(proxy.delegate.configured).toBe('accessory')
    // log should mention HAP
    expect((log.info as any).mock.calls[0][0]).toMatch(/HAP/)
  })

  it('selects Matter platform when isMatterEnabled is true', () => {
    class HapStub2 {
      constructor() {
        throw new Error('should not be constructed')
      }
    }

    class MatterStub2 {
      public configured: any = undefined
      constructor(public log: any, public config: any, public api: any) {}

      configureMatterAccessory(acc: any) {
        this.configured = acc
      }
    }

    const ProxyCtor = createPlatformProxy(HapStub2 as any, MatterStub2 as any)
    const log = { info: vi.fn() }
    const api = { isMatterEnabled: () => true }
    const proxy = new (ProxyCtor as any)(log, {}, api)

    // delegate should be instance of MatterStub2
    expect(typeof proxy.delegate.configureMatterAccessory).toBe('function')
    ;(proxy as any).configureMatterAccessory('macc')
    expect(proxy.delegate.configured).toBe('macc')
    expect((log.info as any).mock.calls[0][0]).toMatch(/Matter/)
  })
})
