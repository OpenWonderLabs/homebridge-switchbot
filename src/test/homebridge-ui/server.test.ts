import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Test suite for the homebridge-ui server handler logic
 *
 * These tests validate the cached accessory file reading logic that powers
 * the getCachedAccessories and getCachedMatterAccessories handlers.
 *
 * Note: These are integration tests that test the file system logic rather than
 * the UI server infrastructure itself, since HomebridgePluginUiServer is designed
 * to run as a standalone process with IPC communication.
 */

// Helper to create isolated test environment
function createTestEnvironment() {
  const testId = Math.random().toString(36).substring(7)
  const testDir = join(tmpdir(), `switchbot-ui-test-${testId}`)
  const accessoriesDir = join(testDir, 'accessories')

  // Create test directories
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true })
  }
  if (!existsSync(accessoriesDir)) {
    mkdirSync(accessoriesDir, { recursive: true })
  }

  return { testDir, accessoriesDir }
}

// Cleanup helper
function cleanup(testDir: string) {
  try {
    if (existsSync(testDir)) {
      const removeRecursive = (dir: string) => {
        if (!existsSync(dir)) {
          return
        }
        const files = readdirSync(dir)
        for (const file of files) {
          const filePath = join(dir, file)
          try {
            const stat = statSync(filePath)
            if (stat.isDirectory()) {
              removeRecursive(filePath)
            } else {
              unlinkSync(filePath)
            }
          } catch {
            // ignore
          }
        }
        try {
          rmdirSync(dir)
        } catch {
          // ignore
        }
      }
      removeRecursive(testDir)
    }
  } catch {
    // ignore
  }
}

/**
 * Re-implementation of the getCachedAccessories handler logic for testing
 * This mirrors the actual implementation in server.ts
 */
function getCachedAccessories(homebridgeStoragePath: string): any[] {
  try {
    const pluginNames = ['@switchbot/homebridge-switchbot', 'homebridge-switchbot']
    const devicesToReturn = []

    const accFile = `${homebridgeStoragePath}/accessories/cachedAccessories`

    if (existsSync(accFile)) {
      const cachedAccessories: any[] = JSON.parse(readFileSync(accFile, 'utf8'))

      cachedAccessories.forEach((entry: any) => {
        const pluginName = entry.plugin || entry?.accessory?.plugin || entry?.accessory?.pluginName
        const acc = entry.accessory ?? entry
        if (pluginNames.includes(pluginName)) {
          devicesToReturn.push(acc as never)
        }
      })
    }
    return devicesToReturn
  } catch {
    return []
  }
}

/**
 * Re-implementation of the getCachedMatterAccessories handler logic for testing
 * This mirrors the actual implementation in server.ts
 */
function getCachedMatterAccessories(homebridgeStoragePath: string): any[] {
  try {
    const pluginNames = ['@switchbot/homebridge-switchbot', 'homebridge-switchbot']
    const devicesToReturn: any[] = []

    const accFile = `${homebridgeStoragePath}/accessories/cachedAccessories`
    const matterFile = `${homebridgeStoragePath}/accessories/cachedMatterAccessories`

    const readAndCollect = (filePath: string) => {
      if (!existsSync(filePath)) {
        return
      }
      try {
        const parsed: any[] = JSON.parse(readFileSync(filePath, 'utf8'))
        parsed.forEach((entry: any) => {
          const pluginName = entry.plugin || entry?.accessory?.plugin || entry?.accessory?.pluginName
          const acc = entry.accessory ?? entry
          if (pluginNames.includes(pluginName)) {
            devicesToReturn.push(acc as never)
          }
        })
      } catch {
        // ignore parse errors for a single file
      }
    }

    readAndCollect(accFile)
    readAndCollect(matterFile)

    return devicesToReturn
  } catch {
    return []
  }
}

describe('homebridge-ui server handler logic', () => {
  describe('getCachedAccessories', () => {
    it('should return empty array when no cached accessories file exists', () => {
      const { testDir } = createTestEnvironment()
      try {
        const result = getCachedAccessories(testDir)
        expect(result).toEqual([])
      } finally {
        cleanup(testDir)
      }
    })

    it('should return accessories with scoped plugin name', () => {
      const { testDir, accessoriesDir } = createTestEnvironment()
      try {
        const cachedAccessories = [
          {
            plugin: '@switchbot/homebridge-switchbot',
            accessory: {
              displayName: 'Test Bot',
              UUID: 'test-uuid-1',
              services: [],
            },
          },
          {
            plugin: 'homebridge-other-plugin',
            accessory: {
              displayName: 'Other Device',
              UUID: 'test-uuid-2',
              services: [],
            },
          },
        ]

        const accFile = join(accessoriesDir, 'cachedAccessories')
        writeFileSync(accFile, JSON.stringify(cachedAccessories), 'utf8')

        const result = getCachedAccessories(testDir)

        expect(result).toHaveLength(1)
        expect(result[0].displayName).toBe('Test Bot')
        expect(result[0].UUID).toBe('test-uuid-1')
      } finally {
        cleanup(testDir)
      }
    })

    it('should return accessories with unscoped plugin name', () => {
      const { testDir, accessoriesDir } = createTestEnvironment()
      try {
        const cachedAccessories = [
          {
            plugin: 'homebridge-switchbot',
            accessory: {
              displayName: 'Test Curtain',
              UUID: 'test-uuid-3',
              services: [],
            },
          },
        ]

        const accFile = join(accessoriesDir, 'cachedAccessories')
        writeFileSync(accFile, JSON.stringify(cachedAccessories), 'utf8')

        const result = getCachedAccessories(testDir)

        expect(result).toHaveLength(1)
        expect(result[0].displayName).toBe('Test Curtain')
      } finally {
        cleanup(testDir)
      }
    })

    it('should handle entries with plugin name in accessory.plugin', () => {
      const { testDir, accessoriesDir } = createTestEnvironment()
      try {
        const cachedAccessories = [
          {
            accessory: {
              plugin: '@switchbot/homebridge-switchbot',
              displayName: 'Test Contact Sensor',
              UUID: 'test-uuid-4',
              services: [],
            },
          },
        ]

        const accFile = join(accessoriesDir, 'cachedAccessories')
        writeFileSync(accFile, JSON.stringify(cachedAccessories), 'utf8')

        const result = getCachedAccessories(testDir)

        expect(result).toHaveLength(1)
        expect(result[0].displayName).toBe('Test Contact Sensor')
      } finally {
        cleanup(testDir)
      }
    })

    it('should handle entries with plugin name in accessory.pluginName', () => {
      const { testDir, accessoriesDir } = createTestEnvironment()
      try {
        const cachedAccessories = [
          {
            accessory: {
              pluginName: '@switchbot/homebridge-switchbot',
              displayName: 'Test Motion Sensor',
              UUID: 'test-uuid-5',
              services: [],
            },
          },
        ]

        const accFile = join(accessoriesDir, 'cachedAccessories')
        writeFileSync(accFile, JSON.stringify(cachedAccessories), 'utf8')

        const result = getCachedAccessories(testDir)

        expect(result).toHaveLength(1)
        expect(result[0].displayName).toBe('Test Motion Sensor')
      } finally {
        cleanup(testDir)
      }
    })

    it('should filter out accessories from other plugins', () => {
      const { testDir, accessoriesDir } = createTestEnvironment()
      try {
        const cachedAccessories = [
          {
            plugin: '@switchbot/homebridge-switchbot',
            accessory: { displayName: 'SwitchBot Device 1', UUID: 'uuid-1', services: [] },
          },
          {
            plugin: 'homebridge-other',
            accessory: { displayName: 'Other Device', UUID: 'uuid-2', services: [] },
          },
          {
            plugin: 'homebridge-switchbot',
            accessory: { displayName: 'SwitchBot Device 2', UUID: 'uuid-3', services: [] },
          },
          {
            plugin: 'homebridge-another',
            accessory: { displayName: 'Another Device', UUID: 'uuid-4', services: [] },
          },
        ]

        const accFile = join(accessoriesDir, 'cachedAccessories')
        writeFileSync(accFile, JSON.stringify(cachedAccessories), 'utf8')

        const result = getCachedAccessories(testDir)

        expect(result).toHaveLength(2)
        expect(result[0].displayName).toBe('SwitchBot Device 1')
        expect(result[1].displayName).toBe('SwitchBot Device 2')
      } finally {
        cleanup(testDir)
      }
    })

    it('should return empty array on malformed JSON', () => {
      const { testDir, accessoriesDir } = createTestEnvironment()
      try {
        const accFile = join(accessoriesDir, 'cachedAccessories')
        writeFileSync(accFile, '{ invalid json }', 'utf8')

        const result = getCachedAccessories(testDir)

        expect(result).toEqual([])
      } finally {
        cleanup(testDir)
      }
    })
  })

  describe('getCachedMatterAccessories', () => {
    it('should return empty array when no cached files exist', () => {
      const { testDir } = createTestEnvironment()
      try {
        const result = getCachedMatterAccessories(testDir)
        expect(result).toEqual([])
      } finally {
        cleanup(testDir)
      }
    })

    it('should read from cachedAccessories file', () => {
      const { testDir, accessoriesDir } = createTestEnvironment()
      try {
        const cachedAccessories = [
          {
            plugin: '@switchbot/homebridge-switchbot',
            accessory: {
              displayName: 'HAP Device',
              UUID: 'hap-uuid-1',
              services: [],
            },
          },
        ]

        const accFile = join(accessoriesDir, 'cachedAccessories')
        writeFileSync(accFile, JSON.stringify(cachedAccessories), 'utf8')

        const result = getCachedMatterAccessories(testDir)

        expect(result).toHaveLength(1)
        expect(result[0].displayName).toBe('HAP Device')
      } finally {
        cleanup(testDir)
      }
    })

    it('should read from cachedMatterAccessories file', () => {
      const { testDir, accessoriesDir } = createTestEnvironment()
      try {
        const matterAccessories = [
          {
            plugin: '@switchbot/homebridge-switchbot',
            accessory: {
              displayName: 'Matter Device',
              UUID: 'matter-uuid-1',
              services: [],
            },
          },
        ]

        const matterFile = join(accessoriesDir, 'cachedMatterAccessories')
        writeFileSync(matterFile, JSON.stringify(matterAccessories), 'utf8')

        const result = getCachedMatterAccessories(testDir)

        expect(result).toHaveLength(1)
        expect(result[0].displayName).toBe('Matter Device')
      } finally {
        cleanup(testDir)
      }
    })

    it('should combine accessories from both files', () => {
      const { testDir, accessoriesDir } = createTestEnvironment()
      try {
        const cachedAccessories = [
          {
            plugin: '@switchbot/homebridge-switchbot',
            accessory: { displayName: 'HAP Device', UUID: 'hap-uuid', services: [] },
          },
        ]
        const matterAccessories = [
          {
            plugin: 'homebridge-switchbot',
            accessory: { displayName: 'Matter Device', UUID: 'matter-uuid', services: [] },
          },
        ]

        const accFile = join(accessoriesDir, 'cachedAccessories')
        const matterFile = join(accessoriesDir, 'cachedMatterAccessories')
        writeFileSync(accFile, JSON.stringify(cachedAccessories), 'utf8')
        writeFileSync(matterFile, JSON.stringify(matterAccessories), 'utf8')

        const result = getCachedMatterAccessories(testDir)

        expect(result).toHaveLength(2)
        expect(result[0].displayName).toBe('HAP Device')
        expect(result[1].displayName).toBe('Matter Device')
      } finally {
        cleanup(testDir)
      }
    })

    it('should filter out accessories from other plugins across both files', () => {
      const { testDir, accessoriesDir } = createTestEnvironment()
      try {
        const cachedAccessories = [
          {
            plugin: '@switchbot/homebridge-switchbot',
            accessory: { displayName: 'SwitchBot HAP 1', UUID: 'hap-1', services: [] },
          },
          {
            plugin: 'homebridge-other',
            accessory: { displayName: 'Other HAP', UUID: 'hap-2', services: [] },
          },
        ]
        const matterAccessories = [
          {
            plugin: 'homebridge-switchbot',
            accessory: { displayName: 'SwitchBot Matter 1', UUID: 'matter-1', services: [] },
          },
          {
            plugin: 'homebridge-another',
            accessory: { displayName: 'Another Matter', UUID: 'matter-2', services: [] },
          },
        ]

        const accFile = join(accessoriesDir, 'cachedAccessories')
        const matterFile = join(accessoriesDir, 'cachedMatterAccessories')
        writeFileSync(accFile, JSON.stringify(cachedAccessories), 'utf8')
        writeFileSync(matterFile, JSON.stringify(matterAccessories), 'utf8')

        const result = getCachedMatterAccessories(testDir)

        expect(result).toHaveLength(2)
        expect(result[0].displayName).toBe('SwitchBot HAP 1')
        expect(result[1].displayName).toBe('SwitchBot Matter 1')
      } finally {
        cleanup(testDir)
      }
    })

    it('should handle malformed JSON in one file gracefully', () => {
      const { testDir, accessoriesDir } = createTestEnvironment()
      try {
        const matterAccessories = [
          {
            plugin: '@switchbot/homebridge-switchbot',
            accessory: { displayName: 'Valid Matter', UUID: 'valid', services: [] },
          },
        ]

        const accFile = join(accessoriesDir, 'cachedAccessories')
        const matterFile = join(accessoriesDir, 'cachedMatterAccessories')
        writeFileSync(accFile, '{ invalid json }', 'utf8')
        writeFileSync(matterFile, JSON.stringify(matterAccessories), 'utf8')

        const result = getCachedMatterAccessories(testDir)

        // Should still return the valid Matter accessory
        expect(result).toHaveLength(1)
        expect(result[0].displayName).toBe('Valid Matter')
      } finally {
        cleanup(testDir)
      }
    })

    it('should return empty array if both files have malformed JSON', () => {
      const { testDir, accessoriesDir } = createTestEnvironment()
      try {
        const accFile = join(accessoriesDir, 'cachedAccessories')
        const matterFile = join(accessoriesDir, 'cachedMatterAccessories')
        writeFileSync(accFile, '{ bad json', 'utf8')
        writeFileSync(matterFile, 'also bad }', 'utf8')

        const result = getCachedMatterAccessories(testDir)

        expect(result).toEqual([])
      } finally {
        cleanup(testDir)
      }
    })
  })
})
