import { uiLog } from './logger.js'
import { hideBusyUi, showBusyUi } from './modal.js'
import { toastError, toastSuccess, toastWarning } from './toast.js'

export async function loadCredentialStatus(): Promise<void> {
  try {
    if (typeof homebridge.getPluginConfig !== 'function') {
      uiLog.error('Homebridge UI API not available')
      return
    }
    const configArr = await homebridge.getPluginConfig()
    const config = Array.isArray(configArr) && configArr.length > 0 ? configArr[0] : {}
    const token = config.openApiToken || ''
    const secret = config.openApiSecret || ''

    const tokenStatus = document.getElementById('tokenStatus')
    const secretStatus = document.getElementById('secretStatus')
    if (!tokenStatus || !secretStatus) {
      return
    }
    if (token) {
      tokenStatus.textContent = `✓ Configured (${token.length} characters)`
      tokenStatus.classList.add('ok')
    } else {
      tokenStatus.textContent = 'Not configured'
      tokenStatus.classList.remove('ok')
    }
    if (secret) {
      secretStatus.textContent = `✓ Configured (${secret.length} characters)`
      secretStatus.classList.add('ok')
    } else {
      secretStatus.textContent = 'Not configured'
      secretStatus.classList.remove('ok')
    }
  } catch (e) {
    uiLog.error('Error loading credentials:', e)
  }
}

export async function saveCredentials(): Promise<void> {
  const token = (document.getElementById('token') as HTMLInputElement)?.value
  const secret = (document.getElementById('secret') as HTMLInputElement)?.value
  const saveStatus = document.getElementById('saveStatus')
  const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement

  if (!saveStatus || !saveBtn) {
    return
  }

  if (!token || !secret) {
    saveStatus.textContent = 'Please enter both token and secret'
    saveStatus.classList.add('error')
    toastWarning('Please enter both token and secret')
    return
  }

  try {
    showBusyUi()
    saveBtn.disabled = true
    saveBtn.textContent = 'Saving...'
    uiLog.info('Saving credentials...')

    if (typeof homebridge.getPluginConfig !== 'function' || typeof homebridge.updatePluginConfig !== 'function') {
      throw new TypeError('Homebridge UI API not available')
    }
    let configArr = await homebridge.getPluginConfig()
    if (!Array.isArray(configArr)) {
      configArr = []
    }
    let idx = configArr.findIndex(c => (c.platform || c.name || '').toLowerCase() === 'switchbot')
    if (idx === -1) {
      // Add new SwitchBot platform config
      configArr.push({ platform: 'SwitchBot' })
      idx = configArr.length - 1
    }
    const config = configArr[idx]
    config.openApiToken = token
    config.openApiSecret = secret
    await homebridge.updatePluginConfig(configArr)
    if (typeof homebridge.savePluginConfig === 'function') {
      await homebridge.savePluginConfig()
    }

    saveStatus.textContent = `✓ Credentials saved successfully`
    saveStatus.classList.remove('error')
    saveStatus.classList.add('success-msg')
    toastSuccess('Credentials saved successfully')

    // Clear inputs after successful save
    ;(document.getElementById('token') as HTMLInputElement).value = ''
    ;(document.getElementById('secret') as HTMLInputElement).value = ''

    // Reload status to verify save
    setTimeout(loadCredentialStatus, 500)

    // Clear status message
    setTimeout(() => {
      saveStatus.textContent = ''
      saveStatus.classList.remove('success-msg')
    }, 3000)
  } catch (e) {
    uiLog.error('Save error:', e)
    saveStatus.textContent = `Error: ${e instanceof Error ? e.message : 'Failed to save'}`
    saveStatus.classList.add('error')
    toastError(e instanceof Error ? e.message : 'Failed to save credentials')
  } finally {
    hideBusyUi()
    saveBtn.disabled = false
    saveBtn.textContent = 'Save Credentials'
  }
}
