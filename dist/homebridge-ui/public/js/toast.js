import './types.js';
import { uiLog } from './logger.js';
function showToast(method, message, title = 'SwitchBot') {
    try {
        // Defensive: check for window and homebridge existence
        const hb = typeof window !== 'undefined' ? window.homebridge : undefined;
        const toast = hb && typeof hb.toast === 'object' ? hb.toast : undefined;
        if (toast && typeof toast[method] === 'function') {
            try {
                toast[method](message, title);
                return;
            }
            catch (err) {
                uiLog.warn(`Toast ${method} threw:`, err);
            }
        }
        // Fallback: log to console
        uiLog.info(`[Toast:${method}] ${title} - ${message}`);
    }
    catch (e) {
        uiLog.warn(`Toast ${method} outer error:`, e);
        uiLog.info(`[Toast:${method}] ${title} - ${message}`);
    }
}
export function toastSuccess(message, title) {
    showToast('success', message, title);
}
export function toastError(message, title) {
    showToast('error', message, title);
}
export function toastWarning(message, title) {
    showToast('warning', message, title);
}
export function toastInfo(message, title) {
    showToast('info', message, title);
}
//# sourceMappingURL=toast.js.map