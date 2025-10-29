/**
 * Dimmable Light Accessory Class
 *
 * Example of a more complex device with multiple clusters.
 * Shows how to handle devices with on/off + level control.
 */

import type { API, Logger, MatterRequests } from 'homebridge'

import { BaseMatterAccessory } from './BaseMatterAccessory.js'

/**
 * Dimmable Light Device Class
 *
 * Demonstrates:
 * - Multiple clusters (OnOff + LevelControl)
 * - Type-safe request handlers
 * - Value conversion (Matter level ↔ percentage)
 * - Custom public methods for external control
 */
export class DimmableLightAccessory extends BaseMatterAccessory {
  // Track current state
  private currentLevel: number = 127 // 50% brightness

  constructor(api: API, log: Logger, opts?: Partial<import('./BaseMatterAccessory').BaseMatterAccessoryConfig & { deviceId?: string }>) {
    const serialNumber = opts?.serialNumber ?? 'LIGHT-002'
    const displayName = opts?.displayName ?? 'Dimmable Light'
    const manufacturer = opts?.manufacturer ?? 'Homebridge Matter'
    const model = opts?.model ?? 'HB-MATTER-LIGHT-DIMMABLE'
    const firmwareRevision = opts?.firmwareRevision ?? '2.0.0'
    const hardwareRevision = opts?.hardwareRevision ?? '1.0.0'

    const clusters = opts?.clusters ?? {
      onOff: { onOff: false },
      levelControl: { currentLevel: 127, minLevel: 1, maxLevel: 254 },
    }

    const handlers = opts?.handlers ?? {
      onOff: {
        on: async () => this.handleOn(),
        off: async () => this.handleOff(),
      },
      levelControl: {
        moveToLevelWithOnOff: async (request: MatterRequests.MoveToLevel) => this.handleSetLevel(request),
      },
    }

    super(api, log, {
      uuid: opts?.uuid ?? api.matter.uuid.generate(serialNumber),
      displayName,
      deviceType: api.matter.deviceTypes.DimmableLight,
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

  /**
   * Handle the "on" command
   */
  private async handleOn(): Promise<void> {
    this.logInfo('turning on.')

    try {
      // Use platform helper (OpenAPI/BLE) when available
      await this.sendOnCommand()

      this.logInfo('physical device turned on (via platform helper).')
    } catch (error) {
      this.logError('failed to turn on:', error)
      throw error
    }
  }

  /**
   * Handle the "off" command
   */
  private async handleOff(): Promise<void> {
    this.logInfo('turning off.')

    try {
      // Use platform helper (OpenAPI/BLE) when available
      await this.sendOffCommand()

      this.logInfo('physical device turned off (via platform helper).')
    } catch (error) {
      this.logError('failed to turn off:', error)
      throw error
    }
  }

  /**
   * Handle brightness level changes
   */
  private async handleSetLevel(request: MatterRequests.MoveToLevel): Promise<void> {
    this.logInfo(`MoveToLevel request: ${JSON.stringify(request)}`)
    const { level, transitionTime } = request

    // Convert Matter level (1-254) to percentage (0-100%)
    const brightnessPercent = Math.round((level / 254) * 100)
    this.currentLevel = level

    this.logInfo(`setting brightness to ${brightnessPercent}% (level: ${level}), transitionTime: ${transitionTime}.`)

    try {
      // Use platform helper (OpenAPI/BLE) when available
      await this.sendSetBrightness(brightnessPercent)

      this.logInfo(`physical device brightness set to ${brightnessPercent}% (via platform helper).`)
    } catch (error) {
      this.logError('Failed to set brightness:', error)
      throw error
    }
  }

  /**
   * Update on/off state from external source
   */
  public updateOnOffState(isOn: boolean): void {
    this.updateState(this.api.matter.clusterNames.OnOff, { onOff: isOn })
    this.logInfo(`state synced: ${isOn ? 'ON' : 'OFF'}.`)
  }

  /**
   * Update brightness level from external source
   * @param percent - Brightness percentage (0-100)
   */
  public updateBrightness(percent: number): void {
    // Validate input
    if (percent < 0 || percent > 100) {
      this.logWarn(`Invalid brightness percentage: ${percent}. Must be 0-100.`)
      return
    }

    // Convert percent to Matter level (1-254)
    const matterLevel = Math.max(1, Math.round((percent / 100) * 254))
    this.currentLevel = matterLevel

    this.updateState(this.api.matter.clusterNames.LevelControl, {
      currentLevel: matterLevel,
    })

    this.logInfo(`brightness synced: ${percent}% (level: ${matterLevel}).`)
  }

  /**
   * Get current brightness as percentage
   */
  public getBrightness(): number {
    return Math.round((this.currentLevel / 254) * 100)
  }

  /**
   * Set brightness and power state together
   * Useful for syncing complete state from external source
   */
  public updateFullState(isOn: boolean, percent: number): void {
    this.updateOnOffState(isOn)
    if (isOn) {
      this.updateBrightness(percent)
    }
  }

  /**
   * Example monitoring setup
   */
  public startMonitoring(): void {
    // Example: MQTT listener
    // mqttClient.on('message', (topic, message) => {
    //   const { state, brightness } = JSON.parse(message.toString())
    //   this.updateFullState(state === 'ON', brightness)
    // })

    // Example: Polling
    // setInterval(async () => {
    //   try {
    //     const response = await fetch('https://api.mydevice.com/light/state')
    //     const data = await response.json()
    //     this.updateFullState(data.power === 'on', data.brightness)
    //   } catch (error) {
    //     this.logError('Polling error:', error)
    //   }
    // }, 5000)
  }
}
