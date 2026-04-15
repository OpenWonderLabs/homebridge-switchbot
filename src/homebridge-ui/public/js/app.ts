import { detectV4Config } from './api.js'
import { loadCredentialStatus, saveCredentials } from './credentials.js'
import { initRemoveAllButton, loadConfiguredDevices } from './devices.js'
import { discoverDevices, initializeDiscoverySettings } from './discovery.js'

;

(window as any).loadCredentialStatus = loadCredentialStatus
;(window as any).saveCredentials = saveCredentials
;(window as any).discoverDevices = discoverDevices

/**
 * Show or hide the v4 config incompatibility warning banner.
 */
async function checkV4Config(): Promise<void> {
  const banner = document.getElementById('v4ConfigWarning')
  if (!banner) {
    return
  }
  const isV4 = await detectV4Config()
  if (isV4) {
    banner.style.display = 'block'
  }
}

// Initialize on page load
async function init(): Promise<void> {
  await checkV4Config()
  await loadCredentialStatus()
  await initializeDiscoverySettings()
  await loadConfiguredDevices()
  await initRemoveAllButton()
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
