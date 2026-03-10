// advanced-settings.ts
// Handles loading and saving global OpenAPI polling/rate config in the Advanced Settings card

async function loadAdvancedSettings(): Promise<void> {
  try {
    const resp = await homebridge.request('/platform-config', {})
    if (!resp || resp.success === false || !resp.data) {
      return
    }
    const config = Array.isArray(resp.data)
      ? resp.data.find(c => (c.platform || c.name || '').toLowerCase().includes('switchbot'))
      : resp.data
    if (!config) {
      return
    }
    (document.getElementById('openApiRefreshRate') as HTMLInputElement).value = String(config.openApiRefreshRate ?? 300);
    (document.getElementById('matterBatchEnabled') as HTMLInputElement).checked = config.matterBatchEnabled !== false;
    (document.getElementById('matterBatchRefreshRate') as HTMLInputElement).value = String(config.matterBatchRefreshRate ?? 300);
    (document.getElementById('dailyApiLimit') as HTMLInputElement).value = String(config.dailyApiLimit ?? 10000);
    (document.getElementById('dailyApiReserveForCommands') as HTMLInputElement).value = String(config.dailyApiReserveForCommands ?? 1000);
    (document.getElementById('dailyApiResetLocalMidnight') as HTMLInputElement).checked = !!config.dailyApiResetLocalMidnight;
    (document.getElementById('webhookOnlyOnReserve') as HTMLInputElement).checked = !!config.webhookOnlyOnReserve;
    (document.getElementById('matterBatchConcurrency') as HTMLInputElement).value = String(config.matterBatchConcurrency ?? 5);
    (document.getElementById('matterBatchJitter') as HTMLInputElement).value = String(config.matterBatchJitter ?? 0)
  } catch (e) {
    (document.getElementById('advancedSettingsStatus') as HTMLElement).textContent = 'Failed to load settings.'
  }
}

async function saveAdvancedSettings(): Promise<void> {
  const status = document.getElementById('advancedSettingsStatus') as HTMLElement
  status.textContent = 'Saving...'
  try {
    const resp = await homebridge.request('/platform-config', {})
    if (!resp || resp.success === false || !resp.data) {
      throw new Error('Failed to load config')
    }
    const configArr = Array.isArray(resp.data) ? resp.data : [resp.data]
    const idx = configArr.findIndex(c => (c.platform || c.name || '').toLowerCase().includes('switchbot'))
    if (idx === -1) {
      throw new Error('SwitchBot config not found')
    }
    const config = configArr[idx]
    config.openApiRefreshRate = Number((document.getElementById('openApiRefreshRate') as HTMLInputElement).value) || 300
    config.matterBatchEnabled = (document.getElementById('matterBatchEnabled') as HTMLInputElement).checked
    config.matterBatchRefreshRate = Number((document.getElementById('matterBatchRefreshRate') as HTMLInputElement).value) || 300
    config.dailyApiLimit = Number((document.getElementById('dailyApiLimit') as HTMLInputElement).value) || 10000
    config.dailyApiReserveForCommands = Number((document.getElementById('dailyApiReserveForCommands') as HTMLInputElement).value) || 1000
    config.dailyApiResetLocalMidnight = (document.getElementById('dailyApiResetLocalMidnight') as HTMLInputElement).checked
    config.webhookOnlyOnReserve = (document.getElementById('webhookOnlyOnReserve') as HTMLInputElement).checked
    config.matterBatchConcurrency = Number((document.getElementById('matterBatchConcurrency') as HTMLInputElement).value) || 5
    config.matterBatchJitter = Number((document.getElementById('matterBatchJitter') as HTMLInputElement).value) || 0
    if (typeof homebridge.updatePluginConfig === 'function') {
      await homebridge.updatePluginConfig(configArr)
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
