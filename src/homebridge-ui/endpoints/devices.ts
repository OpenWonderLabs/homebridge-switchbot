import type { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils'

import { SwitchBotClient } from '../../switchbotClient.js'
import { getAllDevices, getSwitchBotPlatformConfig } from '../utils/config-parser.js'
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
}
