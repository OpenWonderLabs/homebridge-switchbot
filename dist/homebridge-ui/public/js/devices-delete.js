import { deleteAllDevices as apiDeleteAllDevices, deleteDevice as apiDeleteDevice, fetchDevices, syncParentPluginConfigFromDisk } from './api.js';
import { uiLog } from './logger.js';
import { hideBusyUi, showBusyUi } from './modal.js';
import { renderDeviceList } from './render.js';
import { toastError, toastSuccess, toastWarning } from './toast.js';
async function confirmDeleteDialog(deviceNameOrId) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'rgba(0,0,0,0.6)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '10000';
        const modal = document.createElement('div');
        modal.style.background = getComputedStyle(document.body).backgroundColor;
        modal.style.color = getComputedStyle(document.body).color;
        modal.style.padding = '20px';
        modal.style.borderRadius = '10px';
        modal.style.minWidth = '340px';
        modal.style.maxWidth = '90vw';
        modal.style.boxShadow = '0 12px 40px rgba(0,0,0,0.35)';
        const title = document.createElement('h3');
        title.textContent = 'Delete Device';
        title.style.margin = '0 0 10px 0';
        const message = document.createElement('p');
        message.textContent = `Remove "${deviceNameOrId}" from configuration?`;
        message.style.margin = '0 0 16px 0';
        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.justifyContent = 'flex-end';
        actions.style.gap = '8px';
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.background = '#6b7280';
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.style.background = '#ef4444';
        const cleanup = (result) => {
            overlay.remove();
            resolve(result);
        };
        cancelBtn.onclick = () => cleanup(false);
        deleteBtn.onclick = () => cleanup(true);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                cleanup(false);
            }
        });
        actions.appendChild(cancelBtn);
        actions.appendChild(deleteBtn);
        modal.appendChild(title);
        modal.appendChild(message);
        modal.appendChild(actions);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    });
}
export async function deleteDeviceFromConfig(deviceId, deviceName) {
    uiLog.info('Delete button clicked for device:', deviceId, deviceName);
    const confirmed = await confirmDeleteDialog(deviceName || deviceId);
    if (!confirmed) {
        uiLog.info('Delete cancelled by user');
        return;
    }
    try {
        showBusyUi();
        uiLog.info('Deleting device from config:', deviceId);
        const resp = await apiDeleteDevice(deviceId);
        uiLog.info('Delete response:', resp);
        uiLog.info('Syncing parent config from disk...');
        const synced = await syncParentPluginConfigFromDisk(true);
        if (!synced) {
            toastWarning('Device deleted, but configuration sync failed');
        }
        uiLog.info('Refreshing device list...');
        const list = await fetchDevices();
        uiLog.info('Rendering devices:', list.length);
        renderDeviceList(list);
        uiLog.info('✓ Device deleted successfully');
        toastSuccess(`Device "${deviceName || deviceId}" deleted successfully`);
    }
    catch (e) {
        uiLog.error('Delete error:', e);
        toastError(e instanceof Error ? e.message : 'Failed to delete device');
    }
    finally {
        hideBusyUi();
    }
}
async function confirmDeleteAllDialog(deviceCount) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'rgba(0,0,0,0.7)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '10000';
        const modal = document.createElement('div');
        modal.style.background = getComputedStyle(document.body).backgroundColor;
        modal.style.color = getComputedStyle(document.body).color;
        modal.style.padding = '20px';
        modal.style.borderRadius = '10px';
        modal.style.minWidth = '380px';
        modal.style.maxWidth = '90vw';
        modal.style.boxShadow = '0 12px 40px rgba(0,0,0,0.35)';
        modal.style.borderTop = '3px solid #ef4444';
        const title = document.createElement('h3');
        title.textContent = '⚠️ Remove All Devices';
        title.style.margin = '0 0 12px 0';
        title.style.color = '#ef4444';
        const message = document.createElement('p');
        message.innerHTML = `Are you sure you want to remove <strong>all ${deviceCount} device(s)</strong> from your configuration?<br><br>This action cannot be undone.`;
        message.style.margin = '0 0 18px 0';
        message.style.lineHeight = '1.5';
        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.justifyContent = 'flex-end';
        actions.style.gap = '10px';
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.background = '#6b7280';
        cancelBtn.style.padding = '8px 16px';
        cancelBtn.style.fontSize = '13px';
        cancelBtn.className = 'secondary';
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Remove All';
        deleteBtn.style.background = '#ef4444';
        deleteBtn.style.padding = '8px 20px';
        deleteBtn.style.fontSize = '13px';
        const cleanup = (result) => {
            overlay.remove();
            resolve(result);
        };
        cancelBtn.onclick = () => cleanup(false);
        deleteBtn.onclick = () => cleanup(true);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                cleanup(false);
            }
        });
        actions.appendChild(cancelBtn);
        actions.appendChild(deleteBtn);
        modal.appendChild(title);
        modal.appendChild(message);
        modal.appendChild(actions);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    });
}
export async function deleteAllDevicesFromConfig() {
    uiLog.info('Remove All Devices button clicked');
    try {
        // Get current device count
        const list = await fetchDevices();
        if (!list || list.length === 0) {
            toastWarning('No devices to remove');
            return;
        }
        const confirmed = await confirmDeleteAllDialog(list.length);
        if (!confirmed) {
            uiLog.info('Remove all cancelled by user');
            return;
        }
        showBusyUi();
        uiLog.info('Deleting all devices from config');
        const resp = await apiDeleteAllDevices();
        uiLog.info('Delete all response:', resp);
        uiLog.info('Syncing parent config from disk...');
        const synced = await syncParentPluginConfigFromDisk(true);
        if (!synced) {
            toastWarning('Devices deleted, but configuration sync failed');
        }
        uiLog.info('Refreshing device list...');
        const updatedList = await fetchDevices();
        uiLog.info('Rendering devices:', updatedList.length);
        renderDeviceList(updatedList);
        const deletedCount = resp?.deletedCount || 0;
        uiLog.info(`✓ Removed ${deletedCount} device(s) successfully`);
        toastSuccess(`Removed ${deletedCount} device(s) successfully`);
    }
    catch (e) {
        uiLog.error('Delete all error:', e);
        toastError(e instanceof Error ? e.message : 'Failed to delete all devices');
    }
    finally {
        hideBusyUi();
    }
}
//# sourceMappingURL=devices-delete.js.map