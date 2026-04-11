# Migration notes — v4.3.x → v5.x

This document highlights important changes and recommended actions before upgrading to the release that includes Matter and stable `node-switchbot@4` support.

1. Matter-first behavior
   - The plugin will prefer registering accessories with Homebridge's Matter child-bridge when `enableMatter: true` and the Homebridge Matter API is available.
   - If Matter is not available, the plugin falls back to HAP and will reuse restored accessories by `accessory.context.deviceId`.

2. Configuration keys
   - `enableMatter` (boolean) — enable Matter child-bridge registration.
   - `preferMatter` (boolean) — prefer Matter for devices that support Matter descriptors; HAP fallback still available.
   - `openApiToken` + `openApiSecret` (string) — both are required for OpenAPI discovery/calls for cloud-reachable devices.
   - `perDeviceMaxRetries`, `requestTimeout`, `maxRetries` — network retry/timing options for OpenAPI fallback.

   - `writeDebounceMs` (number, milliseconds, default 100) — global write coalescing debounce window. Commands sent to the same device within this window are coalesced (last-write-wins) to reduce duplicate network/API commands. Set to `0` to disable coalescing if you require immediate, per-command delivery.

3. Hybrid client
   - The plugin dynamically imports `node-switchbot` when available and uses OpenAPI fallback when both `openApiToken` and `openApiSecret` are configured.
   - If you rely on BLE-only operation, ensure devices and the host have BLE available.

4. UI changes
   - A small plugin UI was added; it's only enabled/copied into `dist/homebridge-ui` when `npm run build` is run and the UI files exist in `src/homebridge-ui/public`.

   - The UI is always served when Homebridge UI support is present; there is no opt-out flag in the platform config. The server-side guard that previously allowed disabling the UI has been removed—if you need to restrict access, manage it via Homebridge UI / host network access controls.

5. Tests and verification
   - Manual E2E scripts are provided in `scripts/e2e/` and a GitHub `workflow_dispatch` job can optionally run them against a reachable Homebridge.
   - Run the local test suite before upgrading to confirm TypeScript and unit tests pass: `npm run build && npm run test`.

6. Rollback plan
   - If the upgrade causes issues, revert to the previous plugin version by reinstalling the prior package version.


8. BLE encryption key and keyId fields

- The plugin now supports BLE encryption for devices that require it (e.g., SwitchBot Lock, Curtain 3, and some sensors).
- New config fields: `encryptionKey` and `keyId` can be set per-device in the Homebridge UI or config.json.
- To upgrade, obtain your device's BLE encryption key and keyId from the SwitchBot app (see README for instructions) and add them to your device config if required.
- Devices that do not require encryption can leave these fields blank.

---
 
7. Regenerating Matter ID maps

- A helper script `scripts/generate-matter-maps.js` is included to generate `src/matter-maps.generated.ts` from official zap/matter JSON metadata. The script expects a JSON input with a `clusters` array and will write mapped `MATTER_CLUSTER_IDS` and `MATTER_ATTRIBUTE_IDS` constants.
- Usage example:

```bash
node scripts/generate-matter-maps.js ./zap-matter.json
```

Place the official metadata JSON as `zap-matter.json` at the repo root (or pass a path) and commit the generated `src/matter-maps.generated.ts` to keep maps up to date.

These notes should be kept in sync with README and CHANGELOG updates for each release.
