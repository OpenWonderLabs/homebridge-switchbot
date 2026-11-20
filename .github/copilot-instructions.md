# Homebridge SwitchBot Plugin Development Guide

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Topic-Based Reference Priority

When a prompt includes the topics below, consult these upstream references first before implementation decisions.

### Matter (keyword examples: "Matter", "child bridge", "cluster", "conformance")

Primary references:
- https://github.com/homebridge-plugins/homebridge-matter
- https://github.com/homebridge/homebridge/ - only if latest is 2.0.0 or later and contains Matter-related code or reference: 
   - https://github.com/homebridge/homebridge/tree/beta-2.0.0/
- https://github.com/matter-js/matter.js

Usage rule:
- For Matter behavior, conformance, clustering, or registration logic, align implementation with these references before applying local changes.

### SwitchBot BLE (keyword examples: "BLE", "Bluetooth", "RSSI", "advertisement", "scan")

Primary references:
- https://github.com/OpenWonderLabs/SwitchBotAPI-BLE
- https://github.com/sblibs/pySwitchbot

Usage rule:
- For BLE command/state/scan behavior, prefer these references for protocol expectations and payload shape.

### SwitchBot OpenAPI (keyword examples: "OpenAPI", "cloud API", "device list", "command")

Primary reference:
- https://github.com/OpenWonderLabs/SwitchBotAPI

Usage rule:
- For OpenAPI device models, commands, and response fields, prioritize this reference for compatibility.

### Conflict Resolution

If references conflict:
1. Prefer official upstream docs/API specs.
2. Keep existing plugin behavior unless a clear bug is identified.
3. Document any intentional deviation in PR notes.

## Branch Targeting

Branch from `latest` and open every pull request against `latest`. Do not create, target or push
to `beta-*` branches. Merging to `latest` publishes a stable release; if something needs fixing
afterwards, release a patch from `latest`.

The release type comes from the merged pull request's label: `patch` (bug fixes, docs, small
improvements), `minor` (new features or device types) or `major` (breaking changes). With no
label it defaults to a patch. If the right label is unclear, say so in the PR description.

## Following node-switchbot Changes

node-switchbot tracks [pySwitchbot](https://github.com/sblibs/pySwitchbot).

**Version updates come as pull requests.** `.github/workflows/node-switchbot-update.yml` checks
npm hourly. When node-switchbot publishes a newer release (patch, minor or major), it opens a pull
request to `latest`, from the `deps/node-switchbot` branch. The pull request:

- changes only the `node-switchbot` range in `package.json` and its `package-lock.json` entries,
  never the plugin's own `version` (the release workflow sets that when it publishes);
- is labelled `patch`, `minor` or `major` to match the node-switchbot change, which sets the kind
  of plugin release that merging it publishes;
- is updated if a newer node-switchbot comes out before it is merged, and closed if `latest`
  catches up some other way.

The maintainer reviews and merges it. Do not open separate pull requests that only bump
node-switchbot; Dependabot ignores it for the same reason. For a node-switchbot major (or any
release) that needs plugin changes, push them to the `deps/node-switchbot` branch or open a
follow-up pull request.

When node-switchbot ships something the plugin must change code to use, this repo needs a
follow-up PR:

1. Read the node-switchbot PR/release and list what consumers see: new device types, renamed or
   split model identities (`modelName`, OpenAPI `deviceType`), new status fields, new commands.
2. Update `src/device-types.ts` (`DEVICE_TYPES`, `DEVICE_TYPE_NORMALIZATION_MAP`, including
   lowercase product codes such as `woplugjp`), `DEVICE_CLASS_MAP` in `src/deviceFactory.ts`, and
   accessory behaviour in `src/devices/genericDevice.ts`.
3. Make sure no existing saved `configDeviceType` stops resolving (normalization map or
   `src/homebridge-ui/utils/device-migration.ts`).
4. The version bump itself comes from the `deps/node-switchbot` pull request. Bump
   `node-switchbot` in `package.json` yourself only if the plugin change must ship together with
   it, and only to a version already published on npm.
5. Add `createDevice` tests under `test/device/` asserting each affected type's accessory class.
6. Run build, test and lint; commit the regenerated `config.schema.json` if `DEVICE_TYPES` changed.

## Working Effectively

Node `^22 || ^24 || ^26`. Run these in order; each must pass before you commit:

```bash
npm ci            # CI uses: npm ci --legacy-peer-deps
npm run build     # syncs DEVICE_TYPES into config.schema.json, cleans dist/, tsc, copies + builds the plugin UI
npm run test      # vitest run
npm run lint      # eslint (src, test, UI html/js) then tsc --noEmit
```

- `npm run lint:fix` fixes most style issues.
- `npm run build` needs `rsync` (used by `plugin-ui`).
- `npm run docs` / `npm run docs:lint` generate and check TypeDoc output; `prepublishOnly` runs them.
- `npm run watch` builds, links the plugin and runs nodemon against a local Homebridge;
  `npm run watch:ui` also starts a dev Homebridge with Config UI X.

### Known pitfalls

- **Never commit compiled output under `src/`.** `.gitignore` excludes `src/**/*.js` and
  `src/**/*.js.map`. Vitest resolves `./foo.js` imports to a real `src/foo.js` before `src/foo.ts`,
  so a stale compiled copy silently replaces the source in tests.
- **`config.schema.json` is generated** from `DEVICE_TYPES` in `src/device-types.ts` during
  `npm run build`. When `DEVICE_TYPES` changes, commit the regenerated schema in the same change.
- **`DEVICE_CLASS_MAP` keys in `src/deviceFactory.ts` are lowercase.** Unmapped types fall back to
  `GenericDevice`, so add a test for every new type.

## Codebase Navigation

### Project Structure
```
├── src/
│   ├── index.ts                    # Plugin entry point (registers one platform that proxies HAP or Matter)
│   ├── SwitchBotHAPPlatform.ts     # HomeKit (HAP) platform
│   ├── SwitchBotMatterPlatform.ts  # Matter platform
│   ├── switchbotClient.ts          # Wrapper around node-switchbot (BLE + OpenAPI)
│   ├── deviceFactory.ts            # Device type -> accessory class (DEVICE_CLASS_MAP, createDevice)
│   ├── device-types.ts             # DEVICE_TYPES (valid types) + DEVICE_TYPE_NORMALIZATION_MAP (aliases)
│   ├── deviceCommandMapper.ts      # Per-type command handlers
│   ├── devices/
│   │   ├── deviceBase.ts           # Base accessory class
│   │   └── genericDevice.ts        # GenericDevice and every concrete accessory class
│   ├── homebridge-ui/              # Config UI X custom UI (server, endpoints, utils, public/)
│   ├── settings.ts                 # Config interfaces and constants
│   ├── errors.ts
│   └── utils.ts
├── test/                           # Vitest specs (client, device, platform, homebridge-ui, utils, e2e)
├── scripts/                        # sync-device-types, build-ui, free-dev-ports
├── config.schema.json              # Homebridge config schema (configDeviceType enum is generated)
└── dist/                           # Build output (not committed)
```

### Common Development Tasks

- **New device type or identity from node-switchbot:** add it to `DEVICE_TYPES` and/or
  `DEVICE_TYPE_NORMALIZATION_MAP` in `src/device-types.ts`, map it in `DEVICE_CLASS_MAP` in
  `src/deviceFactory.ts`, then add a `createDevice` test under `test/device/`.
- **New accessory behaviour:** add or extend a class in `src/devices/genericDevice.ts`.
- **Commands:** accessories send generic commands (`turnOn`, `setBrightness`, `setPosition`...).
  `src/deviceCommandMapper.ts` maps each to the node-switchbot method that performs it and uses it
  when the device has that method, so no per-type entry is needed. Convert units there (HomeKit
  sends mireds and `"hue,saturation"`; node-switchbot takes kelvin and RGB).
- **Saved configs that would stop resolving:** handle them in the normalization map or
  `src/homebridge-ui/utils/device-migration.ts`.
- **Config UI changes:** edit `src/homebridge-ui/`, then `npm run build`.
- **node-switchbot upgrades:** bump the dependency only to a version already published on npm.

### Device Connection Types
1. **OpenAPI:** SwitchBot Cloud token/secret; works through a SwitchBot Hub.
2. **BLE:** direct Bluetooth connection via node-switchbot (Linux/macOS).

## CI/CD Integration

- `.github/workflows/ci.yml`: build, test and lint on Node 22, 24 and 26 for pushes and PRs to
  `latest` (and `beta-*`, which is no longer used).
- `.github/workflows/release.yml`: pushes to `latest` publish a stable release. It still publishes a
  beta for pushes to `beta-*`, but those branches are no longer used. It can also be started by
  hand (`workflow_dispatch`).
- `.github/workflows/node-switchbot-update.yml`: hourly, opens or updates a pull request that moves
  node-switchbot to its newest release (see "Following node-switchbot Changes"), and starts
  `ci.yml` on it. Run it by hand from the Actions tab to check immediately.
