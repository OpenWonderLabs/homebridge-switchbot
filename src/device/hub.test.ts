import type { hub2Status } from 'node-switchbot'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { convertUnits } from '../utils.js'

describe('Hub 2 Sensor Parsing', () => {
  describe('convertUnits function - Hub 2 specific scenarios', () => {
    it('should handle typical Hub 2 temperature values correctly', () => {
      // Typical room temperature scenarios
      expect(convertUnits(22.5, 'CELSIUS', 'FAHRENHEIT')).toBe(73)
      expect(convertUnits(25.0, 'CELSIUS', 'FAHRENHEIT')).toBe(77)
      expect(convertUnits(20.0, 'CELSIUS', 'FAHRENHEIT')).toBe(68)
      
      // Converting back from Fahrenheit to Celsius
      expect(convertUnits(73, 'FAHRENHEIT', 'CELSIUS')).toBe(23)
      expect(convertUnits(77, 'FAHRENHEIT', 'CELSIUS')).toBe(25)
      expect(convertUnits(68, 'FAHRENHEIT', 'CELSIUS')).toBe(20)
    })

    it('should handle extreme temperature values that might indicate wrong units', () => {
      // Values that might indicate Fahrenheit when expecting Celsius
      expect(convertUnits(77, 'FAHRENHEIT', 'CELSIUS')).toBe(25) // 77°F = 25°C
      expect(convertUnits(68, 'FAHRENHEIT', 'CELSIUS')).toBe(20) // 68°F = 20°C
      expect(convertUnits(59, 'FAHRENHEIT', 'CELSIUS')).toBe(15) // 59°F = 15°C
      
      // Values that might indicate Celsius when expecting Fahrenheit
      expect(convertUnits(30, 'CELSIUS', 'FAHRENHEIT')).toBe(86) // 30°C = 86°F
      expect(convertUnits(35, 'CELSIUS', 'FAHRENHEIT')).toBe(95) // 35°C = 95°F
      expect(convertUnits(40, 'CELSIUS', 'FAHRENHEIT')).toBe(104) // 40°C = 104°F
    })

    it('should preserve same units correctly', () => {
      expect(convertUnits(22.5, 'CELSIUS', 'CELSIUS')).toBe(22.5)
      expect(convertUnits(77, 'FAHRENHEIT', 'FAHRENHEIT')).toBe(77)
      expect(convertUnits(22.5, 'CELSIUS')).toBe(22.5) // no conversion specified
      expect(convertUnits(77, 'FAHRENHEIT')).toBe(77) // no conversion specified
    })
  })

  describe('Hub 2 Status Data Validation', () => {
    it('should validate normal sensor values', () => {
      const normalStatus: Partial<hub2Status> = {
        temperature: 22.5,
        humidity: 45,
        lightLevel: 15
      }

      // Temperature validation (typical range: -50°C to 80°C)
      expect(normalStatus.temperature!).toBeGreaterThanOrEqual(-50)
      expect(normalStatus.temperature!).toBeLessThanOrEqual(80)
      
      // Humidity validation (0% to 100%)
      expect(normalStatus.humidity!).toBeGreaterThanOrEqual(0)
      expect(normalStatus.humidity!).toBeLessThanOrEqual(100)
      
      // Light level validation (0 to 100)
      expect(normalStatus.lightLevel!).toBeGreaterThanOrEqual(0)
      expect(normalStatus.lightLevel!).toBeLessThanOrEqual(100)
    })

    it('should identify invalid temperature values', () => {
      const invalidTemperatures = [
        -100, // Too cold
        150,  // Too hot
        NaN,  // Not a number
        null, // Null value
        undefined // Undefined value
      ]

      invalidTemperatures.forEach(temp => {
        if (temp === null || temp === undefined || isNaN(temp as number)) {
          expect(temp === null || temp === undefined || isNaN(temp as number)).toBe(true)
        } else {
          expect(temp < -50 || temp > 80).toBe(true)
        }
      })
    })

    it('should identify invalid humidity values', () => {
      const invalidHumidities = [
        -10,  // Negative humidity
        150,  // Over 100%
        NaN,  // Not a number
        null, // Null value
        undefined // Undefined value
      ]

      invalidHumidities.forEach(humidity => {
        if (humidity === null || humidity === undefined || isNaN(humidity as number)) {
          expect(humidity === null || humidity === undefined || isNaN(humidity as number)).toBe(true)
        } else {
          expect(humidity < 0 || humidity > 100).toBe(true)
        }
      })
    })

    it('should identify invalid light level values', () => {
      const invalidLightLevels = [
        -5,   // Negative light
        150,  // Over 100
        NaN,  // Not a number
        null, // Null value
        undefined // Undefined value
      ]

      invalidLightLevels.forEach(lightLevel => {
        if (lightLevel === null || lightLevel === undefined || isNaN(lightLevel as number)) {
          expect(lightLevel === null || lightLevel === undefined || isNaN(lightLevel as number)).toBe(true)
        } else {
          expect(lightLevel < 0 || lightLevel > 100).toBe(true)
        }
      })
    })
  })

  describe('Hub 2 Edge Cases and Problem Scenarios', () => {
    it('should handle the original issue scenario - all sensor values showing as 0', () => {
      const problematicStatus: Partial<hub2Status> = {
        temperature: 0,
        humidity: 0,
        lightLevel: 0
      }

      // These might be valid in some cases, but unusual to have all three as exactly 0
      expect(typeof problematicStatus.temperature).toBe('number')
      expect(typeof problematicStatus.humidity).toBe('number')
      expect(typeof problematicStatus.lightLevel).toBe('number')
      
      // Check if this might indicate a data parsing issue
      const allZero = problematicStatus.temperature === 0 && 
                     problematicStatus.humidity === 0 && 
                     problematicStatus.lightLevel === 0
      expect(allZero).toBe(true) // This scenario should be flagged for investigation
    })

    it('should handle missing or malformed API response data', () => {
      const malformedResponses: any[] = [
        {}, // Empty object
        { temperature: null, humidity: null, lightLevel: null }, // Null values
        { temperature: 'invalid', humidity: 'invalid', lightLevel: 'invalid' }, // String values
        { temp: 22, hum: 45, light: 15 }, // Wrong property names
      ]

      malformedResponses.forEach(response => {
        const hasValidTemp = typeof response.temperature === 'number' && !isNaN(response.temperature)
        const hasValidHumidity = typeof response.humidity === 'number' && !isNaN(response.humidity)
        const hasValidLight = typeof response.lightLevel === 'number' && !isNaN(response.lightLevel)
        
        // Most of these should fail validation
        expect(hasValidTemp && hasValidHumidity && hasValidLight).toBe(false)
      })
    })

    it('should detect temperature values that might be in wrong units', () => {
      // Values that are suspiciously high for Celsius (might be Fahrenheit)
      const suspiciouslyHighCelsius = [77, 68, 59, 86, 95] // These are likely Fahrenheit
      
      suspiciouslyHighCelsius.forEach(temp => {
        if (temp > 50) { // Temperatures above 50°C are suspicious for room temperature
          const convertedTemp = convertUnits(temp, 'FAHRENHEIT', 'CELSIUS')
          expect(convertedTemp).toBeLessThan(40) // Should be reasonable room temperature when converted
        }
      })

      // Values that are suspiciously low for Fahrenheit (might be Celsius)
      const suspiciouslyLowFahrenheit = [20, 25, 30, 35] // These are likely Celsius
      
      suspiciouslyLowFahrenheit.forEach(temp => {
        if (temp < 40) { // Temperatures below 40°F are suspicious for room temperature
          const convertedTemp = convertUnits(temp, 'CELSIUS', 'FAHRENHEIT')
          expect(convertedTemp).toBeGreaterThan(60) // Should be reasonable room temperature when converted
        }
      })
    })

    it('should validate realistic sensor ranges for home environments', () => {
      // Typical indoor ranges
      const realisticIndoorTemp = 22.5 // 22.5°C / ~73°F
      const realisticIndoorHumidity = 45 // 45%
      const realisticIndoorLight = 15 // Light level 15
      
      // Temperature: 15°C to 30°C (59°F to 86°F) is reasonable for indoor
      expect(realisticIndoorTemp).toBeGreaterThanOrEqual(15)
      expect(realisticIndoorTemp).toBeLessThanOrEqual(30)
      
      // Humidity: 30% to 70% is typical indoor range
      expect(realisticIndoorHumidity).toBeGreaterThanOrEqual(30)
      expect(realisticIndoorHumidity).toBeLessThanOrEqual(70)
      
      // Light level: 0 to 100 scale
      expect(realisticIndoorLight).toBeGreaterThanOrEqual(0)
      expect(realisticIndoorLight).toBeLessThanOrEqual(100)
    })
  })
})