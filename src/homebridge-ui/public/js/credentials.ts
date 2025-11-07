import { fetchCredentialStatus as apiFetchCredentialStatus, saveCredentials as apiSaveCredentials, syncParentPluginConfigFromDisk } from './api.js'
import { uiLog } from './logger.js'
import { hideBusyUi, showBusyUi } from './modal.js'
import { toastError, toastSuccess, toastWarning } from './toast.js'

export async function loadCredentialStatus(): Promise<void> {
  try {
    const creds = await apiFetchCredentialStatus()

    if (!creds) {
      uiLog.error('Failed to load credentials')
      return
    }

    const tokenStatus = document.getElementById('tokenStatus')
    const secretStatus = document.getElementById('secretStatus')

    if (!tokenStatus || !secretStatus) {
      return
    }

    if (creds.hasToken) {
      tokenStatus.textContent = `✓ Configured (${creds.tokenLength} characters)`
      tokenStatus.classList.add('ok')
    } else {
      tokenStatus.textContent = 'Not configured'
      tokenStatus.classList.remove('ok')
    }

    if (creds.hasSecret) {
      secretStatus.textContent = `✓ Configured (${creds.secretLength} characters)`
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

    const result = await apiSaveCredentials(token, secret)
    uiLog.info('Save response:', result)

    const message = result?.message || 'Credentials saved successfully'
    saveStatus.textContent = `✓ ${message}`
    saveStatus.classList.remove('error')
    saveStatus.classList.add('success-msg')
    toastSuccess(message)

    const synced = await syncParentPluginConfigFromDisk(true)
    if (synced) {
      saveStatus.textContent += ' - Config saved automatically.'
      toastSuccess('Configuration synced and saved automatically')
    } else {
      toastWarning('Credentials saved, but configuration sync failed')
    }

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
