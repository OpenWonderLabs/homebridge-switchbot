# Homebridge SwitchBot Plugin Development Guide

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

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