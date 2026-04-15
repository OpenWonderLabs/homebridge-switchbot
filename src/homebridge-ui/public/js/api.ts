// Fetch the list of configured devices from the Homebridge UI API
import { isValidDeviceType, normalizeDeviceType } from '../../../device-types.js'
import { isV4Config } from '../../utils/v4-detection.js'
import './types.js'
import { uiLog } from './logger.js'
import { toastError } from './toast.js'

export async function fetchDevices(): Promise<any[]> {
  try {
    if (typeof homebridge.getPluginConfig !== 'function') {
      throw new TypeError('Homebridge UI API not available')
    }
    const configArr = await homebridge.getPluginConfig()
    const config = Array.isArray(configArr) && configArr.length > 0 ? configArr.find(isSwitchBotPlatformConfig) : null
    if (!config || !Array.isArray(config.devices)) {
      return []
    }
    return config.devices
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    uiLog.error('Error fetching devices:', msg)
    return []
  }
}

/**
 * Detect whether the current plugin config is in the legacy v4 format.
 *
 * v4 configs stored credentials under a `credentials` sub-object and devices
 * under `options.devices`. v5+ flattened these to `openApiToken`,
 * `openApiSecret`, and a root-level `devices` array.
 *
 * Returns true when a v4 config block is found, false otherwise.
 */
export async function detectV4Config(): Promise<boolean> {
  try {
    if (typeof homebridge.getPluginConfig !== 'function') {
      return false
    }
    const configArr = await homebridge.getPluginConfig()
    if (!Array.isArray(configArr)) {
      return false
    }
    const config = configArr.find(isSwitchBotPlatformConfig)
    if (!config || typeof config !== 'object') {
      return false
    }
    return isV4Config(config)
  } catch (e) {
    uiLog.warn('Error detecting v4 config:', e)
    return false
  }
}

/**
 * Validate and auto-correct device types in the config array before saving.
 * Returns an array of errors for devices that cannot be fixed.
 */
export function validateAndFixDeviceTypes(devices: Array<{ deviceId: string, configDeviceName: string, configDeviceType: string }>) {
  const errors: Array<{ deviceId: string, name: string, type: string }> = []
  for (const d of devices) {
    if (!isValidDeviceType(d.configDeviceType)) {
      const fixed = normalizeDeviceType(d.configDeviceType)
      if (fixed) {
        d.configDeviceType = fixed
      } else {
        errors.push({
          deviceId: d.deviceId,
          name: d.configDeviceName,
          type: d.configDeviceType,
        })
      }
    }
  }
  return errors
}

// API wrapper functions for communicating with the Homebridge UI server

function isSwitchBotPlatformConfig(block: any): boolean {
  const platformName = String(block?.platform || block?.name || '').toLowerCase()
  return (
    platformName === 'switchbot'
    || platformName === '@switchbot/homebridge-switchbot'
    || platformName.includes('switchbot')
  )
}

export async function syncParentPluginConfigFromDisk(autoSave = false): Promise<boolean> {
  try {
    if (
      typeof homebridge.getPluginConfig !== 'function'
      || typeof homebridge.updatePluginConfig !== 'function'
    ) {
      uiLog.warn('Parent config sync API not available')
      return false
    }

    // Use Homebridge UI API to fetch and update config
    const pluginConfigBlocks = await homebridge.getPluginConfig()
    if (!Array.isArray(pluginConfigBlocks) || !pluginConfigBlocks.length) {
      uiLog.warn('No plugin config blocks returned from Homebridge')
      return false
    }

    const index = pluginConfigBlocks.findIndex(block => isSwitchBotPlatformConfig(block))
    if (index < 0) {
      uiLog.warn('SwitchBot platform block not found in Homebridge plugin config')
      return false
    }

    // Validate and fix device types before saving
    const errors = validateAndFixDeviceTypes(pluginConfigBlocks[index].devices || [])
    if (errors.length > 0) {
      toastError(`Invalid device types found: ${errors.map(e => `${e.name} (${e.type})`).join(', ')}`)
      return false
    }
    // pluginConfigBlocks[index] is already up to date
    await homebridge.updatePluginConfig(pluginConfigBlocks)

    // Auto-save to disk if requested - prevents parent UI from overwriting with stale cache
    if (autoSave && typeof homebridge.savePluginConfig === 'function') {
      uiLog.info('Auto-saving config to disk...')
      await homebridge.savePluginConfig()
      uiLog.info('Config saved successfully')
    }

    return true
  } catch (e) {
    uiLog.warn('Failed to sync parent plugin config cache:', e)
    return false
  }
}

export async function fetchCredentialStatus(): Promise<any> {
  try {
    const resp = await homebridge.request('/credentials', {})
    uiLog.info('Load credentials response:', resp)

    if (!resp || resp.success === false) {
      uiLog.error('Failed to load credentials:', resp)
      return null
    }

    return resp.data || {}
  } catch (e) {
    uiLog.error('Error loading credentials:', e)
    return null
  }
}

export async function saveCredentials(token: string, secret: string): Promise<any> {
  uiLog.info('Saving credentials...')
  const resp = await homebridge.request('/credentials', { token, secret })
  uiLog.info('Save response:', resp)
  if (!resp || resp.success === false) {
    throw new Error(resp?.message || 'Save failed')
  }
  return resp.data || resp
}

export interface DiscoverRequestOptions {
  bleEnabled?: boolean
  bleScanDurationSeconds?: number
  bleTimeoutSeconds?: number
}

export async function discoverDevices(
  mode: 'all' | 'ble' | 'openapi' = 'all',
  options?: DiscoverRequestOptions,
): Promise<any[]> {
  const resp = await homebridge.request('/discover', { mode, ...options })
  uiLog.info('Discover response:', resp)
  if (!resp || resp.success === false) {
    throw new Error(resp?.data?.message || 'Discovery failed')
  }
  return resp.data || []
}

export async function fetchBluetoothStatus(): Promise<{ available: boolean, message: string }> {
  try {
    const resp = await homebridge.request('/ble-status', {})
    if (!resp || resp.success === false) {
      return { available: false, message: 'Bluetooth status unavailable' }
    }
    return resp.data || { available: false, message: 'Bluetooth status unavailable' }
  } catch (_e) {
    return { available: false, message: 'Bluetooth status unavailable' }
  }
}

export async function testDeviceConnection(payload: {
  deviceId: string
  connectionType?: string
  address?: string
}): Promise<{
  success: boolean
  deviceId: string
  method: string
  latencyMs: number
  message: string
  state?: Record<string, any>
}> {
  const resp = await homebridge.request('/test-connection', payload)
  if (!resp || resp.success === false) {
    throw new Error(resp?.data?.message || 'Connection test failed')
  }

  return resp.data || {
    success: false,
    deviceId: payload.deviceId,
    method: 'Auto',
    latencyMs: 0,
    message: 'Connection test failed',
  }
}

export async function addDevice(
  deviceId: string,
  name: string,
  type: string,
  options?: {
    address?: string
    model?: string
    rssi?: number
    connectionPreference?: string
    externalPublishProtocol?: string
    room?: string
    encryptionKey?: string
    keyId?: string
    refreshRate?: number
    blePollingEnabled?: boolean
    blePollIntervalMs?: number
  },
): Promise<any> {
  if (typeof homebridge.getPluginConfig !== 'function' || typeof homebridge.updatePluginConfig !== 'function') {
    throw new TypeError('Homebridge UI API not available')
  }
  const configArr = await homebridge.getPluginConfig()
  const idx = Array.isArray(configArr) ? configArr.findIndex(isSwitchBotPlatformConfig) : -1
  if (idx === -1) {
    throw new Error('SwitchBot config not found')
  }
  const config = configArr[idx]
  if (!Array.isArray(config.devices)) {
    config.devices = []
  }
  const normalizedDeviceId = String(deviceId).trim().toLowerCase()
  const exists = config.devices.some((d: any) => String(d.deviceId ?? d.id ?? '').trim().toLowerCase() === normalizedDeviceId)
  if (exists) {
    return { alreadyExists: true, message: 'Device already in config' }
  }
  const newDevice: any = { deviceId, configDeviceName: name, configDeviceType: type }
  if (options?.address) {
    newDevice.address = options.address
  }
  if (options?.model) {
    newDevice.model = options.model
  }
  if (options?.rssi !== undefined && options?.rssi !== null && options?.rssi !== 0) {
    newDevice.rssi = options.rssi
  }
  if (options?.encryptionKey) {
    newDevice.encryptionKey = options.encryptionKey
  }
  if (options?.keyId) {
    newDevice.keyId = options.keyId
  }
  if (options?.connectionPreference) {
    newDevice.connectionPreference = options.connectionPreference
  }
  if (options?.externalPublishProtocol) {
    newDevice.externalPublishProtocol = options.externalPublishProtocol
  }
  if (options?.room) {
    newDevice.room = options.room
  }
  if (typeof options?.refreshRate === 'number' && Number.isFinite(options.refreshRate)) {
    newDevice.refreshRate = options.refreshRate
  }
  if (typeof options?.blePollingEnabled === 'boolean') {
    newDevice.blePollingEnabled = options.blePollingEnabled
  }
  if (typeof options?.blePollIntervalMs === 'number' && Number.isFinite(options.blePollIntervalMs)) {
    newDevice.blePollIntervalMs = options.blePollIntervalMs
  }
  config.devices.push(newDevice)
  await homebridge.updatePluginConfig(configArr)
  if (typeof homebridge.savePluginConfig === 'function') {
    await homebridge.savePluginConfig()
  }
  return { added: true, message: `Device "${name}" added successfully` }
}

export async function addDevicesInBulk(
  devices: Array<{ deviceId: string, name: string, type: string, rssi?: number, address?: string, model?: string }>,
): Promise<any> {
  const resp = await homebridge.request('/add-devices', { devices })
  uiLog.info('Bulk add response:', resp)
  if (!resp || resp.success === false) {
    throw new Error(resp?.data?.message || 'Bulk add failed')
  }
  return normalizeBulkAddDevicesResponse(resp)
}

export function normalizeBulkAddDevicesResponse(resp: any): any {
  const payload = resp?.data && typeof resp.data === 'object' ? resp.data : resp
  const addedCount = Number(payload?.addedCount ?? payload?.added ?? 0)
  const skippedCount = Number(payload?.skippedCount ?? payload?.skipped ?? 0)
  const updatedCount = Number(payload?.updatedCount ?? payload?.updated ?? 0)

  return {
    ...payload,
    success: resp?.success ?? true,
    addedCount,
    skippedCount,
    updatedCount,
  }
}

export async function updateDevice(
  deviceId: string,
  configDeviceName?: string,
  configDeviceType?: string,
  options?: {
    refreshRate?: number
    connectionPreference?: string
    encryptionKey?: string
    keyId?: string
    room?: string
    [key: string]: any
  },
): Promise<any> {
  if (typeof homebridge.getPluginConfig !== 'function' || typeof homebridge.updatePluginConfig !== 'function') {
    throw new TypeError('Homebridge UI API not available')
  }
  const configArr = await homebridge.getPluginConfig()
  const idx = Array.isArray(configArr) ? configArr.findIndex(isSwitchBotPlatformConfig) : -1
  if (idx === -1) {
    throw new Error('SwitchBot config not found')
  }
  const config = configArr[idx]
  if (!Array.isArray(config.devices)) {
    throw new TypeError('No devices array in config')
  }
  const normalizedDeviceId = String(deviceId).trim().toLowerCase()
  const device = config.devices.find((d: any) => String(d.deviceId ?? d.id ?? '').trim().toLowerCase() === normalizedDeviceId)
  if (!device) {
    throw new Error('Device not found in config')
  }
  if (configDeviceName) {
    device.configDeviceName = configDeviceName
  }
  if (configDeviceType) {
    device.configDeviceType = configDeviceType
  }
  if (options) {
    Object.assign(device, options)
  }
  await homebridge.updatePluginConfig(configArr)
  if (typeof homebridge.savePluginConfig === 'function') {
    await homebridge.savePluginConfig()
  }
  return { updated: true, message: `Device updated successfully` }
}

export async function deleteDevice(deviceId: string): Promise<any> {
  if (typeof homebridge.getPluginConfig !== 'function' || typeof homebridge.updatePluginConfig !== 'function') {
    throw new TypeError('Homebridge UI API not available')
  }
  const configArr = await homebridge.getPluginConfig()
  const idx = Array.isArray(configArr) ? configArr.findIndex(isSwitchBotPlatformConfig) : -1
  if (idx === -1) {
    throw new Error('SwitchBot config not found')
  }
  const config = configArr[idx]
  if (!Array.isArray(config.devices)) {
    throw new TypeError('No devices array in config')
  }
  const normalizedDeviceId = String(deviceId).trim().toLowerCase()
  const before = config.devices.length
  // Remove the target device
  config.devices = config.devices.filter(d => String(d.deviceId ?? d.id ?? '').trim().toLowerCase() !== normalizedDeviceId)
  // Defensive: filter out any invalid device entries (missing required fields)
  config.devices = config.devices.filter(d => d && typeof d === 'object' && d.deviceId && d.configDeviceType)
  if (config.devices.length === before) {
    throw new Error('Device not found in config')
  }
  await homebridge.updatePluginConfig(configArr)
  if (typeof homebridge.savePluginConfig === 'function') {
    await homebridge.savePluginConfig()
  }
  return { deleted: true, message: `Device removed from config` }
}

export async function deleteAllDevices(): Promise<any> {
  if (typeof homebridge.getPluginConfig !== 'function' || typeof homebridge.updatePluginConfig !== 'function') {
    throw new TypeError('Homebridge UI API not available')
  }
  const configArr = await homebridge.getPluginConfig()
  // Find or create the SwitchBot config block
  let idx = Array.isArray(configArr) ? configArr.findIndex(isSwitchBotPlatformConfig) : -1
  if (idx === -1) {
    // If not found, create a new config block for SwitchBot
    const newBlock = { platform: 'SwitchBot', devices: [] }
    configArr.push(newBlock)
    idx = configArr.length - 1
  }
  const config = configArr[idx]
  // Always ensure devices is an array
  if (!Array.isArray(config.devices)) {
    config.devices = []
  }
  const deletedCount = config.devices.length
  config.devices = []
  // Defensive: ensure required fields for schema compliance
  if (!config.platform) {
    config.platform = 'SwitchBot'
  }
  // Ensure 'name' property is present (required by schema for Homebridge platform blocks)
  if (!config.name) {
    config.name = 'SwitchBot'
  }
  // Save updated config
  await homebridge.updatePluginConfig(configArr)
  if (typeof homebridge.savePluginConfig === 'function') {
    await homebridge.savePluginConfig()
  }
  return { deleted: true, deletedCount, message: `Removed ${deletedCount} device(s) from config` }
}
