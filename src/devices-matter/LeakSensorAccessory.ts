/**
 * Leak Sensor Accessory Class
 */

import type { API, Logger } from 'homebridge'

import { BaseMatterAccessory } from './BaseMatterAccessory.js'

export class LeakSensorAccessory extends BaseMatterAccessory {
  constructor(api: API, log: Logger, opts?: Partial<import('./BaseMatterAccessory').BaseMatterAccessoryConfig & { deviceId?: string }>) {
    const serialNumber = opts?.serialNumber ?? 'SENSOR-007'
    const displayName = opts?.displayName ?? 'Leak Sensor'
    const manufacturer = opts?.manufacturer ?? 'Homebridge Matter'
    const model = opts?.model ?? 'HB-MATTER-SENSOR-LEAK'
    const firmwareRevision = opts?.firmwareRevision ?? '2.0.0'
    const hardwareRevision = opts?.hardwareRevision ?? '1.0.0'

    const clusters = opts?.clusters ?? { booleanState: { stateValue: false } }

    super(api, log, {
      uuid: opts?.uuid ?? api.matter.uuid.generate(serialNumber),
      displayName,
      deviceType: api.matter.deviceTypes.LeakSensor,
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

  public updateLeakState(leakDetected: boolean): void {
    this.updateState(this.api.matter.clusterNames.BooleanState, { stateValue: leakDetected })
    this.logInfo(`leak: ${leakDetected ? 'detected' : 'none'}.`)
  }
}
