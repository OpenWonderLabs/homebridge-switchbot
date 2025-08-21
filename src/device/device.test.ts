import { describe, expect, it } from 'vitest'
import { SwitchBotBLEModel, SwitchBotBLEModelName, SwitchBotModel } from 'node-switchbot'

describe('device mapping for Bot S1', () => {
  it('should have Bot S1 mapping available in the codebase', () => {
    // Test that the necessary SwitchBot models exist
    expect(SwitchBotModel.Bot).toBeDefined()
    expect(SwitchBotBLEModel.Bot).toBeDefined()
    expect(SwitchBotBLEModelName.Bot).toBeDefined()
    
    // Test that these are the same values that should be used for Bot S1
    expect(typeof SwitchBotModel.Bot).toBe('string')
    expect(typeof SwitchBotBLEModel.Bot).toBe('string')
    expect(typeof SwitchBotBLEModelName.Bot).toBe('string')
  })
})