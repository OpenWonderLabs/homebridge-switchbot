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

  public async handleGoToLift(request: MatterRequests.GoToLiftPercentage): Promise<void> {
    this.logInfo(`GoToLiftPercentage request: ${JSON.stringify(request)}`)
    // Matter uses 0=open, 10000=closed, so invert to get open percentage
    const closedPercent = request.liftPercent100thsValue / 100
    // SwitchBot API expects position: 0=open, 100=closed
    const position = Math.max(0, Math.min(100, closedPercent))
    // Default to performance mode (ff), index is always 0
    const mode = 'ff' // or '01' for silent mode if needed
    const parameter = `0,${mode},${position}`
    this.logInfo(`Sending setPosition to OpenAPI: parameter=${parameter}`)
    try {
      if (this.context?.sendOpenAPI) {
        await this.sendOpenAPICommand('setPosition', parameter)
        this.logInfo('OpenAPI setPosition command sent.')
      } else {
        this.logWarn('OpenAPI sender not available in context.')
      }
    } catch (e: any) {
      this.logWarn(`OpenAPI setPosition failed: ${String(e?.message ?? e)}`)
    }
  }

  public async handleUpOrOpen(): Promise<void> {
    this.logInfo('opened blind.')
    try {
      // Send open command to SwitchBot OpenAPI
      if (this.context?.sendOpenAPI) {
        await this.sendOpenAPICommand('turnOn')
        this.logInfo('OpenAPI open command sent.')
      } else {
        this.logWarn('OpenAPI sender not available in context.')
      }
    } catch (e: any) {
      this.logWarn(`OpenAPI open failed: ${String(e?.message ?? e)}`)
    }
  }

  public async handleDownOrClose(): Promise<void> {
    this.logInfo('closed blind.')
    try {
      // Send close command to SwitchBot OpenAPI
      if (this.context?.sendOpenAPI) {
        await this.sendOpenAPICommand('turnOff')
        this.logInfo('OpenAPI close command sent.')
      } else {
        this.logWarn('OpenAPI sender not available in context.')
      }
    } catch (e: any) {
      this.logWarn(`OpenAPI close failed: ${String(e?.message ?? e)}`)
    }
  }

  public async handleStop(): Promise<void> {
    this.logInfo('stopped blind.')
    try {
      // Send pause command to SwitchBot OpenAPI
      if (this.context?.sendOpenAPI) {
        await this.sendOpenAPICommand('pause')
        this.logInfo('OpenAPI pause command sent.')
      } else {
        this.logWarn('OpenAPI sender not available in context.')
      }
    } catch (e: any) {
      this.logWarn(`OpenAPI pause failed: ${String(e?.message ?? e)}`)
    }
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
