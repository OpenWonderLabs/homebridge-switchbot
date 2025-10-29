import { vi } from 'vitest'

// Shared test helpers for platform-matter tests
export function makeApiStub(matterProps: Record<string, any> = {}) {
  const handlers: Record<string, (...args: any[]) => any> = {}

  const api: any = {
    matter: {
      uuid: { generate: (s: string) => `uuid-${s}` },
      registerPlatformAccessories: matterProps.registerPlatformAccessories ?? vi.fn(),
      unregisterPlatformAccessories: matterProps.unregisterPlatformAccessories ?? vi.fn(),
      updateAccessoryState: matterProps.updateAccessoryState ?? vi.fn(),
      clusterNames: matterProps.clusterNames ?? {},
      deviceTypes: matterProps.deviceTypes ?? {},
    },
    isMatterAvailable: matterProps.isMatterAvailable ?? (() => true),
    isMatterEnabled: matterProps.isMatterEnabled ?? (() => true),
    on: (ev: string, fn: (...args: any[]) => any) => { handlers[ev] = fn },
    _handlers: handlers,
  }

  return api
}

export function makeLogStub() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }
}
