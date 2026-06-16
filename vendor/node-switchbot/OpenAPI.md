# SwitchBot OpenAPI Documentation

OpenAPI support in `node-switchbot` is part of the v4 unified architecture. The primary public API is the `SwitchBot` class, which can run in API-only mode or in hybrid BLE + OpenAPI mode.

This document covers:

- Using OpenAPI through the unified `SwitchBot` class
- Running in API-only mode
- Using the lower-level `OpenAPIClient` directly
- Webhook and scene helpers exposed by `OpenAPIClient`

## v4 OpenAPI Model

In v4.0.0:

- `SwitchBot` is the recommended entry point
- OpenAPI is enabled when `token` and `secret` are provided
- You can run API-only by setting `enableBLE: false`
- You can run hybrid mode by combining credentials with `enableBLE: true`
- Discovered devices are accessed through `switchbot.devices`

## Credentials

To use OpenAPI, you need a SwitchBot token and secret.

In the SwitchBot mobile app:

1. Open your profile
2. Open preferences
3. Tap the app version multiple times to unlock developer options
4. Copy your token and secret

## API-Only Mode

Use this mode on Windows or anywhere you want cloud-only operation.

```typescript
import { LogLevel, SwitchBot } from 'node-switchbot'

const switchbot = new SwitchBot({
  token: 'YOUR_TOKEN',
  secret: 'YOUR_SECRET',
  enableBLE: false,
  logLevel: LogLevel.INFO,
})

const devices = await switchbot.discover({
  scanBLE: false,
  fetchAPI: true,
})

console.log(`Found ${devices.length} device(s) from OpenAPI`)

const bot = switchbot.devices.get('YOUR_DEVICE_ID')
if (bot) {
  await bot.turnOn()
  const status = await bot.getStatus()
  console.log(status)
}

await switchbot.cleanup()
```

## Hybrid Mode

If you want local BLE when available and cloud fallback when needed:

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

const lock = switchbot.devices.get('YOUR_LOCK_ID')
if (lock) {
  await lock.lock()
}

await switchbot.cleanup()
```

## Discovery Through OpenAPI

When OpenAPI is enabled, `switchbot.discover()` can fetch cloud-registered devices and merge them with BLE discoveries.

Supported discovery options:

| Property | Type | Description |
| :-- | :-- | :-- |
| `scanBLE` | `boolean` | Enable BLE discovery for this call |
| `fetchAPI` | `boolean` | Enable OpenAPI device fetch for this call |
| `timeout` | `number` | Discovery timeout in milliseconds |
| `deviceId` | `string` | Filter by SwitchBot device ID |
| `mac` | `string` | Filter by MAC address |
| `deviceType` | `string` | Filter by device type |

## Device Manager Pattern

After discovery:

```typescript
const devices = switchbot.devices.list()
const curtain = switchbot.devices.get('YOUR_CURTAIN_ID')
const locks = switchbot.devices.getByType('WoSmartLock')
```

Every discovered device exposes the unified command surface for its class, regardless of whether the eventual command runs over API, BLE, or a fallback path.

## Lower-Level `OpenAPIClient`

If you need direct access to the SwitchBot cloud API without the full hybrid layer, use `OpenAPIClient`.

```typescript
import { OpenAPIClient } from 'node-switchbot'

const api = new OpenAPIClient('YOUR_TOKEN', 'YOUR_SECRET')

const devices = await api.getDevices()
console.log(devices)

const status = await api.getStatus('YOUR_DEVICE_ID')
console.log(status)

await api.sendCommand('YOUR_DEVICE_ID', 'turnOn')
```

### Core Methods

| Method | Description |
| :-- | :-- |
| `getDevices()` | Fetch cloud devices |
| `getStatus(deviceId)` | Fetch device status |
| `sendCommand(deviceId, command, parameter?)` | Send a raw OpenAPI command |
| `getScenes()` | Fetch scenes |
| `executeScene(sceneId)` | Run a scene |

### Webhook Methods

| Method | Description |
| :-- | :-- |
| `setupWebhook(config)` | Register a webhook |
| `queryWebhook(urls?)` | Query existing webhook configuration |
| `updateWebhook(config)` | Update a webhook |
| `deleteWebhook(url)` | Remove a webhook |

### Convenience Methods

The client also exposes convenience wrappers for common device families, including Bot and Curtain helpers.

Examples:

- `botPress(deviceId)`
- `botTurnOn(deviceId)`
- `botTurnOff(deviceId)`
- `curtainOpen(deviceId, speed?)`
- `curtainClose(deviceId, speed?)`
- `curtainPause(deviceId)`
- `curtainSetPosition(deviceId, position, speed?)`

## Logging

In v4, logging is configured through the unified constructor rather than through a legacy event-emitter API shown in older docs.

Example using the main `SwitchBot` class:

```typescript
const switchbot = new SwitchBot({
  token: 'YOUR_TOKEN',
  secret: 'YOUR_SECRET',
  enableBLE: false,
  logger: {
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
  },
})
```

## OpenAPI-Supported Device Families

OpenAPI support generally includes the major SwitchBot cloud-connected device families, such as:

- Bot
- Curtain and Roller Shade
- Meter family
- Contact and motion or presence sensors
- Plug Mini family
- Lock family
- Humidifier and air purifier family
- Bulb and strip light family
- Hub-connected devices supported by the SwitchBot cloud

Actual availability depends on SwitchBot cloud support for the device and whether cloud service is enabled in your account.

## Relationship to BLE

OpenAPI docs are no longer separate from the main product model. In v4:

- Use [BLE.md](BLE.md) for platform-specific BLE prerequisites and low-level BLE helpers
- Use this document for cloud API behavior and `OpenAPIClient`
- Use the main README for the high-level v4 migration and quick-start path

## Summary

Use `SwitchBot` for most v4 applications. Use `OpenAPIClient` only when you want direct cloud API access without the device abstraction and hybrid connection logic.
