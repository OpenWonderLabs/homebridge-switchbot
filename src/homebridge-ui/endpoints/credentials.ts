import type { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils'

import { RequestError } from '@homebridge/plugin-ui-utils'
import fs from 'node:fs/promises'

import { getCredential, getSwitchBotPlatformConfig, setCredential } from '../utils/config-parser.js'
import { uiLog } from '../utils/logger.js'

/**
 * Register credentials endpoint
 */
export function registerCredentialsEndpoint(server: HomebridgePluginUiServer) {
  server.onRequest('/credentials', async (body: any) => {
    try {
      // Handle both GET and POST requests
      if (!body || Object.keys(body).length === 0) {
        // GET request - return current status
        const { platform } = await getSwitchBotPlatformConfig(server)

        const token = getCredential(platform, 'openApiToken')
        const secret = getCredential(platform, 'openApiSecret')
        const status = {
          hasToken: !!token,
          hasSecret: !!secret,
          tokenLength: token ? String(token).length : 0,
          secretLength: secret ? String(secret).length : 0,
        }

        uiLog.info(`GET /credentials - Status hasToken=${status.hasToken} hasSecret=${status.hasSecret}`)
        return { success: true, data: status }
      } else {
        // POST request - save credentials
        const { token, secret } = body

        if (!token || !secret) {
          throw new Error('Token and secret are required')
        }

        const { cfg, platform, cfgPath } = await getSwitchBotPlatformConfig(server)

        uiLog.info(`POST /credentials - Saving to platform: ${platform.platform || platform.name}`)
        uiLog.debug(`POST /credentials - Config path: ${cfgPath}`)
        uiLog.debug(`POST /credentials - Token length: ${token.length}, Secret length: ${secret.length}`)

        // Save token and secret
        setCredential(platform, 'openApiToken', token)
        setCredential(platform, 'openApiSecret', secret)

        // Write config with fsync
        const configJson = JSON.stringify(cfg, null, 2)
        const fileHandle = await fs.open(cfgPath, 'w')
        try {
          await fileHandle.writeFile(configJson, 'utf8')
          await fileHandle.sync()
          uiLog.info('POST /credentials - Credentials saved and synced to disk')
        } finally {
          await fileHandle.close()
        }

        // Notify Homebridge UI that config changed
        server.pushEvent('configChanged', { source: 'switchbot-plugin' })
        uiLog.debug('POST /credentials - Sent configChanged event to UI')

        return {
          success: true,
          data: { message: 'Credentials saved successfully' },
        }
      }
    } catch (e) {
      uiLog.error(`Error in /credentials: ${e instanceof Error ? e.message : String(e)}`)
      throw new RequestError('Failed to handle credentials request', e)
    }
  })
}
