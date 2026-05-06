import { describe, expect, it } from 'vitest'

import SwitchBotHAPPlatform from '../../src/Platform.HAP.js'
import { SwitchBotMatterPlatform } from '../../src/Platform.Matter.js'

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  success: () => {},
  log: () => {},
}
const mockApi = { isMatterAvailable: () => false, isMatterEnabled: () => false } as any

describe('platform edge cases', () => {
  const platforms = [
    { name: 'SwitchBotHAPPlatform', Platform: SwitchBotHAPPlatform },
    { name: 'SwitchBotMatterPlatform', Platform: SwitchBotMatterPlatform },
  ]

  for (const { name, Platform } of platforms) {
    describe(`${name}`, () => {
      it('should handle missing config', () => {
        expect(() => new Platform(mockLogger, { platform: 'SwitchBot' }, mockApi as any)).not.toThrow()
      })

      it('should handle undefined config', () => {
        expect(() => new Platform(mockLogger, undefined as any, mockApi)).not.toThrow()
      })

      it('should handle null config', () => {
        expect(() => new Platform(mockLogger, null as any, mockApi)).not.toThrow()
      })

      it('should handle missing api', () => {
        expect(() => new Platform(mockLogger, { platform: 'SwitchBot' }, undefined as any)).not.toThrow()
      })

      it('should handle null api', () => {
        expect(() => new Platform(mockLogger, { platform: 'SwitchBot' }, null as any)).not.toThrow()
      })

      it('should handle missing logger', () => {
        expect(() => new Platform(undefined as any, { platform: 'SwitchBot' }, mockApi)).toThrow()
      })

      it('should handle null logger', () => {
        expect(() => new Platform(null as any, { platform: 'SwitchBot' }, mockApi)).toThrow()
      })

      it('should not throw with minimal valid config', () => {
        const config = { name: 'SwitchBot', platform: 'SwitchBot' }
        expect(() => new Platform(mockLogger, config, mockApi)).not.toThrow()
      })

      it('should fallback gracefully if isMatterAvailable returns true but isMatterEnabled returns false', () => {
        const api = { ...mockApi, isMatterAvailable: () => true, isMatterEnabled: () => false }
        expect(() => new Platform(mockLogger, { platform: 'SwitchBot' }, api)).not.toThrow()
      })

      it('should fallback gracefully if isMatterAvailable returns false', () => {
        const api = { ...mockApi, isMatterAvailable: () => false }
        expect(() => new Platform(mockLogger, { platform: 'SwitchBot' }, api)).not.toThrow()
      })

      it('should not throw if config has extra unknown properties', () => {
        const config = { name: 'SwitchBot', platform: 'SwitchBot', extra: 123 }
        expect(() => new Platform(mockLogger, config, mockApi)).not.toThrow()
      })
    })
  }
})
