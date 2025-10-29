/**
 * Smoke/CO Alarm Accessory Class
 */

import type { API, Logger } from 'homebridge'

import { BaseMatterAccessory } from './BaseMatterAccessory.js'

export class SmokeCOAlarmAccessory extends BaseMatterAccessory {
  constructor(api: API, log: Logger) {
    const serialNumber = 'SENSOR-006'
    const SmokeCoAlarmServer = api.matter.deviceTypes.SmokeSensor.requirements.SmokeCoAlarmServer
    const SmokeSensorWithBoth = api.matter.deviceTypes.SmokeSensor.with(
      SmokeCoAlarmServer.with('SmokeAlarm', 'CoAlarm'),
    )

    super(api, log, {
      uuid: api.matter.uuid.generate(serialNumber),
      displayName: 'Smoke Sensor',
      deviceType: SmokeSensorWithBoth,
      serialNumber,
      manufacturer: 'Homebridge Matter',
      model: 'HB-MATTER-SENSOR-SMOKE-CO',
      firmwareRevision: '2.0.0',
      hardwareRevision: '1.0.0',

      clusters: {
        smokeCoAlarm: {
          smokeState: 0, // 0 = normal, 1 = warning, 2 = critical
          coState: 0,
          batteryAlert: 0,
          deviceMuted: 0,
          testInProgress: false,
          hardwareFaultAlert: false,
          endOfServiceAlert: 0,
          interconnectSmokeAlarm: 0,
          interconnectCoAlarm: 0,
          contaminationState: 0,
          smokeSensitivityLevel: 1,
          expressedState: 0,
        },
      },
    })

    this.logInfo('initialized.')
  }

  public updateSmokeState(state: 0 | 1 | 2): void {
    this.updateState('smokeCoAlarm', { smokeState: state })
    const stateStr = ['Normal', 'Warning', 'Critical'][state]
    this.logInfo(`smoke state: ${stateStr}.`)
  }

  public updateCOState(state: 0 | 1 | 2): void {
    this.updateState('smokeCoAlarm', { coState: state })
    const stateStr = ['Normal', 'Warning', 'Critical'][state]
    this.logInfo(`co state: ${stateStr}.`)
  }
}
