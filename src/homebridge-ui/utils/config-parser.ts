/**
 * Ensure required fields are present on the SwitchBot platform config
 */
export function enforcePlatformConfigFields(platform: any): void {
  if (!platform) return
  if (!platform.platform) platform.platform = 'SwitchBot'
  if (!platform.name) platform.name = 'SwitchBot'
  if (!Array.isArray(platform.devices)) platform.devices = []
}
import type { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils'

import fs from 'node:fs/promises'

import { uiLog } from './logger.js'

// Module-scope regex pattern to avoid recompilation
export const SWITCHBOT_PLATFORM_REGEX = /switchbot/i

/**
 * Get reference to the devices array in platform config
 */
export function getDevicesRef(platform: any): any[] {
  if (!platform || typeof platform !== 'object') {
    return []
  }

  if (Array.isArray(platform.devices)) {
    return platform.devices
  }

  platform.devices = []
  return platform.devices
}

/**
 * Get all device arrays from platform config
 */
export function getDeviceArrays(platform: any): any[][] {
  const rootDevices = getDevicesRef(platform)
  return [rootDevices]
}

/**
 * Get all unique devices from platform config
 */
export function getAllDevices(platform: any): any[] {
  const all = getDevicesRef(platform)
  const seen = new Set<string>()

  return all.filter((d: any) => {
    const id = String(d?.deviceId ?? d?.id ?? '').trim().toLowerCase()
    if (!id || seen.has(id)) {
      return false
    }
    seen.add(id)
    return true
  })
}

/**
 * Detect whether a platform config block is in the legacy v4 format.
 *
 * v4 configs stored credentials under a `credentials` sub-object and devices
 * under `options.devices`.  v5+ flattened these to `openApiToken`,
 * `openApiSecret`, and a root-level `devices` array.
 */
export { isV4Config } from './v4-detection.js'

/**
 * Get credential from platform config
 */
export function getCredential(platform: any, key: 'openApiToken' | 'openApiSecret'): string | undefined {
  return platform?.[key]
}

/**
 * Set credential in platform config
 */
export function setCredential(platform: any, key: 'openApiToken' | 'openApiSecret', value: string): void {
  if (!platform || typeof platform !== 'object') {
    return
  }

  platform[key] = value
}

/**
 * Find and parse the SwitchBot platform config from Homebridge config file
 */
export async function getSwitchBotPlatformConfig(server: HomebridgePluginUiServer) {
  const cfgPath = server.homebridgeConfigPath
  if (!cfgPath) {
    throw new Error('HOMEBRIDGE_CONFIG_PATH not set')
  }

  const raw = await fs.readFile(cfgPath, 'utf-8')
  const cfg = JSON.parse(raw)

  const platforms = Array.isArray(cfg.platforms) ? cfg.platforms : []

  const candidates = platforms.filter((p: any) => {
    const platformName = p.platform || p.name || ''
    return !!platformName && (SWITCHBOT_PLATFORM_REGEX.test(String(platformName)) || String(platformName).toLowerCase() === '@switchbot/homebridge-switchbot')
  })

  uiLog.info(`Found ${candidates.length} SwitchBot candidate(s)`)

  const platform = candidates.find((p: any) => {
    const name = String(p.platform || '').toLowerCase()
    return name === 'switchbot' || name.includes('switchbot')
  })

  if (!platform) {
    throw new Error('SwitchBot platform not found in config. Please add the plugin configuration first.')
  }

  uiLog.info(`Using SwitchBot platform: ${platform.name || platform.platform || 'SwitchBot'}`)
  return { platform, cfg, cfgPath }
}

/**
 * Save the Homebridge config file
 */
export async function saveConfig(cfgPath: string, cfg: any): Promise<void> {
  // Defensive: enforce required fields on all SwitchBot platform blocks before saving
  if (cfg && Array.isArray(cfg.platforms)) {
    for (const p of cfg.platforms) {
      if (p && (String(p.platform || '').toLowerCase() === 'switchbot' || String(p.name || '').toLowerCase() === 'switchbot')) {
        enforcePlatformConfigFields(p)
      }
    }
  }
  await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8')
}
