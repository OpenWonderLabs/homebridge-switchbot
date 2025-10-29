import { describe, expect, it, vi } from 'vitest'

import { SwitchBotMatterPlatform } from '../../platform-matter.js'
import { formatDeviceIdAsMac } from '../../utils.js'
import { makeApiStub, makeLogStub } from '../helpers/platform-fixtures.js'

describe('platform-matter lifecycle cleanup', () => {
  it('clearDeviceResources removes timers, instances and BLE handler entries', async () => {
    // Setup stubbed API and logs
    const handlers: Record<string, (...args: any[]) => any> = {}
    const api: any = makeApiStub({ registerPlatformAccessories: vi.fn(), unregisterPlatformAccessories: vi.fn(), clusterNames: { OnOff: 'OnOff' } })
    api._handlers = handlers
    // keep api.on as a single-statement arrow to satisfy lint
    api.on = (ev: string, fn: (...args: any[]) => any) => (handlers[ev] = fn)

    const log = makeLogStub()

    const platform = new SwitchBotMatterPlatform(log as any, {} as any, api)

    // Insert a fake timer, accessory instance, and BLE handler
    const deviceId = 'AA:BB:CC:11:22:33'
    const nid = (platform as any).normalizeDeviceId(deviceId)

    const timer = setInterval(() => {}, 100000)
    ;(platform as any).refreshTimers.set(nid, timer)
    ;(platform as any).accessoryInstances.set(nid, { dummy: true })
    ;(platform as any).bleEventHandler[deviceId.toLowerCase()] = () => {}

    // Ensure they exist prior
    expect((platform as any).refreshTimers.get(nid)).toBeDefined()
    expect((platform as any).accessoryInstances.get(nid)).toBeDefined()
    expect((platform as any).bleEventHandler[deviceId.toLowerCase()]).toBeDefined()

    // Call the private helper
    ;(platform as any).clearDeviceResources(deviceId)

    // Now they should be removed
    expect((platform as any).refreshTimers.get(nid)).toBeUndefined()
    expect((platform as any).accessoryInstances.get(nid)).toBeUndefined()
    expect((platform as any).bleEventHandler[deviceId.toLowerCase()]).toBeUndefined()
  })

  it('shutdown handler clears all timers and handlers when invoked', async () => {
    // Setup stubbed API and logs
    const handlers: Record<string, (...args: any[]) => any> = {}
    const api: any = makeApiStub({ registerPlatformAccessories: vi.fn(), unregisterPlatformAccessories: vi.fn(), clusterNames: { OnOff: 'OnOff' } })
    api._handlers = handlers
    // keep api.on as a single-statement arrow to satisfy lint
    api.on = (ev: string, fn: (...args: any[]) => any) => (handlers[ev] = fn)

    const log = makeLogStub()

    const platform = new SwitchBotMatterPlatform(log as any, {} as any, api)

    // Add two timers to the platform (using normalized ids)
    const ids = ['devA', 'devB']
    for (const id of ids) {
      const nid = (platform as any).normalizeDeviceId(id)
      const t = setInterval(() => {}, 100000)
      ;(platform as any).refreshTimers.set(nid, t)
      ;(platform as any).accessoryInstances.set(nid, { dummy: true })
      try {
        const mac = formatDeviceIdAsMac(id).toLowerCase()
        ;(platform as any).bleEventHandler[mac] = () => {}
      } catch {
        // ignore formatting errors in this test
      }
    }

    // Invoke didFinishLaunching to ensure the platform registered its shutdown handler
    await Promise.resolve(api._handlers.didFinishLaunching?.())

    // Shutdown handler should now be registered on api._handlers.shutdown
    expect(typeof api._handlers.shutdown).toBe('function')

    // Call the shutdown handler
    await Promise.resolve(api._handlers.shutdown())

    // All refresh timers should be cleared
    for (const id of ids) {
      const nid = (platform as any).normalizeDeviceId(id)
      expect((platform as any).refreshTimers.get(nid)).toBeUndefined()
      expect((platform as any).accessoryInstances.get(nid)).toBeUndefined()
    }
  })
})
