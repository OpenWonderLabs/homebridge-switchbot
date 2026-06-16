import './types.js'
import { uiLog } from './logger.js'

function showToast(
  method: 'success' | 'error' | 'warning' | 'info',
  message: string,
  title = 'SwitchBot',
): void {
  try {
    // Defensive: check for window and homebridge existence
    const hb = typeof window !== 'undefined' ? (window as any).homebridge : undefined
    const toast = hb && typeof hb.toast === 'object' ? hb.toast : undefined
    if (toast && typeof toast[method] === 'function') {
      try {
        toast[method](message, title)
        return
      } catch (err) {
        uiLog.warn(`Toast ${method} threw:`, err)
      }
    }
    // Fallback: log to console
    uiLog.info(`[Toast:${method}] ${title} - ${message}`)
  } catch (e) {
    uiLog.warn(`Toast ${method} outer error:`, e)
    uiLog.info(`[Toast:${method}] ${title} - ${message}`)
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
