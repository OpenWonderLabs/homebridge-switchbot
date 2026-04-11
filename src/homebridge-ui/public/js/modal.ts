import './types.js'
import { uiLog } from './logger.js'

function callUiMethod(name: keyof HomebridgePluginUiAPI, ...args: any[]): void {
  try {
    if (typeof homebridge?.[name] === 'function') {
      uiLog.info(`[callUiMethod] Invoking homebridge.${String(name)}()`)
      const fn = homebridge?.[name]
      if (typeof fn === 'function') {
        uiLog.info(`[callUiMethod] Invoking homebridge.${String(name)}()`);
        (fn as (...args: any[]) => void).apply(homebridge, args)
      } else {
        uiLog.warn(`[callUiMethod] homebridge[${String(name)}] is not a function.`)
      }
    } else {
      uiLog.warn(`[callUiMethod] homebridge[${String(name)}] is not a function.`)
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
