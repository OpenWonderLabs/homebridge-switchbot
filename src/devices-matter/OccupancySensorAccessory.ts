/**
 * Occupancy Sensor Accessory Class
 */

import type { API, Logger } from 'homebridge'

import { BaseMatterAccessory } from './BaseMatterAccessory.js'

export class OccupancySensorAccessory extends BaseMatterAccessory {
  constructor(api: API, log: Logger, opts?: Partial<import('./BaseMatterAccessory').BaseMatterAccessoryConfig & { deviceId?: string }>) {
    const serialNumber = opts?.serialNumber ?? 'SENSOR-003'
    // Note: Matter.js API calls this "MotionSensor" but it's actually an Occupancy Sensor
    const OccupancySensingServer = api.matter.deviceTypes.MotionSensor.requirements.OccupancySensingServer
    const OccupancySensorWithPIR = api.matter.deviceTypes.MotionSensor.with(
      OccupancySensingServer.with('PassiveInfrared'),
    )

    const clusters = opts?.clusters ?? {
      occupancySensing: {
        occupancy: { occupied: false },
        occupancySensorType: 0,
        occupancySensorTypeBitmap: { pir: true, ultrasonic: false, physicalContact: false },
      },
    }

    super(api, log, {
      uuid: opts?.uuid ?? api.matter.uuid.generate(serialNumber),
      displayName: opts?.displayName ?? 'Occupancy Sensor',
      deviceType: OccupancySensorWithPIR,
      serialNumber,
      manufacturer: opts?.manufacturer ?? 'Homebridge Matter',
      model: opts?.model ?? 'HB-MATTER-SENSOR-OCCUPANCY',
      firmwareRevision: opts?.firmwareRevision ?? '2.0.0',
      hardwareRevision: opts?.hardwareRevision ?? '1.0.0',
      clusters,
      context: { deviceId: opts?.deviceId, ...(opts?.context ?? {}) },
    })

    this.logInfo('initialized.')
  }

  public updateOccupancyDetected(detected: boolean): void {
    this.updateState('occupancySensing', {
      occupancy: { occupied: detected },
    })
    this.logInfo(`occupancy: ${detected ? 'detected' : 'clear'}.`)
  }
}
