# SwitchBot BLE Documentation

The `SwitchBot` class allows you to interact with SwitchBot devices using the SwitchBot BLE. This documentation provides an overview of how to install, set up, and use the various methods available in the `SwitchBotBLE` class.

## Table of Contents

- [BLE (Bluetooth Low Energy)](#ble-bluetooth-low-energy)
  - [Supported OS](#supported-os)
  # SwitchBot BLE Documentation

  BLE support in `node-switchbot` is part of the v4 unified architecture. The primary API is the `SwitchBot` class, which can use BLE directly, OpenAPI directly, or both together with automatic fallback.

  This document covers:

  - BLE support and prerequisites on macOS and Linux
  - BLE-first usage through the unified `SwitchBot` class
  - Bot password protection over BLE
  - Low-level BLE helpers for advanced use: `BLEScanner` and `BLEConnection`

  ## v4 BLE Model

  In v4.0.0, BLE is no longer a separate top-level workflow that you have to adopt in isolation. Instead:

  - `SwitchBot` is the main public entry point
  - BLE is used when `enableBLE: true`
  - OpenAPI can be used as fallback when credentials are present
  - Devices are accessed through `switchbot.devices`
  - Per-device commands automatically choose the best available connection path

  ## Supported Platforms

  BLE is supported on:

  - macOS
  - Linux, including Ubuntu, Debian, Raspbian, and similar distributions

  BLE is not supported on Windows in this package. On Windows, use API-only mode through the unified `SwitchBot` class.

  ## Requirements

  - Node.js `^20 || ^22 || ^24`
  - `@stoprocent/noble` is included as a dependency

  ## Prerequisites

  ### macOS

  - Install Xcode from the App Store
  - Allow Bluetooth access for your terminal application in System Settings or System Preferences

  ### Linux (Ubuntu, Debian, Raspbian)

  Install required packages:

  ```bash
  sudo apt-get install bluetooth bluez libbluetooth-dev libudev-dev
  ```

  For non-root access, also install `libcap2-bin` and grant raw socket capability to `node`:

  ```bash
  sudo apt-get install libcap2-bin
  sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)
  ```

  On Raspberry Pi, if BLE connections are unstable, you may need to disable the `pnat` plugin in `/etc/bluetooth/main.conf` and restart Bluetooth or reboot.

  ### Fedora and Other RPM-Based Linux

  ```bash
  sudo yum install bluez bluez-libs bluez-libs-devel
  ```

  For more platform details, see the `@stoprocent/noble` prerequisites documentation.

  ## Unified BLE Usage

  ### BLE-Only Mode

  Use BLE without OpenAPI credentials:

  ```typescript
  import { LogLevel, SwitchBot } from 'node-switchbot'

  const switchbot = new SwitchBot({
    enableBLE: true,
    enableFallback: false,
    logLevel: LogLevel.INFO,
  })

  const devices = await switchbot.discover({
    scanBLE: true,
    fetchAPI: false,
    timeout: 10_000,
  })

  console.log(`Found ${devices.length} BLE device(s)`)

  const bot = switchbot.devices.get('YOUR_DEVICE_ID')
  if (bot) {
    await bot.press()
  }

  await switchbot.cleanup()
  ```

  ### Hybrid BLE + API Mode

  Use BLE first, with automatic API fallback when needed:

  ```typescript
  import { LogLevel, SwitchBot } from 'node-switchbot'

  const switchbot = new SwitchBot({
    token: 'YOUR_TOKEN',
    secret: 'YOUR_SECRET',
    enableBLE: true,
    enableFallback: true,
    enableConnectionIntelligence: true,
    enableCircuitBreaker: true,
    enableRetry: true,
    logLevel: LogLevel.INFO,
  })

  await switchbot.discover({
    scanBLE: true,
    fetchAPI: true,
    timeout: 10_000,
  })

  const curtain = switchbot.devices.get('YOUR_CURTAIN_ID')
  if (curtain) {
    await curtain.open()
    const status = await curtain.getStatus()
    console.log(status)
  }

  await switchbot.cleanup()
  ```

  ## Discovery Options

  `switchbot.discover()` accepts the following v4 options:

  | Property | Type | Description |
  | :-- | :-- | :-- |
  | `scanBLE` | `boolean` | Enable BLE discovery for this call |
  | `fetchAPI` | `boolean` | Fetch devices from OpenAPI for this call |
  | `timeout` | `number` | Discovery timeout in milliseconds |
  | `deviceId` | `string` | Filter by SwitchBot device ID |
  | `mac` | `string` | Filter by MAC address |
  | `deviceType` | `string` | Filter by device type |

  ## Device Access Pattern

  After discovery, use the device manager:

  ```typescript
  const devices = switchbot.devices.list()
  const bot = switchbot.devices.get('YOUR_DEVICE_ID')
  const curtains = switchbot.devices.getByType('WoCurtain')
  ```

  Common device helpers include:

  - `getInfo()`
  - `getName()`
  - `getDeviceType()`
  - `getStatus()`

  Commands vary by device class. Examples:

  - Bot: `press()`, `turnOn()`, `turnOff()`, `handUp()`, `handDown()`
  - Curtain: `open()`, `close()`, `pause()`, `setPosition()`
  - Plug: `turnOn()`, `turnOff()`, `toggle()`

  ## Bot Password Protection

  Bot (`WoHand`) devices support password-protected BLE commands in v4.

  ### What It Adds

  - Password validation for exactly 4 alphanumeric characters
  - CRC32-based encrypted BLE command construction
  - Automatic encrypted command execution when a password is configured
  - Runtime helpers: `setPassword()`, `clearPassword()`, `hasPassword()`

  ### Supported Commands

  When a password is set, these BLE Bot commands use the encrypted flow:

  - `press()`
  - `turnOn()`
  - `turnOff()`
  - `handUp()`
  - `handDown()`

  ### Example

  ```typescript
  import { LogLevel, SwitchBot, WoHand } from 'node-switchbot'

  const switchbot = new SwitchBot({
    enableBLE: true,
    enableFallback: false,
    logLevel: LogLevel.INFO,
  })

  await switchbot.discover({ scanBLE: true, fetchAPI: false })

  const bot = switchbot.devices.get('YOUR_DEVICE_ID') as WoHand | undefined
  if (bot) {
    bot.setPassword('A1b2')

    if (bot.hasPassword()) {
      await bot.press()
    }

    bot.clearPassword()
  }

  await switchbot.cleanup()
  ```

  Notes:

  - Passwords are stored in memory only
  - The password must be configured again when your application starts
  - Password-protected Bot commands require BLE and do not use OpenAPI fallback for the encrypted write path

  ## Reliability Features in BLE Workflows

  The v4 BLE path includes the resilience features introduced in the 4.0.0 release:

  - Automatic retry with exponential backoff and jitter
  - Circuit breaker state management to avoid repeated failing connections
  - Connection intelligence that can prefer the more reliable path over time
  - Fallback hooks for custom logging, metrics, or alerting

  These behaviors are primarily exposed through the unified `SwitchBot` and `SwitchBotDevice` flow rather than through manual low-level BLE orchestration.

  ## Low-Level BLE APIs

  If you need raw scanning or connection control, v4 exports `BLEScanner` and `BLEConnection` directly.

  ### `BLEScanner`

  Use this for advertisement scanning and device discovery without going through `SwitchBot`.

  ```typescript
  import { BLEScanner } from 'node-switchbot'

  const scanner = new BLEScanner()

  scanner.on('discover', (advertisement) => {
    console.log(advertisement)
  })

  await scanner.startScan({ duration: 10_000, active: true })
  ```

  Public methods:

  - `startScan(options?)`
  - `stopScan()`
  - `getDiscoveredDevices()`
  - `getDevice(mac, bleId?)`
  - `waitForDevice(mac, timeoutMs?, bleId?)`
  - `destroy()`

  Events:

  - `ready`
  - `state-change`
  - `scan-start`
  - `scan-stop`
  - `discover`

  ### `BLEConnection`

  Use this for low-level connection, write, and notification handling.

  ```typescript
  import { BLEConnection } from 'node-switchbot'
  import { Buffer } from 'node:buffer'

  const connection = new BLEConnection()

  await connection.connect('AA:BB:CC:DD:EE:FF')
  await connection.write('AA:BB:CC:DD:EE:FF', Buffer.from([0x57, 0x01, 0x00]))
  const response = await connection.read('AA:BB:CC:DD:EE:FF')

  console.log(response)

  await connection.disconnectAll()
  ```

  Key public methods:

  - `connect(mac)`
  - `write(mac, data)`
  - `read(mac)`
  - `disconnectAll()`
  - `setPersistentConnectionTimeout(timeoutMs)`
  - `setEncryption(mac, keyHex, ivHex, mode?)`
  - `clearEncryption(mac)`

  ## BLE-Supported Device Families

  v4 BLE support includes, among others:

  - Bot
  - Curtain and Roller Shade
  - Blind Tilt
  - Meter family
  - Plug Mini family
  - Lock family
  - Humidifier family
  - Bulb and light families
  - Leak, contact, and presence sensors
  - Relay switch family

  Exact per-device behavior still depends on what the physical device exposes over BLE.

  ## Summary

  Use `SwitchBot` for almost all v4 BLE workflows. Reach for `BLEScanner` and `BLEConnection` only when you need direct advertisement scanning or manual low-level BLE control.
| enabled                        | `true`               | OFF           | Down (stretched)      |
| &nbsp;                         | `false`              | ON            | Up (retracted)        |

The `battery` is _experimental_ for now. I'm not sure whether the value is correct or not. Never trust this value for now.

#### Meter (WoSensorTH)

Example of the advertisement data:

```json
{
  "id": "cb4eb903c96d",
  "address": "cb:4e:b9:03:c9:6d",
  "rssi": -70,
  "serviceData": {
    "model": "T",
    "modelName": "WoSensorTH",
    "temperature": {
      "c": 25.2,
      "f": 77.4
    },
    "fahrenheit": false,
    "humidity": 43,
    "battery": 100
  }
}
```

Structure of the `data`:

| Property         | Type    | Description                                                                                                  |
| :--------------- | :------ | :----------------------------------------------------------------------------------------------------------- |
| `model`          | String  | This value is always `"T"`, which means "Meter (WoSensorTH)".                                                |
| `modelName`      | String  | This value is always `"WoSensorTH"`, which means "Meter".                                                    |
| `temperature`    | Object  |
| &nbsp;&nbsp; `c` | Float   | Temperature (degree Celsius/°C)                                                                              |
| &nbsp;&nbsp; `f` | Float   | Temperature (degree Fahrenheit/℉)                                                                            |
| `fahrenheit`     | Boolean | The flag whether the Meter shows Fahrenheit (`true`) or Celsius (`false`) for the temperature on the display |
| `humidity`       | Integer | Humidity (`%`)                                                                                               |
| `battery`        | Integer | (**experimental**) This value indicates the battery level (`%`).                                             |

The `fahrenheit` indicates the setting on the device. Note that it does _not_ indicate the setting on the official smartphone app. The setting of the temperature unit on the device and the setting on the app are independent.

The `battery` is _experimental_ for now. I'm not sure whether the value is correct or not. Never trust this value for now.

#### Curtain (WoCurtain)

Example of the advertisement data:

```json
{
  "id": "ec58c5d00111",
  "address": "ec:58:c5:d0:01:11",
  "rssi": -39,
  "serviceData": {
    "model": "c",
    "modelName": "WoCurtain",
    "calibration": true,
    "battery": 91,
    "position": 1,
    "lightLevel": 1
  }
}
```

Structure of the `serviceData`:

| Property      | Type    | Description                                                                        |
| :------------ | :------ | :--------------------------------------------------------------------------------- |
| `model`       | String  | This value is `"c"`, which means "Curtain (WoCurtain)".                            |
|               |         | or `"{"`, which means "Curtain 3 (WoCurtain)".                                     |
| `modelName`   | String  | This value is always `"WoCurtain"`, which means "Curtain".                         |
| `calibration` | Boolean | This value indicates the calibration status (`true` or `false`).                   |
| `battery`     | Integer | This value indicates the battery level (`1-100`, `%`).                             |
| `position`    | Integer | This value indicates the percentage of current position (`0-100`, 0 is open, `%`). |
| `lightLevel`  | Integer | This value indicates the light level of the light source currently set (`1-10`).   |

#### Contact (WoContact)

Example of the advertisement data:

```json
{
  "id": "f0cda125e3ec",
  "address": "f0:cd:a1:25:e3:ec",
  "rssi": -56,
  "serviceData": {
    "model": "d",
    "modelName": "WoContact",
    "movement": false,
    "battery": 95,
    "doorState": "close",
    "lightLevel": "bright"
  }
}
```

Structure of the `serviceData`:

| Property     | Type    | Description                                                                  |
| :----------- | :------ | :--------------------------------------------------------------------------- |
| `model`      | String  | This value is always `"c"`, which means "Contact (WoContact)".               |
| `modelName`  | String  | This value is always `"WoContact"`, which means "Contact".                   |
| `movement`   | Boolean | This value indicates the motion status (`true` or `false`).                  |
| `battery`    | Integer | This value indicates the battery level (`1-100`, `%`).                       |
| `doorState`  | String  | This value indicates the door Status (`close`, `open`, `timeout no closed`). |
| `lightLevel` | String  | This value indicates the light level (`dark`, `bright`).                     |

#### Motion (WoMotion)

Example of the advertisement data:

```json
{
  "id": "e7216fa344a9",
  "address": "e7:21:6f:a3:44:a9",
  "rssi": -53,
  "serviceData": {
    "model": "s",
    "modelName": "WoMotion",
    "movement": false,
    "battery": 96,
    "lightLevel": "bright"
  }
}
```

Structure of the `serviceData`:

| Property     | Type    | Description                                                  |
| :----------- | :------ | :----------------------------------------------------------- |
| `model`      | String  | This value is always `"s"`, which means "Motion (WoMotion)". |
| `modelName`  | String  | This value is always `"WoMotion"`, which means "Motion".     |
| `movement`   | Boolean | This value indicates the motion status (`true` or `false`).  |
| `battery`    | Integer | This value indicates the battery level (`1-100`, `%`).       |
| `lightLevel` | String  | This value indicates the light level (`dark`, `bright`).     |

#### PlugMini (WoPlugMini)

Example of the advertisement data:

```json
{
  "id": "cd2409ea3e9441f87d4580e0380a62bf",
  "address": "60:55:f9:35:f6:a6",
  "rssi": -50,
  "serviceData": {
    "model": "j",
    "modelName": "WoPlugMini",
    "state": "off",
    "delay": false,
    "timer": false,
    "syncUtcTime": true,
    "wifiRssi": 48,
    "overload": false,
    "currentPower": 0
  }
}
```

Structure of the `serviceData`:

| Property       | Type    | Description                                                                        |
| :------------- | :------ | :--------------------------------------------------------------------------------- |
| `model`        | String  | This value is always `"j"` or `"g"`, which means "PlugMini" (JP or US).            |
| `modelName`    | String  | This value is always `"WoPlugMini"`, which means "PlugMini".                       |
| `state   `     | Boolean | This value indicates whether the plug mini is turned on (`true`) or not (`false`). |
| `delay`        | Boolean | Indicates whether a delay is present.                                              |
| `timer`        | Boolean | Indicates whether a timer is present.                                              |
| `syncUtcTime`  | boolean | Indicates whether the UTC time has been synchronized.                              |
| `overload`     | boolean | Indicates whether the Plug Mini is overloaded, more than 15A current overload.     |
| `currentPower` | Float   | Current power consumption in Watts.                                                |

---

#### SmartLock (WoSmartLock)

Example of the advertisement data:

```json
{
  "id": "d30864110b8c",
  "address": "d3:08:64:11:0b:8c",
  "rssi": -52,
  "serviceData": {
    "model": "o",
    "modelName": "WoSmartLock",
    "battery": 100,
    "calibration": true,
    "status": "LOCKED",
    "update_from_secondary_lock": false,
    "door_open": false,
    "double_lock_mode": false,
    "unclosed_alarm": false,
    "unlocked_alarm": false,
    "auto_lock_paused": false
  }
}
```

Structure of the `serviceData`:

| Property                     | Type    | Description                                                                         |
| :--------------------------- | :------ | :---------------------------------------------------------------------------------- |
| `model`                      | String  | This value is `"o"`, which means "Lock (WoSmartLock)".                              |
| `modelName`                  | String  | This value is always `"WoSmartLock"`, which means "Lock".                           |
| `battery`                    | Integer | This value indicates the battery level (`1-100`, `%`).                              |
| `calibration`                | Boolean | This value indicates the calibration status (`true` or `false`).                    |
| `status`                     | String  | This value indicates the current locked state. Possible values:                     |
|                              |         | `"LOCKED"`, `"UNLOCKED"`, `"LOCKING"`, `"UNLOCKING"`                                |
|                              |         | `"LOCKING_STOP"`, `"UNLOCKING_STOP"` (stuck when locking or unlocking respectively) |
|                              |         | `"NOT_FULLY_LOCKED"` (eu model only), `"UNKNOWN"` (fallback: must be some error)    |
| `update_from_secondary_lock` | Boolean | ??                                                                                  |
| `door_open`                  | Boolean | door open status - whether the door is not detecting the sensor magnet              |
| `double_lock_mode`           | Boolean | dual lock mode enabled status - two locks working simultaneously                    |
| `unclosed_alarm`             | Boolean | enabled status for door ajar alarm function                                         |
| `unlocked_alarm`             | Boolean | whether the alarm function is enabled for door left unlocked                        |
| `auto_lock_paused`           | Boolean | auto lock mode paused                                                               |
| `night_latch`                | Boolean | night latch mode enabled (eu firmware only)                                         |

### Control Device

This sample discovers a Bot (WoHand), then put the Bot's arm down, finally put it up in 5 seconds.

```Typescript
// Load the node-switchbot and get a `Switchbot` constructor object
import { SwitchBotBLE } from 'node-switchbot';
// Create a `Switchbot` object
const switchBotBLE = new SwitchBotBLE();

(async () => {
  // Find a Bot (WoHand)
  const bot_list = await switchBotBLE.discover({ model: "H", quick: true });
  if (bot_list.length === 0) {
    throw new Error("No device was found.");
  }
  // The `WoHand` object representing the found Bot.
  const device = bot_list[0];
  // Put the Bot's arm down (stretch the arm)
  await device.down();
  // Wait for 5 seconds
  await switchBotBLE.wait(5000);
  // Put the Bot's arm up (retract the arm)
  await device.up();
  process.exit();
})();
```

In order to manipulate the arm of your Bot, you have to discover your Bot using the [`discover()`](#discover-method) method. The object `{ model: 'H' }` passed to the method means that only Bots will be discovered. That is, Meters will be ignored.

In this code, you can get a [`WoHand`](#SwitchbotDeviceWoHand-object) object representing the found Bot. Using the [`down()`](#SwitchbotDeviceWoHand-down-method) and [`up()`](#SwitchbotDeviceWoHand-up-method) methods of the object, you can move the arm. In addition to these methods, you can use the [`press()`](#SwitchbotDeviceWoHand-press-method), [`turnOn()`](#SwitchbotDeviceWoHand-turnOn-method), and [`turnOff()`](#SwitchbotDeviceWoHand-turnOff-method) methods as well.

### Logging

To be able to receive logging that this module is pushing out you will need to subscribe to the events.

```typescript
this.switchBotBLE.on('log', (log) => {
  switch (log.level) {
    case LogLevel.SUCCESS:
      this.successLog(log.message)
      break
    case LogLevel.DEBUGSUCCESS:
      this.debugSuccessLog(log.message)
      break
    case LogLevel.WARN:
      this.warnLog(log.message)
      break
    case LogLevel.DEBUGWARN:
      this.debugWarnLog(log.message)
      break
    case LogLevel.ERROR:
      this.errorLog(log.message)
      break
    case LogLevel.DEBUGERROR:
      this.debugErrorLog(log.message)
      break
    case LogLevel.DEBUG:
      this.debugLog(log.message)
      break
    case LogLevel.INFO:
    default:
      this.infoLog(log.message)
  }
})
```

### Supported Devices

The following devices are supported.

| Device                                         | BLE Support |
| ---------------------------------------------- | ----------- |
| SwitchBot Bot                                  | Yes         |
| SwitchBot Curtain                              | Yes         |
| SwitchBot Meter                                | Yes         |
| SwitchBot Motion Sensor                        | Yes         |
| SwitchBot Contact Sensor                       | Yes         |
| SwitchBot Plug Mini                            | Yes         |
| SwitchBot Smart Lock                           | Yes         |
| SwitchBot Smart Lock Pro                       | Yes         |
| SwitchBot Humidifier                           | Yes         |
| SwitchBot Evaporative Humidifier (Auto-refill) | No          |
| SwitchBot Color Bulb                           | Yes         |
| SwitchBot LED Strip Light                      | Yes         |

### Summary

The `SwitchBotBLE` class provides a powerful way to interact with your SwitchBot devices through BLE. By following the examples provided, you can easily integrate SwitchBot device control and monitoring into your applications.
