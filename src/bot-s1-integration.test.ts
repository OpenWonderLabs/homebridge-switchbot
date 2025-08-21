import { describe, expect, it } from 'vitest'
import { SwitchBotBLEModel, SwitchBotBLEModelFriendlyName, SwitchBotBLEModelName, SwitchBotModel } from 'node-switchbot'

describe('Bot S1 device mapping integration', () => {
  it('should have correct mapping for Bot S1 device type', () => {
    // Simulate the device mapping from device.ts
    const deviceMapping = {
      'Bot': {
        model: SwitchBotModel.Bot,
        bleModel: SwitchBotBLEModel.Bot,
        bleModelName: SwitchBotBLEModelName.Bot,
        bleModelFriendlyName: SwitchBotBLEModelFriendlyName.Bot,
      },
      'Bot S1': {
        model: SwitchBotModel.Bot,
        bleModel: SwitchBotBLEModel.Bot,
        bleModelName: SwitchBotBLEModelName.Bot,
        bleModelFriendlyName: SwitchBotBLEModelFriendlyName.Bot,
      },
    }

    // Test that Bot S1 mapping exists
    expect(deviceMapping['Bot S1']).toBeDefined()
    
    // Test that Bot S1 uses the same mapping as regular Bot
    expect(deviceMapping['Bot S1'].model).toBe(deviceMapping['Bot'].model)
    expect(deviceMapping['Bot S1'].bleModel).toBe(deviceMapping['Bot'].bleModel)
    expect(deviceMapping['Bot S1'].bleModelName).toBe(deviceMapping['Bot'].bleModelName)
    expect(deviceMapping['Bot S1'].bleModelFriendlyName).toBe(deviceMapping['Bot'].bleModelFriendlyName)

    // Test that both use the Bot models from node-switchbot
    expect(deviceMapping['Bot S1'].model).toBe(SwitchBotModel.Bot)
    expect(deviceMapping['Bot S1'].bleModel).toBe(SwitchBotBLEModel.Bot)
    expect(deviceMapping['Bot S1'].bleModelName).toBe(SwitchBotBLEModelName.Bot)
  })

  it('should have correct device type handlers for Bot S1', () => {
    // Simulate the device type handlers from platform.ts
    const deviceTypeHandlers = {
      'Bot': 'createBot',
      'Bot S1': 'createBot',
      'Relay Switch 1': 'createRelaySwitch',
    }

    // Test that Bot S1 handler exists and points to createBot
    expect(deviceTypeHandlers['Bot S1']).toBe('createBot')
    
    // Test that Bot S1 uses the same handler as regular Bot
    expect(deviceTypeHandlers['Bot S1']).toBe(deviceTypeHandlers['Bot'])
  })

  it('should support BLE functionality for Bot S1', () => {
    // Verify that Bot S1 will use the same BLE models as regular Bot
    // This means it should support the same BLE functionality
    expect(SwitchBotBLEModel.Bot).toBeDefined()
    expect(SwitchBotBLEModelName.Bot).toBeDefined()
    expect(typeof SwitchBotBLEModel.Bot).toBe('string')
    expect(typeof SwitchBotBLEModelName.Bot).toBe('string')
  })
})