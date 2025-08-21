import { describe, expect, it } from 'vitest'

import { convertUnits, validHumidity } from './utils.js'

describe('utils.ts', () => {
  describe('convertUnits', () => {
    it('should convert Celsius to Fahrenheit', () => {
      expect(convertUnits(0, 'CELSIUS', 'FAHRENHEIT')).toBe(32)
      expect(convertUnits(13.9, 'CELSIUS', 'FAHRENHEIT')).toBe(57)
      expect(convertUnits(100, 'CELSIUS', 'FAHRENHEIT')).toBe(212)
      expect(convertUnits(-40, 'CELSIUS', 'FAHRENHEIT')).toBe(-40)
    })

    it('should convert Fahrenheit to Celsius', () => {
      expect(convertUnits(32, 'FAHRENHEIT', 'CELSIUS')).toBe(0)
      expect(convertUnits(212, 'FAHRENHEIT', 'CELSIUS')).toBe(100)
      expect(convertUnits(86, 'FAHRENHEIT', 'CELSIUS')).toBe(30)
      expect(convertUnits(-40, 'FAHRENHEIT', 'CELSIUS')).toBe(-40)
    })

    it('should return value unchanged when no conversion needed', () => {
      expect(convertUnits(20, 'CELSIUS', 'CELSIUS')).toBe(20)
      expect(convertUnits(68, 'FAHRENHEIT', 'FAHRENHEIT')).toBe(68)
      expect(convertUnits(25, 'CELSIUS')).toBe(25)
      expect(convertUnits(25, 'CELSIUS', undefined)).toBe(25)
      expect(convertUnits(25, 'FAHRENHEIT')).toBe(25)
    })

    it('should handle edge cases', () => {
      expect(convertUnits(0, 'CELSIUS', undefined)).toBe(0)
      expect(convertUnits(0, 'FAHRENHEIT', undefined)).toBe(0)
      expect(convertUnits(25, 'UNKNOWN', 'FAHRENHEIT')).toBe(25)
      expect(convertUnits(25, 'CELSIUS', 'UNKNOWN')).toBe(25)
    })
  })

  describe('validHumidity', () => {
    it('should return humidity within valid range', () => {
      expect(validHumidity(50)).toBe(50)
      expect(validHumidity(0)).toBe(0)
      expect(validHumidity(100)).toBe(100)
    })

    it('should clamp humidity to minimum', () => {
      expect(validHumidity(-10)).toBe(0)
      expect(validHumidity(-5, 10)).toBe(10)
    })

    it('should clamp humidity to maximum', () => {
      expect(validHumidity(110)).toBe(100)
      expect(validHumidity(95, 0, 90)).toBe(90)
    })

    it('should handle custom min/max ranges', () => {
      expect(validHumidity(50, 20, 80)).toBe(50)
      expect(validHumidity(10, 20, 80)).toBe(20)
      expect(validHumidity(90, 20, 80)).toBe(80)
    })
  })
})