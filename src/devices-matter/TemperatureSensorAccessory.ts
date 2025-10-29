/**
 * Temperature Sensor Accessory Class
 */

import type { API, Logger } from 'homebridge'

import { BaseMatterAccessory } from './BaseMatterAccessory.js'

export class TemperatureSensorAccessory extends BaseMatterAccessory {
  constructor(api: API, log: Logger, opts?: Partial<import('./BaseMatterAccessory').BaseMatterAccessoryConfig & { deviceId?: string }>) {
    const serialNumber = opts?.serialNumber ?? 'SENSOR-004'
    const displayName = opts?.displayName ?? 'Temperature Sensor'
    const manufacturer = opts?.manufacturer ?? 'Homebridge Matter'
    const model = opts?.model ?? 'HB-MATTER-SENSOR-TEMPERATURE'
    const firmwareRevision = opts?.firmwareRevision ?? '2.0.0'
    const hardwareRevision = opts?.hardwareRevision ?? '1.0.0'

    const clusters = opts?.clusters ?? {
      temperatureMeasurement: { measuredValue: 2100, minMeasuredValue: -5000, maxMeasuredValue: 10000 },
    }

    super(api, log, {
      uuid: opts?.uuid ?? api.matter.uuid.generate(serialNumber),
      displayName,
      deviceType: api.matter.deviceTypes.TemperatureSensor,
      serialNumber,
      manufacturer,
      model,
      firmwareRevision,
      hardwareRevision,
      clusters,
      context: { deviceId: opts?.deviceId, ...(opts?.context ?? {}) },
    })

    this.logInfo('initialized.')
  }

  public updateTemperature(celsius: number): void {
    const value = Math.round(celsius * 100) // convert to hundredths
    this.updateState('temperatureMeasurement', { measuredValue: value })
    this.logInfo(`temperature: ${celsius}°C.`)
  }
}
