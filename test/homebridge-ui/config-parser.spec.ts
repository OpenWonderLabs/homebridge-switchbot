import { describe, expect, it } from 'vitest'

import { isV4Config } from '../../src/homebridge-ui/utils/v4-detection.js'

describe('isV4Config', () => {
  it('returns false for null/undefined input', () => {
    expect(isV4Config(null)).toBe(false)
    expect(isV4Config(undefined)).toBe(false)
  })

  it('returns false for an empty v5 config block', () => {
    expect(isV4Config({ platform: 'SwitchBot', devices: [] })).toBe(false)
  })

  it('returns false for a v5 config with credentials omitted', () => {
    expect(isV4Config({ platform: 'SwitchBot', openApiToken: 'tok', openApiSecret: 'sec', devices: [] })).toBe(false)
  })

  it('returns true when a credentials sub-object is present (v4 token location)', () => {
    const v4 = {
      platform: 'SwitchBot',
      credentials: { token: 'tok', secret: 'sec', notice: 'Keep your token a secret!' },
      options: { devices: [] },
    }
    expect(isV4Config(v4)).toBe(true)
  })

  it('returns true when options.devices array is present without credentials (partial v4)', () => {
    const partialV4 = {
      platform: 'SwitchBot',
      options: {
        devices: [{ deviceId: 'aabbcc', configDeviceName: 'Curtain', configDeviceType: 'Curtain', connectionType: 'BLE' }],
      },
    }
    expect(isV4Config(partialV4)).toBe(true)
  })

  it('returns true for the exact config from the bug report', () => {
    const bugReportConfig = {
      name: 'SwitchBot',
      credentials: { notice: 'Keep your token a secret!' },
      options: {
        devices: [
          {
            deviceId: 'xxxxxxxx',
            configDeviceName: 'Curtain',
            configDeviceType: 'Curtain',
            connectionType: 'BLE',
            hide_lightsensor: false,
            set_min: 96,
            set_max: 12,
            maxRetry: 0,
            logging: 'standard',
          },
        ],
      },
      platform: 'SwitchBot',
    }
    expect(isV4Config(bugReportConfig)).toBe(true)
  })
})
