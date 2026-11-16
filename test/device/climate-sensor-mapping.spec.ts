import { describe, expect, it, vi } from 'vitest'

import { createDevice } from '../../src/deviceFactory.js'
import { Hub2Device, MeterDevice } from '../../src/devices/genericDevice.js'

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}

describe('HAP climate sensor mapping', () => {
  it.each([
    ['WoIOSensor', MeterDevice, ['TemperatureSensor', 'HumiditySensor', 'Battery']],
    ['woiosensor', MeterDevice, ['TemperatureSensor', 'HumiditySensor', 'Battery']],
    ['Hub 2', Hub2Device, ['TemperatureSensor', 'HumiditySensor']],
    ['hub 2', Hub2Device, ['TemperatureSensor', 'HumiditySensor']],
  ] as const)('exposes sensor services for %s', async (type, DeviceClass, expectedServices) => {
    const created = await createDevice(
      { id: 'sensor', type, deviceType: type, name: 'Sensor', log } as any,
      { log, enableBLE: false, _client: {} } as any,
      false,
    )
    expect(created.instance).toBeInstanceOf(DeviceClass)
    const getState = vi.spyOn(created.instance, 'getState').mockResolvedValue({
      temperature: -4.5,
      humidity: 61,
      battery: 75,
    })

    try {
      const descriptor = created.createAccessory(null) as any
      expect(descriptor.services.map((service: any) => service.type)).toEqual(expectedServices)
      const temperature = descriptor.services.find((service: any) => service.type === 'TemperatureSensor')
      const humidity = descriptor.services.find((service: any) => service.type === 'HumiditySensor')
      await expect(temperature.characteristics.CurrentTemperature.get()).resolves.toBe(-4.5)
      await expect(humidity.characteristics.CurrentRelativeHumidity.get()).resolves.toBe(61)
      for (const service of descriptor.services) {
        for (const characteristic of Object.values(service.characteristics) as any[]) {
          expect(characteristic.set).toBeUndefined()
        }
      }
      const battery = descriptor.services.find((service: any) => service.type === 'Battery')
      if (battery) {
        await expect(battery.characteristics.BatteryLevel.get()).resolves.toBe(75)
      }
    }
    finally {
      getState.mockRestore()
      await created.instance.destroy()
    }
  })
})
