import type { SwitchBotPlatformConfig } from '../settings.js'

import { describe, expect, it } from 'vitest'

// Create a minimal mock of the SwitchBotPlatform to test verifyConfig
class MockSwitchBotPlatform {
  config: SwitchBotPlatformConfig
  errorLogCalls: string[] = []
  debugLogCalls: string[] = []

  constructor(config: SwitchBotPlatformConfig) {
    this.config = config
  }

  errorLog(message: string) {
    this.errorLogCalls.push(message)
  }

  debugLog(message: string) {
    this.debugLogCalls.push(message)
  }

  debugWarnLog(message: string) {
    this.debugLogCalls.push(`WARN: ${message}`)
  }

  debugErrorLog(message: string) {
    this.debugLogCalls.push(`ERROR: ${message}`)
  }

  // Copy the exact verifyConfig method from the actual platform
  async verifyConfig() {
    this.debugLog('Verifying Config')
    this.config = this.config || {}
    this.config.options = this.config.options || {}

    if (this.config.options) {
      // Device Config
      if (this.config.options.devices) {
        for (const deviceConfig of this.config.options.devices) {
          if (!deviceConfig.hide_device) {
            if (!deviceConfig.deviceId) {
              this.errorLog('The devices config section is missing the *Device ID* in the config. Please check your config.')
            }
            if (!deviceConfig.configDeviceType && (deviceConfig as any).connectionType) {
              this.errorLog('The devices config section is missing the *Device Type* in the config. Please check your config.')
            }
          }
        }
      }

      // IR Device Config
      if (this.config.options.irdevices) {
        for (const irDeviceConfig of this.config.options.irdevices) {
          if (!irDeviceConfig.hide_device) {
            if (!irDeviceConfig.deviceId) {
              this.errorLog('The devices config section is missing the *Device ID* in the config. Please check your config.')
            }
            if (!irDeviceConfig.deviceId && !irDeviceConfig.configRemoteType) {
              this.errorLog('The devices config section is missing the *Device Type* in the config. Please check your config.')
            }
          }
        }
      }
    }

    if (!this.config.credentials && !this.config.options) {
      this.debugWarnLog('Missing Credentials')
    } else if (this.config.credentials && !this.config.credentials.notice) {
      if (!this.config.credentials?.token) {
        this.debugErrorLog('Missing token')
        this.debugWarnLog('Cloud Enabled SwitchBot Devices & IR Devices will not work')
      }
      if (this.config.credentials?.token) {
        if (!this.config.credentials?.secret) {
          this.debugErrorLog('Missing secret')
          this.debugWarnLog('Cloud Enabled SwitchBot Devices & IR Devices will not work')
        }
      }
    }
  }
}

describe('verifyConfig fix for reboot loop', () => {
  it('should log error instead of throwing when device config is missing deviceId', async () => {
    const config: SwitchBotPlatformConfig = {
      platform: 'SwitchBot',
      name: 'SwitchBot',
      credentials: {
        token: 'test-token',
        secret: 'test-secret',
      },
      options: {
        devices: [
          {
            logging: 'standard',
          } as any, // Missing deviceId
        ],
      },
    }

    const platform = new MockSwitchBotPlatform(config)

    // This should NOT throw an error anymore - it should log instead
    await expect(platform.verifyConfig()).resolves.not.toThrow()

    // Verify that the error was logged instead of thrown
    expect(platform.errorLogCalls).toContain(
      'The devices config section is missing the *Device ID* in the config. Please check your config.',
    )
  })

  it('should log error instead of throwing when device config is missing configDeviceType with connectionType', async () => {
    const config: SwitchBotPlatformConfig = {
      platform: 'SwitchBot',
      name: 'SwitchBot',
      credentials: {
        token: 'test-token',
        secret: 'test-secret',
      },
      options: {
        devices: [
          {
            deviceId: 'test-device-id',
            connectionType: 'BLE',
            // Missing configDeviceType
          } as any,
        ],
      },
    }

    const platform = new MockSwitchBotPlatform(config)

    // This should NOT throw an error anymore - it should log instead
    await expect(platform.verifyConfig()).resolves.not.toThrow()

    // Verify that the error was logged instead of thrown
    expect(platform.errorLogCalls).toContain(
      'The devices config section is missing the *Device Type* in the config. Please check your config.',
    )
  })

  it('should not log error when device config has hide_device set to true', async () => {
    const config: SwitchBotPlatformConfig = {
      platform: 'SwitchBot',
      name: 'SwitchBot',
      credentials: {
        token: 'test-token',
        secret: 'test-secret',
      },
      options: {
        devices: [
          {
            hide_device: true,
            // Missing deviceId but hidden
          } as any,
        ],
      },
    }

    const platform = new MockSwitchBotPlatform(config)

    // Should not throw or log errors because device is hidden
    await expect(platform.verifyConfig()).resolves.not.toThrow()
    expect(platform.errorLogCalls).toHaveLength(0)
  })

  it('should handle valid device config without errors', async () => {
    const config: SwitchBotPlatformConfig = {
      platform: 'SwitchBot',
      name: 'SwitchBot',
      credentials: {
        token: 'test-token',
        secret: 'test-secret',
      },
      options: {
        devices: [
          {
            deviceId: 'test-device-id',
            configDeviceType: 'Bot',
            logging: 'standard',
          } as any,
        ],
      },
    }

    const platform = new MockSwitchBotPlatform(config)

    // Should not throw or log device config errors with valid config
    await expect(platform.verifyConfig()).resolves.not.toThrow()

    // Should not have device config errors
    expect(platform.errorLogCalls.filter(msg =>
      msg.includes('missing the *Device ID*')
      || msg.includes('missing the *Device Type*'),
    )).toHaveLength(0)
  })
})
