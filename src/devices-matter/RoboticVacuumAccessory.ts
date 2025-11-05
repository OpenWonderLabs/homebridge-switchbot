//

/**
 * Robotic Vacuum Cleaner Accessory (SwitchBot-aligned)
 *
 * This implementation is intentionally limited to SwitchBot OpenAPI-supported
 * behaviors for Robot Vacuum families. We expose only commands and modes that
 * exist in the public API docs:
 * https://github.com/OpenWonderLabs/SwitchBotAPI
 *
 * Capability matrix (derived from OpenAPI v1.1):
 * - S1 / S1 Plus / K10+ / K10+ Pro
 *   • Commands: start, stop, dock, PowLevel {0-3}
 *   • No pause/resume, no mop, no area selection
 * - K10+ Pro Combo
 *   • Commands: startClean {action: sweep|mop, param: {fanLevel 1-4}}, pause, dock
 *   • changeParam {fanLevel}, setVolume
 * - S10 / S20 / K11+ / K20+ Pro
 *   • Commands: startClean {action: sweep|sweep_mop|mop (model-dependent), param: {fanLevel 1-4, waterLevel 1-2?}},
 *               pause, dock, changeParam, setVolume, (S10/S20) selfClean/addWaterForHumi
 *   • Some models support waterLevel, some do not (e.g. K10+ Pro Combo)
 *
 * Matter clusters exposed:
 * - rvcRunMode: Idle/Cleaning only (no Mapping mode via OpenAPI)
 * - rvcCleanMode: Interpreted per model:
 *   • Basic vac (S1/K10 family): suction levels → Quiet/Standard/Strong/MAX
 *   • Mop-capable (K10+ Pro Combo/K11+/K20+ Pro): action → Vacuum or Mop
 *   • Mop+Vac-capable (S10/S20): action → Vacuum or Vacuum & Mop
 * - rvcOperationalState: start/stop/pause/goHome handlers are attached only when supported
 * - serviceArea: NOT exposed (area/room selection isn’t in public OpenAPI)
 */

import type { API, Logger, MatterRequests } from 'homebridge'

import { BaseMatterAccessory } from './BaseMatterAccessory.js'

type SwitchBotVacuumModel
  = 'S1'
    | 'S1 Plus'
    | 'S1 Pro'
    | 'S1 Mini'
    | 'WoSweeper'
    | 'WoSweeperMini'
    | 'K10+'
    | 'K10+ Pro'
    | 'K10+ Pro Combo'
    | 'S10'
    | 'S20'
    | 'K11+'
    | 'K20+ Pro'

interface VacuumCapabilities {
  // Whether pause/resume is available
  pause: boolean
  resume: boolean
  // Clean action type exposed via rvcCleanMode
  cleanAction: 'vacuum-only' | 'vacuum-or-mop' | 'vacuum-or-vacmop'
  // Suction mapping: basic uses PowLevel 0-3; advanced uses fanLevel 1-4
  suctionKind: 'powLevel-0-3' | 'fanLevel-1-4' | 'none'
  // Whether waterLevel parameter is supported on start/changeParam
  waterLevel: boolean
  // Advanced commands available (S10/S20 only)
  advancedCommands?: {
    setVolume?: boolean
    selfClean?: boolean
    addWaterForHumi?: boolean
  }
}

function detectModelFromContext(ctx?: Record<string, unknown>): SwitchBotVacuumModel | undefined {
  const t = (ctx?.deviceType as string | undefined)?.trim()
  switch (t) {
    case 'Robot Vacuum Cleaner S1':
      return 'S1'
    case 'Robot Vacuum Cleaner S1 Plus':
      return 'S1 Plus'
    case 'Robot Vacuum Cleaner S1 Pro':
      return 'S1 Pro'
    case 'Robot Vacuum Cleaner S1 Mini':
      return 'S1 Mini'
    case 'WoSweeper':
      return 'WoSweeper'
    case 'WoSweeperMini':
      return 'WoSweeperMini'
    case 'K10+':
      return 'K10+'
    case 'K10+ Pro':
      return 'K10+ Pro'
    case 'Robot Vacuum Cleaner K10+ Pro Combo':
    case 'K10+ Pro Combo':
      return 'K10+ Pro Combo'
    case 'Robot Vacuum Cleaner S10':
      return 'S10'
    case 'Robot Vacuum Cleaner S20':
    case 'S20':
      return 'S20'
    case 'Robot Vacuum Cleaner K11+':
    case 'K11+':
      return 'K11+'
    case 'Robot Vacuum Cleaner K20 Plus Pro':
    case 'K20+ Pro':
      return 'K20+ Pro'
    default:
      return undefined
  }
}

function capabilitiesFor(model?: SwitchBotVacuumModel): VacuumCapabilities {
  // Defaults: conservative basic vac
  if (!model) {
    return { pause: false, resume: false, cleanAction: 'vacuum-only', suctionKind: 'powLevel-0-3', waterLevel: false }
  }

  // Basic vacuum models (S1 family, WoSweeper family, K10 family without Combo)
  if (model === 'S1' || model === 'S1 Plus' || model === 'S1 Pro' || model === 'S1 Mini'
    || model === 'WoSweeper' || model === 'WoSweeperMini'
    || model === 'K10+' || model === 'K10+ Pro') {
    return { pause: false, resume: false, cleanAction: 'vacuum-only', suctionKind: 'powLevel-0-3', waterLevel: false }
  }

  // K10+ Pro Combo: vacuum or mop, fanLevel, no waterLevel
  if (model === 'K10+ Pro Combo') {
    return { pause: true, resume: false, cleanAction: 'vacuum-or-mop', suctionKind: 'fanLevel-1-4', waterLevel: false }
  }

  // S10/S20: vacuum or vacuum+mop combo, fanLevel, waterLevel, plus advanced commands
  if (model === 'S10' || model === 'S20') {
    return {
      pause: true,
      resume: false,
      cleanAction: 'vacuum-or-vacmop',
      suctionKind: 'fanLevel-1-4',
      waterLevel: true,
      advancedCommands: {
        setVolume: true,
        selfClean: true,
        addWaterForHumi: true,
      },
    }
  }

  // K11+/K20+ Pro: vacuum or mop, fanLevel, waterLevel, volume control
  return {
    pause: true,
    resume: false,
    cleanAction: 'vacuum-or-mop',
    suctionKind: 'fanLevel-1-4',
    waterLevel: true,
    advancedCommands: {
      setVolume: true,
    },
  }
}

export class RoboticVacuumAccessory extends BaseMatterAccessory {
  // Track current high-level preferences that affect OpenAPI payloads
  private currentCleanAction: 'vacuum' | 'mop' | 'vacuum_mop' = 'vacuum'
  private currentFanLevel: 1 | 2 | 3 | 4 = 2
  private capabilities: VacuumCapabilities

  constructor(api: API, log: Logger, opts?: Partial<import('./BaseMatterAccessory').BaseMatterAccessoryConfig & { deviceId?: string }>) {
    const serialNumber = opts?.serialNumber ?? 'VACUUM-001'
    const model = detectModelFromContext(opts?.context)
    const capabilities = capabilitiesFor(model)
    super(api, log, {
      uuid: opts?.uuid ?? api.matter.uuid.generate(serialNumber),
      displayName: opts?.displayName ?? 'Robot Vacuum',
      deviceType: api.matter.deviceTypes.RoboticVacuumCleaner,
      serialNumber,
      manufacturer: opts?.manufacturer ?? 'Homebridge Matter',
      model: opts?.model ?? 'HB-MATTER-VACUUM-ROBOTIC',
      firmwareRevision: opts?.firmwareRevision ?? '2.0.0',
      hardwareRevision: opts?.hardwareRevision ?? '1.0.0',
      clusters: {
        rvcRunMode: {
          supportedModes: [
            { label: 'Idle', mode: 0, modeTags: [{ value: 16384 }] },
            { label: 'Cleaning', mode: 1, modeTags: [{ value: 16385 }] },
          ],
          currentMode: 0,
        },
        rvcCleanMode: (() => {
          if (capabilities.cleanAction === 'vacuum-only') {
            return {
              supportedModes: [
                { label: 'Quiet', mode: 0, modeTags: [{ value: 2 }] },
                { label: 'Standard', mode: 1, modeTags: [{ value: 16384 }] },
                { label: 'Strong', mode: 2, modeTags: [{ value: 7 }] },
                { label: 'MAX', mode: 3, modeTags: [{ value: 8 }] },
              ],
              currentMode: 1,
            }
          } else if (capabilities.cleanAction === 'vacuum-or-mop') {
            return {
              supportedModes: [
                { label: 'Vacuum', mode: 0, modeTags: [{ value: 16385 }] },
                { label: 'Mop', mode: 1, modeTags: [{ value: 16386 }] },
              ],
              currentMode: 0,
            }
          } else {
            return {
              supportedModes: [
                { label: 'Vacuum', mode: 0, modeTags: [{ value: 16385 }] },
                { label: 'Vacuum & Mop', mode: 1, modeTags: [{ value: 16385 }, { value: 16386 }] },
              ],
              currentMode: 0,
            }
          }
        })(),
        rvcOperationalState: {
          operationalStateList: [
            { operationalStateId: 0 }, // Stopped
            { operationalStateId: 1 }, // Running
            { operationalStateId: 2 }, // Paused
            { operationalStateId: 64 }, // Seeking Charger
            { operationalStateId: 65 }, // Charging
            { operationalStateId: 66 }, // Docked
          ],
          operationalState: 66,
        },
      },
      handlers: (() => {
        const opHandlers: Record<string, any> = {
          stop: async () => this.handleStop(),
          start: async () => this.handleStart(),
          goHome: async () => this.handleGoHome(),
        }
        if (capabilities.pause) {
          opHandlers.pause = async () => this.handlePause()
        }
        if (capabilities.resume) {
          opHandlers.resume = async () => this.handleResume()
        }
        return {
          rvcRunMode: { changeToMode: async (request: MatterRequests.ChangeToMode) => this.handleChangeRunMode(request) },
          rvcCleanMode: { changeToMode: async (request: MatterRequests.ChangeToMode) => this.handleChangeCleanMode(request) },
          rvcOperationalState: opHandlers as any,
        }
      })(),
      context: { deviceId: opts?.deviceId, ...(opts?.context ?? {}), deviceType: (opts?.context as any)?.deviceType },
    })

    this.capabilities = capabilities
    this.logInfo('initialized and ready.')
  }

  private async handleChangeRunMode(request: MatterRequests.ChangeToMode): Promise<void> {
    this.logInfo(`ChangeToMode (run) request received: ${JSON.stringify(request)}`)
    const { newMode } = request
    const modeStr = ['Idle', 'Cleaning'][newMode] || `Unknown (mode=${newMode})`
    this.logInfo(`changing run mode to: ${modeStr}`)
    if (newMode === 1) {
      await this.handleStart()
    } else if (newMode === 0) {
      await this.handleGoHome()
    }
  }

  private async handleChangeCleanMode(request: MatterRequests.ChangeToMode): Promise<void> {
    this.logInfo(`ChangeToMode (clean) request received: ${JSON.stringify(request)}`)
    const { newMode } = request
    if (this.capabilities.cleanAction === 'vacuum-only') {
      const mapPow = ['Quiet', 'Standard', 'Strong', 'MAX'] as const
      const label = mapPow[newMode] ?? `Unknown (${newMode})`
      this.logInfo(`changing suction level to: ${label}`)
      if (this.capabilities.suctionKind === 'powLevel-0-3') {
        try {
          this.logInfo(`[OpenAPI] Sending PowLevel: ${newMode}`)
          await this.sendOpenAPICommand('PowLevel', String(newMode))
          this.logInfo(`[OpenAPI] PowLevel command sent: ${newMode}`)
        } catch (e: any) {
          this.logWarn(`OpenAPI PowLevel failed: ${String(e?.message ?? e)}`)
        }
      } else if (this.capabilities.suctionKind === 'fanLevel-1-4') {
        this.currentFanLevel = (Math.min(3, Math.max(0, Number(newMode))) + 1) as 1 | 2 | 3 | 4
        try {
          this.logInfo(`[OpenAPI] Sending changeParam fanLevel: ${this.currentFanLevel}`)
          await this.sendOpenAPICommand('changeParam', JSON.stringify({ fanLevel: this.currentFanLevel }))
          this.logInfo(`[OpenAPI] changeParam command sent: fanLevel=${this.currentFanLevel}`)
        } catch (e: any) {
          this.logWarn(`OpenAPI changeParam(fanLevel) failed: ${String(e?.message ?? e)}`)
        }
      }
      this.updateCleanMode(newMode)
      return
    }

    if (this.capabilities.cleanAction === 'vacuum-or-mop') {
      const label = newMode === 0 ? 'Vacuum' : 'Mop'
      this.currentCleanAction = newMode === 0 ? 'vacuum' : 'mop'
      this.logInfo(`changing clean action to: ${label}`)
      this.logInfo(`[OpenAPI] (no command sent for cleanAction change, just updating state)`)
      this.updateCleanMode(newMode)
      return
    }

    const label = newMode === 0 ? 'Vacuum' : 'Vacuum & Mop'
    this.currentCleanAction = newMode === 0 ? 'vacuum' : 'vacuum_mop'
    this.logInfo(`changing clean action to: ${label}`)
    this.logInfo(`[OpenAPI] (no command sent for cleanAction change, just updating state)`)
    this.updateCleanMode(newMode)
  }

  private async handlePause(): Promise<void> {
    this.logInfo('pausing.')
    try {
      this.logInfo(`[OpenAPI] Sending pause command`)
      await this.sendOpenAPICommand('pause')
      this.logInfo(`[OpenAPI] pause command sent`)
    } catch (e: any) {
      this.logWarn(`OpenAPI pause failed: ${String(e?.message ?? e)}`)
    }
    this.updateOperationalState(2)
  }

  private async handleStop(): Promise<void> {
    this.logInfo('stopping.')
    try {
      if (this.capabilities.cleanAction === 'vacuum-only' && this.capabilities.suctionKind === 'powLevel-0-3') {
        this.logInfo(`[OpenAPI] Sending stop command`)
        await this.sendOpenAPICommand('stop')
        this.logInfo(`[OpenAPI] stop command sent`)
      } else {
        this.logInfo(`[OpenAPI] Sending pause command (for stop)`)
        await this.sendOpenAPICommand('pause')
        this.logInfo(`[OpenAPI] pause command sent (for stop)`)
      }
    } catch (e: any) {
      this.logWarn(`OpenAPI stop/pause failed: ${String(e?.message ?? e)}`)
    }
    this.updateRunMode(0)
    this.updateOperationalState(0)
  }

  private async handleStart(): Promise<void> {
    this.logInfo('starting clean.')
    try {
      if (this.capabilities.cleanAction === 'vacuum-only' && this.capabilities.suctionKind === 'powLevel-0-3') {
        this.logInfo(`[OpenAPI] Sending start command`)
        await this.sendOpenAPICommand('start')
        this.logInfo(`[OpenAPI] start command sent`)
      } else {
        const action = this.currentCleanAction === 'vacuum_mop' ? 'sweep_mop' : this.currentCleanAction
        const param: any = { action, param: { fanLevel: this.currentFanLevel } }
        if (this.capabilities.waterLevel) {
          param.param.waterLevel = 1
        }
        this.logInfo(`[OpenAPI] Sending startClean: ${JSON.stringify(param)}`)
        await this.sendOpenAPICommand('startClean', JSON.stringify(param))
        this.logInfo(`[OpenAPI] startClean command sent: ${JSON.stringify(param)}`)
      }
    } catch (e: any) {
      this.logWarn(`OpenAPI start/startClean failed: ${String(e?.message ?? e)}`)
    }
    this.updateRunMode(1)
    this.updateOperationalState(1)
  }

  private async handleResume(): Promise<void> {
    this.logInfo('resume requested.')
    await this.handleStart()
  }

  private async handleGoHome(): Promise<void> {
    this.logInfo('returning to dock.')
    try {
      this.logInfo(`[OpenAPI] Sending dock command`)
      await this.sendOpenAPICommand('dock')
      this.logInfo(`[OpenAPI] dock command sent`)
    } catch (e: any) {
      this.logWarn(`OpenAPI dock failed: ${String(e?.message ?? e)}`)
    }
    this.updateRunMode(0)
    this.updateOperationalState(64)
  }

  public updateOperationalState(state: number): void {
    this.updateState('rvcOperationalState', { operationalState: state })
    const states = [
      'Stopped',
      'Running',
      'Paused',
      ...Array.from({ length: 61 }).fill(null),
      'Seeking Charger',
      'Charging',
      'Docked',
    ]
    this.logInfo(`operational state updated to: ${states[state] || `Unknown (${state})`}`)
  }

  public updateRunMode(mode: number): void {
    this.updateState('rvcRunMode', { currentMode: mode })
    const modes = ['Idle', 'Cleaning']
    this.logInfo(`run mode updated to: ${modes[mode] || `Unknown (${mode})`}`)
  }

  public updateCleanMode(mode: number): void {
    this.updateState('rvcCleanMode', { currentMode: mode })
    let label = `Unknown (${mode})`
    if (this.capabilities.cleanAction === 'vacuum-only') {
      label = ['Quiet', 'Standard', 'Strong', 'MAX'][mode] || label
    } else if (this.capabilities.cleanAction === 'vacuum-or-mop') {
      label = ['Vacuum', 'Mop'][mode] || label
    } else {
      label = ['Vacuum', 'Vacuum & Mop'][mode] || label
    }
    this.logInfo(`clean mode updated to: ${label}`)
  }

  /**
   * Update battery percentage (no PowerSource cluster for this device type)
   */
  public async updateBatteryPercentage(percentageOrBatPercentRemaining: number): Promise<void> {
    const isBatPercent = Number(percentageOrBatPercentRemaining) > 100
    const percentage = isBatPercent
      ? Math.max(0, Math.min(100, Math.round(Number(percentageOrBatPercentRemaining) / 2)))
      : Math.max(0, Math.min(100, Math.round(Number(percentageOrBatPercentRemaining))))

    let chargeLevel = 0 // Ok
    if (percentage < 20) {
      chargeLevel = 2 // Critical
    } else if (percentage < 40) {
      chargeLevel = 1 // Warning
    }

    this.logInfo(`battery status: ${percentage}% (${chargeLevel === 0 ? 'Ok' : chargeLevel === 1 ? 'Warning' : 'Critical'})`)

    if (this.context) {
      (this.context as any).batteryPercentage = percentage
      ;(this.context as any).batteryChargeLevel = chargeLevel
    }
  }
}
