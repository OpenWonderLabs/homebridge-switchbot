import { isValidDeviceType, normalizeDeviceType } from '../../../device-types.js'
import './types.js'
import { uiLog } from './logger.js'

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

    const diskResp = await homebridge.request('/platform-config', {})
    if (!diskResp || diskResp.success === false || !diskResp.data) {
      uiLog.warn('Failed to fetch fresh platform config from disk')
      return false
    }

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
    const errors = validateAndFixDeviceTypes(diskResp.data.devices || [])
    if (errors.length > 0) {
      homebridge.toast?.error?.(`Invalid device types found: ${errors.map(e => `${e.name} (${e.type})`).join(', ')}`)
      return false
    }
    pluginConfigBlocks[index] = diskResp.data
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

export async function fetchDevices(): Promise<any[]> {
  try {
    const resp = await homebridge.request('/devices', {})
    if (!resp || resp.success === false) {
      // Prefer backend error message if available
      const backendMsg = resp?.data?.message || resp?.message
      throw new Error(backendMsg || 'request failed')
    }
    return resp.data || []
  } catch (e) {
    // Show the real error to the user
    const msg = e instanceof Error ? e.message : String(e)
    uiLog.error('Error fetching devices:', msg)
    // Optionally, show a toast or UI error here if needed
    return []
  }
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
  options?: { address?: string, model?: string, rssi?: number, encryptionKey?: string, keyId?: string },
): Promise<any> {
  const payload: any = { deviceId, name, type }
  if (options?.address) {
    payload.address = options.address
  }
  if (options?.model) {
    payload.model = options.model
  }
  if (options?.rssi !== undefined && options?.rssi !== null && options?.rssi !== 0) {
    payload.rssi = options.rssi
  }
  if (options?.encryptionKey) {
    payload.encryptionKey = options.encryptionKey
  }
  if (options?.keyId) {
    payload.keyId = options.keyId
  }
  uiLog.info('Adding device to config:', payload)
  const resp = await homebridge.request('/add-device', payload)
  uiLog.info('Add device response:', resp)
  if (!resp || resp.success === false) {
    throw new Error(resp?.data?.message || 'Failed to add device')
  }
  return resp.data || resp
}

export async function addDevicesInBulk(
  devices: Array<{ deviceId: string, name: string, type: string, rssi?: number, address?: string, model?: string }>,
): Promise<any> {
  const resp = await homebridge.request('/add-devices', { devices })
  uiLog.info('Bulk add response:', resp)
  if (!resp || resp.success === false) {
    throw new Error(resp?.data?.message || 'Bulk add failed')
  }
  return resp.data || resp
}

export async function updateDevice(
  deviceId: string,
  configDeviceName?: string,
  configDeviceType?: string,
): Promise<any> {
  const params: any = { deviceId }
  if (configDeviceName) {
    params.configDeviceName = configDeviceName
  }
  if (configDeviceType) {
    params.configDeviceType = configDeviceType
  }
  uiLog.info('[Update Device] Sending update request with params:', params)
  const resp = await homebridge.request('/update-device', params)
  uiLog.info('[Update Device] Update response:', resp)
  if (!resp || resp.success === false) {
    throw new Error(resp?.data?.message || 'Failed to update device')
  }
  return resp.data || resp
}

export async function deleteDevice(deviceId: string): Promise<any> {
  uiLog.info('Sending delete request for deviceId:', deviceId)
  const resp = await homebridge.request('/delete-device', { deviceId })
  uiLog.info('Delete response:', resp)
  if (!resp || resp.success === false) {
    throw new Error(resp?.data?.message || 'Failed to delete device')
  }
  return resp.data || resp
}

export async function deleteAllDevices(): Promise<any> {
  uiLog.info('Sending delete all devices request')
  const resp = await homebridge.request('/delete-all-devices', {})
  uiLog.info('Delete all response:', resp)
  if (!resp || resp.success === false) {
    throw new Error(resp?.data?.message || 'Failed to delete all devices')
  }
  return resp.data || resp
}
