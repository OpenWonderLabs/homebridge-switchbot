/**
 * Fan Accessory Class
 */

import type { API, Logger, MatterRequests } from 'homebridge'

import { BaseMatterAccessory } from './BaseMatterAccessory.js'

export class FanAccessory extends BaseMatterAccessory {
  constructor(api: API, log: Logger, opts?: Partial<import('./BaseMatterAccessory').BaseMatterAccessoryConfig & { deviceId?: string }>) {
    const serialNumber = opts?.serialNumber ?? 'FAN-001'
    const displayName = opts?.displayName ?? 'Fan'
    const manufacturer = opts?.manufacturer ?? 'Homebridge Matter'
    const model = opts?.model ?? 'HB-MATTER-FAN'
    const firmwareRevision = opts?.firmwareRevision ?? '2.0.0'
    const hardwareRevision = opts?.hardwareRevision ?? '1.0.0'

    const clusters = opts?.clusters ?? {
      fanControl: {
        fanMode: api.matter.types.FanControl.FanMode.Off,
        fanModeSequence: api.matter.types.FanControl.FanModeSequence.OffLowMedHigh,
        percentSetting: 0,
        percentCurrent: 0,
      },
    }

    const handlers = opts?.handlers ?? {
      fanControl: {
        step: async (request: MatterRequests.FanStep) => this.handleStep(request),
        fanModeChange: async (request: { fanMode: number, oldFanMode: number }) => this.handleFanModeChange(request),
        percentSettingChange: async (request: { percentSetting: number | null, oldPercentSetting: number | null }) => this.handlePercentSettingChange(request),
      },
    }

    super(api, log, {
      uuid: opts?.uuid ?? api.matter.uuid.generate(serialNumber),
      displayName,
      deviceType: api.matter.deviceTypes.Fan,
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

  private async handleStep(request: MatterRequests.FanStep): Promise<void> {
    this.logInfo(`FanStep request: ${JSON.stringify(request)}`)
    const { direction, wrap, lowestOff } = request
    const dirStr = direction === 0 ? 'increase' : 'decrease'
    this.logInfo(`step ${dirStr} (wrap: ${wrap}, lowestoff: ${lowestOff}).`)
    // TODO: await myFanAPI.step(direction, wrap, lowestOff)
  }

  private async handleFanModeChange(request: { fanMode: number, oldFanMode: number }): Promise<void> {
    this.logInfo(`FanMode change: ${JSON.stringify(request)}`)
    const modeNames = ['Off', 'Low', 'Medium', 'High', 'On', 'Auto', 'Smart']
    const modeName = modeNames[request.fanMode] || `Unknown (${request.fanMode})`
    this.logInfo(`fan mode changed to: ${modeName}.`)
    // TODO: await myFanAPI.setMode(request.fanMode)
  }

  private async handlePercentSettingChange(request: { percentSetting: number | null, oldPercentSetting: number | null }): Promise<void> {
    this.logInfo(`PercentSetting change: ${JSON.stringify(request)}`)
    const percent = request.percentSetting ?? 0
    const isOff = percent === 0
    const wasOff = (request.oldPercentSetting ?? 0) === 0

    if (isOff !== wasOff) {
      this.logInfo(`fan turned ${isOff ? 'off' : 'on'}.`)
    }

    if (!isOff) {
      this.logInfo(`fan speed changed to: ${percent}%.`)
    }
    // TODO: await myFanAPI.setSpeed(percent)
  }

  public updateFanMode(mode: number): void {
    this.updateState(this.api.matter.clusterNames.FanControl, { fanMode: mode })
  }

  public updateFanSpeed(percent: number): void {
    this.updateState(this.api.matter.clusterNames.FanControl, {
      percentSetting: percent,
      percentCurrent: percent,
    })
    this.logInfo(`fan speed: ${percent}%.`)
  }
}
