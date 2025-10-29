import { describe, expect, it, vi } from 'vitest'

import { SwitchBotMatterPlatform } from '../../platform-matter.js'
import { makeApiStub, makeLogStub } from '../helpers/platform-fixtures.js'

describe('platform-matter OpenAPI -> Matter mapping', () => {
  it('maps light OpenAPI status (on/off, brightness, color, battery) to accessory instance helpers', async () => {
    const api: any = makeApiStub()
    const log = makeLogStub()
    const platform = new SwitchBotMatterPlatform(log as any, {} as any, api)

    const deviceId = 'LIGHT-1'
    const nid = (platform as any).normalizeDeviceId(deviceId)

    const instance = {
      updateOnOffState: vi.fn(),
      updateBrightness: vi.fn(),
      updateHueSaturation: vi.fn(),
      updateBatteryPercentage: vi.fn(),
    }
    ;(platform as any).accessoryInstances.set(nid, instance)

    const status = { power: true, brightness: 80, color: '255:128:64', battery: 92 }
    await (platform as any).applyStatusToAccessory('uuid-light', { deviceId } as any, status)

    expect(instance.updateOnOffState).toHaveBeenCalled()
    expect(instance.updateBrightness).toHaveBeenCalled()
    expect(instance.updateHueSaturation).toHaveBeenCalled()
    expect(instance.updateBatteryPercentage).toHaveBeenCalled()
  })

  it('maps MeterPro OpenAPI status (temp, humid, co2, pm25, voc) to accessory instance helpers', async () => {
    const api: any = makeApiStub()
    const log = makeLogStub()
    const platform = new SwitchBotMatterPlatform(log as any, {} as any, api)

    const deviceId = 'METERPRO-1'
    const nid = (platform as any).normalizeDeviceId(deviceId)

    const instance = {
      updateTemperature: vi.fn(),
      updateHumidity: vi.fn(),
      updateCO2: vi.fn(),
      updatePM25: vi.fn(),
      updateVOC: vi.fn(),
    }
    ;(platform as any).accessoryInstances.set(nid, instance)

    const status = { temp: 21.4, humid: 45, co2: 410, pm25: 12, voc: 85 }
    await (platform as any).applyStatusToAccessory('uuid-meter', { deviceId } as any, status)

    expect(instance.updateTemperature).toHaveBeenCalled()
    expect(instance.updateHumidity).toHaveBeenCalled()
    expect(instance.updateCO2).toHaveBeenCalled()
    expect(instance.updatePM25).toHaveBeenCalled()
    expect(instance.updateVOC).toHaveBeenCalled()
  })

  it('maps lock OpenAPI status to lock helper', async () => {
    const api: any = makeApiStub()
    const log = makeLogStub()
    const platform = new SwitchBotMatterPlatform(log as any, {} as any, api)

    const deviceId = 'LOCK-1'
    const nid = (platform as any).normalizeDeviceId(deviceId)

    const instance = { updateLockState: vi.fn() }
    ;(platform as any).accessoryInstances.set(nid, instance)

    const status = { lock: true }
    await (platform as any).applyStatusToAccessory('uuid-lock', { deviceId } as any, status)

    expect(instance.updateLockState).toHaveBeenCalled()
  })

  it('maps curtain position synonyms to lift position helper', async () => {
    const api: any = makeApiStub()
    const log = makeLogStub()
    const platform = new SwitchBotMatterPlatform(log as any, {} as any, api)

    const deviceId = 'CURTAIN-1'
    const nid = (platform as any).normalizeDeviceId(deviceId)

    const instance = { updateLiftPosition: vi.fn() }
    ;(platform as any).accessoryInstances.set(nid, instance)

    await (platform as any).applyStatusToAccessory('uuid-cur', { deviceId, deviceType: 'Curtain' } as any, { position: 25 })
    await (platform as any).applyStatusToAccessory('uuid-cur', { deviceId, deviceType: 'Curtain' } as any, { slidePosition: 75 })

    expect(instance.updateLiftPosition).toHaveBeenCalled()
  })

  it('maps robot vacuum run state / on to updateRunMode or updateOperationalState', async () => {
    const api: any = makeApiStub()
    const log = makeLogStub()
    const platform = new SwitchBotMatterPlatform(log as any, {} as any, api)

    const deviceId = 'RVC-1'
    const nid = (platform as any).normalizeDeviceId(deviceId)

    const instance: any = { updateRunMode: vi.fn(), updateOperationalState: vi.fn() }
    ;(platform as any).accessoryInstances.set(nid, instance)

    await (platform as any).applyStatusToAccessory('uuid-rvc', { deviceId, deviceType: 'K10+' } as any, { runState: 'cleaning', power: true })

    const calls = (instance.updateRunMode.mock?.calls?.length || 0) + (instance.updateOperationalState.mock?.calls?.length || 0)
    expect(calls).toBeGreaterThan(0)
  })
})
