/* global NodeJS */

/**
 * Robotic Vacuum Cleaner Accessory Class
 *
 * This is a comprehensive example demonstrating all available features
 * of the RoboticVacuumCleaner device type including:
 * - Multiple run modes (Idle, Cleaning, Mapping)
 * - Multiple clean modes (Vacuum, Mop, Vacuum & Mop, Deep Clean)
 * - Operational state management with realistic transitions
 * - Service area (room) support
 *
 * IMPORTANT: Platform Matter accessories
 * =======================================
 * This vacuum is registered as a platform accessory using
 * api.matter.registerPlatformAccessories(), which works the same as HAP.
 * Platform accessories are registered synchronously and are immediately ready for use.
 *
 * Demo behavior:
 * - Start/Resume: Sets run mode to "Cleaning", runs for 15/10 seconds, then returns to dock
 * - Return to dock: Immediately sets "Idle" mode, then Seeking (5s) → Charging (3s) → Docked
 * - Stop: Immediately stops and resets to "Idle" mode
 * - Pause: Cancels automatic completion timer, keeps "Cleaning" mode
 */

import type { API, Logger, MatterRequests } from 'homebridge'

import { BaseMatterAccessory } from './BaseMatterAccessory.js'

export class RoboticVacuumAccessory extends BaseMatterAccessory {
  private activeTimers: NodeJS.Timeout[] = []

  constructor(api: API, log: Logger, opts?: Partial<import('./BaseMatterAccessory').BaseMatterAccessoryConfig & { deviceId?: string }>) {
    const serialNumber = opts?.serialNumber ?? 'VACUUM-001'
    const clusters = opts?.clusters ?? {
      rvcRunMode: {
        supportedModes: [
          { label: 'Idle', mode: 0, modeTags: [{ value: 16384 }] },
          { label: 'Cleaning', mode: 1, modeTags: [{ value: 16385 }] },
          { label: 'Mapping', mode: 2, modeTags: [{ value: 16386 }] },
        ],
        currentMode: 0,
      },
      rvcCleanMode: {
        supportedModes: [
          { label: 'Vacuum', mode: 0, modeTags: [{ value: 16385 }] },
          { label: 'Mop', mode: 1, modeTags: [{ value: 16386 }] },
          { label: 'Vacuum & Mop', mode: 2, modeTags: [{ value: 16385 }, { value: 16386 }] },
          { label: 'Deep Clean', mode: 3, modeTags: [{ value: 16384 }] },
          { label: 'Deep Vacuum', mode: 4, modeTags: [{ value: 16384 }, { value: 16385 }] },
          { label: 'Deep Mop', mode: 5, modeTags: [{ value: 16384 }, { value: 16386 }] },
          { label: 'Quick Clean', mode: 6, modeTags: [{ value: 1 }, { value: 16385 }] },
          { label: 'Max Clean', mode: 7, modeTags: [{ value: 7 }, { value: 16385 }] },
          { label: 'Min Clean', mode: 8, modeTags: [{ value: 6 }, { value: 16385 }] },
          { label: 'Quiet Vacuum', mode: 9, modeTags: [{ value: 2 }, { value: 16385 }] },
          { label: 'Quiet Mop', mode: 10, modeTags: [{ value: 2 }, { value: 16386 }] },
          { label: 'Night Mode', mode: 11, modeTags: [{ value: 8 }, { value: 16385 }] },
          { label: 'Eco Vacuum', mode: 12, modeTags: [{ value: 4 }, { value: 16385 }] },
          { label: 'Eco Mop', mode: 13, modeTags: [{ value: 4 }, { value: 16386 }] },
          { label: 'Auto', mode: 14, modeTags: [{ value: 0 }, { value: 16385 }] },
        ],
        currentMode: 0,
      },
      rvcOperationalState: {
        operationalStateList: [
          { operationalStateId: 0 },
          { operationalStateId: 1 },
          { operationalStateId: 2 },
          { operationalStateId: 3 },
          { operationalStateId: 64 },
          { operationalStateId: 65 },
          { operationalStateId: 66 },
        ],
        operationalState: 66,
      },
      serviceArea: {
        supportedMaps: [],
        supportedAreas: [
          { areaId: 0, mapId: null, areaInfo: { locationInfo: { locationName: 'Living Room', floorNumber: 0, areaType: 7 }, landmarkInfo: null } },
          { areaId: 1, mapId: null, areaInfo: { locationInfo: { locationName: 'Kitchen', floorNumber: 0, areaType: 10 }, landmarkInfo: null } },
          { areaId: 2, mapId: null, areaInfo: { locationInfo: { locationName: 'Bedroom', floorNumber: 0, areaType: 2 }, landmarkInfo: null } },
          { areaId: 3, mapId: null, areaInfo: { locationInfo: { locationName: 'Bathroom', floorNumber: 0, areaType: 6 }, landmarkInfo: null } },
        ],
        selectedAreas: [0, 1, 2, 3],
      },
    }

    const handlers = opts?.handlers ?? {
      rvcRunMode: { changeToMode: async (request: MatterRequests.ChangeToMode) => this.handleChangeRunMode(request) },
      rvcCleanMode: { changeToMode: async (request: MatterRequests.ChangeToMode) => this.handleChangeCleanMode(request) },
      rvcOperationalState: { pause: async () => this.handlePause(), stop: async () => this.handleStop(), start: async () => this.handleStart(), resume: async () => this.handleResume(), goHome: async () => this.handleGoHome() },
      serviceArea: { selectAreas: async (request: MatterRequests.SelectAreas) => this.handleSelectAreas(request), skipArea: async (request: MatterRequests.SkipArea) => this.handleSkipArea(request) },
    }

    super(api, log, {
      uuid: opts?.uuid ?? api.matter.uuid.generate(serialNumber),
      displayName: opts?.displayName ?? 'Robot Vacuum',
      deviceType: api.matter.deviceTypes.RoboticVacuumCleaner,
      serialNumber,
      manufacturer: opts?.manufacturer ?? 'Homebridge Matter',
      model: opts?.model ?? 'HB-MATTER-VACUUM-ROBOTIC',
      firmwareRevision: opts?.firmwareRevision ?? '2.0.0',
      hardwareRevision: opts?.hardwareRevision ?? '1.0.0',
      clusters,
      handlers,
      context: { deviceId: opts?.deviceId, ...(opts?.context ?? {}) },
    })

    this.logInfo('initialized and ready.')
  }

  private async handleChangeRunMode(request: MatterRequests.ChangeToMode): Promise<void> {
    this.logInfo(`ChangeToMode (run) request received: ${JSON.stringify(request)}`)
    const { newMode } = request
    const modeStr = ['Idle', 'Cleaning', 'Mapping'][newMode] || `Unknown (mode=${newMode})`
    this.logInfo(`changing run mode to: ${modeStr}`)
    // TODO: await myVacuumAPI.setRunMode(newMode)

    // Clear any existing timers
    this.clearTimers()

    if (newMode === 1) {
      // Switching to Cleaning mode - start the vacuum
      this.updateOperationalState(1) // Running

      // Simulate cleaning completion after 15 seconds
      const completionTimer = setTimeout(() => {
        this.logInfo('cleaning completed, returning to dock.')
        this.updateRunMode(0) // Set to Idle - cleaning session ending
        this.returnToDock()
      }, 15000)

      this.activeTimers.push(completionTimer)
    } else if (newMode === 0) {
      // Switching to Idle mode - return to dock
      this.returnToDock()
    } else if (newMode === 2) {
      // Switching to Mapping mode - start mapping
      this.updateOperationalState(1) // Running

      // Simulate mapping completion after 20 seconds
      const completionTimer = setTimeout(() => {
        this.logInfo('mapping completed, returning to dock.')
        this.returnToDock()
      }, 20000)

      this.activeTimers.push(completionTimer)
    }
  }

  private async handleChangeCleanMode(request: MatterRequests.ChangeToMode): Promise<void> {
    this.logInfo(`ChangeToMode (clean) request received: ${JSON.stringify(request)}`)
    const { newMode } = request
    const modes = [
      'Vacuum',
      'Mop',
      'Vacuum & Mop',
      'Deep Clean',
      'Deep Vacuum',
      'Deep Mop',
      'Quick Clean',
      'Max Clean',
      'Min Clean',
      'Quiet Vacuum',
      'Quiet Mop',
      'Night Mode',
      'Eco Vacuum',
      'Eco Mop',
      'Auto',
    ]
    const modeStr = modes[newMode] || `Unknown (mode=${newMode})`
    this.logInfo(`changing clean mode to: ${modeStr}`)
    // TODO: await myVacuumAPI.setCleanMode(newMode)
  }

  private async handlePause(): Promise<void> {
    this.logInfo('pausing.')
    // TODO: await myVacuumAPI.pause()
    this.clearTimers() // Clear cleaning completion timer
    this.updateOperationalState(2) // Paused
  }

  private async handleStop(): Promise<void> {
    this.logInfo('stopping.')
    // TODO: await myVacuumAPI.stop()
    this.clearTimers()
    this.updateRunMode(0) // Reset to Idle
    this.updateOperationalState(0) // Stopped
  }

  private async handleStart(): Promise<void> {
    this.logInfo('starting (via start command).')
    // TODO: await myVacuumAPI.start()

    // Clear any existing timers
    this.clearTimers()

    this.updateRunMode(1) // Set to Cleaning mode - this will trigger the run mode handler logic
    this.updateOperationalState(1) // Running

    // Simulate cleaning completion after 15 seconds
    const completionTimer = setTimeout(() => {
      this.logInfo('cleaning completed, returning to dock.')
      this.updateRunMode(0) // Set to Idle - cleaning session ending
      this.returnToDock()
    }, 15000)

    this.activeTimers.push(completionTimer)
  }

  private async handleResume(): Promise<void> {
    this.logInfo('resuming.')
    // TODO: await myVacuumAPI.resume()

    // Clear any existing timers
    this.clearTimers()

    this.updateRunMode(1) // Set to Cleaning mode
    this.updateOperationalState(1) // Running

    // Simulate cleaning completion after 10 seconds (shorter since resuming)
    const completionTimer = setTimeout(() => {
      this.logInfo('cleaning completed, returning to dock.')
      this.updateRunMode(0) // Set to Idle - cleaning session ending
      this.returnToDock()
    }, 10000)

    this.activeTimers.push(completionTimer)
  }

  private async handleGoHome(): Promise<void> {
    this.logInfo('goHome command received.')
    // TODO: await myVacuumAPI.goHome()

    // Clear any existing timers
    this.clearTimers()

    // Defer state updates to ensure handler completes first
    setImmediate(() => {
      // Set to Idle mode since we're ending the cleaning session
      this.updateRunMode(0)

      // Initiate return to dock sequence
      this.returnToDock()
    })
  }

  private async handleSelectAreas(request: MatterRequests.SelectAreas): Promise<void> {
    this.logInfo(`SelectAreas request received: ${JSON.stringify(request)}`)
    const { newAreas } = request
    const areaNames = newAreas.map((id: number) =>
      ['Living Room', 'Kitchen', 'Bedroom', 'Bathroom'][id] || `Area ${id}`,
    )
    this.logInfo(`selecting areas: ${areaNames.join(', ')}`)
    // TODO: await myVacuumAPI.selectAreas(newAreas)
  }

  private async handleSkipArea(request: MatterRequests.SkipArea): Promise<void> {
    this.logInfo(`SkipArea request received: ${JSON.stringify(request)}`)
    const { skippedArea } = request
    const areaName = ['Living Room', 'Kitchen', 'Bedroom', 'Bathroom'][skippedArea] || `Area ${skippedArea}`
    this.logInfo(`skipping area: ${areaName}`)
    // TODO: await myVacuumAPI.skipArea(skippedArea)
  }

  /**
   * Helper method to clear all active timers
   */
  private clearTimers(): void {
    this.activeTimers.forEach(timer => clearTimeout(timer))
    this.activeTimers = []
  }

  /**
   * Helper method to initiate return to dock sequence
   * Can be called synchronously from other handlers
   */
  private returnToDock(): void {
    this.logInfo('initiating return to dock sequence.')

    // Defer ALL state updates to ensure handler completes first
    setImmediate(() => {
      // Start seeking charger directly (skip intermediate Stopped state)
      this.updateOperationalState(64) // Seeking Charger

      // After 5 seconds, start charging
      const chargingTimer = setTimeout(() => {
        this.logInfo('reached dock, now charging.')
        this.updateOperationalState(65) // Charging

        // After 3 more seconds, fully docked
        const dockedTimer = setTimeout(() => {
          this.logInfo('fully charged and docked.')
          this.updateOperationalState(66) // Docked
        }, 3000)

        this.activeTimers.push(dockedTimer)
      }, 5000)

      this.activeTimers.push(chargingTimer)
    })
  }

  /**
   * Update Methods - Use these to update the vacuum state from your API/device
   *
   * Since this is a platform accessory, state updates work immediately after registration.
   */

  public updateOperationalState(state: number): void {
    this.updateState('rvcOperationalState', { operationalState: state })
    const states = [
      'Stopped',
      'Running',
      'Paused',
      'Error',
      null,
      null,
      null,
      null,
      ...Array.from({ length: 56 }).fill(null),
      'Seeking Charger',
      'Charging',
      'Docked',
    ]
    this.logInfo(`operational state updated to: ${states[state] || `Unknown (${state})`}`)
  }

  public updateRunMode(mode: number): void {
    this.updateState('rvcRunMode', { currentMode: mode })
    const modes = ['Idle', 'Cleaning', 'Mapping']
    this.logInfo(`run mode updated to: ${modes[mode] || `Unknown (${mode})`}`)
  }

  public updateCleanMode(mode: number): void {
    this.updateState('rvcCleanMode', { currentMode: mode })
    const modes = [
      'Vacuum',
      'Mop',
      'Vacuum & Mop',
      'Deep Clean',
      'Deep Vacuum',
      'Deep Mop',
      'Quick Clean',
      'Max Clean',
      'Min Clean',
      'Quiet Vacuum',
      'Quiet Mop',
      'Night Mode',
      'Eco Vacuum',
      'Eco Mop',
      'Auto',
    ]
    this.logInfo(`clean mode updated to: ${modes[mode] || `Unknown (${mode})`}`)
  }

  public updateSelectedAreas(areaIds: number[]): void {
    this.updateState('serviceArea', { selectedAreas: areaIds })
    const areaNames = areaIds.map(id =>
      ['Living Room', 'Kitchen', 'Bedroom', 'Bathroom'][id] || `Area ${id}`,
    )
    this.logInfo(`selected areas updated to: ${areaNames.join(', ') || 'All Areas'}`)
  }

  public updateCurrentArea(areaId: number | null): void {
    this.updateState('serviceArea', { currentArea: areaId })
    if (areaId !== null) {
      const areaName = ['Living Room', 'Kitchen', 'Bedroom', 'Bathroom'][areaId] || `Area ${areaId}`
      this.logInfo(`current area updated to: ${areaName}`)
    } else {
      this.logInfo('current area cleared')
    }
  }

  public updateProgress(progress: Array<{ areaId: number, status: number }>): void {
    this.updateState('serviceArea', { progress })
    this.logInfo(`progress updated: ${progress.length} areas`)
  }

  /**
   * Update battery percentage
   *
   * Note: The Matter specification for RoboticVacuumCleaner does not include
   * the PowerSource cluster. Battery information for robotic vacuums should be
   * communicated through device-specific status reporting or via the RVC
   * operational state cluster.
   *
   * This method is retained for API compatibility but does not update any
   * Matter cluster state.
   *
   * @param percentageOrBatPercentRemaining - Battery percentage (0-100) or batPercentRemaining (0-200)
   */
  public async updateBatteryPercentage(percentageOrBatPercentRemaining: number): Promise<void> {
    // Accept either 0–100 (percentage) or 0–200 (batPercentRemaining) to be robust
    const isBatPercent = Number(percentageOrBatPercentRemaining) > 100
    const percentage = isBatPercent
      ? Math.max(0, Math.min(100, Math.round(Number(percentageOrBatPercentRemaining) / 2)))
      : Math.max(0, Math.min(100, Math.round(Number(percentageOrBatPercentRemaining))))

    // Determine charge level based on percentage
    let chargeLevel = 0 // Ok
    if (percentage < 20) {
      chargeLevel = 2 // Critical
    } else if (percentage < 40) {
      chargeLevel = 1 // Warning
    }

    // Log battery status only - PowerSource cluster is not supported for RoboticVacuumCleaner
    this.logInfo(`battery status: ${percentage}% (${chargeLevel === 0 ? 'Ok' : chargeLevel === 1 ? 'Warning' : 'Critical'})`)

    // Store battery info in context for reference
    if (this.context) {
      (this.context as any).batteryPercentage = percentage
      ;(this.context as any).batteryChargeLevel = chargeLevel
    }
  }
}
