/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * index.ts: SwitchBot v4.0.0 - Hybrid BLE/OpenAPI Main Exports
 */
// Main classes (alphabetically by module path)
export { OpenAPIClient } from './api.js';
export { BLEConnection, BLEScanner } from './ble.js';
export { DeviceManager, SwitchBotDevice } from './devices/base.js';
export { DeviceOverrideStateDuringConnection } from './devices/device-override-state-during-connection.js';
export { WoAIHub, WoAirPurifier, WoAirPurifierPM25, WoAirPurifierTable, WoArtFrame, WoBlindTilt, WoBulb, WoCandleWarmerLamp, WoCeilingLight, WoCirculatorFan, WoClimatePanel, WoContact, WoCurtain, WoFloorLamp, WoGarageDoorOpener, WoHand, WoHub2, WoHub3, WoHubMiniMatter, WoHumi, WoHumi2, WoIOSensorTH, WoKeypad, WoKeypadVision, WoKeypadVisionPro, WoLeak, WoPanTiltCamPlus3K, WoPlugMiniJP, WoPlugMiniUS, WoPresence, WoRelaySwitch1, WoRelaySwitch1PM, WoRelaySwitch2PM, WoRemote, WoRemoteWithScreen, WoRGBICBulb, WoRGBICNeonWireRopeLight, WoRGBICWWFloorLamp, WoRGBICWWStripLight, WoRollerShade, WoSensorTH, WoSensorTHPlus, WoSensorTHPro, WoSensorTHProCO2, WoSmartLock, WoSmartLockLite, WoSmartLockPro, WoSmartLockProWiFi, WoSmartLockVision, WoSmartLockVisionPro, WoSmartThermostatRadiator, WoStrip, WoStripLight3, WoVacuum, WoVacuumK10Plus, WoVacuumK10Pro, WoVacuumK10ProCombo, WoVacuumK11Plus, WoVacuumK20, WoVacuumS10, WoVacuumS20, WoWaterDetector, } from './devices/index.js';
export { SequenceDevice } from './devices/sequence-device.js';
export { APIError, APINotAvailableError, BLENotAvailableError, CommandFailedError, ConnectionTimeoutError, DeviceNotFoundError, DiscoveryError, SwitchBotError, ValidationError, } from './errors.js';
export { updateBaseURL, urls } from './settings.js';
export { SwitchBot } from './switchbot.js';
//# sourceMappingURL=index.js.map