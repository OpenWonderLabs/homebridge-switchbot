/**
 * Humidity Sensor Accessory Class
 */

import type { API, Logger } from 'homebridge'

import { BaseMatterAccessory } from './BaseMatterAccessory.js'

export class HumiditySensorAccessory extends BaseMatterAccessory {
  constructor(api: API, log: Logger, opts?: Partial<import('./BaseMatterAccessory').BaseMatterAccessoryConfig & { deviceId?: string }>) {
    const serialNumber = opts?.serialNumber ?? 'SENSOR-005'
    const displayName = opts?.displayName ?? 'Humidity Sensor'
    const manufacturer = opts?.manufacturer ?? 'Homebridge Matter'
    const model = opts?.model ?? 'HB-MATTER-SENSOR-HUMIDITY'
    const firmwareRevision = opts?.firmwareRevision ?? '2.0.0'
    const hardwareRevision = opts?.hardwareRevision ?? '1.0.0'

    const clusters = opts?.clusters ?? { relativeHumidityMeasurement: { measuredValue: 5500, minMeasuredValue: 0, maxMeasuredValue: 10000 } }

    super(api, log, {
      uuid: opts?.uuid ?? api.matter.uuid.generate(serialNumber),
      displayName,
      deviceType: api.matter.deviceTypes.HumiditySensor,
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

  public updateHumidity(percent: number): void {
    const value = Math.round(percent * 100) // convert to hundredths
    this.updateState('relativeHumidityMeasurement', { measuredValue: value })
    this.logInfo(`humidity: ${percent}%.`)
  }
}
