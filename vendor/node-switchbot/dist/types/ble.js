/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * types/ble.ts: SwitchBot v4.0.0 - BLE Type Definitions
 */
/**
 * SwitchBot BLE Model identifiers
 */
export var SwitchBotBLEModel;
(function (SwitchBotBLEModel) {
    SwitchBotBLEModel["Bot"] = "H";
    SwitchBotBLEModel["Curtain"] = "c";
    SwitchBotBLEModel["Curtain3"] = "{";
    SwitchBotBLEModel["Plug"] = "g";
    SwitchBotBLEModel["PlugMiniUS"] = "j";
    // eslint-disable-next-line ts/no-duplicate-enum-values
    SwitchBotBLEModel["PlugMiniJP"] = "j";
    SwitchBotBLEModel["Meter"] = "T";
    SwitchBotBLEModel["MeterPlus"] = "i";
    SwitchBotBLEModel["MeterPro"] = "o";
    SwitchBotBLEModel["MeterProCO2"] = "w";
    SwitchBotBLEModel["OutdoorMeter"] = "n";
    // eslint-disable-next-line ts/no-duplicate-enum-values
    SwitchBotBLEModel["Lock"] = "o";
    SwitchBotBLEModel["LockPro"] = "\u0011";
    SwitchBotBLEModel["Keypad"] = "k";
    SwitchBotBLEModel["KeypadTouch"] = "\v";
    SwitchBotBLEModel["MotionSensor"] = "s";
    SwitchBotBLEModel["ContactSensor"] = "d";
    SwitchBotBLEModel["CeilingLight"] = "q";
    SwitchBotBLEModel["CeilingLightPro"] = "r";
    SwitchBotBLEModel["StripLight"] = "p";
    SwitchBotBLEModel["ColorBulb"] = "u";
    SwitchBotBLEModel["RobotVacuumCleanerS1"] = "\n";
    SwitchBotBLEModel["RobotVacuumCleanerS1Plus"] = "\f";
    SwitchBotBLEModel["RobotVacuumCleanerK10Plus"] = "\u000F";
    SwitchBotBLEModel["Humidifier"] = "e";
    SwitchBotBLEModel["Humidifier2"] = "\u0007";
    SwitchBotBLEModel["BlindTilt"] = "x";
    SwitchBotBLEModel["Hub2"] = "\u0001";
    SwitchBotBLEModel["Hub3"] = "\u0002";
    SwitchBotBLEModel["Remote"] = "\u0005";
    SwitchBotBLEModel["BatteryCirculatorFan"] = "\u0004";
    SwitchBotBLEModel["AirPurifier"] = "\b";
    SwitchBotBLEModel["AirPurifierTable"] = "\t";
    SwitchBotBLEModel["WaterLeakDetector"] = "y";
    SwitchBotBLEModel["PresenceSensor"] = "\u0006";
    SwitchBotBLEModel["RelaySwitch1PM"] = "\r";
    SwitchBotBLEModel["RelaySwitch1"] = "\u000E";
    SwitchBotBLEModel["K10ProComboK10Pro"] = "\u0010";
})(SwitchBotBLEModel || (SwitchBotBLEModel = {}));
/**
 * SwitchBot BLE Model Names
 */
export var SwitchBotBLEModelName;
(function (SwitchBotBLEModelName) {
    SwitchBotBLEModelName["Bot"] = "WoHand";
    SwitchBotBLEModelName["Curtain"] = "WoCurtain";
    SwitchBotBLEModelName["Curtain3"] = "WoCurtain3";
    SwitchBotBLEModelName["Plug"] = "WoPlugUS";
    SwitchBotBLEModelName["PlugMiniUS"] = "WoPlugMiniUS";
    SwitchBotBLEModelName["PlugMiniJP"] = "WoPlugMiniJP";
    SwitchBotBLEModelName["Meter"] = "WoSensorTH";
    SwitchBotBLEModelName["MeterPlus"] = "WoSensorTHPlus";
    SwitchBotBLEModelName["MeterPro"] = "WoSensorTHPro";
    SwitchBotBLEModelName["MeterProCO2"] = "WoSensorTHProCO2";
    SwitchBotBLEModelName["OutdoorMeter"] = "WoIOSensorTH";
    SwitchBotBLEModelName["Lock"] = "WoSmartLock";
    SwitchBotBLEModelName["LockPro"] = "WoSmartLockPro";
    SwitchBotBLEModelName["Keypad"] = "WoKeypad";
    SwitchBotBLEModelName["KeypadTouch"] = "WoKeypadTouch";
    SwitchBotBLEModelName["MotionSensor"] = "WoMotion";
    SwitchBotBLEModelName["ContactSensor"] = "WoContact";
    SwitchBotBLEModelName["CeilingLight"] = "WoCeilingLight";
    SwitchBotBLEModelName["CeilingLightPro"] = "WoCeilingLightPro";
    SwitchBotBLEModelName["StripLight"] = "WoStrip";
    SwitchBotBLEModelName["ColorBulb"] = "WoBulb";
    SwitchBotBLEModelName["RobotVacuumCleanerS1"] = "WoVacS1";
    SwitchBotBLEModelName["RobotVacuumCleanerS1Plus"] = "WoVacS1Plus";
    SwitchBotBLEModelName["RobotVacuumCleanerK10Plus"] = "WoVacK10Plus";
    SwitchBotBLEModelName["Humidifier"] = "WoHumi";
    SwitchBotBLEModelName["Humidifier2"] = "WoHumi2";
    SwitchBotBLEModelName["BlindTilt"] = "WoBlindTilt";
    SwitchBotBLEModelName["Hub2"] = "WoHub2";
    SwitchBotBLEModelName["Hub3"] = "WoHub3";
    SwitchBotBLEModelName["Remote"] = "WoRemote";
    SwitchBotBLEModelName["BatteryCirculatorFan"] = "WoCirculatorFan";
    SwitchBotBLEModelName["AirPurifier"] = "WoAirPurifier";
    SwitchBotBLEModelName["AirPurifierTable"] = "WoAirPurifierTable";
    SwitchBotBLEModelName["WaterLeakDetector"] = "WoLeak";
    SwitchBotBLEModelName["PresenceSensor"] = "WoPresence";
    SwitchBotBLEModelName["RelaySwitch1PM"] = "WoRelaySwitch1PM";
    SwitchBotBLEModelName["RelaySwitch1"] = "WoRelaySwitch1";
    SwitchBotBLEModelName["K10ProComboK10Pro"] = "WoVacK10ProCombo";
})(SwitchBotBLEModelName || (SwitchBotBLEModelName = {}));
//# sourceMappingURL=ble.js.map