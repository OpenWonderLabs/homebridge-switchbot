/**
 * Detect whether a platform config block is in the legacy v4 format.
 *
 * v4 configs stored credentials under a `credentials` sub-object and devices
 * under `options.devices`.  v5+ flattened these to `openApiToken`,
 * `openApiSecret`, and a root-level `devices` array.
 *
 * This helper has no Node.js-specific dependencies so it can be imported from
 * both the Homebridge server-side code and the browser-side plugin UI bundle.
 */
export function isV4Config(platform: any): boolean {
  if (!platform || typeof platform !== 'object') {
    return false
  }
  // Presence of a `credentials` sub-object is the clearest v4 signal
  const hasCredentials = platform.credentials !== undefined && typeof platform.credentials === 'object'
  // Presence of `options.devices` is the other v4 signal
  const hasOptionsDevices
    = platform.options !== undefined
    && typeof platform.options === 'object'
    && Array.isArray(platform.options.devices)
  return hasCredentials || hasOptionsDevices
}
