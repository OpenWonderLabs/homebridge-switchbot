# Changelog

All notable changes to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/)

## [Version 2.2.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.2.2) (2022-10-22)

## What's Changed

- Changed from `allowPushOn` and `allowPushOff` configs to `disablePushOn` and `disablePushOff` config, so default is to push changes.
  - Removed `disable_power` config in favor of `disablePushOn` and `disablePushOff` config settings.
- Fixed Issue where IR Devices commands wouldn't send commands. [#551](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/551), [#553](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/553), [#545](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/545)
- Issue where plugin would continue to crash homebridge. [#547](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/547)
- Fix for node-switchbot showing not installed.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.2.1....v2.2.2

## [Version 2.2.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.2.1) (2022-10-18)

## What's Changed

- Fix for node-switchbot showing not installed.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.2.0...v2.2.1

## [Version 2.2.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.2.0) (2022-10-18)

## What's Changed

- Moved Air Conditioner config `PushOn` to be an overal IR Device config of `allowPushOn` and `allowPushOff`.
- Fixed Issue where Brightness characteristic received "NaN". [#518](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/518)
- Fixed Issue where IR TVs would not default to External Device. [#520](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/518)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.1.2...v2.2.0

## [Version 2.1.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.1.2) (2022-10-14)

## What's Changed

- Fix issue with IR Devices not having a default `ConnectionType`. [#527](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/527)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.1.1...v2.1.2

## [Version 2.1.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.1.1) (2022-10-14)

## What's Changed

- Fixed issue were `CustomOff` would send incorrect commands. Also Resolves [#409](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/409).
- Fixed issue were IR Commands were not sent from IR Devices, Thanks [@jonzhan](https://github.com/jonzhan). [#520](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/520)
- Fixed issue with Curtain not refreshing moving status. [#517](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/517)
- Fix issue with IR Devices not having a default `ConnectionType`. [#527](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/527)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.1.0...v2.1.1

## [Version 2.1.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.1.0) (2022-10-13)

## What's Changed

- Added `pushRatePress` config to set how many seconds inbetween doublePresses.
  - Also if `doublePress` isn't set it will not wait to pushChanges.
- Added `customize` config option which will allow for custom On and off commands for IR Devices.
  - Added `customOn` & `customOff` to set custom commands for IR Devices.
- Removed `Other`: `commandOn` & `commandOff` you will have to change your commands to the new `customOn` & `customOff` config under the `customize` config.
- Fixed issue where devices are not exposed to Homekit. [#507](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/507), [#508](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/508), [#513](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/513)
- Fixed issue with Non-group Curtains being removed or not displaying in Homekit. [#510](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/510)
- Fixed issue were Plugin was waiting 15 seconds before sending command to SwitchBot API. [#509](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/509)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.0.0...v2.1.0

## [Version 2.0.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.0.0) (2022-10-12)

## What's Changed

- Moved from v1.0 to v1.1 of [OpenAPI](https://github.com/OpenWonderLabs/SwitchBotAPI)
- Publish device(s) as an external accessory.
- Added `connectionType` config, this replaces the `BLE` config.
  - You can now select Both Connections, Only OpenAPI, Only BLE, or Disable.
    - `Both` will use BLE as the default connection and will use OpenAPI as a backup connection.
    - `OpenAPI` will only allow connections through the OpenAPI.
    - `BLE` will only allow connections through Bluetooth (BLE), .
    - `Disable` will disable all connections. This will also allow you to disable commands and refreshes for a specific device but leave it in HomeKit.
- Added Support for Ceiling Light & Ceiling Light Pro
- Fixes Smart Lock Issues fixed in v1.1 of OpenAPI. [#462](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/462)
= Fixes excesive logging from node-switchbot. [#435](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/435), [#444](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/444), [#446](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/446) 
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.15.0...v2.0.0

## [Version 1.15.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.15.0) (2022-08-27)

## What's Changed

- Added BLE support for PlugMini (US) & PlugMini (JP)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.14.2...v1.15.0

## [Version 1.14.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.14.2) (2022-08-20)

## What's Changed

- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.14.1...v1.14.2

## [Version 1.14.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.14.1) (2022-06-28)

## What's Changed

- Fixed some logging.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.14.0...v1.14.1

## [Version 1.14.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.14.0) (2022-06-25)

## What's Changed

- Added support for Smart Lock commands over OpenAPI. Thanks [tom-todd](https://github.com/tom-todd) [#382](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/337) & [#387](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/337)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.13.0...v1.14.0

## [Version 1.13.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.13.0) (2022-05-04)

## What's Changed

- Added MQTT support for Meter and Curtain devices. Thanks [banboobee](https://github.com/banboobee)[#337](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/337)
- Added Eve history features for meter devices. Thanks [banboobee](https://github.com/banboobee) [#338](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/338)
- Added Config `setOpenMode` and `setCloseMode` so that you can set mode to be Performance or Silent.
- Added Config to allow manually setting firmware version.
- Fixed Smart Lock Display state status.
  - Still unable to control Locks because of API limitations.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.12.8...v1.13.0

## [Version 1.12.8](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.12.8) (2022-03-19)

## What's Changed

- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.12.7...v1.12.8

## [Version 1.12.7](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.12.7) (2022-03-07)

## What's Changed

- Seperated Color Bulb and Strip Lights
  - Strip Lights no longer support Adaptive Lighting.
    - Adaptive Lighting requires Color Temperature, which Strip Lights do not support.
- Seperated Meter and Meter Plus for BLE purposes.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.12.6...v1.12.7

## [Version 1.12.6](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.12.6) (2022-03-04)

## What's Changed

- Fix for Curtain v3.3 and above, from v1.2.0 node-switchbot update.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.12.5...v1.12.6

## [Version 1.12.5](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.12.5) (2022-02-15)

## What's Changed

- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.12.4...v1.12.5

## [Version 1.12.4](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.12.4) (2022-02-12)

## What's Changed

- Fix support for Meter Plus
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.12.3...v1.12.4

## [Version 1.12.3](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.12.3) (2022-02-05)

## What's Changed

- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.12.2...v1.12.3

## [Version 1.12.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.12.2) (2022-02-02)

## What's Changed

- Fix: Issue where `PositionState` was not being sent back to Home App. Fixes [#123](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/123) Thanks [@dnicolson](https://github.com/dnicolson)!

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.12.1...v1.12.2

## [Version 1.12.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.12.1) (2022-02-01)

## What's Changed

- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.12.0...v1.12.1

## [Version 1.12.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.12.0) (2022-01-29)

## What's Changed

- Add option `maxRetry` for bots so you can set the number of retries for sending on or off for Bot.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.11.2...v1.12.0

## [Version 1.11.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.11.2) (2022-01-29)

## What's Changed

- Fix: Use `updateRate` instead of `refreshRate` when overriding `scanDuration`.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.11.1...v1.11.2

## [Version 1.11.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.11.1) (2022-01-29)

## What's Changed

- Fix: `This plugin generated a warning from the characteristic 'Brightness': characteristic value expected valid finite number and received "undefined" (undefined)`.
- Fix: `This plugin generated a warning from the characteristic 'Color Temperature': characteristic value expected valid finite number and received "undefined" (undefined)`.
- Fix: `This plugin generated a warning from the characteristic 'Hue': characteristic value expected valid finite number and received "undefined" (undefined)`.
- Fix: `This plugin generated a warning from the characteristic 'Saturation': characteristic value expected valid finite number and received "undefined" (undefined)`.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.11.0...v1.11.1

## [Version 1.11.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.11.0) (2022-01-29)

## What's Changed

- Add Support for SwitchBot Smart Lock
- Add Support for SwitchBot Strip Light
- Add Support for SwitchBot Meter Plus (US)
- Add Support for SwitchBot Meter Plus (JP)
- Add Support for SwitchBot Plug Mini (US)
- Add Support for SwitchBot Plug Mini (US)
- Fixed: Curtain `set_min` and `set_max` options not work correctly with minimum and maximum curtain state. [#123](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/123)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.10.1...v1.11.0

## [Version 1.10.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.10.1) (2022-01-26)

## What's Changed

- Fixed: Option `pushOn` was not push `On` commands.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.10.0...v1.10.1

## [Version 1.10.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.10.0) (2022-01-21)

## What's Changed

- Add option `pushOn`, this will allow the `On` commands to be sent along side `Status` change commands.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.9.0...v1.10.0

## [Version 1.9.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.9.0) (2022-01-20)

## What's Changed

- Add option `allowPush`, this will allow commands to be sent even if device state is already in state that is being pushed.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.8.2...v1.9.0

## [Version 1.8.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.8.2) (2022-01-15)

## What's Changed

- Fixed Bug: Only log config if it is set.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.8.1...v1.8.2

## [Version 1.8.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.8.1) (2022-01-15)

## What's Changed

- Fixed Bug: Cannot set properties of undefined (setting 'logging')

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.8.0...v1.8.1

## [Version 1.8.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.8.0) (2022-01-14)

## What's Changed

- Added option to display Bot a Stateful Programmable Switch.
  - This will only Works in 3rd Party Home App, Like [Eve](https://apps.apple.com/us/app/eve-for-homekit/id917695792) or [Home+ 5](https://apps.apple.com/us/app/home-5/id995994352)
- Add option to Hide Motion Sensor's Light Sensor.
- Add option to Set Motion Sensor's Light Sensor `set_minLux` and `set_maxLux`.
- Fixed Bug: Where BLE config would show for devices that don't support BLE.
- Fixed Bug: Contact Sensors's Motion Sensor and Light Sensor showing undefined values.
- Fixed Bug: Motion Sensors's Light Sensor showing undefined values.
- Fixed Bug: Battery Service wouldn't be removed from Curtain, Contact Sensor, or Motion Sensor when switching from BLE to OpenAPI.
- Enhancments: Made some improvemnt on the switch from BLE to OpenAPI when BLE connection fails.
- Enhancments: Made Optional Switchbot Device Settings and Optional IR Device Settings more managable by using Tabs.
- Change: Changed Curtain `refreshRate` to `updateRate`.
  - You will have to update your config for it to pickup the new `updateRate`.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.7.0...v1.8.0

## [Version 1.7.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.7.0) (2022-01-05)

## What's Changed

- Added option to display Bot a Fan.
- Added option to display Bot a Door. [#179](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/179)
- Added option to display Bot a Lock. [#179](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/179)
- Added option to display Bot a Faucet.
- Added option to display Bot a Window.
- Added option to display Bot a WindowCovering.
- Added option to display Bot a Garage Door Opener. [#179](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/179)

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.6.3...v1.7.0

## [Version 1.6.3](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.6.3) (2022-01-03)

## What's Changed

- Quick Fix for for issue not tested in `v1.6.2`.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.6.2...v1.6.3

## [Version 1.6.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.6.2) (2022-01-03)

## What's Changed

- Fixed Bug: npm ERR! code 1. [#151](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/151)
  - Made `node-switchbot` an optionalDependencies
  - So If `node-switchbot` doesn't get installed successfully then BLE will not work.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.6.1...v1.6.2

## [Version 1.6.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.6.1) (2022-01-02)

## What's Changed

- Fixed an issue where when `Adaptive Lighting Shift` was set to -1, Adaptive Lighting would not be removed.
- Fixed an issue with motion sensor refreshStatus that would cause plugin to cause Homebridge restart.
- Fixed Bug: npm ERR! code 1. [#151](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/151)
  - Made `node-switchbot` an optionalDependencies
  - So If `node-switchbot` doesn't get installed successfully then BLE will not work.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.6.0...v1.6.1

## [Version 1.6.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.6.0) (2021-12-31)

## What's Changed

- Added `scanDuration` config option to set how long BLE scans, Scanning Duration is defaulted to 1 second.
- Now Setting `switch` as the default bot mode for Bots, to change to press, config must be set under `SwitchBot Device Settings` in the Plugin Settings.
- Fixed Bug: Contact Sensor talks about Curtain Light + Motion Sensor. [#164](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/164)
- Fixed Bug: Reboot causes No Device Type Set Error. [#172](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/172)
- Fixed Bug: Bot Status not working Correction with Switch and Press. [#105](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/105), [#130](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/130), [#132](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/132), [#165](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/165), [#174](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/174)
- Fixed some issues with the New Logging Options release with v1.5.0, now logging when configured.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.5.0...v1.6.0

## [Version 1.5.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.5.0) (2021-12-27)

## What's Changed

### Major Change To `Logging`:

- Added the following Logging Options:
  - `Standard`
  - `None`
  - `Debug`
- Removed Device Logging Option, which was pushed into new logging under debug.
- Added Device Logging Override for each Device, by using the Device Config.

### Major Changes to `refreshRate`:

- Added an option to override `refreshRate` for each Device, by using the Device Config.

### Other Changes

- Fixed Bug: Air conditioner temperature not able to change. [#43](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/43)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.4.0...v1.5.0

## [Version 1.4.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.4.0) (2021-12-15)

## What's Changed

- Added Status Messages to logs for discoverDevices request.
- Added Cached Status to IR device, Status will be saved to accessory context and restored on restart.
- Added Option `Offline as Off` to be able set the device as off, if API reports offline.
- Removed Meter Unit Config Option as it was confusing and probably never used.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.3.0...v1.4.0

## [Version 1.3.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.3.0) (2021-12-02)

## What's Changed

- Added Adpative Lighting to Color Bulb
- Added Option `Adaptive Lighting Shift` to be able us this value to increase the mired for the Adaptive Lighting update, making the light appear warmer.
- Fixed Bug: Color Bulb can't change color and is not dimmable. [#97](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/97)

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.2.5...v1.3.0

## [Version 1.2.5](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.5) (2021-11-25)

## What's Changed

- Fixed Bug: Where `set_minLux` & `set_maxLux` config settings not effecting OpenAPI Lux.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.2.4...v1.2.5

## [Version 1.2.4](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.4) (2021-11-24)

## What's Changed

- Fixed Bug: Cannot read properties of undefined (reading 'updateCharacteristic').

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.2.3...v1.2.4

## [Version 1.2.3](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.3) (2021-11-24)

## What's Changed

- When BLE Connection isn't established, allow for OpenAPI to kick in if `openToken` is supplied.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.2.2...v1.2.3

## [Version 1.2.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.2) (2021-11-24)

## What's Changed

- Allow the `configDeviceName` to override `deviceName`.
- Added Logging when BLE Connection wasn't established.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.2.1...v1.2.2

## [Version 1.2.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.1) (2021-11-24)

## What's Changed

- Fixed Bug: Curtains alternate between open/close state. [#85](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/85)
- Fixed Bug: Meter not working with BLE. [#110](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/110)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.2.0...v1.2.1

## [Version 1.2.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.0) (2021-11-19)

## What's Changed

- Added option to be able to do Bluetooth Low Energy (BLE) Only Connection.
  - Must supply `Device ID` & `Device Name` to the Device Config
  - Must Check `Enable Bluetooth Low Energy (BLE) Connection`
- Fixed Bug: Air conditioner temperature not able to change. [#43](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/43)
- Add option to set Min Lux and Max Lux for Curtain's Light Sensor.
- Add `updateHomeKitCharacteristics` to IR Devices to contain all `updateCharacteristics` in one spot.
- Add `Saturation` and `Hue` to Colorbulb.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.1.0...v1.2.0

## [Version 1.1.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.1.0) (2021-11-16)

## What's Changed

- Fixed Bug: Curtains alternate between open/close state. [#85](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/85)
- Fixed Bug: IR Fan won't be hidden in Home app. [#90](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/90)
- Fixed Bug: `hide_temperature` config option causing `Cannot read property 'updateCharacteristic' of undefined` for Humidifiers. [#89](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/89)
- Add option to Hide Curtain's Light Sensor. [#91](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/91)
- Add option to Hide Contact Sensor's Motion Sensor or Light Sensor.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.0.2...v1.1.0

## [Version 1.0.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.0.2) (2021-11-15)

## What's Changed

- Fixed Bug: `failed to discover devices. cannot read property 'touppercase' of undefined`. [#84](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/84)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.0.1...v1.0.2

## [Version 1.0.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.0.1) (2021-11-14)

## What's Changed

- Fixed `Cannot read properties of undefined (reading 'updateCharacteristic')` on Bots. [#77](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/77)
- Fixed Temperature not being retrieved for Switchbot Meter. [#78](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/78)

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.0.0...v1.0.1

## [Version 1.0.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.0.0) (2021-11-13)

## What's Changed

- Offical release of homebridge-Switchbot, which combines both BLE and OpenAPI into 1 plugin.
- Adds Light Sensors to Curtains
  - with iOS 15.1 you can set automations on light sensors.
- Adds Motion Sensor to Contact Sensors
- Adds Support Color Bulbs

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v0.1.1...v1.0.0

## [Version 0.1.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v0.1.1) (2021-09-11)

## What's Changed

- Fix Contact Sensor adding as Motion Sensor instead of Contact Sensor

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v0.1.0...v0.1.1

## [Version 0.1.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v0.1.0) (2021-09-10)

## What's Changed

- Initial release of homebridge-switchbot.
- Adds Support for Motion & Contact Sensors
- Adds Water Level to Humidifier
