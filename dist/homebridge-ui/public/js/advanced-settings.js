"use strict";
// advanced-settings.ts
// Handles loading and saving global OpenAPI polling/rate config in the Advanced Settings card
async function loadAdvancedSettings() {
    try {
        if (typeof homebridge.getPluginConfig !== 'function') {
            document.getElementById('advancedSettingsStatus').textContent = 'Homebridge UI API not available.';
            return;
        }
        const pluginConfigBlocks = await homebridge.getPluginConfig();
        if (!Array.isArray(pluginConfigBlocks) || !pluginConfigBlocks.length) {
            return;
        }
        const config = pluginConfigBlocks.find(c => (c.platform || c.name || '').toLowerCase().includes('switchbot'));
        if (!config) {
            return;
        }
        document.getElementById('openApiRefreshRate').value = String(config.openApiRefreshRate ?? 300);
        document.getElementById('matterBatchEnabled').checked = config.matterBatchEnabled !== false;
        document.getElementById('matterBatchRefreshRate').value = String(config.matterBatchRefreshRate ?? 300);
        document.getElementById('dailyApiLimit').value = String(config.dailyApiLimit ?? 10000);
        document.getElementById('dailyApiReserveForCommands').value = String(config.dailyApiReserveForCommands ?? 1000);
        document.getElementById('dailyApiResetLocalMidnight').checked = !!config.dailyApiResetLocalMidnight;
        document.getElementById('webhookOnlyOnReserve').checked = !!config.webhookOnlyOnReserve;
        document.getElementById('matterBatchConcurrency').value = String(config.matterBatchConcurrency ?? 5);
        document.getElementById('matterBatchJitter').value = String(config.matterBatchJitter ?? 0);
        document.getElementById('enableMatter').checked = !!config.enableMatter;
        document.getElementById('preferMatter').checked = !!config.preferMatter;
        document.getElementById('enableBLE').checked = config.enableBLE !== false;
        document.getElementById('blePollingEnabled').checked = config.blePollingEnabled !== false;
        document.getElementById('blePollIntervalMs').value = String(config.blePollIntervalMs ?? 600000);
    }
    catch (e) {
        document.getElementById('advancedSettingsStatus').textContent = 'Failed to load settings.';
    }
}
async function saveAdvancedSettings() {
    const status = document.getElementById('advancedSettingsStatus');
    status.textContent = 'Saving...';
    try {
        if (typeof homebridge.getPluginConfig !== 'function') {
            throw new TypeError('homebridge.getPluginConfig is not available');
        }
        // Get the full plugin config array
        const pluginConfigBlocks = await homebridge.getPluginConfig();
        if (!Array.isArray(pluginConfigBlocks) || !pluginConfigBlocks.length) {
            throw new Error('No plugin config blocks returned from Homebridge');
        }
        // Find the SwitchBot config block
        const idx = pluginConfigBlocks.findIndex(c => (c.platform || c.name || '').toLowerCase().includes('switchbot'));
        if (idx === -1) {
            throw new Error('SwitchBot config not found');
        }
        const config = pluginConfigBlocks[idx];
        // Update config values from UI
        config.openApiRefreshRate = Number(document.getElementById('openApiRefreshRate').value) || 300;
        config.matterBatchEnabled = document.getElementById('matterBatchEnabled').checked;
        config.matterBatchRefreshRate = Number(document.getElementById('matterBatchRefreshRate').value) || 300;
        config.dailyApiLimit = Number(document.getElementById('dailyApiLimit').value) || 10000;
        config.dailyApiReserveForCommands = Number(document.getElementById('dailyApiReserveForCommands').value) || 1000;
        config.dailyApiResetLocalMidnight = document.getElementById('dailyApiResetLocalMidnight').checked;
        config.webhookOnlyOnReserve = document.getElementById('webhookOnlyOnReserve').checked;
        config.matterBatchConcurrency = Number(document.getElementById('matterBatchConcurrency').value) || 5;
        config.matterBatchJitter = Number(document.getElementById('matterBatchJitter').value) || 0;
        config.enableMatter = document.getElementById('enableMatter').checked;
        config.preferMatter = document.getElementById('preferMatter').checked;
        config.enableBLE = document.getElementById('enableBLE').checked;
        config.blePollingEnabled = document.getElementById('blePollingEnabled').checked;
        config.blePollIntervalMs = Number(document.getElementById('blePollIntervalMs').value) || 600000;
        // Update config in memory and save to disk
        if (typeof homebridge.updatePluginConfig === 'function') {
            await homebridge.updatePluginConfig(pluginConfigBlocks);
        }
        else {
            throw new TypeError('homebridge.updatePluginConfig is not available');
        }
        if (typeof homebridge.savePluginConfig === 'function') {
            await homebridge.savePluginConfig();
        }
        status.textContent = 'Settings saved!';
    }
    catch (e) {
        status.textContent = `Failed to save: ${e && e.message ? e.message : e}`;
    }
}
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('advancedSettingsCard')) {
        loadAdvancedSettings();
        const btn = document.getElementById('saveAdvancedSettingsBtn');
        if (btn) {
            btn.onclick = saveAdvancedSettings;
        }
    }
});
//# sourceMappingURL=advanced-settings.js.map