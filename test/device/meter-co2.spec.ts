/* Copyright(C) 2021-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * meter-co2.spec.ts: the Meter Pro (CO2) exposes a CarbonDioxideSensor service
 */

import { WoSensorTHProCO2 } from 'node-switchbot'
import { describe, expect, it, vi } from 'vitest'

import { createDevice } from '../../src/deviceFactory.js'
import { MeterDevice } from '../../src/devices/genericDevice.js'

const log: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), success: vi.fn() }

function meter(deviceType: string | undefined, status: Record<string, unknown>, cfg: Record<string, unknown> = {}) {
  const device = new MeterDevice({ id: 'B0E9FED044E3', type: 'meter', deviceType, name: 'Meter', log } as any, { log, ...cfg } as any)
  vi.spyOn(device, 'getState').mockResolvedValue(status)
  return device
}

function serviceTypes(device: MeterDevice) {
  return device.createHAPAccessory(null).services.map((s: any) => s.type)
}

function read(device: MeterDevice, type: string, characteristic: string) {
  const service = device.createHAPAccessory(null).services.find((s: any) => s.type === type)
  return service.characteristics[characteristic].get()
}

const READING = { temperature: 22.7, humidity: 55, co2: 483 }

describe('meterDevice CO2 service', () => {
  it.each(['MeterPro(CO2)', 'Meter Pro (CO2)'])('is added for %s', (deviceType) => {
    expect(serviceTypes(meter(deviceType, READING))).toEqual(['TemperatureSensor', 'HumiditySensor', 'CarbonDioxideSensor'])
  })

  it.each(['Meter', 'Meter Plus', 'MeterPro', 'Outdoor Meter', undefined])('is not added for %s', (deviceType) => {
    expect(serviceTypes(meter(deviceType, READING))).toEqual(['TemperatureSensor', 'HumiditySensor'])
  })

  it('reports the CO2 level in ppm', async () => {
    await expect(read(meter('MeterPro(CO2)', READING), 'CarbonDioxideSensor', 'CarbonDioxideLevel')).resolves.toBe(483)
  })

  it('leaves temperature and humidity as they were', async () => {
    const device = meter('MeterPro(CO2)', READING)

    await expect(read(device, 'TemperatureSensor', 'CurrentTemperature')).resolves.toBe(22.7)
    await expect(read(device, 'HumiditySensor', 'CurrentRelativeHumidity')).resolves.toBe(55)
  })
})

describe('meterDevice CO2 detected threshold', () => {
  const detected = (co2: number, cfg: Record<string, unknown> = {}) =>
    read(meter('MeterPro(CO2)', { ...READING, co2 }, cfg), 'CarbonDioxideSensor', 'CarbonDioxideDetected')

  it('defaults to 1000 ppm', async () => {
    await expect(detected(999)).resolves.toBe(0)
    await expect(detected(1000)).resolves.toBe(1)
  })

  it('uses co2AbnormalThreshold when set', async () => {
    await expect(detected(799, { co2AbnormalThreshold: 800 })).resolves.toBe(0)
    await expect(detected(800, { co2AbnormalThreshold: 800 })).resolves.toBe(1)
  })

  it.each([['zero', 0], ['negative', -1], ['text', 'high'], ['missing', undefined]])(
    'falls back to 1000 when the setting is %s',
    async (_label, value) => {
      await expect(detected(999, { co2AbnormalThreshold: value })).resolves.toBe(0)
      await expect(detected(1000, { co2AbnormalThreshold: value })).resolves.toBe(1)
    },
  )
})

// End to end: the plugin's createDevice() with the real node-switchbot class,
// fed the status body a real Meter Pro (CO2) returned from the OpenAPI.
describe('a Meter Pro (CO2) end to end', () => {
  it('reports CO2 to HomeKit through node-switchbot', async () => {
    const apiBody = { version: 'V1.8', temperature: 22.7, battery: 100, humidity: 55, CO2: 483, deviceId: 'B0E9FED044E3', deviceType: 'MeterPro(CO2)', hubDeviceId: '000000000000' }
    const switchBotDevice = new WoSensorTHProCO2(
      { id: 'B0E9FED044E3', name: 'Meter Pro CO2 Monitor', deviceType: 'MeterPro(CO2)', connectionTypes: ['api'] } as any,
      { apiClient: { getStatus: async () => apiBody } } as any,
    )
    const client = { init: async () => {}, getDevice: async () => switchBotDevice }

    const created: any = await createDevice(
      { id: 'B0E9FED044E3', type: 'meter', deviceType: 'MeterPro(CO2)', name: 'Meter Pro CO2 Monitor', log } as any,
      { log, _client: client } as any,
      false,
    )
    const service = created.createAccessory(null).services.find((s: any) => s.type === 'CarbonDioxideSensor')

    await expect(service.characteristics.CarbonDioxideLevel.get()).resolves.toBe(483)
    await expect(service.characteristics.CarbonDioxideDetected.get()).resolves.toBe(0)
  })
})
