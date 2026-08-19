/* Copyright(C) 2021-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * getstate-returns-status.spec.ts: getState() must yield readings, not the device
 */

import { describe, expect, it, vi } from 'vitest'

import { createDevice } from '../../src/deviceFactory.js'
import { GenericDevice, MeterDevice } from '../../src/devices/genericDevice.js'

const log: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), success: vi.fn() }

/** A node-switchbot style device: identity on the instance, readings via getStatus(). */
function switchBotDevice(status: any) {
  return {
    id: 'B0E9FED044E3',
    name: 'Meter Pro CO2 Monitor',
    deviceType: 'MeterPro(CO2)',
    mac: 'b0:e9:fe:d0:44:e3',
    getStatus: async () => status,
  }
}

const STATUS = { deviceId: 'B0E9FED044E3', temperature: 23.7, humidity: 59, battery: 100, connectionType: 'api' }

function deviceWith(client: any) {
  return new GenericDevice({ id: 'B0E9FED044E3', type: 'meter', name: 'Meter', log }, { log, _client: client } as any)
}

describe('genericDevice.getState', () => {
  it('returns the status rather than the device instance', async () => {
    const state = await deviceWith({ getDevice: async () => switchBotDevice(STATUS) }).getState()

    expect(state).toEqual(STATUS)
    expect(state.temperature).toBe(23.7)
    expect(state.humidity).toBe(59)
  })

  it('passes through a plain status object unchanged', async () => {
    const state = await deviceWith({ getDevice: async () => ({ temperature: 20, humidity: 40 }) }).getState()

    expect(state).toEqual({ temperature: 20, humidity: 40 })
  })

  it('unwraps an API-shaped body', async () => {
    const state = await deviceWith({ getDevice: async () => ({ body: { temperature: 19 } }) }).getState()

    expect(state).toEqual({ temperature: 19 })
  })

  it.each([
    ['throws', async () => { throw new Error('unreachable') }],
    ['returns null', async () => null],
  ])('reports minimal info when getStatus() %s', async (_label, getStatus) => {
    const client = { getDevice: async () => ({ ...switchBotDevice(STATUS), getStatus }) }

    const state = await deviceWith(client).getState()

    // Not the device instance: that would look like a reading of every field.
    expect(state).toEqual({ id: 'B0E9FED044E3', type: 'meter' })
    expect(state.temperature).toBeUndefined()
  })
})

describe('createDevice', () => {
  it('does not replace the device getState with the raw client device', async () => {
    const client = { init: async () => {}, getDevice: async () => switchBotDevice(STATUS) }
    const created: any = await createDevice(
      { id: 'B0E9FED044E3', type: 'meter', name: 'Meter', log } as any,
      { log, _client: client } as any,
      false,
    )

    const state = await created.instance.getState()

    expect(state.temperature).toBe(23.7)
    expect(state.getStatus).toBeUndefined()
  })

  it('lets a meter report a real temperature end to end', async () => {
    const client = { init: async () => {}, getDevice: async () => switchBotDevice(STATUS) }
    const device = new MeterDevice({ id: 'B0E9FED044E3', type: 'meter', name: 'Meter', log } as any, { log, _client: client } as any)

    const services = device.createHAPAccessory(null).services
    const temperature = services.find((s: any) => s.type === 'TemperatureSensor')

    await expect(temperature.characteristics.CurrentTemperature.get()).resolves.toBe(23.7)
  })
})
