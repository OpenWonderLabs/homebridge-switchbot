export const PLUGIN_NAME = '@switchbot/homebridge-switchbot'
export const PLATFORM_NAME = 'SwitchBot'

export interface SwitchBotPluginConfig {
  openApiToken?: string
  openApiSecret?: string
  preferMatter?: boolean
  enableMatter?: boolean
  enableBLE?: boolean // Enable or disable BLE support
  // other plugin-specific configuration
  [key: string]: any
}

export const DEFAULT_CONFIG: Partial<SwitchBotPluginConfig> = {
  preferMatter: true,
  enableMatter: true,
  enableBLE: true,
}

export type DeviceType = string
