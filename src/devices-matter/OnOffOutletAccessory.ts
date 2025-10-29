/**
 * On/Off Outlet Accessory Class
 */

import type { API, Logger } from 'homebridge'

import { BaseMatterAccessory } from './BaseMatterAccessory.js'

export class OnOffOutletAccessory extends BaseMatterAccessory {
  constructor(api: API, log: Logger, opts?: Partial<import('./BaseMatterAccessory').BaseMatterAccessoryConfig & { deviceId?: string }>) {
    const serialNumber = opts?.serialNumber ?? 'OUTLET-001'
    const displayName = opts?.displayName ?? 'On/Off Outlet'
    const clusters = opts?.clusters ?? { onOff: { onOff: false } }
    const handlers = opts?.handlers ?? {
      onOff: {
        on: async () => this.handleOn(),
        off: async () => this.handleOff(),
      },
    }

    super(api, log, {
      uuid: opts?.uuid ?? api.matter.uuid.generate(serialNumber),
      displayName,
      deviceType: api.matter.deviceTypes.OnOffOutlet,
      serialNumber,
      manufacturer: opts?.manufacturer ?? 'Homebridge Matter',
      model: opts?.model ?? 'HB-MATTER-OUTLET-ON-OFF',
      firmwareRevision: opts?.firmwareRevision ?? '2.0.0',
      hardwareRevision: opts?.hardwareRevision ?? '1.0.0',
      clusters,
      handlers,
      context: { deviceId: opts?.deviceId, ...(opts?.context ?? {}) },
    })

    this.logInfo('initialized.')
  }

  public updateOnOffState(isOn: boolean): void {
    this.updateState(this.api.matter.clusterNames.OnOff, { onOff: isOn })
  }

  private async handleOn(): Promise<void> {
    this.logInfo('turning on.')
    await this.sendOnCommand()
  }

  private async handleOff(): Promise<void> {
    this.logInfo('turning off.')
    await this.sendOffCommand()
  }
}
