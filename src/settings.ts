export const PLUGIN_NAME = '@switchbot/homebridge-switchbot'
export const PLATFORM_NAME = 'SwitchBot'

export interface SwitchBotPluginConfig {
  openApiToken?: string
  openApiSecret?: string
  preferMatter?: boolean
  enableMatter?: boolean
  // other plugin-specific configuration
  [key: string]: any
}

export const DEFAULT_CONFIG: Partial<SwitchBotPluginConfig> = {
  preferMatter: true,
  enableMatter: true,
}

export type DeviceType = string
