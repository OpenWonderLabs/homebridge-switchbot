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

## Branch Targeting Strategy

When creating pull requests, ALWAYS follow this branch targeting strategy:

1. **Primary Target:** Look for branches that start with "beta-" (e.g., `beta-4.3.2`, `beta-4.4.0`)
   - If a beta branch exists, target the most recent beta branch for your PR
   - Beta branches are used for testing and staging changes before they go to the main branch

2. **Beta Branch Creation:** If no beta branches exist, create one based on the next possible version
   - Parse the current version from `package.json` (e.g., "4.3.1")
   - Determine version increment type using issue/PR labels (patch/minor/major)
   - Calculate the appropriate next version based on detected labels
   - Create a new beta branch with the format `beta-X.Y.Z` (e.g., `beta-4.3.2`)
   - Base the new beta branch on the `latest` branch
   - Push the new beta branch to origin and target it for the PR

3. **Fallback Target:** Only if beta branch creation fails, target the `latest` branch
   - The `latest` branch is the main development branch when no beta releases are in progress

4. **Branch Detection and Creation:** Use these methods to check and create branches:
   - **Detection:** GitHub API: Use `github-mcp-server-list_branches` to get all branches and filter for "beta-" prefix
   - **Detection:** Git command: `git ls-remote --heads origin | grep beta | sort -V | tail -1` to find the latest beta branch
   - **Version parsing:** Extract version from package.json: `node -p "require('./package.json').version"`
   - **Label Detection:** Check for version increment labels on the issue/PR:
     - Use GitHub API to get issue/PR labels
     - Look for labels: `patch`, `minor`, `major`
     - These labels should be set before assigning the issue to Copilot
   - **Version Increment Logic:** Choose increment type based on detected labels:
     - **patch label found:** `node -p "const v=require('./package.json').version.split('.'); v[2]=parseInt(v[2])+1; v.join('.')"` (4.3.1 → 4.3.2)
     - **minor label found:** `node -p "const v=require('./package.json').version.split('.'); v[1]=parseInt(v[1])+1; v[2]='0'; v.join('.')"` (4.3.1 → 4.4.0)
     - **major label found:** `node -p "const v=require('./package.json').version.split('.'); v[0]=parseInt(v[0])+1; v[1]='0'; v[2]='0'; v.join('.')"` (4.3.1 → 5.0.0)
     - **No relevant labels:** Default to patch increment as fallback
     - **Multiple increment labels:** Use highest priority (major > minor > patch)
   - **Label-Based Beta Branch Creation:**
     ```bash
     # Detect version increment type from issue/PR labels
     # Use GitHub API: github-mcp-server-get_issue or github-mcp-server-get_pull_request
     # Check labels array for: patch, minor, major
     
     # Calculate next version based on detected labels
     if [[ labels contains "major" ]]; then
       NEXT_VERSION=$(node -p "const v=require('./package.json').version.split('.'); v[0]=parseInt(v[0])+1; v[1]='0'; v[2]='0'; v.join('.')")
     elif [[ labels contains "minor" ]]; then
       NEXT_VERSION=$(node -p "const v=require('./package.json').version.split('.'); v[1]=parseInt(v[1])+1; v[2]='0'; v.join('.')")
     else
       # Default to patch increment (includes when "patch" label found or no labels)
       NEXT_VERSION=$(node -p "const v=require('./package.json').version.split('.'); v[2]=parseInt(v[2])+1; v.join('.')")
     fi
     
     BETA_BRANCH="beta-${NEXT_VERSION}"
     
     # Create and push the beta branch from latest
     git fetch origin
     git checkout -b "${BETA_BRANCH}" origin/latest
     git push origin "${BETA_BRANCH}"
     ```
   - Always verify the target branch exists before creating the PR

**NEVER target other branches** unless specifically instructed, and avoid targeting:
- Individual feature branches (copilot/*, fix/*, etc.)
- Release branches that are not beta branches
- The main branch directly

This ensures proper workflow where changes are tested in beta branches before being merged to the main development line.

### Branch Targeting Validation and Troubleshooting

**Before Starting Work:**
1. **Verify Issue Labels:** Check that the assigned issue has appropriate version increment labels (`patch`, `minor`, or `major`)
2. **Check Existing Beta Branches:** Use GitHub API or Git commands to identify current beta branches
3. **Validate Target Branch:** Confirm the target beta branch exists or can be created successfully

**Validation Commands:**
```bash
# Check for existing beta branches
git ls-remote --heads origin | grep "beta-" | sort -V

# Get current version for reference
node -p "require('./package.json').version"

# Example: Calculate next patch version
node -p "const v=require('./package.json').version.split('.'); v[2]=parseInt(v[2])+1; v.join('.')"
```

**Troubleshooting Common Issues:**
- **No version labels on issue:** Proceed with patch increment but notify in PR description
- **Beta branch creation fails:** Fall back to targeting `latest` branch and document in PR
- **Multiple conflicting labels:** Use highest priority (major > minor > patch) and document decision
- **Network/API failures:** Use Git commands as fallback for branch detection

### Label Requirements for Version Management

**⚠️ CRITICAL REQUIREMENT:** Before assigning issues to Copilot, project maintainers **MUST** set appropriate version increment labels. This is required for proper branch targeting and version management.

**Required Labels:**
- **`patch`** - Bug fixes, documentation updates, minor improvements (4.3.1 → 4.3.2)
- **`minor`** - New features, device support additions, non-breaking enhancements (4.3.1 → 4.4.0)  
- **`major`** - Breaking changes, API modifications, major architectural updates (4.3.1 → 5.0.0)

**Label Priority:** If multiple increment labels are present, the highest priority is used (major > minor > patch).

**Fallback Behavior:** If no version increment labels are found, the system defaults to patch increment to ensure conservative version management.

**Validation Process:** Copilot will:
1. Check for required labels on the assigned issue
2. Log a warning if no version increment labels are found
3. Proceed with patch increment as fallback
4. Create or target the appropriate beta branch based on version increment

## Following node-switchbot Changes

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

## Working Effectively

Node `^22 || ^24`. Run these in order; each must pass before you commit:

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
- **Saved configs that would stop resolving:** handle them in the normalization map or
  `src/homebridge-ui/utils/device-migration.ts`.
- **Config UI changes:** edit `src/homebridge-ui/`, then `npm run build`.
- **node-switchbot upgrades:** bump the dependency only to a version already published on npm.

### Device Connection Types
1. **OpenAPI:** SwitchBot Cloud token/secret; works through a SwitchBot Hub.
2. **BLE:** direct Bluetooth connection via node-switchbot (Linux/macOS).

## CI/CD Integration

- `.github/workflows/ci.yml`: build, test and lint on Node 22 and 24 for pushes to `latest`/`beta-*`
  and PRs to `latest`/`beta-*`.
- `.github/workflows/release.yml`: pushes to `beta-*` publish a beta to npm; pushes to `latest`
  publish a stable release.

## Complete Workflow Examples

### Example 1: Issue with Proper Labels
**Scenario:** Issue #1234 assigned to Copilot with `minor` label

**Workflow:**
1. **Label Detection:** Copilot detects `minor` label → target version 4.4.0
2. **Branch Check:** Look for existing beta branches: `git ls-remote --heads origin | grep beta-`
3. **Beta Branch Creation:** No beta-4.4.0 exists → create from latest branch
4. **PR Targeting:** Target the new beta-4.4.0 branch
5. **Development:** Make changes, test, commit to beta branch

### Example 2: Issue without Version Labels
**Scenario:** Issue #1276 assigned to Copilot with no version increment labels

**Workflow:**
1. **Label Detection:** No version labels found → default to patch increment
2. **Version Calculation:** Current 4.3.1 → next patch 4.3.2
3. **Branch Check:** beta-4.3.2 already exists → target existing branch
4. **Development:** Make changes, document label requirement in PR description

### Example 3: Multiple Version Labels
**Scenario:** Issue assigned with both `minor` and `patch` labels

**Workflow:**
1. **Label Priority:** minor (higher priority) overrides patch
2. **Version Target:** Calculate minor increment instead of patch
3. **Documentation:** Note in PR description why minor was chosen over patch