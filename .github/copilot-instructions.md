# Matter and HomeKit Integration

## Matter Implementation
This plugin supports dual-mode device registration:
- **HAP mode** (HomeKit Accessory Protocol): Base implementation via `SwitchBotPlatform` class
- **Matter mode**: Extended via `SwitchBotMatterPlatform` class that overrides device registration and processing

When Homebridge's Matter API is available, `SwitchBotMatterPlatform` registers accessories with both HAP and Matter simultaneously. If the Matter API is not available, the plugin transparently falls back to HAP-only mode.

## Matter Device Type Mapping
All Matter device types use `api.matter.deviceTypes.*` objects from the homebridge-matter API. Device mapping aligns with the authoritative [homebridge-matter wiki](https://github.com/homebridge-plugins/homebridge-matter/wiki/Introduction) and Section 7 Sensors for sensor mapping.

| Device Type         | HAP Service                  | Matter DeviceType      | Matter Clusters         |
|---------------------|-----------------------------|-----------------------|-------------------------|
| Bot                 | Switch                      | `OnOffSwitch`         | onOff                  |
| Curtain             | WindowCovering              | `WindowCovering`      | windowCovering         |
| Contact Sensor      | ContactSensor               | `ContactSensor`       | contactSensor          |
| Motion Sensor       | MotionSensor                | `OccupancySensor`     | occupancySensing       |
| Meter/Hygrometer    | HumiditySensor, TemperatureSensor | `TemperatureSensor`, `HumiditySensor` | temperatureMeasurement, relativeHumidityMeasurement |
| Lock                | LockMechanism               | `DoorLock`            | doorLock               |
| Light/Fan/Outlet    | Lightbulb, Fan, Outlet      | `DimmableLight`, `OnOffLight`, `Fan` | onOff, levelControl   |
| IR Devices          | Various (see IR mapping)    | (varies)              | (varies)               |

## Authoritative Matter References

1. https://matter-js.github.io/docs/index.html
2. https://github.com/homebridge-plugins/homebridge-matter: Official Homebridge Matter plugin repository with extensive documentation and examples
    - For all Matter cluster, attribute, and device type specifications, use the official homebridge-matter wiki:
       - [Introduction](https://github.com/homebridge-plugins/homebridge-matter/wiki/Introduction)
       - [Core Concepts](https://github.com/homebridge-plugins/homebridge-matter/wiki/Core-Concepts)
       - [Getting Started](https://github.com/homebridge-plugins/homebridge-matter/wiki/Getting-Started)
       - [State Management](https://github.com/homebridge-plugins/homebridge-matter/wiki/State-Management)
       - [Monitoring External Changes](https://github.com/homebridge-plugins/homebridge-matter/wiki/Monitoring-External-Changes)
       - [Best Practices](https://github.com/homebridge-plugins/homebridge-matter/wiki/Best-Practices)
       - [Advanced Patterns](https://github.com/homebridge-plugins/homebridge-matter/wiki/Advanced-Patterns)
       - [API Reference](https://github.com/homebridge-plugins/homebridge-matter/wiki/API-Reference)
       - [Matter Types](https://github.com/homebridge-plugins/homebridge-matter/wiki/Matter-Types)
       - [Value Conversions](https://github.com/homebridge-plugins/homebridge-matter/wiki/Value-Conversions)
    - **Device References:**
       - [Lighting Devices (§4)](https://github.com/homebridge-plugins/homebridge-matter/wiki/Section-4-Lighting) — DimmableLight, OnOffLight
       - [Switches (§6)](https://github.com/homebridge-plugins/homebridge-matter/wiki/Section-6-Switches) — OnOffSwitch
       - [Sensors (§7)](https://github.com/homebridge-plugins/homebridge-matter/wiki/Section-7-Sensors) — OccupancySensor, ContactSensor
       - [Closure Devices (§8)](https://github.com/homebridge-plugins/homebridge-matter/wiki/Section-8-Closure) — WindowCovering

# Changelog Format Requirements

When generating a changelog release entry, always use this exact structure:

1. Release header with compare URL using `compare/tag/vX.Y.Z`:

```md
## [X.Y.Z](https://github.com/OpenWonderLabs/homebridge-switchbot/compare/tag/vX.Y.Z) (YYYY-MM-DD)
```

2. Standard sections as needed (`### Bug Fixes`, `### Enhancements`, `### Documentation`, etc.).

3. End each release entry with a full changelog comparison URL to the previous version:

```md
**Full Changelog**: https://github.com/OpenWonderLabs/homebridge-switchbot/compare/vX.Y.(Z-1)...vX.Y.Z
```

Do not omit either URL line when creating a new release entry.
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

## Working Effectively

### Bootstrap and Build Process
Run these commands in sequence to set up and build the project:

1. **Install dependencies:**
   ```bash
   npm install --legacy-peer-deps
   ```
   - CRITICAL: Must use `--legacy-peer-deps` flag due to TypeDoc dependency conflicts
   - Takes approximately 30-45 seconds
   - This is a known workaround documented in the codebase

2. **Build the project:**
   ```bash
   npm run build
   ```
   - Takes approximately 7-10 seconds
   - Compiles TypeScript and copies UI files
   - Output goes to `dist/` directory

3. **Run tests:**
   ```bash
   npm run test
   ```
   - Takes approximately 2-3 seconds  
   - Currently minimal test suite (1 test file)
   - Use `npm run test:watch` for continuous testing during development

4. **Generate documentation:**
   ```bash
   npm run docs
   ```
   - Takes approximately 5-10 seconds
   - Generates TypeDoc documentation in `docs/` directory

### Full Build and Validation Workflow
Complete validation workflow (approximately 30-45 seconds total):
```bash
npm install --legacy-peer-deps && npm run build && npm run test && npm run docs && npm run docs:lint && npm run docs:theme
```
- NEVER CANCEL: Set timeout to 90+ seconds for this complete workflow
- This validates TypeScript compilation, plugin loading, and documentation generation

### Development Commands

- **Watch mode for development:**
  ```bash
  npm run watch
  ```
  - Builds, links plugin locally, and starts nodemon for file watching
  - Requires local Homebridge installation

- **Clean build artifacts:**
  ```bash
  npm run clean
  ```
  - Removes `dist/` directory

- **Check for outdated dependencies:**
  ```bash
  npm run check
  ```
  - WARNING: This will fail due to dependency conflicts - use with `--legacy-peer-deps`

### Known Issues and Workarounds

- **Linting fails:** `npm run lint` and `npm run lint:fix` currently fail due to ESLint configuration conflicts with import/extensions rule. Document any code style issues manually.

- **Dependency conflicts:** Always use `--legacy-peer-deps` flag for npm install due to TypeDoc theme dependency version mismatches.

- **Coverage and docs artifacts:** Add `coverage/` and `docs/` to `.gitignore` to prevent committing build artifacts.

## Validation Scenarios

### Manual Plugin Validation
After making changes, ALWAYS run these validation steps:

1. **Verify plugin builds and loads:**
   ```bash
   npm run build && node -e "
   try {
     const plugin = require('./dist/index.js');
     console.log('Plugin loads successfully');
     console.log('Plugin type:', typeof plugin.default);
   } catch (e) {
     console.error('Plugin load failed:', e.message);
   }"
   ```

2. **Test plugin registration:**
   - Plugin exports a default function that registers with Homebridge
   - Uses `PLUGIN_NAME = '@switchbot/homebridge-switchbot'` and `PLATFORM_NAME = 'SwitchBot'`
   - Main platform class is `SwitchBotPlatform`

3. **Validate TypeScript compilation:**
   - Must have no TypeScript errors
   - Check `dist/` directory contains all expected `.js`, `.d.ts`, and `.map` files

4. **Test documentation generation:**
   ```bash
   npm run docs:lint
   ```
   - Must pass without warnings when using `--treatWarningsAsErrors`

### Code Coverage Validation
Run comprehensive test coverage analysis:
```bash
npm run test-coverage
```
- Current coverage is minimal (~1.36% overall)
- Coverage reports generated in `coverage/` directory

## Codebase Navigation

### Project Structure
```
├── src/                     # Source TypeScript files
│   ├── device/             # Device implementations (21 files)
│   │   ├── device.ts       # Base device class (deviceBase)
│   │   ├── bot.ts          # SwitchBot Bot device
│   │   ├── curtain.ts      # SwitchBot Curtain device
│   │   └── ...             # Other device implementations
│   ├── irdevice/           # IR device implementations (10 files)
│   │   ├── irdevice.ts     # Base IR device class
│   │   ├── tv.ts           # TV IR control
│   │   └── ...             # Other IR device implementations
│   ├── homebridge-ui/      # Plugin configuration UI
│   │   ├── server.ts       # UI backend server
│   │   └── public/         # UI frontend files
│   ├── platform.ts         # Main platform class (SwitchBotPlatform)
│   ├── settings.ts         # Configuration interfaces and constants
│   ├── utils.ts            # Utility functions
│   └── index.ts            # Plugin entry point
├── config.schema.json      # Homebridge configuration schema
├── dist/                   # Compiled JavaScript output
├── docs/                   # Generated TypeDoc documentation  
└── coverage/               # Test coverage reports
```

### Key Development Areas

- **Adding new devices:** Extend `src/device/device.ts` base class, implement in new file under `src/device/`
- **Adding IR devices:** Extend `src/irdevice/irdevice.ts` base class, implement in new file under `src/irdevice/`
- **Configuration changes:** Update `src/settings.ts` and `config.schema.json`
- **Platform modifications:** Edit `src/platform.ts` (main class with 2800+ lines)
- **Utility functions:** Modify `src/utils.ts` for shared functionality

### Device Connection Types
This plugin supports two connection methods to SwitchBot devices:
1. **OpenAPI Connection:** Requires SwitchBot Cloud API token/secret, works through SwitchBot Hub
2. **BLE (Bluetooth Low Energy):** Direct device connection, requires device MAC addresses

### Common Development Tasks

- **Testing device implementations:** Focus on `src/device/` and `src/irdevice/` directories
- **Configuration UI changes:** Modify `src/homebridge-ui/` files and rebuild with `npm run plugin-ui`
- **Platform logic changes:** Edit `src/platform.ts` - the main orchestration file
- **Adding device support:** Create new device class extending `deviceBase` or IR device class

### Important File Relationships
- Always update both device implementation AND platform.ts when adding new device types
- Configuration schema changes require updates to settings.ts interfaces
- Device MAC address validation is handled in utils.ts (`formatDeviceIdAsMac`)
- BLE connection handling is in the base device classes

## Build Time Expectations

- **npm install --legacy-peer-deps:** 30-45 seconds
- **npm run build:** 7-10 seconds  
- **npm run test:** 2-3 seconds
- **npm run docs:** 5-10 seconds
- **Complete validation workflow:** 30-45 seconds total
- **NEVER CANCEL:** Always wait for builds to complete, set timeouts to 90+ seconds for safety

## CI/CD Integration

The project uses GitHub Actions for CI:
- **Build workflow:** `.github/workflows/build.yml` runs Node.js build and test, then ESLint
- **Required checks:** Build must pass, tests must pass
- **Known CI issue:** ESLint currently fails due to configuration conflicts

Always run the complete validation workflow locally before committing:
```bash
npm run build && npm run test && npm run docs:lint
```

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