import './types.js'
import { uiLog } from './logger.js'

function showToast(
  method: 'success' | 'error' | 'warning' | 'info',
  message: string,
  title = 'SwitchBot',
): void {
  try {
    const toast = homebridge?.toast
    const fn = toast?.[method]
    if (typeof fn === 'function') {
      fn(message, title)
      return
    }

    uiLog.info(`[Toast:${method}] ${title} - ${message}`)
  } catch (e) {
    uiLog.warn(`Toast ${method} failed:`, e)
  }
}

export function toastSuccess(message: string, title?: string): void {
  showToast('success', message, title)
}

export function toastError(message: string, title?: string): void {
  showToast('error', message, title)
}

export function toastWarning(message: string, title?: string): void {
  showToast('warning', message, title)
}

export function toastInfo(message: string, title?: string): void {
  showToast('info', message, title)
}
