import { addDevice, fetchDevices, syncParentPluginConfigFromDisk } from './api.js'
import { uiLog } from './logger.js'
import { hideBusyUi, showBusyUi } from './modal.js'
import { renderDeviceList } from './render.js'
import { toastError, toastInfo, toastSuccess, toastWarning } from './toast.js'

export async function addDeviceToConfig(device: any, options: { refresh?: boolean, showStatus?: boolean } = {}): Promise<{ added: boolean }> {
  const { refresh = true, showStatus = true } = options
  try {
    const { importDiscoveredDevice } = await import('./modals.js')

    const importValues: any = await importDiscoveredDevice(device)
    if (!importValues || typeof importValues !== 'object' || !importValues.configDeviceName || !importValues.configDeviceType) {
      return { added: false }
    }


    showBusyUi()
    uiLog.info('Adding device to config:', device)
    // Never allow 'undefined' as a device name
    let safeName = importValues.configDeviceName
    if (!safeName || safeName === 'undefined') {
      safeName = device.name || device.id
      uiLog.warn(`Device name was invalid ("${importValues.configDeviceName}"), using fallback: "${safeName}"`)
    }
    const resp = await addDevice(device.id, safeName, importValues.configDeviceType, {
      address: importValues.address,
      model: device.model,
      rssi: device.rssi,
      encryptionKey: importValues.encryptionKey,
      keyId: importValues.keyId,
    })
    uiLog.info('Add device response:', resp)

    const alreadyExists = !!resp?.alreadyExists
    const message = resp?.message
      || (alreadyExists
        ? `Device "${importValues.configDeviceName}" already in config`
        : `Device "${importValues.configDeviceName}" added successfully!`)

    if (alreadyExists) {
      toastInfo(message)
    } else {
      toastSuccess(message)
    }

    if (showStatus) {
      const status = document.getElementById('discoverStatus')
      if (status) {
        status.textContent = (alreadyExists ? '• ' : '✓ ') + message
        status.classList.remove('error')
        status.classList.add('success-msg')

        // Sync parent Homebridge form cache and auto-save to prevent cache overwrite
        if (!alreadyExists) {
          const synced = await syncParentPluginConfigFromDisk(true)
          status.textContent += synced
            ? ' - Config saved automatically.'
            : ' - Warning: config may not persist until you close/reopen settings.'

          if (synced) {
            toastSuccess('Configuration synced and saved automatically')
          } else {
            toastWarning('Configuration sync failed; close and reopen settings before Save')
          }
        }
      }
    }

    if (refresh) {
      await loadConfiguredDevices()
    }

    return { added: !alreadyExists }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    uiLog.error('Add device error:', msg)
    const status = document.getElementById('discoverStatus')
    if (status) {
      status.textContent = `✗ Error: ${msg}`
      status.classList.add('error')
    }
    toastError(msg)
    return { added: false }
  } finally {
    hideBusyUi()
  }
}

export async function initRemoveAllButton(): Promise<void> {
  const removeAllBtn = document.getElementById('removeAllBtn')
  if (!removeAllBtn) {
    return
  }

  removeAllBtn.addEventListener('click', async () => {
    const { deleteAllDevicesFromConfig } = await import('./devices-delete.js')
    await deleteAllDevicesFromConfig()
  })
}

export async function loadConfiguredDevices(): Promise<void> {
  const list = await fetchDevices()
  renderDeviceList(list)
}
