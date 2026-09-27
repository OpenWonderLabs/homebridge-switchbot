import { Accessory, Characteristic, Service, uuid } from '@homebridge/hap-nodejs'
import { describe, expect, it, vi } from 'vitest'

import { BotDevice } from '../../src/devices/genericDevice.js'
import { SwitchBotHAPPlatform } from '../../src/SwitchBotHAPPlatform.js'

const id = 'bot-door-test'
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }

function bot(config: Record<string, unknown>, result: unknown = { success: true }) {
  const setDeviceState = vi.fn(async () => result)
  const device = new BotDevice(
    { id, type: 'Bot', name: 'Entrance', log, blePollingEnabled: false },
    { log, devices: [{ deviceId: id, configDeviceType: 'Bot', ...config }], _client: { setDeviceState } } as any,
  )
  return { device, setDeviceState }
}

const displays = [
  ['switch', 'Switch', 'On', true, false],
  ['outlet', 'Outlet', 'On', true, false],
  ['door', 'Door', 'TargetPosition', 100, 0],
  ['window', 'Window', 'TargetPosition', 100, 0],
  ['windowcovering', 'WindowCovering', 'TargetPosition', 100, 0],
  ['garagedoor', 'GarageDoorOpener', 'TargetDoorState', 0, 1],
  ['lock', 'LockMechanism', 'LockTargetState', 0, 1],
  ['faucet', 'Faucet', 'Active', 1, 0],
  ['fan', 'Fanv2', 'Active', 1, 0],
  ['stateful', 'StatefulProgrammableSwitch', 'ProgrammableSwitchOutputState', 1, 0],
] as const

describe('bot HomeKit presentation', () => {
  it('keeps the default Switch presentation', () => {
    expect(bot({}).device.createHAPAccessory({}).services[0].type).toBe('Switch')
  })

  it.each(displays)('restores %s as a HAP %s with Press Mode', async (display, serviceType, controlName, active, inactive) => {
    const { device, setDeviceState } = bot({ botDisplay: display, mode: 'press' })
    const descriptor = device.createHAPAccessory({}).services[0]
    expect(descriptor.type).toBe(serviceType)
    const required = new (Service as any)[serviceType]().characteristics
    const provided = new Set(Object.keys(descriptor.characteristics).map(name => (Characteristic as any)[name]?.UUID))
    for (const characteristic of required) {
      expect(provided.has(characteristic.UUID)).toBe(true)
    }
    const control = descriptor.characteristics[controlName]
    await control.set(active)
    await control.set(inactive)
    expect(await control.get()).toBe(inactive)
    expect(setDeviceState).toHaveBeenCalledExactlyOnceWith(id, {
      command: 'press',
      parameter: 'default',
      commandType: 'command',
    })
  })

  it.each(displays)('registers %s and resets its HAP control after a press', async (display, serviceType, controlName, active, inactive) => {
    const { device } = bot({ botDisplay: display, mode: 'press' })
    const accessory = new Accessory('Entrance', uuid.generate(id))
    accessory.addService(Service.Switch)
    const api = { hap: { Service, Characteristic, uuid }, registerPlatformAccessories: vi.fn() }
    const platform = Object.create(SwitchBotHAPPlatform.prototype) as any
    platform.api = api
    platform.log = log
    platform.accessories = new Map([[uuid.generate(id), accessory]])
    platform.hapPushTargets = new Map()
    const created = { instance: device, createAccessory: () => device.createHAPAccessory(api) }

    await platform.registerHAPAccessories([{ created, d: { id, name: 'Entrance' }, type: 'Bot' }])

    const service = accessory.getService((Service as any)[serviceType])!
    expect(service).toBeDefined()
    if (serviceType !== 'Switch') {
      expect(accessory.getService(Service.Switch)).toBeUndefined()
    }
    const characteristic = service.getCharacteristic((Characteristic as any)[controlName])
    await characteristic.handleSetRequest(active)
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(characteristic.value).toBe(inactive)
  })

  it('uses turnOn and turnOff for physical Switch Mode', async () => {
    const { device, setDeviceState } = bot({ botDisplay: 'door', mode: 'switch' })
    const target = device.createHAPAccessory({}).services[0].characteristics.TargetPosition
    await target.set(100)
    expect(await target.get()).toBe(100)
    await target.set(0)
    expect(await target.get()).toBe(0)
    expect(setDeviceState.mock.calls.map(([, body]) => body.command)).toEqual(['turnOn', 'turnOff'])
  })

  it('reloads a Bot when its physical mode changes', async () => {
    const platform = Object.create(SwitchBotHAPPlatform.prototype) as any
    platform.config = { devices: [{ deviceId: id, configDeviceType: 'Bot', mode: 'switch' }] }
    platform.lastConfigHash = platform.getConfigHash()
    platform.config.devices[0].mode = 'press'
    platform.log = log
    platform.accessories = new Map()
    platform.devices = []
    platform.loadDevices = vi.fn(async () => {})

    await platform.checkAndReloadDevices()

    expect(platform.loadDevices).toHaveBeenCalledOnce()
  })

  it('emits each Stateful Programmable Switch press as an event', async () => {
    const { device, setDeviceState } = bot({ botDisplay: 'stateful', mode: 'press' })
    const accessory = new Accessory('Entrance', uuid.generate(id))
    const api = { hap: { Service, Characteristic, uuid }, registerPlatformAccessories: vi.fn() }
    const platform = Object.create(SwitchBotHAPPlatform.prototype) as any
    platform.api = api
    platform.log = log
    platform.accessories = new Map([[uuid.generate(id), accessory]])
    platform.hapPushTargets = new Map()
    const created = { instance: device, createAccessory: () => device.createHAPAccessory(api) }
    await platform.registerHAPAccessories([{ created, d: { id, name: 'Entrance' }, type: 'Bot' }])

    const service = accessory.getService(Service.StatefulProgrammableSwitch)!
    const event = service.getCharacteristic(Characteristic.ProgrammableSwitchEvent)
    const notify = vi.spyOn(event, 'sendEventNotification')
    const output = service.getCharacteristic(Characteristic.ProgrammableSwitchOutputState)
    await output.handleSetRequest(1)
    await new Promise(resolve => setTimeout(resolve, 10))
    await output.handleSetRequest(1)
    await new Promise(resolve => setTimeout(resolve, 10))
    await output.handleSetRequest(0)
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(notify).toHaveBeenCalledTimes(2)
    expect(notify).toHaveBeenCalledWith(0)
    expect(setDeviceState).toHaveBeenCalledTimes(2)
  })

  it('sends one press for Open and none for Close', async () => {
    const { device, setDeviceState } = bot({ botDisplay: 'door' })
    const chars = device.createHAPAccessory({}).services[0].characteristics
    expect(await chars.TargetPosition.get()).toBe(0)
    expect(await chars.CurrentPosition.get()).toBe(0)
    expect(await chars.PositionState.get()).toBe(2)
    await chars.TargetPosition.set(100)
    await chars.TargetPosition.set(0)
    expect(setDeviceState).toHaveBeenCalledExactlyOnceWith(id, {
      command: 'press',
      parameter: 'default',
      commandType: 'command',
    })
  })

  it('reports a failed press to HomeKit', async () => {
    const { device } = bot({ type: 'door' }, { success: false, reason: 'offline' })
    await expect(device.createHAPAccessory({}).services[0].characteristics.TargetPosition.set(100))
      .rejects
      .toThrow('offline')
  })

  it('replaces a cached Switch and resets TargetPosition after HAP commits the write', async () => {
    const { device, setDeviceState } = bot({ botDisplay: 'door' })
    const accessory = new Accessory('Entrance', uuid.generate(id))
    accessory.addService(Service.Switch)
    const api = {
      hap: { Service, Characteristic, uuid },
      registerPlatformAccessories: vi.fn(),
    }
    const platform = Object.create(SwitchBotHAPPlatform.prototype) as any
    platform.api = api
    platform.log = log
    platform.accessories = new Map([[uuid.generate(id), accessory]])
    platform.hapPushTargets = new Map()
    const created = { instance: device, createAccessory: () => device.createHAPAccessory(api) }

    await platform.registerHAPAccessories([{ created, d: { id, name: 'Entrance' }, type: 'Bot' }])

    expect(accessory.getService(Service.Switch)).toBeUndefined()
    const door = accessory.getService(Service.Door)!
    expect(door.getCharacteristic(Characteristic.CurrentPosition)).toBeDefined()
    expect(door.getCharacteristic(Characteristic.PositionState)).toBeDefined()
    const target = door.getCharacteristic(Characteristic.TargetPosition)
    await target.handleSetRequest(100)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(target.value).toBe(0)
    expect(setDeviceState).toHaveBeenCalledTimes(1)
  })
})
