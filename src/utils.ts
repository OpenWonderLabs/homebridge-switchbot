import type { SwitchBotPluginConfig } from './settings.js'
import type { Logger, PlatformConfig } from 'homebridge'
/**
 * Indicates which device types should prefer Matter if available.
 * Based on HAP service mappings: device implementations use specific HomeKit services
 * that map to corresponding Matter clusters when Matter is enabled.
 *
 * @property {boolean} [deviceType] - True if the device type supports Matter, false otherwise.
 * @example
 * DEVICE_MATTER_SUPPORTED['bot'] // true
 */
/**
 * Factory function to create Matter handlers with Homebridge logger integration.
 * Returns handler objects for supported device types, mapping Matter cluster actions to SwitchBot API calls.
 *
 * @param log - Homebridge logger instance
 * @param deviceId - SwitchBot device ID
 * @param type - Device type string
 * @param client - SwitchBot client instance
 * @returns Handler object for Matter clusters
 */

export const DEVICE_MATTER_SUPPORTED: Record<string, boolean> = {
  // Core devices
  'bot': true, // Switch → OnOff
  'curtain': true, // WindowCovering → WindowCovering
  'fan': true, // Fan → FanControl
  'light': true, // Lightbulb → OnOff + LevelControl
  'lightstrip': true, // Lightbulb (color) → OnOff + LevelControl + ColorControl
  'motion': true, // MotionSensor → OccupancySensing
  'contact': true, // ContactSensor → BooleanState
  'vacuum': true, // Switch → RobotVacuumCleaner
  'lock': true, // LockMechanism → DoorLock
  'humidifier': true, // Fan + Humidity → OnOff + FanControl + RelativeHumidityMeasurement
  'temperature': true, // TemperatureSensor → TemperatureMeasurement

  // Switch devices
  'relay': true, // Switch → OnOff
  'relay switch 1': true, // Switch → OnOff
  'relay switch 1pm': true, // Switch → OnOff
  'plug': true, // Outlet → OnOff
  'plug mini (jp)': true, // Outlet → OnOff
  'plug mini (us)': true, // Outlet → OnOff

  // Window covering variants
  'blindtilt': true, // WindowCovering → WindowCovering
  'blind tilt': true, // WindowCovering → WindowCovering
  'curtain3': true, // WindowCovering → WindowCovering
  'rollershade': true, // WindowCovering → WindowCovering
  'roller shade': true, // WindowCovering → WindowCovering
  'worollershade': true, // WindowCovering → WindowCovering
  'wo rollershade': true, // WindowCovering → WindowCovering

  // Vacuum variants (normalized to 'vacuum' before lookup)
  'wosweeper': true, // VacuumDevice → RobotVacuumCleaner
  'wosweepermini': true, // VacuumDevice → RobotVacuumCleaner
  'wosweeperminipro': true, // VacuumDevice → RobotVacuumCleaner
  'k10+': true, // VacuumDevice → RobotVacuumCleaner
  'k10+ pro': true, // VacuumDevice → RobotVacuumCleaner

  // Sensors
  'meter': true, // TemperatureSensor + HumiditySensor → TemperatureMeasurement + RelativeHumidityMeasurement
  'meterplus': true, // TemperatureSensor + HumiditySensor → TemperatureMeasurement + RelativeHumidityMeasurement
  'meter plus (jp)': true, // TemperatureSensor + HumiditySensor → TemperatureMeasurement + RelativeHumidityMeasurement
  'meterpro': true, // TemperatureSensor + HumiditySensor → TemperatureMeasurement + RelativeHumidityMeasurement
  'meterpro(co2)': true, // TemperatureSensor + HumiditySensor → TemperatureMeasurement + RelativeHumidityMeasurement
  'waterdetector': true, // LeakSensor → BooleanState
  'water detector': true, // LeakSensor → BooleanState

  // Other devices
  'smart fan': true, // Fan → FanControl
  'strip light': true, // Lightbulb (color) → OnOff + LevelControl + ColorControl
  'hub 2': false, // Hub device - not exposed as accessory
  'walletfinder': false, // Button device - Matter support TBD
}

/**
 * Default Matter cluster configurations by device type.
 * Maps device types to their Matter cluster states (used when device doesn't provide clusters).
 * Note: wosweeper/curtain/plug variants are normalized before cluster lookup (see loadDevices).
 *
 * @property {object} [deviceType] - The default cluster state for the device type.
 * @example
 * DEVICE_MATTER_CLUSTERS['bot'] // { onOff: { onOff: false } }
 */
export const DEVICE_MATTER_CLUSTERS: Record<string, any> = {
  // Core devices - aligned with HAP service implementations
  bot: { onOff: { onOff: false } }, // Switch → OnOff
  vacuum: {
    rvcRunMode: {
      supportedModes: [
        { label: 'Idle', mode: 0, modeTags: [{ value: 16384 }] },
        { label: 'Cleaning', mode: 1, modeTags: [{ value: 16385 }] },
      ],
      currentMode: 0,
    },
    rvcCleanMode: {
      supportedModes: [
        { label: 'Vacuum', mode: 0, modeTags: [{ value: 16385 }] },
      ],
      currentMode: 0,
    },
    rvcOperationalState: {
      operationalStateList: [
        { operationalStateId: 0 }, // Stopped
        { operationalStateId: 1 }, // Running
        { operationalStateId: 2 }, // Paused
        { operationalStateId: 3 }, // Error (required)
        { operationalStateId: 64 }, // Seeking charger
        { operationalStateId: 65 }, // Charging
        { operationalStateId: 66 }, // Docked
      ],
      operationalState: 66,
    },
  }, // Switch in HAP, RobotVacuumCleaner in Matter
  curtain: {
    windowCovering: {
      currentPositionLiftPercent100ths: 0,
      targetPositionLiftPercent100ths: 0,
      operationalStatus: {
        global: 0,
        lift: 0,
        tilt: 0,
      },
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
  }, // WindowCovering → WindowCovering (includes curtain3, rollershade variants via normalization)
  blindtilt: {
    windowCovering: {
      currentPositionLiftPercent100ths: 0,
      targetPositionLiftPercent100ths: 0,
      currentPositionTiltPercent100ths: 0,
      targetPositionTiltPercent100ths: 0,
      operationalStatus: {
        global: 0,
        lift: 0,
        tilt: 0,
      },
      endProductType: 8,
      configStatus: {
        operational: true,
        onlineReserved: true,
        liftMovementReversed: false,
        liftPositionAware: true,
        tiltPositionAware: true,
        liftEncoderControlled: true,
        tiltEncoderControlled: true,
      },
    },
  }, // WindowCovering with tilt → WindowCovering
  fan: {
    onOff: { onOff: false },
    fanControl: {
      fanMode: 0,
      percentCurrent: 0,
      percentSetting: 0,
      speedCurrent: 0,
      speedMax: 100,
    },
  }, // Fan → OnOff + FanControl
  light: {
    onOff: { onOff: false },
    levelControl: {
      currentLevel: 0,
      minLevel: 0,
      maxLevel: 254,
    },
  }, // Lightbulb → OnOff + LevelControl
  lightstrip: {
    onOff: { onOff: false },
    levelControl: {
      currentLevel: 0,
      minLevel: 0,
      maxLevel: 254,
    },
    colorControl: {
      colorMode: 0,
    },
  }, // Lightbulb with color → OnOff + LevelControl + ColorControl
  lock: {
    doorLock: {
      lockState: 0,
      lockType: 0,
      actuatorEnabled: true,
      operatingMode: 0,
    },
  }, // LockMechanism → DoorLock
  motion: {
    occupancySensing: {
      occupancy: 0,
      occupancySensorType: 0,
    },
  }, // MotionSensor → OccupancySensing
  contact: {
    booleanState: {
      stateValue: false,
    },
  }, // ContactSensor → BooleanState
  humidifier: {
    onOff: { onOff: false },
    fanControl: {
      fanMode: 0,
      percentCurrent: 0,
    },
    relativeHumidityMeasurement: {
      measuredValue: 0,
      minMeasuredValue: 0,
      maxMeasuredValue: 100,
    },
  }, // HumidifierDehumidifier → OnOff + FanControl + RelativeHumidityMeasurement
  temperature: {
    temperatureMeasurement: {
      measuredValue: 0,
      minMeasuredValue: -27315,
      maxMeasuredValue: 32767,
    },
  }, // TemperatureSensor → TemperatureMeasurement

  // Switch/Outlet devices
  relay: { onOff: { onOff: false } }, // Switch → OnOff
  plug: {
    onOff: { onOff: false },
    electricalMeasurement: {
      activePower: 0,
      rmsCurrent: 0,
      rmsVoltage: 0,
    },
  }, // Outlet → OnOff + ElectricalMeasurement (for PM models)

  // Sensors
  meter: {
    temperatureMeasurement: {
      measuredValue: 0,
      minMeasuredValue: -27315,
      maxMeasuredValue: 32767,
    },
    relativeHumidityMeasurement: {
      measuredValue: 0,
      minMeasuredValue: 0,
      maxMeasuredValue: 100,
    },
  }, // TemperatureSensor + HumiditySensor → TemperatureMeasurement + RelativeHumidityMeasurement
  waterdetector: {
    booleanState: {
      stateValue: false,
    },
  }, // LeakSensor → BooleanState
}

export function createMatterHandlers(log: Logger, deviceId: string, type: string, client: any): any {
  const lowerType = type.toLowerCase()

  switch (lowerType) {
    case 'vacuum':
      return {
        rvcRunMode: {
          changeToMode: async (request: any) => {
            const modeNames = ['Idle', 'Cleaning', 'Mapping']
            const modeName = modeNames[request?.newMode] || `Unknown (${request?.newMode})`
            log.info(`[${deviceId}] RVC run mode change requested: ${modeName}`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              // For K10+ family: use 'start' to begin cleaning (mode 1 = Cleaning)
              // For older K10+: only supports start/stop/dock
              // For newer K20+/S10/S20: supports startClean with more parameters
              // Map Matter mode to SwitchBot command
              const switchBotCommand = request?.newMode === 1 ? 'start' : 'stop'
              const body = {
                command: switchBotCommand,
                parameter: 'default',
                commandType: 'command',
              }
              log.debug(`[${deviceId}] Sending RVC mode change request:`, JSON.stringify(body))
              const result = await client.setDeviceState(deviceId, body)
              log.debug(`[${deviceId}] RVC mode change API response:`, JSON.stringify(result))
              log.info(`[${deviceId}] RVC mode changed successfully to ${switchBotCommand}`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to change RVC mode:`, e)
              return { success: false, error: e }
            }
          },
        },
        rvcCleanMode: {
          changeToMode: async (request: any) => {
            const modeName = request?.newMode !== undefined ? `Mode ${request.newMode}` : 'Unknown'
            log.info(`[${deviceId}] RVC clean mode change requested: ${modeName}`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              // Clean mode (vacuum/mop/etc) not directly supported via Matter for K10+
              // K20+ Pro and newer models support via startClean action parameter
              log.info(`[${deviceId}] Clean mode change requires startClean command (not yet implemented for Matter)`)
              return { success: true }
            } catch (e) {
              log.error(`[${deviceId}] Failed to change RVC clean mode:`, e)
              return { success: false, error: e }
            }
          },
        },
        rvcOperationalState: {
          pause: async () => {
            log.info(`[${deviceId}] RVC pause command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const body = {
                command: 'stop',
                parameter: 'default',
                commandType: 'command',
              }
              log.debug(`[${deviceId}] Sending RVC pause request:`, JSON.stringify(body))
              const result = await client.setDeviceState(deviceId, body)
              log.debug(`[${deviceId}] RVC pause API response:`, JSON.stringify(result))
              log.info(`[${deviceId}] RVC paused successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to pause RVC:`, e)
              return { success: false, error: e }
            }
          },
          resume: async () => {
            log.info(`[${deviceId}] RVC resume command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const body = {
                command: 'start',
                parameter: 'default',
                commandType: 'command',
              }
              log.debug(`[${deviceId}] Sending RVC resume request:`, JSON.stringify(body))
              const result = await client.setDeviceState(deviceId, body)
              log.debug(`[${deviceId}] RVC resume API response:`, JSON.stringify(result))
              log.info(`[${deviceId}] RVC resumed successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to resume RVC:`, e)
              return { success: false, error: e }
            }
          },
          goHome: async () => {
            log.info(`[${deviceId}] RVC goHome command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const body = {
                command: 'dock',
                parameter: 'default',
                commandType: 'command',
              }
              log.debug(`[${deviceId}] Sending RVC goHome request:`, JSON.stringify(body))
              const result = await client.setDeviceState(deviceId, body)
              log.debug(`[${deviceId}] RVC goHome API response:`, JSON.stringify(result))
              log.info(`[${deviceId}] RVC sent to dock successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to send goHome command:`, e)
              return { success: false, error: e }
            }
          },
        },
      }

    case 'bot':
      return {
        onOff: {
          on: async () => {
            log.info(`[${deviceId}] Bot ON command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const result = await client.setDeviceState(deviceId, {
                command: 'turnOn',
                parameter: 'default',
                commandType: 'command',
              })
              log.info(`[${deviceId}] Bot turned on successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to turn on Bot:`, e)
              return { success: false, error: e }
            }
          },
          off: async () => {
            log.info(`[${deviceId}] Bot OFF command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const result = await client.setDeviceState(deviceId, {
                command: 'turnOff',
                parameter: 'default',
                commandType: 'command',
              })
              log.info(`[${deviceId}] Bot turned off successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to turn off Bot:`, e)
              return { success: false, error: e }
            }
          },
        },
      }

    case 'curtain':
    case 'blindtilt':
      return {
        windowCovering: {
          goToLiftPercentage: async (request: any) => {
            const percentage = request?.liftPercent100thsValue
            log.info(`[${deviceId}] Curtain position change requested: ${percentage}`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              // Convert Matter percentage (0-10000) to SwitchBot (0-100)
              const position = Math.max(0, Math.min(100, Math.round((percentage || 0) / 100)))
              const result = await client.setDeviceState(deviceId, {
                command: 'setPosition',
                parameter: String(position),
                commandType: 'command',
              })
              log.info(`[${deviceId}] Curtain position set to ${position}% successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to set curtain position:`, e)
              return { success: false, error: e }
            }
          },
          upOrOpen: async () => {
            log.info(`[${deviceId}] Curtain open command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const result = await client.setDeviceState(deviceId, {
                command: 'open',
                parameter: 'default',
                commandType: 'command',
              })
              log.info(`[${deviceId}] Curtain opened successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to open curtain:`, e)
              return { success: false, error: e }
            }
          },
          downOrClose: async () => {
            log.info(`[${deviceId}] Curtain close command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const result = await client.setDeviceState(deviceId, {
                command: 'close',
                parameter: 'default',
                commandType: 'command',
              })
              log.info(`[${deviceId}] Curtain closed successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to close curtain:`, e)
              return { success: false, error: e }
            }
          },
          stopMotion: async () => {
            log.info(`[${deviceId}] Curtain stop command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const result = await client.setDeviceState(deviceId, {
                command: 'pause',
                parameter: 'default',
                commandType: 'command',
              })
              log.info(`[${deviceId}] Curtain motion stopped successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to stop curtain:`, e)
              return { success: false, error: e }
            }
          },
        },
      }

    case 'plug':
      return {
        onOff: {
          on: async () => {
            log.info(`[${deviceId}] Plug ON command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const result = await client.setDeviceState(deviceId, {
                command: 'turnOn',
                parameter: 'default',
                commandType: 'command',
              })
              log.info(`[${deviceId}] Plug turned on successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to turn on plug:`, e)
              return { success: false, error: e }
            }
          },
          off: async () => {
            log.info(`[${deviceId}] Plug OFF command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const result = await client.setDeviceState(deviceId, {
                command: 'turnOff',
                parameter: 'default',
                commandType: 'command',
              })
              log.info(`[${deviceId}] Plug turned off successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to turn off plug:`, e)
              return { success: false, error: e }
            }
          },
        },
      }

    case 'lock':
      return {
        doorLock: {
          setLockState: async (request: any) => {
            const state = request?.lockState === 1 ? 'LOCKED' : 'UNLOCKED'
            log.info(`[${deviceId}] Lock state change requested: ${state}`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const command = request?.lockState === 1 ? 'lock' : 'unlock'
              const result = await client.setDeviceState(deviceId, {
                command,
                parameter: 'default',
                commandType: 'command',
              })
              log.info(`[${deviceId}] Lock ${state} successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to change lock state:`, e)
              return { success: false, error: e }
            }
          },
        },
      }

    case 'fan':
      return {
        onOff: {
          on: async () => {
            log.info(`[${deviceId}] Fan ON command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const result = await client.setDeviceState(deviceId, {
                command: 'turnOn',
                parameter: 'default',
                commandType: 'command',
              })
              log.info(`[${deviceId}] Fan turned on successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to turn on fan:`, e)
              return { success: false, error: e }
            }
          },
          off: async () => {
            log.info(`[${deviceId}] Fan OFF command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const result = await client.setDeviceState(deviceId, {
                command: 'turnOff',
                parameter: 'default',
                commandType: 'command',
              })
              log.info(`[${deviceId}] Fan turned off successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to turn off fan:`, e)
              return { success: false, error: e }
            }
          },
        },
        fanControl: {
          setFanSpeed: async (request: any) => {
            const speed = request?.percentSetting || 0
            log.info(`[${deviceId}] Fan speed change requested: ${speed}%`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              // Convert percentage to SwitchBot fan speed parameter
              const speedParam = Math.max(1, Math.min(100, speed))
              const result = await client.setDeviceState(deviceId, {
                command: 'setFanSpeed',
                parameter: String(speedParam),
                commandType: 'command',
              })
              log.info(`[${deviceId}] Fan speed set to ${speedParam}% successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to set fan speed:`, e)
              return { success: false, error: e }
            }
          },
        },
      }

    case 'light':
      return {
        onOff: {
          on: async () => {
            log.info(`[${deviceId}] Light ON command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const result = await client.setDeviceState(deviceId, {
                command: 'turnOn',
                parameter: 'default',
                commandType: 'command',
              })
              log.info(`[${deviceId}] Light turned on successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to turn on light:`, e)
              return { success: false, error: e }
            }
          },
          off: async () => {
            log.info(`[${deviceId}] Light OFF command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const result = await client.setDeviceState(deviceId, {
                command: 'turnOff',
                parameter: 'default',
                commandType: 'command',
              })
              log.info(`[${deviceId}] Light turned off successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to turn off light:`, e)
              return { success: false, error: e }
            }
          },
        },
        levelControl: {
          moveToLevel: async (request: any) => {
            const level = request?.level || 0
            // Convert from 0-254 to 0-100
            const brightness = Math.round((level / 254) * 100)
            log.info(`[${deviceId}] Light brightness change requested: ${brightness}%`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const param = Math.max(0, Math.min(100, brightness))
              const result = await client.setDeviceState(deviceId, {
                command: 'setBrightness',
                parameter: String(param),
                commandType: 'command',
              })
              log.info(`[${deviceId}] Light brightness set to ${param}% successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to set light brightness:`, e)
              return { success: false, error: e }
            }
          },
        },
      }

    case 'lightstrip':
      return {
        onOff: {
          on: async () => {
            log.info(`[${deviceId}] Lightstrip ON command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const result = await client.setDeviceState(deviceId, {
                command: 'turnOn',
                parameter: 'default',
                commandType: 'command',
              })
              log.info(`[${deviceId}] Lightstrip turned on successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to turn on lightstrip:`, e)
              return { success: false, error: e }
            }
          },
          off: async () => {
            log.info(`[${deviceId}] Lightstrip OFF command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const result = await client.setDeviceState(deviceId, {
                command: 'turnOff',
                parameter: 'default',
                commandType: 'command',
              })
              log.info(`[${deviceId}] Lightstrip turned off successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to turn off lightstrip:`, e)
              return { success: false, error: e }
            }
          },
        },
        levelControl: {
          moveToLevel: async (request: any) => {
            const level = request?.level || 0
            // Convert from 0-254 to 0-100
            const brightness = Math.round((level / 254) * 100)
            log.info(`[${deviceId}] Lightstrip brightness change requested: ${brightness}%`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const param = Math.max(0, Math.min(100, brightness))
              const result = await client.setDeviceState(deviceId, {
                command: 'setBrightness',
                parameter: String(param),
                commandType: 'command',
              })
              log.info(`[${deviceId}] Lightstrip brightness set to ${param}% successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to set lightstrip brightness:`, e)
              return { success: false, error: e }
            }
          },
        },
        colorControl: {
          moveToHueAndSaturation: async (request: any) => {
            const hue = request?.hue || 0
            const saturation = request?.saturation || 0
            log.info(`[${deviceId}] Lightstrip color change requested: hue=${hue}, sat=${saturation}`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              // Convert hue (0-254) and saturation (0-254) to combined color parameter
              // SwitchBot typically expects RGB or HSV format as parameter
              const colorParam = `${Math.round(hue)},${Math.round(saturation)}`
              const result = await client.setDeviceState(deviceId, {
                command: 'setColor',
                parameter: colorParam,
                commandType: 'command',
              })
              log.info(`[${deviceId}] Lightstrip color set successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to set lightstrip color:`, e)
              return { success: false, error: e }
            }
          },
          moveToColorTemperature: async (request: any) => {
            const mireds = request?.colorTemperatureMireds || 400
            // Convert mireds (158-500 typical range) to Kelvin: K = 1000000 / mireds
            const kelvin = Math.round(1000000 / mireds)
            log.info(`[${deviceId}] Lightstrip color temperature change requested: ${mireds} mireds (${kelvin}K)`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              // Map Kelvin to SwitchBot color temperature parameter (typically 0-100 or specific values)
              // Normalize to 0-100 scale where 0=warm (2700K) and 100=cool (6500K)
              const colorTempParam = Math.max(0, Math.min(100, Math.round(((kelvin - 2700) / 3800) * 100)))
              const result = await client.setDeviceState(deviceId, {
                command: 'setColorTemperature',
                parameter: String(colorTempParam),
                commandType: 'command',
              })
              log.info(`[${deviceId}] Lightstrip color temperature set to ${kelvin}K successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to set lightstrip color temperature:`, e)
              return { success: false, error: e }
            }
          },
        },
      }

    case 'humidifier':
      return {
        onOff: {
          on: async () => {
            log.info(`[${deviceId}] Humidifier ON command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const result = await client.setDeviceState(deviceId, {
                command: 'turnOn',
                parameter: 'default',
                commandType: 'command',
              })
              log.info(`[${deviceId}] Humidifier turned on successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to turn on humidifier:`, e)
              return { success: false, error: e }
            }
          },
          off: async () => {
            log.info(`[${deviceId}] Humidifier OFF command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const result = await client.setDeviceState(deviceId, {
                command: 'turnOff',
                parameter: 'default',
                commandType: 'command',
              })
              log.info(`[${deviceId}] Humidifier turned off successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to turn off humidifier:`, e)
              return { success: false, error: e }
            }
          },
        },
        fanControl: {
          setFanSpeed: async (request: any) => {
            const speed = request?.percentSetting || 0
            log.info(`[${deviceId}] Humidifier speed change requested: ${speed}%`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              // Convert percentage to SwitchBot humidifier speed parameter
              const speedParam = Math.max(1, Math.min(100, speed))
              const result = await client.setDeviceState(deviceId, {
                command: 'setFanSpeed',
                parameter: String(speedParam),
                commandType: 'command',
              })
              log.info(`[${deviceId}] Humidifier speed set to ${speedParam}% successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to set humidifier speed:`, e)
              return { success: false, error: e }
            }
          },
        },
      }

    case 'relay':
      return {
        onOff: {
          on: async () => {
            log.info(`[${deviceId}] Relay ON command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const result = await client.setDeviceState(deviceId, {
                command: 'turnOn',
                parameter: 'default',
                commandType: 'command',
              })
              log.info(`[${deviceId}] Relay turned on successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to turn on relay:`, e)
              return { success: false, error: e }
            }
          },
          off: async () => {
            log.info(`[${deviceId}] Relay OFF command received`)
            if (!client) {
              log.warn(`[${deviceId}] No SwitchBot client available`)
              return { success: false }
            }
            try {
              const result = await client.setDeviceState(deviceId, {
                command: 'turnOff',
                parameter: 'default',
                commandType: 'command',
              })
              log.info(`[${deviceId}] Relay turned off successfully`)
              return { success: true, result }
            } catch (e) {
              log.error(`[${deviceId}] Failed to turn off relay:`, e)
              return { success: false, error: e }
            }
          },
        },
      }

    default:
      return undefined
  }
}

/**
 * Resolves the Matter device type for a given device, using the Matter API and device type mappings.
 * Used to map normalized device types to Matter device type definitions.
 *
 * @param matterApi - The Matter API object containing deviceTypes
 * @param type - The normalized device type string
 * @param createdDeviceType - Optionally, an already created device type object
 * @param clusters - Optionally, the clusters object for the device
 * @returns The resolved Matter device type object
 */
const DEVICE_MATTER_DEVICE_TYPE_KEYS: Record<string, string> = {
  bot: 'OnOffSwitch',
  vacuum: 'RoboticVacuumCleaner',
  curtain: 'WindowCovering',
  blindtilt: 'WindowCovering',
  fan: 'Fan',
  light: 'DimmableLight',
  lightstrip: 'ExtendedColorLight',
  lock: 'DoorLock',
  motion: 'MotionSensor',
  contact: 'ContactSensor',
  humidifier: 'Fan',
  temperature: 'TemperatureSensor',
  relay: 'OnOffSwitch',
  plug: 'OnOffOutlet',
  meter: 'TemperatureSensor',
  waterdetector: 'LeakSensor',
}

export function resolveMatterDeviceType(matterApi: any, type: string, createdDeviceType?: any, clusters?: any): any {
  if (createdDeviceType && typeof createdDeviceType === 'object' && typeof createdDeviceType.with === 'function') {
    return createdDeviceType
  }

  const lowerType = (typeof createdDeviceType === 'string' && createdDeviceType) ? createdDeviceType.toLowerCase() : (type || '').toLowerCase()

  // Cluster-based upgrade for color lights if descriptor omitted device type.
  const hasColorControl = !!clusters?.colorControl
  const inferredType = hasColorControl && lowerType === 'light'
    ? 'lightstrip'
    : lowerType

  const mappedKey = DEVICE_MATTER_DEVICE_TYPE_KEYS[inferredType] || 'OnOffSwitch'
  return matterApi?.deviceTypes?.[mappedKey] || matterApi?.deviceTypes?.OnOffSwitch
}

/**
 * Canonical Matter cluster ID mapping (from matter.js clusters).
 * Maps cluster names to their numeric cluster IDs.
 *
 * @example
 * MATTER_CLUSTER_IDS.OnOff // 0x0006
 */
export const MATTER_CLUSTER_IDS = {
  OnOff: 0x0006,
  LevelControl: 0x0008,
  ColorControl: 0x0300,
  WindowCovering: 0x0102,
  DoorLock: 0x0101,
  FanControl: 0x0202,
  RelativeHumidityMeasurement: 0x0405,
} as const

/**
 * Common Matter attribute IDs grouped by cluster.
 * Maps cluster names to objects mapping attribute names to their numeric attribute IDs.
 *
 * @example
 * MATTER_ATTRIBUTE_IDS.OnOff.OnOff // 0x0000
 */
export const MATTER_ATTRIBUTE_IDS = {
  OnOff: { OnOff: 0x0000 },
  LevelControl: { CurrentLevel: 0x0000 },
  ColorControl: { CurrentHue: 0x0000, CurrentSaturation: 0x0001, ColorTemperatureMireds: 0x0002 },
  WindowCovering: { CurrentPosition: 0x0000, TargetPosition: 0x0001 },
  FanControl: { SpeedCurrent: 0x0000 },
  DoorLock: { LockState: 0x0000 },
  RelativeHumidityMeasurement: { MeasuredValue: 0x0000 },
} as const

/**
 * Normalizes a device type string for Matter integration.
 * Maps various device type aliases and variants to canonical Matter device types.
 *
 * @param {string | undefined | null} typeValue - The device type string to normalize.
 * @returns {string} The normalized device type string for Matter.
 *
 * @example
 * normalizeTypeForMatter('wosweeper') // 'vacuum'
 * normalizeTypeForMatter('curtain3') // 'curtain'
 * normalizeTypeForMatter('plug mini (us)') // 'plug'
 */
export function normalizeTypeForMatter(typeValue: string | undefined | null): string {
  const raw = String(typeValue || '').trim().toLowerCase()
  if (!raw) {
    return 'unknown'
  }

  // Vacuum variants
  if (['wosweeper', 'wosweepermini', 'wosweeperminipro', 'k10+', 'k10+ pro'].includes(raw)) {
    return 'vacuum'
  }

  // Window covering variants
  if (['curtain', 'curtain3', 'rollershade', 'roller shade', 'worollershade', 'wo rollershade'].includes(raw)) {
    return 'curtain'
  }

  // Blind tilt variants (normalized to 'blindtilt' for Matter since it uses tilt-capable cluster)
  if (['blindtilt', 'blind tilt'].includes(raw)) {
    return 'blindtilt'
  }

  // Plug variants
  if (['plug mini (jp)', 'plug mini (us)', 'plug mini (eu)'].includes(raw)) {
    return 'plug'
  }

  // Meter variants
  if (['meterplus', 'meter plus', 'meter plus (jp)', 'meterpro', 'meter pro', 'meterpro(co2)', 'meter pro (co2)'].includes(raw)) {
    return 'meter'
  }

  // Relay switch variants
  if (['relay switch 1', 'relay switch 1pm'].includes(raw)) {
    return 'relay'
  }

  // Water detector variants
  if (['water detector', 'waterdetector'].includes(raw)) {
    return 'waterdetector'
  }

  // Fan variants
  if (['smart fan', 'circulator fan', 'battery circulator fan', 'standing circulator fan'].includes(raw)) {
    return 'fan'
  }

  // Light variants
  if (['strip light', 'strip light 3', 'rgbic neon rope light', 'rgbic neon wire rope light', 'rgbicww floor lamp', 'rgbicww strip light'].includes(raw)) {
    return 'lightstrip'
  }
  if (['color bulb', 'ceiling light', 'ceiling light pro', 'candle warmer lamp', 'floor lamp'].includes(raw)) {
    return 'light'
  }

  // Sensor variants
  if (raw === 'motion sensor') {
    return 'motion'
  }
  if (['contact sensor', 'presence sensor'].includes(raw)) {
    return 'contact'
  }

  // Lock variants
  if (['smart lock', 'smart lock pro', 'smart lock ultra', 'lock lite', 'keypad', 'keypad touch', 'keypad vision', 'keypad vision pro', 'lock vision pro'].includes(raw)) {
    return 'lock'
  }

  // Climate variant
  if (raw === 'humidifier2') {
    return 'humidifier'
  }

  return raw
}

/**
 * Normalizes a Homebridge PlatformConfig object to a SwitchBotPluginConfig.
 *
 * @param raw The raw Homebridge platform config object.
 * @returns The normalized plugin config object.
 */
export function normalizeConfig(raw?: PlatformConfig): SwitchBotPluginConfig {
  if (!raw) {
    return {}
  }
  return { ...(raw as any) } as SwitchBotPluginConfig
}

// Create a Proxy constructor that instantiates the right platform implementation at runtime.
/**
 * Creates a proxy class that instantiates the correct platform implementation (HAP or Matter) at runtime.
 *
 * @param HAPPlatform The HAP platform class constructor.
 * @param MatterPlatform The Matter platform class constructor.
 * @returns A proxy class that delegates to the correct platform implementation.
 *
 * @class SwitchBotPlatformProxy
 * @property impl The instantiated platform implementation (HAP or Matter).
 */
export function createPlatformProxy(HAPPlatform: any, MatterPlatform: any): any {
  return class SwitchBotPlatformProxy {
    /** The instantiated platform implementation (HAP or Matter) */
    private impl: any
    /**
     * Constructs the proxy and instantiates the correct platform implementation.
     * @param log Logger instance
     * @param config Platform config
     * @param api Homebridge API instance
     * @returns The instantiated platform implementation
     */
    constructor(log: any, config: PlatformConfig, api: any) {
      const cfg = normalizeConfig(config)
      const preferMatter = cfg.preferMatter ?? true
      const enableMatter = cfg.enableMatter ?? true
      const matterAvailable = !!(api?.isMatterAvailable?.() && api?.isMatterEnabled?.())

      if (enableMatter && preferMatter && MatterPlatform && matterAvailable) {
        this.impl = new MatterPlatform(log, cfg, api)
        return this.impl
      }

      // Fallback to HAP
      this.impl = new HAPPlatform(log, cfg, api)
      return this.impl
    }
  }
}
