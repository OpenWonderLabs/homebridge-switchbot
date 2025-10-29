import { describe, expect, it, vi } from 'vitest'

import { SwitchBotMatterPlatform } from '../../platform-matter.js'
import { makeApiStub, makeLogStub } from '../helpers/platform-fixtures.js'

describe('keepStaleAccessories config flag behavior', () => {
  it('keeps previously-registered accessories when options.keepStaleAccessories=true', async () => {
    const unregister = vi.fn()
    const register = vi.fn()
    const api: any = makeApiStub({ unregisterPlatformAccessories: unregister, registerPlatformAccessories: register })

    const log: any = makeLogStub()

    // Create platform with keepStaleAccessories = true
    const platform = new SwitchBotMatterPlatform(log as any, { options: { keepStaleAccessories: true } } as any, api)

    // Seed discovered devices (one device)
    ;(platform as any).discoveredDevices = [{ deviceId: 'DEV1', deviceType: 'Plug', deviceName: 'Device 1' }]

    // Insert a stale accessory into matterAccessories
    const staleUuid = api.matter.uuid.generate('stale-device')
    const staleAcc: any = { uuid: staleUuid, displayName: 'Stale', context: { deviceId: 'STALE_DEVICE' } }
    ;(platform as any).matterAccessories.set(staleUuid, staleAcc)

    // Mock createAccessoryFromDevice to return a simple accessory for DEV1
    vi.spyOn(platform as any, 'createAccessoryFromDevice').mockResolvedValue({ displayName: 'Device 1', uuid: 'uuid-DEV1', context: { deviceId: 'DEV1' } } as any)

    // Run registration which includes stale-removal logic
    await (platform as any).registerMatterAccessories()

    // Expect unregister NOT called (we kept stale accessory)
    expect(unregister).not.toHaveBeenCalled()

    // Stale accessory should still be present in matterAccessories
    expect((platform as any).matterAccessories.get(staleUuid)).toBeDefined()
  })
})
