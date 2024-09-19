# Changelog

All notable changes to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/)

## [3.8.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v3.8.2) (2024-09-19)

### What's Changed
- Improved macAddress format and finding of invalid formating.
- Fixed temperature reading issue for Hub 2, Indoor/Outdoor Sensor, Meter, & Meter Plus [#1024](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/1024), Thanks [@azmke](https://github.com/azmke)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v3.8.1...v3.8.2

## [3.8.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v3.8.1) (2024-09-13)

### What's Changed
- Improved logging mechanism to avoid repetitive logs.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v3.8.0...v3.8.1

## [3.8.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v3.8.0) (2024-09-11)

### What's Changed
- Added specific macOS Bluetooth permission instructions to Readme [#1026](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/1026), Thanks [@rSffsE](https://github.com/rSffsE)
- Added partial support for `Roller Shade` deviceType. Currently only supports status.
- Added `silentModeSwitch` config option for both `Curtain` & `Blind Titl` deviceTypes, allowing two switches to be display for Closing and Moding Mode. If turned on then Silent Mode is enabled.
- Added option to allow invalid Characters in displayName with config `allowInvalidCharacters`
- Added `dry` config option to enable Dry Status support for Water Detector
- Fixed Platform BLE Scanning events not registering
- Fix `On` state for robot vacuum cleaners [#1028](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/1028), Thanks [@JannThomas](https://github.com/JannThomas)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v3.7.0...v3.8.0

## [3.7.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v3.7.0) (2024-07-21)

### What's Changed
- Add Platform BLE Scanning
  - Enable by setting `Enable BLE Scanning` setting under Advanced Settings.
  - Will update devices as data is received.
- Fix Bot and Other `On` issues.
- Remove repetitive logging [#1001](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/1001), Thanks [@dnicolson](https://github.com/dnicolson)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v3.6.0...v3.7.0

## [3.6.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v3.6.0) (2024-07-06)

### What's Changed
- Add Humdifier as `meterType` for IR AirConditioner
- Fix Bot `botDeviceType` issue
- Fix Other IR `deviceType` issue
- Fix `RangeError: Maximum call stack size exceeded` error
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v3.5.1...v3.6.0

## [3.5.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v3.5.1) (2024-06-27)

### What's Changed
- Fixed issue `RangeError: Maximum call stack size exceeded` introduced in `v3.5.0`
- Fixed Bot deviceType issue which wouldn't use config service or remove leftover services.
- Fixed Other IR deviceType issue which wouldn't use config service or remove leftover services.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v3.5.0...v3.5.1

## [3.5.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v3.5.0) (2024-05-26)

### What's Changed
- Add Support for `Water Detector`
- Add Support for `Battery Circulator Fan`
- Add BLE support for `Smart Lock`
- Add `K10+` deviceType Support
- Add Support for `maxRetries` and `delayBetweenRetries` on OpenAPI status refreshes based on [#959](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/959#issuecomment-2094879876), Thanks [@sametguzeldev](https://github.com/sametguzeldev)
- Major Refactoring of `device` and `irdevice` files.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v3.4.0...v3.5.0

## [3.4.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v3.4.0) (2024-02-11)

### What's Changed
- Add support for `Smart Lock Pro`
- Add `Mini Robot Vacuum K10+` to config
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v3.3.0...v3.4.0

## [3.3.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v3.3.0) (2024-02-09)

### What's Changed
- Add config that allows you to set `cool` and `heat`: `min` & `max`
- Fixed node-switchbot import [#928](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/928), Thanks [@dnicolson](https://github.com/dnicolson)
- Code cleanup: Remove unnecessary await keyword [#929](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/929), Thanks [@dnicolson](https://github.com/dnicolson)
- Code cleanup: Remove empty image tag [#930](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/930), Thanks [@dnicolson](https://github.com/dnicolson)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v3.2.0...v3.3.0

## [3.2.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v3.2.0) (2024-02-06)

### What's Changed
- Upgrade to latest node-switchbot with is now a Typescript ES-Module.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v3.1.3...v3.2.0

## [3.1.3](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v3.1.3) (2024-02-06)

### What's Changed
- Adjust noble and node-switchbot import and pass noble as object to the node-switchbot.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v3.1.2...v3.1.3

## [3.1.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v3.1.2) (2024-02-05)

### What's Changed
- Fixed node-switchbot import issue.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v3.1.1...v3.1.2

## [3.1.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v3.1.1) (2024-02-05)

### What's Changed
- Fixed BLE connection [#907](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/907), Thanks [@dnicolson](https://github.com/dnicolson)
- Fixed BLE curtain mode [#908](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/908), Thanks [@dnicolson](https://github.com/dnicolson)
- Fixed curtain characteristic warning [#909](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/909), Thanks [@dnicolson](https://github.com/dnicolson)
- Revert curtain retry functionality [#911](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/911), Thanks [@dnicolson](https://github.com/dnicolson)
- Code Cleaup [#910](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/910) [#912](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/912) [#913](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/913)  [#917](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/917), Thanks [@dnicolson](https://github.com/dnicolson)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v3.1.0...v3.1.1

## [3.1.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v3.1.0) (2024-02-02)

### What's Changed
- Offical support for [Curtain 3](https://www.switch-bot.com/pages/switchbot-curtain-3), `deviceType`: `Curtain3`.
- Fixed issue with which prevented the plugin from loading.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v3.0.0...v3.1.0

## [3.0.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v3.0.0) (2024-01-31)

### What's Changed

- Moved from CommonJS to ES Module
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.14.0...v3.0.0

## [2.14.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.14.0) (2024-01-06)

### What's Changed

- Added Curtain Hold Command to OpenAPI.
  - This will only Works in 3rd Party Home App, Like [Eve](https://apps.apple.com/us/app/eve-for-homekit/id917695792) or [Home+ 5](https://apps.apple.com/us/app/home-5/id995994352)

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.13.2...v2.14.0

## [2.13.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.13.2) (2024-01-05)

### What's Changed

- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.13.1...v2.13.2

## [2.13.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.13.1) (2023-12-15)

### What's Changed

- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.13.0...v2.13.1

## [2.13.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.13.0) (2023-12-04)

### What's Changed

- Add support for turning on `WoSweeperMini`, also known as `SwitchBot Mini Robot Vacuum K10+`
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.12.1...v2.13.0

## [2.12.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.12.1) (2023-11-26)

### What's Changed

- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.12.0...v2.12.1

## [2.12.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.12.0) (2023-11-17)

### What's Changed

- Add Support for Stateless button on IR Lights [#863](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/863)
- Fix noble version [#864](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/864)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.11.0...v2.12.0

## [2.11.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.11.0) (2023-11-07)

### What's Changed

- Added Latch Switch to activate Latch on Lock [#859](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/859), Thanks [@quebulm](https://github.com/quebulm)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.10.1...v2.11.0

## [2.10.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.10.1) (2023-11-01)

### What's Changed

- Added webhook event listener for Bot, Ceiling Light, Color Bulb, Contact, Curtain, IOSensor, Light Strip, Lock, Motion, Plug, & Robot Vacuum Cleaner
- Added Webhook config to Plugin Config UI.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.10.0...v2.10.1

## [2.10.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.10.0) (2023-10-31)

### What's Changed

- Added webhook event listener for Meter, Meter Plus, & Hub 2 [#850](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/850), Thanks [@banboobee](https://github.com/banboobee)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.9.2...v2.10.0

## [2.9.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.9.2) (2023-10-26)

### What's Changed

- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.9.1...v2.9.2

## [2.9.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.9.1) (2023-10-14)

### What's Changed

- Fix issue with `FirmwareRevision` causing Homebridge Crash [#839](https://github.com/OpenWonderLabs/homebridge-switchbot/discussions/839) [#832](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/832) [#829](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/829) [#828](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/828)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.9.0...v2.9.1

## [2.9.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.9.0) (2023-09-16)

### What's Changed

- Add other `deviceTypes` for IR Type `Other`.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.8.2...v2.9.0

## [2.8.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.8.2) (2023-08-27)

### What's Changed

- Fixed issue with `BatteryLevel` & `FirmwareRevision` not displaying correctly for certain deviceTypes.
- Fixed config issue where Eve History was not showing for WoIOSensor.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.8.1...v2.8.2

## [2.8.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.8.1) (2023-08-22)

### What's Changed

- Added additional logging to catch statusCodes like 190 (Requests reached the daily limit).
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.8.0...v2.8.1

## [2.8.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.8.0) (2023-08-19)

### What's Changed

- Add Hub 2 Light-Level Support. [#776](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/776)
- Enable Meter Battery Level for OpenAPI [#782](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/782), Thanks [@mrlt8](https://github.com/mrlt8)
- Enable Meter Plus Battery Level for OpenAPI [#787](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/787), Thanks [@mrlt8](https://github.com/mrlt8)
- Enable Battery Level and Version for OpenAPI for BlindTilt, Bot, Ceiling Lights, Color Bulb, Contact, Curtain, Hub, Humidifier, Indoor/Outdoor Sensor, Light Strip, Lock, Meter, Meter Plus, Motion , Plug, Plug Mini, & Robot Vacuum Cleaner
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.7.1...v2.8.0

## [2.7.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.7.1) (2023-07-29)

### What's Changed

- Fixed Hub 2 temperature/humidity data for AC [#779](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/779), Thanks [@mrlt8](https://github.com/mrlt8)
- Fixed TargetTemperature not being updated in the HomeKit [#779](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/779), Thanks [@mrlt8](https://github.com/mrlt8)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.7.0...v2.7.1

## [2.7.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.7.0) (2023-07-25)

### What's Changed

- Will now log if there are no devices discovered by SwitchBot-API.
- Added the ability to use Temperature from a SwitchBot Meter to be used with an IR Air Conditioner [#761](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/761), Thanks [@mrlt8](https://github.com/mrlt8)
- Adds the ability to enable EVE history SwitchBot Curtains [#766](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/766), Thanks [@banboobee](https://github.com/banboobee)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.6.2...v2.7.0

## [2.6.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.6.2) (2023-04-17)

### What's Changed

- Fix for Commands not being sent, [#721](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/721)
- Housekeeping.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.6.1...v2.6.2

## [2.6.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.6.1) (2023-04-15)

### What's Changed

- Add Support for [SwitchBot Meter Plus (JP)](https://www.switchbot.jp/products/switchbot-meter-plus) [#642](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/642), Thanks [@tikuwas](https://github.com/tikuwas)

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.6.0...v2.6.1

## [2.6.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.6.0) (2023-04-15)

### What's Changed

- Add Support for [SwitchBot Hub 2](https://us.switch-bot.com/pages/switchbot-hub-2) Humidity and Temperature Sensor [#716](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/716), Thanks [@alvie](https://github.com/alvie)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.5.3...v2.6.0

## [2.5.3](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.5.3) (2023-04-08)

### What's Changed

- Removed unneeded async [#699](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/699), Thanks [@dnicolson](https://github.com/dnicolson)
- Removed inMotion condition [#703](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/703), Thanks [@dnicolson](https://github.com/dnicolson)
- Fix async method calls [#690](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/690), Thanks [@dnicolson](https://github.com/dnicolson)
- Improve curtain retry functionality [#694](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/694), Thanks [@dnicolson](https://github.com/dnicolson)
- Add Support for [SwitchBot Indoor/Outdoor Thermo-Hygrometer](https://www.switch-bot.com/products/switchbot-indoor-outdoor-thermo-hygrometer)
- Housekeeping and updated dependencies.
  - This release will end support for Node v14.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.5.2...v2.5.3

## [2.5.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.5.2) (2023-02-10)

### What's Changed

- Fixes mappingMode not being read from the config directly [#667](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/667), Thanks [@AndreasVerhoeven](https://github.com/AndreasVerhoeven)
- Fixes only_up mode in settings configuration [#669](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/669), Thanks [@AndreasVerhoeven](https://github.com/AndreasVerhoeven)
- Removes runStatus check, fixes some logic [#672](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/672), Thanks [@AndreasVerhoeven](https://github.com/AndreasVerhoeven)
- Remove unneeded async [#675](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/675), Thanks [@dnicolson](https://github.com/dnicolson)
- Replace switchbot wait with utility function [#674](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/674), Thanks [@dnicolson](https://github.com/dnicolson)
- Remove incorrect warning message [#673](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/673), Thanks [@dnicolson](https://github.com/dnicolson)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.5.1...v2.5.2

## [2.5.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.5.1) (2023-01-28)

### What's Changed

- Fix Blind Tilt Config.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.5.0...v2.5.1

## [2.5.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.5.0) (2023-01-28)

### What's Changed

- Add Initial Support for Blind Tilt (OpenAPI Only) [#649](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/649), Thanks [@AndreasVerhoeven](https://github.com/AndreasVerhoeven)
- Remove incorrect warning message [#661](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/661), Thanks [@dnicolson](https://github.com/dnicolson)
- Replace switchbot wait with utility function [#633](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/633), Thanks [@dnicolson](https://github.com/dnicolson)
- Enhancements to BLE functionality.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.4.0...v2.5.0

## [2.4.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.4.0) (2022-12-27)

### What's Changed

- Added a new `Bot` Device Type `Multi-Press` [#628](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/628), Thanks [@alvst](https://github.com/alvst)
- Added `maxRetry` option for `Curtain`, `Celing Light`, `Celing Light Pro`, `Plug`, `Plug Mini (US)`, `Plug Mini (JP)`, `Robot Vacuum Cleaner S1 Plus`, `Robot Vacuum Cleaner S1`, `Color Bulb`, and `Strip Light` Device Types [#631](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/631), Thanks [@dnicolson](https://github.com/dnicolson)
- Fix max retry option for `Bot`, `Curtain`, `Celing Light`, `Celing Light Pro`, `Plug`, `Plug Mini (US)`, `Plug Mini (JP)`, `Robot Vacuum Cleaner S1 Plus`, `Robot Vacuum Cleaner S1`, `Color Bulb`, and `Strip Light` Device Types [#630](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/628), Thanks [@dnicolson](https://github.com/dnicolson)
- Moved `maxRetry` option from `Bot` level to overall `configDeviceType` level.
  - **If you had this set for your `Bot` you will have to update this config.**
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.3.2...v2.4.0

## [2.3.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.3.2) (2022-12-16)

### What's Changed

- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.3.1...v2.3.2

## [2.3.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.3.1) (2022-12-11)

### What's Changed

- Fixed TypeError: Cannot read properties of undefined (reading 'setCharacteristic'). [#610](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/610)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.3.0...v2.3.1

## [2.3.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.3.0) (2022-12-08)

### What's Changed

- Added Support for SwitchBot Robot Vacuum Cleaner S1 & SwitchBot Robot Vacuum Cleaner S1 Plus
- Add Read-only BLE Support for Smart Lock.
- Added `disablePushDetail` config to IR Air Conditioners.
- Fixed issue where Meter did not parsing temperature. [#571](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/571)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.2.2...v2.3.0

## [2.2.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.2.2) (2022-10-22)

### What's Changed

- Changed from `allowPushOn` and `allowPushOff` configs to `disablePushOn` and `disablePushOff` config, so default is to push changes.
  - Removed `disable_power` config in favor of `disablePushOn` and `disablePushOff` config settings.
- Fixed Issue where IR Devices commands wouldn't send commands. [#551](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/551), [#553](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/553), [#545](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/545)
- Issue where plugin would continue to crash homebridge. [#547](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/547)
- Fix for node-switchbot showing not installed.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.2.1...v2.2.2

## [2.2.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.2.1) (2022-10-18)

### What's Changed

- Fix for node-switchbot showing not installed.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.2.0...v2.2.1

## [2.2.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.2.0) (2022-10-18)

### What's Changed

- Moved Air Conditioner config `PushOn` to be an overall IR Device config of `allowPushOn` and `allowPushOff`.
- Fixed Issue where Brightness characteristic received "NaN". [#518](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/518)
- Fixed Issue where IR TVs would not default to External Device. [#520](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/518)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.1.2...v2.2.0

## [2.1.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.1.2) (2022-10-14)

### What's Changed

- Fix issue with IR Devices not having a default `ConnectionType`. [#527](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/527)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.1.1...v2.1.2

## [2.1.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.1.1) (2022-10-14)

### What's Changed

- Fixed issue were `CustomOff` would send incorrect commands. Also Resolves [#409](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/409).
- Fixed issue were IR Commands were not sent from IR Devices [#520](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/520), Thanks [@jonzhan](https://github.com/jonzhan)
- Fixed issue with Curtain not refreshing moving status. [#517](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/517)
- Fix issue with IR Devices not having a default `ConnectionType`. [#527](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/527)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v2.1.0...v2.1.1

## [2.1.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.1.0) (2022-10-13)

### What's Changed

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

## [2.0.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v2.0.0) (2022-10-12)

### What's Changed

- Moved from v1.0 to v1.1 of [OpenAPI](https://github.com/OpenWonderLabs/SwitchBotAPI)
- Added Config that allows device(s) to be published as an external accessory.
- Added `connectionType` config, this replaces the `BLE` config.
  - You can now select Both Connections, Only OpenAPI, Only BLE, or Disable.
    - `Both` will use BLE as the default connection and will use OpenAPI as a backup connection.
    - `OpenAPI` will only allow connections through the OpenAPI.
    - `BLE` will only allow connections through Bluetooth (BLE), .
    - `Disable` will disable all connections. This will also allow you to disable commands and refreshes for a specific device but leave it in HomeKit.
- Added Support for Ceiling Light & Ceiling Light Pro
- Fixes Smart Lock Issues fixed in v1.1 of OpenAPI. [#462](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/462)
= Fixes excessive logging from node-switchbot. [#435](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/435), [#444](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/444), [#446](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/446)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.15.0...v2.0.0

## [1.15.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.15.0) (2022-08-27)

### What's Changed

- Added BLE support for PlugMini (US) & PlugMini (JP)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.14.2...v1.15.0

## [1.14.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.14.2) (2022-08-20)

### What's Changed

- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.14.1...v1.14.2

## [1.14.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.14.1) (2022-06-28)

### What's Changed

- Fixed some logging.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.14.0...v1.14.1

## [1.14.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.14.0) (2022-06-25)

### What's Changed

- Added support for Smart Lock commands over OpenAPI [#382](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/337) [#387](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/337), Thanks [tom-todd](https://github.com/tom-todd)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.13.0...v1.14.0

## [1.13.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.13.0) (2022-05-04)

### What's Changed

- Added MQTT support for Meter and Curtain devices [#337](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/337), Thanks [banboobee](https://github.com/banboobee)
- Added Eve history features for meter devices [#338](https://github.com/OpenWonderLabs/homebridge-switchbot/pull/338), Thanks [banboobee](https://github.com/banboobee)
- Added Config `setOpenMode` and `setCloseMode` so that you can set mode to be Performance or Silent.
- Added Config to allow manually setting firmware version.
- Fixed Smart Lock Display state status.
  - Still unable to control Locks because of API limitations.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.12.8...v1.13.0

## [1.12.8](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.12.8) (2022-03-19)

### What's Changed

- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.12.7...v1.12.8

## [1.12.7](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.12.7) (2022-03-07)

### What's Changed

- Separated Color Bulb and Strip Lights
  - Strip Lights no longer support Adaptive Lighting.
    - Adaptive Lighting requires Color Temperature, which Strip Lights do not support.
- Separated Meter and Meter Plus for BLE purposes.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.12.6...v1.12.7

## [1.12.6](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.12.6) (2022-03-04)

### What's Changed

- Fix for Curtain v3.3 and above, from v1.2.0 node-switchbot update.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.12.5...v1.12.6

## [1.12.5](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.12.5) (2022-02-15)

### What's Changed

- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.12.4...v1.12.5

## [1.12.4](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.12.4) (2022-02-12)

### What's Changed

- Fix support for Meter Plus
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.12.3...v1.12.4

## [1.12.3](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.12.3) (2022-02-05)

### What's Changed

- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.12.2...v1.12.3

## [1.12.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.12.2) (2022-02-02)

### What's Changed

- Fix: Issue where `PositionState` was not being sent back to Home App. Fixes [#123](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/123) Thanks [@dnicolson](https://github.com/dnicolson)!

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.12.1...v1.12.2

## [1.12.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.12.1) (2022-02-01)

### What's Changed

- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.12.0...v1.12.1

## [1.12.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.12.0) (2022-01-29)

### What's Changed

- Add option `maxRetry` for bots so you can set the number of retries for sending on or off for Bot.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.11.2...v1.12.0

## [1.11.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.11.2) (2022-01-29)

### What's Changed

- Fix: Use `updateRate` instead of `refreshRate` when overriding `scanDuration`.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.11.1...v1.11.2

## [1.11.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.11.1) (2022-01-29)

### What's Changed

- Fix: `This plugin generated a warning from the characteristic 'Brightness': characteristic value expected valid finite number and received "undefined" (undefined)`.
- Fix: `This plugin generated a warning from the characteristic 'Color Temperature': characteristic value expected valid finite number and received "undefined" (undefined)`.
- Fix: `This plugin generated a warning from the characteristic 'Hue': characteristic value expected valid finite number and received "undefined" (undefined)`.
- Fix: `This plugin generated a warning from the characteristic 'Saturation': characteristic value expected valid finite number and received "undefined" (undefined)`.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.11.0...v1.11.1

## [1.11.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.11.0) (2022-01-29)

### What's Changed

- Add Support for SwitchBot Smart Lock
- Add Support for SwitchBot Strip Light
- Add Support for SwitchBot Meter Plus (US)
- Add Support for SwitchBot Meter Plus (JP)
- Add Support for SwitchBot Plug Mini (US)
- Add Support for SwitchBot Plug Mini (US)
- Fixed: Curtain `set_min` and `set_max` options not work correctly with minimum and maximum curtain state. [#123](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/123)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.10.1...v1.11.0

## [1.10.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.10.1) (2022-01-26)

### What's Changed

- Fixed: Option `pushOn` was not push `On` commands.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.10.0...v1.10.1

## [1.10.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.10.0) (2022-01-21)

### What's Changed

- Add option `pushOn`, this will allow the `On` commands to be sent along side `Status` change commands.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.9.0...v1.10.0

## [1.9.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.9.0) (2022-01-20)

### What's Changed

- Add option `allowPush`, this will allow commands to be sent even if device state is already in state that is being pushed.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.8.2...v1.9.0

## [1.8.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.8.2) (2022-01-15)

### What's Changed

- Fixed Bug: Only log config if it is set.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.8.1...v1.8.2

## [1.8.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.8.1) (2022-01-15)

### What's Changed

- Fixed Bug: Cannot set properties of undefined (setting 'logging')

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.8.0...v1.8.1

## [1.8.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.8.0) (2022-01-14)

### What's Changed

- Added option to display Bot a Stateful Programmable Switch.
  - This will only Works in 3rd Party Home App, Like [Eve](https://apps.apple.com/us/app/eve-for-homekit/id917695792) or [Home+ 5](https://apps.apple.com/us/app/home-5/id995994352)
- Add option to Hide Motion Sensor's Light Sensor.
- Add option to Set Motion Sensor's Light Sensor `set_minLux` and `set_maxLux`.
- Fixed Bug: Where BLE config would show for devices that don't support BLE.
- Fixed Bug: Contact Sensors's Motion Sensor and Light Sensor showing undefined values.
- Fixed Bug: Motion Sensors's Light Sensor showing undefined values.
- Fixed Bug: Battery Service wouldn't be removed from Curtain, Contact Sensor, or Motion Sensor when switching from BLE to OpenAPI.
- Enhancements: Made some improvement on the switch from BLE to OpenAPI when BLE connection fails.
- Enhancements: Made Optional Switchbot Device Settings and Optional IR Device Settings more managable by using Tabs.
- Change: Changed Curtain `refreshRate` to `updateRate`.
  - You will have to update your config for it to pickup the new `updateRate`.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.7.0...v1.8.0

## [1.7.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.7.0) (2022-01-05)

### What's Changed

- Added option to display Bot a Fan.
- Added option to display Bot a Door. [#179](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/179)
- Added option to display Bot a Lock. [#179](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/179)
- Added option to display Bot a Faucet.
- Added option to display Bot a Window.
- Added option to display Bot a WindowCovering.
- Added option to display Bot a Garage Door Opener. [#179](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/179)

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.6.3...v1.7.0

## [1.6.3](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.6.3) (2022-01-03)

### What's Changed

- Quick Fix for for issue not tested in `v1.6.2`.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.6.2...v1.6.3

## [1.6.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.6.2) (2022-01-03)

### What's Changed

- Fixed Bug: npm ERR! code 1. [#151](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/151)
  - Made `node-switchbot` an optionalDependencies
  - So If `node-switchbot` doesn't get installed successfully then BLE will not work.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.6.1...v1.6.2

## [1.6.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.6.1) (2022-01-02)

### What's Changed

- Fixed an issue where when `Adaptive Lighting Shift` was set to -1, Adaptive Lighting would not be removed.
- Fixed an issue with motion sensor refreshStatus that would cause plugin to cause Homebridge restart.
- Fixed Bug: npm ERR! code 1. [#151](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/151)
  - Made `node-switchbot` an optionalDependencies
  - So If `node-switchbot` doesn't get installed successfully then BLE will not work.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.6.0...v1.6.1

## [1.6.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.6.0) (2021-12-31)

### What's Changed

- Added `scanDuration` config option to set how long BLE scans, Scanning Duration is defaulted to 1 second.
- Now Setting `switch` as the default bot mode for Bots, to change to press, config must be set under `SwitchBot Device Settings` in the Plugin Settings.
- Fixed Bug: Contact Sensor talks about Curtain Light + Motion Sensor. [#164](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/164)
- Fixed Bug: Reboot causes No Device Type Set Error. [#172](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/172)
- Fixed Bug: Bot Status not working Correction with Switch and Press. [#105](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/105), [#130](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/130), [#132](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/132), [#165](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/165), [#174](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/174)
- Fixed some issues with the New Logging Options release with v1.5.0, now logging when configured.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.5.0...v1.6.0

## [1.5.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.5.0) (2021-12-27)

### What's Changed

### Major Change To `Logging`

- Added the following Logging Options:
  - `Standard`
  - `None`
  - `Debug`
- Removed Device Logging Option, which was pushed into new logging under debug.
- Added Device Logging Override for each Device, by using the Device Config.

### Major Changes to `refreshRate`

- Added an option to override `refreshRate` for each Device, by using the Device Config.

### Other Changes

- Fixed Bug: Air conditioner temperature not able to change. [#43](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/43)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.4.0...v1.5.0

## [1.4.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.4.0) (2021-12-15)

### What's Changed

- Added Status Messages to logs for discoverDevices request.
- Added Cached Status to IR device, Status will be saved to accessory context and restored on restart.
- Added Option `Offline as Off` to be able set the device as off, if API reports offline.
- Removed Meter Unit Config Option as it was confusing and probably never used.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.3.0...v1.4.0

## [1.3.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.3.0) (2021-12-02)

### What's Changed

- Added Adpative Lighting to Color Bulb
- Added Option `Adaptive Lighting Shift` to be able us this value to increase the mired for the Adaptive Lighting update, making the light appear warmer.
- Fixed Bug: Color Bulb can't change color and is not dimmable. [#97](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/97)

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.2.5...v1.3.0

## [1.2.5](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.5) (2021-11-25)

### What's Changed

- Fixed Bug: Where `set_minLux` & `set_maxLux` config settings not effecting OpenAPI Lux.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.2.4...v1.2.5

## [1.2.4](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.4) (2021-11-24)

### What's Changed

- Fixed Bug: Cannot read properties of undefined (reading 'updateCharacteristic').

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.2.3...v1.2.4

## [1.2.3](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.3) (2021-11-24)

### What's Changed

- When BLE Connection isn't established, allow for OpenAPI to kick in if `openToken` is supplied.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.2.2...v1.2.3

## [1.2.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.2) (2021-11-24)

### What's Changed

- Allow the `configDeviceName` to override `deviceName`.
- Added Logging when BLE Connection wasn't established.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.2.1...v1.2.2

## [1.2.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.1) (2021-11-24)

### What's Changed

- Fixed Bug: Curtains alternate between open/close state. [#85](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/85)
- Fixed Bug: Meter not working with BLE. [#110](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/110)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.2.0...v1.2.1

## [1.2.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.2.0) (2021-11-19)

### What's Changed

- Added option to be able to do Bluetooth Low Energy (BLE) Only Connection.
  - Must supply `Device ID` & `Device Name` to the Device Config
  - Must Check `Enable Bluetooth Low Energy (BLE) Connection`
- Fixed Bug: Air conditioner temperature not able to change. [#43](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/43)
- Add option to set Min Lux and Max Lux for Curtain's Light Sensor.
- Add `updateHomeKitCharacteristics` to IR Devices to contain all `updateCharacteristics` in one spot.
- Add `Saturation` and `Hue` to Colorbulb.
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.1.0...v1.2.0

## [1.1.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.1.0) (2021-11-16)

### What's Changed

- Fixed Bug: Curtains alternate between open/close state. [#85](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/85)
- Fixed Bug: IR Fan won't be hidden in Home app. [#90](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/90)
- Fixed Bug: `hide_temperature` config option causing `Cannot read property 'updateCharacteristic' of undefined` for Humidifiers. [#89](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/89)
- Add option to Hide Curtain's Light Sensor. [#91](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/91)
- Add option to Hide Contact Sensor's Motion Sensor or Light Sensor.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.0.2...v1.1.0

## [1.0.2](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.0.2) (2021-11-15)

### What's Changed

- Fixed Bug: `failed to discover devices. cannot read property 'touppercase' of undefined`. [#84](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/84)
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.0.1...v1.0.2

## [1.0.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.0.1) (2021-11-14)

### What's Changed

- Fixed `Cannot read properties of undefined (reading 'updateCharacteristic')` on Bots. [#77](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/77)
- Fixed Temperature not being retrieved for Switchbot Meter. [#78](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/78)

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v1.0.0...v1.0.1

## [1.0.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.0.0) (2021-11-13)

### What's Changed

- Official release of homebridge-Switchbot, which combines both BLE and OpenAPI into 1 plugin.
- Adds Light Sensors to Curtains
  - with iOS 15.1 you can set automations on light sensors.
- Adds Motion Sensor to Contact Sensors
- Adds Support Color Bulbs

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v0.1.1...v1.0.0

## [0.1.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v0.1.1) (2021-09-11)

### What's Changed

- Fix Contact Sensor adding as Motion Sensor instead of Contact Sensor

**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/v0.1.0...v0.1.1

## [0.1.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v0.1.0) (2021-09-10)

### What's Changed

- Initial release of homebridge-switchbot.
- Adds Support for Motion & Contact Sensors
- Adds Water Level to Humidifier
