# Changelog

All notable changes to this project will be documented in this file. This project uses [Semantic Versioning](https://semver.org/)

## [Version 1.0.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.0.1) (2020-11-14)

### Changes

- Fixed `Cannot read properties of undefined (reading 'updateCharacteristic')` on Bots. [#77](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/77)
- Fixed Temperature not being retrieved for Switchbot Meter. [#78](https://github.com/OpenWonderLabs/homebridge-switchbot/issues/78)

## [Version 1.0.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v1.0.0) (2020-11-13)

### Changes

- Offical release of homebridge-Switchbot, which combines both BLE and OpenAPI into 1 plugin.
- Adds Light Sensors to Curtains
    - with iOS 15.1 you can set automations on light sensors.
- Adds Motion Sensor to Contact Sensors
- Adds Support Color Bulbs

## [Version 0.1.1](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v0.1.1) (2020-09-11)

### Changes

- Fix Contact Sensor adding as Motion Sensor instead of Contact Sensor

## [Version 0.1.0](https://github.com/OpenWonderLabs/homebridge-switchbot/releases/tag/v0.1.0) (2020-09-10)

### Changes

- Initial release of homebridge-switchbot.
- Adds Support for Motion & Contact Sensors
- Adds Water Level to Humidifier