import { describe, expect, it } from 'vitest'

import { SwitchBotClient } from '../../src/switchbotClient'

describe('switchBotClient', () => {
  it('should throw if logger is missing in config', () => {
    expect(() => new SwitchBotClient({} as any)).toThrow('SwitchBotClient requires a logger')
  })

  it('should initialize with logger and config', () => {
    const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
    const cfg = { logger }
    const client = new SwitchBotClient(cfg as any)
    expect(client).toBeDefined()
  })

  it('should set custom debounce from config', () => {
    const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
    const cfg = { logger, writeDebounceMs: 321 }
    const client = new SwitchBotClient(cfg as any)
    expect((client as any).writeDebounceMs).toBe(321)
  })
})
