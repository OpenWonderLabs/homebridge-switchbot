# Changelog

All notable changes to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/)

## [Beta - Version 1.3.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.3.1) (2021-12-XX)

## What's Changed
* Added Status Messages to logs for discoverDevices request.
* Added Option `Offline as Off` to be able set the device as off, if API reports offline.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.3.0...v1.3.1

## [Version 1.3.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.3.0) (2021-12-02)

## What's Changed
* Added Adpative Lighting to Color Bulb
* Added Option `Adaptive Lighting Shift` to be able us this value to increase the mired for the Adaptive Lighting update, making the light appear warmer.
* Fixed Bug: Color Bulb can't change color and is not dimmable. [#97](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/97)

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.2.5...v1.3.0

## [Version 1.2.5](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.5) (2021-11-25)

## What's Changed
* Fixed Bug: Where `set_minLux` & `set_maxLux` config settings not effecting OpenAPI Lux.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.2.4...v1.2.5

## [Version 1.2.4](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.4) (2021-11-24)

## What's Changed
* Fixed Bug: Cannot read properties of undefined (reading 'updateCharacteristic').

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.2.3...v1.2.4

## [Version 1.2.3](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.3) (2021-11-24)

## What's Changed
* When BLE Connection isn't established, allow for OpenAPI to kick in if `openToken` is supplied.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.2.2...v1.2.3

## [Version 1.2.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.2) (2021-11-24)

## What's Changed
* Allow the `configDeviceName` to override `deviceName`.
* Added Logging when BLE Connection wasn't established.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.2.1...v1.2.2

## [Version 1.2.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.1) (2021-11-24)

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