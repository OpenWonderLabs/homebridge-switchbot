import { describe, expect, it, vi } from 'vitest'

import { SwitchBotMatterPlatform } from '../../platform-matter.js'
import { makeApiStub, makeLogStub } from '../helpers/platform-fixtures.js'

describe('removeDisabledAccessories and unregister edge cases', () => {
  it('clears resources and unregisters accessory even with invalid timer and non-MAC deviceId', async () => {
    // Prepare API stub
    const unregister = vi.fn()
    const api: any = makeApiStub({ unregisterPlatformAccessories: unregister })
    const log: any = makeLogStub()
    const platform = new SwitchBotMatterPlatform(log as any, { enableOnOffLight: false } as any, api)

    // Build a fake serialized accessory matching the generated UUID for OnOff Light
    const uuid = api.matter.uuid.generate('matter-onoff-light')
    const accessory: any = { uuid, displayName: 'OnOff Light', context: { deviceId: 'NOT-A-MAC' } }

    // Put invalid timer object into refreshTimers to ensure code handles it
    const nid = (platform as any).normalizeDeviceId(accessory.context.deviceId)
    ;(platform as any).refreshTimers.set(nid, null as any)
    ;(platform as any).accessoryInstances.set(nid, { dummy: true })

    // Insert accessory into matterAccessories so removeDisabledAccessories will see it
    ;(platform as any).matterAccessories.set(uuid, accessory)

    // Spy on clearDeviceResources
    const spyClear = vi.spyOn(platform as any, 'clearDeviceResources')

    // Call removeDisabledAccessories directly
    await (platform as any).removeDisabledAccessories()

    // Expect unregister was called and matterAccessories cleared
    expect(unregister).toHaveBeenCalled()
    expect((platform as any).matterAccessories.get(uuid)).toBeUndefined()

    // clearDeviceResources should have been called with the accessory.deviceId
    expect(spyClear).toHaveBeenCalledWith(accessory.context.deviceId)
  })
})
