import { DEVICE_TYPES } from './constants.js';
import { uiLog } from './logger.js';
export async function importDiscoveredDevice(device) {
    // --- OpenAPI Polling Interval (refreshRate) ---
    const openApiRefreshLabel = document.createElement('label');
    openApiRefreshLabel.textContent = 'OpenAPI Polling Interval (seconds)';
    openApiRefreshLabel.style.display = 'block';
    openApiRefreshLabel.style.marginBottom = '6px';
    openApiRefreshLabel.style.fontWeight = '500';
    openApiRefreshLabel.style.fontSize = '12px';
    openApiRefreshLabel.style.color = '#6b7280';
    openApiRefreshLabel.title = 'How often to poll this device via OpenAPI for status (in seconds). Overrides platform value if set. Default: 300 (5 minutes). Minimum: 30.';
    const openApiRefreshInput = document.createElement('input');
    openApiRefreshInput.type = 'number';
    openApiRefreshInput.value = device.refreshRate || 300;
    openApiRefreshInput.min = '30';
    openApiRefreshInput.step = '1';
    openApiRefreshInput.style.width = '100%';
    openApiRefreshInput.style.marginBottom = '12px';
    openApiRefreshInput.style.padding = '8px 10px';
    openApiRefreshInput.style.borderRadius = '6px';
    openApiRefreshInput.style.fontSize = '14px';
    openApiRefreshInput.style.boxSizing = 'border-box';
    return new Promise((resolve) => {
        const div = document.createElement('div');
        div.style.position = 'fixed';
        div.style.top = '0';
        div.style.left = '0';
        div.style.width = '100%';
        div.style.height = '100%';
        div.style.background = 'rgba(0,0,0,0.7)';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'center';
        div.style.zIndex = '9999';
        const modal = document.createElement('div');
        modal.style.background = getComputedStyle(document.body).backgroundColor;
        modal.style.color = getComputedStyle(document.body).color;
        modal.style.padding = '0';
        modal.style.borderRadius = '10px';
        modal.style.minWidth = '440px';
        modal.style.maxWidth = '90vw';
        modal.style.boxShadow = '0 8px 32px rgba(0,0,0,0.35)';
        modal.style.overflow = 'hidden';
        modal.style.borderTop = '3px solid var(--switchbot-red, #ef4444)';
        const title = document.createElement('h3');
        title.textContent = 'Import Discovered Device';
        title.style.marginTop = '0';
        title.style.marginBottom = '16px';
        title.style.padding = '20px 20px 0';
        title.style.fontSize = '18px';
        title.style.fontWeight = '600';
        title.style.color = 'var(--switchbot-red, #ef4444)';
        title.style.letterSpacing = '-0.02em';
        const contentDiv = document.createElement('div');
        contentDiv.style.padding = '0 20px 20px';
        const nameLabel = document.createElement('label');
        nameLabel.textContent = 'Device Name';
        nameLabel.style.display = 'block';
        nameLabel.style.marginBottom = '6px';
        nameLabel.style.fontWeight = '500';
        nameLabel.style.fontSize = '12px';
        nameLabel.style.color = '#6b7280';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        // Never allow 'undefined' as a name
        let safeName = device.name;
        if (!safeName || safeName === 'undefined') {
            safeName = device.id || '';
        }
        nameInput.value = safeName;
        nameInput.style.width = '100%';
        nameInput.style.marginBottom = '12px';
        nameInput.style.padding = '8px 10px';
        nameInput.style.borderRadius = '6px';
        nameInput.style.fontSize = '14px';
        nameInput.style.boxSizing = 'border-box';
        // --- Device Type Select ---
        const typeLabel = document.createElement('label');
        typeLabel.textContent = 'Config Device Type';
        typeLabel.style.display = 'block';
        typeLabel.style.marginBottom = '6px';
        typeLabel.style.fontWeight = '500';
        typeLabel.style.fontSize = '12px';
        typeLabel.style.color = '#6b7280';
        const typeSelect = document.createElement('select');
        typeSelect.style.width = '100%';
        typeSelect.style.padding = '8px 10px';
        typeSelect.style.marginBottom = '12px';
        typeSelect.style.borderRadius = '6px';
        typeSelect.style.fontSize = '14px';
        typeSelect.style.background = getComputedStyle(nameInput).background;
        typeSelect.style.color = getComputedStyle(nameInput).color;
        typeSelect.style.border = getComputedStyle(nameInput).border;
        typeSelect.style.boxSizing = 'border-box';
        Object.keys(DEVICE_TYPES).forEach((categoryName) => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = categoryName;
            DEVICE_TYPES[categoryName].forEach((deviceType) => {
                const opt = document.createElement('option');
                opt.value = deviceType;
                opt.text = deviceType;
                const detectedType = (device.type || '').toLowerCase();
                opt.selected = deviceType.toLowerCase() === detectedType;
                optgroup.appendChild(opt);
            });
            typeSelect.appendChild(optgroup);
        });
        // --- Connection Preference ---
        const connectionPrefLabel = document.createElement('label');
        connectionPrefLabel.textContent = 'Connection Preference';
        connectionPrefLabel.style.display = 'block';
        connectionPrefLabel.style.marginBottom = '6px';
        connectionPrefLabel.style.fontWeight = '500';
        connectionPrefLabel.style.fontSize = '12px';
        connectionPrefLabel.style.color = '#6b7280';
        const connectionPrefSelect = document.createElement('select');
        connectionPrefSelect.style.width = '100%';
        connectionPrefSelect.style.marginBottom = '12px';
        connectionPrefSelect.style.padding = '8px 10px';
        connectionPrefSelect.style.borderRadius = '6px';
        connectionPrefSelect.style.fontSize = '14px';
        connectionPrefSelect.style.boxSizing = 'border-box';
        ['auto', 'ble', 'openapi'].forEach((val) => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.text = val.charAt(0).toUpperCase() + val.slice(1);
            opt.selected = (device.connectionPreference || 'auto') === val;
            connectionPrefSelect.appendChild(opt);
        });
        // --- Room ---
        const roomLabel = document.createElement('label');
        roomLabel.textContent = 'Room';
        roomLabel.style.display = 'block';
        roomLabel.style.marginBottom = '6px';
        roomLabel.style.fontWeight = '500';
        roomLabel.style.fontSize = '12px';
        roomLabel.style.color = '#6b7280';
        const roomInput = document.createElement('input');
        roomInput.type = 'text';
        roomInput.value = device.room || '';
        roomInput.placeholder = 'Optional room/location metadata';
        roomInput.style.width = '100%';
        roomInput.style.marginBottom = '12px';
        roomInput.style.padding = '8px 10px';
        roomInput.style.borderRadius = '6px';
        roomInput.style.fontSize = '14px';
        roomInput.style.boxSizing = 'border-box';
        // --- BLE MAC Address ---
        const macLabel = document.createElement('label');
        macLabel.textContent = 'BLE MAC Address (optional)';
        macLabel.style.display = 'block';
        macLabel.style.marginBottom = '6px';
        macLabel.style.fontWeight = '500';
        macLabel.style.fontSize = '12px';
        macLabel.style.color = '#6b7280';
        const macInput = document.createElement('input');
        macInput.type = 'text';
        macInput.value = device.address || '';
        macInput.placeholder = 'AA:BB:CC:DD:EE:FF';
        macInput.style.width = '100%';
        macInput.style.marginBottom = '12px';
        macInput.style.padding = '8px 10px';
        macInput.style.borderRadius = '6px';
        macInput.style.fontSize = '14px';
        macInput.style.boxSizing = 'border-box';
        // --- Encryption Key ---
        const encryptionKeyLabel = document.createElement('label');
        encryptionKeyLabel.textContent = 'BLE Encryption Key (optional)';
        encryptionKeyLabel.style.display = 'block';
        encryptionKeyLabel.style.marginBottom = '6px';
        encryptionKeyLabel.style.fontWeight = '500';
        encryptionKeyLabel.style.fontSize = '12px';
        encryptionKeyLabel.style.color = '#6b7280';
        const encryptionKeyInput = document.createElement('input');
        encryptionKeyInput.type = 'password';
        encryptionKeyInput.value = device.encryptionKey || '';
        encryptionKeyInput.placeholder = 'Paste device BLE encryption key';
        encryptionKeyInput.style.width = '100%';
        encryptionKeyInput.style.marginBottom = '12px';
        encryptionKeyInput.style.padding = '8px 10px';
        encryptionKeyInput.style.borderRadius = '6px';
        encryptionKeyInput.style.fontSize = '14px';
        encryptionKeyInput.style.boxSizing = 'border-box';
        // --- Key ID ---
        const keyIdLabel = document.createElement('label');
        keyIdLabel.textContent = 'BLE Key ID (optional)';
        keyIdLabel.style.display = 'block';
        keyIdLabel.style.marginBottom = '6px';
        keyIdLabel.style.fontWeight = '500';
        keyIdLabel.style.fontSize = '12px';
        keyIdLabel.style.color = '#6b7280';
        const keyIdInput = document.createElement('input');
        keyIdInput.type = 'text';
        keyIdInput.value = device.keyId || '';
        keyIdInput.placeholder = 'e.g. ff';
        keyIdInput.style.width = '100%';
        keyIdInput.style.marginBottom = '12px';
        keyIdInput.style.padding = '8px 10px';
        keyIdInput.style.borderRadius = '6px';
        keyIdInput.style.fontSize = '14px';
        keyIdInput.style.boxSizing = 'border-box';
        // --- BLE Polling Enabled ---
        const blePollingEnabledLabel = document.createElement('label');
        blePollingEnabledLabel.textContent = 'Enable BLE Polling Fallback';
        blePollingEnabledLabel.style.display = 'block';
        blePollingEnabledLabel.style.marginBottom = '6px';
        blePollingEnabledLabel.style.fontWeight = '500';
        blePollingEnabledLabel.style.fontSize = '12px';
        blePollingEnabledLabel.style.color = '#6b7280';
        const blePollingEnabledInput = document.createElement('input');
        blePollingEnabledInput.type = 'checkbox';
        blePollingEnabledInput.checked = device.blePollingEnabled !== false; // default true
        blePollingEnabledInput.style.marginRight = '8px';
        blePollingEnabledInput.style.marginBottom = '12px';
        // --- BLE Poll Interval ---
        const blePollIntervalLabel = document.createElement('label');
        blePollIntervalLabel.textContent = 'BLE Polling Interval (ms)';
        blePollIntervalLabel.style.display = 'block';
        blePollIntervalLabel.style.marginBottom = '6px';
        blePollIntervalLabel.style.fontWeight = '500';
        blePollIntervalLabel.style.fontSize = '12px';
        blePollIntervalLabel.style.color = '#6b7280';
        const blePollIntervalInput = document.createElement('input');
        blePollIntervalInput.type = 'number';
        blePollIntervalInput.value = device.blePollIntervalMs || 600000;
        blePollIntervalInput.min = '60000';
        blePollIntervalInput.step = '1000';
        blePollIntervalInput.style.width = '100%';
        blePollIntervalInput.style.marginBottom = '12px';
        blePollIntervalInput.style.padding = '8px 10px';
        blePollIntervalInput.style.borderRadius = '6px';
        blePollIntervalInput.style.fontSize = '14px';
        blePollIntervalInput.style.boxSizing = 'border-box';
        const buttons = document.createElement('div');
        buttons.style.display = 'flex';
        buttons.style.gap = '10px';
        buttons.style.justifyContent = 'flex-end';
        buttons.style.marginTop = '18px';
        buttons.style.paddingTop = '18px';
        buttons.style.borderTop = '1px solid rgba(0, 0, 0, 0.08)';
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'secondary';
        cancelBtn.style.background = '#6b7280';
        cancelBtn.style.padding = '8px 16px';
        cancelBtn.style.fontSize = '13px';
        const importBtn = document.createElement('button');
        importBtn.textContent = 'Add to Config';
        importBtn.style.background = 'var(--switchbot-red, #ef4444)';
        importBtn.style.padding = '8px 20px';
        importBtn.style.fontSize = '13px';
        const cleanup = (result) => {
            div.remove();
            resolve(result);
        };
        cancelBtn.onclick = () => cleanup(null);
        importBtn.onclick = () => {
            // Never allow 'undefined' as a name
            let finalName = nameInput.value;
            if (!finalName || finalName === 'undefined') {
                finalName = device.id || '';
            }
            cleanup({
                configDeviceName: finalName,
                configDeviceType: typeSelect.value || device.type,
                address: macInput.value || undefined,
                connectionPreference: connectionPrefSelect.value || undefined,
                room: roomInput.value || undefined,
                encryptionKey: encryptionKeyInput.value || undefined,
                keyId: keyIdInput.value || undefined,
                refreshRate: Number(openApiRefreshInput.value) || 300,
                blePollingEnabled: blePollingEnabledInput.checked,
                blePollIntervalMs: Number(blePollIntervalInput.value) || 600000,
            });
        };
        div.addEventListener('click', (event) => {
            if (event.target === div) {
                cleanup(null);
            }
        });
        buttons.appendChild(cancelBtn);
        buttons.appendChild(importBtn);
        contentDiv.appendChild(nameLabel);
        contentDiv.appendChild(nameInput);
        contentDiv.appendChild(typeLabel);
        contentDiv.appendChild(typeSelect);
        contentDiv.appendChild(connectionPrefLabel);
        contentDiv.appendChild(connectionPrefSelect);
        contentDiv.appendChild(roomLabel);
        contentDiv.appendChild(roomInput);
        contentDiv.appendChild(macLabel);
        contentDiv.appendChild(macInput);
        contentDiv.appendChild(encryptionKeyLabel);
        contentDiv.appendChild(encryptionKeyInput);
        contentDiv.appendChild(keyIdLabel);
        contentDiv.appendChild(keyIdInput);
        contentDiv.appendChild(openApiRefreshLabel);
        contentDiv.appendChild(openApiRefreshInput);
        contentDiv.appendChild(blePollingEnabledLabel);
        contentDiv.appendChild(blePollingEnabledInput);
        contentDiv.appendChild(blePollIntervalLabel);
        contentDiv.appendChild(blePollIntervalInput);
        contentDiv.appendChild(buttons);
        modal.appendChild(title);
        modal.appendChild(contentDiv);
        div.appendChild(modal);
        document.body.appendChild(div);
        nameInput.focus();
    });
}
export async function editDevice(device) {
    // --- OpenAPI Polling Interval (refreshRate) ---
    const openApiRefreshLabel = document.createElement('label');
    openApiRefreshLabel.textContent = 'OpenAPI Polling Interval (seconds)';
    openApiRefreshLabel.style.display = 'block';
    openApiRefreshLabel.style.marginBottom = '6px';
    openApiRefreshLabel.style.fontWeight = '500';
    openApiRefreshLabel.style.fontSize = '12px';
    openApiRefreshLabel.style.color = '#6b7280';
    openApiRefreshLabel.title = 'How often to poll this device via OpenAPI for status (in seconds). Overrides platform value if set. Default: 300 (5 minutes). Minimum: 30.';
    const openApiRefreshInput = document.createElement('input');
    openApiRefreshInput.type = 'number';
    openApiRefreshInput.value = device.refreshRate || 300;
    openApiRefreshInput.min = '30';
    openApiRefreshInput.step = '1';
    openApiRefreshInput.style.width = '100%';
    openApiRefreshInput.style.marginBottom = '12px';
    openApiRefreshInput.style.padding = '8px 10px';
    openApiRefreshInput.style.borderRadius = '6px';
    openApiRefreshInput.style.fontSize = '14px';
    openApiRefreshInput.style.boxSizing = 'border-box';
    // --- Device Type Select ---
    // --- BLE Polling Enabled ---
    const blePollingEnabledLabel = document.createElement('label');
    blePollingEnabledLabel.textContent = 'Enable BLE Polling Fallback';
    blePollingEnabledLabel.style.display = 'block';
    blePollingEnabledLabel.style.marginBottom = '6px';
    blePollingEnabledLabel.style.fontWeight = '500';
    blePollingEnabledLabel.style.fontSize = '12px';
    blePollingEnabledLabel.style.color = '#6b7280';
    const blePollingEnabledInput = document.createElement('input');
    blePollingEnabledInput.type = 'checkbox';
    blePollingEnabledInput.checked = device.blePollingEnabled !== false; // default true
    blePollingEnabledInput.style.marginRight = '8px';
    blePollingEnabledInput.style.marginBottom = '12px';
    // --- BLE Poll Interval ---
    const blePollIntervalLabel = document.createElement('label');
    blePollIntervalLabel.textContent = 'BLE Polling Interval (ms)';
    blePollIntervalLabel.style.display = 'block';
    blePollIntervalLabel.style.marginBottom = '6px';
    blePollIntervalLabel.style.fontWeight = '500';
    blePollIntervalLabel.style.fontSize = '12px';
    blePollIntervalLabel.style.color = '#6b7280';
    const blePollIntervalInput = document.createElement('input');
    blePollIntervalInput.type = 'number';
    blePollIntervalInput.value = device.blePollIntervalMs || 600000;
    blePollIntervalInput.min = '60000';
    blePollIntervalInput.step = '1000';
    blePollIntervalInput.style.width = '100%';
    blePollIntervalInput.style.marginBottom = '12px';
    blePollIntervalInput.style.padding = '8px 10px';
    blePollIntervalInput.style.borderRadius = '6px';
    blePollIntervalInput.style.fontSize = '14px';
    blePollIntervalInput.style.boxSizing = 'border-box';
    const typeLabel = document.createElement('label');
    typeLabel.textContent = 'Config Device Type';
    typeLabel.style.display = 'block';
    typeLabel.style.marginBottom = '6px';
    typeLabel.style.fontWeight = '500';
    typeLabel.style.fontSize = '12px';
    typeLabel.style.color = '#6b7280';
    const typeSelect = document.createElement('select');
    typeSelect.style.width = '100%';
    typeSelect.style.padding = '8px 10px';
    typeSelect.style.marginBottom = '12px';
    typeSelect.style.borderRadius = '6px';
    typeSelect.style.fontSize = '14px';
    typeSelect.style.background = getComputedStyle(document.body).backgroundColor;
    typeSelect.style.color = getComputedStyle(document.body).color;
    typeSelect.style.border = '1px solid #ccc';
    typeSelect.style.boxSizing = 'border-box';
    // Add option groups with all API device types
    Object.keys(DEVICE_TYPES).forEach((categoryName) => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = categoryName;
        DEVICE_TYPES[categoryName].forEach((deviceType) => {
            const opt = document.createElement('option');
            opt.value = deviceType;
            opt.text = deviceType;
            // Select current configDeviceType if set, otherwise match API deviceType
            const currentType = device.configDeviceType || device.deviceType || device.type || '';
            opt.selected = currentType === deviceType;
            optgroup.appendChild(opt);
        });
        typeSelect.appendChild(optgroup);
    });
    // Create modal dialog for editing
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.top = '0';
    div.style.left = '0';
    div.style.width = '100%';
    div.style.height = '100%';
    div.style.background = 'rgba(0,0,0,0.7)';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'center';
    div.style.zIndex = '9999';
    const modal = document.createElement('div');
    modal.style.background = getComputedStyle(document.body).backgroundColor;
    modal.style.color = getComputedStyle(document.body).color;
    modal.style.padding = '0';
    modal.style.borderRadius = '10px';
    modal.style.minWidth = '440px';
    modal.style.maxWidth = '90vw';
    modal.style.boxShadow = '0 8px 32px rgba(0,0,0,0.35)';
    modal.style.overflow = 'hidden';
    modal.style.borderTop = '3px solid var(--switchbot-red, #ef4444)';
    const title = document.createElement('h3');
    title.textContent = 'Edit Device';
    title.style.marginTop = '0';
    title.style.marginBottom = '16px';
    title.style.padding = '20px 20px 0';
    title.style.fontSize = '18px';
    title.style.fontWeight = '600';
    title.style.color = 'var(--switchbot-red, #ef4444)';
    title.style.letterSpacing = '-0.02em';
    const contentDiv = document.createElement('div');
    contentDiv.style.padding = '0 20px 20px';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Device Name';
    nameLabel.style.display = 'block';
    nameLabel.style.marginBottom = '6px';
    nameLabel.style.fontWeight = '500';
    nameLabel.style.fontSize = '12px';
    nameLabel.style.color = '#6b7280';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = device.name || device.id;
    nameInput.style.width = '100%';
    nameInput.style.marginBottom = '12px';
    nameInput.style.padding = '8px 10px';
    nameInput.style.borderRadius = '6px';
    nameInput.style.fontSize = '14px';
    nameInput.style.boxSizing = 'border-box';
    nameInput.style.transition = 'border-color 0.2s ease';
    // Read-only API device type field
    const apiTypeLabel = document.createElement('label');
    apiTypeLabel.textContent = 'Device Type (API - Read Only)';
    apiTypeLabel.style.display = 'block';
    apiTypeLabel.style.marginBottom = '6px';
    apiTypeLabel.style.fontWeight = '500';
    apiTypeLabel.style.fontSize = '12px';
    apiTypeLabel.style.color = '#6b7280';
    const apiTypeInput = document.createElement('input');
    apiTypeInput.type = 'text';
    apiTypeInput.value = device.deviceType || device.type || 'Unknown';
    apiTypeInput.readOnly = true;
    apiTypeInput.style.width = '100%';
    apiTypeInput.style.marginBottom = '12px';
    apiTypeInput.style.padding = '8px 10px';
    apiTypeInput.style.borderRadius = '6px';
    apiTypeInput.style.fontSize = '13px';
    apiTypeInput.style.opacity = '0.6';
    apiTypeInput.style.cursor = 'not-allowed';
    apiTypeInput.style.boxSizing = 'border-box';
    apiTypeInput.style.backgroundColor = '#f9fafb';
    // Editable config device type dropdown
    // Add option groups with all API device types
    Object.keys(DEVICE_TYPES).forEach((categoryName) => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = categoryName;
        DEVICE_TYPES[categoryName].forEach((deviceType) => {
            const opt = document.createElement('option');
            opt.value = deviceType;
            opt.text = deviceType;
            // Select current configDeviceType if set, otherwise match API deviceType
            const currentType = device.configDeviceType || device.deviceType || device.type || '';
            opt.selected = currentType === deviceType;
            optgroup.appendChild(opt);
        });
        typeSelect.appendChild(optgroup);
    });
    // --- Connection Preference ---
    const connectionPrefLabel = document.createElement('label');
    connectionPrefLabel.textContent = 'Connection Preference';
    connectionPrefLabel.style.display = 'block';
    connectionPrefLabel.style.marginBottom = '6px';
    connectionPrefLabel.style.fontWeight = '500';
    connectionPrefLabel.style.fontSize = '12px';
    connectionPrefLabel.style.color = '#6b7280';
    const connectionPrefSelect = document.createElement('select');
    connectionPrefSelect.style.width = '100%';
    connectionPrefSelect.style.marginBottom = '12px';
    connectionPrefSelect.style.padding = '8px 10px';
    connectionPrefSelect.style.borderRadius = '6px';
    connectionPrefSelect.style.fontSize = '14px';
    connectionPrefSelect.style.boxSizing = 'border-box';
    ['auto', 'ble', 'openapi'].forEach((val) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.text = val.charAt(0).toUpperCase() + val.slice(1);
        opt.selected = (device.connectionPreference || 'auto') === val;
        connectionPrefSelect.appendChild(opt);
    });
    // --- Room ---
    const roomLabel = document.createElement('label');
    roomLabel.textContent = 'Room';
    roomLabel.style.display = 'block';
    roomLabel.style.marginBottom = '6px';
    roomLabel.style.fontWeight = '500';
    roomLabel.style.fontSize = '12px';
    roomLabel.style.color = '#6b7280';
    const roomInput = document.createElement('input');
    roomInput.type = 'text';
    roomInput.value = device.room || '';
    roomInput.placeholder = 'Optional room/location metadata';
    roomInput.style.width = '100%';
    roomInput.style.marginBottom = '12px';
    roomInput.style.padding = '8px 10px';
    roomInput.style.borderRadius = '6px';
    roomInput.style.fontSize = '14px';
    roomInput.style.boxSizing = 'border-box';
    // --- Encryption Key ---
    const encryptionKeyLabel = document.createElement('label');
    encryptionKeyLabel.textContent = 'BLE Encryption Key (optional)';
    encryptionKeyLabel.style.display = 'block';
    encryptionKeyLabel.style.marginBottom = '6px';
    encryptionKeyLabel.style.fontWeight = '500';
    encryptionKeyLabel.style.fontSize = '12px';
    encryptionKeyLabel.style.color = '#6b7280';
    const encryptionKeyInput = document.createElement('input');
    encryptionKeyInput.type = 'password';
    encryptionKeyInput.value = device.encryptionKey || '';
    encryptionKeyInput.placeholder = 'Paste device BLE encryption key';
    encryptionKeyInput.style.width = '100%';
    encryptionKeyInput.style.marginBottom = '12px';
    encryptionKeyInput.style.padding = '8px 10px';
    encryptionKeyInput.style.borderRadius = '6px';
    encryptionKeyInput.style.fontSize = '14px';
    encryptionKeyInput.style.boxSizing = 'border-box';
    // --- Key ID ---
    const keyIdLabel = document.createElement('label');
    keyIdLabel.textContent = 'BLE Key ID (optional)';
    keyIdLabel.style.display = 'block';
    keyIdLabel.style.marginBottom = '6px';
    keyIdLabel.style.fontWeight = '500';
    keyIdLabel.style.fontSize = '12px';
    keyIdLabel.style.color = '#6b7280';
    const keyIdInput = document.createElement('input');
    keyIdInput.type = 'text';
    keyIdInput.value = device.keyId || '';
    keyIdInput.placeholder = 'e.g. ff';
    keyIdInput.style.width = '100%';
    keyIdInput.style.marginBottom = '12px';
    keyIdInput.style.padding = '8px 10px';
    keyIdInput.style.borderRadius = '6px';
    keyIdInput.style.fontSize = '14px';
    keyIdInput.style.boxSizing = 'border-box';
    const errorMessage = document.createElement('div');
    errorMessage.style.color = 'var(--switchbot-red, #ef4444)';
    errorMessage.style.marginBottom = '12px';
    errorMessage.style.fontSize = '12px';
    errorMessage.style.display = 'none';
    errorMessage.style.padding = '8px 10px';
    errorMessage.style.background = 'var(--switchbot-red-light, #fee2e2)';
    errorMessage.style.borderRadius = '6px';
    errorMessage.style.fontWeight = '500';
    const buttons = document.createElement('div');
    buttons.style.display = 'flex';
    buttons.style.gap = '10px';
    buttons.style.justifyContent = 'flex-end';
    buttons.style.marginTop = '18px';
    buttons.style.paddingTop = '18px';
    buttons.style.borderTop = '1px solid rgba(0, 0, 0, 0.08)';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'secondary';
    cancelBtn.style.background = '#6b7280';
    cancelBtn.style.padding = '8px 16px';
    cancelBtn.style.fontSize = '13px';
    cancelBtn.onclick = () => div.remove();
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.background = 'var(--switchbot-red, #ef4444)';
    saveBtn.style.padding = '8px 20px';
    saveBtn.style.fontSize = '13px';
    saveBtn.onclick = async () => {
        try {
            const { updateDevice, syncParentPluginConfigFromDisk, fetchDevices } = await import('./api.js');
            const { renderDeviceList } = await import('./render.js');
            const params = {
                deviceId: device.id,
                configDeviceName: nameInput.value || undefined,
                configDeviceType: typeSelect.value,
                connectionPreference: connectionPrefSelect.value,
                room: roomInput.value || undefined,
                encryptionKey: encryptionKeyInput.value || undefined,
                keyId: keyIdInput.value || undefined,
                refreshRate: Number(openApiRefreshInput.value) || 300,
                blePollingEnabled: blePollingEnabledInput.checked,
                blePollIntervalMs: Number(blePollIntervalInput.value) || 600000,
            };
            // Only include defined properties in the options object
            const options = {};
            if (params.connectionPreference !== undefined) {
                options.connectionPreference = params.connectionPreference;
            }
            if (params.room !== undefined) {
                options.room = params.room;
            }
            if (params.encryptionKey !== undefined) {
                options.encryptionKey = params.encryptionKey;
            }
            if (params.keyId !== undefined) {
                options.keyId = params.keyId;
            }
            if (params.refreshRate !== undefined) {
                options.refreshRate = params.refreshRate;
            }
            if (params.blePollingEnabled !== undefined) {
                options.blePollingEnabled = params.blePollingEnabled;
            }
            if (params.blePollIntervalMs !== undefined) {
                options.blePollIntervalMs = params.blePollIntervalMs;
            }
            await updateDevice(params.deviceId, params.configDeviceName, params.configDeviceType, options);
            await syncParentPluginConfigFromDisk();
            contentDiv.appendChild(openApiRefreshLabel);
            contentDiv.appendChild(openApiRefreshInput);
            // Refresh device list
            uiLog.info('[Edit Device] Refreshing device list after update');
            const list = await fetchDevices();
            renderDeviceList(list);
            div.remove();
        }
        catch (e) {
            uiLog.error('Update error:', e);
            errorMessage.textContent = `Error: ${e instanceof Error ? e.message : 'Failed to update device'}`;
            errorMessage.style.display = 'block';
        }
    };
    buttons.appendChild(cancelBtn);
    buttons.appendChild(saveBtn);
    contentDiv.appendChild(nameLabel);
    contentDiv.appendChild(nameInput);
    contentDiv.appendChild(apiTypeLabel);
    contentDiv.appendChild(apiTypeInput);
    contentDiv.appendChild(typeLabel);
    contentDiv.appendChild(typeSelect);
    contentDiv.appendChild(connectionPrefLabel);
    contentDiv.appendChild(connectionPrefSelect);
    contentDiv.appendChild(roomLabel);
    contentDiv.appendChild(roomInput);
    contentDiv.appendChild(encryptionKeyLabel);
    contentDiv.appendChild(encryptionKeyInput);
    contentDiv.appendChild(keyIdLabel);
    contentDiv.appendChild(keyIdInput);
    // Insert BLE polling fields before error/buttons
    contentDiv.appendChild(openApiRefreshLabel);
    contentDiv.appendChild(openApiRefreshInput);
    contentDiv.appendChild(blePollingEnabledLabel);
    contentDiv.appendChild(blePollingEnabledInput);
    contentDiv.appendChild(blePollIntervalLabel);
    contentDiv.appendChild(blePollIntervalInput);
    contentDiv.appendChild(errorMessage);
    contentDiv.appendChild(buttons);
    modal.appendChild(title);
    modal.appendChild(contentDiv);
    div.appendChild(modal);
    document.body.appendChild(div);
    nameInput.focus();
}
//# sourceMappingURL=modals.js.map