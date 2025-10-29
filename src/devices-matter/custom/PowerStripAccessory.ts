/**
 * Power Strip Accessory Class
 *
 * This demonstrates a composed device with multiple independent endpoints (parts).
 * Each outlet appears as a separate device in the Home app and can be controlled independently.
 *
 * This uses the Homebridge Matter API's `parts` feature to create true multi-endpoint
 * composed devices, where each part has its own Matter endpoint.
 */

import type { API, Logger } from 'homebridge'

import { BaseMatterAccessory } from '../BaseMatterAccessory.js'

export class PowerStripAccessory extends BaseMatterAccessory {
  constructor(api: API, log: Logger) {
    const serialNumber = 'POWER-STRIP-001'

    super(api, log, {
      uuid: api.matter.uuid.generate(serialNumber),
      displayName: 'Power Strip',
      deviceType: api.matter.deviceTypes.OnOffOutlet,
      serialNumber,
      manufacturer: 'Homebridge Matter',
      model: 'HB-MATTER-POWER-STRIP-4X',
      firmwareRevision: '2.0.0',
      hardwareRevision: '1.0.0',

      // Main accessory can optionally have its own clusters/handlers
      // Here we'll just use it as a container for the 4 outlet parts
      clusters: {
        onOff: {
          onOff: false, // Master control
        },
      },

      handlers: {
        onOff: {
          on: async () => this.handleMasterOn(),
          off: async () => this.handleMasterOff(),
        },
      },

      // Define 4 independent outlet parts
      // Each part appears as a separate device in the Home app
      parts: [
        {
          id: 'outlet-1',
          displayName: 'Outlet 1',
          deviceType: api.matter.deviceTypes.OnOffOutlet,
          clusters: {
            onOff: { onOff: false },
          },
          handlers: {
            onOff: {
              on: async (_args, context) => this.handleOutletOn(context?.partId || 'outlet-1'),
              off: async (_args, context) => this.handleOutletOff(context?.partId || 'outlet-1'),
            },
          },
        },
        {
          id: 'outlet-2',
          displayName: 'Outlet 2',
          deviceType: api.matter.deviceTypes.OnOffOutlet,
          clusters: {
            onOff: { onOff: false },
          },
          handlers: {
            onOff: {
              on: async (_args, context) => this.handleOutletOn(context?.partId || 'outlet-2'),
              off: async (_args, context) => this.handleOutletOff(context?.partId || 'outlet-2'),
            },
          },
        },
        {
          id: 'outlet-3',
          displayName: 'Outlet 3',
          deviceType: api.matter.deviceTypes.OnOffOutlet,
          clusters: {
            onOff: { onOff: false },
          },
          handlers: {
            onOff: {
              on: async (_args, context) => this.handleOutletOn(context?.partId || 'outlet-3'),
              off: async (_args, context) => this.handleOutletOff(context?.partId || 'outlet-3'),
            },
          },
        },
        {
          id: 'outlet-4',
          displayName: 'Outlet 4',
          deviceType: api.matter.deviceTypes.OnOffOutlet,
          clusters: {
            onOff: { onOff: false },
          },
          handlers: {
            onOff: {
              on: async (_args, context) => this.handleOutletOn(context?.partId || 'outlet-4'),
              off: async (_args, context) => this.handleOutletOff(context?.partId || 'outlet-4'),
            },
          },
        },
      ],
    })

    this.logInfo('initialized with 4 independent outlet endpoints.')
  }

  /**
   * Handler for individual outlet ON command
   * Called when a specific outlet is turned on from the Home app
   */
  private async handleOutletOn(partId: string): Promise<void> {
    const outletNumber = this.getOutletNumber(partId)
    this.logInfo(`Outlet ${outletNumber} turned ON`)

    // TODO: Send command to actual power strip hardware
    // await myPowerStripAPI.turnOnOutlet(outletNumber)
  }

  /**
   * Handler for individual outlet OFF command
   * Called when a specific outlet is turned off from the Home app
   */
  private async handleOutletOff(partId: string): Promise<void> {
    const outletNumber = this.getOutletNumber(partId)
    this.logInfo(`Outlet ${outletNumber} turned OFF`)

    // TODO: Send command to actual power strip hardware
    // await myPowerStripAPI.turnOffOutlet(outletNumber)
  }

  /**
   * Master ON - Turns on all outlets
   */
  private async handleMasterOn(): Promise<void> {
    this.logInfo('Master ON - turning on all outlets.')

    // Update each outlet's state
    for (let i = 1; i <= 4; i++) {
      const partId = `outlet-${i}`
      this.updateState(this.api.matter.clusterNames.OnOff, { onOff: true }, partId)
    }

    // TODO: Send command to actual power strip hardware
    // await myPowerStripAPI.turnOnAllOutlets()
  }

  /**
   * Master OFF - Turns off all outlets
   */
  private async handleMasterOff(): Promise<void> {
    this.logInfo('Master OFF - turning off all outlets.')

    // Update each outlet's state
    for (let i = 1; i <= 4; i++) {
      const partId = `outlet-${i}`
      this.updateState(this.api.matter.clusterNames.OnOff, { onOff: false }, partId)
    }

    // TODO: Send command to actual power strip hardware
    // await myPowerStripAPI.turnOffAllOutlets()
  }

  /**
   * Extract outlet number from part ID
   */
  private getOutletNumber(partId: string): number {
    const match = partId.match(/outlet-(\d+)/)
    return match ? Number.parseInt(match[1], 10) : 0
  }

  /**
   * Turn on a specific outlet programmatically
   * Use this to update outlet state from external sources (API, webhooks, etc.)
   *
   * @param outletNumber - Outlet number (1-4)
   */
  public async turnOnOutlet(outletNumber: 1 | 2 | 3 | 4): Promise<void> {
    const partId = `outlet-${outletNumber}`
    this.logInfo(`Programmatically turning ON outlet ${outletNumber}`)

    // Update the specific outlet's state
    this.updateState(this.api.matter.clusterNames.OnOff, { onOff: true }, partId)

    // TODO: Send command to actual power strip hardware
    // await myPowerStripAPI.turnOnOutlet(outletNumber)
  }

  /**
   * Turn off a specific outlet programmatically
   * Use this to update outlet state from external sources (API, webhooks, etc.)
   *
   * @param outletNumber - Outlet number (1-4)
   */
  public async turnOffOutlet(outletNumber: 1 | 2 | 3 | 4): Promise<void> {
    const partId = `outlet-${outletNumber}`
    this.logInfo(`Programmatically turning OFF outlet ${outletNumber}`)

    // Update the specific outlet's state
    this.updateState(this.api.matter.clusterNames.OnOff, { onOff: false }, partId)

    // TODO: Send command to actual power strip hardware
    // await myPowerStripAPI.turnOffOutlet(outletNumber)
  }

  /**
   * Toggle a specific outlet
   *
   * @param outletNumber - Outlet number (1-4)
   */
  public async toggleOutlet(outletNumber: 1 | 2 | 3 | 4): Promise<void> {
    const currentState = await this.getOutletState(outletNumber)

    if (currentState) {
      await this.turnOffOutlet(outletNumber)
    } else {
      await this.turnOnOutlet(outletNumber)
    }
  }

  /**
   * Get the current state of a specific outlet
   *
   * @param outletNumber - Outlet number (1-4)
   * @returns Current on/off state of the outlet
   */
  public async getOutletState(outletNumber: 1 | 2 | 3 | 4): Promise<boolean> {
    const partId = `outlet-${outletNumber}`

    // Get the state from the Matter server
    const state = await this.api.matter.getAccessoryState(
      this.uuid,
      this.api.matter.clusterNames.OnOff,
      partId,
    )

    return state?.onOff === true
  }

  /**
   * Get the state of all outlets
   *
   * @returns Object containing state of all outlets
   */
  public async getAllOutletStates(): Promise<Record<string, boolean>> {
    return {
      outlet1: await this.getOutletState(1),
      outlet2: await this.getOutletState(2),
      outlet3: await this.getOutletState(3),
      outlet4: await this.getOutletState(4),
    }
  }

  /**
   * Update the state of a specific outlet from external source
   * (e.g., when outlet state changes via physical button or other controller)
   *
   * @param outletNumber - Outlet number (1-4)
   * @param isOn - New state of the outlet
   */
  public updateOutletStateFromExternal(outletNumber: 1 | 2 | 3 | 4, isOn: boolean): void {
    const partId = `outlet-${outletNumber}`
    this.logInfo(`Outlet ${outletNumber} state updated from external source: ${isOn ? 'ON' : 'OFF'}`)

    // Update the specific outlet's state
    this.updateState(this.api.matter.clusterNames.OnOff, { onOff: isOn }, partId)
  }

  /**
   * Update all outlet states from external source
   *
   * @param states - Object containing new states for all outlets
   * @param states.outlet1 - State for outlet 1
   * @param states.outlet2 - State for outlet 2
   * @param states.outlet3 - State for outlet 3
   * @param states.outlet4 - State for outlet 4
   */
  public updateAllOutletStatesFromExternal(states: {
    outlet1: boolean
    outlet2: boolean
    outlet3: boolean
    outlet4: boolean
  }): void {
    this.logInfo('All outlet states updated from external source.')

    for (let i = 1; i <= 4; i++) {
      const key = `outlet${i}` as keyof typeof states
      const partId = `outlet-${i}`

      this.updateState(this.api.matter.clusterNames.OnOff, { onOff: states[key] }, partId)
    }
  }

  /**
   * Override updateState to support partId parameter
   */
  protected async updateState(cluster: string, attributes: Record<string, unknown>, partId?: string): Promise<void> {
    if (partId) {
      // Update a specific part
      await this.api.matter.updateAccessoryState(this.uuid, cluster, attributes, partId)
      this.logDebug(`Updated ${cluster} state for part ${partId}:`, attributes)
    } else {
      // Update main accessory
      await this.api.matter.updateAccessoryState(this.uuid, cluster, attributes)
      this.logDebug(`Updated ${cluster} state:`, attributes)
    }
  }
}
