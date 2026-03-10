import './types.js'
import { uiLog } from './logger.js'

function callUiMethod(name: keyof HomebridgePluginUiAPI): void {
  try {
    const value = homebridge?.[name]
    if (typeof value === 'function') {
      const fn = value as () => void
      fn()
    }
  } catch (e) {
    uiLog.warn(`Homebridge UI method ${String(name)} failed:`, e)
  }
}

export function showBusyUi(): void {
  callUiMethod('disableSaveButton')
  callUiMethod('showSpinner')
}

export function hideBusyUi(): void {
  callUiMethod('hideSpinner')
  callUiMethod('enableSaveButton')
}

export function closeSettingsModal(): void {
  callUiMethod('closeSettings')
}
