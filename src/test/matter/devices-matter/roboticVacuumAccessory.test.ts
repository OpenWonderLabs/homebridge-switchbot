import type { API, Logger } from 'homebridge'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the base accessory
vi.mock('../../../devices-matter/BaseMatterAccessory.js', () => ({
  BaseMatterAccessory: class {
    api: any
    log: any
    config: any
    context: any

    constructor(api: API, log: Logger, config: any) {
      this.api = api
      this.log = log
      this.config = config
      this.context = config.context
    }

    logInfo = vi.fn()
    logWarn = vi.fn()
    logError = vi.fn()
    sendOpenAPICommand = vi.fn(async () => {})
    updateState = vi.fn()
  },
}))

describe('roboticVacuumAccessory', () => {
  let mockAPI: any
  let mockLogger: Logger
  let RoboticVacuumAccessory: any

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks()

    // Mock API
    mockAPI = {
      matter: {
        uuid: {
          generate: vi.fn((serial: string) => `uuid-${serial}`),
        },
        deviceTypes: {
          RoboticVacuumCleaner: 'RoboticVacuumCleaner',
        },
      },
    }

    // Mock Logger
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any

    // Dynamically import the class after mocks are set up
    const module = await import('../../../devices-matter/RoboticVacuumAccessory.js')
    RoboticVacuumAccessory = module.RoboticVacuumAccessory
  })

  describe('model detection', () => {
    it('should detect S1 model from Robot Vacuum Cleaner S1', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner S1' },
      })
      expect((vacuum as any).capabilities.cleanAction).toBe('vacuum-only')
      expect((vacuum as any).capabilities.suctionKind).toBe('powLevel-0-3')
      expect((vacuum as any).capabilities.pause).toBe(false)
    })

    it('should detect S1 Plus model', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner S1 Plus' },
      })
      expect((vacuum as any).capabilities.cleanAction).toBe('vacuum-only')
      expect((vacuum as any).capabilities.pause).toBe(false)
    })

    it('should detect S1 Pro model', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner S1 Pro' },
      })
      expect((vacuum as any).capabilities.cleanAction).toBe('vacuum-only')
    })

    it('should detect S1 Mini model', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner S1 Mini' },
      })
      expect((vacuum as any).capabilities.cleanAction).toBe('vacuum-only')
    })

    it('should detect WoSweeper model', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'WoSweeper' },
      })
      expect((vacuum as any).capabilities.cleanAction).toBe('vacuum-only')
      expect((vacuum as any).capabilities.suctionKind).toBe('powLevel-0-3')
    })

    it('should detect WoSweeperMini model', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'WoSweeperMini' },
      })
      expect((vacuum as any).capabilities.cleanAction).toBe('vacuum-only')
    })

    it('should detect K10+ model', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'K10+' },
      })
      expect((vacuum as any).capabilities.cleanAction).toBe('vacuum-only')
      expect((vacuum as any).capabilities.pause).toBe(false)
    })

    it('should detect K10+ Pro model', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'K10+ Pro' },
      })
      expect((vacuum as any).capabilities.cleanAction).toBe('vacuum-only')
      expect((vacuum as any).capabilities.pause).toBe(false)
    })

    it('should detect K10+ Pro Combo model with mop capability', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner K10+ Pro Combo' },
      })
      expect((vacuum as any).capabilities.cleanAction).toBe('vacuum-or-mop')
      expect((vacuum as any).capabilities.suctionKind).toBe('fanLevel-1-4')
      expect((vacuum as any).capabilities.pause).toBe(true)
      expect((vacuum as any).capabilities.waterLevel).toBe(false)
    })

    it('should detect S10 model with vacuum+mop and advanced commands', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner S10' },
      })
      expect((vacuum as any).capabilities.cleanAction).toBe('vacuum-or-vacmop')
      expect((vacuum as any).capabilities.suctionKind).toBe('fanLevel-1-4')
      expect((vacuum as any).capabilities.pause).toBe(true)
      expect((vacuum as any).capabilities.waterLevel).toBe(true)
      expect((vacuum as any).capabilities.advancedCommands?.selfClean).toBe(true)
      expect((vacuum as any).capabilities.advancedCommands?.addWaterForHumi).toBe(true)
    })

    it('should detect S20 model with vacuum+mop and advanced commands', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner S20' },
      })
      expect((vacuum as any).capabilities.cleanAction).toBe('vacuum-or-vacmop')
      expect((vacuum as any).capabilities.advancedCommands?.selfClean).toBe(true)
    })

    it('should detect K11+ model', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner K11+' },
      })
      expect((vacuum as any).capabilities.cleanAction).toBe('vacuum-or-mop')
      expect((vacuum as any).capabilities.waterLevel).toBe(true)
      expect((vacuum as any).capabilities.advancedCommands?.setVolume).toBe(true)
      expect((vacuum as any).capabilities.advancedCommands?.selfClean).toBeUndefined()
    })

    it('should detect K20+ Pro model', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner K20 Plus Pro' },
      })
      expect((vacuum as any).capabilities.cleanAction).toBe('vacuum-or-mop')
      expect((vacuum as any).capabilities.pause).toBe(true)
    })

    it('should default to basic vacuum for unknown models', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Unknown Model' },
      })
      expect((vacuum as any).capabilities.cleanAction).toBe('vacuum-only')
      expect((vacuum as any).capabilities.pause).toBe(false)
      expect((vacuum as any).capabilities.suctionKind).toBe('powLevel-0-3')
    })

    it('should handle missing context', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {})
      expect((vacuum as any).capabilities.cleanAction).toBe('vacuum-only')
      expect((vacuum as any).capabilities.pause).toBe(false)
    })
  })

  describe('capability matrix', () => {
    it('should configure correct clusters for basic vacuum (S1)', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner S1' },
      })
      const clusters = (vacuum as any).config.clusters

      // Should have rvcRunMode with Idle and Cleaning only
      expect(clusters.rvcRunMode.supportedModes).toHaveLength(2)
      expect(clusters.rvcRunMode.supportedModes[0].label).toBe('Idle')
      expect(clusters.rvcRunMode.supportedModes[1].label).toBe('Cleaning')

      // Should have rvcCleanMode with suction levels
      expect(clusters.rvcCleanMode.supportedModes).toHaveLength(4)
      expect(clusters.rvcCleanMode.supportedModes.map((m: any) => m.label)).toEqual([
        'Quiet',
        'Standard',
        'Strong',
        'MAX',
      ])

      // Should not have serviceArea cluster
      expect(clusters.serviceArea).toBeUndefined()
    })

    it('should configure correct clusters for K10+ Pro Combo', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'K10+ Pro Combo' },
      })
      const clusters = (vacuum as any).config.clusters

      // Should have vacuum/mop action modes
      expect(clusters.rvcCleanMode.supportedModes).toHaveLength(2)
      expect(clusters.rvcCleanMode.supportedModes.map((m: any) => m.label)).toEqual(['Vacuum', 'Mop'])
    })

    it('should configure correct clusters for S10', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner S10' },
      })
      const clusters = (vacuum as any).config.clusters

      // Should have vacuum and vacuum+mop modes
      expect(clusters.rvcCleanMode.supportedModes).toHaveLength(2)
      expect(clusters.rvcCleanMode.supportedModes.map((m: any) => m.label)).toEqual(['Vacuum', 'Vacuum & Mop'])
    })

    it('should include pause handler for models that support it', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'K10+ Pro Combo' },
      })
      const handlers = (vacuum as any).config.handlers

      expect(handlers.rvcOperationalState.pause).toBeDefined()
      expect(handlers.rvcOperationalState.start).toBeDefined()
      expect(handlers.rvcOperationalState.stop).toBeDefined()
      expect(handlers.rvcOperationalState.goHome).toBeDefined()
    })

    it('should not include pause handler for basic models', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner S1' },
      })
      const handlers = (vacuum as any).config.handlers

      expect(handlers.rvcOperationalState.pause).toBeUndefined()
      expect(handlers.rvcOperationalState.start).toBeDefined()
    })
  })

  describe('openAPI command mapping', () => {
    it('should send start command for basic vacuum', async () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner S1' },
      })

      await (vacuum as any).handleStart()

      expect((vacuum as any).sendOpenAPICommand).toHaveBeenCalledWith('start')
    })

    it('should send stop command for basic vacuum', async () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'K10+' },
      })

      await (vacuum as any).handleStop()

      expect((vacuum as any).sendOpenAPICommand).toHaveBeenCalledWith('stop')
    })

    it('should send dock command on goHome', async () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner S1' },
      })

      await (vacuum as any).handleGoHome()

      expect((vacuum as any).sendOpenAPICommand).toHaveBeenCalledWith('dock')
    })

    it('should send PowLevel command for basic vacuum suction change', async () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'WoSweeper' },
      })

      await (vacuum as any).handleChangeCleanMode({ newMode: 2 }) // Strong

      expect((vacuum as any).sendOpenAPICommand).toHaveBeenCalledWith('PowLevel', '2')
    })

    it('should send startClean with action for K10+ Pro Combo', async () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'K10+ Pro Combo' },
      })

      // Set to vacuum mode first
      await (vacuum as any).handleChangeCleanMode({ newMode: 0 })
      expect((vacuum as any).currentCleanAction).toBe('vacuum')

      await (vacuum as any).handleStart()

      const expectedPayload = JSON.stringify({
        action: 'vacuum',
        param: { fanLevel: 2 },
      })
      expect((vacuum as any).sendOpenAPICommand).toHaveBeenCalledWith('startClean', expectedPayload)
    })

    it('should send startClean with sweep_mop action for S10 vacuum+mop mode', async () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner S10' },
      })

      // Set to vacuum+mop mode
      await (vacuum as any).handleChangeCleanMode({ newMode: 1 })
      expect((vacuum as any).currentCleanAction).toBe('vacuum_mop')

      await (vacuum as any).handleStart()

      const calls = (vacuum as any).sendOpenAPICommand.mock.calls
      const startCleanCall = calls.find((call: any) => call[0] === 'startClean')
      expect(startCleanCall).toBeDefined()

      const payload = JSON.parse(startCleanCall[1])
      expect(payload.action).toBe('sweep_mop')
      expect(payload.param.fanLevel).toBe(2)
      expect(payload.param.waterLevel).toBe(1)
    })

    it('should include waterLevel for S20 models', async () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner S20' },
      })

      await (vacuum as any).handleStart()

      const calls = (vacuum as any).sendOpenAPICommand.mock.calls
      const startCleanCall = calls.find((call: any) => call[0] === 'startClean')
      const payload = JSON.parse(startCleanCall[1])
      expect(payload.param.waterLevel).toBe(1)
    })

    it('should not include waterLevel for K10+ Pro Combo', async () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'K10+ Pro Combo' },
      })

      await (vacuum as any).handleStart()

      const calls = (vacuum as any).sendOpenAPICommand.mock.calls
      const startCleanCall = calls.find((call: any) => call[0] === 'startClean')
      const payload = JSON.parse(startCleanCall[1])
      expect(payload.param.waterLevel).toBeUndefined()
    })

    it('should send pause command for models that support it', async () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'S10' },
      })

      await (vacuum as any).handlePause()

      expect((vacuum as any).sendOpenAPICommand).toHaveBeenCalledWith('pause')
    })

    it('should update local action state for clean mode changes on K10+ Pro Combo', async () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'K10+ Pro Combo' },
      })

      // Change to mop mode
      await (vacuum as any).handleChangeCleanMode({ newMode: 1 })
      expect((vacuum as any).currentCleanAction).toBe('mop')

      // Change back to vacuum mode
      await (vacuum as any).handleChangeCleanMode({ newMode: 0 })
      expect((vacuum as any).currentCleanAction).toBe('vacuum')

      // Clean mode changes should just update state, not call OpenAPI
      expect((vacuum as any).sendOpenAPICommand).not.toHaveBeenCalled()
    })
  })

  describe('state updates', () => {
    it('should update run mode correctly', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner S1' },
      })

      vacuum.updateRunMode(1) // Cleaning

      expect((vacuum as any).updateState).toHaveBeenCalledWith('rvcRunMode', { currentMode: 1 })
    })

    it('should update clean mode correctly', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'K10+' },
      })

      vacuum.updateCleanMode(2) // Strong

      expect((vacuum as any).updateState).toHaveBeenCalledWith('rvcCleanMode', { currentMode: 2 })
    })

    it('should update operational state correctly', () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'S10' },
      })

      vacuum.updateOperationalState(64) // Seeking Charger

      expect((vacuum as any).updateState).toHaveBeenCalledWith('rvcOperationalState', { operationalState: 64 })
    })

    it('should update battery percentage without PowerSource cluster', async () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner S1' },
      })

      await vacuum.updateBatteryPercentage(75)

      // Should log but not update any cluster
      expect((vacuum as any).logInfo).toHaveBeenCalledWith(expect.stringContaining('75%'))
      expect((vacuum as any).context.batteryPercentage).toBe(75)
    })
  })

  describe('error handling', () => {
    it('should handle OpenAPI command failures gracefully', async () => {
      const vacuum = new RoboticVacuumAccessory(mockAPI, mockLogger, {
        context: { deviceType: 'Robot Vacuum Cleaner S1' },
      })

      // Mock failure
      ;(vacuum as any).sendOpenAPICommand = vi.fn(async () => {
        throw new Error('API Error')
      })

      await (vacuum as any).handleStart()

      expect((vacuum as any).logWarn).toHaveBeenCalledWith(expect.stringContaining('failed'))
    })
  })
})
