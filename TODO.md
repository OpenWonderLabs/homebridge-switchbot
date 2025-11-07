# SwitchBot Plugin TODO List

## Code Refactoring & Architecture

### Server-Side Refactoring (Priority: High)

- [x] **Split `server.ts` into modular structure** ✅ COMPLETED
  - [x] Created `src/homebridge-ui/endpoints/discovery.ts` - Discovery endpoint
  - [x] Created `src/homebridge-ui/endpoints/config.ts` - Config management endpoint
  - [x] Created `src/homebridge-ui/endpoints/devices.ts` - Device CRUD operations
  - [x] Created `src/homebridge-ui/endpoints/credentials.ts` - Credentials endpoint
  - [x] Created `src/homebridge-ui/utils/config-parser.ts` - Config parsing helpers
  - [x] Created `src/homebridge-ui/utils/logger.ts` - Logging utility
  - [x] Updated `src/homebridge-ui/server.ts` - Main entry point (imports and registers endpoints)

  **Status:** Server endpoints are fully modularized and organized by concern.

---

## Bug Fixes (Priority: Critical)

### Matter Window Covering Conformance Issue

- [ ] **Fix Matter window covering Drapery enum validation error**
  - [ ] **Issue:** Matter accessory registration fails for Curtain devices
  - [ ] **Error:** `Conformance "LF & !TL": Matter does not allow enum value Drapery (ID 4) here`
  - [ ] **Root Cause:** windowCovering.state.type is set to "Drapery" but Matter spec requires "LF & !TL" conformance (Lift Fail without Tilt)
  - [ ] **Solution:** Need to validate/correct window covering type mappings for Matter compatibility
  - [ ] **Affected Devices:** Curtain-type devices (e.g., "Master Bathroom Left Curtain")
  - [ ] **Steps to Fix:**
    - [ ] Check Matter window covering specification for valid type combinations
    - [ ] Update device type mapping to use compliant enum values
    - [ ] Validate conformance rules for Lift/Tilt combinations
    - [ ] Test with Curtain, Curtain3, and Roller Shade devices

---

### Invalid Device Type Validation ✅ COMPLETED

- [x] **Fix invalid device type in config schema validation**
  - [x] **Issue:** Config validation rejects devices with invalid `configDeviceType` values (e.g., "Lock Vision Pro" is not in valid enum)
  - [x] **Error:** "Value is not accepted. Valid values: ..." error shown in Homebridge UI
  - [x] **Root Cause:** Device types in existing configs may not match current DEVICE_TYPES enum (legacy names, typos, or renamed devices)
  - [x] **Affected Devices:** Any device with `configDeviceType` not matching DEVICE_TYPES enum
  - [x] **Solution:** Implemented device type validation migration and auto-correction

  **Implementation:**
  - Added `normalizeDeviceType()` — Validates and maps invalid types to valid equivalents
  - Added `isValidDeviceType()` — Checks if device type is in DEVICE_TYPES enum
  - Added `getValidDeviceTypes()` — Returns set of all valid device types
  - Created `src/homebridge-ui/utils/device-migration.ts` — Migration utilities for batch validation
  - Updated `src/homebridge-ui/endpoints/config.ts` — Device loading now validates types and warns about invalid ones
  - Added migration mapping: `"Lock Vision Pro"` → `"Keypad Vision Pro"` (and others)
  - Config endpoint returns `validationWarnings` with invalid device types and suggestions

  **Status:** Device type validation is now automatic. Invalid types are detected and suggestions provided to users. Auto-correction mappings handle legacy/typo device names.

---

### Client-Side Refactoring (Priority: Medium)

#### Phase 1: Quick Wins

- [x] **Extract DEVICE_TYPES constant** (~100 lines) ✅ COMPLETED
  - [x] Created `src/device-types.ts` as single source of truth
  - [x] Updated `src/homebridge-ui/public/js/constants.ts` to import from shared source
  - [x] Added `DEVICE_TYPE_NORMALIZATION_MAP` for plugin type lookups
  - [x] Updated `src/deviceFactory.ts` to use normalized type mappings
  - [x] Created `scripts/sync-device-types.mjs` to auto-sync config.schema.json
  - [x] Integrated sync into build process (runs before tsc)

  **Status:** Device types now single-sourced with auto-sync. Config schema, UI dropdown, and plugin type handling all stay aligned automatically.



# SwitchBot Plugin TODO List (2026)

---

## PRIORITY: HIGH (Start Here)

- [ ] **One-Click Device Import**  
    Add "Add to Config" button next to each discovered device. Dramatically speeds up onboarding, reduces manual steps for users.
- [ ] **Auto-populate Device Config Modal**  
    When importing, auto-fill the config modal with discovered values. Reduces user error, makes adding devices nearly frictionless.
- [ ] **Pre-fill MAC Address for BLE Devices**  
    Ensure BLE devices are always added with correct MAC, avoids connection issues.
- [ ] **Duplicate Detection**  
    Check if discovered device ID already exists in config. Prevents duplicate entries, avoids user confusion.

---

## PRIORITY: MEDIUM

- [ ] **Confirmation Toast on Import**  
    Show a toast message on successful import for user feedback.
- [ ] **Loading States for Discovery**  
    Show progress indicator, spinner, and allow cancel during discovery. Improves perceived performance and transparency.
- [ ] **Device Grouping**  
    Group devices by hub or connection type. Useful for users with many devices/hubs.
- [ ] **Connection Recommendations**  
    Show badges for recommended connection (BLE/API) based on signal/device type.

---

## PRIORITY: LOW

- [ ] **UI Polish: Badges, View in Config, Group Headers**  
    Add badges for "Already Added"/"New Device", view-in-config links, expandable group headers, device count per group, and remember expanded/collapsed state.
- [ ] **Configurable BLE Scan**  
    Add scan duration, BLE timeout, and Bluetooth availability status in settings. Remember user preferences in localStorage.
- [ ] **Discovery History/Cache**  
    Cache last discovery results, show last scanned timestamp, refresh button, and auto-refresh option.

---

**Recommendation:**

Start with the HIGH priority section—these features have the biggest impact on user experience and onboarding. MEDIUM priority items improve polish and usability for power users. LOW priority items are mostly UI/UX enhancements and advanced options.

- [ ] **Build & Test**
  - [ ] Run `npm run build`
  - [ ] Test add device modal
  - [ ] Test edit device modal
  - [ ] Test delete confirmation modal
  - [ ] Verify form validation works

### Step 6: Extract Form Handling

**Goal:** Move form validation and submission logic

- [ ] **Create forms module**
  - [ ] Create `src/homebridge-ui/public/js/forms.js`
  - [ ] Extract and export these functions:
    - [ ] `validateDeviceForm(formData)` - Validate form inputs
    - [ ] `handleDeviceSubmit(formData)` - Process form submission
    - [ ] `resetForm()` - Clear form fields
    - [ ] `formatFormData(rawData)` - Format form data for API
    - [ ] `showFormError(field, message)` - Display validation error
    - [ ] `clearFormErrors()` - Clear all validation errors

- [ ] **Update HTML**
  - [ ] Remove form handling functions from `<script>` block
  - [ ] Add import: `import * as forms from './js/forms.js'`
  - [ ] Update event handlers to use imported functions
  - [ ] Test form validation and submission

- [ ] **Build & Test**
  - [ ] Run `npm run build`
  - [ ] Test form validation (empty fields, invalid data)
  - [ ] Test form submission (add/edit device)
  - [ ] Verify error messages display correctly

### Step 7: Create Main App Module

**Goal:** Create central app initialization and coordination

- [ ] **Create app module**
  - [ ] Create `src/homebridge-ui/public/js/app.ts`
  - [ ] Export `init()` function that:
    - [ ] Loads initial config on page load
    - [ ] Sets up all event listeners
    - [ ] Initializes UI components
    - [ ] Handles global state
  - [ ] Move event listeners from HTML to app.js
  - [ ] Coordinate between all other modules

- [ ] **Update HTML**
  - [ ] Remove all remaining JavaScript from `<script>` block
  - [ ] Keep only imports and single line: `import { init } from './js/app.js'; init();`
  - [ ] Or use DOMContentLoaded: `document.addEventListener('DOMContentLoaded', () => init())`
  - [ ] Remove now-empty `<script>` block if all code moved

- [ ] **Build & Test**
  - [ ] Run `npm run build`
  - [ ] Test complete page load and initialization
  - [ ] Test all features end-to-end
  - [ ] Verify no console errors

### Step 8: Final Cleanup and Verification

**Goal:** Ensure everything works and clean up

- [ ] **Verify build output**
  - [ ] Check all files copied to `dist/homebridge-ui/public/`
  - [ ] Verify file structure matches source
  - [ ] Check file sizes (modules should be reasonable)

- [ ] **Test all functionality**
  - [ ] Load config on page open
  - [ ] Add new device
  - [ ] Edit existing device
  - [ ] Delete device
  - [ ] Run discovery
  - [ ] Test all filters/sorting (if implemented)
  - [ ] Test on different browsers (Chrome, Safari, Firefox)

- [ ] **Code cleanup**
  - [ ] Remove any unused functions
  - [ ] Add JSDoc comments to all exports
  - [ ] Ensure consistent code style
  - [ ] Remove console.log statements (or convert to proper logging)

- [ ] **Documentation**
  - [ ] Update comments in code
  - [ ] Document module dependencies
  - [ ] Add README in `src/homebridge-ui/public/js/` if needed
  - [ ] Update main README if UI architecture changed significantly

### Step 9: Optional Enhancements

**Goal:** Further improvements after basic split

- [ ] **Add TypeScript for UI code**
  - [ ] Rename `.js` files to `.ts`
  - [ ] Add type definitions
  - [ ] Update build to compile UI TypeScript
  - [ ] Add type checking to lint scripts

- [ ] **Add minification**
  - [ ] Consider adding Terser for JS minification
  - [ ] Consider adding cssnano for CSS minification
  - [ ] Update build script for production builds

- [ ] **Add source maps**
  - [ ] Generate source maps for easier debugging
  - [ ] Configure build to include maps
  - [ ] Test debugging in browser DevTools

---

## Implementation Notes

### Why Native ES6 Modules?

- ✅ No bundler needed (simpler build process)
- ✅ Native browser support (Safari 11+, Chrome 61+, Firefox 60+)
- ✅ Easier debugging (direct source code visibility)
- ✅ Suitable for local Homebridge UI (no network latency concerns)
- ✅ Hot reload friendly (just refresh browser)

### Browser Compatibility

- ES6 modules work in all modern browsers (2017+)
- Homebridge UI runs locally, so old browser support not critical
- Most Homebridge users have up-to-date browsers

### Build Process

- Current: `npm run plugin-ui` copies `src/homebridge-ui/public` → `dist/homebridge-ui/public`
- After split: Same command, just copies more files (no changes needed)
- Glob pattern `**/*` already handles subdirectories

### Testing Checklist

Each step should be tested before moving to next:

1. Build succeeds without errors
2. Files copied to dist/ correctly
3. UI loads in browser without errors
4. All functionality works as before
5. No console errors or warnings
6. Performance is same or better
