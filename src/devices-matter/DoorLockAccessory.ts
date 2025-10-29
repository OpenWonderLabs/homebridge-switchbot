/**
 * Door Lock Accessory Class
 */

import type { API, Logger } from 'homebridge'

import { BaseMatterAccessory } from './BaseMatterAccessory.js'

export class DoorLockAccessory extends BaseMatterAccessory {
  constructor(api: API, log: Logger, opts?: Partial<import('./BaseMatterAccessory').BaseMatterAccessoryConfig & { deviceId?: string }>) {
    const serialNumber = opts?.serialNumber ?? 'LOCK-001'
    const displayName = opts?.displayName ?? 'Door Lock'
    const manufacturer = opts?.manufacturer ?? 'Homebridge Matter'
    const model = opts?.model ?? 'HB-MATTER-LOCK-DOOR'
    const firmwareRevision = opts?.firmwareRevision ?? '2.0.0'
    const hardwareRevision = opts?.hardwareRevision ?? '1.0.0'

    const clusters = opts?.clusters ?? {
      doorLock: {
        lockState: api.matter.types.DoorLock.LockState.Unlocked,
        lockType: api.matter.types.DoorLock.LockType.DeadBolt,
        actuatorEnabled: true,
        operatingMode: api.matter.types.DoorLock.OperatingMode.Normal,
      },
    }

    const handlers = opts?.handlers ?? { doorLock: { lockDoor: async () => this.handleLock(), unlockDoor: async () => this.handleUnlock() } }

    super(api, log, {
      uuid: opts?.uuid ?? api.matter.uuid.generate(serialNumber),
      displayName,
      deviceType: api.matter.deviceTypes.DoorLock,
      serialNumber,
      manufacturer,
      model,
      firmwareRevision,
      hardwareRevision,
      clusters,
      handlers,
      context: { deviceId: opts?.deviceId, ...(opts?.context ?? {}) },
    })

    this.logInfo('initialized.')
  }

  private async handleLock(): Promise<void> {
    this.logInfo('locked.')
  }

  private async handleUnlock(): Promise<void> {
    this.logInfo('unlocked.')
  }

  public updateLockState(state: 0 | 1 | 2): void {
    // 0 = Not fully locked, 1 = Locked, 2 = Unlocked
    this.updateState('doorLock', { lockState: state })
    const stateStr = ['Not Fully Locked', 'Locked', 'Unlocked'][state]
    this.logInfo(`lock state: ${stateStr}.`)
  }
}
