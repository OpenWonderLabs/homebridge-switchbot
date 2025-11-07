# Manual End-to-End Verification

This guide walks through manual end-to-end verification for representative devices (light, fan, curtain, lock) across BLE and OpenAPI paths, and verifies Matter-first behavior with HAP fallback.

## Prerequisites

- macOS with Bluetooth (for BLE verification)
- Local development environment set up (Node.js, npm)
- Homebridge installed locally or available (for running a test instance)
- SwitchBot devices available (at least one light, one fan, one curtain, one lock) OR corresponding cloud-hub access
- `openApiToken` when testing OpenAPI path

## Quick setup

1. Install dependencies:

```bash
npm install --legacy-peer-deps
```

2. Build the plugin:

```bash
npm run build
```

3. Recommended: run the watch task which links the plugin and restarts on changes (requires a local Homebridge installation):

```bash
npm run watch
```

Alternative (manual linking):

```bash
npm run build && npm link
# then run your Homebridge instance (system/homebridge UI) so it picks up the linked plugin
```

## Example platform config snippets

OpenAPI (cloud) path — enable Matter preference:

```json
{
  "platform": "SwitchBot",
  "openApiToken": "<YOUR_OPENAPI_TOKEN>",
  "enableMatter": true,
  "preferMatter": true
}
```

BLE (direct) path — specify device by MAC address and prefer Matter:

```json
{
  "platform": "SwitchBot",
  "devices": [
    { "deviceId": "AA:BB:CC:DD:EE:FF", "type": "Light" }
  ],
  "enableMatter": true,
  "preferMatter": true
}
```

## Verification checklist

Run the steps below for each device type; repeat once using BLE and once using OpenAPI (where applicable).

- Start Homebridge (with the plugin linked) and verify the plugin logs indicate Matter registration attempt.
  - Look for log lines: `Attempting Matter registration for ...` or `Homebridge Matter API not available; will fallback to HAP`.
- Confirm accessories are registered in Matter (if Homebridge Matter child-bridge present) or appear as HAP accessories otherwise.

Device-specific tests

- Light
  - Toggle On/Off from Home app (or Homebridge UI) and confirm device responds.
  - Set brightness to 25%, 50%, 100% and confirm device reports matching levels.
  - If supported, change color temperature and/or color; confirm device applies new values.

- Fan
  - Toggle On/Off and verify.
  - Change rotation speed in steps (e.g., 25%, 50%, 100%).
  - Toggle oscillation / swing and verify position changes.

- Curtain
  - Open and Close via Home app / controller and verify movement.
  - Set specific position (e.g., 50%) and verify accurate reporting.

- Lock
  - Lock and Unlock from controller and verify state.
  - If lock user management supported, add/remove a test user per plugin UI and verify expected behavior.

## Logs & debugging

- Enable verbose logs from Homebridge or the plugin. Example: start Homebridge with a higher log level, or watch console output from `npm run watch`.
- Capture logs while you perform each operation; note the request path used by the plugin:
  - For OpenAPI: logs will show `https://api.switch-bot.com/v1.0/...` calls.
  - For BLE: logs will show local device discovery / BLE connect attempts.

## Run validation script (optional)

You can run the TypeScript build and unit tests to confirm the codebase is healthy before manual tests:

```bash
npm run build && npm run test
```

## Expected outcomes

- Matter-first registration: when Homebridge Matter API is available and `enableMatter` is true, accessories should be registered as Matter child-bridge accessories and re-used if restored from cache.
- HAP fallback: when Matter API is not available, the plugin must continue to register HAP accessories and reuse restored accessories by `accessory.context.deviceId`.
- Hybrid client paths: when `openApiToken` present the plugin should prefer OpenAPI for devices reachable via cloud; when BLE is available and configured the plugin should connect directly via BLE.
- Logs should show robust retry attempts for transient network errors and per-device retry throttling if configured.

## Next steps I can take

- Create small automated verification scripts that use the Homebridge API test harness to toggle characteristic values (requires more test harness code).
- Generate a printable checklist or a GitHub issue template for manual verification results.

If you want, I can add the automated verification scripts now — would you prefer a simple script that exercises On/Off and Brightness for lights, or a broader script covering all device types?
