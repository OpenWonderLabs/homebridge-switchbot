/* Copyright(C) 2021-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * meter-battery.spec.ts: meters expose a Battery service
 */

import { WoSensorTHProCO2 } from 'node-switchbot'
import { describe, expect, it, vi } from 'vitest'

import { createDevice } from '../../src/deviceFactory.js'
import { MeterDevice } from '../../src/devices/genericDevice.js'

const log: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), success: vi.fn() }

class HapStatusError extends Error {
  constructor(public hapStatus: number) {
    super(`HAP status ${hapStatus}`)
  }
}
const api: any = { hap: { HapStatusError, HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402 } } }

function battery(status: Record<string, unknown>, deviceType = 'Meter') {
  const device = new MeterDevice({ id: 'B0E9FED044E3', type: 'meter', deviceType, name: 'Meter', log } as any, { log } as any)
  vi.spyOn(device, 'getState').mockResolvedValue(status)
  const service = device.createHAPAccessory(api).services.find((s: any) => s.type === 'Battery')
  return service.characteristics
}

describe('meterDevice Battery service', () => {
  it.each(['Meter', 'Meter Plus', 'MeterPro', 'MeterPro(CO2)'])('is added for %s', (deviceType) => {
    const device = new MeterDevice({ id: 'x', type: 'meter', deviceType, name: 'M', log } as any, { log } as any)

    expect(device.createHAPAccessory(api).services.map((s: any) => s.type)).toContain('Battery')
  })

  it('reports the battery level', async () => {
    await expect(battery({ battery: 100 }).BatteryLevel.get()).resolves.toBe(100)
    await expect(battery({ battery: 42 }).BatteryLevel.get()).resolves.toBe(42)
  })

  it('keeps the level within 0 to 100', async () => {
    await expect(battery({ battery: 140 }).BatteryLevel.get()).resolves.toBe(100)
    await expect(battery({ battery: -5 }).BatteryLevel.get()).resolves.toBe(0)
  })

  // Same threshold as the water detector.
  it.each([[100, 0], [20, 0], [19, 1], [0, 1]])('maps %i%% to low battery %i', async (level, expected) => {
    await expect(battery({ battery: level }).StatusLowBattery.get()).resolves.toBe(expected)
  })

  it('reports the battery as not chargeable', async () => {
    await expect(battery({ battery: 80 }).ChargingState.get()).resolves.toBe(2)
  })

  // An unknown level must not become a number: 0% would raise a low battery
  // alert, and 100% would hide a real one.
  it.each([
    ['missing', {}],
    ['null', { battery: null }],
    ['text', { battery: 'full' }],
    ['unreadable device', { id: 'x', type: 'meter', unreadable: true }],
  ])('reports Not Available when the level is %s', async (_label, status) => {
    const chars = battery(status)

    await expect(chars.BatteryLevel.get()).rejects.toBeInstanceOf(HapStatusError)
    await expect(chars.StatusLowBattery.get()).rejects.toBeInstanceOf(HapStatusError)
  })

  it('reports the level end to end through node-switchbot', async () => {
    const apiBody = { version: 'V1.8', temperature: 22.7, battery: 100, humidity: 55, CO2: 483, deviceId: 'B0E9FED044E3', deviceType: 'MeterPro(CO2)', hubDeviceId: '000000000000' }
    const switchBotDevice = new WoSensorTHProCO2(
      { id: 'B0E9FED044E3', name: 'Meter Pro CO2 Monitor', deviceType: 'MeterPro(CO2)', connectionTypes: ['api'] } as any,
      { apiClient: { getStatus: async () => apiBody } } as any,
    )
    const created: any = await createDevice(
      { id: 'B0E9FED044E3', type: 'meter', deviceType: 'MeterPro(CO2)', name: 'Meter Pro CO2 Monitor', log } as any,
      { log, _client: { init: async () => {}, getDevice: async () => switchBotDevice } } as any,
      false,
    )
    const service = created.createAccessory(api).services.find((s: any) => s.type === 'Battery')

    await expect(service.characteristics.BatteryLevel.get()).resolves.toBe(100)
    await expect(service.characteristics.StatusLowBattery.get()).resolves.toBe(0)
  })
})
