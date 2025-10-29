/**
 * Color Temperature Light Accessory Class
 */

import type { API, Logger, MatterRequests } from 'homebridge'

import { BaseMatterAccessory } from './BaseMatterAccessory.js'

export class ColorTemperatureLightAccessory extends BaseMatterAccessory {
  constructor(api: API, log: Logger, opts?: Partial<import('./BaseMatterAccessory').BaseMatterAccessoryConfig & { deviceId?: string }>) {
    const serialNumber = opts?.serialNumber ?? 'LIGHT-003'
    const displayName = opts?.displayName ?? 'Colour Temperature Light'
    const manufacturer = opts?.manufacturer ?? 'Homebridge Matter'
    const model = opts?.model ?? 'HB-MATTER-LIGHT-COLOUR-TEMP'
    const firmwareRevision = opts?.firmwareRevision ?? '2.0.0'
    const hardwareRevision = opts?.hardwareRevision ?? '1.0.0'

    const clusters = opts?.clusters ?? {
      onOff: { onOff: false },
      levelControl: { currentLevel: 127, minLevel: 1, maxLevel: 254 },
      colorControl: {
        colorMode: api.matter.types.ColorControl.ColorMode.ColorTemperatureMireds,
        colorTemperatureMireds: 250,
        colorTempPhysicalMinMireds: 147,
        colorTempPhysicalMaxMireds: 454,
        coupleColorTempToLevelMinMireds: 147,
      },
    }

    const handlers = opts?.handlers ?? {
      onOff: { on: async () => this.handleOn(), off: async () => this.handleOff() },
      levelControl: { moveToLevelWithOnOff: async (request: MatterRequests.MoveToLevel) => this.handleSetLevel(request) },
      colorControl: { moveToColorTemperatureLogic: async (request: MatterRequests.MoveToColorTemperature) => this.handleSetColorTemperature(request) },
    }

    super(api, log, {
      uuid: opts?.uuid ?? api.matter.uuid.generate(serialNumber),
      displayName,
      deviceType: api.matter.deviceTypes.ColorTemperatureLight,
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

  private async handleOn(): Promise<void> {
    this.logInfo('turning on.')
    await this.sendOnCommand()
  }

  private async handleOff(): Promise<void> {
    this.logInfo('turning off.')
    await this.sendOffCommand()
  }

  private async handleSetLevel(request: MatterRequests.MoveToLevel): Promise<void> {
    this.logInfo(`MoveToLevel request: ${JSON.stringify(request)}`)
    const { level } = request
    const brightnessPercent = Math.round((level / 254) * 100)
    await this.sendSetBrightness(brightnessPercent)
  }

  private async handleSetColorTemperature(request: MatterRequests.MoveToColorTemperature): Promise<void> {
    this.logInfo(`MoveToColorTemperature request: ${JSON.stringify(request)}`)
    const { colorTemperatureMireds } = request
    const kelvin = Math.round(1000000 / colorTemperatureMireds)
    await this.sendSetColorTemperature(kelvin)
  }

  public updateOnOffState(isOn: boolean): void {
    this.updateState(this.api.matter.clusterNames.OnOff, { onOff: isOn })
  }

  public updateBrightness(percent: number): void {
    const matterLevel = Math.max(1, Math.round((percent / 100) * 254))
    this.updateState(this.api.matter.clusterNames.LevelControl, { currentLevel: matterLevel })
  }

  public updateColorTemperature(kelvin: number): void {
    const mireds = Math.round(1000000 / kelvin)
    this.updateState(this.api.matter.clusterNames.ColorControl, { colorTemperatureMireds: mireds })
  }
}
