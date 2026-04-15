import type { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils'

import { RequestError } from '@homebridge/plugin-ui-utils'
import fs from 'node:fs/promises'

import { isValidDeviceType } from '../../device-types.js'
import { getAllDevices, isV4Config, SWITCHBOT_PLATFORM_REGEX } from '../utils/config-parser.js'
import { validateAndMigrateDeviceType } from '../utils/device-migration.js'
import { uiLog } from '../utils/logger.js'

export function registerConfigEndpoints(server: HomebridgePluginUiServer) {
  /**
   * GET /devices - List all configured devices from Homebridge config
   */

  server.onRequest('/devices', async () => {
    try {
      const cfgPath = server.homebridgeConfigPath
      if (!cfgPath) {
        throw new Error('HOMEBRIDGE_CONFIG_PATH not set')
      }

      const raw = await fs.readFile(cfgPath, 'utf8')
      const cfg = JSON.parse(raw)
      const found: Array<{
        id: string
        name?: string
        type?: string
        connectionPreference?: string
        room?: string
        typeValidationWarning?: string
      }> = []
      const invalidTypeDevices: Array<{ name: string, type: string, suggestion?: string }> = []
      let v4ConfigDetected = false

      const platforms = Array.isArray(cfg.platforms) ? cfg.platforms : []
      for (const p of platforms) {
        try {
          const platformName = p.platform || p.name || ''
          // Match known SwitchBot platform identifiers
          if (!platformName || !SWITCHBOT_PLATFORM_REGEX.test(String(platformName))) {
            continue
          }

          // Detect legacy v4 config format
          if (isV4Config(p)) {
            v4ConfigDetected = true
            uiLog.warn('Detected legacy v4 config format (credentials/options.devices). This config is not compatible with v5+. Please migrate to the v5 config format.')
          }

          const devices = getAllDevices(p)
          for (const d of devices) {
            const id = d.deviceId ?? d.id
            if (!id) {
              continue
            }

            const deviceType = d.configDeviceType ?? d.type ?? d.deviceType
            const deviceName = d.configDeviceName ?? d.name ?? d.deviceName

            // Validate device type
            const deviceObj = { configDeviceType: deviceType, configDeviceName: deviceName, deviceId: id }
            const validationResult = validateAndMigrateDeviceType(deviceObj, false)

            const deviceEntry: typeof found[0] = {
              id,
              name: deviceName,
              type: deviceType,
              connectionPreference: d.connectionPreference ?? d.connection ?? 'auto',
              room: d.room || d.location || undefined,
            }

            if (!isValidDeviceType(deviceType)) {
              deviceEntry.typeValidationWarning = `Invalid type "${deviceType}"`
              if (validationResult.correctedType) {
                deviceEntry.typeValidationWarning += ` - should be "${validationResult.correctedType}"`
                invalidTypeDevices.push({
                  name: deviceName,
                  type: deviceType,
                  suggestion: validationResult.correctedType,
                })
              } else {
                invalidTypeDevices.push({
                  name: deviceName,
                  type: deviceType,
                })
              }
            }

            found.push(deviceEntry)
          }
        } catch (e) {
          // ignore malformed platform entries
        }
      }

      // Log validation issues
      if (invalidTypeDevices.length > 0) {
        uiLog.warn(
          `Found ${invalidTypeDevices.length} device(s) with invalid types:\n${invalidTypeDevices.map(d => `  - "${d.name}": "${d.type}"${d.suggestion ? ` → should be "${d.suggestion}"` : ''}`).join('\n')}`,
        )
      }

      uiLog.info(`GET /devices - Found ${found.length} devices in ${cfgPath}${invalidTypeDevices.length > 0 ? ` (${invalidTypeDevices.length} with validation warnings)` : ''}${v4ConfigDetected ? ' [v4 config detected]' : ''}`)
      return {
        success: true,
        data: found,
        ...(invalidTypeDevices.length > 0 && { validationWarnings: invalidTypeDevices }),
        ...(v4ConfigDetected && { v4ConfigDetected: true }),
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      uiLog.error(`Error in /devices: ${msg}`)
      // Pass the real error message to the frontend for better diagnostics
      throw new RequestError(msg || 'Failed to read Homebridge config', e)
    }
  })
}
