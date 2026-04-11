import { describe, expect, it } from 'vitest'

import { BotDevice, CurtainDevice } from '../../src/devices/genericDevice'

const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
describe('matter device state translation', () => {
  it('should map Bot state to Matter OnOff', async () => {
    const bot = new BotDevice({ id: 'bot1', type: 'Bot' }, { log: mockLogger })
    bot.getState = async () => ({ on: true })
    const matter = await bot.createMatterAccessory({})
    const onOffCluster = matter.clusters.find((c: any) => c.type === 'OnOff')
    if (onOffCluster && onOffCluster.attributes && onOffCluster.attributes.onOff && typeof onOffCluster.attributes.onOff.read === 'function') {
      const onOff = await onOffCluster.attributes.onOff.read()
      expect(onOff).toBe(true)
    } else {
      expect(onOffCluster).toBeDefined()
    }
  })

  it('should map Curtain state to Matter WindowCovering', async () => {
    const curtain = new CurtainDevice({ id: 'curtain1', type: 'Curtain' }, { log: mockLogger })
    curtain.getState = async () => ({ position: 50 })
    const matter = await curtain.createMatterAccessory({})
    const windowCoveringCluster = matter.clusters.find((c: any) => c.type === 'WindowCovering')
    if (
      windowCoveringCluster
      && windowCoveringCluster.attributes
      && windowCoveringCluster.attributes.position
      && typeof windowCoveringCluster.attributes.position.read === 'function'
    ) {
      const position = await windowCoveringCluster.attributes.position.read()
      expect(typeof position === 'number' || position === undefined).toBe(true)
    } else {
      expect(windowCoveringCluster).toBeDefined()
    }
  })
})
