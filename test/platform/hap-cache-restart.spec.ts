import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import * as hap from '@homebridge/hap-nodejs'
import { Characteristic, Service, uuid } from '@homebridge/hap-nodejs'
import { describe, expect, it, vi } from 'vitest'

// Homebridge exports only the PlatformAccessory type. This test needs the real class, because its
// serialize/deserialize are what write and read the accessory cache.
// eslint-disable-next-line antfu/no-import-dist, antfu/no-import-node-modules-by-path
import { PlatformAccessory } from '../../node_modules/homebridge/dist/platformAccessory.js'
import { repairCachedAccessories } from '../../src/cacheRepair.js'
import { createDevice } from '../../src/deviceFactory.js'
import { PLATFORM_NAME, PLUGIN_NAME } from '../../src/settings.js'
import { SwitchBotHAPPlatform } from '../../src/SwitchBotHAPPlatform.js'
import { normalizeTypeForMatter } from '../../src/utils.js'

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}
const INFO = Service.AccessoryInformation.UUID

async function startOnce(cache: any[] | undefined, devices: { id: string, type: string, name: string }[], mutate?: (json: any) => void) {
  // Homebridge sets these when it registers an accessory; serialize() requires them.
  const register = (accs: any[]) => accs.forEach((a) => {
    a._associatedPlugin = PLUGIN_NAME
    a._associatedPlatform = PLATFORM_NAME
  })
  const api = {
    hap: { Service, Characteristic, uuid },
    platformAccessory: PlatformAccessory,
    registerPlatformAccessories: vi.fn((_p, _q, accs) => register(accs)),
    updatePlatformAccessories: vi.fn(),
  }
  const platform = Object.create(SwitchBotHAPPlatform.prototype) as any
  platform.api = api
  platform.log = log
  platform.config = {
    devices: devices.map(d => ({ deviceId: d.id, configDeviceType: d.type })),
  }
  platform.hapPushTargets = new Map()
  platform.accessories = new Map()
  for (const json of cache ?? []) {
    mutate?.(json)
    const acc: any = PlatformAccessory.deserialize(json) // the call that throws in #1424
    platform.accessories.set(acc.UUID, acc)
  }
  const list = []
  for (const d of devices) {
    const type = normalizeTypeForMatter(d.type)
    const _client = {
      getDeviceStatus: vi.fn(async () => ({})),
      setDeviceState: vi.fn(async () => ({ success: true })),
      getDevice: vi.fn(async () => undefined),
    }
    const created = await createDevice({
      id: d.id,
      type,
      deviceType: d.type,
      name: d.name,
      log,
    } as any, { log, devices: platform.config.devices, _client } as any, false)
    list.push({ created, d, type })
  }
  log.warn.mockClear()
  await platform.registerHAPAccessories(list)
  expect(log.warn).not.toHaveBeenCalled()
  return [
    ...platform.accessories.values(),
  ].map((a: any) => PlatformAccessory.serialize(a))
}

describe('hAP accessory cache across restarts (#1424)', () => {
  const devices = [
    { id: 'EA552551B763', type: 'Curtain3', name: 'Curtain3-1' },
    { id: 'D83BDA1173CA', type: 'Plug', name: 'Plug-1' },
  ]
  const hasInfo = (cache: any[]) => cache.every(a => a.services.some((s: any) => s.UUID === INFO))

  it('survives restarts', async () => {
    let cache = await startOnce(undefined, devices)
    expect(cache).toHaveLength(2)
    for (let i = 0; i < 3; i++) cache = await startOnce(cache, devices)
    expect(hasInfo(cache)).toBe(true)
  })

  // HAP restores a service whose class name was not stored as a plain `Service`. The plugin
  // used to match services by class name, removed AccessoryInformation, and the next start crashed.
  it('survives restarts with a cache whose services have no constructorName', async () => {
    let cache = await startOnce(undefined, devices)
    for (let i = 0; i < 3; i++) {
      cache = await startOnce(cache, devices, json => json.services.forEach((s: any) => delete s.constructorName))
    }
    expect(hasInfo(cache)).toBe(true)
  })

  it('repairs a cache that is already missing AccessoryInformation, so the bridge can start', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'switchbot-cache-'))
    const good = await startOnce(undefined, devices)
    const broken = good.map(a => ({
      ...a,
      services: a.services.filter((s: any) => s.UUID !== INFO),
    }))
    const otherPlugin = {
      ...broken[0],
      plugin: 'homebridge-other',
      UUID: uuid.generate('other'),
    }
    const file = join(dir, 'cachedAccessories.0EF8A6716C95')
    writeFileSync(file, JSON.stringify([...broken, otherPlugin]))
    expect(() => PlatformAccessory.deserialize(broken[0])).toThrow('getCharacteristic')

    const messages: string[] = []
    const api: any = {
      hap,
      user: {
        cachedAccessoryPath: () => dir,
      },
    }
    const results = repairCachedAccessories(api, m => messages.push(m))

    expect(results).toEqual([
      {
        file,
        repaired: ['Curtain3-1', 'Plug-1'],
      },
    ])
    expect(messages[0]).toContain('Repaired 2 cached accessories')
    expect(readdirSync(dir)).toContain('cachedAccessories.0EF8A6716C95.switchbot-repair.bak')
    const repaired = JSON.parse(readFileSync(file, 'utf8'))
    expect(repaired[2]).toEqual(otherPlugin) // other plugins' entries are left alone
    let cache = await startOnce(repaired.slice(0, 2), devices)
    cache = await startOnce(cache, devices)
    expect(hasInfo(cache)).toBe(true)
    // A second run finds nothing to do and does not rewrite the file.
    expect(repairCachedAccessories(api)).toEqual([])
  })

  it('ignores missing directories, backups and unreadable files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'switchbot-cache-'))
    writeFileSync(join(dir, '.cachedAccessories.bak'), JSON.stringify([
      { plugin: PLUGIN_NAME, services: [] },
    ]))
    writeFileSync(join(dir, 'cachedAccessories'), '{not json')
    const messages: string[] = []
    expect(repairCachedAccessories({
      hap,
      user: {
        cachedAccessoryPath: () => dir,
      },
    } as any, m => messages.push(m))).toEqual([])
    expect(messages).toHaveLength(1)
    expect(repairCachedAccessories({
      hap,
      user: {
        cachedAccessoryPath: () => join(dir, 'missing'),
      },
    } as any)).toEqual([])
    expect(repairCachedAccessories({} as any)).toEqual([])
  })
})
