import { describe, expect, it, vi } from 'vitest'

import { SwitchBotMatterPlatform } from '../../platform-matter.js'
import { makeApiStub, makeLogStub } from '../helpers/platform-fixtures.js'

describe('additional platform-matter mapping tests', () => {
  it('parses OpenAPI color strings and triggers an update', async () => {
    const updateAccessoryState = vi.fn()
    const api: any = makeApiStub({ updateAccessoryState })
    const log = makeLogStub()
    const platform = new SwitchBotMatterPlatform(log as any, {} as any, api)

    // Some OpenAPI statuses provide color as comma/colon separated or hex
    await (platform as any).applyStatusToAccessory('uuid-col', { deviceId: 'DEV-COL' } as any, { color: '255:128:64' })
    await (platform as any).applyStatusToAccessory('uuid-col', { deviceId: 'DEV-COL' } as any, { color: '255,128,64' })
    await (platform as any).applyStatusToAccessory('uuid-col', { deviceId: 'DEV-COL' } as any, { color: '#FF8040' })

    expect(updateAccessoryState).toHaveBeenCalled()
  })

  it('maps MeterPro CO2 values to Matter updates', async () => {
    const updateAccessoryState = vi.fn()
    const api: any = makeApiStub({ updateAccessoryState })
    const log = makeLogStub()
    const platform = new SwitchBotMatterPlatform(log as any, {} as any, api)

    await (platform as any).applyStatusToAccessory('uuid-co2', { deviceId: 'DEV-METERPRO' } as any, { co2: 420 })

    expect(updateAccessoryState).toHaveBeenCalled()
  })

  it('handles curtain position synonyms (position / slidePosition)', async () => {
    const updateAccessoryState = vi.fn()
    const api: any = makeApiStub({ updateAccessoryState })
    const log = makeLogStub()
    const platform = new SwitchBotMatterPlatform(log as any, {} as any, api)

    // Provide status with position and slidePosition synonyms
    await (platform as any).applyStatusToAccessory('uuid-cur', { deviceId: 'DEV-CUR', deviceType: 'Curtain' } as any, { position: 30 })
    await (platform as any).applyStatusToAccessory('uuid-cur', { deviceId: 'DEV-CUR', deviceType: 'Curtain' } as any, { slidePosition: 70 })

    expect(updateAccessoryState).toHaveBeenCalled()
  })
})
