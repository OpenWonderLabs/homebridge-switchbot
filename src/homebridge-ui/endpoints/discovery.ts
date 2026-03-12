import type { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils'

import { RequestError } from '@homebridge/plugin-ui-utils'

import { getCredential, getSwitchBotPlatformConfig } from '../utils/config-parser.js'
import { uiLog } from '../utils/logger.js'

/**
 * Register discovery endpoint
 * Discovers SwitchBot devices via BLE and OpenAPI
 */
export function registerDiscoveryEndpoint(server: HomebridgePluginUiServer) {
  server.onRequest('/ble-status', async () => {
    try {
      const { platform } = await getSwitchBotPlatformConfig(server)
      const token = getCredential(platform, 'openApiToken') || platform.token
      const secret = getCredential(platform, 'openApiSecret') || platform.secret
      const { SwitchBot } = await import('node-switchbot')
      const switchbot = new SwitchBot({
        token: token || undefined,
        secret: secret || undefined,
        enableBLE: true,
        enableFallback: true,
        enableRetry: true,
      })

      await switchbot.discover({ timeout: 1000 })
      return { success: true, data: { available: true, message: 'adapter ready' } }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      uiLog.warn(`GET /ble-status failed: ${message}`)
      return { success: true, data: { available: false, message } }
    }
  })

  server.onRequest('/discover', async (payload?: any) => {
      uiLog.debug(`[SwitchBot UI/Server] /discover incoming payload: ${JSON.stringify(payload)}`)
    try {
      const { platform } = await getSwitchBotPlatformConfig(server)
      const mode = String(payload?.mode || 'all').toLowerCase()
      // Only run BLE if mode is all/ble AND bleEnabled is not false (default true if missing)
      const bleEnabled = payload?.bleEnabled !== false;
      const runBle = (mode === 'all' || mode === 'ble') && bleEnabled;
      const runOpenApi = mode === 'all' || mode === 'openapi'
      const bleScanDurationSeconds = Math.max(3, Math.min(15, Number(payload?.bleScanDurationSeconds || 5)))
      const bleTimeoutSeconds = Math.max(3, Math.min(30, Number(payload?.bleTimeoutSeconds || 8)))

      uiLog.debug(`GET /discover - Platform config keys: ${Object.keys(platform).join(', ')}`)

      const token = getCredential(platform, 'openApiToken') || platform.token
      const secret = getCredential(platform, 'openApiSecret') || platform.secret

      const hasOpenAPICredentials = !!token

      if (!hasOpenAPICredentials) {
        uiLog.warn('GET /discover - No OpenAPI credentials found, will attempt BLE-only discovery')
      } else {
        uiLog.info('GET /discover - Using OpenAPI credentials for discovery')
      }

      // Import and initialize node-switchbot
      const { SwitchBot } = await import('node-switchbot')
      const switchbot = new SwitchBot({
        token: token || undefined,
        secret: secret || undefined,
        enableBLE: true,
        enableFallback: true,
        enableRetry: true,
      })

      const deviceMap = new Map<string, any>()

      // 1. Try BLE discovery first (with timeout)
      if (runBle) {
        uiLog.info('GET /discover - Starting BLE scan...')
        try {
          const bleTimeout = bleTimeoutSeconds * 1000
          const bleDiscoveryPromise = switchbot.discover({ timeout: bleScanDurationSeconds * 1000 })
          const bleDevices = await Promise.race([
            bleDiscoveryPromise,
            new Promise<any[]>(resolve => setTimeout(resolve, bleTimeout, [])),
          ])

          if (Array.isArray(bleDevices) && bleDevices.length > 0) {
            uiLog.info(`GET /discover - Found ${bleDevices.length} BLE devices`)
            for (const [index, d] of bleDevices.entries()) {
              const info = typeof d?.getInfo === 'function' ? d.getInfo() : undefined
              const id = d?.id
                || (typeof d?.getId === 'function' ? d.getId() : undefined)
                || info?.id

              const mac = d?.mac
                || (typeof d?.getMAC === 'function' ? d.getMAC() : undefined)
                || info?.mac

              if (!id) {
                uiLog.warn(`GET /discover - BLE device at index ${index} has no id, skipping`)
                continue
              }

              const connectionTypes = Array.isArray(info?.connectionTypes) ? info.connectionTypes : []
              const isHybrid = connectionTypes.includes('api')

              deviceMap.set(id, {
                id,
                name: d?.name || (typeof d?.getName === 'function' ? d.getName() : undefined) || info?.name || d?.deviceName || id,
                type: d?.deviceType || (typeof d?.getDeviceType === 'function' ? d.getDeviceType() : undefined) || info?.deviceType || d?.type || d?.model || 'unknown',
                model: info?.model || d?.model || d?.deviceModel,
                address: mac,
                connectionType: isHybrid ? 'Both' : 'BLE',
                rssi: info?.rssi || d?.rssi,
              })
            }
          } else {
            uiLog.info('GET /discover - No BLE devices found or scan timed out')
          }
        } catch (bleErr) {
          uiLog.warn(`GET /discover - BLE discovery failed: ${bleErr instanceof Error ? bleErr.message : String(bleErr)}`)
          // Continue with OpenAPI even if BLE fails
        }
      }

      // 2. Get devices from OpenAPI (only if credentials are available)
      if (runOpenApi && hasOpenAPICredentials) {
        uiLog.info('GET /discover - Fetching devices from OpenAPI...')
        try {
          const apiClient = switchbot.getAPIClient()
          if (!apiClient) {
            throw new Error('API client not available - token/secret may be missing')
          }
          const apiData = await apiClient.getDevices()
          uiLog.debug(`GET /discover - OpenAPI response: ${JSON.stringify(apiData)}`)

          // Parse physical devices - apiData is DeviceListResponse with deviceList and infraredRemoteList
          const devices = apiData.deviceList || []
          const irDevices = apiData.infraredRemoteList || []

          uiLog.info(`GET /discover - Found ${devices.length} OpenAPI physical devices and ${irDevices.length} IR devices`)

          // Process physical devices from OpenAPI
          for (const d of devices) {
            const id = d.deviceId
            if (!id) {
              continue
            }

            const existing = deviceMap.get(id)
            if (existing) {
              // Device found via both BLE and OpenAPI
              existing.connectionType = 'Both'
              existing.name = d.deviceName || existing.name
              existing.type = d.deviceType || existing.type
              // Note: APIDevice doesn't have a model property
              existing.enabled = d.enableCloudService !== false
              existing.hubDeviceId = d.hubDeviceId
            } else {
              // Device only found via OpenAPI
              deviceMap.set(id, {
                id,
                name: d.deviceName || id,
                type: d.deviceType || 'unknown',
                enabled: d.enableCloudService !== false,
                hubDeviceId: d.hubDeviceId,
                connectionType: 'OpenAPI',
              })
            }
          }

          // Process IR devices (OpenAPI only)
          for (const d of irDevices) {
            const id = d.deviceId
            if (!id) {
              continue
            }

            deviceMap.set(id, {
              id,
              name: d.deviceName || id,
              type: d.remoteType || 'unknown',
              enabled: true,
              hubDeviceId: d.hubDeviceId,
              connectionType: 'OpenAPI',
              isIR: true,
            })
          }
        } catch (apiErr) {
          uiLog.error(`GET /discover - OpenAPI discovery failed: ${apiErr instanceof Error ? apiErr.message : String(apiErr)}`)
          // If we have BLE devices, we can still return those
          if (deviceMap.size === 0) {
            throw apiErr
          }
        }
      } else if (runOpenApi) {
        uiLog.info('GET /discover - Skipping OpenAPI discovery (no credentials configured)')
      }

      const normalizedBleDevices = [...deviceMap.values()].filter(d => d.connectionType === 'BLE' || d.connectionType === 'Both')
      const firstNormalizedBleId = normalizedBleDevices[0]?.id || 'none'
      uiLog.info(`GET /discover - Normalized BLE devices: ${normalizedBleDevices.length} (firstId: ${firstNormalizedBleId})`)

      // Check if we found any devices
      if (deviceMap.size === 0 && mode === 'openapi' && !hasOpenAPICredentials) {
        return { success: true, data: [] }
      }

      if (deviceMap.size === 0) {
        const errorMsg = hasOpenAPICredentials
          ? 'No devices found via BLE or OpenAPI. Make sure devices are powered on and in range.'
          : 'No devices found via BLE. OpenAPI credentials not configured. Please save your credentials in settings to discover cloud-connected devices, or ensure BLE devices are powered on and in range.'
        uiLog.error(`GET /discover - ${errorMsg}`)
        throw new Error(errorMsg)
      }

      // Convert map to array
      const allDiscovered = [...deviceMap.values()]

      const bleCount = allDiscovered.filter(d => d.connectionType === 'BLE').length
      const apiCount = allDiscovered.filter(d => d.connectionType === 'OpenAPI').length
      const bothCount = allDiscovered.filter(d => d.connectionType === 'Both').length

      uiLog.info(`GET /discover - Total: ${allDiscovered.length} devices (BLE: ${bleCount}, OpenAPI: ${apiCount}, Both: ${bothCount})`)
      return { success: true, data: allDiscovered }
    } catch (e) {
      if (e instanceof Error) {
        uiLog.error(`Error in /discover: ${e.message}`)
        if (e.stack) {
          uiLog.error(`[Stack] ${e.stack}`)
        }
        uiLog.error(`[Object]`, e)
      } else {
        uiLog.error(`Error in /discover: ${String(e)}`)
      }
      throw new RequestError(`Failed to discover devices: ${e instanceof Error ? e.message : String(e)}`, e)
    }
  })
}
