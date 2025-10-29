import fs from 'node:fs'

import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils'

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super()
    /*
      A native method getCachedAccessories() was introduced in config-ui-x v4.37.0
      The following is for users who have a lower version of config-ui-x
    */
    const getCachedAccessoriesHandler = () => {
      try {
        // Some Homebridge versions store cached accessories with the scoped
        // plugin name ("@switchbot/homebridge-switchbot"); others may use
        // the unscoped id ("homebridge-switchbot"). Check both.
        const pluginNames = ['@switchbot/homebridge-switchbot', 'homebridge-switchbot']
        const devicesToReturn = []

        // The path and file of the cached accessories
        const accFile = `${this.homebridgeStoragePath}/accessories/cachedAccessories`

        // Check the file exists
        if (fs.existsSync(accFile)) {
          // read the cached accessories file
          const cachedAccessories: any[] = JSON.parse(fs.readFileSync(accFile, 'utf8'))

          cachedAccessories.forEach((entry: any) => {
            // entry shape varies by UI version
            const pluginName = entry.plugin || entry?.accessory?.plugin || entry?.accessory?.pluginName
            const acc = entry.accessory ?? entry
            if (pluginNames.includes(pluginName)) {
              devicesToReturn.push(acc as never)
            }
          })
        }
        // Return the array
        console.warn(`[Homebridge UI] getCachedAccessories returning ${devicesToReturn.length} device(s)`)
        return devicesToReturn
      } catch (e: any) {
        // Just return an empty accessory list in case of any errors
        console.error(`[Homebridge UI] getCachedAccessories error: ${e?.message ?? e}`)
        return []
      }
    }
    this.onRequest('getCachedAccessories', getCachedAccessoriesHandler)
    // Also register with a leading slash for compatibility with some UIs
    this.onRequest('/getCachedAccessories', getCachedAccessoriesHandler)
    // Provide Matter cached accessories if Homebridge stores them separately.
    const getCachedMatterAccessoriesHandler = () => {
      try {
        const pluginNames = ['@switchbot/homebridge-switchbot', 'homebridge-switchbot']
        const devicesToReturn: any[] = []

        const accFile = `${this.homebridgeStoragePath}/accessories/cachedAccessories`
        const matterFile = `${this.homebridgeStoragePath}/accessories/cachedMatterAccessories`

        // Log all files in the accessories directory for debugging
        try {
          const accessoriesDir = `${this.homebridgeStoragePath}/accessories`
          if (fs.existsSync(accessoriesDir)) {
            const files = fs.readdirSync(accessoriesDir)
            console.warn(`[Homebridge UI] Files in accessories directory: ${files.join(', ')}`)
          }
        } catch (e: any) {
          console.error(`[Homebridge UI] Error listing accessories directory: ${e?.message ?? e}`)
        }

        console.warn(`[Homebridge UI] Checking for cached files:`)
        console.warn(`[Homebridge UI]   - cachedAccessories: ${fs.existsSync(accFile)}`)
        console.warn(`[Homebridge UI]   - cachedMatterAccessories: ${fs.existsSync(matterFile)}`)

        const readAndCollect = (filePath: string) => {
          if (!fs.existsSync(filePath)) {
            return
          }
          try {
            const parsed: any[] = JSON.parse(fs.readFileSync(filePath, 'utf8'))
            console.warn(`[Homebridge UI]   - ${filePath}: found ${parsed.length} total entries`)
            let matchCount = 0
            parsed.forEach((entry: any) => {
              // Entry shape varies between Homebridge versions; try common locations
              const pluginName = entry.plugin || entry?.accessory?.plugin || entry?.accessory?.pluginName
              const acc = entry.accessory ?? entry
              if (pluginNames.includes(pluginName)) {
                devicesToReturn.push(acc as never)
                matchCount++
              }
            })
            console.warn(`[Homebridge UI]   - ${filePath}: matched ${matchCount} SwitchBot entries`)
          } catch (e: any) {
            // ignore parse errors for a single file
            console.error(`[Homebridge UI]   - ${filePath}: parse error - ${e?.message ?? e}`)
          }
        }

        // Read both canonical files (some Homebridge versions use one or the other)
        readAndCollect(accFile)
        readAndCollect(matterFile)

        console.warn(`[Homebridge UI] getCachedMatterAccessories returning ${devicesToReturn.length} device(s)`)
        return devicesToReturn
      } catch (e: any) {
        console.error(`[Homebridge UI] getCachedMatterAccessories error: ${e?.message ?? e}`)
        return []
      }
    }
    this.onRequest('getCachedMatterAccessories', getCachedMatterAccessoriesHandler)
    // Also register with a leading slash for compatibility with some UIs
    this.onRequest('/getCachedMatterAccessories', getCachedMatterAccessoriesHandler)
    this.ready()
  }
}

function startPluginUiServer(): PluginUiServer {
  return new PluginUiServer()
}

startPluginUiServer()
