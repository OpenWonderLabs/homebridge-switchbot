// advanced-settings.ts
// Handles loading and saving global OpenAPI polling/rate config in the Advanced Settings card

async function loadAdvancedSettings(): Promise<void> {
  try {
    if (typeof homebridge.getPluginConfig !== 'function') {
      (document.getElementById('advancedSettingsStatus') as HTMLElement).textContent = 'Homebridge UI API not available.'
      return
    }
    const pluginConfigBlocks = await homebridge.getPluginConfig()
    if (!Array.isArray(pluginConfigBlocks) || !pluginConfigBlocks.length) {
      return
    }
    const config = pluginConfigBlocks.find(c => (c.platform || c.name || '').toLowerCase().includes('switchbot'))
    if (!config) {
      return
    }
    (document.getElementById('openApiRefreshRate') as HTMLInputElement).value = String(config.openApiRefreshRate ?? 300)
    ;(document.getElementById('matterBatchEnabled') as HTMLInputElement).checked = config.matterBatchEnabled !== false
    ;(document.getElementById('matterBatchRefreshRate') as HTMLInputElement).value = String(config.matterBatchRefreshRate ?? 300)
    ;(document.getElementById('dailyApiLimit') as HTMLInputElement).value = String(config.dailyApiLimit ?? 10000)
    ;(document.getElementById('dailyApiReserveForCommands') as HTMLInputElement).value = String(config.dailyApiReserveForCommands ?? 1000)
    ;(document.getElementById('dailyApiResetLocalMidnight') as HTMLInputElement).checked = !!config.dailyApiResetLocalMidnight
    ;(document.getElementById('webhookOnlyOnReserve') as HTMLInputElement).checked = !!config.webhookOnlyOnReserve
    ;(document.getElementById('matterBatchConcurrency') as HTMLInputElement).value = String(config.matterBatchConcurrency ?? 5)
    ;(document.getElementById('matterBatchJitter') as HTMLInputElement).value = String(config.matterBatchJitter ?? 0)
    ;(document.getElementById('enableMatter') as HTMLInputElement).checked = !!config.enableMatter
    ;(document.getElementById('preferMatter') as HTMLInputElement).checked = !!config.preferMatter
    ;(document.getElementById('enableBLE') as HTMLInputElement).checked = config.enableBLE !== false
    ;(document.getElementById('blePollingEnabled') as HTMLInputElement).checked = config.blePollingEnabled !== false
    ;(document.getElementById('blePollIntervalMs') as HTMLInputElement).value = String(config.blePollIntervalMs ?? 600000)
  } catch (e) {
    (document.getElementById('advancedSettingsStatus') as HTMLElement).textContent = 'Failed to load settings.'
  }
}

async function saveAdvancedSettings(): Promise<void> {
  const status = document.getElementById('advancedSettingsStatus') as HTMLElement
  status.textContent = 'Saving...'
  try {
    if (typeof homebridge.getPluginConfig !== 'function') {
      throw new TypeError('homebridge.getPluginConfig is not available')
    }
    // Get the full plugin config array
    const pluginConfigBlocks = await homebridge.getPluginConfig()
    if (!Array.isArray(pluginConfigBlocks) || !pluginConfigBlocks.length) {
      throw new Error('No plugin config blocks returned from Homebridge')
    }
    // Find the SwitchBot config block
    const idx = pluginConfigBlocks.findIndex(c => (c.platform || c.name || '').toLowerCase().includes('switchbot'))
    if (idx === -1) {
      throw new Error('SwitchBot config not found')
    }
    const config = pluginConfigBlocks[idx]
    // Update config values from UI
    config.openApiRefreshRate = Number((document.getElementById('openApiRefreshRate') as HTMLInputElement).value) || 300
    config.matterBatchEnabled = (document.getElementById('matterBatchEnabled') as HTMLInputElement).checked
    config.matterBatchRefreshRate = Number((document.getElementById('matterBatchRefreshRate') as HTMLInputElement).value) || 300
    config.dailyApiLimit = Number((document.getElementById('dailyApiLimit') as HTMLInputElement).value) || 10000
    config.dailyApiReserveForCommands = Number((document.getElementById('dailyApiReserveForCommands') as HTMLInputElement).value) || 1000
    config.dailyApiResetLocalMidnight = (document.getElementById('dailyApiResetLocalMidnight') as HTMLInputElement).checked
    config.webhookOnlyOnReserve = (document.getElementById('webhookOnlyOnReserve') as HTMLInputElement).checked
    config.matterBatchConcurrency = Number((document.getElementById('matterBatchConcurrency') as HTMLInputElement).value) || 5
    config.matterBatchJitter = Number((document.getElementById('matterBatchJitter') as HTMLInputElement).value) || 0
    config.enableMatter = (document.getElementById('enableMatter') as HTMLInputElement).checked
    config.preferMatter = (document.getElementById('preferMatter') as HTMLInputElement).checked
    config.enableBLE = (document.getElementById('enableBLE') as HTMLInputElement).checked
    config.blePollingEnabled = (document.getElementById('blePollingEnabled') as HTMLInputElement).checked
    config.blePollIntervalMs = Number((document.getElementById('blePollIntervalMs') as HTMLInputElement).value) || 600000

    // Update config in memory and save to disk
    if (typeof homebridge.updatePluginConfig === 'function') {
      await homebridge.updatePluginConfig(pluginConfigBlocks)
    } else {
      throw new TypeError('homebridge.updatePluginConfig is not available')
    }
    if (typeof homebridge.savePluginConfig === 'function') {
      await homebridge.savePluginConfig()
    }
    status.textContent = 'Settings saved!'
  } catch (e: any) {
    status.textContent = `Failed to save: ${e && e.message ? e.message : e}`
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('advancedSettingsCard')) {
    loadAdvancedSettings()
    const btn = document.getElementById('saveAdvancedSettingsBtn')
    if (btn) {
      btn.onclick = saveAdvancedSettings
    }
  }
})
