/* eslint-disable import/first */
import { describe, expect, it, vi } from 'vitest'
// Mock modules used by HAP device base occasionally via platform
vi.mock('fakegato-history', () => ({ default: () => ({}) }))
vi.mock('homebridge-lib/EveHomeKitTypes', () => ({ EveHomeKitTypes: class { constructor() {} } }))

import { deviceBase } from '../../devices-hap/device.js'

// Minimal HAP stub to satisfy deviceBase constructor operations
function makeHapStub() {
  class Service {
    private _chars: Record<string, any> = {}
    setCharacteristic(k: any, v: any) {
      this._chars[k] = v
      return this
    }

    getCharacteristic(k: any) {
      return {
        updateValue: (v: any) => {
          this._chars[k] = v
          return this
        },
      } as any
    }
  }
  const Characteristic: any = {
    Manufacturer: 'Manufacturer',
    AppMatchingIdentifier: 'AppMatchingIdentifier',
    Name: 'Name',
    ConfiguredName: 'ConfiguredName',
    Model: 'Model',
    ProductData: 'ProductData',
    SerialNumber: 'SerialNumber',
    HardwareRevision: 'HardwareRevision',
    SoftwareRevision: 'SoftwareRevision',
    FirmwareRevision: 'FirmwareRevision',
    On: 'On',
  }
  ;(Service as any).AccessoryInformation = class extends Service {}
  ;(Service as any).Outlet = class extends Service {}
  return { Service, Characteristic, Categories: { OUTLET: 7 } }
}

// Minimal PlatformAccessory stub
function makeAccessoryStub(hap: any, name = 'Test Accessory') {
  const services: any[] = []
  return {
    displayName: name,
    category: 0,
    context: {},
    getService(cls: any) {
      // find existing or create
      const svc = services.find(s => s instanceof cls)
      if (svc) {
        return svc
      }
      const s = new cls()
      services.push(s)
      return s
    },
    addService(cls: any) {
      const s = new cls()
      services.push(s)
      return s
    },
  }
}

// Minimal SwitchBotHAPPlatform-like stub with required surface
function makePlatformStub(options: any, hap: any) {
  const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn(), success: vi.fn() }
  return {
    api: { hap },
    log,
    config: { options, credentials: {} },
    debugMode: false,
    // logging helpers used by deviceBase
    infoLog: () => {},
    successLog: () => {},
    debugSuccessLog: () => {},
    warnLog: () => {},
    debugWarnLog: () => {},
    errorLog: () => {},
    debugErrorLog: () => {},
    debugLog: () => {},
    loggingIsDebug: async () => false,
    enablingPlatformLogging: async () => true,
    connectBLE: vi.fn(),
    bleEventHandler: {},
    webhookEventHandler: {},
  }
}

// Create a tiny concrete subclass to instantiate deviceBase
class TestHAPDevice extends deviceBase {
  // Override any methods that may be invoked by tests if needed
}

describe('hap device base webhook context', () => {
  it('sets accessory.context.webhook=true when global webhook is enabled and device.webhook is undefined', async () => {
    const hap = makeHapStub()
    const accessory: any = makeAccessoryStub(hap, 'Plug Device')
    const platform: any = makePlatformStub({ webhook: true, logging: 'debug' }, hap)

    const dev: any = {
      deviceId: 'DEV-HAP-1',
      deviceType: 'Plug',
      connectionType: 'OpenAPI',
      // webhook intentionally undefined
    }

    const d = new TestHAPDevice(platform, accessory, dev)
    // Assert context
    expect(accessory.context.webhook).toBe(true)
    // ensure no unused var warning
    expect(d).toBeDefined()
  })

  it('keeps accessory.context.webhook=false when device.webhook=false even if global is true', async () => {
    const hap = makeHapStub()
    const accessory: any = makeAccessoryStub(hap, 'Plug Device 2')
    const platform: any = makePlatformStub({ webhook: true, logging: 'debug' }, hap)

    const dev: any = {
      deviceId: 'DEV-HAP-2',
      deviceType: 'Plug',
      connectionType: 'OpenAPI',
      webhook: false,
    }

    const d = new TestHAPDevice(platform, accessory, dev)
    expect(accessory.context.webhook).toBe(false)
    expect(d).toBeDefined()
  })
})
