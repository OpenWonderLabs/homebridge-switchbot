import type { API } from 'homebridge'

import { describe, expect, it, vi } from 'vitest'

import registerPlatform from '../index.js'
import { PLATFORM_NAME, PLUGIN_NAME } from '../settings.js'

describe('index.ts', () => {
  it('should register the platform with homebridge', () => {
    const api = {
      registerPlatform: vi.fn(),
    } as unknown as API

    registerPlatform(api)

    // The platform registration now uses a runtime proxy/delegate constructor so
    // assert the call happened and the third argument is a constructor function.
    expect(api.registerPlatform).toHaveBeenCalled()
    const callArgs = (api.registerPlatform as any).mock.calls[0]
    expect(callArgs[0]).toBe(PLUGIN_NAME)
    expect(callArgs[1]).toBe(PLATFORM_NAME)
    expect(typeof callArgs[2]).toBe('function')
  })
})
