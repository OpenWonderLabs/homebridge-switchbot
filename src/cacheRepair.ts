/* Copyright(C) 2021-2026, SwitchBot (https://github.com/SwitchBot). All rights reserved.
 *
 * cacheRepair.ts: repair cached accessories that HAP cannot load.
 */
import type { API } from 'homebridge'

import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { PLUGIN_NAME } from './settings.js'

// The main bridge uses `cachedAccessories`; a child bridge uses `cachedAccessories.<USERNAME>`.
// Homebridge's own backups start with a dot and are not matched.
const CACHE_FILE = /^cachedAccessories(?:\.[0-9A-F]{12})?$/i

export interface CacheRepairResult {
  file: string
  repaired: string[]
}

/**
 * Restore the AccessoryInformation service on this plugin's cached accessories when it is
 * missing. HAP throws while loading such an accessory, which stops the whole bridge (#1424).
 *
 * Only this plugin's entries are changed, and only files that need it are rewritten, after a
 * `<file>.switchbot-repair.bak` copy is made. Child bridges load their cache after the plugin is
 * initialised, so calling this from the plugin initialiser lets the bridge start. The main bridge
 * loads its cache before any plugin, so there it can only be repaired by removing the cached
 * accessory in the Homebridge UI.
 *
 * Never throws.
 */
export function repairCachedAccessories(api: API, log: (message: string) => void = () => {}): CacheRepairResult[] {
  const results: CacheRepairResult[] = []
  try {
    const hap: any = (api as any)?.hap
    const dir: string | undefined = (api as any)?.user?.cachedAccessoryPath?.()
    const InfoService = hap?.Service?.AccessoryInformation
    if (!dir || !InfoService || typeof hap.Service.serialize !== 'function' || !existsSync(dir)) {
      return results
    }
    for (const name of readdirSync(dir)) {
      if (!CACHE_FILE.test(name)) {
        continue
      }
      const file = join(dir, name)
      try {
        const cached = JSON.parse(readFileSync(file, 'utf8'))
        if (!Array.isArray(cached)) {
          continue
        }
        const repaired: string[] = []
        for (const accessory of cached) {
          if (accessory?.plugin !== PLUGIN_NAME || !Array.isArray(accessory.services)) {
            continue
          }
          if (accessory.services.some((service: any) => service?.UUID === InfoService.UUID)) {
            continue
          }
          const displayName = String(accessory.displayName || 'SwitchBot')
          accessory.services.unshift(hap.Service.serialize(new InfoService(displayName)))
          repaired.push(displayName)
        }
        if (repaired.length > 0) {
          copyFileSync(file, `${file}.switchbot-repair.bak`)
          writeFileSync(file, JSON.stringify(cached))
          results.push({ file, repaired })
          log(`Repaired ${repaired.length} cached accessor${repaired.length === 1 ? 'y' : 'ies'} in ${name} `
            + `that were missing AccessoryInformation: ${repaired.join(', ')}`)
        }
      } catch (e) {
        log(`Could not check cached accessories in ${name}: ${(e as Error)?.message ?? e}`)
      }
    }
  } catch (e) {
    log(`Could not check cached accessories: ${(e as Error)?.message ?? e}`)
  }
  return results
}
