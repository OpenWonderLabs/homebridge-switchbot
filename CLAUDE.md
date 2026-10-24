# homebridge-switchbot

Homebridge plugin that exposes SwitchBot devices to HomeKit and Matter. Device communication goes
through [node-switchbot](https://github.com/OpenWonderLabs/node-switchbot); this repo maps those
devices to accessories.

The project guide (reference priority, branch targeting, commands, structure, pitfalls) is shared
with Copilot and imported here:

@.github/copilot-instructions.md

## Following node-switchbot changes

node-switchbot tracks [pySwitchbot](https://github.com/sblibs/pySwitchbot). After node-switchbot
ships a change, this repo usually needs a follow-up PR so the plugin can use it:

1. Read the node-switchbot PR/release and list what consumers see: new device types, renamed or
   split model identities (`modelName`, OpenAPI `deviceType`), new status fields, new commands.
2. Update `src/device-types.ts` (`DEVICE_TYPES`, `DEVICE_TYPE_NORMALIZATION_MAP`, including
   lowercase product codes such as `woplugjp`), `DEVICE_CLASS_MAP` in `src/deviceFactory.ts`, and
   accessory behaviour in `src/devices/genericDevice.ts`.
3. Make sure no existing saved `configDeviceType` stops resolving (normalization map or
   `src/homebridge-ui/utils/device-migration.ts`).
4. Bump `node-switchbot` in `package.json` only to a version already published on npm.
5. Add `createDevice` tests under `test/device/` asserting each affected type's accessory class.
6. Run build, test and lint; commit the regenerated `config.schema.json` if `DEVICE_TYPES` changed.

## Commits and PRs

- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Target branch per the Branch Targeting Strategy in the guide. If the right target is unclear,
  ask before opening the PR.
- PR description: what changed, why (link the node-switchbot PR/release), and any config
  migration users need.
