import type { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils'

import { SwitchBotClient } from '../../switchbotClient.js'
import { getAllDevices, getDevicesRef, getSwitchBotPlatformConfig } from '../utils/config-parser.js'
import { uiLog } from '../utils/logger.js'

/**
 * Register device CRUD endpoints
 */
export function registerDeviceEndpoints(server: HomebridgePluginUiServer) {
  /**
   * POST /add-devices - Add or update multiple devices in the Homebridge config
   * Expects: { devices: Array<{ deviceId, configDeviceType, configDeviceName, ... }> }
   */
  server.onRequest('/add-devices', async (body: any) => {
    try {
      if (!body || !Array.isArray(body.devices) || body.devices.length === 0) {
        throw new Error('No devices provided')
      }

      const { platform, cfg, cfgPath } = await getSwitchBotPlatformConfig(server)
      const devicesRef = getDevicesRef(platform)
      const incomingDevices = body.devices
      let added = 0
      let updated = 0

      for (const newDev of incomingDevices) {
        const id = String(newDev.deviceId || newDev.id || '').trim().toLowerCase()
        if (!id) {
          continue
        }
        const idx = devicesRef.findIndex((d: any) => String(d.deviceId || d.id || '').trim().toLowerCase() === id)
        if (idx >= 0) {
          // Update existing device
          devicesRef[idx] = { ...devicesRef[idx], ...newDev }
          updated++
        } else {
          // Add new device
          devicesRef.push({ ...newDev })
          added++
        }
      }

      // Log devicesRef and cfgPath before saving
      uiLog.info(`[DEBUG] devicesRef before save:`, JSON.stringify(devicesRef, null, 2))
      uiLog.info(`[DEBUG] cfgPath:`, cfgPath)
      await import('../utils/config-parser.js').then(m => m.saveConfig(cfgPath, cfg))

      // Log the config file contents after saving for debugging
      try {
        const fs = await import('node:fs/promises')
        const raw = await fs.readFile(cfgPath, 'utf-8')
        uiLog.info(`[DEBUG] Config after add-devices save:`, raw)
      } catch (e) {
        uiLog.warn(`[DEBUG] Could not read config after save:`, e)
      }

      uiLog.info(`POST /add-devices - Added: ${added}, Updated: ${updated}`)
      return {
        success: true,
        data: {
          added,
          updated,
          total: devicesRef.length,
        },
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      uiLog.error(`POST /add-devices failed: ${msg}`)
      return {
        success: false,
        error: msg,
      }
    }
  })
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
}
