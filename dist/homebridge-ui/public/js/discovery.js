// Extend the Window interface to include _discoverySelectedIds for type safety
// Batch enable/disable helper (true module scope for UI access)
import { addDevicesInBulk, discoverDevices as apiDiscoverDevices, fetchBluetoothStatus, 
// fetchDevices, // removed unused import
syncParentPluginConfigFromDisk, } from './api.js';
import { loadConfiguredDevices } from './devices.js';
import { uiLog } from './logger.js';
import { hideBusyUi, showBusyUi } from './modal.js';
import { getDiscoveryPreferences, renderDiscoveredDevices, setDiscoveryPreferences } from './render.js';
import { toastError, toastInfo, toastSuccess, toastWarning } from './toast.js';
function normalizeId(value) {
    return String(value ?? '').trim().toLowerCase();
}
function dedupeById(devices) {
    return devices.filter((d, index, arr) => !!d?.id && arr.findIndex(x => x?.id === d.id) === index);
}
function mergeDiscoveredDevices(existingDevices, incomingDevices) {
    const deviceMap = new Map();
    for (const d of dedupeById(existingDevices)) {
        deviceMap.set(d.id, { ...d });
    }
    for (const d of dedupeById(incomingDevices)) {
        const current = deviceMap.get(d.id);
        if (current) {
            // Only set 'Both' if both sources are present in this session
            let nextConnectionType = current.connectionType;
            if (current.connectionType && d.connectionType && current.connectionType !== d.connectionType) {
                // Only set 'Both' if both are 'BLE' and 'OpenAPI' (not if one is undefined)
                const types = [current.connectionType, d.connectionType].sort().join(',');
                if (types === 'BLE,OpenAPI' || types === 'OpenAPI,BLE') {
                    nextConnectionType = 'Both';
                }
            }
            deviceMap.set(d.id, {
                ...current,
                ...d,
                connectionType: nextConnectionType,
            });
        }
        else {
            deviceMap.set(d.id, { ...d });
        }
    }
    const merged = [...deviceMap.values()];
    // Log merged device structure for debugging
    if (merged.length > 0) {
        console.warn('[SwitchBot][Discovery][mergeDiscoveredDevices] Merged device sample:', merged[0]);
        console.warn('[SwitchBot][Discovery][mergeDiscoveredDevices] Total merged devices:', merged.length);
    }
    return merged;
}
const DISCOVERY_GROUP_BY_KEY = 'discoveryGroupBy';
const DISCOVERY_GROUP_EXPANDED_KEY = 'discoveryGroupExpanded';
const DISCOVERY_BLE_SETTINGS_KEY = 'discoveryBleSettings';
const DISCOVERY_HIDE_ADDED_KEY = 'discoveryHideAdded';
const DISCOVERY_CACHE_KEY = 'discoveryCache';
const DISCOVERY_AUTO_REFRESH_KEY = 'discoveryAutoRefreshSeconds';
const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;
let discoveryAutoRefreshTimer = null;
let discoveryLastScannedTimer = null;
function setDiscoveryCache(devices) {
    try {
        const payload = { timestamp: Date.now(), devices };
        localStorage.setItem(DISCOVERY_CACHE_KEY, JSON.stringify(payload));
    }
    catch (_e) {
        // Ignore storage errors
    }
}
function clearDiscoveryCache() {
    try {
        localStorage.removeItem(DISCOVERY_CACHE_KEY);
    }
    catch (_e) {
        // Ignore storage errors
    }
}
function getDiscoveryCache(validOnly = true) {
    try {
        const stored = localStorage.getItem(DISCOVERY_CACHE_KEY);
        if (!stored) {
            return null;
        }
        const payload = JSON.parse(stored);
        if (!payload || !Array.isArray(payload.devices) || typeof payload.timestamp !== 'number') {
            return null;
        }
        const age = Date.now() - payload.timestamp;
        if (validOnly && age > DISCOVERY_CACHE_TTL_MS) {
            return null;
        }
        return payload;
    }
    catch (_e) {
        return null;
    }
}
function getDiscoveryAutoRefreshSeconds() {
    try {
        const stored = localStorage.getItem(DISCOVERY_AUTO_REFRESH_KEY);
        const value = Number(stored || 0);
        return Number.isFinite(value) && value >= 0 ? value : 0;
    }
    catch (_e) {
        return 0;
    }
}
function setDiscoveryAutoRefreshSeconds(value) {
    try {
        localStorage.setItem(DISCOVERY_AUTO_REFRESH_KEY, String(Math.max(0, value)));
    }
    catch (_e) {
        // Ignore storage errors
    }
}
function getDiscoveryHideAddedPreference() {
    try {
        return localStorage.getItem(DISCOVERY_HIDE_ADDED_KEY) === 'true';
    }
    catch (_e) {
        return false;
    }
}
function setDiscoveryHideAddedPreference(value) {
    try {
        localStorage.setItem(DISCOVERY_HIDE_ADDED_KEY, String(value));
    }
    catch (_e) {
        // Ignore storage errors
    }
}
function formatElapsedShort(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    if (totalSeconds < 60) {
        return `${totalSeconds}s ago`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    if (minutes < 60) {
        return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}
function updateLastScannedStatus() {
    const lastScannedStatus = document.getElementById('lastScannedStatus');
    if (!lastScannedStatus) {
        return;
    }
    const cache = getDiscoveryCache(false);
    if (!cache) {
        lastScannedStatus.textContent = 'Last scanned: never';
        return;
    }
    const ageMs = Date.now() - cache.timestamp;
    const timestampText = new Date(cache.timestamp).toLocaleString();
    const stale = ageMs > DISCOVERY_CACHE_TTL_MS;
    lastScannedStatus.textContent = stale
        ? `Last scanned: ${formatElapsedShort(ageMs)} (${timestampText}, cache expired)`
        : `Last scanned: ${formatElapsedShort(ageMs)} (${timestampText})`;
}
async function renderCachedDiscoveryResults() {
    const cache = getDiscoveryCache(true);
    const list = document.getElementById('discoveredList');
    if (!cache || !list || !cache.devices.length) {
        return;
    }
    list.style.display = 'block';
    // Use type-safe property for window._discoverySelectedIds
    if (!window._discoverySelectedIds) {
        window._discoverySelectedIds = new Set();
    }
    await updateDiscoveryView(cache.devices, getDiscoveryPreferences(), getDiscoveryGroupByPreference(), getDiscoveryHideAddedPreference(), window._discoverySelectedIds);
}
function getDiscoveryBleSettings() {
    try {
        const stored = localStorage.getItem(DISCOVERY_BLE_SETTINGS_KEY);
        if (!stored) {
            return { bleEnabled: true, bleScanDurationSeconds: 5, bleTimeoutSeconds: 8 };
        }
        const parsed = JSON.parse(stored);
        return {
            bleEnabled: parsed?.bleEnabled !== false,
            bleScanDurationSeconds: Math.max(3, Math.min(15, Number(parsed?.bleScanDurationSeconds || 5))),
            bleTimeoutSeconds: Math.max(3, Math.min(30, Number(parsed?.bleTimeoutSeconds || 8))),
        };
    }
    catch (_e) {
        return { bleEnabled: true, bleScanDurationSeconds: 5, bleTimeoutSeconds: 8 };
    }
}
function setDiscoveryBleSettings(settings) {
    try {
        localStorage.setItem(DISCOVERY_BLE_SETTINGS_KEY, JSON.stringify(settings));
    }
    catch (_e) {
        // Ignore storage errors
    }
}
export async function initializeDiscoverySettings() {
    const scanSelect = document.getElementById('bleScanDurationSelect');
    const timeoutInput = document.getElementById('bleTimeoutInput');
    const disableBleCheckbox = document.getElementById('disableBleScanCheckbox');
    const scanSetting = document.getElementById('bleScanSetting');
    const timeoutSetting = document.getElementById('bleTimeoutSetting');
    const bluetoothStatus = document.getElementById('bluetoothStatus');
    const autoRefreshSelect = document.getElementById('autoRefreshIntervalSelect');
    const refreshBtn = document.getElementById('refreshDiscoverBtn');
    const current = getDiscoveryBleSettings();
    if (scanSelect) {
        scanSelect.value = String(current.bleScanDurationSeconds);
    }
    if (timeoutInput) {
        timeoutInput.value = String(current.bleTimeoutSeconds);
    }
    if (disableBleCheckbox) {
        disableBleCheckbox.checked = !current.bleEnabled;
    }
    if (autoRefreshSelect) {
        autoRefreshSelect.value = String(getDiscoveryAutoRefreshSeconds());
    }
    const updateBleSettingVisibility = () => {
        const disabled = !!disableBleCheckbox?.checked;
        if (scanSetting) {
            scanSetting.style.display = disabled ? 'none' : 'inline-flex';
        }
        if (timeoutSetting) {
            timeoutSetting.style.display = disabled ? 'none' : 'inline-flex';
        }
    };
    const persistFromControls = () => {
        const next = {
            bleEnabled: !(disableBleCheckbox?.checked ?? false),
            bleScanDurationSeconds: Math.max(3, Math.min(15, Number(scanSelect?.value || 5))),
            bleTimeoutSeconds: Math.max(3, Math.min(30, Number(timeoutInput?.value || 8))),
        };
        setDiscoveryBleSettings(next);
    };
    scanSelect?.addEventListener('change', persistFromControls);
    timeoutInput?.addEventListener('change', persistFromControls);
    disableBleCheckbox?.addEventListener('change', () => {
        persistFromControls();
        updateBleSettingVisibility();
    });
    updateBleSettingVisibility();
    if (bluetoothStatus) {
        const status = await fetchBluetoothStatus();
        bluetoothStatus.textContent = status.available
            ? `Bluetooth: available (${status.message})`
            : `Bluetooth: unavailable (${status.message})`;
    }
    updateLastScannedStatus();
    if (discoveryLastScannedTimer) {
        clearInterval(discoveryLastScannedTimer);
    }
    discoveryLastScannedTimer = setInterval(updateLastScannedStatus, 15000);
    refreshBtn?.addEventListener('click', () => {
        void discoverDevices();
    });
    const applyAutoRefresh = () => {
        const seconds = Math.max(0, Number(autoRefreshSelect?.value || 0));
        setDiscoveryAutoRefreshSeconds(seconds);
        if (discoveryAutoRefreshTimer) {
            clearInterval(discoveryAutoRefreshTimer);
            discoveryAutoRefreshTimer = null;
        }
        if (seconds > 0) {
            discoveryAutoRefreshTimer = setInterval(() => {
                const discoverBtn = document.getElementById('discoverBtn');
                if (!discoverBtn || discoverBtn.disabled || document.hidden) {
                    return;
                }
                void discoverDevices();
            }, seconds * 1000);
        }
    };
    autoRefreshSelect?.addEventListener('change', applyAutoRefresh);
    applyAutoRefresh();
    await renderCachedDiscoveryResults();
}
function getDiscoveryGroupByPreference() {
    try {
        const stored = localStorage.getItem(DISCOVERY_GROUP_BY_KEY);
        if (stored === 'hub' || stored === 'type') {
            return stored;
        }
        return 'type'; // Default to Device Type grouping
    }
    catch (_e) {
        return 'type';
    }
}
function setDiscoveryGroupByPreference(groupBy) {
    try {
        localStorage.setItem(DISCOVERY_GROUP_BY_KEY, groupBy);
    }
    catch (_e) {
        // Ignore storage errors
    }
}
function getDiscoveryGroupExpandedState() {
    try {
        const stored = localStorage.getItem(DISCOVERY_GROUP_EXPANDED_KEY);
        if (!stored) {
            return {};
        }
        const parsed = JSON.parse(stored);
        return typeof parsed === 'object' && parsed ? parsed : {};
    }
    catch (_e) {
        return {};
    }
}
function setDiscoveryGroupExpandedState(state) {
    try {
        localStorage.setItem(DISCOVERY_GROUP_EXPANDED_KEY, JSON.stringify(state));
    }
    catch (_e) {
        // Ignore storage errors
    }
}
function isDiscoveryGroupExpanded(groupKey) {
    const state = getDiscoveryGroupExpandedState();
    return state[groupKey] !== false;
}
function setDiscoveryGroupExpanded(groupKey, expanded) {
    const state = getDiscoveryGroupExpandedState();
    state[groupKey] = expanded;
    setDiscoveryGroupExpandedState(state);
}
export async function discoverDevices() {
    const btn = document.getElementById('discoverBtn');
    const status = document.getElementById('discoverStatus');
    const phaseProgress = document.getElementById('discoverPhaseProgress');
    const phaseFill = document.getElementById('discoverPhaseFill');
    const phaseLabel = document.getElementById('discoverPhaseLabel');
    const list = document.getElementById('discoveredList');
    const autoAddAll = document.getElementById('autoAddAllCheckbox')?.checked;
    const scanSelect = document.getElementById('bleScanDurationSelect');
    const timeoutInput = document.getElementById('bleTimeoutInput');
    const disableBleCheckbox = document.getElementById('disableBleScanCheckbox');
    if (!btn) {
        console.error('[SwitchBot][Discovery] discoverDevices: discoverBtn not found in DOM');
        return;
    }
    if (!status) {
        console.error('[SwitchBot][Discovery] discoverDevices: discoverStatus not found in DOM');
        return;
    }
    if (!list) {
        console.error('[SwitchBot][Discovery] discoverDevices: discoveredList container not found in DOM');
        toastError('Discovery UI error: device list container missing. Please reload the page.');
        return;
    }
    const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let spinnerIndex = 0;
    const startedAt = Date.now();
    let phaseStartedAt = startedAt;
    let phase = 'Preparing discovery...';
    // --- Real-time RSSI polling additions ---
    // (bleScanDurationSeconds is now only used in bleSettings below)
    const setPhase = (nextPhase) => {
        phase = nextPhase;
        phaseStartedAt = Date.now();
    };
    const getPhasePercent = (phaseName) => {
        if (phaseName.includes('Scanning BLE')) {
            return 35;
        }
        if (phaseName.includes('Fetching OpenAPI')) {
            return 75;
        }
        if (phaseName.includes('Complete')) {
            return 100;
        }
        return 10;
    };
    const renderProgress = () => {
        const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        const phaseSeconds = Math.max(0, Math.floor((Date.now() - phaseStartedAt) / 1000));
        const frame = spinnerFrames[spinnerIndex % spinnerFrames.length];
        spinnerIndex += 1;
        status.textContent = `${frame} ${phase} (${phaseSeconds}s, ${totalSeconds}s total)`;
        if (phaseProgress) {
            phaseProgress.style.display = 'block';
        }
        if (phaseFill) {
            phaseFill.style.width = `${getPhasePercent(phase)}%`;
        }
        if (phaseLabel) {
            phaseLabel.textContent = phase;
        }
    };
    const progressTimer = setInterval(renderProgress, 250);
    let discoveredDevices = [];
    const preferences = getDiscoveryPreferences();
    let groupBy = getDiscoveryGroupByPreference();
    let hideAdded = getDiscoveryHideAddedPreference();
    // Use persistent selection state across renders
    if (!window._discoverySelectedIds) {
        window._discoverySelectedIds = new Set();
    }
    const selectedIds = window._discoverySelectedIds;
    let controlsInitialized = false;
    // --- Real-time RSSI polling loop ---
    // (Moved inside main try block after bleSettings is defined)
    // Batch enable/disable helper (moved to module scope for UI access)
    async function batchSetDeviceEnabled(selectedIds, enabled) {
        // Fetch current config
        // Fetch current config using Homebridge UI API
        if (typeof homebridge.getPluginConfig !== 'function') {
            throw new TypeError('homebridge.getPluginConfig is not available');
        }
        const configArr = await homebridge.getPluginConfig();
        const platformIdx = Array.isArray(configArr) ? configArr.findIndex(c => (c.platform || c.name || '').toLowerCase().includes('switchbot')) : -1;
        if (platformIdx === -1) {
            throw new Error('SwitchBot platform config not found');
        }
        const platformConfig = configArr[platformIdx];
        if (!Array.isArray(platformConfig.devices)) {
            throw new TypeError('No devices array in config');
        }
        let changed = false;
        for (const dev of platformConfig.devices) {
            const id = String(dev.deviceId || dev.id || '').trim().toLowerCase();
            if (selectedIds.has(id)) {
                if (dev.enabled !== enabled) {
                    dev.enabled = enabled;
                    changed = true;
                }
            }
        }
        if (changed) {
            if (typeof homebridge.updatePluginConfig === 'function') {
                await homebridge.updatePluginConfig(configArr);
            }
            else {
                throw new TypeError('homebridge.updatePluginConfig is not available');
            }
            if (typeof homebridge.savePluginConfig === 'function') {
                await homebridge.savePluginConfig();
            }
        }
    }
    const ensureDiscoveryControls = async () => {
        // --- Select All / Deselect All controls ---
        const selectAllBtn = document.createElement('button');
        selectAllBtn.textContent = 'Select All';
        selectAllBtn.style.fontSize = '13px';
        selectAllBtn.style.padding = '6px 18px';
        selectAllBtn.style.borderRadius = '6px';
        selectAllBtn.style.background = '#f3f4f6';
        selectAllBtn.style.color = '#1d4ed8';
        selectAllBtn.style.border = '1px solid #d1d5db';
        selectAllBtn.style.cursor = 'pointer';
        selectAllBtn.style.marginRight = '8px';
        selectAllBtn.onclick = () => {
            // Add all visible device IDs to selectedIds
            for (const d of discoveredDevices) {
                selectedIds.add(normalizeId(d.id));
            }
            window.dispatchEvent(new Event('discovery-selection-changed'));
            void updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
        };
        const deselectAllBtn = document.createElement('button');
        deselectAllBtn.textContent = 'Deselect All';
        deselectAllBtn.style.fontSize = '13px';
        deselectAllBtn.style.padding = '6px 18px';
        deselectAllBtn.style.borderRadius = '6px';
        deselectAllBtn.style.background = '#f3f4f6';
        deselectAllBtn.style.color = '#ef4444';
        deselectAllBtn.style.border = '1px solid #d1d5db';
        deselectAllBtn.style.cursor = 'pointer';
        deselectAllBtn.onclick = () => {
            // Remove all visible device IDs from selectedIds
            for (const d of discoveredDevices) {
                selectedIds.delete(normalizeId(d.id));
            }
            window.dispatchEvent(new Event('discovery-selection-changed'));
            void updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
        };
        // Insert select/deselect all controls above the action buttons
        const selectControlsRow = document.createElement('div');
        selectControlsRow.style.display = 'flex';
        selectControlsRow.style.gap = '10px';
        selectControlsRow.style.margin = '0 0 10px 0';
        selectControlsRow.appendChild(selectAllBtn);
        selectControlsRow.appendChild(deselectAllBtn);
        if (controlsInitialized) {
            return;
        }
        // Always use persistent selectedIds (already defined in outer scope)
        const controlsDiv = document.createElement('div');
        controlsDiv.style.cssText = 'margin-bottom: 12px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center;';
        const filterLabel = document.createElement('label');
        filterLabel.style.fontSize = '12px';
        filterLabel.style.fontWeight = '500';
        filterLabel.textContent = 'Filter:';
        const filterGroup = document.createElement('div');
        filterGroup.style.display = 'flex';
        filterGroup.style.gap = '4px';
        const filterOptions = [
            { label: 'All', value: 'all' },
            { label: 'BLE', value: 'ble' },
            { label: 'API', value: 'api' },
            { label: 'Both', value: 'both' },
            { label: 'IR', value: 'ir' },
        ];
        for (const option of filterOptions) {
            const filterBtn = document.createElement('button');
            filterBtn.textContent = option.label;
            filterBtn.style.padding = '4px 8px';
            filterBtn.style.fontSize = '11px';
            filterBtn.style.borderRadius = '3px';
            filterBtn.style.cursor = 'pointer';
            filterBtn.style.border = preferences.connectionType === option.value ? '2px solid #007AFF' : '1px solid #ccc';
            filterBtn.style.backgroundColor = preferences.connectionType === option.value ? '#f0f7ff' : '#fff';
            filterBtn.style.color = preferences.connectionType === option.value ? '#1d4ed8' : '#374151';
            filterBtn.onclick = () => {
                preferences.connectionType = option.value;
                setDiscoveryPreferences(preferences);
                void updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
                Array.prototype.forEach.call(filterGroup.querySelectorAll('button'), (b) => {
                    b.style.border = '1px solid #ccc';
                    b.style.backgroundColor = '#fff';
                    b.style.color = '#374151';
                });
                filterBtn.style.border = '2px solid #007AFF';
                filterBtn.style.backgroundColor = '#f0f7ff';
                filterBtn.style.color = '#1d4ed8';
            };
            filterGroup.appendChild(filterBtn);
        }
        const sortLabel = document.createElement('label');
        sortLabel.style.fontSize = '12px';
        sortLabel.style.fontWeight = '500';
        sortLabel.style.marginLeft = '8px';
        sortLabel.textContent = 'Sort:';
        const sortSelect = document.createElement('select');
        sortSelect.style.fontSize = '11px';
        sortSelect.style.padding = '4px 8px';
        sortSelect.style.borderRadius = '3px';
        sortSelect.value = preferences.sortBy;
        const sortOptions = [
            { label: 'Name', value: 'name' },
            { label: 'Signal Strength', value: 'signal' },
            { label: 'Type', value: 'type' },
            { label: 'Connection', value: 'connection' },
        ];
        for (const opt of sortOptions) {
            const sortOption = document.createElement('option');
            sortOption.value = opt.value;
            sortOption.textContent = opt.label;
            sortSelect.appendChild(sortOption);
        }
        sortSelect.onchange = () => {
            preferences.sortBy = sortSelect.value;
            setDiscoveryPreferences(preferences);
            void updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
        };
        const groupSelect = document.createElement('select');
        groupSelect.style.fontSize = '11px';
        groupSelect.style.padding = '4px 8px';
        groupSelect.style.borderRadius = '3px';
        // Set default value to 'type' if no stored preference
        if (!localStorage.getItem(DISCOVERY_GROUP_BY_KEY)) {
            groupSelect.value = 'type';
        }
        else {
            groupSelect.value = groupBy;
        }
        const groupLabel = document.createElement('label');
        groupLabel.style.fontSize = '12px';
        groupLabel.style.fontWeight = '500';
        groupLabel.style.marginLeft = '8px';
        // Set label text to match selected group
        const groupLabelTextMap = {
            connection: 'Connection',
            hub: 'Hub',
            type: 'Device Type',
        };
        groupLabel.textContent = `Group: ${groupLabelTextMap[groupSelect.value] || 'Connection'}`;
        const groupOptions = [
            { label: 'Connection', value: 'connection' },
            { label: 'Hub', value: 'hub' },
            { label: 'Device Type', value: 'type' },
        ];
        for (const opt of groupOptions) {
            const groupOption = document.createElement('option');
            groupOption.value = opt.value;
            groupOption.textContent = opt.label;
            groupSelect.appendChild(groupOption);
        }
        groupSelect.onchange = () => {
            groupBy = groupSelect.value;
            setDiscoveryGroupByPreference(groupBy);
            groupLabel.textContent = `Group: ${groupLabelTextMap[groupSelect.value] || 'Connection'}`;
            void updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
        };
        const hideAddedLabel = document.createElement('label');
        hideAddedLabel.style.display = 'inline-flex';
        hideAddedLabel.style.alignItems = 'center';
        hideAddedLabel.style.gap = '4px';
        hideAddedLabel.style.fontSize = '11px';
        hideAddedLabel.style.marginLeft = '8px';
        const hideAddedCheckbox = document.createElement('input');
        hideAddedCheckbox.type = 'checkbox';
        hideAddedCheckbox.checked = hideAdded;
        hideAddedCheckbox.style.margin = '0';
        hideAddedCheckbox.style.width = 'auto';
        const hideAddedText = document.createElement('span');
        hideAddedText.textContent = 'Hide Added';
        hideAddedLabel.appendChild(hideAddedCheckbox);
        hideAddedLabel.appendChild(hideAddedText);
        hideAddedCheckbox.onchange = () => {
            hideAdded = hideAddedCheckbox.checked;
            setDiscoveryHideAddedPreference(hideAdded);
            void updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
        };
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search by name, ID, or type...';
        searchInput.style.fontSize = '13px';
        searchInput.style.padding = '8px 16px';
        searchInput.style.borderRadius = '6px';
        searchInput.style.border = '1px solid #ccc';
        searchInput.style.flex = '1 1 0%';
        searchInput.style.minWidth = '120px';
        searchInput.style.maxWidth = '100%';
        searchInput.style.width = '100%';
        searchInput.value = preferences.searchQuery;
        let searchTimeout;
        searchInput.oninput = () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                preferences.searchQuery = searchInput.value;
                setDiscoveryPreferences(preferences);
                void updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
            }, 300);
        };
        // Shared style for all top action buttons (smaller, more compact)
        const actionBtnStyle = {
            fontSize: '16px',
            padding: '10px 0',
            borderRadius: '10px',
            margin: '0 12px 0 0',
            width: '100%',
            maxWidth: '220px',
            fontWeight: 'bold',
            background: '#ef4444',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 2px 8px #0001',
            transition: 'background 0.2s',
            outline: 'none',
            display: 'block',
        };
        // Add Selected button
        const addSelectedBtn = document.createElement('button');
        addSelectedBtn.textContent = 'Add Selected to Config';
        Object.assign(addSelectedBtn.style, actionBtnStyle);
        addSelectedBtn.disabled = true;
        addSelectedBtn.onclick = async () => {
            if (!selectedIds.size) {
                return;
            }
            addSelectedBtn.disabled = true;
            addSelectedBtn.textContent = 'Adding...';
            try {
                showBusyUi();
                const selectedDevices = discoveredDevices.filter(d => selectedIds.has(normalizeId(d.id)));
                const bulkResult = await addDevicesInBulk(selectedDevices.map(d => ({
                    deviceId: d.id,
                    name: d.name,
                    type: d.type,
                    rssi: d.rssi,
                    address: d.address,
                    model: d.model,
                })));
                uiLog.info('Batch add response:', bulkResult);
                if (!bulkResult || bulkResult.success === false) {
                    throw new Error(bulkResult?.data?.message || 'Batch add failed');
                }
                const addedCount = bulkResult?.addedCount ?? bulkResult?.data?.addedCount ?? 0;
                const skippedCount = bulkResult?.skippedCount ?? bulkResult?.data?.skippedCount ?? 0;
                toastSuccess(`Added ${addedCount} device(s)${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`);
                await loadConfiguredDevices();
                selectedIds.clear();
                addSelectedBtn.disabled = true;
                addSelectedBtn.textContent = 'Add Selected';
                await updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
            }
            catch (e) {
                uiLog.error('Batch add error:', e);
                toastError(e instanceof Error ? e.message : 'Failed to add devices');
                addSelectedBtn.disabled = false;
                addSelectedBtn.textContent = 'Add Selected';
            }
            finally {
                hideBusyUi();
            }
        };
        // Enable Selected button
        const enableSelectedBtn = document.createElement('button');
        enableSelectedBtn.textContent = 'Enable Selected';
        Object.assign(enableSelectedBtn.style, actionBtnStyle);
        enableSelectedBtn.disabled = true;
        enableSelectedBtn.onclick = async () => {
            if (!selectedIds.size) {
                return;
            }
            enableSelectedBtn.disabled = true;
            enableSelectedBtn.textContent = 'Enabling...';
            try {
                showBusyUi();
                await batchSetDeviceEnabled(selectedIds, true);
                toastSuccess('Selected devices enabled');
                await loadConfiguredDevices();
                enableSelectedBtn.disabled = true;
                enableSelectedBtn.textContent = 'Enable Selected';
                await updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
            }
            catch (e) {
                uiLog.error('Batch enable error:', e);
                toastError(e instanceof Error ? e.message : 'Failed to enable devices');
                enableSelectedBtn.disabled = false;
                enableSelectedBtn.textContent = 'Enable Selected';
            }
            finally {
                hideBusyUi();
            }
        };
        // Disable Selected button
        const disableSelectedBtn = document.createElement('button');
        disableSelectedBtn.textContent = 'Disable Selected';
        Object.assign(disableSelectedBtn.style, actionBtnStyle);
        disableSelectedBtn.disabled = true;
        disableSelectedBtn.onclick = async () => {
            if (!selectedIds.size) {
                return;
            }
            disableSelectedBtn.disabled = true;
            disableSelectedBtn.textContent = 'Disabling...';
            try {
                showBusyUi();
                await batchSetDeviceEnabled(selectedIds, false);
                toastSuccess('Selected devices disabled');
                await loadConfiguredDevices();
                disableSelectedBtn.disabled = true;
                disableSelectedBtn.textContent = 'Disable Selected';
                await updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
            }
            catch (e) {
                uiLog.error('Batch disable error:', e);
                toastError(e instanceof Error ? e.message : 'Failed to disable devices');
                disableSelectedBtn.disabled = false;
                disableSelectedBtn.textContent = 'Disable Selected';
            }
            finally {
                hideBusyUi();
            }
        };
        // Only add the filter/search controls
        controlsDiv.appendChild(filterLabel);
        controlsDiv.appendChild(filterGroup);
        controlsDiv.appendChild(sortLabel);
        controlsDiv.appendChild(sortSelect);
        controlsDiv.appendChild(groupLabel);
        controlsDiv.appendChild(groupSelect);
        controlsDiv.appendChild(hideAddedLabel);
        controlsDiv.appendChild(searchInput);
        // Top row action buttons container
        const topActionRow = document.createElement('div');
        topActionRow.style.display = 'flex';
        topActionRow.style.gap = '20px';
        topActionRow.style.margin = '18px 0 10px 0';
        topActionRow.style.justifyContent = 'flex-start';
        topActionRow.appendChild(addSelectedBtn);
        topActionRow.appendChild(enableSelectedBtn);
        topActionRow.appendChild(disableSelectedBtn);
        // Clear list and append controls in correct order
        list.innerHTML = '';
        list.appendChild(selectControlsRow);
        list.appendChild(topActionRow);
        list.appendChild(controlsDiv);
        let deviceListContainer = document.getElementById('discoveredDevices');
        if (!deviceListContainer) {
            deviceListContainer = document.createElement('ul');
            deviceListContainer.id = 'discoveredDevices';
            deviceListContainer.style.maxHeight = '400px';
            deviceListContainer.style.overflowY = 'auto';
            deviceListContainer.style.marginTop = '12px';
            deviceListContainer.style.padding = '0';
            deviceListContainer.style.listStyle = 'none';
            list.appendChild(deviceListContainer);
        }
        list.style.display = 'block';
        controlsInitialized = true;
        // Update action button enabled state based on selection
        const updateActionButtons = () => {
            const hasSelection = selectedIds.size > 0;
            addSelectedBtn.disabled = !hasSelection;
            enableSelectedBtn.disabled = !hasSelection;
            disableSelectedBtn.disabled = !hasSelection;
        };
        // Listen for selection changes (selection is managed elsewhere, so poll)
        setInterval(updateActionButtons, 300);
    };
    try {
        const bleSettings = {
            bleEnabled: !(disableBleCheckbox?.checked ?? false),
            bleScanDurationSeconds: Math.max(3, Math.min(15, Number(scanSelect?.value || 5))),
            bleTimeoutSeconds: Math.max(3, Math.min(30, Number(timeoutInput?.value || 8))),
        };
        setDiscoveryBleSettings(bleSettings);
        showBusyUi();
        btn.disabled = true;
        btn.textContent = '🔍 Discovering...';
        setPhase(bleSettings.bleEnabled ? 'Scanning BLE...' : 'Skipping BLE scan...');
        renderProgress();
        status.classList.remove('error');
        const devicesFoundDisplay = document.getElementById('discoverDevicesFound');
        if (devicesFoundDisplay) {
            devicesFoundDisplay.style.display = 'none';
            devicesFoundDisplay.classList.remove('discovery-scanning-pulse');
        }
        if (bleSettings.bleEnabled) {
            const bleDevicesRaw = await apiDiscoverDevices('ble', bleSettings);
            discoveredDevices = dedupeById(bleDevicesRaw);
            uiLog.info('BLE discover response:', bleDevicesRaw);
            // Update real-time device counter
            if (devicesFoundDisplay && bleDevicesRaw.length > 0) {
                devicesFoundDisplay.style.display = 'inline';
                devicesFoundDisplay.classList.add('discovery-scanning-pulse');
                devicesFoundDisplay.textContent = `📊 ${bleDevicesRaw.length} device(s) found (scanning...)`;
            }
        }
        else {
            discoveredDevices = [];
            uiLog.info('BLE discovery skipped by user setting');
        }
        if (!autoAddAll && discoveredDevices.length > 0) {
            await ensureDiscoveryControls();
            await updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
            status.textContent = `Showing ${discoveredDevices.length} device(s) from BLE, fetching OpenAPI...`;
        }
        setPhase('Fetching OpenAPI...');
        renderProgress();
        try {
            const openApiDevicesRaw = await apiDiscoverDevices('openapi');
            uiLog.info('OpenAPI discover response:', openApiDevicesRaw);
            discoveredDevices = mergeDiscoveredDevices(discoveredDevices, openApiDevicesRaw);
            // Update device counter with merged count
            if (devicesFoundDisplay && discoveredDevices.length > 0) {
                devicesFoundDisplay.textContent = `📊 ${discoveredDevices.length} device(s) found (complete)`;
            }
        }
        catch (openApiError) {
            uiLog.warn('OpenAPI phase failed during discovery:', openApiError);
            // Keep BLE results if available
            if (!discoveredDevices.length) {
                throw openApiError;
            }
            if (devicesFoundDisplay) {
                devicesFoundDisplay.classList.remove('discovery-scanning-pulse');
            }
        }
        setPhase('Complete');
        renderProgress();
        uiLog.info('Final merged discover response:', discoveredDevices);
        if (!discoveredDevices.length) {
            status.textContent = 'No devices found in your SwitchBot account';
            toastInfo('No devices found in your SwitchBot account');
            list.style.display = 'none';
            if (devicesFoundDisplay) {
                devicesFoundDisplay.style.display = 'none';
                devicesFoundDisplay.classList.remove('discovery-scanning-pulse');
            }
            clearDiscoveryCache();
            updateLastScannedStatus();
            return;
        }
        // If auto-add is enabled, add all devices immediately using bulk endpoint
        if (autoAddAll) {
            status.textContent = `Auto-adding ${discoveredDevices.length} device(s)...`;
            try {
                const bulkResult = await addDevicesInBulk(discoveredDevices.map(d => ({
                    deviceId: d.id,
                    name: d.name,
                    type: d.type,
                    rssi: d.rssi,
                    address: d.address,
                    model: d.model,
                })));
                uiLog.info('Bulk add response:', bulkResult);
                if (!bulkResult || bulkResult.success === false) {
                    throw new Error(bulkResult?.data?.message || 'Bulk add failed');
                }
                const addedCount = bulkResult?.addedCount
                    ?? bulkResult?.data?.addedCount
                    ?? 0;
                const skippedCount = bulkResult?.skippedCount
                    ?? bulkResult?.data?.skippedCount
                    ?? 0;
                status.textContent = `✓ Added ${addedCount} device(s)${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`;
                if (addedCount > 0) {
                    toastSuccess(`Added ${addedCount} device(s)${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`);
                }
                else if (skippedCount > 0) {
                    toastWarning(`No new devices were added (${skippedCount} skipped)`);
                }
                status.classList.remove('error');
                list.style.display = 'none';
                // Sync parent Homebridge form cache and auto-save to prevent cache overwrite
                // Run sync when discovery returned devices (even if backend response shape changes)
                if (discoveredDevices.length > 0) {
                    const synced = await syncParentPluginConfigFromDisk(true);
                    status.textContent += synced
                        ? ' - Config saved automatically.'
                        : ' - Warning: config may not persist until you close/reopen settings.';
                    if (synced) {
                        toastSuccess('Configuration synced and saved automatically');
                    }
                    else {
                        toastWarning('Configuration sync failed; close and reopen settings before Save');
                    }
                }
            }
            catch (e) {
                uiLog.error('Bulk add error:', e);
                status.textContent = `✗ Error: ${e instanceof Error ? e.message : 'Failed to add devices'}`;
                status.classList.add('error');
                toastError(e instanceof Error ? e.message : 'Failed to add devices');
            }
            // Refresh the configured devices list
            await loadConfiguredDevices();
            return;
        }
        await ensureDiscoveryControls();
        await updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
        setDiscoveryCache(discoveredDevices);
        updateLastScannedStatus();
    }
    catch (e) {
        uiLog.error('Discovery error:', e);
        status.textContent = `Error: ${e instanceof Error ? e.message : 'Discovery failed'}`;
        status.classList.add('error');
        toastError(e instanceof Error ? e.message : 'Discovery failed');
        list.style.display = 'none';
    }
    finally {
        clearInterval(progressTimer);
        hideBusyUi();
        if (phaseProgress) {
            phaseProgress.style.display = 'none';
        }
        if (phaseFill) {
            phaseFill.style.width = '0%';
        }
        if (phaseLabel) {
            phaseLabel.textContent = '';
        }
        const devicesFoundDisplay = document.getElementById('discoverDevicesFound');
        if (devicesFoundDisplay) {
            devicesFoundDisplay.style.display = 'none';
            devicesFoundDisplay.classList.remove('discovery-scanning-pulse');
        }
        btn.disabled = false;
        btn.textContent = '🔍 Discover Devices';
    }
}
/**
 * Update discovery list with filtered and sorted devices
 */
async function updateDiscoveryView(allDevices, preferences, groupBy, hideAdded, selectedIds) {
    // Compute visibleDevices based on filters and preferences
    console.warn('[SwitchBot][Discovery] updateDiscoveryView: allDevices', allDevices);
    const visibleDevices = allDevices
        .filter((d) => {
        // Hide already added devices if hideAdded is true
        if (hideAdded && d.added) {
            return false;
        }
        // Additional filtering logic can be added here based on preferences
        return true;
    });
    console.warn('[SwitchBot][Discovery] visibleDevices after filter:', visibleDevices);
    // Optionally sort devices if needed (sortDevices is imported but not used)
    // .sort((a, b) => a.name.localeCompare(b.name))
    // Set of already added device IDs
    const configuredIds = new Set(allDevices.filter(d => d.added).map(d => normalizeId(d.id)));
    // Batch import controls and selection logic are handled later in the file. Removed broken/duplicated code.
    const getConnectionGroup = (device) => {
        if (device?.isIR) {
            return 'IR';
        }
        const connectionType = String(device?.connectionType || '').toLowerCase();
        if (connectionType.includes('both')) {
            return 'Both';
        }
        if (connectionType.includes('ble')) {
            return 'BLE';
        }
        if (connectionType.includes('api')) {
            return 'OpenAPI';
        }
        return 'Unknown';
    };
    const getHubGroup = (device) => {
        const hub = String(device?.hubDeviceId || '').trim();
        return hub ? `Hub ${hub}` : 'No Hub';
    };
    const getTypeGroup = (device) => {
        const type = String(device?.type || '').trim();
        return type || 'Unknown Type';
    };
    const groupedDevices = new Map();
    for (const d of visibleDevices) {
        let group = getConnectionGroup(d);
        if (groupBy === 'hub') {
            group = getHubGroup(d);
        }
        else if (groupBy === 'type') {
            group = getTypeGroup(d);
        }
        const groupDevices = groupedDevices.get(group) || [];
        groupDevices.push(d);
        groupedDevices.set(group, groupDevices);
    }
    console.warn('[SwitchBot][Discovery] groupedDevices:', groupedDevices);
    let orderedGroups = [];
    if (groupBy === 'hub') {
        const hubGroups = [...groupedDevices.keys()].filter(group => group !== 'No Hub').sort((a, b) => a.localeCompare(b));
        orderedGroups = groupedDevices.has('No Hub') ? [...hubGroups, 'No Hub'] : hubGroups;
    }
    else if (groupBy === 'type') {
        const typeGroups = [...groupedDevices.keys()].filter(group => group !== 'Unknown Type').sort((a, b) => a.localeCompare(b));
        orderedGroups = groupedDevices.has('Unknown Type') ? [...typeGroups, 'Unknown Type'] : typeGroups;
    }
    else {
        const groupOrder = ['Both', 'BLE', 'OpenAPI', 'IR', 'Unknown'];
        orderedGroups = groupOrder.filter(group => groupedDevices.has(group));
    }
    const container = document.createElement('div');
    container.id = 'discoveredDevices';
    container.className = 'discovery-groups';
    console.warn('[SwitchBot][Discovery] Rendering device groups:', orderedGroups);
    if (!visibleDevices.length) {
        const empty = document.createElement('div');
        empty.className = 'discovery-group-empty';
        empty.textContent = hideAdded
            ? 'No devices match current filters (or all are already added).'
            : 'No devices match current filters.';
        container.appendChild(empty);
        console.warn('[SwitchBot][Discovery] No visible devices after filtering.');
    }
    else {
        for (const groupName of orderedGroups) {
            const groupItems = groupedDevices.get(groupName);
            if (!groupItems?.length) {
                continue;
            }
            console.warn(`[SwitchBot][Discovery] Rendering group: ${groupName}`, groupItems);
            // ...existing code...
            const groupSection = document.createElement('section');
            groupSection.className = 'discovery-group';
            const groupStorageKey = `${groupBy}:${groupName}`;
            let expanded = isDiscoveryGroupExpanded(groupStorageKey);
            const groupHeader = document.createElement('button');
            groupHeader.className = 'discovery-group-header-btn';
            groupHeader.type = 'button';
            const setGroupHeaderText = () => {
                const marker = expanded ? '▾' : '▸';
                groupHeader.textContent = `${marker} ${groupName} (${groupItems.length})`;
            };
            setGroupHeaderText();
            groupSection.appendChild(groupHeader);
            const groupList = await renderDiscoveredDevices(groupItems, {
                configuredIds,
                selectedIds,
                onToggleSelect: (device, selected) => {
                    const id = normalizeId(device.id);
                    if (selected) {
                        selectedIds.add(id);
                    }
                    else {
                        selectedIds.delete(id);
                    }
                    // Update Add Selected button state
                    const btn = document.querySelector('button')?.parentElement?.querySelector('button');
                    if (btn && btn.textContent?.includes('Add Selected')) {
                        btn.disabled = selectedIds.size === 0;
                    }
                },
            });
            if (!expanded) {
                groupList.style.display = 'none';
            }
            groupHeader.onclick = () => {
                expanded = !expanded;
                setDiscoveryGroupExpanded(groupStorageKey, expanded);
                setGroupHeaderText();
                groupList.style.display = expanded ? 'grid' : 'none';
            };
            groupSection.appendChild(groupList);
            container.appendChild(groupSection);
        }
    }
    // Replace or append the rendered list
    const existingList = document.getElementById('discoveredDevices');
    container.id = 'discoveredDevices';
    if (existingList && existingList.parentNode) {
        existingList.replaceWith(container);
    }
    else {
        // Fallback: append to discovery list container
        const listContainer = document.getElementById('discoveredList');
        if (listContainer) {
            listContainer.appendChild(container);
        }
        else {
            console.error('[SwitchBot][Discovery] render: discoveredList container not found in DOM (fallback)');
            toastError('Discovery UI error: device list container missing. Please reload the page.');
        }
    }
    // Only update the enabled/disabled state of batch action buttons (created in ensureDiscoveryControls)
    function updateBatchButtonStates() {
        // These buttons are created in ensureDiscoveryControls and should have unique IDs
        const addSelectedBtn = document.getElementById('addSelectedBtn');
        const enableSelectedBtn = document.getElementById('enableSelectedBtn');
        const disableSelectedBtn = document.getElementById('disableSelectedBtn');
        const hasSelection = selectedIds.size > 0;
        if (addSelectedBtn) {
            addSelectedBtn.disabled = !hasSelection;
        }
        if (enableSelectedBtn) {
            enableSelectedBtn.disabled = !hasSelection;
        }
        if (disableSelectedBtn) {
            disableSelectedBtn.disabled = !hasSelection;
        }
    }
    window.removeEventListener('discovery-selection-changed', updateBatchButtonStates);
    window.addEventListener('discovery-selection-changed', updateBatchButtonStates);
    // Initial state update
    updateBatchButtonStates();
    // Update status with count
    const status = document.getElementById('discoverStatus');
    if (status) {
        const totalCount = allDevices.length;
        const filteredCount = visibleDevices.length;
        status.textContent = filteredCount === totalCount
            ? `Found ${totalCount} device(s)`
            : `Showing ${filteredCount} of ${totalCount} device(s)`;
    }
}
export async function addDeviceToConfig(device) {
    const { addDeviceToConfig: addDevice } = await import('./devices.js');
    await addDevice(device);
}
//# sourceMappingURL=discovery.js.map