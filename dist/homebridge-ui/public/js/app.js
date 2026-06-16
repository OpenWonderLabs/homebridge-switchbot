var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/homebridge-ui/public/js/logger.ts
var PREFIX, uiLog;
var init_logger = __esm({
  "src/homebridge-ui/public/js/logger.ts"() {
    "use strict";
    PREFIX = "[SwitchBot UI/html]";
    uiLog = {
      info: (message, ...parameters) => {
        console.log(PREFIX, message, ...parameters);
      },
      warn: (message, ...parameters) => {
        console.warn(PREFIX, message, ...parameters);
      },
      error: (message, ...parameters) => {
        console.error(PREFIX, message, ...parameters);
      },
      debug: (message, ...parameters) => {
        console.debug(PREFIX, message, ...parameters);
      }
    };
  }
});

// src/homebridge-ui/public/js/types.ts
var init_types = __esm({
  "src/homebridge-ui/public/js/types.ts"() {
    "use strict";
  }
});

// src/homebridge-ui/public/js/modal.ts
function callUiMethod(name, ...args) {
  try {
    if (typeof homebridge?.[name] === "function") {
      uiLog.info(`[callUiMethod] Invoking homebridge.${String(name)}()`);
      const fn = homebridge?.[name];
      if (typeof fn === "function") {
        uiLog.info(`[callUiMethod] Invoking homebridge.${String(name)}()`);
        fn.apply(homebridge, args);
      } else {
        uiLog.warn(`[callUiMethod] homebridge[${String(name)}] is not a function.`);
      }
    } else {
      uiLog.warn(`[callUiMethod] homebridge[${String(name)}] is not a function.`);
    }
  } catch (e) {
    uiLog.warn(`Homebridge UI method ${String(name)} failed:`, e);
  }
}
function showBusyUi() {
  callUiMethod("disableSaveButton");
  callUiMethod("showSpinner");
}
function hideBusyUi() {
  callUiMethod("hideSpinner");
  callUiMethod("enableSaveButton");
}
var init_modal = __esm({
  "src/homebridge-ui/public/js/modal.ts"() {
    "use strict";
    init_types();
    init_logger();
  }
});

// src/homebridge-ui/public/js/toast.ts
function showToast(method, message, title = "SwitchBot") {
  try {
    const hb = typeof window !== "undefined" ? window.homebridge : void 0;
    const toast = hb && typeof hb.toast === "object" ? hb.toast : void 0;
    if (toast && typeof toast[method] === "function") {
      try {
        toast[method](message, title);
        return;
      } catch (err) {
        uiLog.warn(`Toast ${method} threw:`, err);
      }
    }
    uiLog.info(`[Toast:${method}] ${title} - ${message}`);
  } catch (e) {
    uiLog.warn(`Toast ${method} outer error:`, e);
    uiLog.info(`[Toast:${method}] ${title} - ${message}`);
  }
}
function toastSuccess(message, title) {
  showToast("success", message, title);
}
function toastError(message, title) {
  showToast("error", message, title);
}
function toastWarning(message, title) {
  showToast("warning", message, title);
}
function toastInfo(message, title) {
  showToast("info", message, title);
}
var init_toast = __esm({
  "src/homebridge-ui/public/js/toast.ts"() {
    "use strict";
    init_types();
    init_logger();
  }
});

// src/device-types.js
function getValidDeviceTypes() {
  const validTypes = /* @__PURE__ */ new Set();
  for (const category of Object.values(DEVICE_TYPES)) {
    for (const type of category) {
      validTypes.add(type);
    }
  }
  return validTypes;
}
function normalizeDeviceType(deviceType) {
  if (!deviceType || typeof deviceType !== "string") {
    return null;
  }
  const trimmed = deviceType.trim();
  const lowercase = trimmed.toLowerCase();
  const validTypes = getValidDeviceTypes();
  if (validTypes.has(trimmed)) {
    return trimmed;
  }
  const normalized = DEVICE_TYPE_NORMALIZATION_MAP[lowercase];
  if (normalized && validTypes.has(normalized)) {
    return normalized;
  }
  return null;
}
function isValidDeviceType(deviceType) {
  if (!deviceType || typeof deviceType !== "string") {
    return false;
  }
  const validTypes = getValidDeviceTypes();
  return validTypes.has(deviceType.trim());
}
var DEVICE_TYPES, DEVICE_TYPE_NORMALIZATION_MAP;
var init_device_types = __esm({
  "src/device-types.js"() {
    "use strict";
    DEVICE_TYPES = {
      "Window Coverings": ["Blind Tilt", "Curtain", "Curtain3", "Roller Shade"],
      "Locks & Access": [
        "Keypad",
        "Keypad Touch",
        "Keypad Vision",
        "Keypad Vision Pro",
        "Lock Vision Pro",
        "Lock Lite",
        "Smart Lock",
        "Smart Lock Pro",
        "Smart Lock Ultra",
        "Video Doorbell"
      ],
      "Sensors": ["Contact Sensor", "Motion Sensor", "Presence Sensor", "Water Detector"],
      "Lighting": [
        "Candle Warmer Lamp",
        "Ceiling Light",
        "Ceiling Light Pro",
        "Color Bulb",
        "Floor Lamp",
        "RGBIC Neon Rope Light",
        "RGBIC Neon Wire Rope Light",
        "RGBICWW Floor Lamp",
        "RGBICWW Strip Light",
        "Strip Light",
        "Strip Light 3"
      ],
      "Climate Control": [
        "Air Purifier PM2.5",
        "Air Purifier Table PM2.5",
        "Air Purifier VOC",
        "Air Purifier Table VOC",
        "Battery Circulator Fan",
        "Circulator Fan",
        "Humidifier",
        "Humidifier2",
        "Meter",
        "MeterPlus",
        "Meter Plus",
        "MeterPro",
        "Meter Pro",
        "MeterPro(CO2)",
        "Meter Pro (CO2)",
        "Smart Radiator Thermostat",
        "Standing Circulator Fan",
        "WoIOSensor"
      ],
      "Plugs & Switches": [
        "Garage Door Opener",
        "Plug",
        "Plug Mini (EU)",
        "Plug Mini (JP)",
        "Plug Mini (US)",
        "Relay Switch 1",
        "Relay Switch 1PM",
        "Relay Switch 2PM"
      ],
      "Robot Vacuums": [
        "K10+",
        "K10+ Pro",
        "Robot Vacuum Cleaner K10+ Pro Combo",
        "Robot Vacuum Cleaner K11+",
        "Robot Vacuum Cleaner K20 Plus Pro",
        "Robot Vacuum Cleaner S1",
        "Robot Vacuum Cleaner S1 Plus",
        "Robot Vacuum Cleaner S10",
        "Robot Vacuum Cleaner S20"
      ],
      "Hubs": ["AI Hub", "Hub", "Hub 2", "Hub 3", "Hub Mini", "Hub Plus"],
      "Cameras": [
        "Indoor Cam",
        "Pan/Tilt Cam",
        "Pan/Tilt Cam 2K",
        "Pan/Tilt Cam Plus 2K",
        "Pan/Tilt Cam Plus 3K"
      ],
      "IR Devices": [
        "Air Conditioner",
        "Air Purifier",
        "Camera",
        "DVD",
        "Fan",
        "Light",
        "Others",
        "Projector",
        "Set Top Box",
        "Speaker",
        "Streamer",
        "TV",
        "Vacuum Cleaner",
        "Water Heater"
      ],
      "Other Devices": ["AI Art Frame", "Bot", "Home Climate Panel", "Remote", "remote with screen"]
    };
    DEVICE_TYPE_NORMALIZATION_MAP = {
      // --- node-switchbot v4 normalization additions ---
      "hub mini": "Hub Mini",
      "hub 3": "Hub 3",
      "keypad": "Keypad",
      "plug mini": "Plug Mini (US)",
      // fallback to US if region not specified
      "art frame": "AI Art Frame",
      "rgbicww": "RGBICWW Strip Light",
      "lock vision": "Lock Vision Pro",
      // alias for new lock vision
      "lock pro": "Smart Lock Pro",
      "lock lite": "Lock Lite",
      "circulator fan": "Circulator Fan",
      "smart thermostat radiator": "Smart Radiator Thermostat",
      "climate panel": "Home Climate Panel",
      "evaporative humidifier": "Humidifier",
      // --- end node-switchbot v4 additions ---
      // Only keep the last occurrence for each key, all values canonical
      "air purifier pm2.5": "Air Purifier PM2.5",
      "pan/tilt cam plus 3k": "Pan/Tilt Cam Plus 3K",
      "remote with screen": "Remote with Screen",
      "ai hub": "AI Hub",
      "water detector": "Water Detector",
      "video doorbell": "Video Doorbell",
      "smart radiator thermostat": "Smart Radiator Thermostat",
      "woiosensor": "WoIOSensor",
      "garage door opener": "Garage Door Opener",
      "air purifier table pm2.5": "Air Purifier Table PM2.5",
      "air purifier voc": "Air Purifier VOC",
      "air purifier table voc": "Air Purifier Table VOC",
      "plug mini (eu)": "Plug Mini (EU)",
      // Only last occurrence for each key is kept above. Removed duplicates here.
      // Climate control conversions
      "humidifier2": "Humidifier2",
      "battery circulator fan": "Battery Circulator Fan",
      "standing circulator fan": "Standing Circulator Fan",
      // Lock/keypad conversions
      "smart lock": "Smart Lock",
      "smart lock pro": "Smart Lock Pro",
      "smart lock ultra": "Smart Lock Ultra",
      "keypad touch": "Keypad Touch",
      "keypad vision": "Keypad Vision",
      "keypad vision pro": "Keypad Vision Pro",
      // Light conversions
      "color bulb": "Color Bulb",
      "ceiling light": "Ceiling Light",
      "ceiling light pro": "Ceiling Light Pro",
      "candle warmer lamp": "Candle Warmer Lamp",
      "floor lamp": "Floor Lamp",
      "rgbic neon rope light": "RGBIC Neon Rope Light",
      "rgbic neon wire rope light": "RGBIC Neon Wire Rope Light",
      "rgbicww floor lamp": "RGBICWW Floor Lamp",
      "rgbicww strip light": "RGBICWW Strip Light",
      "strip light": "Strip Light",
      "strip light 3": "Strip Light 3",
      // Vacuum conversions
      "robot vacuum cleaner s1": "Robot Vacuum Cleaner S1",
      "robot vacuum cleaner s1 plus": "Robot Vacuum Cleaner S1 Plus",
      "robot vacuum cleaner s10": "Robot Vacuum Cleaner S10",
      "robot vacuum cleaner s20": "Robot Vacuum Cleaner S20",
      "robot vacuum cleaner k10+ pro combo": "Robot Vacuum Cleaner K10+ Pro Combo",
      "robot vacuum cleaner k11+": "Robot Vacuum Cleaner K11+",
      "robot vacuum cleaner k20 plus pro": "Robot Vacuum Cleaner K20 Plus Pro",
      // Exact device type mappings (API format → canonical format)
      "relay switch 1": "Relay Switch 1",
      "blind tilt": "Blind Tilt",
      "roller shade": "Roller Shade",
      "curtain3": "Curtain3",
      "hub 2": "Hub 2",
      "meterplus": "MeterPlus",
      "meterpro": "MeterPro",
      "meterpro(co2)": "MeterPro(CO2)",
      "walletfinder": "WalletFinder",
      "k10+": "K10+",
      "k10+ pro (wosweeperminipro)": "K10+ Pro (wosweeperminipro)",
      // Handle spaced variants from config files (normalize back to canonical type)
      "meter pro": "Meter Pro",
      "meter pro (co2)": "Meter Pro (CO2)",
      "meter plus": "Meter Plus",
      "relay switch 1 pm": "Relay Switch 1PM",
      "relay switch 2 pm": "Relay Switch 2PM",
      "plug mini eu": "Plug Mini (EU)",
      "plug mini jp": "Plug Mini (JP)",
      "plug mini us": "Plug Mini (US)",
      // Migration mappings for invalid/legacy device types
      "lock vision pro": "Lock Vision Pro",
      // Valid alias; map to canonical
      // 'lock vision': 'Keypad Vision', // Invalid type (removed, now alias above)
      "lock touch": "Keypad Touch",
      // Invalid type
      // Additional normalization for new/unknown types from logs
      "woplugus": "Plug Mini (US)"
      // Removed duplicate keys below, only last occurrence kept
      // 'plug mini us': 'plug mini (us)', // duplicate, removed
      // 'plug us': 'plug mini (us)', // duplicate, removed
      // 'plug': 'plug', // duplicate, removed
      // 'air purifier pm2.5': 'air purifier pm2.5', // duplicate, removed
      // 'rgbic neon wire rope light': 'rgbic neon wire rope light', // duplicate, removed
      // 'candle warmer lamp': 'candle warmer lamp', // duplicate, removed
      // 'pan/tilt cam plus 3k': 'pan/tilt cam plus 3k', // duplicate, removed
      // 'remote with screen': 'remote with screen', // duplicate, removed
      // 'ai hub': 'ai hub', // duplicate, removed
      // 'lock vision pro': 'lock vision pro', // duplicate, remove this line
      // Add any other device types from logs as needed
    };
  }
});

// src/homebridge-ui/public/js/api.ts
var api_exports = {};
__export(api_exports, {
  addDevice: () => addDevice,
  addDevicesInBulk: () => addDevicesInBulk,
  deleteAllDevices: () => deleteAllDevices,
  deleteDevice: () => deleteDevice,
  discoverDevices: () => discoverDevices,
  fetchBluetoothStatus: () => fetchBluetoothStatus,
  fetchCredentialStatus: () => fetchCredentialStatus,
  fetchDevices: () => fetchDevices,
  normalizeBulkAddDevicesResponse: () => normalizeBulkAddDevicesResponse,
  saveCredentials: () => saveCredentials2,
  syncParentPluginConfigFromDisk: () => syncParentPluginConfigFromDisk,
  testDeviceConnection: () => testDeviceConnection,
  updateDevice: () => updateDevice,
  validateAndFixDeviceTypes: () => validateAndFixDeviceTypes
});
async function fetchDevices() {
  try {
    if (typeof homebridge.getPluginConfig !== "function") {
      throw new TypeError("Homebridge UI API not available");
    }
    const configArr = await homebridge.getPluginConfig();
    const config = Array.isArray(configArr) && configArr.length > 0 ? configArr.find(isSwitchBotPlatformConfig) : null;
    if (!config || !Array.isArray(config.devices)) {
      return [];
    }
    return config.devices;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    uiLog.error("Error fetching devices:", msg);
    return [];
  }
}
function validateAndFixDeviceTypes(devices) {
  const errors = [];
  for (const d of devices) {
    if (!isValidDeviceType(d.configDeviceType)) {
      const fixed = normalizeDeviceType(d.configDeviceType);
      if (fixed) {
        d.configDeviceType = fixed;
      } else {
        errors.push({
          deviceId: d.deviceId,
          name: d.configDeviceName,
          type: d.configDeviceType
        });
      }
    }
  }
  return errors;
}
function isSwitchBotPlatformConfig(block) {
  const platformName = String(block?.platform || block?.name || "").toLowerCase();
  return platformName === "switchbot" || platformName === "@switchbot/homebridge-switchbot" || platformName.includes("switchbot");
}
async function syncParentPluginConfigFromDisk(autoSave = false) {
  try {
    if (typeof homebridge.getPluginConfig !== "function" || typeof homebridge.updatePluginConfig !== "function") {
      uiLog.warn("Parent config sync API not available");
      return false;
    }
    const pluginConfigBlocks = await homebridge.getPluginConfig();
    if (!Array.isArray(pluginConfigBlocks) || !pluginConfigBlocks.length) {
      uiLog.warn("No plugin config blocks returned from Homebridge");
      return false;
    }
    const index = pluginConfigBlocks.findIndex((block) => isSwitchBotPlatformConfig(block));
    if (index < 0) {
      uiLog.warn("SwitchBot platform block not found in Homebridge plugin config");
      return false;
    }
    const errors = validateAndFixDeviceTypes(pluginConfigBlocks[index].devices || []);
    if (errors.length > 0) {
      toastError(`Invalid device types found: ${errors.map((e) => `${e.name} (${e.type})`).join(", ")}`);
      return false;
    }
    await homebridge.updatePluginConfig(pluginConfigBlocks);
    if (autoSave && typeof homebridge.savePluginConfig === "function") {
      uiLog.info("Auto-saving config to disk...");
      await homebridge.savePluginConfig();
      uiLog.info("Config saved successfully");
    }
    return true;
  } catch (e) {
    uiLog.warn("Failed to sync parent plugin config cache:", e);
    return false;
  }
}
async function fetchCredentialStatus() {
  try {
    const resp = await homebridge.request("/credentials", {});
    uiLog.info("Load credentials response:", resp);
    if (!resp || resp.success === false) {
      uiLog.error("Failed to load credentials:", resp);
      return null;
    }
    return resp.data || {};
  } catch (e) {
    uiLog.error("Error loading credentials:", e);
    return null;
  }
}
async function saveCredentials2(token, secret) {
  uiLog.info("Saving credentials...");
  const resp = await homebridge.request("/credentials", { token, secret });
  uiLog.info("Save response:", resp);
  if (!resp || resp.success === false) {
    throw new Error(resp?.message || "Save failed");
  }
  return resp.data || resp;
}
async function discoverDevices(mode = "all", options) {
  const resp = await homebridge.request("/discover", { mode, ...options });
  uiLog.info("Discover response:", resp);
  if (!resp || resp.success === false) {
    throw new Error(resp?.data?.message || "Discovery failed");
  }
  return resp.data || [];
}
async function fetchBluetoothStatus() {
  try {
    const resp = await homebridge.request("/ble-status", {});
    if (!resp || resp.success === false) {
      return { available: false, message: "Bluetooth status unavailable" };
    }
    return resp.data || { available: false, message: "Bluetooth status unavailable" };
  } catch (_e) {
    return { available: false, message: "Bluetooth status unavailable" };
  }
}
async function testDeviceConnection(payload) {
  const resp = await homebridge.request("/test-connection", payload);
  if (!resp || resp.success === false) {
    throw new Error(resp?.data?.message || "Connection test failed");
  }
  return resp.data || {
    success: false,
    deviceId: payload.deviceId,
    method: "Auto",
    latencyMs: 0,
    message: "Connection test failed"
  };
}
async function addDevice(deviceId, name, type, options) {
  if (typeof homebridge.getPluginConfig !== "function" || typeof homebridge.updatePluginConfig !== "function") {
    throw new TypeError("Homebridge UI API not available");
  }
  const configArr = await homebridge.getPluginConfig();
  const idx = Array.isArray(configArr) ? configArr.findIndex(isSwitchBotPlatformConfig) : -1;
  if (idx === -1) {
    throw new Error("SwitchBot config not found");
  }
  const config = configArr[idx];
  if (!Array.isArray(config.devices)) {
    config.devices = [];
  }
  const normalizedDeviceId = String(deviceId).trim().toLowerCase();
  const exists = config.devices.some((d) => String(d.deviceId ?? d.id ?? "").trim().toLowerCase() === normalizedDeviceId);
  if (exists) {
    return { alreadyExists: true, message: "Device already in config" };
  }
  const newDevice = { deviceId, configDeviceName: name, configDeviceType: type };
  if (options?.address) {
    newDevice.address = options.address;
  }
  if (options?.model) {
    newDevice.model = options.model;
  }
  if (options?.rssi !== void 0 && options?.rssi !== null && options?.rssi !== 0) {
    newDevice.rssi = options.rssi;
  }
  if (options?.encryptionKey) {
    newDevice.encryptionKey = options.encryptionKey;
  }
  if (options?.keyId) {
    newDevice.keyId = options.keyId;
  }
  config.devices.push(newDevice);
  await homebridge.updatePluginConfig(configArr);
  if (typeof homebridge.savePluginConfig === "function") {
    await homebridge.savePluginConfig();
  }
  return { added: true, message: `Device "${name}" added successfully` };
}
async function addDevicesInBulk(devices) {
  const resp = await homebridge.request("/add-devices", { devices });
  uiLog.info("Bulk add response:", resp);
  if (!resp || resp.success === false) {
    throw new Error(resp?.data?.message || "Bulk add failed");
  }
  return normalizeBulkAddDevicesResponse(resp);
}
function normalizeBulkAddDevicesResponse(resp) {
  const payload = resp?.data && typeof resp.data === "object" ? resp.data : resp;
  const addedCount = Number(payload?.addedCount ?? payload?.added ?? 0);
  const skippedCount = Number(payload?.skippedCount ?? payload?.skipped ?? 0);
  const updatedCount = Number(payload?.updatedCount ?? payload?.updated ?? 0);
  return {
    ...payload,
    success: resp?.success ?? true,
    addedCount,
    skippedCount,
    updatedCount
  };
}
async function updateDevice(deviceId, configDeviceName, configDeviceType, options) {
  if (typeof homebridge.getPluginConfig !== "function" || typeof homebridge.updatePluginConfig !== "function") {
    throw new TypeError("Homebridge UI API not available");
  }
  const configArr = await homebridge.getPluginConfig();
  const idx = Array.isArray(configArr) ? configArr.findIndex(isSwitchBotPlatformConfig) : -1;
  if (idx === -1) {
    throw new Error("SwitchBot config not found");
  }
  const config = configArr[idx];
  if (!Array.isArray(config.devices)) {
    throw new TypeError("No devices array in config");
  }
  const normalizedDeviceId = String(deviceId).trim().toLowerCase();
  const device = config.devices.find((d) => String(d.deviceId ?? d.id ?? "").trim().toLowerCase() === normalizedDeviceId);
  if (!device) {
    throw new Error("Device not found in config");
  }
  if (configDeviceName) {
    device.configDeviceName = configDeviceName;
  }
  if (configDeviceType) {
    device.configDeviceType = configDeviceType;
  }
  if (options) {
    Object.assign(device, options);
  }
  await homebridge.updatePluginConfig(configArr);
  if (typeof homebridge.savePluginConfig === "function") {
    await homebridge.savePluginConfig();
  }
  return { updated: true, message: `Device updated successfully` };
}
async function deleteDevice(deviceId) {
  if (typeof homebridge.getPluginConfig !== "function" || typeof homebridge.updatePluginConfig !== "function") {
    throw new TypeError("Homebridge UI API not available");
  }
  const configArr = await homebridge.getPluginConfig();
  const idx = Array.isArray(configArr) ? configArr.findIndex(isSwitchBotPlatformConfig) : -1;
  if (idx === -1) {
    throw new Error("SwitchBot config not found");
  }
  const config = configArr[idx];
  if (!Array.isArray(config.devices)) {
    throw new TypeError("No devices array in config");
  }
  const normalizedDeviceId = String(deviceId).trim().toLowerCase();
  const before = config.devices.length;
  config.devices = config.devices.filter((d) => String(d.deviceId ?? d.id ?? "").trim().toLowerCase() !== normalizedDeviceId);
  config.devices = config.devices.filter((d) => d && typeof d === "object" && d.deviceId && d.configDeviceType);
  if (config.devices.length === before) {
    throw new Error("Device not found in config");
  }
  await homebridge.updatePluginConfig(configArr);
  if (typeof homebridge.savePluginConfig === "function") {
    await homebridge.savePluginConfig();
  }
  return { deleted: true, message: `Device removed from config` };
}
async function deleteAllDevices() {
  if (typeof homebridge.getPluginConfig !== "function" || typeof homebridge.updatePluginConfig !== "function") {
    throw new TypeError("Homebridge UI API not available");
  }
  const configArr = await homebridge.getPluginConfig();
  let idx = Array.isArray(configArr) ? configArr.findIndex(isSwitchBotPlatformConfig) : -1;
  if (idx === -1) {
    const newBlock = { platform: "SwitchBot", devices: [] };
    configArr.push(newBlock);
    idx = configArr.length - 1;
  }
  const config = configArr[idx];
  if (!Array.isArray(config.devices)) {
    config.devices = [];
  }
  const deletedCount = config.devices.length;
  config.devices = [];
  if (!config.platform) {
    config.platform = "SwitchBot";
  }
  if (!config.name) {
    config.name = "SwitchBot";
  }
  await homebridge.updatePluginConfig(configArr);
  if (typeof homebridge.savePluginConfig === "function") {
    await homebridge.savePluginConfig();
  }
  return { deleted: true, deletedCount, message: `Removed ${deletedCount} device(s) from config` };
}
var init_api = __esm({
  "src/homebridge-ui/public/js/api.ts"() {
    "use strict";
    init_device_types();
    init_types();
    init_logger();
    init_toast();
  }
});

// src/homebridge-ui/public/js/discovery.ts
var discovery_exports = {};
__export(discovery_exports, {
  addDeviceToConfig: () => addDeviceToConfig,
  discoverDevices: () => discoverDevices2,
  initializeDiscoverySettings: () => initializeDiscoverySettings
});
function normalizeId(value) {
  return String(value ?? "").trim().toLowerCase();
}
function dedupeById(devices) {
  return devices.filter((d, index, arr) => !!d?.id && arr.findIndex((x) => x?.id === d.id) === index);
}
function mergeDiscoveredDevices(existingDevices, incomingDevices) {
  const deviceMap = /* @__PURE__ */ new Map();
  for (const d of dedupeById(existingDevices)) {
    deviceMap.set(d.id, { ...d });
  }
  for (const d of dedupeById(incomingDevices)) {
    const current = deviceMap.get(d.id);
    if (current) {
      let nextConnectionType = current.connectionType;
      if (current.connectionType && d.connectionType && current.connectionType !== d.connectionType) {
        const types = [current.connectionType, d.connectionType].sort().join(",");
        if (types === "BLE,OpenAPI" || types === "OpenAPI,BLE") {
          nextConnectionType = "Both";
        }
      }
      deviceMap.set(d.id, {
        ...current,
        ...d,
        connectionType: nextConnectionType
      });
    } else {
      deviceMap.set(d.id, { ...d });
    }
  }
  const merged = [...deviceMap.values()];
  if (merged.length > 0) {
    console.warn("[SwitchBot][Discovery][mergeDiscoveredDevices] Merged device sample:", merged[0]);
    console.warn("[SwitchBot][Discovery][mergeDiscoveredDevices] Total merged devices:", merged.length);
  }
  return merged;
}
function setDiscoveryCache(devices) {
  try {
    const payload = { timestamp: Date.now(), devices };
    localStorage.setItem(DISCOVERY_CACHE_KEY, JSON.stringify(payload));
  } catch (_e) {
  }
}
function clearDiscoveryCache() {
  try {
    localStorage.removeItem(DISCOVERY_CACHE_KEY);
  } catch (_e) {
  }
}
function getDiscoveryCache(validOnly = true) {
  try {
    const stored = localStorage.getItem(DISCOVERY_CACHE_KEY);
    if (!stored) {
      return null;
    }
    const payload = JSON.parse(stored);
    if (!payload || !Array.isArray(payload.devices) || typeof payload.timestamp !== "number") {
      return null;
    }
    const age = Date.now() - payload.timestamp;
    if (validOnly && age > DISCOVERY_CACHE_TTL_MS) {
      return null;
    }
    return payload;
  } catch (_e) {
    return null;
  }
}
function getDiscoveryAutoRefreshSeconds() {
  try {
    const stored = localStorage.getItem(DISCOVERY_AUTO_REFRESH_KEY);
    const value = Number(stored || 0);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch (_e) {
    return 0;
  }
}
function setDiscoveryAutoRefreshSeconds(value) {
  try {
    localStorage.setItem(DISCOVERY_AUTO_REFRESH_KEY, String(Math.max(0, value)));
  } catch (_e) {
  }
}
function getDiscoveryHideAddedPreference() {
  try {
    return localStorage.getItem(DISCOVERY_HIDE_ADDED_KEY) === "true";
  } catch (_e) {
    return false;
  }
}
function setDiscoveryHideAddedPreference(value) {
  try {
    localStorage.setItem(DISCOVERY_HIDE_ADDED_KEY, String(value));
  } catch (_e) {
  }
}
function formatElapsedShort(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1e3));
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
  const lastScannedStatus = document.getElementById("lastScannedStatus");
  if (!lastScannedStatus) {
    return;
  }
  const cache = getDiscoveryCache(false);
  if (!cache) {
    lastScannedStatus.textContent = "Last scanned: never";
    return;
  }
  const ageMs = Date.now() - cache.timestamp;
  const timestampText = new Date(cache.timestamp).toLocaleString();
  const stale = ageMs > DISCOVERY_CACHE_TTL_MS;
  lastScannedStatus.textContent = stale ? `Last scanned: ${formatElapsedShort(ageMs)} (${timestampText}, cache expired)` : `Last scanned: ${formatElapsedShort(ageMs)} (${timestampText})`;
}
async function renderCachedDiscoveryResults() {
  const cache = getDiscoveryCache(true);
  const list = document.getElementById("discoveredList");
  if (!cache || !list || !cache.devices.length) {
    return;
  }
  list.style.display = "block";
  if (!window._discoverySelectedIds) {
    window._discoverySelectedIds = /* @__PURE__ */ new Set();
  }
  await updateDiscoveryView(
    cache.devices,
    getDiscoveryPreferences(),
    getDiscoveryGroupByPreference(),
    getDiscoveryHideAddedPreference(),
    window._discoverySelectedIds
  );
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
      bleTimeoutSeconds: Math.max(3, Math.min(30, Number(parsed?.bleTimeoutSeconds || 8)))
    };
  } catch (_e) {
    return { bleEnabled: true, bleScanDurationSeconds: 5, bleTimeoutSeconds: 8 };
  }
}
function setDiscoveryBleSettings(settings) {
  try {
    localStorage.setItem(DISCOVERY_BLE_SETTINGS_KEY, JSON.stringify(settings));
  } catch (_e) {
  }
}
async function initializeDiscoverySettings() {
  const scanSelect = document.getElementById("bleScanDurationSelect");
  const timeoutInput = document.getElementById("bleTimeoutInput");
  const disableBleCheckbox = document.getElementById("disableBleScanCheckbox");
  const scanSetting = document.getElementById("bleScanSetting");
  const timeoutSetting = document.getElementById("bleTimeoutSetting");
  const bluetoothStatus = document.getElementById("bluetoothStatus");
  const autoRefreshSelect = document.getElementById("autoRefreshIntervalSelect");
  const refreshBtn = document.getElementById("refreshDiscoverBtn");
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
      scanSetting.style.display = disabled ? "none" : "inline-flex";
    }
    if (timeoutSetting) {
      timeoutSetting.style.display = disabled ? "none" : "inline-flex";
    }
  };
  const persistFromControls = () => {
    const next = {
      bleEnabled: !(disableBleCheckbox?.checked ?? false),
      bleScanDurationSeconds: Math.max(3, Math.min(15, Number(scanSelect?.value || 5))),
      bleTimeoutSeconds: Math.max(3, Math.min(30, Number(timeoutInput?.value || 8)))
    };
    setDiscoveryBleSettings(next);
  };
  scanSelect?.addEventListener("change", persistFromControls);
  timeoutInput?.addEventListener("change", persistFromControls);
  disableBleCheckbox?.addEventListener("change", () => {
    persistFromControls();
    updateBleSettingVisibility();
  });
  updateBleSettingVisibility();
  if (bluetoothStatus) {
    const status = await fetchBluetoothStatus();
    bluetoothStatus.textContent = status.available ? `Bluetooth: available (${status.message})` : `Bluetooth: unavailable (${status.message})`;
  }
  updateLastScannedStatus();
  if (discoveryLastScannedTimer) {
    clearInterval(discoveryLastScannedTimer);
  }
  discoveryLastScannedTimer = setInterval(updateLastScannedStatus, 15e3);
  refreshBtn?.addEventListener("click", () => {
    void discoverDevices2();
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
        const discoverBtn = document.getElementById("discoverBtn");
        if (!discoverBtn || discoverBtn.disabled || document.hidden) {
          return;
        }
        void discoverDevices2();
      }, seconds * 1e3);
    }
  };
  autoRefreshSelect?.addEventListener("change", applyAutoRefresh);
  applyAutoRefresh();
  await renderCachedDiscoveryResults();
}
function getDiscoveryGroupByPreference() {
  try {
    const stored = localStorage.getItem(DISCOVERY_GROUP_BY_KEY);
    if (stored === "hub" || stored === "type") {
      return stored;
    }
    return "type";
  } catch (_e) {
    return "type";
  }
}
function setDiscoveryGroupByPreference(groupBy) {
  try {
    localStorage.setItem(DISCOVERY_GROUP_BY_KEY, groupBy);
  } catch (_e) {
  }
}
function getDiscoveryGroupExpandedState() {
  try {
    const stored = localStorage.getItem(DISCOVERY_GROUP_EXPANDED_KEY);
    if (!stored) {
      return {};
    }
    const parsed = JSON.parse(stored);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch (_e) {
    return {};
  }
}
function setDiscoveryGroupExpandedState(state) {
  try {
    localStorage.setItem(DISCOVERY_GROUP_EXPANDED_KEY, JSON.stringify(state));
  } catch (_e) {
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
async function discoverDevices2() {
  const btn = document.getElementById("discoverBtn");
  const status = document.getElementById("discoverStatus");
  const phaseProgress = document.getElementById("discoverPhaseProgress");
  const phaseFill = document.getElementById("discoverPhaseFill");
  const phaseLabel = document.getElementById("discoverPhaseLabel");
  const list = document.getElementById("discoveredList");
  const autoAddAll = document.getElementById("autoAddAllCheckbox")?.checked;
  const scanSelect = document.getElementById("bleScanDurationSelect");
  const timeoutInput = document.getElementById("bleTimeoutInput");
  const disableBleCheckbox = document.getElementById("disableBleScanCheckbox");
  if (!btn) {
    console.error("[SwitchBot][Discovery] discoverDevices: discoverBtn not found in DOM");
    return;
  }
  if (!status) {
    console.error("[SwitchBot][Discovery] discoverDevices: discoverStatus not found in DOM");
    return;
  }
  if (!list) {
    console.error("[SwitchBot][Discovery] discoverDevices: discoveredList container not found in DOM");
    toastError("Discovery UI error: device list container missing. Please reload the page.");
    return;
  }
  const spinnerFrames = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
  let spinnerIndex = 0;
  const startedAt = Date.now();
  let phaseStartedAt = startedAt;
  let phase = "Preparing discovery...";
  const setPhase = (nextPhase) => {
    phase = nextPhase;
    phaseStartedAt = Date.now();
  };
  const getPhasePercent = (phaseName) => {
    if (phaseName.includes("Scanning BLE")) {
      return 35;
    }
    if (phaseName.includes("Fetching OpenAPI")) {
      return 75;
    }
    if (phaseName.includes("Complete")) {
      return 100;
    }
    return 10;
  };
  const renderProgress = () => {
    const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1e3));
    const phaseSeconds = Math.max(0, Math.floor((Date.now() - phaseStartedAt) / 1e3));
    const frame = spinnerFrames[spinnerIndex % spinnerFrames.length];
    spinnerIndex += 1;
    status.textContent = `${frame} ${phase} (${phaseSeconds}s, ${totalSeconds}s total)`;
    if (phaseProgress) {
      phaseProgress.style.display = "block";
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
  if (!window._discoverySelectedIds) {
    window._discoverySelectedIds = /* @__PURE__ */ new Set();
  }
  const selectedIds = window._discoverySelectedIds;
  let controlsInitialized = false;
  async function batchSetDeviceEnabled(selectedIds2, enabled) {
    if (typeof homebridge.getPluginConfig !== "function") {
      throw new TypeError("homebridge.getPluginConfig is not available");
    }
    const configArr = await homebridge.getPluginConfig();
    const platformIdx = Array.isArray(configArr) ? configArr.findIndex((c) => (c.platform || c.name || "").toLowerCase().includes("switchbot")) : -1;
    if (platformIdx === -1) {
      throw new Error("SwitchBot platform config not found");
    }
    const platformConfig = configArr[platformIdx];
    if (!Array.isArray(platformConfig.devices)) {
      throw new TypeError("No devices array in config");
    }
    let changed = false;
    for (const dev of platformConfig.devices) {
      const id = String(dev.deviceId || dev.id || "").trim().toLowerCase();
      if (selectedIds2.has(id)) {
        if (dev.enabled !== enabled) {
          dev.enabled = enabled;
          changed = true;
        }
      }
    }
    if (changed) {
      if (typeof homebridge.updatePluginConfig === "function") {
        await homebridge.updatePluginConfig(configArr);
      } else {
        throw new TypeError("homebridge.updatePluginConfig is not available");
      }
      if (typeof homebridge.savePluginConfig === "function") {
        await homebridge.savePluginConfig();
      }
    }
  }
  const ensureDiscoveryControls = async () => {
    const selectAllBtn = document.createElement("button");
    selectAllBtn.textContent = "Select All";
    selectAllBtn.style.fontSize = "13px";
    selectAllBtn.style.padding = "6px 18px";
    selectAllBtn.style.borderRadius = "6px";
    selectAllBtn.style.background = "#f3f4f6";
    selectAllBtn.style.color = "#1d4ed8";
    selectAllBtn.style.border = "1px solid #d1d5db";
    selectAllBtn.style.cursor = "pointer";
    selectAllBtn.style.marginRight = "8px";
    selectAllBtn.onclick = () => {
      for (const d of discoveredDevices) {
        selectedIds.add(normalizeId(d.id));
      }
      window.dispatchEvent(new Event("discovery-selection-changed"));
      void updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
    };
    const deselectAllBtn = document.createElement("button");
    deselectAllBtn.textContent = "Deselect All";
    deselectAllBtn.style.fontSize = "13px";
    deselectAllBtn.style.padding = "6px 18px";
    deselectAllBtn.style.borderRadius = "6px";
    deselectAllBtn.style.background = "#f3f4f6";
    deselectAllBtn.style.color = "#ef4444";
    deselectAllBtn.style.border = "1px solid #d1d5db";
    deselectAllBtn.style.cursor = "pointer";
    deselectAllBtn.onclick = () => {
      for (const d of discoveredDevices) {
        selectedIds.delete(normalizeId(d.id));
      }
      window.dispatchEvent(new Event("discovery-selection-changed"));
      void updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
    };
    const selectControlsRow = document.createElement("div");
    selectControlsRow.style.display = "flex";
    selectControlsRow.style.gap = "10px";
    selectControlsRow.style.margin = "0 0 10px 0";
    selectControlsRow.appendChild(selectAllBtn);
    selectControlsRow.appendChild(deselectAllBtn);
    if (controlsInitialized) {
      return;
    }
    const controlsDiv = document.createElement("div");
    controlsDiv.style.cssText = "margin-bottom: 12px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center;";
    const filterLabel = document.createElement("label");
    filterLabel.style.fontSize = "12px";
    filterLabel.style.fontWeight = "500";
    filterLabel.textContent = "Filter:";
    const filterGroup = document.createElement("div");
    filterGroup.style.display = "flex";
    filterGroup.style.gap = "4px";
    const filterOptions = [
      { label: "All", value: "all" },
      { label: "BLE", value: "ble" },
      { label: "API", value: "api" },
      { label: "Both", value: "both" },
      { label: "IR", value: "ir" }
    ];
    for (const option of filterOptions) {
      const filterBtn = document.createElement("button");
      filterBtn.textContent = option.label;
      filterBtn.style.padding = "4px 8px";
      filterBtn.style.fontSize = "11px";
      filterBtn.style.borderRadius = "3px";
      filterBtn.style.cursor = "pointer";
      filterBtn.style.border = preferences.connectionType === option.value ? "2px solid #007AFF" : "1px solid #ccc";
      filterBtn.style.backgroundColor = preferences.connectionType === option.value ? "#f0f7ff" : "#fff";
      filterBtn.style.color = preferences.connectionType === option.value ? "#1d4ed8" : "#374151";
      filterBtn.onclick = () => {
        preferences.connectionType = option.value;
        setDiscoveryPreferences(preferences);
        void updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
        Array.prototype.forEach.call(filterGroup.querySelectorAll("button"), (b) => {
          b.style.border = "1px solid #ccc";
          b.style.backgroundColor = "#fff";
          b.style.color = "#374151";
        });
        filterBtn.style.border = "2px solid #007AFF";
        filterBtn.style.backgroundColor = "#f0f7ff";
        filterBtn.style.color = "#1d4ed8";
      };
      filterGroup.appendChild(filterBtn);
    }
    const sortLabel = document.createElement("label");
    sortLabel.style.fontSize = "12px";
    sortLabel.style.fontWeight = "500";
    sortLabel.style.marginLeft = "8px";
    sortLabel.textContent = "Sort:";
    const sortSelect = document.createElement("select");
    sortSelect.style.fontSize = "11px";
    sortSelect.style.padding = "4px 8px";
    sortSelect.style.borderRadius = "3px";
    sortSelect.value = preferences.sortBy;
    const sortOptions = [
      { label: "Name", value: "name" },
      { label: "Signal Strength", value: "signal" },
      { label: "Type", value: "type" },
      { label: "Connection", value: "connection" }
    ];
    for (const opt of sortOptions) {
      const sortOption = document.createElement("option");
      sortOption.value = opt.value;
      sortOption.textContent = opt.label;
      sortSelect.appendChild(sortOption);
    }
    sortSelect.onchange = () => {
      preferences.sortBy = sortSelect.value;
      setDiscoveryPreferences(preferences);
      void updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
    };
    const groupSelect = document.createElement("select");
    groupSelect.style.fontSize = "11px";
    groupSelect.style.padding = "4px 8px";
    groupSelect.style.borderRadius = "3px";
    if (!localStorage.getItem(DISCOVERY_GROUP_BY_KEY)) {
      groupSelect.value = "type";
    } else {
      groupSelect.value = groupBy;
    }
    const groupLabel = document.createElement("label");
    groupLabel.style.fontSize = "12px";
    groupLabel.style.fontWeight = "500";
    groupLabel.style.marginLeft = "8px";
    const groupLabelTextMap = {
      connection: "Connection",
      hub: "Hub",
      type: "Device Type"
    };
    groupLabel.textContent = `Group: ${groupLabelTextMap[groupSelect.value] || "Connection"}`;
    const groupOptions = [
      { label: "Connection", value: "connection" },
      { label: "Hub", value: "hub" },
      { label: "Device Type", value: "type" }
    ];
    for (const opt of groupOptions) {
      const groupOption = document.createElement("option");
      groupOption.value = opt.value;
      groupOption.textContent = opt.label;
      groupSelect.appendChild(groupOption);
    }
    groupSelect.onchange = () => {
      groupBy = groupSelect.value;
      setDiscoveryGroupByPreference(groupBy);
      groupLabel.textContent = `Group: ${groupLabelTextMap[groupSelect.value] || "Connection"}`;
      void updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
    };
    const hideAddedLabel = document.createElement("label");
    hideAddedLabel.style.display = "inline-flex";
    hideAddedLabel.style.alignItems = "center";
    hideAddedLabel.style.gap = "4px";
    hideAddedLabel.style.fontSize = "11px";
    hideAddedLabel.style.marginLeft = "8px";
    const hideAddedCheckbox = document.createElement("input");
    hideAddedCheckbox.type = "checkbox";
    hideAddedCheckbox.checked = hideAdded;
    hideAddedCheckbox.style.margin = "0";
    hideAddedCheckbox.style.width = "auto";
    const hideAddedText = document.createElement("span");
    hideAddedText.textContent = "Hide Added";
    hideAddedLabel.appendChild(hideAddedCheckbox);
    hideAddedLabel.appendChild(hideAddedText);
    hideAddedCheckbox.onchange = () => {
      hideAdded = hideAddedCheckbox.checked;
      setDiscoveryHideAddedPreference(hideAdded);
      void updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
    };
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search by name, ID, or type...";
    searchInput.style.fontSize = "13px";
    searchInput.style.padding = "8px 16px";
    searchInput.style.borderRadius = "6px";
    searchInput.style.border = "1px solid #ccc";
    searchInput.style.flex = "1 1 0%";
    searchInput.style.minWidth = "120px";
    searchInput.style.maxWidth = "100%";
    searchInput.style.width = "100%";
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
    const actionBtnStyle = {
      fontSize: "16px",
      padding: "10px 0",
      borderRadius: "10px",
      margin: "0 12px 0 0",
      width: "100%",
      maxWidth: "220px",
      fontWeight: "bold",
      background: "#ef4444",
      color: "#fff",
      border: "none",
      cursor: "pointer",
      boxShadow: "0 2px 8px #0001",
      transition: "background 0.2s",
      outline: "none",
      display: "block"
    };
    const addSelectedBtn = document.createElement("button");
    addSelectedBtn.textContent = "Add Selected to Config";
    Object.assign(addSelectedBtn.style, actionBtnStyle);
    addSelectedBtn.disabled = true;
    addSelectedBtn.onclick = async () => {
      if (!selectedIds.size) {
        return;
      }
      addSelectedBtn.disabled = true;
      addSelectedBtn.textContent = "Adding...";
      try {
        showBusyUi();
        const selectedDevices = discoveredDevices.filter((d) => selectedIds.has(normalizeId(d.id)));
        const bulkResult = await addDevicesInBulk(selectedDevices.map((d) => ({
          deviceId: d.id,
          name: d.name,
          type: d.type,
          rssi: d.rssi,
          address: d.address,
          model: d.model
        })));
        uiLog.info("Batch add response:", bulkResult);
        if (!bulkResult || bulkResult.success === false) {
          throw new Error(bulkResult?.data?.message || "Batch add failed");
        }
        const addedCount = bulkResult?.addedCount ?? bulkResult?.data?.addedCount ?? 0;
        const skippedCount = bulkResult?.skippedCount ?? bulkResult?.data?.skippedCount ?? 0;
        toastSuccess(`Added ${addedCount} device(s)${skippedCount > 0 ? ` (${skippedCount} skipped)` : ""}`);
        await loadConfiguredDevices();
        selectedIds.clear();
        addSelectedBtn.disabled = true;
        addSelectedBtn.textContent = "Add Selected";
        await updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
      } catch (e) {
        uiLog.error("Batch add error:", e);
        toastError(e instanceof Error ? e.message : "Failed to add devices");
        addSelectedBtn.disabled = false;
        addSelectedBtn.textContent = "Add Selected";
      } finally {
        hideBusyUi();
      }
    };
    const enableSelectedBtn = document.createElement("button");
    enableSelectedBtn.textContent = "Enable Selected";
    Object.assign(enableSelectedBtn.style, actionBtnStyle);
    enableSelectedBtn.disabled = true;
    enableSelectedBtn.onclick = async () => {
      if (!selectedIds.size) {
        return;
      }
      enableSelectedBtn.disabled = true;
      enableSelectedBtn.textContent = "Enabling...";
      try {
        showBusyUi();
        await batchSetDeviceEnabled(selectedIds, true);
        toastSuccess("Selected devices enabled");
        await loadConfiguredDevices();
        enableSelectedBtn.disabled = true;
        enableSelectedBtn.textContent = "Enable Selected";
        await updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
      } catch (e) {
        uiLog.error("Batch enable error:", e);
        toastError(e instanceof Error ? e.message : "Failed to enable devices");
        enableSelectedBtn.disabled = false;
        enableSelectedBtn.textContent = "Enable Selected";
      } finally {
        hideBusyUi();
      }
    };
    const disableSelectedBtn = document.createElement("button");
    disableSelectedBtn.textContent = "Disable Selected";
    Object.assign(disableSelectedBtn.style, actionBtnStyle);
    disableSelectedBtn.disabled = true;
    disableSelectedBtn.onclick = async () => {
      if (!selectedIds.size) {
        return;
      }
      disableSelectedBtn.disabled = true;
      disableSelectedBtn.textContent = "Disabling...";
      try {
        showBusyUi();
        await batchSetDeviceEnabled(selectedIds, false);
        toastSuccess("Selected devices disabled");
        await loadConfiguredDevices();
        disableSelectedBtn.disabled = true;
        disableSelectedBtn.textContent = "Disable Selected";
        await updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
      } catch (e) {
        uiLog.error("Batch disable error:", e);
        toastError(e instanceof Error ? e.message : "Failed to disable devices");
        disableSelectedBtn.disabled = false;
        disableSelectedBtn.textContent = "Disable Selected";
      } finally {
        hideBusyUi();
      }
    };
    controlsDiv.appendChild(filterLabel);
    controlsDiv.appendChild(filterGroup);
    controlsDiv.appendChild(sortLabel);
    controlsDiv.appendChild(sortSelect);
    controlsDiv.appendChild(groupLabel);
    controlsDiv.appendChild(groupSelect);
    controlsDiv.appendChild(hideAddedLabel);
    controlsDiv.appendChild(searchInput);
    const topActionRow = document.createElement("div");
    topActionRow.style.display = "flex";
    topActionRow.style.gap = "20px";
    topActionRow.style.margin = "18px 0 10px 0";
    topActionRow.style.justifyContent = "flex-start";
    topActionRow.appendChild(addSelectedBtn);
    topActionRow.appendChild(enableSelectedBtn);
    topActionRow.appendChild(disableSelectedBtn);
    list.innerHTML = "";
    list.appendChild(selectControlsRow);
    list.appendChild(topActionRow);
    list.appendChild(controlsDiv);
    let deviceListContainer = document.getElementById("discoveredDevices");
    if (!deviceListContainer) {
      deviceListContainer = document.createElement("ul");
      deviceListContainer.id = "discoveredDevices";
      deviceListContainer.style.maxHeight = "400px";
      deviceListContainer.style.overflowY = "auto";
      deviceListContainer.style.marginTop = "12px";
      deviceListContainer.style.padding = "0";
      deviceListContainer.style.listStyle = "none";
      list.appendChild(deviceListContainer);
    }
    list.style.display = "block";
    controlsInitialized = true;
    const updateActionButtons = () => {
      const hasSelection = selectedIds.size > 0;
      addSelectedBtn.disabled = !hasSelection;
      enableSelectedBtn.disabled = !hasSelection;
      disableSelectedBtn.disabled = !hasSelection;
    };
    setInterval(updateActionButtons, 300);
  };
  try {
    const bleSettings = {
      bleEnabled: !(disableBleCheckbox?.checked ?? false),
      bleScanDurationSeconds: Math.max(3, Math.min(15, Number(scanSelect?.value || 5))),
      bleTimeoutSeconds: Math.max(3, Math.min(30, Number(timeoutInput?.value || 8)))
    };
    setDiscoveryBleSettings(bleSettings);
    showBusyUi();
    btn.disabled = true;
    btn.textContent = "\u{1F50D} Discovering...";
    setPhase(bleSettings.bleEnabled ? "Scanning BLE..." : "Skipping BLE scan...");
    renderProgress();
    status.classList.remove("error");
    const devicesFoundDisplay = document.getElementById("discoverDevicesFound");
    if (devicesFoundDisplay) {
      devicesFoundDisplay.style.display = "none";
      devicesFoundDisplay.classList.remove("discovery-scanning-pulse");
    }
    if (bleSettings.bleEnabled) {
      const bleDevicesRaw = await discoverDevices("ble", bleSettings);
      discoveredDevices = dedupeById(bleDevicesRaw);
      uiLog.info("BLE discover response:", bleDevicesRaw);
      if (devicesFoundDisplay && bleDevicesRaw.length > 0) {
        devicesFoundDisplay.style.display = "inline";
        devicesFoundDisplay.classList.add("discovery-scanning-pulse");
        devicesFoundDisplay.textContent = `\u{1F4CA} ${bleDevicesRaw.length} device(s) found (scanning...)`;
      }
    } else {
      discoveredDevices = [];
      uiLog.info("BLE discovery skipped by user setting");
    }
    if (!autoAddAll && discoveredDevices.length > 0) {
      await ensureDiscoveryControls();
      await updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
      status.textContent = `Showing ${discoveredDevices.length} device(s) from BLE, fetching OpenAPI...`;
    }
    setPhase("Fetching OpenAPI...");
    renderProgress();
    try {
      const openApiDevicesRaw = await discoverDevices("openapi");
      uiLog.info("OpenAPI discover response:", openApiDevicesRaw);
      discoveredDevices = mergeDiscoveredDevices(discoveredDevices, openApiDevicesRaw);
      if (devicesFoundDisplay && discoveredDevices.length > 0) {
        devicesFoundDisplay.textContent = `\u{1F4CA} ${discoveredDevices.length} device(s) found (complete)`;
      }
    } catch (openApiError) {
      uiLog.warn("OpenAPI phase failed during discovery:", openApiError);
      if (!discoveredDevices.length) {
        throw openApiError;
      }
      if (devicesFoundDisplay) {
        devicesFoundDisplay.classList.remove("discovery-scanning-pulse");
      }
    }
    setPhase("Complete");
    renderProgress();
    uiLog.info("Final merged discover response:", discoveredDevices);
    if (!discoveredDevices.length) {
      status.textContent = "No devices found in your SwitchBot account";
      toastInfo("No devices found in your SwitchBot account");
      list.style.display = "none";
      if (devicesFoundDisplay) {
        devicesFoundDisplay.style.display = "none";
        devicesFoundDisplay.classList.remove("discovery-scanning-pulse");
      }
      clearDiscoveryCache();
      updateLastScannedStatus();
      return;
    }
    if (autoAddAll) {
      status.textContent = `Auto-adding ${discoveredDevices.length} device(s)...`;
      try {
        const bulkResult = await addDevicesInBulk(
          discoveredDevices.map((d) => ({
            deviceId: d.id,
            name: d.name,
            type: d.type,
            rssi: d.rssi,
            address: d.address,
            model: d.model
          }))
        );
        uiLog.info("Bulk add response:", bulkResult);
        if (!bulkResult || bulkResult.success === false) {
          throw new Error(bulkResult?.data?.message || "Bulk add failed");
        }
        const addedCount = bulkResult?.addedCount ?? bulkResult?.data?.addedCount ?? 0;
        const skippedCount = bulkResult?.skippedCount ?? bulkResult?.data?.skippedCount ?? 0;
        status.textContent = `\u2713 Added ${addedCount} device(s)${skippedCount > 0 ? ` (${skippedCount} skipped)` : ""}`;
        if (addedCount > 0) {
          toastSuccess(`Added ${addedCount} device(s)${skippedCount > 0 ? ` (${skippedCount} skipped)` : ""}`);
        } else if (skippedCount > 0) {
          toastWarning(`No new devices were added (${skippedCount} skipped)`);
        }
        status.classList.remove("error");
        list.style.display = "none";
        if (discoveredDevices.length > 0) {
          const synced = await syncParentPluginConfigFromDisk(true);
          status.textContent += synced ? " - Config saved automatically." : " - Warning: config may not persist until you close/reopen settings.";
          if (synced) {
            toastSuccess("Configuration synced and saved automatically");
          } else {
            toastWarning("Configuration sync failed; close and reopen settings before Save");
          }
        }
      } catch (e) {
        uiLog.error("Bulk add error:", e);
        status.textContent = `\u2717 Error: ${e instanceof Error ? e.message : "Failed to add devices"}`;
        status.classList.add("error");
        toastError(e instanceof Error ? e.message : "Failed to add devices");
      }
      await loadConfiguredDevices();
      return;
    }
    await ensureDiscoveryControls();
    await updateDiscoveryView(discoveredDevices, preferences, groupBy, hideAdded, selectedIds);
    setDiscoveryCache(discoveredDevices);
    updateLastScannedStatus();
  } catch (e) {
    uiLog.error("Discovery error:", e);
    status.textContent = `Error: ${e instanceof Error ? e.message : "Discovery failed"}`;
    status.classList.add("error");
    toastError(e instanceof Error ? e.message : "Discovery failed");
    list.style.display = "none";
  } finally {
    clearInterval(progressTimer);
    hideBusyUi();
    if (phaseProgress) {
      phaseProgress.style.display = "none";
    }
    if (phaseFill) {
      phaseFill.style.width = "0%";
    }
    if (phaseLabel) {
      phaseLabel.textContent = "";
    }
    const devicesFoundDisplay = document.getElementById("discoverDevicesFound");
    if (devicesFoundDisplay) {
      devicesFoundDisplay.style.display = "none";
      devicesFoundDisplay.classList.remove("discovery-scanning-pulse");
    }
    btn.disabled = false;
    btn.textContent = "\u{1F50D} Discover Devices";
  }
}
async function updateDiscoveryView(allDevices, preferences, groupBy, hideAdded, selectedIds) {
  console.warn("[SwitchBot][Discovery] updateDiscoveryView: allDevices", allDevices);
  const visibleDevices = allDevices.filter((d) => {
    if (hideAdded && d.added) {
      return false;
    }
    return true;
  });
  console.warn("[SwitchBot][Discovery] visibleDevices after filter:", visibleDevices);
  const configuredIds = new Set(
    allDevices.filter((d) => d.added).map((d) => normalizeId(d.id))
  );
  const getConnectionGroup = (device) => {
    if (device?.isIR) {
      return "IR";
    }
    const connectionType = String(device?.connectionType || "").toLowerCase();
    if (connectionType.includes("both")) {
      return "Both";
    }
    if (connectionType.includes("ble")) {
      return "BLE";
    }
    if (connectionType.includes("api")) {
      return "OpenAPI";
    }
    return "Unknown";
  };
  const getHubGroup = (device) => {
    const hub = String(device?.hubDeviceId || "").trim();
    return hub ? `Hub ${hub}` : "No Hub";
  };
  const getTypeGroup = (device) => {
    const type = String(device?.type || "").trim();
    return type || "Unknown Type";
  };
  const groupedDevices = /* @__PURE__ */ new Map();
  for (const d of visibleDevices) {
    let group = getConnectionGroup(d);
    if (groupBy === "hub") {
      group = getHubGroup(d);
    } else if (groupBy === "type") {
      group = getTypeGroup(d);
    }
    const groupDevices = groupedDevices.get(group) || [];
    groupDevices.push(d);
    groupedDevices.set(group, groupDevices);
  }
  console.warn("[SwitchBot][Discovery] groupedDevices:", groupedDevices);
  let orderedGroups = [];
  if (groupBy === "hub") {
    const hubGroups = [...groupedDevices.keys()].filter((group) => group !== "No Hub").sort((a, b) => a.localeCompare(b));
    orderedGroups = groupedDevices.has("No Hub") ? [...hubGroups, "No Hub"] : hubGroups;
  } else if (groupBy === "type") {
    const typeGroups = [...groupedDevices.keys()].filter((group) => group !== "Unknown Type").sort((a, b) => a.localeCompare(b));
    orderedGroups = groupedDevices.has("Unknown Type") ? [...typeGroups, "Unknown Type"] : typeGroups;
  } else {
    const groupOrder = ["Both", "BLE", "OpenAPI", "IR", "Unknown"];
    orderedGroups = groupOrder.filter((group) => groupedDevices.has(group));
  }
  const container = document.createElement("div");
  container.id = "discoveredDevices";
  container.className = "discovery-groups";
  console.warn("[SwitchBot][Discovery] Rendering device groups:", orderedGroups);
  if (!visibleDevices.length) {
    const empty = document.createElement("div");
    empty.className = "discovery-group-empty";
    empty.textContent = hideAdded ? "No devices match current filters (or all are already added)." : "No devices match current filters.";
    container.appendChild(empty);
    console.warn("[SwitchBot][Discovery] No visible devices after filtering.");
  } else {
    for (const groupName of orderedGroups) {
      const groupItems = groupedDevices.get(groupName);
      if (!groupItems?.length) {
        continue;
      }
      console.warn(`[SwitchBot][Discovery] Rendering group: ${groupName}`, groupItems);
      const groupSection = document.createElement("section");
      groupSection.className = "discovery-group";
      const groupStorageKey = `${groupBy}:${groupName}`;
      let expanded = isDiscoveryGroupExpanded(groupStorageKey);
      const groupHeader = document.createElement("button");
      groupHeader.className = "discovery-group-header-btn";
      groupHeader.type = "button";
      const setGroupHeaderText = () => {
        const marker = expanded ? "\u25BE" : "\u25B8";
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
          } else {
            selectedIds.delete(id);
          }
          const btn = document.querySelector("button")?.parentElement?.querySelector("button");
          if (btn && btn.textContent?.includes("Add Selected")) {
            btn.disabled = selectedIds.size === 0;
          }
        }
      });
      if (!expanded) {
        groupList.style.display = "none";
      }
      groupHeader.onclick = () => {
        expanded = !expanded;
        setDiscoveryGroupExpanded(groupStorageKey, expanded);
        setGroupHeaderText();
        groupList.style.display = expanded ? "grid" : "none";
      };
      groupSection.appendChild(groupList);
      container.appendChild(groupSection);
    }
  }
  const existingList = document.getElementById("discoveredDevices");
  container.id = "discoveredDevices";
  if (existingList && existingList.parentNode) {
    existingList.replaceWith(container);
  } else {
    const listContainer = document.getElementById("discoveredList");
    if (listContainer) {
      listContainer.appendChild(container);
    } else {
      console.error("[SwitchBot][Discovery] render: discoveredList container not found in DOM (fallback)");
      toastError("Discovery UI error: device list container missing. Please reload the page.");
    }
  }
  function updateBatchButtonStates() {
    const addSelectedBtn = document.getElementById("addSelectedBtn");
    const enableSelectedBtn = document.getElementById("enableSelectedBtn");
    const disableSelectedBtn = document.getElementById("disableSelectedBtn");
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
  window.removeEventListener("discovery-selection-changed", updateBatchButtonStates);
  window.addEventListener("discovery-selection-changed", updateBatchButtonStates);
  updateBatchButtonStates();
  const status = document.getElementById("discoverStatus");
  if (status) {
    const totalCount = allDevices.length;
    const filteredCount = visibleDevices.length;
    status.textContent = filteredCount === totalCount ? `Found ${totalCount} device(s)` : `Showing ${filteredCount} of ${totalCount} device(s)`;
  }
}
async function addDeviceToConfig(device) {
  const { addDeviceToConfig: addDevice2 } = await Promise.resolve().then(() => (init_devices(), devices_exports));
  await addDevice2(device);
}
var DISCOVERY_GROUP_BY_KEY, DISCOVERY_GROUP_EXPANDED_KEY, DISCOVERY_BLE_SETTINGS_KEY, DISCOVERY_HIDE_ADDED_KEY, DISCOVERY_CACHE_KEY, DISCOVERY_AUTO_REFRESH_KEY, DISCOVERY_CACHE_TTL_MS, discoveryAutoRefreshTimer, discoveryLastScannedTimer;
var init_discovery = __esm({
  "src/homebridge-ui/public/js/discovery.ts"() {
    "use strict";
    init_api();
    init_devices();
    init_logger();
    init_modal();
    init_render();
    init_toast();
    DISCOVERY_GROUP_BY_KEY = "discoveryGroupBy";
    DISCOVERY_GROUP_EXPANDED_KEY = "discoveryGroupExpanded";
    DISCOVERY_BLE_SETTINGS_KEY = "discoveryBleSettings";
    DISCOVERY_HIDE_ADDED_KEY = "discoveryHideAdded";
    DISCOVERY_CACHE_KEY = "discoveryCache";
    DISCOVERY_AUTO_REFRESH_KEY = "discoveryAutoRefreshSeconds";
    DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1e3;
    discoveryAutoRefreshTimer = null;
    discoveryLastScannedTimer = null;
  }
});

// src/homebridge-ui/public/js/constants.ts
var init_constants = __esm({
  "src/homebridge-ui/public/js/constants.ts"() {
    "use strict";
    init_device_types();
  }
});

// src/homebridge-ui/public/js/modals.ts
var modals_exports = {};
__export(modals_exports, {
  editDevice: () => editDevice,
  importDiscoveredDevice: () => importDiscoveredDevice
});
async function importDiscoveredDevice(device) {
  const openApiRefreshLabel = document.createElement("label");
  openApiRefreshLabel.textContent = "OpenAPI Polling Interval (seconds)";
  openApiRefreshLabel.style.display = "block";
  openApiRefreshLabel.style.marginBottom = "6px";
  openApiRefreshLabel.style.fontWeight = "500";
  openApiRefreshLabel.style.fontSize = "12px";
  openApiRefreshLabel.style.color = "#6b7280";
  openApiRefreshLabel.title = "How often to poll this device via OpenAPI for status (in seconds). Overrides platform value if set. Default: 300 (5 minutes). Minimum: 30.";
  const openApiRefreshInput = document.createElement("input");
  openApiRefreshInput.type = "number";
  openApiRefreshInput.value = device.refreshRate || 300;
  openApiRefreshInput.min = "30";
  openApiRefreshInput.step = "1";
  openApiRefreshInput.style.width = "100%";
  openApiRefreshInput.style.marginBottom = "12px";
  openApiRefreshInput.style.padding = "8px 10px";
  openApiRefreshInput.style.borderRadius = "6px";
  openApiRefreshInput.style.fontSize = "14px";
  openApiRefreshInput.style.boxSizing = "border-box";
  return new Promise((resolve) => {
    const div = document.createElement("div");
    div.style.position = "fixed";
    div.style.top = "0";
    div.style.left = "0";
    div.style.width = "100%";
    div.style.height = "100%";
    div.style.background = "rgba(0,0,0,0.7)";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.justifyContent = "center";
    div.style.zIndex = "9999";
    const modal = document.createElement("div");
    modal.style.background = getComputedStyle(document.body).backgroundColor;
    modal.style.color = getComputedStyle(document.body).color;
    modal.style.padding = "0";
    modal.style.borderRadius = "10px";
    modal.style.minWidth = "440px";
    modal.style.maxWidth = "90vw";
    modal.style.boxShadow = "0 8px 32px rgba(0,0,0,0.35)";
    modal.style.overflow = "hidden";
    modal.style.borderTop = "3px solid var(--switchbot-red, #ef4444)";
    const title = document.createElement("h3");
    title.textContent = "Import Discovered Device";
    title.style.marginTop = "0";
    title.style.marginBottom = "16px";
    title.style.padding = "20px 20px 0";
    title.style.fontSize = "18px";
    title.style.fontWeight = "600";
    title.style.color = "var(--switchbot-red, #ef4444)";
    title.style.letterSpacing = "-0.02em";
    const contentDiv = document.createElement("div");
    contentDiv.style.padding = "0 20px 20px";
    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Device Name";
    nameLabel.style.display = "block";
    nameLabel.style.marginBottom = "6px";
    nameLabel.style.fontWeight = "500";
    nameLabel.style.fontSize = "12px";
    nameLabel.style.color = "#6b7280";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    let safeName = device.name;
    if (!safeName || safeName === "undefined") {
      safeName = device.id || "";
    }
    nameInput.value = safeName;
    nameInput.style.width = "100%";
    nameInput.style.marginBottom = "12px";
    nameInput.style.padding = "8px 10px";
    nameInput.style.borderRadius = "6px";
    nameInput.style.fontSize = "14px";
    nameInput.style.boxSizing = "border-box";
    const typeLabel = document.createElement("label");
    typeLabel.textContent = "Config Device Type";
    typeLabel.style.display = "block";
    typeLabel.style.marginBottom = "6px";
    typeLabel.style.fontWeight = "500";
    typeLabel.style.fontSize = "12px";
    typeLabel.style.color = "#6b7280";
    const typeSelect = document.createElement("select");
    typeSelect.style.width = "100%";
    typeSelect.style.padding = "8px 10px";
    typeSelect.style.marginBottom = "12px";
    typeSelect.style.borderRadius = "6px";
    typeSelect.style.fontSize = "14px";
    typeSelect.style.background = getComputedStyle(nameInput).background;
    typeSelect.style.color = getComputedStyle(nameInput).color;
    typeSelect.style.border = getComputedStyle(nameInput).border;
    typeSelect.style.boxSizing = "border-box";
    Object.keys(DEVICE_TYPES).forEach((categoryName) => {
      const optgroup = document.createElement("optgroup");
      optgroup.label = categoryName;
      DEVICE_TYPES[categoryName].forEach((deviceType) => {
        const opt = document.createElement("option");
        opt.value = deviceType;
        opt.text = deviceType;
        const detectedType = (device.type || "").toLowerCase();
        opt.selected = deviceType.toLowerCase() === detectedType;
        optgroup.appendChild(opt);
      });
      typeSelect.appendChild(optgroup);
    });
    const connectionPrefLabel = document.createElement("label");
    connectionPrefLabel.textContent = "Connection Preference";
    connectionPrefLabel.style.display = "block";
    connectionPrefLabel.style.marginBottom = "6px";
    connectionPrefLabel.style.fontWeight = "500";
    connectionPrefLabel.style.fontSize = "12px";
    connectionPrefLabel.style.color = "#6b7280";
    const connectionPrefSelect = document.createElement("select");
    connectionPrefSelect.style.width = "100%";
    connectionPrefSelect.style.marginBottom = "12px";
    connectionPrefSelect.style.padding = "8px 10px";
    connectionPrefSelect.style.borderRadius = "6px";
    connectionPrefSelect.style.fontSize = "14px";
    connectionPrefSelect.style.boxSizing = "border-box";
    ["auto", "ble", "openapi"].forEach((val) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.text = val.charAt(0).toUpperCase() + val.slice(1);
      opt.selected = (device.connectionPreference || "auto") === val;
      connectionPrefSelect.appendChild(opt);
    });
    const roomLabel = document.createElement("label");
    roomLabel.textContent = "Room";
    roomLabel.style.display = "block";
    roomLabel.style.marginBottom = "6px";
    roomLabel.style.fontWeight = "500";
    roomLabel.style.fontSize = "12px";
    roomLabel.style.color = "#6b7280";
    const roomInput = document.createElement("input");
    roomInput.type = "text";
    roomInput.value = device.room || "";
    roomInput.placeholder = "Optional room/location metadata";
    roomInput.style.width = "100%";
    roomInput.style.marginBottom = "12px";
    roomInput.style.padding = "8px 10px";
    roomInput.style.borderRadius = "6px";
    roomInput.style.fontSize = "14px";
    roomInput.style.boxSizing = "border-box";
    const macLabel = document.createElement("label");
    macLabel.textContent = "BLE MAC Address (optional)";
    macLabel.style.display = "block";
    macLabel.style.marginBottom = "6px";
    macLabel.style.fontWeight = "500";
    macLabel.style.fontSize = "12px";
    macLabel.style.color = "#6b7280";
    const macInput = document.createElement("input");
    macInput.type = "text";
    macInput.value = device.address || "";
    macInput.placeholder = "AA:BB:CC:DD:EE:FF";
    macInput.style.width = "100%";
    macInput.style.marginBottom = "12px";
    macInput.style.padding = "8px 10px";
    macInput.style.borderRadius = "6px";
    macInput.style.fontSize = "14px";
    macInput.style.boxSizing = "border-box";
    const encryptionKeyLabel = document.createElement("label");
    encryptionKeyLabel.textContent = "BLE Encryption Key (optional)";
    encryptionKeyLabel.style.display = "block";
    encryptionKeyLabel.style.marginBottom = "6px";
    encryptionKeyLabel.style.fontWeight = "500";
    encryptionKeyLabel.style.fontSize = "12px";
    encryptionKeyLabel.style.color = "#6b7280";
    const encryptionKeyInput = document.createElement("input");
    encryptionKeyInput.type = "password";
    encryptionKeyInput.value = device.encryptionKey || "";
    encryptionKeyInput.placeholder = "Paste device BLE encryption key";
    encryptionKeyInput.style.width = "100%";
    encryptionKeyInput.style.marginBottom = "12px";
    encryptionKeyInput.style.padding = "8px 10px";
    encryptionKeyInput.style.borderRadius = "6px";
    encryptionKeyInput.style.fontSize = "14px";
    encryptionKeyInput.style.boxSizing = "border-box";
    const keyIdLabel = document.createElement("label");
    keyIdLabel.textContent = "BLE Key ID (optional)";
    keyIdLabel.style.display = "block";
    keyIdLabel.style.marginBottom = "6px";
    keyIdLabel.style.fontWeight = "500";
    keyIdLabel.style.fontSize = "12px";
    keyIdLabel.style.color = "#6b7280";
    const keyIdInput = document.createElement("input");
    keyIdInput.type = "text";
    keyIdInput.value = device.keyId || "";
    keyIdInput.placeholder = "e.g. ff";
    keyIdInput.style.width = "100%";
    keyIdInput.style.marginBottom = "12px";
    keyIdInput.style.padding = "8px 10px";
    keyIdInput.style.borderRadius = "6px";
    keyIdInput.style.fontSize = "14px";
    keyIdInput.style.boxSizing = "border-box";
    const blePollingEnabledLabel = document.createElement("label");
    blePollingEnabledLabel.textContent = "Enable BLE Polling Fallback";
    blePollingEnabledLabel.style.display = "block";
    blePollingEnabledLabel.style.marginBottom = "6px";
    blePollingEnabledLabel.style.fontWeight = "500";
    blePollingEnabledLabel.style.fontSize = "12px";
    blePollingEnabledLabel.style.color = "#6b7280";
    const blePollingEnabledInput = document.createElement("input");
    blePollingEnabledInput.type = "checkbox";
    blePollingEnabledInput.checked = device.blePollingEnabled !== false;
    blePollingEnabledInput.style.marginRight = "8px";
    blePollingEnabledInput.style.marginBottom = "12px";
    const blePollIntervalLabel = document.createElement("label");
    blePollIntervalLabel.textContent = "BLE Polling Interval (ms)";
    blePollIntervalLabel.style.display = "block";
    blePollIntervalLabel.style.marginBottom = "6px";
    blePollIntervalLabel.style.fontWeight = "500";
    blePollIntervalLabel.style.fontSize = "12px";
    blePollIntervalLabel.style.color = "#6b7280";
    const blePollIntervalInput = document.createElement("input");
    blePollIntervalInput.type = "number";
    blePollIntervalInput.value = device.blePollIntervalMs || 6e5;
    blePollIntervalInput.min = "60000";
    blePollIntervalInput.step = "1000";
    blePollIntervalInput.style.width = "100%";
    blePollIntervalInput.style.marginBottom = "12px";
    blePollIntervalInput.style.padding = "8px 10px";
    blePollIntervalInput.style.borderRadius = "6px";
    blePollIntervalInput.style.fontSize = "14px";
    blePollIntervalInput.style.boxSizing = "border-box";
    const buttons = document.createElement("div");
    buttons.style.display = "flex";
    buttons.style.gap = "10px";
    buttons.style.justifyContent = "flex-end";
    buttons.style.marginTop = "18px";
    buttons.style.paddingTop = "18px";
    buttons.style.borderTop = "1px solid rgba(0, 0, 0, 0.08)";
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.className = "secondary";
    cancelBtn.style.background = "#6b7280";
    cancelBtn.style.padding = "8px 16px";
    cancelBtn.style.fontSize = "13px";
    const importBtn = document.createElement("button");
    importBtn.textContent = "Add to Config";
    importBtn.style.background = "var(--switchbot-red, #ef4444)";
    importBtn.style.padding = "8px 20px";
    importBtn.style.fontSize = "13px";
    const cleanup = (result) => {
      div.remove();
      resolve(result);
    };
    cancelBtn.onclick = () => cleanup(null);
    importBtn.onclick = () => {
      let finalName = nameInput.value;
      if (!finalName || finalName === "undefined") {
        finalName = device.id || "";
      }
      cleanup({
        configDeviceName: finalName,
        configDeviceType: typeSelect.value || device.type,
        address: macInput.value || void 0,
        connectionPreference: connectionPrefSelect.value || void 0,
        room: roomInput.value || void 0,
        encryptionKey: encryptionKeyInput.value || void 0,
        keyId: keyIdInput.value || void 0,
        refreshRate: Number(openApiRefreshInput.value) || 300,
        blePollingEnabled: blePollingEnabledInput.checked,
        blePollIntervalMs: Number(blePollIntervalInput.value) || 6e5
      });
    };
    div.addEventListener("click", (event) => {
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
async function editDevice(device) {
  const openApiRefreshLabel = document.createElement("label");
  openApiRefreshLabel.textContent = "OpenAPI Polling Interval (seconds)";
  openApiRefreshLabel.style.display = "block";
  openApiRefreshLabel.style.marginBottom = "6px";
  openApiRefreshLabel.style.fontWeight = "500";
  openApiRefreshLabel.style.fontSize = "12px";
  openApiRefreshLabel.style.color = "#6b7280";
  openApiRefreshLabel.title = "How often to poll this device via OpenAPI for status (in seconds). Overrides platform value if set. Default: 300 (5 minutes). Minimum: 30.";
  const openApiRefreshInput = document.createElement("input");
  openApiRefreshInput.type = "number";
  openApiRefreshInput.value = device.refreshRate || 300;
  openApiRefreshInput.min = "30";
  openApiRefreshInput.step = "1";
  openApiRefreshInput.style.width = "100%";
  openApiRefreshInput.style.marginBottom = "12px";
  openApiRefreshInput.style.padding = "8px 10px";
  openApiRefreshInput.style.borderRadius = "6px";
  openApiRefreshInput.style.fontSize = "14px";
  openApiRefreshInput.style.boxSizing = "border-box";
  const blePollingEnabledLabel = document.createElement("label");
  blePollingEnabledLabel.textContent = "Enable BLE Polling Fallback";
  blePollingEnabledLabel.style.display = "block";
  blePollingEnabledLabel.style.marginBottom = "6px";
  blePollingEnabledLabel.style.fontWeight = "500";
  blePollingEnabledLabel.style.fontSize = "12px";
  blePollingEnabledLabel.style.color = "#6b7280";
  const blePollingEnabledInput = document.createElement("input");
  blePollingEnabledInput.type = "checkbox";
  blePollingEnabledInput.checked = device.blePollingEnabled !== false;
  blePollingEnabledInput.style.marginRight = "8px";
  blePollingEnabledInput.style.marginBottom = "12px";
  const blePollIntervalLabel = document.createElement("label");
  blePollIntervalLabel.textContent = "BLE Polling Interval (ms)";
  blePollIntervalLabel.style.display = "block";
  blePollIntervalLabel.style.marginBottom = "6px";
  blePollIntervalLabel.style.fontWeight = "500";
  blePollIntervalLabel.style.fontSize = "12px";
  blePollIntervalLabel.style.color = "#6b7280";
  const blePollIntervalInput = document.createElement("input");
  blePollIntervalInput.type = "number";
  blePollIntervalInput.value = device.blePollIntervalMs || 6e5;
  blePollIntervalInput.min = "60000";
  blePollIntervalInput.step = "1000";
  blePollIntervalInput.style.width = "100%";
  blePollIntervalInput.style.marginBottom = "12px";
  blePollIntervalInput.style.padding = "8px 10px";
  blePollIntervalInput.style.borderRadius = "6px";
  blePollIntervalInput.style.fontSize = "14px";
  blePollIntervalInput.style.boxSizing = "border-box";
  const typeLabel = document.createElement("label");
  typeLabel.textContent = "Config Device Type";
  typeLabel.style.display = "block";
  typeLabel.style.marginBottom = "6px";
  typeLabel.style.fontWeight = "500";
  typeLabel.style.fontSize = "12px";
  typeLabel.style.color = "#6b7280";
  const typeSelect = document.createElement("select");
  typeSelect.style.width = "100%";
  typeSelect.style.padding = "8px 10px";
  typeSelect.style.marginBottom = "12px";
  typeSelect.style.borderRadius = "6px";
  typeSelect.style.fontSize = "14px";
  typeSelect.style.background = getComputedStyle(document.body).backgroundColor;
  typeSelect.style.color = getComputedStyle(document.body).color;
  typeSelect.style.border = "1px solid #ccc";
  typeSelect.style.boxSizing = "border-box";
  Object.keys(DEVICE_TYPES).forEach((categoryName) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = categoryName;
    DEVICE_TYPES[categoryName].forEach((deviceType) => {
      const opt = document.createElement("option");
      opt.value = deviceType;
      opt.text = deviceType;
      const currentType = device.configDeviceType || device.deviceType || device.type || "";
      opt.selected = currentType === deviceType;
      optgroup.appendChild(opt);
    });
    typeSelect.appendChild(optgroup);
  });
  const div = document.createElement("div");
  div.style.position = "fixed";
  div.style.top = "0";
  div.style.left = "0";
  div.style.width = "100%";
  div.style.height = "100%";
  div.style.background = "rgba(0,0,0,0.7)";
  div.style.display = "flex";
  div.style.alignItems = "center";
  div.style.justifyContent = "center";
  div.style.zIndex = "9999";
  const modal = document.createElement("div");
  modal.style.background = getComputedStyle(document.body).backgroundColor;
  modal.style.color = getComputedStyle(document.body).color;
  modal.style.padding = "0";
  modal.style.borderRadius = "10px";
  modal.style.minWidth = "440px";
  modal.style.maxWidth = "90vw";
  modal.style.boxShadow = "0 8px 32px rgba(0,0,0,0.35)";
  modal.style.overflow = "hidden";
  modal.style.borderTop = "3px solid var(--switchbot-red, #ef4444)";
  const title = document.createElement("h3");
  title.textContent = "Edit Device";
  title.style.marginTop = "0";
  title.style.marginBottom = "16px";
  title.style.padding = "20px 20px 0";
  title.style.fontSize = "18px";
  title.style.fontWeight = "600";
  title.style.color = "var(--switchbot-red, #ef4444)";
  title.style.letterSpacing = "-0.02em";
  const contentDiv = document.createElement("div");
  contentDiv.style.padding = "0 20px 20px";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Device Name";
  nameLabel.style.display = "block";
  nameLabel.style.marginBottom = "6px";
  nameLabel.style.fontWeight = "500";
  nameLabel.style.fontSize = "12px";
  nameLabel.style.color = "#6b7280";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = device.name || device.id;
  nameInput.style.width = "100%";
  nameInput.style.marginBottom = "12px";
  nameInput.style.padding = "8px 10px";
  nameInput.style.borderRadius = "6px";
  nameInput.style.fontSize = "14px";
  nameInput.style.boxSizing = "border-box";
  nameInput.style.transition = "border-color 0.2s ease";
  const apiTypeLabel = document.createElement("label");
  apiTypeLabel.textContent = "Device Type (API - Read Only)";
  apiTypeLabel.style.display = "block";
  apiTypeLabel.style.marginBottom = "6px";
  apiTypeLabel.style.fontWeight = "500";
  apiTypeLabel.style.fontSize = "12px";
  apiTypeLabel.style.color = "#6b7280";
  const apiTypeInput = document.createElement("input");
  apiTypeInput.type = "text";
  apiTypeInput.value = device.deviceType || device.type || "Unknown";
  apiTypeInput.readOnly = true;
  apiTypeInput.style.width = "100%";
  apiTypeInput.style.marginBottom = "12px";
  apiTypeInput.style.padding = "8px 10px";
  apiTypeInput.style.borderRadius = "6px";
  apiTypeInput.style.fontSize = "13px";
  apiTypeInput.style.opacity = "0.6";
  apiTypeInput.style.cursor = "not-allowed";
  apiTypeInput.style.boxSizing = "border-box";
  apiTypeInput.style.backgroundColor = "#f9fafb";
  Object.keys(DEVICE_TYPES).forEach((categoryName) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = categoryName;
    DEVICE_TYPES[categoryName].forEach((deviceType) => {
      const opt = document.createElement("option");
      opt.value = deviceType;
      opt.text = deviceType;
      const currentType = device.configDeviceType || device.deviceType || device.type || "";
      opt.selected = currentType === deviceType;
      optgroup.appendChild(opt);
    });
    typeSelect.appendChild(optgroup);
  });
  const connectionPrefLabel = document.createElement("label");
  connectionPrefLabel.textContent = "Connection Preference";
  connectionPrefLabel.style.display = "block";
  connectionPrefLabel.style.marginBottom = "6px";
  connectionPrefLabel.style.fontWeight = "500";
  connectionPrefLabel.style.fontSize = "12px";
  connectionPrefLabel.style.color = "#6b7280";
  const connectionPrefSelect = document.createElement("select");
  connectionPrefSelect.style.width = "100%";
  connectionPrefSelect.style.marginBottom = "12px";
  connectionPrefSelect.style.padding = "8px 10px";
  connectionPrefSelect.style.borderRadius = "6px";
  connectionPrefSelect.style.fontSize = "14px";
  connectionPrefSelect.style.boxSizing = "border-box";
  ["auto", "ble", "openapi"].forEach((val) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.text = val.charAt(0).toUpperCase() + val.slice(1);
    opt.selected = (device.connectionPreference || "auto") === val;
    connectionPrefSelect.appendChild(opt);
  });
  const roomLabel = document.createElement("label");
  roomLabel.textContent = "Room";
  roomLabel.style.display = "block";
  roomLabel.style.marginBottom = "6px";
  roomLabel.style.fontWeight = "500";
  roomLabel.style.fontSize = "12px";
  roomLabel.style.color = "#6b7280";
  const roomInput = document.createElement("input");
  roomInput.type = "text";
  roomInput.value = device.room || "";
  roomInput.placeholder = "Optional room/location metadata";
  roomInput.style.width = "100%";
  roomInput.style.marginBottom = "12px";
  roomInput.style.padding = "8px 10px";
  roomInput.style.borderRadius = "6px";
  roomInput.style.fontSize = "14px";
  roomInput.style.boxSizing = "border-box";
  const encryptionKeyLabel = document.createElement("label");
  encryptionKeyLabel.textContent = "BLE Encryption Key (optional)";
  encryptionKeyLabel.style.display = "block";
  encryptionKeyLabel.style.marginBottom = "6px";
  encryptionKeyLabel.style.fontWeight = "500";
  encryptionKeyLabel.style.fontSize = "12px";
  encryptionKeyLabel.style.color = "#6b7280";
  const encryptionKeyInput = document.createElement("input");
  encryptionKeyInput.type = "password";
  encryptionKeyInput.value = device.encryptionKey || "";
  encryptionKeyInput.placeholder = "Paste device BLE encryption key";
  encryptionKeyInput.style.width = "100%";
  encryptionKeyInput.style.marginBottom = "12px";
  encryptionKeyInput.style.padding = "8px 10px";
  encryptionKeyInput.style.borderRadius = "6px";
  encryptionKeyInput.style.fontSize = "14px";
  encryptionKeyInput.style.boxSizing = "border-box";
  const keyIdLabel = document.createElement("label");
  keyIdLabel.textContent = "BLE Key ID (optional)";
  keyIdLabel.style.display = "block";
  keyIdLabel.style.marginBottom = "6px";
  keyIdLabel.style.fontWeight = "500";
  keyIdLabel.style.fontSize = "12px";
  keyIdLabel.style.color = "#6b7280";
  const keyIdInput = document.createElement("input");
  keyIdInput.type = "text";
  keyIdInput.value = device.keyId || "";
  keyIdInput.placeholder = "e.g. ff";
  keyIdInput.style.width = "100%";
  keyIdInput.style.marginBottom = "12px";
  keyIdInput.style.padding = "8px 10px";
  keyIdInput.style.borderRadius = "6px";
  keyIdInput.style.fontSize = "14px";
  keyIdInput.style.boxSizing = "border-box";
  const errorMessage = document.createElement("div");
  errorMessage.style.color = "var(--switchbot-red, #ef4444)";
  errorMessage.style.marginBottom = "12px";
  errorMessage.style.fontSize = "12px";
  errorMessage.style.display = "none";
  errorMessage.style.padding = "8px 10px";
  errorMessage.style.background = "var(--switchbot-red-light, #fee2e2)";
  errorMessage.style.borderRadius = "6px";
  errorMessage.style.fontWeight = "500";
  const buttons = document.createElement("div");
  buttons.style.display = "flex";
  buttons.style.gap = "10px";
  buttons.style.justifyContent = "flex-end";
  buttons.style.marginTop = "18px";
  buttons.style.paddingTop = "18px";
  buttons.style.borderTop = "1px solid rgba(0, 0, 0, 0.08)";
  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.className = "secondary";
  cancelBtn.style.background = "#6b7280";
  cancelBtn.style.padding = "8px 16px";
  cancelBtn.style.fontSize = "13px";
  cancelBtn.onclick = () => div.remove();
  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.style.background = "var(--switchbot-red, #ef4444)";
  saveBtn.style.padding = "8px 20px";
  saveBtn.style.fontSize = "13px";
  saveBtn.onclick = async () => {
    try {
      const { updateDevice: updateDevice2, syncParentPluginConfigFromDisk: syncParentPluginConfigFromDisk2, fetchDevices: fetchDevices2 } = await Promise.resolve().then(() => (init_api(), api_exports));
      const { renderDeviceList: renderDeviceList2 } = await Promise.resolve().then(() => (init_render(), render_exports));
      const params = {
        deviceId: device.id,
        configDeviceName: nameInput.value || void 0,
        configDeviceType: typeSelect.value,
        connectionPreference: connectionPrefSelect.value,
        room: roomInput.value || void 0,
        encryptionKey: encryptionKeyInput.value || void 0,
        keyId: keyIdInput.value || void 0,
        refreshRate: Number(openApiRefreshInput.value) || 300,
        blePollingEnabled: blePollingEnabledInput.checked,
        blePollIntervalMs: Number(blePollIntervalInput.value) || 6e5
      };
      const options = {};
      if (params.connectionPreference !== void 0) {
        options.connectionPreference = params.connectionPreference;
      }
      if (params.room !== void 0) {
        options.room = params.room;
      }
      if (params.encryptionKey !== void 0) {
        options.encryptionKey = params.encryptionKey;
      }
      if (params.keyId !== void 0) {
        options.keyId = params.keyId;
      }
      if (params.refreshRate !== void 0) {
        options.refreshRate = params.refreshRate;
      }
      if (params.blePollingEnabled !== void 0) {
        options.blePollingEnabled = params.blePollingEnabled;
      }
      if (params.blePollIntervalMs !== void 0) {
        options.blePollIntervalMs = params.blePollIntervalMs;
      }
      await updateDevice2(
        params.deviceId,
        params.configDeviceName,
        params.configDeviceType,
        options
      );
      await syncParentPluginConfigFromDisk2();
      contentDiv.appendChild(openApiRefreshLabel);
      contentDiv.appendChild(openApiRefreshInput);
      uiLog.info("[Edit Device] Refreshing device list after update");
      const list = await fetchDevices2();
      renderDeviceList2(list);
      div.remove();
    } catch (e) {
      uiLog.error("Update error:", e);
      errorMessage.textContent = `Error: ${e instanceof Error ? e.message : "Failed to update device"}`;
      errorMessage.style.display = "block";
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
var init_modals = __esm({
  "src/homebridge-ui/public/js/modals.ts"() {
    "use strict";
    init_constants();
    init_logger();
  }
});

// src/homebridge-ui/public/js/devices-delete.ts
var devices_delete_exports = {};
__export(devices_delete_exports, {
  deleteAllDevicesFromConfig: () => deleteAllDevicesFromConfig,
  deleteDeviceFromConfig: () => deleteDeviceFromConfig
});
async function confirmDeleteDialog(deviceNameOrId) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(0,0,0,0.6)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "10000";
    const modal = document.createElement("div");
    modal.style.background = getComputedStyle(document.body).backgroundColor;
    modal.style.color = getComputedStyle(document.body).color;
    modal.style.padding = "20px";
    modal.style.borderRadius = "10px";
    modal.style.minWidth = "340px";
    modal.style.maxWidth = "90vw";
    modal.style.boxShadow = "0 12px 40px rgba(0,0,0,0.35)";
    const title = document.createElement("h3");
    title.textContent = "Delete Device";
    title.style.margin = "0 0 10px 0";
    const message = document.createElement("p");
    message.textContent = `Remove "${deviceNameOrId}" from configuration?`;
    message.style.margin = "0 0 16px 0";
    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.justifyContent = "flex-end";
    actions.style.gap = "8px";
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.background = "#6b7280";
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.style.background = "#ef4444";
    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };
    cancelBtn.onclick = () => cleanup(false);
    deleteBtn.onclick = () => cleanup(true);
    overlay.addEventListener("click", (event) => {
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
async function deleteDeviceFromConfig(deviceId, deviceName) {
  uiLog.info("Delete button clicked for device:", deviceId, deviceName);
  const confirmed = await confirmDeleteDialog(deviceName || deviceId);
  if (!confirmed) {
    uiLog.info("Delete cancelled by user");
    return;
  }
  try {
    showBusyUi();
    uiLog.info("Deleting device from config:", deviceId);
    const resp = await deleteDevice(deviceId);
    uiLog.info("Delete response:", resp);
    uiLog.info("Syncing parent config from disk...");
    const synced = await syncParentPluginConfigFromDisk(true);
    if (!synced) {
      toastWarning("Device deleted, but configuration sync failed");
    }
    uiLog.info("Refreshing device list...");
    const list = await fetchDevices();
    uiLog.info("Rendering devices:", list.length);
    renderDeviceList(list);
    uiLog.info("\u2713 Device deleted successfully");
    toastSuccess(`Device "${deviceName || deviceId}" deleted successfully`);
  } catch (e) {
    uiLog.error("Delete error:", e);
    toastError(e instanceof Error ? e.message : "Failed to delete device");
  } finally {
    hideBusyUi();
  }
}
async function confirmDeleteAllDialog(deviceCount) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(0,0,0,0.7)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "10000";
    const modal = document.createElement("div");
    modal.style.background = getComputedStyle(document.body).backgroundColor;
    modal.style.color = getComputedStyle(document.body).color;
    modal.style.padding = "20px";
    modal.style.borderRadius = "10px";
    modal.style.minWidth = "380px";
    modal.style.maxWidth = "90vw";
    modal.style.boxShadow = "0 12px 40px rgba(0,0,0,0.35)";
    modal.style.borderTop = "3px solid #ef4444";
    const title = document.createElement("h3");
    title.textContent = "\u26A0\uFE0F Remove All Devices";
    title.style.margin = "0 0 12px 0";
    title.style.color = "#ef4444";
    const message = document.createElement("p");
    message.innerHTML = `Are you sure you want to remove <strong>all ${deviceCount} device(s)</strong> from your configuration?<br><br>This action cannot be undone.`;
    message.style.margin = "0 0 18px 0";
    message.style.lineHeight = "1.5";
    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.justifyContent = "flex-end";
    actions.style.gap = "10px";
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.background = "#6b7280";
    cancelBtn.style.padding = "8px 16px";
    cancelBtn.style.fontSize = "13px";
    cancelBtn.className = "secondary";
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Remove All";
    deleteBtn.style.background = "#ef4444";
    deleteBtn.style.padding = "8px 20px";
    deleteBtn.style.fontSize = "13px";
    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };
    cancelBtn.onclick = () => cleanup(false);
    deleteBtn.onclick = () => cleanup(true);
    overlay.addEventListener("click", (event) => {
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
async function deleteAllDevicesFromConfig() {
  uiLog.info("Remove All Devices button clicked");
  try {
    const list = await fetchDevices();
    if (!list || list.length === 0) {
      toastWarning("No devices to remove");
      return;
    }
    const confirmed = await confirmDeleteAllDialog(list.length);
    if (!confirmed) {
      uiLog.info("Remove all cancelled by user");
      return;
    }
    showBusyUi();
    uiLog.info("Deleting all devices from config");
    const resp = await deleteAllDevices();
    uiLog.info("Delete all response:", resp);
    uiLog.info("Syncing parent config from disk...");
    const synced = await syncParentPluginConfigFromDisk(true);
    if (!synced) {
      toastWarning("Devices deleted, but configuration sync failed");
    }
    uiLog.info("Refreshing device list...");
    const updatedList = await fetchDevices();
    uiLog.info("Rendering devices:", updatedList.length);
    renderDeviceList(updatedList);
    const deletedCount = resp?.deletedCount || 0;
    uiLog.info(`\u2713 Removed ${deletedCount} device(s) successfully`);
    toastSuccess(`Removed ${deletedCount} device(s) successfully`);
  } catch (e) {
    uiLog.error("Delete all error:", e);
    toastError(e instanceof Error ? e.message : "Failed to delete all devices");
  } finally {
    hideBusyUi();
  }
}
var init_devices_delete = __esm({
  "src/homebridge-ui/public/js/devices-delete.ts"() {
    "use strict";
    init_api();
    init_logger();
    init_modal();
    init_render();
    init_toast();
  }
});

// src/homebridge-ui/public/js/render.ts
var render_exports = {};
__export(render_exports, {
  filterDevices: () => filterDevices,
  getDiscoveryPreferences: () => getDiscoveryPreferences,
  getRssiSignalQuality: () => getRssiSignalQuality,
  renderBadge: () => renderBadge,
  renderConnectionBadge: () => renderConnectionBadge,
  renderDeviceDetailsPanel: () => renderDeviceDetailsPanel,
  renderDeviceList: () => renderDeviceList,
  renderDiscoveredDevices: () => renderDiscoveredDevices,
  renderIRBadge: () => renderIRBadge,
  renderSignalBars: () => renderSignalBars,
  renderSignalQualityBadge: () => renderSignalQualityBadge,
  setDiscoveryPreferences: () => setDiscoveryPreferences,
  sortDevices: () => sortDevices
});
async function copyTextWithFallback(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.cssText = "position:fixed;left:-9999px;opacity:0;pointer-events:none";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    document.execCommand("copy");
    textarea.remove();
  }
}
function getRssiSignalQuality(rssi) {
  if (!rssi || rssi === 0) {
    return {
      level: "unknown",
      color: "#999",
      bgColor: "#f5f5f5",
      description: "Signal strength unknown",
      bars: 0
    };
  }
  const dbm = Math.floor(rssi);
  if (dbm > -60) {
    return {
      level: "excellent",
      color: "#34a853",
      bgColor: "#e8f5e9",
      description: `Excellent (${dbm} dBm)`,
      bars: 4
    };
  } else if (dbm > -75) {
    return {
      level: "good",
      color: "#fbbc04",
      bgColor: "#fffde7",
      description: `Good (${dbm} dBm)`,
      bars: 3
    };
  } else if (dbm > -85) {
    return {
      level: "fair",
      color: "#ff9800",
      bgColor: "#fff3e0",
      description: `Fair (${dbm} dBm)`,
      bars: 2
    };
  } else {
    return {
      level: "poor",
      color: "#ea4335",
      bgColor: "#ffebee",
      description: `Poor (${dbm} dBm) - unreliable`,
      bars: 1
    };
  }
}
function renderSignalBars(rssi) {
  const quality = getRssiSignalQuality(rssi);
  const container = document.createElement("span");
  container.style.display = "inline-flex";
  container.style.gap = "2px";
  container.style.alignItems = "center";
  container.style.marginLeft = "8px";
  container.style.fontSize = "12px";
  for (let i = 1; i <= 4; i++) {
    const bar = document.createElement("span");
    bar.style.height = `${i * 3}px`;
    bar.style.width = "3px";
    bar.style.borderRadius = "1px";
    bar.style.border = `1px solid ${quality.color}`;
    if (i <= quality.bars) {
      bar.style.backgroundColor = quality.color;
    } else {
      bar.style.backgroundColor = "transparent";
    }
    container.appendChild(bar);
  }
  container.title = quality.description;
  return container;
}
function renderSignalQualityBadge(rssi) {
  const quality = getRssiSignalQuality(rssi);
  const badge = document.createElement("span");
  badge.textContent = quality.level.charAt(0).toUpperCase() + quality.level.slice(1);
  badge.style.cssText = `
    background: ${quality.color};
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
  `;
  badge.title = quality.description;
  return badge;
}
function renderBadge(text, style) {
  const badge = document.createElement("span");
  badge.textContent = text;
  badge.style.cssText = style;
  return badge;
}
function renderConnectionBadge(connectionType) {
  if (!connectionType) {
    return null;
  }
  const badge = renderBadge(connectionType, "");
  if (connectionType === "BLE") {
    badge.style.cssText = "background: #4285f4; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 8px;";
  } else if (connectionType === "Both") {
    badge.style.cssText = "background: #34a853; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 8px;";
  } else {
    badge.style.cssText = "background: #9e9e9e; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 8px;";
  }
  return badge;
}
function renderIRBadge() {
  return renderBadge(
    "IR",
    "background: #ff6b35; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 8px;"
  );
}
function normalizeId2(value) {
  return String(value ?? "").trim().toLowerCase();
}
function scrollToConfiguredDevice(deviceId) {
  const normalizedId = normalizeId2(deviceId);
  const target = document.querySelector(`[data-device-id="${normalizedId}"]`);
  if (!target) {
    return;
  }
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  const originalOutline = target.style.outline;
  const originalBackground = target.style.background;
  target.style.outline = "2px solid var(--switchbot-red, #ef4444)";
  target.style.background = "rgba(239, 68, 68, 0.08)";
  setTimeout(() => {
    target.style.outline = originalOutline;
    target.style.background = originalBackground;
  }, 1800);
}
function createConnectionTestControls(device) {
  const controls = document.createElement("div");
  controls.style.display = "inline-flex";
  controls.style.alignItems = "center";
  controls.style.gap = "6px";
  const button = document.createElement("button");
  button.textContent = "Test Connection";
  button.className = "secondary";
  button.style.padding = "4px 9px";
  button.style.fontSize = "11px";
  const status = document.createElement("span");
  status.style.fontSize = "10px";
  status.style.opacity = "0.85";
  status.style.whiteSpace = "normal";
  status.style.overflowWrap = "anywhere";
  button.onclick = async () => {
    const startedAt = Date.now();
    button.disabled = true;
    button.textContent = "Testing...";
    status.textContent = "Checking...";
    status.style.color = "#6b7280";
    try {
      const { testDeviceConnection: testDeviceConnection2 } = await Promise.resolve().then(() => (init_api(), api_exports));
      const result = await testDeviceConnection2({
        deviceId: String(device?.id || device?.deviceId || ""),
        connectionType: device?.connectionType,
        address: device?.address
      });
      const measuredLatency = Number(result?.latencyMs) > 0 ? Number(result.latencyMs) : Date.now() - startedAt;
      if (result?.success) {
        const method = result?.method || "Auto";
        status.textContent = `\u2713 ${method} \xB7 ${measuredLatency}ms`;
        status.style.color = "#16a34a";
      } else {
        const detail = result?.message ? ` \xB7 ${result.message}` : "";
        status.textContent = `\u2717 Failed \xB7 ${measuredLatency}ms${detail}`;
        status.style.color = "#dc2626";
      }
    } catch (e) {
      status.textContent = `\u2717 Failed \xB7 ${Date.now() - startedAt}ms`;
      status.style.color = "#dc2626";
    } finally {
      button.disabled = false;
      button.textContent = "Test Connection";
    }
  };
  controls.appendChild(button);
  controls.appendChild(status);
  return controls;
}
function formatLastSeen(value) {
  if (!value) {
    return "N/A";
  }
  try {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  } catch (_e) {
    return String(value);
  }
}
function renderDeviceDetailsPanel(device) {
  const details = document.createElement("div");
  details.className = "device-details-panel";
  details.style.borderTop = "1px solid #ddd";
  details.style.padding = "8px";
  details.style.borderRadius = "4px";
  details.style.fontSize = "12px";
  details.style.marginTop = "4px";
  const batteryHistoryKey = `batteryHistory:${device?.id || device?.deviceId}`;
  let batteryHistory = [];
  try {
    const raw = localStorage.getItem(batteryHistoryKey);
    if (raw) {
      batteryHistory = JSON.parse(raw);
    }
  } catch (e) {
  }
  const now = Date.now();
  if (typeof device?.battery === "number") {
    const last = batteryHistory.at(-1);
    if (!last || last.value !== device.battery || now - last.ts > 60 * 60 * 1e3) {
      batteryHistory.push({ value: device.battery, ts: now });
      if (batteryHistory.length > 30) {
        batteryHistory = batteryHistory.slice(-30);
      }
      try {
        localStorage.setItem(batteryHistoryKey, JSON.stringify(batteryHistory));
      } catch (e) {
      }
    }
  }
  const rows = [
    { label: "Name", value: String(device?.name || device?.configDeviceName || "N/A") },
    { label: "Device ID", value: String(device?.id || device?.deviceId || "N/A"), copyable: !!(device?.id || device?.deviceId) },
    { label: "MAC Address", value: String(device?.address || "N/A"), copyable: !!device?.address },
    { label: "Device Type", value: String(device?.type || device?.configDeviceType || "N/A") },
    { label: "Model", value: String(device?.model || "N/A") },
    { label: "Hub ID", value: String(device?.hubDeviceId || "N/A") },
    { label: "Battery", value: device?.battery !== void 0 && device?.battery !== null ? `${device.battery}%` : "N/A" },
    { label: "Firmware", value: String(device?.version || device?.firmware || "N/A") },
    { label: "Cloud Service", value: device?.enabled === false ? "Disabled" : "Enabled" },
    { label: "Last Seen", value: formatLastSeen(device?.lastSeen || device?.lastseen || device?.updatedAt) }
  ];
  for (const row of rows) {
    const line = document.createElement("div");
    line.style.display = "flex";
    line.style.alignItems = "center";
    line.style.justifyContent = "space-between";
    line.style.gap = "8px";
    line.style.padding = "2px 0";
    const label = document.createElement("span");
    label.style.fontWeight = "600";
    label.style.minWidth = "110px";
    label.textContent = `${row.label}:`;
    const valueWrap = document.createElement("span");
    valueWrap.style.display = "inline-flex";
    valueWrap.style.alignItems = "center";
    valueWrap.style.gap = "6px";
    valueWrap.style.flex = "1";
    valueWrap.style.justifyContent = "flex-end";
    valueWrap.style.minWidth = "0";
    const value = document.createElement("span");
    value.style.fontFamily = "monospace";
    value.style.fontSize = "11px";
    value.style.opacity = "0.9";
    value.style.whiteSpace = "normal";
    value.style.overflowWrap = "anywhere";
    value.style.wordBreak = "break-word";
    value.style.textAlign = "right";
    value.textContent = row.value;
    valueWrap.appendChild(value);
    if (row.copyable && row.value && row.value !== "N/A") {
      const copyBtn = document.createElement("button");
      copyBtn.textContent = "\u{1F4CB}";
      copyBtn.title = `Copy ${row.label}`;
      copyBtn.style.padding = "2px 6px";
      copyBtn.style.fontSize = "10px";
      copyBtn.style.lineHeight = "1";
      copyBtn.style.background = "#e5e7eb";
      copyBtn.style.color = "#111827";
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(row.value);
          copyBtn.textContent = "\u2713";
          setTimeout(() => {
            copyBtn.textContent = "\u{1F4CB}";
          }, 1200);
        } catch (_e) {
          copyBtn.textContent = "!";
          setTimeout(() => {
            copyBtn.textContent = "\u{1F4CB}";
          }, 1200);
        }
      };
      valueWrap.appendChild(copyBtn);
    }
    line.appendChild(label);
    line.appendChild(valueWrap);
    details.appendChild(line);
    if (row.label === "Battery" && Array.isArray(batteryHistory) && batteryHistory.length > 1) {
      const chart = document.createElement("div");
      chart.style.margin = "2px 0 8px 0";
      chart.style.width = "100%";
      chart.style.height = "28px";
      chart.style.display = "flex";
      const w = 120;
      const h = 24;
      const pad = 2;
      const min = Math.min(...batteryHistory.map((b) => b.value), 100);
      const max = Math.max(...batteryHistory.map((b) => b.value), 0);
      const range = max - min || 1;
      const points = batteryHistory.map((b, i) => {
        const x = pad + i * (w - 2 * pad) / (batteryHistory.length - 1);
        const y = pad + (h - 2 * pad) * (1 - (b.value - min) / range);
        return `${x},${y}`;
      }).join(" ");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svg.style.display = "block";
      svg.style.background = "#f3f4f6";
      svg.style.borderRadius = "3px";
      svg.style.marginTop = "2px";
      svg.style.boxShadow = "0 1px 2px #0001";
      const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      polyline.setAttribute("points", points);
      polyline.setAttribute("fill", "none");
      polyline.setAttribute("stroke", "#2563eb");
      polyline.setAttribute("stroke-width", "2");
      svg.appendChild(polyline);
      batteryHistory.forEach((b, i) => {
        const x = pad + i * (w - 2 * pad) / (batteryHistory.length - 1);
        const y = pad + (h - 2 * pad) * (1 - (b.value - min) / range);
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", String(x));
        circle.setAttribute("cy", String(y));
        circle.setAttribute("r", "2.5");
        circle.setAttribute("fill", "#2563eb");
        svg.appendChild(circle);
      });
      const minLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      minLabel.setAttribute("x", "2");
      minLabel.setAttribute("y", String(h - 2));
      minLabel.setAttribute("font-size", "9");
      minLabel.setAttribute("fill", "#888");
      minLabel.textContent = `${min}%`;
      svg.appendChild(minLabel);
      const maxLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      maxLabel.setAttribute("x", String(w - 18));
      maxLabel.setAttribute("y", "10");
      maxLabel.setAttribute("font-size", "9");
      maxLabel.setAttribute("fill", "#888");
      maxLabel.textContent = `${max}%`;
      svg.appendChild(maxLabel);
      chart.appendChild(svg);
      details.appendChild(chart);
    }
  }
  const featureKeys = [
    "airQuality",
    "pm25",
    "pm10",
    "voc",
    "co2",
    "humidity",
    "temperature",
    "preset",
    "mode",
    "presetMode",
    "direction",
    "calibration",
    "multiCommand",
    "extendedInfo",
    "segmentedControl",
    "features",
    "capabilities",
    "state"
  ];
  const shown = new Set(rows.map((r) => r.label.toLowerCase().replace(SPACES_REGEX, "")));
  for (const key of featureKeys) {
    if (device && device[key] !== void 0 && !shown.has(key.toLowerCase())) {
      const line = document.createElement("div");
      line.style.display = "flex";
      line.style.alignItems = "center";
      line.style.justifyContent = "space-between";
      line.style.gap = "8px";
      line.style.padding = "2px 0";
      const label = document.createElement("span");
      label.style.fontWeight = "600";
      label.style.minWidth = "110px";
      label.textContent = `${key.replace(CAMELCASE_REGEX, " $1").replace(FIRST_CHAR_REGEX, (s) => s.toUpperCase())}:`;
      const value = document.createElement("span");
      value.style.fontFamily = "monospace";
      value.style.fontSize = "11px";
      value.style.opacity = "0.9";
      value.style.whiteSpace = "normal";
      value.style.overflowWrap = "anywhere";
      value.style.wordBreak = "break-word";
      value.style.textAlign = "right";
      value.textContent = typeof device[key] === "object" ? JSON.stringify(device[key]) : String(device[key]);
      line.appendChild(label);
      line.appendChild(value);
      details.appendChild(line);
    }
  }
  return details;
}
async function renderDiscoveredDevices(devices, options = {}) {
  const ul = document.createElement("ul");
  ul.className = "device-grid";
  ul.style.maxHeight = "400px";
  ul.style.overflowY = "auto";
  ul.style.marginTop = "12px";
  ul.style.padding = "0";
  ul.style.listStyle = "none";
  const { addDeviceToConfig: addDeviceToConfig3 } = await Promise.resolve().then(() => (init_discovery(), discovery_exports));
  const { loadConfiguredDevices: loadConfiguredDevices2 } = await Promise.resolve().then(() => (init_devices(), devices_exports));
  const configuredIds = options.configuredIds ?? /* @__PURE__ */ new Set();
  const selectedIds = options.selectedIds ?? /* @__PURE__ */ new Set();
  const onToggleSelect = options.onToggleSelect;
  for (const d of devices) {
    if (!d || !d.id && !d.deviceId || !d.name && !d.type) {
      console.warn("[SwitchBot][Discovery][renderDiscoveredDevices] Device missing required fields:", d);
    }
    const deviceId = normalizeId2(d.id);
    const alreadyAdded = configuredIds.has(deviceId);
    const li = document.createElement("li");
    li.className = "device-item";
    li.style.display = "flex";
    li.style.flexDirection = "column";
    li.style.alignItems = "stretch";
    li.style.justifyContent = "flex-start";
    li.style.padding = "5px 8px";
    li.style.marginBottom = "0";
    li.style.borderRadius = "5px";
    li.style.transition = "all 0.2s ease";
    const info = document.createElement("div");
    info.style.flex = "1 1 auto";
    info.style.width = "100%";
    info.style.minWidth = "0";
    const nameContainer = document.createElement("div");
    nameContainer.style.display = "flex";
    nameContainer.style.alignItems = "center";
    nameContainer.style.marginBottom = "0";
    nameContainer.style.flexWrap = "wrap";
    nameContainer.style.gap = "4px";
    const name = document.createElement("div");
    name.style.fontWeight = "500";
    name.style.fontSize = "13px";
    name.textContent = d.name || d.id;
    const selectCheckbox = document.createElement("input");
    selectCheckbox.type = "checkbox";
    selectCheckbox.style.width = "auto";
    selectCheckbox.style.margin = "0 2px 0 0";
    selectCheckbox.checked = selectedIds.has(deviceId);
    if (alreadyAdded) {
      selectCheckbox.disabled = true;
      selectCheckbox.title = "Already configured";
    }
    selectCheckbox.onchange = () => {
      onToggleSelect?.(d, selectCheckbox.checked);
      window.dispatchEvent(new CustomEvent("discovery-selection-changed"));
    };
    nameContainer.appendChild(selectCheckbox);
    nameContainer.appendChild(name);
    if (d.firmwareUpdateAvailable) {
      const fwBadge = document.createElement("span");
      fwBadge.textContent = "Update Available";
      fwBadge.style.cssText = "background: #fb923c; color: #111; padding: 1px 7px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 6px;";
      fwBadge.title = "A firmware update is available for this device.";
      nameContainer.appendChild(fwBadge);
    }
    let offline = false;
    const lastSeen = d.lastSeen || d.lastseen || d.updatedAt;
    if (typeof d.offline === "boolean") {
      offline = d.offline;
    } else if (lastSeen) {
      try {
        const last = new Date(lastSeen).getTime();
        if (!Number.isNaN(last)) {
          if (Date.now() - last > 1e3 * 60 * 60) {
            offline = true;
          }
        }
      } catch {
      }
    }
    if (offline) {
      const offlineBadge = document.createElement("span");
      offlineBadge.textContent = "Offline";
      offlineBadge.style.cssText = "background: #dc2626; color: white; padding: 1px 7px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 6px;";
      offlineBadge.title = "Device is offline or unreachable.";
      nameContainer.appendChild(offlineBadge);
    }
    const expandedDetails = document.createElement("div");
    expandedDetails.style.display = "none";
    expandedDetails.appendChild(renderDeviceDetailsPanel(d));
    const expandBtn = document.createElement("button");
    expandBtn.textContent = "\u25BE";
    expandBtn.title = "Show details";
    expandBtn.style.padding = "2px 6px";
    expandBtn.style.fontSize = "11px";
    expandBtn.style.marginLeft = "4px";
    expandBtn.style.background = "#e5e7eb";
    expandBtn.style.color = "#111827";
    expandBtn.style.transition = "transform 0.2s ease";
    expandBtn.onclick = () => {
      const isHidden = expandedDetails.style.display === "none";
      expandedDetails.style.display = isHidden ? "block" : "none";
      expandBtn.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
    };
    nameContainer.appendChild(expandBtn);
    const duplicateBadge = document.createElement("span");
    duplicateBadge.textContent = alreadyAdded ? "\u2713 Already Added" : "\u2795 New Device";
    duplicateBadge.style.cssText = alreadyAdded ? "background: #16a34a; color: white; padding: 1px 5px; border-radius: 3px; font-size: 9px; font-weight: 600;" : "background: #2563eb; color: white; padding: 1px 5px; border-radius: 3px; font-size: 9px; font-weight: 600;";
    nameContainer.appendChild(duplicateBadge);
    if (d.connectionType) {
      const badge = renderConnectionBadge(d.connectionType);
      if (badge) {
        nameContainer.appendChild(badge);
      }
    }
    if (d.isIR) {
      nameContainer.appendChild(renderIRBadge());
    }
    if (d.rssi !== void 0 && d.rssi !== null && d.rssi !== 0) {
      nameContainer.appendChild(renderSignalBars(d.rssi));
      nameContainer.appendChild(renderSignalQualityBadge(d.rssi));
    }
    if (typeof d.battery === "number" && d.battery < 20) {
      const batteryWarn = document.createElement("span");
      batteryWarn.textContent = `\u26A0\uFE0F ${d.battery}%`;
      batteryWarn.style.cssText = d.battery < 10 ? "background: #dc2626; color: white; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 6px;" : "background: #fbbf24; color: #111; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 6px;";
      batteryWarn.title = d.battery < 10 ? "Battery critically low" : "Battery low";
      nameContainer.appendChild(batteryWarn);
    }
    if (!d || !d.id && !d.deviceId || !d.name && !d.type) {
      console.warn("[SwitchBot][Discovery][renderDeviceDetailsPanel] Device missing required fields:", d);
    }
    const details = document.createElement("div");
    details.style.fontSize = "10px";
    details.style.opacity = "0.7";
    details.style.marginTop = "0";
    details.style.fontFamily = "monospace";
    details.style.whiteSpace = "normal";
    details.style.overflowWrap = "anywhere";
    details.style.wordBreak = "break-word";
    let detailsText = `ID: ${d.id} | Type: ${d.type} | Model: ${d.model || "N/A"}`;
    if (d.hubDeviceId) {
      detailsText += ` | Hub: ${d.hubDeviceId}`;
    }
    if (d.address) {
      detailsText += ` | MAC: ${d.address}`;
    }
    details.textContent = detailsText;
    info.appendChild(nameContainer);
    info.appendChild(details);
    info.appendChild(expandedDetails);
    const addBtn = document.createElement("button");
    addBtn.textContent = alreadyAdded ? "Already Added" : "Add to Config";
    addBtn.style.marginLeft = "0";
    addBtn.style.marginTop = "2px";
    addBtn.style.padding = "4px 9px";
    addBtn.style.fontSize = "11px";
    addBtn.style.whiteSpace = "nowrap";
    addBtn.style.flexShrink = "0";
    addBtn.disabled = alreadyAdded;
    if (alreadyAdded) {
      addBtn.style.opacity = "0.65";
      addBtn.style.cursor = "not-allowed";
      addBtn.style.background = "#6b7280";
    }
    addBtn.onclick = async () => {
      if (alreadyAdded) {
        return;
      }
      await addDeviceToConfig3(d);
    };
    if (alreadyAdded) {
      const viewBtn = document.createElement("button");
      viewBtn.textContent = "View in Config";
      viewBtn.className = "secondary";
      viewBtn.style.marginLeft = "0";
      viewBtn.style.padding = "4px 9px";
      viewBtn.style.fontSize = "11px";
      viewBtn.onclick = async () => {
        await loadConfiguredDevices2();
        scrollToConfiguredDevice(d.id);
      };
      li.appendChild(info);
      const actions2 = document.createElement("div");
      actions2.className = "device-actions";
      actions2.style.display = "flex";
      actions2.style.alignItems = "center";
      actions2.style.flexWrap = "wrap";
      actions2.style.justifyContent = "flex-start";
      actions2.style.marginLeft = "0";
      actions2.style.width = "100%";
      actions2.style.marginTop = "2px";
      actions2.style.gap = "5px";
      actions2.appendChild(viewBtn);
      actions2.appendChild(addBtn);
      actions2.appendChild(createConnectionTestControls(d));
      li.appendChild(actions2);
      ul.appendChild(li);
      continue;
    }
    const actions = document.createElement("div");
    actions.className = "device-actions";
    actions.style.display = "flex";
    actions.style.flexWrap = "wrap";
    actions.style.justifyContent = "flex-start";
    actions.style.marginLeft = "0";
    actions.style.width = "100%";
    actions.style.marginTop = "2px";
    actions.style.gap = "5px";
    actions.appendChild(addBtn);
    actions.appendChild(createConnectionTestControls(d));
    li.appendChild(info);
    li.appendChild(actions);
    ul.appendChild(li);
  }
  return ul;
}
function filterDevices(devices, connectionType = "all", searchQuery = "") {
  let filtered = [...devices];
  if (connectionType !== "all") {
    filtered = filtered.filter((d) => {
      if (connectionType === "ir") {
        return d.isIR === true;
      }
      if (connectionType === "ble") {
        return d.connectionType === "BLE" || d.connectionType?.includes("BLE");
      }
      if (connectionType === "api") {
        return d.connectionType === "OpenAPI" || d.connectionType === "API" || d.connectionType?.includes("API");
      }
      if (connectionType === "both") {
        return d.connectionType === "Both" || d.connectionType?.includes("Both");
      }
      return true;
    });
  }
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter((d) => {
      const name = (d.name || "").toLowerCase();
      const id = (d.id || "").toLowerCase();
      const type = (d.type || "").toLowerCase();
      const model = (d.model || "").toLowerCase();
      return name.includes(query) || id.includes(query) || type.includes(query) || model.includes(query);
    });
  }
  return filtered;
}
function sortDevices(devices, sortBy = "name") {
  const sorted = [...devices];
  switch (sortBy) {
    case "signal": {
      sorted.sort((a, b) => {
        const aRssi = a.rssi || 0;
        const bRssi = b.rssi || 0;
        return bRssi - aRssi;
      });
      break;
    }
    case "type": {
      sorted.sort((a, b) => {
        const aType = (a.type || "").localeCompare(b.type || "");
        return aType;
      });
      break;
    }
    case "connection": {
      const connectionOrder = {
        Both: 0,
        BLE: 1,
        OpenAPI: 2,
        API: 2,
        Unknown: 3
      };
      sorted.sort((a, b) => {
        const aOrder = connectionOrder[a.connectionType || "Unknown"] ?? 3;
        const bOrder = connectionOrder[b.connectionType || "Unknown"] ?? 3;
        return aOrder - bOrder;
      });
      break;
    }
    case "name":
    default: {
      sorted.sort((a, b) => (a.name || a.id || "").localeCompare(b.name || b.id || ""));
      break;
    }
  }
  return sorted;
}
function getDiscoveryPreferences() {
  try {
    const stored = localStorage.getItem("discoveryPreferences");
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (_e) {
  }
  return {
    connectionType: "all",
    sortBy: "name",
    searchQuery: ""
  };
}
function setDiscoveryPreferences(preferences) {
  try {
    localStorage.setItem("discoveryPreferences", JSON.stringify(preferences));
  } catch (_e) {
  }
}
function renderDeviceList(list) {
  const ul = document.getElementById("devices");
  const status = document.getElementById("status");
  const removeAllContainer = document.getElementById("removeAllContainer");
  if (!ul || !status) {
    return;
  }
  if (!list.length) {
    status.textContent = "No devices found in config.";
    ul.innerHTML = "";
    if (removeAllContainer) {
      removeAllContainer.style.display = "none";
    }
    return;
  }
  status.textContent = `Found ${list.length} device(s)`;
  ul.classList.add("device-grid");
  ul.style.padding = "0";
  ul.innerHTML = "";
  if (removeAllContainer) {
    removeAllContainer.style.display = "block";
  }
  for (const d of list) {
    const li = document.createElement("li");
    li.className = "device-item";
    li.setAttribute("data-device-id", normalizeId2(d.id));
    li.style.display = "flex";
    li.style.flexDirection = "column";
    li.style.alignItems = "stretch";
    li.style.padding = "5px 8px";
    li.style.marginBottom = "0";
    const info = document.createElement("div");
    info.style.flex = "1 1 auto";
    info.style.width = "100%";
    info.style.minWidth = "0";
    const nameContainer = document.createElement("div");
    nameContainer.style.display = "flex";
    nameContainer.style.alignItems = "center";
    nameContainer.style.marginBottom = "0";
    nameContainer.style.flexWrap = "wrap";
    nameContainer.style.gap = "4px";
    const name = document.createElement("div");
    name.style.fontWeight = "500";
    name.style.fontSize = "13px";
    name.textContent = d.configDeviceName || d.name || d.id;
    const expandedDetails = document.createElement("div");
    expandedDetails.style.display = "none";
    expandedDetails.appendChild(renderDeviceDetailsPanel(d));
    const expandBtn = document.createElement("button");
    expandBtn.textContent = "\u25BE";
    expandBtn.title = "Show details";
    expandBtn.style.padding = "2px 6px";
    expandBtn.style.fontSize = "11px";
    expandBtn.style.marginLeft = "4px";
    expandBtn.style.background = "#e5e7eb";
    expandBtn.style.color = "#111827";
    expandBtn.style.transition = "transform 0.2s ease";
    expandBtn.onclick = () => {
      const isHidden = expandedDetails.style.display === "none";
      expandedDetails.style.display = isHidden ? "block" : "none";
      expandBtn.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
    };
    nameContainer.appendChild(name);
    nameContainer.appendChild(expandBtn);
    if (d.rssi !== void 0 && d.rssi !== null && d.rssi !== 0) {
      nameContainer.appendChild(renderSignalBars(d.rssi));
      nameContainer.appendChild(renderSignalQualityBadge(d.rssi));
    }
    const meta = document.createElement("div");
    meta.style.opacity = "0.7";
    meta.style.fontSize = "10px";
    meta.style.fontFamily = "monospace";
    const deviceIdentifier = d.deviceId || d.id;
    const id = `ID: ${deviceIdentifier}`;
    const typeText = d.configDeviceType || d.type ? `Type: ${d.configDeviceType || d.type}` : "";
    const connText = d.connectionPreference ? `Conn: ${d.connectionPreference}` : "";
    const roomText = d.room ? `Room: ${d.room}` : "";
    meta.textContent = [id, typeText, connText, roomText].filter(Boolean).join(" | ");
    info.appendChild(nameContainer);
    info.appendChild(meta);
    info.appendChild(expandedDetails);
    const buttons = document.createElement("div");
    buttons.className = "device-actions";
    buttons.style.display = "flex";
    buttons.style.flexWrap = "wrap";
    buttons.style.justifyContent = "flex-start";
    buttons.style.marginLeft = "0";
    buttons.style.width = "100%";
    buttons.style.marginTop = "2px";
    buttons.style.gap = "5px";
    const editBtn = document.createElement("button");
    editBtn.textContent = "\u270F\uFE0F Edit";
    editBtn.style.padding = "4px 9px";
    editBtn.style.fontSize = "11px";
    editBtn.onclick = async () => {
      const { editDevice: editDevice2 } = await Promise.resolve().then(() => (init_modals(), modals_exports));
      await editDevice2(d);
    };
    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy ID";
    copyBtn.style.padding = "4px 9px";
    copyBtn.style.fontSize = "11px";
    copyBtn.addEventListener("click", async () => {
      try {
        if (deviceIdentifier) {
          await copyTextWithFallback(deviceIdentifier);
        }
        copyBtn.textContent = "Copied";
        copyBtn.classList.add("success");
        setTimeout(() => {
          copyBtn.textContent = "Copy ID";
          copyBtn.classList.remove("success");
        }, 1200);
      } catch (e) {
        copyBtn.textContent = "Failed";
        copyBtn.classList.add("error");
        setTimeout(() => {
          copyBtn.textContent = "Copy ID";
          copyBtn.classList.remove("error");
        }, 1200);
      }
    });
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "\u{1F5D1}\uFE0F Delete";
    deleteBtn.style.padding = "4px 9px";
    deleteBtn.style.fontSize = "11px";
    deleteBtn.style.background = "#ef4444";
    deleteBtn.onclick = async () => {
      const { deleteDeviceFromConfig: deleteDeviceFromConfig2 } = await Promise.resolve().then(() => (init_devices_delete(), devices_delete_exports));
      await deleteDeviceFromConfig2(d.id || d.deviceId, d.name || d.id || d.deviceId);
    };
    buttons.appendChild(editBtn);
    buttons.appendChild(copyBtn);
    buttons.appendChild(deleteBtn);
    buttons.appendChild(createConnectionTestControls(d));
    li.appendChild(info);
    li.appendChild(buttons);
    ul.appendChild(li);
  }
}
var SPACES_REGEX, CAMELCASE_REGEX, FIRST_CHAR_REGEX;
var init_render = __esm({
  "src/homebridge-ui/public/js/render.ts"() {
    "use strict";
    SPACES_REGEX = /\s/g;
    CAMELCASE_REGEX = /([A-Z])/g;
    FIRST_CHAR_REGEX = /^./;
  }
});

// src/homebridge-ui/public/js/devices.ts
var devices_exports = {};
__export(devices_exports, {
  addDeviceToConfig: () => addDeviceToConfig2,
  initRemoveAllButton: () => initRemoveAllButton,
  loadConfiguredDevices: () => loadConfiguredDevices
});
async function addDeviceToConfig2(device, options = {}) {
  const { refresh = true, showStatus = true } = options;
  try {
    const { importDiscoveredDevice: importDiscoveredDevice2 } = await Promise.resolve().then(() => (init_modals(), modals_exports));
    const importValues = await importDiscoveredDevice2(device);
    if (!importValues || typeof importValues !== "object" || !importValues.configDeviceName || !importValues.configDeviceType) {
      return { added: false };
    }
    showBusyUi();
    uiLog.info("Adding device to config:", device);
    let safeName = importValues.configDeviceName;
    if (!safeName || safeName === "undefined") {
      safeName = device.name || device.id;
      uiLog.warn(`Device name was invalid ("${importValues.configDeviceName}"), using fallback: "${safeName}"`);
    }
    const resp = await addDevice(device.id, safeName, importValues.configDeviceType, {
      address: importValues.address,
      model: device.model,
      rssi: device.rssi,
      encryptionKey: importValues.encryptionKey,
      keyId: importValues.keyId
    });
    uiLog.info("Add device response:", resp);
    const alreadyExists = !!resp?.alreadyExists;
    const message = resp?.message || (alreadyExists ? `Device "${importValues.configDeviceName}" already in config` : `Device "${importValues.configDeviceName}" added successfully!`);
    if (alreadyExists) {
      toastInfo(message);
    } else {
      toastSuccess(message);
    }
    if (showStatus) {
      const status = document.getElementById("discoverStatus");
      if (status) {
        status.textContent = (alreadyExists ? "\u2022 " : "\u2713 ") + message;
        status.classList.remove("error");
        status.classList.add("success-msg");
        if (!alreadyExists) {
          const synced = await syncParentPluginConfigFromDisk(true);
          status.textContent += synced ? " - Config saved automatically." : " - Warning: config may not persist until you close/reopen settings.";
          if (synced) {
            toastSuccess("Configuration synced and saved automatically");
          } else {
            toastWarning("Configuration sync failed; close and reopen settings before Save");
          }
        }
      }
    }
    if (refresh) {
      await syncParentPluginConfigFromDisk(true);
      await loadConfiguredDevices();
    }
    return { added: !alreadyExists };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    uiLog.error("Add device error:", msg);
    const status = document.getElementById("discoverStatus");
    if (status) {
      status.textContent = `\u2717 Error: ${msg}`;
      status.classList.add("error");
    }
    toastError(msg);
    return { added: false };
  } finally {
    hideBusyUi();
  }
}
async function initRemoveAllButton() {
  const removeAllBtn = document.getElementById("removeAllBtn");
  if (!removeAllBtn) {
    return;
  }
  removeAllBtn.addEventListener("click", async () => {
    const { deleteAllDevicesFromConfig: deleteAllDevicesFromConfig2 } = await Promise.resolve().then(() => (init_devices_delete(), devices_delete_exports));
    await deleteAllDevicesFromConfig2();
  });
}
async function loadConfiguredDevices() {
  const list = await fetchDevices();
  renderDeviceList(list);
}
var init_devices = __esm({
  "src/homebridge-ui/public/js/devices.ts"() {
    "use strict";
    init_api();
    init_logger();
    init_modal();
    init_render();
    init_toast();
  }
});

// src/homebridge-ui/public/js/credentials.ts
init_logger();
init_modal();
init_toast();
async function loadCredentialStatus() {
  try {
    if (typeof homebridge.getPluginConfig !== "function") {
      uiLog.error("Homebridge UI API not available");
      return;
    }
    const configArr = await homebridge.getPluginConfig();
    const config = Array.isArray(configArr) && configArr.length > 0 ? configArr[0] : {};
    const token = config.openApiToken || "";
    const secret = config.openApiSecret || "";
    const tokenStatus = document.getElementById("tokenStatus");
    const secretStatus = document.getElementById("secretStatus");
    if (!tokenStatus || !secretStatus) {
      return;
    }
    if (token) {
      tokenStatus.textContent = `\u2713 Configured (${token.length} characters)`;
      tokenStatus.classList.add("ok");
    } else {
      tokenStatus.textContent = "Not configured";
      tokenStatus.classList.remove("ok");
    }
    if (secret) {
      secretStatus.textContent = `\u2713 Configured (${secret.length} characters)`;
      secretStatus.classList.add("ok");
    } else {
      secretStatus.textContent = "Not configured";
      secretStatus.classList.remove("ok");
    }
  } catch (e) {
    uiLog.error("Error loading credentials:", e);
  }
}
async function saveCredentials() {
  const token = document.getElementById("token")?.value;
  const secret = document.getElementById("secret")?.value;
  const saveStatus = document.getElementById("saveStatus");
  const saveBtn = document.getElementById("saveBtn");
  if (!saveStatus || !saveBtn) {
    return;
  }
  if (!token || !secret) {
    saveStatus.textContent = "Please enter both token and secret";
    saveStatus.classList.add("error");
    toastWarning("Please enter both token and secret");
    return;
  }
  try {
    showBusyUi();
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    uiLog.info("Saving credentials...");
    if (typeof homebridge.getPluginConfig !== "function" || typeof homebridge.updatePluginConfig !== "function") {
      throw new TypeError("Homebridge UI API not available");
    }
    const configArr = await homebridge.getPluginConfig();
    if (!Array.isArray(configArr) || configArr.length === 0) {
      throw new Error("No plugin config found");
    }
    const config = configArr[0];
    config.openApiToken = token;
    config.openApiSecret = secret;
    await homebridge.updatePluginConfig([config]);
    if (typeof homebridge.savePluginConfig === "function") {
      await homebridge.savePluginConfig();
    }
    saveStatus.textContent = `\u2713 Credentials saved successfully`;
    saveStatus.classList.remove("error");
    saveStatus.classList.add("success-msg");
    toastSuccess("Credentials saved successfully");
    document.getElementById("token").value = "";
    document.getElementById("secret").value = "";
    setTimeout(loadCredentialStatus, 500);
    setTimeout(() => {
      saveStatus.textContent = "";
      saveStatus.classList.remove("success-msg");
    }, 3e3);
  } catch (e) {
    uiLog.error("Save error:", e);
    saveStatus.textContent = `Error: ${e instanceof Error ? e.message : "Failed to save"}`;
    saveStatus.classList.add("error");
    toastError(e instanceof Error ? e.message : "Failed to save credentials");
  } finally {
    hideBusyUi();
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Credentials";
  }
}

// src/homebridge-ui/public/js/app.ts
init_devices();
init_discovery();
window.loadCredentialStatus = loadCredentialStatus;
window.saveCredentials = saveCredentials;
window.discoverDevices = discoverDevices2;
async function init() {
  await loadCredentialStatus();
  await initializeDiscoverySettings();
  await loadConfiguredDevices();
  await initRemoveAllButton();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
//# sourceMappingURL=app.js.map
