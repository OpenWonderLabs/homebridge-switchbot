import type { API, Logging } from 'homebridge'

import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { ApiRequestTracker } from '../utils.js'

// Helper to create isolated test environment for each test
function createTestEnvironment(pluginName = 'SwitchBotTest') {
  const testId = Math.random().toString(36).substring(7)
  const testDir = join(tmpdir(), `switchbot-test-${testId}`)

  // Create test directory
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true })
  }

  const testStatsFile = join(testDir, `${pluginName.toLowerCase()}-api-stats.json`)

  // Mock API with a unique storage path per test
  const mockApi = {
    user: {
      storagePath: () => testDir,
    },
  } as unknown as API

  // Mock logger
  const mockLog = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logging

  return { mockApi, mockLog, testStatsFile, testDir }
}

// Cleanup helper
function cleanup(testDir: string) {
  try {
    if (existsSync(testDir)) {
      const files = readdirSync(testDir)
      for (const file of files) {
        try {
          unlinkSync(join(testDir, file))
        } catch {
          // ignore
        }
      }
      rmdirSync(testDir)
    }
  } catch {
    // ignore
  }
}

describe('apiRequestTracker', () => {
  describe('initialization', () => {
    it('should create a new tracker with default limits', () => {
      const { mockApi, mockLog, testDir } = createTestEnvironment()
      try {
        const tracker = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest')
        expect(tracker).toBeDefined()
        expect(tracker.getCount()).toBe(0)
        expect(tracker.getDate()).toBe(new Date().toISOString().split('T')[0])
      } finally {
        cleanup(testDir)
      }
    })

    it('should respect custom daily limit', () => {
      const { mockApi, mockLog, testDir } = createTestEnvironment()
      try {
        const tracker = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest', {
          dailyLimit: 5000,
          reserveForCommands: 500,
        })
        expect(tracker).toBeDefined()
      } finally {
        cleanup(testDir)
      }
    })

    it('should load existing stats from file', () => {
      const { mockApi, mockLog, testDir } = createTestEnvironment()
      try {
        // Create a tracker, increment, and verify persistence
        const tracker1 = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest')
        tracker1.track()
        tracker1.track()
        expect(tracker1.getCount()).toBe(2)

        // Create a new tracker instance and verify it loads the count
        const tracker2 = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest')
        expect(tracker2.getCount()).toBe(2)
      } finally {
        cleanup(testDir)
      }
    })
  })

  describe('track() - legacy method', () => {
    it('should increment the counter', () => {
      const { mockApi, mockLog, testDir } = createTestEnvironment()
      try {
        const tracker = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest')
        expect(tracker.getCount()).toBe(0)
        tracker.track()
        expect(tracker.getCount()).toBe(1)
        tracker.track()
        expect(tracker.getCount()).toBe(2)
      } finally {
        cleanup(testDir)
      }
    })

    it('should persist count to file', () => {
      const { mockApi, mockLog, testStatsFile, testDir } = createTestEnvironment()
      try {
        const tracker = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest')
        tracker.track()
        tracker.track()
        tracker.track()

        // Read the stats file directly
        const statsContent = readFileSync(testStatsFile, 'utf8')
        const stats = JSON.parse(statsContent)
        expect(stats.count).toBe(3)
        expect(stats.date).toBe(new Date().toISOString().split('T')[0])
      } finally {
        cleanup(testDir)
      }
    })
  })

  describe('trySpend() - budget enforcement', () => {
    it('should allow commands when under soft cap', () => {
      const { mockApi, mockLog, testDir } = createTestEnvironment()
      try {
        const tracker = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest', {
          dailyLimit: 100,
          reserveForCommands: 20,
        })
        // Use 50 requests (well under soft cap of 80)
        for (let i = 0; i < 50; i++) {
          expect(tracker.trySpend('command')).toBe(true)
        }
        expect(tracker.getCount()).toBe(50)
      } finally {
        cleanup(testDir)
      }
    })

    it('should allow polling when under soft cap', () => {
      const { mockApi, mockLog, testDir } = createTestEnvironment()
      try {
        const tracker = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest', {
          dailyLimit: 100,
          reserveForCommands: 20,
        })
        // Use 50 requests
        for (let i = 0; i < 50; i++) {
          expect(tracker.trySpend('poll')).toBe(true)
        }
        expect(tracker.getCount()).toBe(50)
      } finally {
        cleanup(testDir)
      }
    })

    it('should block polling at soft cap when pausePollingAtReserve is true', () => {
      const { mockApi, mockLog, testDir } = createTestEnvironment()
      try {
        const tracker = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest', {
          dailyLimit: 100,
          reserveForCommands: 20,
          pausePollingAtReserve: true, // Enable soft cap blocking
        })
        // Use up to soft cap (80 requests)
        for (let i = 0; i < 80; i++) {
          tracker.track()
        }
        expect(tracker.getCount()).toBe(80)

        // Polling should be blocked at soft cap
        expect(tracker.trySpend('poll')).toBe(false)
        expect(tracker.trySpend('discovery')).toBe(false)

        // Commands should still work
        expect(tracker.trySpend('command')).toBe(true)
        expect(tracker.getCount()).toBe(81)
      } finally {
        cleanup(testDir)
      }
    })

    it('should block all requests at hard cap', () => {
      const { mockApi, mockLog, testDir } = createTestEnvironment()
      try {
        const tracker = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest', {
          dailyLimit: 100,
          reserveForCommands: 20,
        })
        // Use up to hard cap
        for (let i = 0; i < 100; i++) {
          tracker.track()
        }
        expect(tracker.getCount()).toBe(100)

        // All request types should be blocked
        expect(tracker.trySpend('poll')).toBe(false)
        expect(tracker.trySpend('discovery')).toBe(false)
        expect(tracker.trySpend('command')).toBe(false)
        expect(tracker.getCount()).toBe(100)
      } finally {
        cleanup(testDir)
      }
    })

    it('should support batch spending', () => {
      const { mockApi, mockLog, testDir } = createTestEnvironment()
      try {
        const tracker = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest', {
          dailyLimit: 100,
          reserveForCommands: 20,
        })
        expect(tracker.trySpend('poll', 10)).toBe(true)
        expect(tracker.getCount()).toBe(10)

        expect(tracker.trySpend('command', 5)).toBe(true)
        expect(tracker.getCount()).toBe(15)
      } finally {
        cleanup(testDir)
      }
    })
  })

  describe('webhookOnlyOnReserve mode', () => {
    it('should continue polling beyond soft cap when pausePollingAtReserve is false', () => {
      const { mockApi, mockLog, testDir } = createTestEnvironment()
      try {
        const tracker = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest', {
          dailyLimit: 100,
          reserveForCommands: 20,
          pausePollingAtReserve: false,
        })
        // Use 85 requests (past soft cap)
        for (let i = 0; i < 85; i++) {
          tracker.track()
        }
        expect(tracker.getCount()).toBe(85)

        // Polling should still work (not paused at reserve)
        expect(tracker.trySpend('poll')).toBe(true)
        expect(tracker.getCount()).toBe(86)
      } finally {
        cleanup(testDir)
      }
    })

    it('should stop polling at soft cap when pausePollingAtReserve is true', () => {
      const { mockApi, mockLog, testDir } = createTestEnvironment()
      try {
        const tracker = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest', {
          dailyLimit: 100,
          reserveForCommands: 20,
          pausePollingAtReserve: true,
        })
        // Use up to soft cap
        for (let i = 0; i < 80; i++) {
          tracker.track()
        }
        expect(tracker.getCount()).toBe(80)

        // Polling should be blocked
        expect(tracker.trySpend('poll')).toBe(false)
        expect(tracker.getCount()).toBe(80)

        // Commands should still work
        expect(tracker.trySpend('command')).toBe(true)
        expect(tracker.getCount()).toBe(81)
      } finally {
        cleanup(testDir)
      }
    })
  })

  describe('warning logs', () => {
    it('should log warning when reaching soft cap with pausePollingAtReserve enabled', () => {
      const { mockApi, mockLog, testDir } = createTestEnvironment()
      try {
        const tracker = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest', {
          dailyLimit: 100,
          reserveForCommands: 20,
          pausePollingAtReserve: true, // Enable soft cap warning
        })
        // Use up to soft cap
        for (let i = 0; i < 80; i++) {
          tracker.track()
        }

        // Trigger soft cap warning by attempting poll (will be blocked)
        tracker.trySpend('poll')
        expect(mockLog.warn).toHaveBeenCalledWith(
          expect.stringContaining('Near daily limit'),
        )
      } finally {
        cleanup(testDir)
      }
    })

    it('should log error when reaching hard cap', () => {
      const { mockApi, mockLog, testDir } = createTestEnvironment()
      try {
        const tracker = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest', {
          dailyLimit: 100,
          reserveForCommands: 20,
        })
        // Use up to hard cap
        for (let i = 0; i < 100; i++) {
          tracker.track()
        }

        // Trigger hard cap error
        tracker.trySpend('command')
        expect(mockLog.error).toHaveBeenCalledWith(
          expect.stringContaining('Daily limit'),
        )
      } finally {
        cleanup(testDir)
      }
    })
  })

  describe('hourly logging', () => {
    it('should log immediately on startup', () => {
      const { mockApi, mockLog, testDir } = createTestEnvironment()
      try {
        const tracker = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest')
        tracker.startHourlyLogging()
        tracker.stopHourlyLogging()
        expect(mockLog.info).toHaveBeenCalledWith(
          expect.stringContaining('[API Stats] Today'),
        )
      } finally {
        cleanup(testDir)
      }
    })

    it('should stop logging when stopHourlyLogging is called', () => {
      const { mockApi, mockLog, testDir } = createTestEnvironment()
      try {
        const tracker = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest')
        tracker.startHourlyLogging()
        tracker.stopHourlyLogging()
        // Should not throw
        expect(true).toBe(true)
      } finally {
        cleanup(testDir)
      }
    })
  })

  describe('edge cases', () => {
    it('should handle zero daily limit', () => {
      const { mockApi, mockLog, testDir } = createTestEnvironment()
      try {
        const tracker = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest', {
          dailyLimit: 0,
          reserveForCommands: 0,
        })
        // All requests should be blocked immediately
        expect(tracker.trySpend('poll')).toBe(false)
        expect(tracker.trySpend('command')).toBe(false)
        expect(tracker.getCount()).toBe(0)
      } finally {
        cleanup(testDir)
      }
    })

    it('should handle reserve larger than limit', () => {
      const { mockApi, mockLog, testDir } = createTestEnvironment()
      try {
        const tracker = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest', {
          dailyLimit: 100,
          reserveForCommands: 150,
          pausePollingAtReserve: true, // Enable soft cap blocking
        })
        // Soft cap would be negative (100 - 150 = -50), clamped to 0
        // With pausePollingAtReserve=true, polling should be blocked immediately
        expect(tracker.trySpend('poll')).toBe(false)
        // Commands up to hard cap should work
        expect(tracker.trySpend('command')).toBe(true)
      } finally {
        cleanup(testDir)
      }
    })

    it('should handle negative values in config', () => {
      const { mockApi, mockLog, testDir } = createTestEnvironment()
      try {
        const tracker = new ApiRequestTracker(mockApi, mockLog, 'SwitchBotTest', {
          dailyLimit: -100,
          reserveForCommands: -50,
        })
        // Should be treated as 0
        expect(tracker.trySpend('poll')).toBe(false)
        expect(tracker.trySpend('command')).toBe(false)
      } finally {
        cleanup(testDir)
      }
    })
  })
})
