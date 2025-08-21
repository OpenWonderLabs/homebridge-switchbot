import type { API } from 'homebridge'

import { describe, expect, it, vi } from 'vitest'

import registerPlatform from './index.js'
import { SwitchBotPlatform } from './platform.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'
import { convertUnits } from './utils.js'

describe('index.ts', () => {
  it('should register the platform with homebridge', () => {
    const api = {
      registerPlatform: vi.fn(),
    } as unknown as API

    registerPlatform(api)

    expect(api.registerPlatform).toHaveBeenCalledWith(PLUGIN_NAME, PLATFORM_NAME, SwitchBotPlatform)
  })
})

describe('convertUnits', () => {
  it('should not convert when unit and convert are both CELSIUS', () => {
    // When both unit and convert are CELSIUS, should return the same value
    expect(convertUnits(30, 'CELSIUS', 'CELSIUS')).toBe(30)
    expect(convertUnits(23.3, 'CELSIUS', 'CELSIUS')).toBe(23.3)
  })

  it('should not convert when unit and convert are both FAHRENHEIT', () => {
    // When both unit and convert are FAHRENHEIT, should return the same value  
    expect(convertUnits(86, 'FAHRENHEIT', 'FAHRENHEIT')).toBe(86)
    expect(convertUnits(74, 'FAHRENHEIT', 'FAHRENHEIT')).toBe(74)
  })

  it('should convert from CELSIUS to FAHRENHEIT', () => {
    // 30°C should be 86°F
    expect(convertUnits(30, 'CELSIUS', 'FAHRENHEIT')).toBe(86)
    // 0°C should be 32°F
    expect(convertUnits(0, 'CELSIUS', 'FAHRENHEIT')).toBe(32)
    // 23.3°C should be ~74°F
    expect(convertUnits(23.3, 'CELSIUS', 'FAHRENHEIT')).toBe(74)
  })

  it('should convert from FAHRENHEIT to CELSIUS', () => {
    // 86°F should be 30°C
    expect(convertUnits(86, 'FAHRENHEIT', 'CELSIUS')).toBe(30)
    // 32°F should be 0°C
    expect(convertUnits(32, 'FAHRENHEIT', 'CELSIUS')).toBe(0)
    // 74°F should be ~23.3°C
    expect(convertUnits(74, 'FAHRENHEIT', 'CELSIUS')).toBe(23.5) // rounded to nearest 0.5
  })

  it('should return original value when no conversion specified', () => {
    expect(convertUnits(30, 'CELSIUS')).toBe(30)
    expect(convertUnits(86, 'FAHRENHEIT')).toBe(86)
    expect(convertUnits(23.3, 'CELSIUS', undefined)).toBe(23.3)
  })

  it('should fix the stuck 85F issue scenario', () => {
    // The reported issue: devices stuck at 85F and 50% humidity
    // The 85F comes from incorrectly converting the default 30°C from offlineOff method
    
    // Before fix: when device was offline, offlineOff set 30°C and convertUnits incorrectly converted it
    // This should NOT happen anymore with the fix
    
    // Test real temperature values from the logs:
    // Kitchen Meter: 23.3°C should stay as 23.3°C when no conversion is requested
    expect(convertUnits(23.3, 'CELSIUS')).toBe(23.3)
    
    // Living Room Meter: 22.7°C should stay as 22.7°C
    expect(convertUnits(22.7, 'CELSIUS')).toBe(22.7)
    
    // Office Meter: 21.7°C should stay as 21.7°C  
    expect(convertUnits(21.7, 'CELSIUS')).toBe(21.7)
    
    // Test conversion from default offline value (30°C) if needed
    // 30°C converted to Fahrenheit should be 86°F, NOT treated as already Fahrenheit
    expect(convertUnits(30, 'CELSIUS', 'FAHRENHEIT')).toBe(86)
  })
})
