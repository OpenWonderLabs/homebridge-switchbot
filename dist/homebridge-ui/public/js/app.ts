import { loadCredentialStatus, saveCredentials } from './credentials.js'
import { initRemoveAllButton, loadConfiguredDevices } from './devices.js'
import { discoverDevices, initializeDiscoverySettings } from './discovery.js';

(window as any).loadCredentialStatus = loadCredentialStatus;
(window as any).saveCredentials = saveCredentials;
(window as any).discoverDevices = discoverDevices

// Initialize on page load
async function init(): Promise<void> {
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
