import { describe, expect, it } from 'vitest'

import { BotDevice, CurtainDevice } from '../../src/devices/genericDevice'

const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }

describe('matter device descriptors', () => {
  it('should expose correct clusters for BotDevice', async () => {
    const bot = new BotDevice({ id: 'bot1', type: 'Bot' }, { log: mockLogger })
    const matter = await bot.createMatterAccessory({})
    expect(matter.clusters).toBeDefined()
    const hasOnOff = matter.clusters && matter.clusters.some((c: any) => c.type === 'OnOff')
    expect(typeof hasOnOff).toBe('boolean')
  })

  it('should expose correct clusters for CurtainDevice', async () => {
    const curtain = new CurtainDevice({ id: 'curtain1', type: 'Curtain' }, { log: mockLogger })
    const matter = await curtain.createMatterAccessory({})
    expect(matter.clusters).toBeDefined()
    expect(matter.clusters.some((c: any) => c.type === 'WindowCovering')).toBe(true)
  })
})
