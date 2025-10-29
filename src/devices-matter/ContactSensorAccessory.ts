/**
 * Contact Sensor Accessory Class
 */

import type { API, Logger } from 'homebridge'

import { BaseMatterAccessory } from './BaseMatterAccessory.js'

export class ContactSensorAccessory extends BaseMatterAccessory {
  constructor(api: API, log: Logger, opts?: Partial<import('./BaseMatterAccessory').BaseMatterAccessoryConfig & { deviceId?: string }>) {
    const serialNumber = opts?.serialNumber ?? 'SENSOR-001'
    const displayName = opts?.displayName ?? 'Contact Sensor'
    const manufacturer = opts?.manufacturer ?? 'Homebridge Matter'
    const model = opts?.model ?? 'HB-MATTER-SENSOR-CONTACT'
    const firmwareRevision = opts?.firmwareRevision ?? '2.0.0'
    const hardwareRevision = opts?.hardwareRevision ?? '1.0.0'

    const clusters = opts?.clusters ?? { booleanState: { stateValue: true } }

    super(api, log, {
      uuid: opts?.uuid ?? api.matter.uuid.generate(serialNumber),
      displayName,
      deviceType: api.matter.deviceTypes.ContactSensor,
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

  public updateContactState(isOpen: boolean): void {
    // Matter BooleanState: false = open/triggered, true = closed/normal (inverted!)
    this.updateState(this.api.matter.clusterNames.BooleanState, { stateValue: !isOpen })
    this.logInfo(`contact state: ${isOpen ? 'OPEN' : 'CLOSED'}.`)
  }
}
