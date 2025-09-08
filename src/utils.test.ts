import { describe, expect, it } from 'vitest'

import { convertUnits, validHumidity } from './utils.js'

describe('utils.ts', () => {
  describe('convertUnits', () => {
    it('should convert Celsius to Fahrenheit correctly', () => {
      expect(convertUnits(0, 'CELSIUS', 'FAHRENHEIT')).toBe(32)
      expect(convertUnits(20, 'CELSIUS', 'FAHRENHEIT')).toBe(68)
      expect(convertUnits(25, 'CELSIUS', 'FAHRENHEIT')).toBe(77)
      expect(convertUnits(-10, 'CELSIUS', 'FAHRENHEIT')).toBe(14)
      expect(convertUnits(100, 'CELSIUS', 'FAHRENHEIT')).toBe(212)
    })

    it('should convert Fahrenheit to Celsius correctly', () => {
      expect(convertUnits(32, 'FAHRENHEIT', 'CELSIUS')).toBe(0)
      expect(convertUnits(68, 'FAHRENHEIT', 'CELSIUS')).toBe(20)
      expect(convertUnits(77, 'FAHRENHEIT', 'CELSIUS')).toBe(25)
      expect(convertUnits(14, 'FAHRENHEIT', 'CELSIUS')).toBe(-10)
      expect(convertUnits(212, 'FAHRENHEIT', 'CELSIUS')).toBe(100)
    })

    it('should return same value when no conversion is needed', () => {
      expect(convertUnits(25, 'CELSIUS', 'CELSIUS')).toBe(25)
      expect(convertUnits(77, 'FAHRENHEIT', 'FAHRENHEIT')).toBe(77)
      expect(convertUnits(25, 'CELSIUS')).toBe(25)
      expect(convertUnits(77, 'FAHRENHEIT')).toBe(77)
    })

    it('should handle edge cases', () => {
      expect(convertUnits(0, 'CELSIUS', 'FAHRENHEIT')).toBe(32)
      expect(convertUnits(0, 'FAHRENHEIT', 'CELSIUS')).toBe(-18) // Rounded to nearest 0.5
      expect(convertUnits(-40, 'CELSIUS', 'FAHRENHEIT')).toBe(-40)
      expect(convertUnits(-40, 'FAHRENHEIT', 'CELSIUS')).toBe(-40)
    })
  })

  describe('validHumidity', () => {
    it('should return value within valid range', () => {
      expect(validHumidity(50)).toBe(50)
      expect(validHumidity(0)).toBe(0)
      expect(validHumidity(100)).toBe(100)
      expect(validHumidity(75.5)).toBe(75.5)
    })

    it('should clamp values below minimum', () => {
      expect(validHumidity(-10)).toBe(0)
      expect(validHumidity(-1)).toBe(0)
      expect(validHumidity(-100)).toBe(0)
    })

    it('should clamp values above maximum', () => {
      expect(validHumidity(110)).toBe(100)
      expect(validHumidity(101)).toBe(100)
      expect(validHumidity(200)).toBe(100)
    })

    it('should respect custom min/max values', () => {
      expect(validHumidity(5, 10, 90)).toBe(10)
      expect(validHumidity(95, 10, 90)).toBe(90)
      expect(validHumidity(50, 10, 90)).toBe(50)
    })
  })
})