import { describe, expect, it, vi } from 'vitest'

import { BaseMatterAccessory } from '../../../devices-matter/BaseMatterAccessory.js'

// Minimal concrete subclass for testing
class TestAccessory extends BaseMatterAccessory {
  constructor(api: any, log: any, opts?: any) {
    super(api, log, {
      uuid: opts?.uuid ?? api.matter.uuid.generate('test'),
      displayName: opts?.displayName ?? 'Test',
      deviceType: opts?.deviceType ?? ('OnOffLight' as any),
      serialNumber: opts?.serialNumber ?? 'TEST-1',
      manufacturer: opts?.manufacturer ?? 'TestCo',
      model: opts?.model ?? 'T-1',
      firmwareRevision: opts?.firmwareRevision ?? '1.0',
      hardwareRevision: opts?.hardwareRevision ?? '1.0',
      context: opts?.context ?? {},
      clusters: opts?.clusters,
      handlers: opts?.handlers,
    })
  }
}

describe('baseMatterAccessory helpers', () => {
  it('sendOnCommand uses OpenAPI helper and updates state', async () => {
    const update = vi.fn()
    const sendOpenAPI = vi.fn(async () => ({ response: {}, statusCode: 200 }))
    const api: any = { matter: { clusterNames: { OnOff: 'onOff', LevelControl: 'level', ColorControl: 'color' }, uuid: { generate: () => 'uuid-1' }, updateAccessoryState: update } }
    const log: any = { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() }

    const ctx = { deviceId: 'DEV-1', sendOpenAPI, connectionType: 'OpenAPI' }
    const acc = new TestAccessory(api, log, { context: ctx })

    await acc.sendOnCommand()

    expect(sendOpenAPI).toHaveBeenCalledWith('turnOn', 'default')
    expect(update).toHaveBeenCalledWith(acc.uuid, 'onOff', { onOff: true })
  })

  it('sendOnCommand uses BLE helper when connectionType is BLE', async () => {
    const update = vi.fn()
    const sendBLE = vi.fn(async () => true)
    const api: any = { matter: { clusterNames: { OnOff: 'onOff', LevelControl: 'level', ColorControl: 'color' }, uuid: { generate: () => 'uuid-2' }, updateAccessoryState: update } }
    const log: any = { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() }

    const ctx = { deviceId: 'DEV-2', sendBLE, connectionType: 'BLE' }
    const acc = new TestAccessory(api, log, { context: ctx })

    await acc.sendOnCommand()

    expect(sendBLE).toHaveBeenCalledWith('turnOn')
    expect(update).toHaveBeenCalledWith(acc.uuid, 'onOff', { onOff: true })
  })

  it('sendSetBrightness sends percent and updates LevelControl', async () => {
    const update = vi.fn()
    const sendOpenAPI = vi.fn(async () => ({ response: {}, statusCode: 200 }))
    const api: any = { matter: { clusterNames: { OnOff: 'onOff', LevelControl: 'level', ColorControl: 'color' }, uuid: { generate: () => 'uuid-3' }, updateAccessoryState: update } }
    const log: any = { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() }

    const ctx = { deviceId: 'DEV-3', sendOpenAPI, connectionType: 'OpenAPI' }
    const acc = new TestAccessory(api, log, { context: ctx })

    await acc.sendSetBrightness(50)

    expect(sendOpenAPI).toHaveBeenCalledWith('setBrightness', '50')
    const expectedLevel = Math.round((50 / 100) * 254)
    expect(update).toHaveBeenCalledWith(acc.uuid, 'level', { currentLevel: expectedLevel })
  })

  it('sendSetColor sends RGB and updates ColorControl', async () => {
    const update = vi.fn()
    const sendOpenAPI = vi.fn(async () => ({ response: {}, statusCode: 200 }))
    const api: any = { matter: { clusterNames: { OnOff: 'onOff', LevelControl: 'level', ColorControl: 'color' }, uuid: { generate: () => 'uuid-4' }, updateAccessoryState: update } }
    const log: any = { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() }

    const ctx = { deviceId: 'DEV-4', sendOpenAPI, connectionType: 'OpenAPI' }
    const acc = new TestAccessory(api, log, { context: ctx })

    await acc.sendSetColor(255, 128, 0)

    expect(sendOpenAPI).toHaveBeenCalledWith('setColor', '255:128:0')
    expect(update).toHaveBeenCalled()
    // Ensure we updated ColorControl cluster with numeric attributes
    const calledWith = (update.mock.calls[0] || update.mock.calls[1])
    expect(calledWith[1] === 'color' || calledWith[1] === api.matter.clusterNames.ColorControl).toBeTruthy()
  })
})
