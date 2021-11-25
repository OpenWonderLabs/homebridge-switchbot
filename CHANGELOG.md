# Changelog

All notable changes to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/)

## [Version 1.2.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.0) (2021-11-24)

## What's Changed
* Fixed Bug: Curtains alternate between open/close state. [#85](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/85)
* Fixed Bug: Meter not working with BLE. [#110](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/110)
* Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.2.0...v1.2.1

## [Version 1.2.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.0) (2021-11-19)

## What's Changed
* Added option to be able to do Bluetooth Low Energy (BLE) Only Connection.
    * Must supply `Device ID` & `Device Name` to the Device Config
    * Must Check `Enable Bluetooth Low Energy (BLE) Connection`
* Fixed Bug: Air conditioner temperature not able to change. [#43](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/43)
* Add option to set Min Lux and Max Lux for Curtain's Light Sensor.
* Add `updateHomeKitCharacteristics` to IR Devices to contain all `updateCharacteristics` in one spot.
* Add `Saturation` and `Hue` to Colorbulb.
* Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.1.0...v1.2.0

## [Version 1.1.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.1.0) (2021-11-16)

## What's Changed
* Fixed Bug: Curtains alternate between open/close state. [#85](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/85)
* Fixed Bug: IR Fan won't be hidden in Home app. [#90](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/90)
* Fixed Bug: `hide_temperature` config option causing `Cannot read property 'updateCharacteristic' of undefined` for  Humidifiers. [#89](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/89)
* Add option to Hide Curtain's Light Sensor. [#91](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/91)
* Add option to Hide Contact Sensor's Motion Sensor or Light Sensor.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.0.2...v1.1.0

## [Version 1.0.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.0.2) (2021-11-15)

## What's Changed
* Fixed Bug: `failed to discover devices. cannot read property 'touppercase' of undefined`. [#84](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/84)
* Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.0.1...v1.0.2

## [Version 1.0.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.0.1) (2021-11-14)

## What's Changed
* Fixed `Cannot read properties of undefined (reading 'updateCharacteristic')` on Bots. [#77](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/77)
* Fixed Temperature not being retrieved for Switchbot Meter. [#78](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/78)

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.0.0...v1.0.1

## [Version 1.0.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.0.0) (2021-11-13)

## What's Changed
* Offical release of homebridge-Switchbot, which combines both BLE and OpenAPI into 1 plugin.
* Adds Light Sensors to Curtains
    * with iOS 15.1 you can set automations on light sensors.
* Adds Motion Sensor to Contact Sensors
* Adds Support Color Bulbs

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v0.1.1...v1.0.0

## [Version 0.1.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v0.1.1) (2021-09-11)

## What's Changed
* Fix Contact Sensor adding as Motion Sensor instead of Contact Sensor

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v0.1.0...v0.1.1

## [Version 0.1.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v0.1.0) (2021-09-10)

## What's Changed
* Initial release of homebridge-switchbot.
* Adds Support for Motion & Contact Sensors
* Adds Water Level to Humidifier