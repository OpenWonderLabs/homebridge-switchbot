import type { PlatformConfig } from 'homebridge'
import type { SwitchBotPluginConfig } from './settings.js'

// Canonical Matter cluster ID mapping (from matter.js clusters)
export const MATTER_CLUSTER_IDS = {
  OnOff: 0x0006,
  LevelControl: 0x0008,
  ColorControl: 0x0300,
  WindowCovering: 0x0102,
  DoorLock: 0x0101,
  FanControl: 0x0202,
  RelativeHumidityMeasurement: 0x0405,
} as const

// Common Matter attribute IDs grouped by cluster
export const MATTER_ATTRIBUTE_IDS = {
  OnOff: { OnOff: 0x0000 },
  LevelControl: { CurrentLevel: 0x0000 },
  ColorControl: { CurrentHue: 0x0000, CurrentSaturation: 0x0001, ColorTemperatureMireds: 0x0002 },
  WindowCovering: { CurrentPosition: 0x0000, TargetPosition: 0x0001 },
  FanControl: { SpeedCurrent: 0x0000 },
  DoorLock: { LockState: 0x0000 },
  RelativeHumidityMeasurement: { MeasuredValue: 0x0000 },
} as const

export function normalizeConfig(raw?: PlatformConfig): SwitchBotPluginConfig {
  if (!raw) return {}
  return { ...(raw as any) } as SwitchBotPluginConfig
}

// Create a Proxy constructor that instantiates the right platform implementation at runtime.
export function createPlatformProxy(HAPPlatform: any, MatterPlatform: any): any {
  return class SwitchBotPlatformProxy {
    private impl: any
    constructor(log: any, config: PlatformConfig, api: any) {
      const cfg = normalizeConfig(config)
      const preferMatter = cfg.preferMatter ?? true
      const enableMatter = cfg.enableMatter ?? true
      const matterAvailable = !!(api?.isMatterAvailable?.() && api?.isMatterEnabled?.())

      if (enableMatter && preferMatter && MatterPlatform && matterAvailable) {
        this.impl = new MatterPlatform(log, cfg, api)
        return this.impl
      }

      // Fallback to HAP
      this.impl = new HAPPlatform(log, cfg, api)
      return this.impl
    }
  }
}
