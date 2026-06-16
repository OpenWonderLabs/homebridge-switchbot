<div align="center">

![node-switchbot](https://raw.githubusercontent.com/OpenWonderLabs/node-switchbot/latest/branding/Node_x_SwitchBot.svg?sanitize=true)

# Node-SwitchBot

[![npm version](https://badgen.net/npm/v/node-switchbot)](https://www.npmjs.com/package/node-switchbot)
[![npm downloads](https://badgen.net/npm/dt/node-switchbot)](https://www.npmjs.com/package/node-switchbot)

</div>

The `node-switchbot` is a Node.js module that allows you to interact with various SwitchBot devices. You can control your [SwitchBot (Bot)'s](https://www.switch-bot.com/bot) arm, operate your [SwitchBot Curtain](https://www.switch-bot.com/products/switchbot-curtain), and manage your [SwitchBot Lock](https://www.switch-bot.com/products/switchbot-lock). Additionally, you can monitor temperature and humidity using the [SwitchBot Thermometer & Hygrometer (Meter)](https://www.switch-bot.com/meter), and check the status of the [SwitchBot Motion Sensor](https://www.switch-bot.com/products/motion-sensor) and [SwitchBot Contact Sensor](https://www.switch-bot.com/products/contact-sensor).

This module now supports both Bluetooth Low Energy (BLE) and the SwitchBot OpenAPI, providing more flexibility and options for interacting with your devices.

Please note that most of this module was developed by referencing the official [BLE API](https://github.com/OpenWonderLabs/SwitchBotAPI-BLE) and [OpenAPI](https://github.com/OpenWonderLabs/SwitchBotAPI) documentation. However, some functionalities were developed through trial and error, so there might be inaccuracies in the information obtained from this module.

---

## [Installation](https://npmjs.org/node-switchbot)

To install the `node-switchbot` module within your project, use the following command:

```sh
$ npm install --save node-switchbot
```

---

## Quick Start (v4.0.0)

**v4.0.0** introduces a unified hybrid approach that automatically uses BLE when available with seamless API fallback.

### Basic Usage

```javascript
import { SwitchBot } from 'node-switchbot'

const switchbot = new SwitchBot({
  token: 'YOUR_TOKEN',      // OpenAPI token (optional for BLE-only)
  secret: 'YOUR_SECRET',    // OpenAPI secret (optional for BLE-only)
  enableBLE: true,          // Enable BLE discovery (Linux/macOS)
  enableFallback: true,     // Auto-fallback between BLE/API
})

// Discover all devices (BLE + API)
const devices = await switchbot.discover()

// Control devices
const bot = switchbot.devices.get('YOUR_DEVICE_ID')
await bot.press()

// Get status  
const status = await bot.getStatus()
console.log(status)

// Cleanup
await switchbot.cleanup()
```

### Device Control Examples

```javascript
// Bot - Press/Switch control
await bot.turnOn()
await bot.turnOff()
await bot.press()

// Bot with Password Protection (BLE only)
const protectedBot = new WoHand({ id: 'YOUR_BOT_ID', password: 'A1b2' })
await protectedBot.setPassword('A1b2')  // Set 4-char alphanumeric password
await protectedBot.press()              // Commands are automatically encrypted
await protectedBot.clearPassword()      // Remove password protection

// Curtain - Position control
await curtain.open()
await curtain.close()
await curtain.setPosition(50)  // 50% open

// Lock - Lock/Unlock
await lock.lock()
await lock.unlock()

// Bulb - Color and brightness
await bulb.turnOn()
await bulb.setBrightness(80)
await bulb.setColor(255, 0, 0)  // Red

// Meter - Read sensors
const meterStatus = await meter.getStatus()
console.log(meterStatus.temperature, meterStatus.humidity)
```

See the [examples directory](https://github.com/OpenWonderLabs/node-switchbot/tree/latest/examples) for more usage patterns.

---

## [BLE (Bluetooth Low Energy)](BLE.md)

To see a breakdown of how to use the BLE functionality of this project, visit the [BLE (Bluetooth Low Energy)](BLE.md) documentation.

## [OpenAPI](OpenAPI.md)

To see a breakdown of how to use the OpenAPI functionality of this project, visit the [OpenAPI](OpenAPI.md) documentation.

---

## Migration from v3.x

**Breaking Changes in v4.0.0:**

- ✨ **Unified API**: Single `SwitchBot` class replaces separate `SwitchBotBLE` and `SwitchBotOpenAPI` classes
- 🔄 **Automatic Discovery**: Combined BLE + OpenAPI discovery in one call
- 🛡️ **Automatic Fallback**: BLE commands automatically fall back to API on failure
- 📦 **Device Manager**: Access devices via `switchbot.devices.get(id)` instead of direct discovery results
- 🏷️ **TypeScript**: Full TypeScript rewrite with comprehensive type definitions
- ⚠️ **No Backward Compatibility**: v3.x APIs are not supported - migration required

**Migration Example:**

```javascript
// v3.x (old)
import { SwitchBotBLE, SwitchBotOpenAPI } from 'node-switchbot'
const ble = new SwitchBotBLE()
const api = new SwitchBotOpenAPI(token, secret)

// v4.0.0 (new)
import { SwitchBot } from 'node-switchbot'
const switchbot = new SwitchBot({ token, secret, enableBLE: true })
```

---

## References

- [SwitchBot (Official website)](https://www.switch-bot.com/)
- [Facebook @SwitchBotRobot](https://www.facebook.com/SwitchBotRobot/)
- [Twitter @SwitchBot](https://twitter.com/switchbot)
