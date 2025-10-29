import { describe, expect, it, vi } from 'vitest'

import { SwitchBotMatterPlatform } from '../../platform-matter.js'
import { makeApiStub, makeLogStub } from '../helpers/platform-fixtures.js'

describe('platform-matter mapping helper', () => {
  it('prefers accessory instance update methods for battery and falls back to api.matter.updateAccessoryState', async () => {
    const updateAccessoryState = vi.fn()
    const api: any = makeApiStub({ updateAccessoryState, clusterNames: { OnOff: 'OnOff', LevelControl: 'LevelControl', ColorControl: 'ColorControl', PowerSource: 'powerSource' } })

    const log: any = makeLogStub()
    const platform = new SwitchBotMatterPlatform(log as any, {} as any, api)

    // Create a fake accessory instance with updateBatteryPercentage
    const deviceId = 'DEV123'
    const nid = (platform as any).normalizeDeviceId(deviceId)
    const fakeInstance = { updateBatteryPercentage: vi.fn() }
    ;(platform as any).accessoryInstances.set(nid, fakeInstance)

    // Call the private helper with different battery field names
    await (platform as any).applyStatusToAccessory('uuid-test', { deviceId } as any, { batteryPercentage: 55 })
    expect(fakeInstance.updateBatteryPercentage).toHaveBeenCalled()

    // Remove instance to force fallback
    ;(platform as any).accessoryInstances.delete(nid)
    await (platform as any).applyStatusToAccessory('uuid-test', { deviceId } as any, { battery: 30 })
    expect(updateAccessoryState).toHaveBeenCalled()
  })

  it('handles temperature and humidity synonyms', async () => {
    const updateAccessoryState = vi.fn()
    const api: any = makeApiStub({ updateAccessoryState })

    const log: any = makeLogStub()
    const platform = new SwitchBotMatterPlatform(log as any, {} as any, api)

    const deviceId = 'DEV-TEMP'
    await (platform as any).applyStatusToAccessory('uuid-temp', { deviceId } as any, { temp: 21.5, humid: 48 })

    // Expect updateAccessoryState to have been called for temperature and humidity
    expect(updateAccessoryState).toHaveBeenCalled()
  })

  it('applies VOC and PM10 mappings when present', async () => {
    const updateAccessoryState = vi.fn()
    const api: any = makeApiStub({ updateAccessoryState })

    const log: any = makeLogStub()
    const platform = new SwitchBotMatterPlatform(log as any, {} as any, api)

    const deviceId = 'DEV-AQ'
    await (platform as any).applyStatusToAccessory('uuid-aq', { deviceId } as any, { voc: 123, pm10: 56 })

    // Expect updateAccessoryState (or safeUpdate fallback) to have been called for voc and pm10
    expect(updateAccessoryState).toHaveBeenCalled()
  })
})
