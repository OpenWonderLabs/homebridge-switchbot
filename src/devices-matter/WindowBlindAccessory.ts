/**
 * Window Blind Accessory Class
 * Lift control only (up/down)
 */

import type { API, Logger, MatterRequests } from 'homebridge'

import { BaseMatterAccessory } from './BaseMatterAccessory.js'

export class WindowBlindAccessory extends BaseMatterAccessory {
  constructor(api: API, log: Logger, opts?: Partial<import('./BaseMatterAccessory').BaseMatterAccessoryConfig & { deviceId?: string }>) {
    const serialNumber = opts?.serialNumber ?? 'BLIND-001'

    const clusters = opts?.clusters ?? {
      windowCovering: {
        targetPositionLiftPercent100ths: 5000,
        currentPositionLiftPercent100ths: 5000,
        operationalStatus: { global: 0, lift: 0, tilt: 0 },
        endProductType: 0,
        configStatus: {
          operational: true,
          onlineReserved: true,
          liftMovementReversed: false,
          liftPositionAware: true,
          tiltPositionAware: false,
          liftEncoderControlled: true,
          tiltEncoderControlled: false,
        },
      },
    }

    const handlers = opts?.handlers ?? {
      windowCovering: {
        goToLiftPercentage: async (request: MatterRequests.GoToLiftPercentage) => this.handleGoToLift(request),
        upOrOpen: async () => this.handleUpOrOpen(),
        downOrClose: async () => this.handleDownOrClose(),
        stopMotion: async () => this.handleStop(),
      },
    }

    super(api, log, {
      uuid: opts?.uuid ?? api.matter.uuid.generate(serialNumber),
      displayName: opts?.displayName ?? 'Window Blind',
      deviceType: api.matter.deviceTypes.WindowCovering,
      serialNumber,
      manufacturer: opts?.manufacturer ?? 'Homebridge Matter',
      model: opts?.model ?? 'HB-MATTER-BLIND-WINDOW',
      firmwareRevision: opts?.firmwareRevision ?? '2.0.0',
      hardwareRevision: opts?.hardwareRevision ?? '1.0.0',
      clusters,
      handlers,
      context: { deviceId: opts?.deviceId, ...(opts?.context ?? {}) },
    })

    this.logInfo('initialized.')
  }

  private async handleGoToLift(request: MatterRequests.GoToLiftPercentage): Promise<void> {
    this.logInfo(`GoToLiftPercentage request: ${JSON.stringify(request)}`)
    // Matter uses 0=open, 10000=closed, so invert to get open percentage
    const closedPercent = request.liftPercent100thsValue / 100
    const openPercent = (100 - closedPercent).toFixed(0)
    this.logInfo(`moved to ${openPercent}% open.`)
    // TODO: await myBlindAPI.setPosition(openPercent)
  }

  private async handleUpOrOpen(): Promise<void> {
    this.logInfo('opened blind.')
    // TODO: await myBlindAPI.open()
  }

  private async handleDownOrClose(): Promise<void> {
    this.logInfo('closed blind.')
    // TODO: await myBlindAPI.close()
  }

  private async handleStop(): Promise<void> {
    this.logInfo('stopped blind.')
    // TODO: await myBlindAPI.stop()
  }

  public updateLiftPosition(openPercent: number): void {
    // Convert open percentage to Matter's closed percentage (0=open, 10000=closed)
    const closedPercent = 100 - openPercent
    const value = Math.round(closedPercent * 100)
    this.updateState(this.api.matter.clusterNames.WindowCovering, {
      currentPositionLiftPercent100ths: value,
      targetPositionLiftPercent100ths: value,
    })
    this.logInfo(`lift position: ${openPercent}% open.`)
  }
}
