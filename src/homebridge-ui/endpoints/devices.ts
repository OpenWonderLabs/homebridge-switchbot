import type { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils'

import { RequestError } from '@homebridge/plugin-ui-utils'
import fs from 'node:fs/promises'

import { SwitchBotClient } from '../../switchbotClient.js'
import { getAllDevices, getDeviceArrays, getSwitchBotPlatformConfig } from '../utils/config-parser.js'
import { uiLog } from '../utils/logger.js'

/**
 * Register device CRUD endpoints
 */
export function registerDeviceEndpoints(server: HomebridgePluginUiServer) {
  /**
   * POST /test-connection - Test connectivity and basic read for a device
   */
  server.onRequest('/test-connection', async (body: any) => {
    let client: SwitchBotClient | null = null

    try {
      const deviceId = String(body?.deviceId || '').trim()
      if (!deviceId) {
        throw new Error('Device ID is required')
      }

      const { platform } = await getSwitchBotPlatformConfig(server)
      const allDevices = getAllDevices(platform)
      const normalizedDeviceId = deviceId.toLowerCase()
      const configuredDevice = allDevices.find((d: any) => String(d.deviceId ?? d.id ?? '').trim().toLowerCase() === normalizedDeviceId)

      const startedAt = Date.now()

      client = new SwitchBotClient({
        ...(platform as any),
        logger: uiLog,
      } as any)

      await client.init()
      const raw = await client.getDevice(deviceId)
      const latencyMs = Date.now() - startedAt

      const state = raw?.body ?? raw
      const stateConnection = String(state?.connectionType || state?.source || body?.connectionType || '').toLowerCase()
      const method = stateConnection.includes('ble')
        ? 'BLE'
        : stateConnection.includes('api')
          ? 'OpenAPI'
          : 'Auto'

      return {
        success: true,
        data: {
          success: true,
          deviceId,
          method,
          latencyMs,
          message: configuredDevice
            ? `Connected to "${configuredDevice.configDeviceName || configuredDevice.deviceId || deviceId}"`
            : 'Connected successfully',
          state: {
            online: state?.online,
            power: state?.power,
            battery: state?.battery,
            version: state?.version,
            deviceType: state?.deviceType,
          },
        },
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      uiLog.warn(`POST /test-connection failed: ${message}`)

      return {
        success: true,
        data: {
          success: false,
          deviceId: String(body?.deviceId || ''),
          method: 'Auto',
          latencyMs: 0,
          message,
        },
      }
    } finally {
      try {
        await client?.destroy()
      } catch (_e) {
        // Ignore client shutdown errors
      }
    }
  })

  /**
   * POST /add-device - Add a single device to config
   */
  server.onRequest('/add-device', async (body: any) => {
    try {
      const { deviceId, name, type, address, model, rssi, encryptionKey, keyId } = body

      if (!deviceId) {
        throw new Error('Device ID is required')
      }

      const { cfg, platform, cfgPath } = await getSwitchBotPlatformConfig(server)

      uiLog.info('POST /add-device - Request received')
      uiLog.debug(`POST /add-device - Request body: ${JSON.stringify(body)}`)
      uiLog.debug(`POST /add-device - Config file path: ${cfgPath}`)

      const deviceArrays = getDeviceArrays(platform)
      const allDevices = getAllDevices(platform)

      const normalizedDeviceId = String(deviceId).trim().toLowerCase()
      const exists = allDevices.some((d: any) => String(d.deviceId ?? d.id ?? '').trim().toLowerCase() === normalizedDeviceId)
      if (exists) {
        uiLog.info(`POST /add-device - Device already exists: ${deviceId}`)
        return {
          success: true,
          data: {
            message: 'Device already in config',
            alreadyExists: true,
          },
        }
      }

      let addCount = 0
      for (const ref of deviceArrays) {
        const refHasDevice = ref.some((d: any) => String(d.deviceId ?? d.id ?? '').trim().toLowerCase() === normalizedDeviceId)
        if (!refHasDevice) {
          const newDevice: any = {
            deviceId,
            configDeviceName: name,
            configDeviceType: type,
          }
          if (address) {
            newDevice.address = address
          }
          if (model) {
            newDevice.model = model
          }
          if (rssi !== undefined && rssi !== null && rssi !== 0) {
            newDevice.rssi = rssi
          }
          if (encryptionKey) {
            newDevice.encryptionKey = encryptionKey
          }
          if (keyId) {
            newDevice.keyId = keyId
          }
          ref.push(newDevice)
          addCount++
        }
      }

      if (!addCount) {
        return {
          success: false,
          data: { message: 'Failed to add device to config' },
        }
      }

      const configJson = JSON.stringify(cfg, null, 2)
      const fileHandle = await fs.open(cfgPath, 'w')
      try {
        await fileHandle.writeFile(configJson, 'utf8')
        await fileHandle.sync()
      } finally {
        await fileHandle.close()
      }

      // Notify Homebridge UI that config changed
      server.pushEvent('configChanged', { source: 'switchbot-plugin' })
      uiLog.debug('POST /add-device - Sent configChanged event to UI')

      return {
        success: true,
        data: {
          message: `Device "${name}" added successfully`,
          alreadyExists: false,
          added: true,
        },
      }
    } catch (e) {
      uiLog.error(`Error in /add-device: ${e instanceof Error ? e.message : String(e)}`)
      throw new RequestError(`Failed to add device: ${e instanceof Error ? e.message : String(e)}`, e)
    }
  })

  /**
   * POST /add-devices - Add multiple devices to config (bulk add)
   */
  server.onRequest('/add-devices', async (body: any) => {
    try {
      const { devices } = body

      if (!Array.isArray(devices) || devices.length === 0) {
        throw new Error('Devices array is required and must not be empty')
      }

      const { cfg, platform, cfgPath } = await getSwitchBotPlatformConfig(server)
      uiLog.debug(`POST /add-devices - Received ${devices.length} device(s) to add`)
      uiLog.debug(`POST /add-devices - Config path: ${cfgPath}`)

      const deviceArrays = getDeviceArrays(platform)
      const allDevices = getAllDevices(platform)

      uiLog.debug(`POST /add-devices - Device arrays count: ${deviceArrays.length}, existing devices: ${allDevices.length}`)
      uiLog.debug(`POST /add-devices - Platform.devices exists: ${!!platform.devices}, length: ${platform.devices?.length || 0}`)

      let addedCount = 0
      let skippedCount = 0
      const results: Array<Record<string, any>> = []

      for (const { deviceId, name, type, rssi, address, model } of devices) {
        if (!deviceId) {
          results.push({ deviceId: '?', success: false, message: 'Device ID is required' })
          skippedCount++
          continue
        }

        const normalizedDeviceId = String(deviceId).trim().toLowerCase()
        const exists = allDevices.some((d: any) => String(d.deviceId ?? d.id ?? '').trim().toLowerCase() === normalizedDeviceId)

        if (exists) {
          uiLog.debug(`POST /add-devices - Device already exists: ${deviceId}`)
          results.push({ deviceId, success: true, message: 'Already in config', alreadyExists: true })
          skippedCount++
          continue
        }

        let addedToArray = false
        for (const ref of deviceArrays) {
          const refHasDevice = ref.some((d: any) => String(d.deviceId ?? d.id ?? '').trim().toLowerCase() === normalizedDeviceId)
          if (!refHasDevice) {
            const newDevice: any = {
              deviceId,
              configDeviceName: name,
              configDeviceType: type,
            }
            // Store RSSI, address, and model if available
            if (rssi !== undefined && rssi !== null && rssi !== 0) {
              newDevice.rssi = rssi
            }
            if (address) {
              newDevice.address = address
            }
            if (model) {
              newDevice.model = model
            }

            ref.push(newDevice)
            addedToArray = true
            uiLog.debug(`POST /add-devices - Added device to array: ${deviceId} (${name}, ${type}, RSSI: ${rssi})`)
          }
        }

        if (addedToArray) {
          results.push({ deviceId, success: true, message: `Device "${name}" added` })
          addedCount++
        } else {
          uiLog.warn(`POST /add-devices - Failed to add device: ${deviceId}`)
          results.push({ deviceId, success: false, message: 'Failed to add device' })
          skippedCount++
        }
      }

      uiLog.info(`POST /add-devices - Adding ${addedCount} devices to config: ${cfgPath}`)
      const configJson = JSON.stringify(cfg, null, 2)
      const fileHandle = await fs.open(cfgPath, 'w')
      try {
        await fileHandle.writeFile(configJson, 'utf8')
        await fileHandle.sync()
        uiLog.info(`POST /add-devices - Config file written successfully`)
      } finally {
        await fileHandle.close()
      }

      // Notify Homebridge UI that config changed to prevent cache overwrite
      server.pushEvent('configChanged', { source: 'switchbot-plugin' })
      uiLog.debug('POST /add-devices - Sent configChanged event to UI')

      return {
        success: true,
        data: {
          message: `Added ${addedCount} device(s)${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`,
          addedCount,
          skippedCount,
          results,
        },
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      uiLog.error(`Error in /add-devices: ${errorMsg}`)
      if (e instanceof Error && e.stack) {
        uiLog.debug(`Stack trace: ${e.stack}`)
      }
      throw new RequestError(`Failed to add devices: ${errorMsg}`, e)
    }
  })

  /**
   * POST /update-device - Update existing device in config
   */
  server.onRequest('/update-device', async (body: any) => {
    try {
      const { deviceId, configDeviceName, configDeviceType, connectionPreference, room } = body

      if (!deviceId) {
        throw new Error('Device ID is required')
      }

      const { cfg, platform, cfgPath } = await getSwitchBotPlatformConfig(server)
      const deviceArrays = getDeviceArrays(platform)
      const devices = getAllDevices(platform)

      const normalizedDeviceId = String(deviceId).trim().toLowerCase()
      const device = devices.find((d: any) => String(d.deviceId ?? d.id ?? '').trim().toLowerCase() === normalizedDeviceId)
      if (!device) {
        throw new Error('Device not found in config')
      }

      for (const ref of deviceArrays) {
        for (const entry of ref) {
          const entryId = String(entry.deviceId ?? entry.id ?? '').trim().toLowerCase()
          if (entryId !== normalizedDeviceId) {
            continue
          }

          if (configDeviceName !== undefined && configDeviceName !== null && String(configDeviceName).trim() !== '') {
            entry.configDeviceName = configDeviceName
          }
          if (configDeviceType !== undefined && configDeviceType !== null && String(configDeviceType).trim() !== '') {
            entry.configDeviceType = configDeviceType
          }
          if (connectionPreference !== undefined) {
            entry.connectionPreference = connectionPreference
          }
          if (room !== undefined) {
            entry.room = room || undefined
          }
        }
      }

      const configJson = JSON.stringify(cfg, null, 2)
      const fileHandle = await fs.open(cfgPath, 'w')
      try {
        await fileHandle.writeFile(configJson, 'utf8')
        await fileHandle.sync()
      } finally {
        await fileHandle.close()
      }

      // Notify Homebridge UI that config changed
      server.pushEvent('configChanged', { source: 'switchbot-plugin' })
      uiLog.debug('POST /update-device - Sent configChanged event to UI')

      return {
        success: true,
        data: { message: `Device updated successfully - type: ${configDeviceType || device.configDeviceType}` },
      }
    } catch (e) {
      uiLog.error(`Error in /update-device: ${e instanceof Error ? e.message : String(e)}`)
      throw new RequestError(`Failed to update device: ${e instanceof Error ? e.message : String(e)}`, e)
    }
  })

  /**
   * POST /delete-device - Remove device from config
   */
  server.onRequest('/delete-device', async (body: any) => {
    try {
      const { deviceId } = body
      uiLog.info(`POST /delete-device - Requested deviceId: ${deviceId ?? 'undefined'}`)

      if (!deviceId) {
        throw new Error('Device ID is required')
      }

      const { cfg, platform, cfgPath } = await getSwitchBotPlatformConfig(server)
      const deviceArrays = getDeviceArrays(platform)
      const normalizedDeviceId = String(deviceId).trim().toLowerCase()
      const allDevices = getAllDevices(platform)

      const existing = allDevices.find((d: any) => String(d.deviceId ?? d.id ?? '').trim().toLowerCase() === normalizedDeviceId)
      if (!existing) {
        throw new Error('Device not found in config')
      }

      const deviceName = existing.configDeviceName || deviceId
      let removedCount = 0
      for (const ref of deviceArrays) {
        for (let i = ref.length - 1; i >= 0; i--) {
          const id = String(ref[i]?.deviceId ?? ref[i]?.id ?? '').trim().toLowerCase()
          if (id === normalizedDeviceId) {
            ref.splice(i, 1)
            removedCount++
          }
        }
      }

      if (!removedCount) {
        throw new Error('Device not found in config')
      }

      const configJson = JSON.stringify(cfg, null, 2)
      const fileHandle = await fs.open(cfgPath, 'w')
      try {
        await fileHandle.writeFile(configJson, 'utf8')
        await fileHandle.sync()
      } finally {
        await fileHandle.close()
      }

      // Notify Homebridge UI that config changed
      server.pushEvent('configChanged', { source: 'switchbot-plugin' })
      uiLog.debug('DELETE /delete-device - Sent configChanged event to UI')

      return {
        success: true,
        data: { message: `Device "${deviceName}" removed from config` },
      }
    } catch (e) {
      uiLog.error(`Error in /delete-device: ${e instanceof Error ? e.message : String(e)}`)
      throw new RequestError('Failed to delete device', e)
    }
  })

  /**
   * POST /delete-all-devices - Remove all devices from config
   */
  server.onRequest('/delete-all-devices', async () => {
    try {
      uiLog.info('POST /delete-all-devices - Request received')

      const { cfg, platform, cfgPath } = await getSwitchBotPlatformConfig(server)
      const deviceArrays = getDeviceArrays(platform)
      const allDevices = getAllDevices(platform)

      if (allDevices.length === 0) {
        return {
          success: true,
          data: { message: 'No devices to delete', deletedCount: 0 },
        }
      }

      const deviceCount = allDevices.length
      uiLog.info(`POST /delete-all-devices - Removing ${deviceCount} device(s)`)

      // Clear all device arrays
      for (const ref of deviceArrays) {
        ref.length = 0 // Clear array in place
      }

      const configJson = JSON.stringify(cfg, null, 2)
      const fileHandle = await fs.open(cfgPath, 'w')
      try {
        await fileHandle.writeFile(configJson, 'utf8')
        await fileHandle.sync()
        uiLog.info('POST /delete-all-devices - Config file written successfully')
      } finally {
        await fileHandle.close()
      }

      // Notify Homebridge UI that config changed
      server.pushEvent('configChanged', { source: 'switchbot-plugin' })
      uiLog.debug('DELETE /delete-all-devices - Sent configChanged event to UI')

      return {
        success: true,
        data: {
          message: `Removed ${deviceCount} device(s) from config`,
          deletedCount: deviceCount,
        },
      }
    } catch (e) {
      uiLog.error(`Error in /delete-all-devices: ${e instanceof Error ? e.message : String(e)}`)
      throw new RequestError(`Failed to delete all devices: ${e instanceof Error ? e.message : String(e)}`, e)
    }
  })
}
