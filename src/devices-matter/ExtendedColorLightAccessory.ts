/**
 * Extended Color Light Accessory Class (HS+CCT)
 * Hue, Saturation, and Color Temperature control
 */

import type { API, Logger, MatterRequests } from 'homebridge'

import { hs2rgb } from '../utils.js'
import { BaseMatterAccessory } from './BaseMatterAccessory.js'

export class ExtendedColorLightAccessory extends BaseMatterAccessory {
  constructor(api: API, log: Logger, opts?: Partial<import('./BaseMatterAccessory').BaseMatterAccessoryConfig & { deviceId?: string }>) {
    const serialNumber = opts?.serialNumber ?? 'LIGHT-005'
    const displayName = opts?.displayName ?? 'Extended Colour Light (HS+CCT)'
    const manufacturer = opts?.manufacturer ?? 'Homebridge Matter'
    const model = opts?.model ?? 'HB-MATTER-LIGHT-EXTENDED-COLOUR'
    const firmwareRevision = opts?.firmwareRevision ?? '2.0.0'
    const hardwareRevision = opts?.hardwareRevision ?? '1.0.0'

    const clusters = opts?.clusters ?? {
      onOff: { onOff: false },
      levelControl: { currentLevel: 127, minLevel: 1, maxLevel: 254 },
      colorControl: {
        colorMode: api.matter.types.ColorControl.ColorMode.CurrentHueAndCurrentSaturation,
        currentHue: 0,
        currentSaturation: 254,
        currentX: 41942,
        currentY: 21626,
        colorTemperatureMireds: 250,
        colorTempPhysicalMinMireds: 147,
        colorTempPhysicalMaxMireds: 454,
        coupleColorTempToLevelMinMireds: 147,
      },
    }

    const handlers = opts?.handlers ?? {
      onOff: { on: async () => this.handleOn(), off: async () => this.handleOff() },
      levelControl: { moveToLevelWithOnOff: async (request: MatterRequests.MoveToLevel) => this.handleSetLevel(request) },
      colorControl: {
        moveToColorLogic: async (request: MatterRequests.MoveToColor) => this.handleSetColor(request),
        moveToHueAndSaturationLogic: async (request: MatterRequests.MoveToHueAndSaturation) => this.handleSetHueSaturation(request),
        moveToColorTemperatureLogic: async (request: MatterRequests.MoveToColorTemperature) => this.handleSetColorTemperature(request),
      },
    }

    super(api, log, {
      uuid: opts?.uuid ?? api.matter.uuid.generate(serialNumber),
      displayName,
      deviceType: api.matter.deviceTypes.ExtendedColorLight,
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

  private async handleSetColor(request: MatterRequests.MoveToColor): Promise<void> {
    this.logInfo(`MoveToColor request: ${JSON.stringify(request)}`)
    const { colorX, colorY } = request
    const hueApprox = Math.round((colorX / 65535) * 360)
    const satApprox = Math.round((colorY / 65535) * 100)
    const [r, g, b] = hs2rgb(hueApprox, satApprox)
    await this.sendSetColor(r, g, b)
  }

  private async handleSetHueSaturation(request: MatterRequests.MoveToHueAndSaturation): Promise<void> {
    this.logInfo(`MoveToHueAndSaturation request: ${JSON.stringify(request)}`)
    const { hue, saturation } = request
    const hueDegrees = Math.round((hue / 254) * 360)
    const saturationPercent = Math.round((saturation / 254) * 100)
    const [r, g, b] = hs2rgb(hueDegrees, saturationPercent)
    await this.sendSetColor(r, g, b)
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

  public updateHueSaturation(hue: number, saturation: number): void {
    const matterHue = Math.round((hue / 360) * 254)
    const matterSat = Math.round((saturation / 100) * 254)
    this.updateState(this.api.matter.clusterNames.ColorControl, {
      currentHue: matterHue,
      currentSaturation: matterSat,
    })
  }
}
