import { describe, expect, it, vi } from 'vitest'

import { SwitchBotMatterPlatform } from '../../platform-matter.js'
import { PLATFORM_NAME, PLUGIN_NAME } from '../../settings.js'
import { makeApiStub, makeLogStub } from '../helpers/platform-fixtures.js'

describe('platform-matter discovered devices', () => {
  it('uses discovered devices and registers them (platform + robotic)', async () => {
    const mockRegister = vi.fn()
    const api: any = makeApiStub({
      registerPlatformAccessories: mockRegister,
      clusterNames: { OnOff: 'OnOff', LevelControl: 'LevelControl', ColorControl: 'ColorControl' },
      deviceTypes: { RoboticVacuumCleaner: 'rvc' },
    })

    const log: any = makeLogStub()

    const config: any = {}

    const platform = new SwitchBotMatterPlatform(log, config, api)

    // Provide discovered devices
    ;(platform as any).discoveredDevices = [
      { deviceId: 'dev1', deviceName: 'Lamp', deviceType: 'Plug' },
      { deviceId: 'vac1', deviceName: 'Vac', deviceType: 'K10+' },
    ] as any

    // Stub accessory creation to avoid instantiating full device classes
    ;(platform as any).createAccessoryFromDevice = async (dev: any) => ({ displayName: dev.deviceName, uuid: api.matter.uuid.generate(dev.deviceId) } as any)

    await (platform as any).registerMatterAccessories()

    // Ensure registerPlatformAccessories was called at least once
    expect(mockRegister).toHaveBeenCalled()

    // Sum total accessories registered across all calls
    const totalRegistered = mockRegister.mock.calls.reduce((sum: number, call: any) => sum + ((call[2] && call[2].length) || 0), 0)
    expect(totalRegistered).toBe(2)

    // Verify PLUGIN_NAME and PLATFORM_NAME were used in the calls
    for (const call of mockRegister.mock.calls) {
      expect(call[0]).toBe(PLUGIN_NAME)
      expect(call[1]).toBe(PLATFORM_NAME)
    }
  })

  it('applies per-device config overrides when deviceId matches discovered device', async () => {
    const mockRegister = vi.fn()

    const api: any = {
      matter: {
        uuid: { generate: (s: string) => `uuid-${s}` },
        registerPlatformAccessories: mockRegister,
        clusterNames: { OnOff: 'OnOff', LevelControl: 'LevelControl', ColorControl: 'ColorControl' },
        deviceTypes: { RoboticVacuumCleaner: 'rvc' },
      },
      isMatterAvailable: () => true,
      isMatterEnabled: () => true,
      on: () => {},
    }

    const log: any = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }

    const config: any = {
      options: {
        devices: [{ deviceId: 'dev1', configDeviceName: 'Configured Lamp', logging: 'debug' }],
      },
    }

    const platform = new SwitchBotMatterPlatform(log, config, api)

    ;(platform as any).discoveredDevices = [{ deviceId: 'dev1', deviceName: 'Lamp', deviceType: 'Plug' }] as any

    const seen: any[] = []
    ;(platform as any).createAccessoryFromDevice = async (dev: any) => {
      seen.push(dev)
      return {
        displayName: dev.deviceName ?? dev.configDeviceName,
        uuid: api.matter.uuid.generate(dev.deviceId),
      } as any
    }

    await (platform as any).registerMatterAccessories()

    // createAccessoryFromDevice should have been called once with merged config
    expect(seen.length).toBe(1)
    expect(seen[0].deviceId).toBe('dev1')
    // per-device config values should be present on the merged device
    expect(seen[0].configDeviceName).toBe('Configured Lamp')
    expect(seen[0].logging).toBe('debug')
  })

  it('ignores config-only devices by default but includes them when allowConfigOnlyDevices=true', async () => {
    const mockRegister = vi.fn()

    const api: any = {
      matter: {
        uuid: { generate: (s: string) => `uuid-${s}` },
        registerPlatformAccessories: mockRegister,
        clusterNames: { OnOff: 'OnOff', LevelControl: 'LevelControl', ColorControl: 'ColorControl' },
        deviceTypes: { RoboticVacuumCleaner: 'rvc' },
      },
      isMatterAvailable: () => true,
      isMatterEnabled: () => true,
      on: () => {},
    }

    const log: any = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }

    // config-only device (cfg1) and one discovered device (dev1)
    const cfgOnly = { deviceId: 'cfg1', configDeviceName: 'OnlyInConfig', deviceType: 'Plug' }
    const configDefault: any = { options: { devices: [cfgOnly] } }

    const platformDefault = new SwitchBotMatterPlatform(log, configDefault, api)
    ;(platformDefault as any).discoveredDevices = [{ deviceId: 'dev1', deviceName: 'Lamp', deviceType: 'Plug' }] as any
    const seenDefault: any[] = []
    ;(platformDefault as any).createAccessoryFromDevice = async (dev: any) => {
      seenDefault.push(dev)
      return {
        displayName: dev.deviceName ?? dev.configDeviceName,
        uuid: api.matter.uuid.generate(dev.deviceId),
      } as any
    }
    await (platformDefault as any).registerMatterAccessories()
    // Should only see discovered device (cfg1 ignored)
    expect(seenDefault.find((d: any) => d.deviceId === 'cfg1')).toBeUndefined()

    // Now opt-in to include config-only devices
    const configOptIn: any = { options: { devices: [cfgOnly], allowConfigOnlyDevices: true } }
    const platformOptIn = new SwitchBotMatterPlatform(log, configOptIn, api)
    ;(platformOptIn as any).discoveredDevices = [{ deviceId: 'dev1', deviceName: 'Lamp', deviceType: 'Plug' }] as any
    const seenOptIn: any[] = []
    ;(platformOptIn as any).createAccessoryFromDevice = async (dev: any) => {
      seenOptIn.push(dev)
      return {
        displayName: dev.deviceName ?? dev.configDeviceName,
        uuid: api.matter.uuid.generate(dev.deviceId),
      } as any
    }
    await (platformOptIn as any).registerMatterAccessories()
    // Should include the config-only device now
    expect(seenOptIn.find((d: any) => d.deviceId === 'cfg1')).toBeDefined()
  })
})
