import './types.js';
import { uiLog } from './logger.js';
function callUiMethod(name, ...args) {
    try {
        if (typeof homebridge?.[name] === 'function') {
            uiLog.info(`[callUiMethod] Invoking homebridge.${String(name)}()`);
            const fn = homebridge?.[name];
            if (typeof fn === 'function') {
                uiLog.info(`[callUiMethod] Invoking homebridge.${String(name)}()`);
                fn.apply(homebridge, args);
            }
            else {
                uiLog.warn(`[callUiMethod] homebridge[${String(name)}] is not a function.`);
            }
        }
        else {
            uiLog.warn(`[callUiMethod] homebridge[${String(name)}] is not a function.`);
        }
    }
    catch (e) {
        uiLog.warn(`Homebridge UI method ${String(name)} failed:`, e);
    }
}
export function showBusyUi() {
    callUiMethod('disableSaveButton');
    callUiMethod('showSpinner');
}
export function hideBusyUi() {
    callUiMethod('hideSpinner');
    callUiMethod('enableSaveButton');
}
export function closeSettingsModal() {
    callUiMethod('closeSettings');
}
//# sourceMappingURL=modal.js.map