/**
 * Light Sensor Accessory Class
 */

import type { API, Logger } from 'homebridge'

import { BaseMatterAccessory } from './BaseMatterAccessory.js'

export class LightSensorAccessory extends BaseMatterAccessory {
  constructor(api: API, log: Logger, opts?: Partial<import('./BaseMatterAccessory').BaseMatterAccessoryConfig & { deviceId?: string }>) {
    const serialNumber = opts?.serialNumber ?? 'SENSOR-002'
    const displayName = opts?.displayName ?? 'Light Sensor'
    const manufacturer = opts?.manufacturer ?? 'Homebridge Matter'
    const model = opts?.model ?? 'HB-MATTER-SENSOR-LIGHT'
    const firmwareRevision = opts?.firmwareRevision ?? '2.0.0'
    const hardwareRevision = opts?.hardwareRevision ?? '1.0.0'

    const clusters = opts?.clusters ?? { illuminanceMeasurement: { measuredValue: 5000, minMeasuredValue: 1, maxMeasuredValue: 65534 } }

    super(api, log, {
      uuid: opts?.uuid ?? api.matter.uuid.generate(serialNumber),
      displayName,
      deviceType: api.matter.deviceTypes.LightSensor,
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

  public updateIlluminance(lux: number): void {
    const value = Math.round(10000 * Math.log10(lux))
    this.updateState('illuminanceMeasurement', { measuredValue: value })
    this.logInfo(`illuminance: ${lux} lux.`)
  }
}
