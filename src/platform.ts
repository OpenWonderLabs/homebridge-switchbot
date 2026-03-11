import type { SwitchBotPluginConfig } from './settings.js'
import type { API, Logger, PlatformConfig } from 'homebridge'

import { createDevice } from './deviceFactory.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'
import { SwitchBotClient } from './switchbotClient.js'

// Which device types should prefer Matter if available
// Based on HAP service mappings: device implementations use specific HomeKit services
// that map to corresponding Matter clusters when Matter is enabled
const DEVICE_MATTER_SUPPORTED: Record<string, boolean> = {
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

// Default Matter cluster configurations by device type
// Maps device types to their Matter cluster states (used when device doesn't provide clusters)
// Note: wosweeper/curtain/plug variants are normalized before cluster lookup (see loadDevices)
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

function normalizeTypeForMatter(typeValue: string | undefined | null): string {
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

// Factory function to create Matter handlers with Homebridge logger integration
function createMatterHandlers(log: Logger, deviceId: string, type: string, client: any): any {
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

function resolveMatterDeviceType(matterApi: any, type: string, createdDeviceType?: any, clusters?: any): any {
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

export class SwitchBotHAPPlatform {
  api: API | undefined
  log: Logger
  config: SwitchBotPluginConfig
  devices: any[] = []
  // cached accessories restored by Homebridge
  accessories: Map<string, any>
  // Track last loaded config to detect changes
  private lastConfigHash: string = ''
  private configReloadInterval: NodeJS.Timeout | null = null

  private openApiPollTimers: Map<string, NodeJS.Timeout> = new Map()
  private openApiBatchTimer: NodeJS.Timeout | null = null
  private openApiRequestsToday = 0
  private openApiLastReset = 0

  constructor(log: Logger, config: PlatformConfig, api?: API) {
    this.log = log
    // Ensure both log and logger are set for downstream device constructors
    this.config = { ...(config as any), log, logger: log }
    this.api = api
    this.accessories = new Map()
    this.log.info('SwitchBot HAP platform initialized')

    // Create/shared SwitchBot client and attach to config so child devices reuse it.
    try {
      const client = new SwitchBotClient(this.config)
      void client.init()
      ;(this.config as any)._client = client
    } catch (e) {
      this.log.debug('Failed to create shared SwitchBot client', e)
    }

    // Wait for Homebridge to finish launching to create/register accessories
    if (this.api && typeof (this.api as any).on === 'function') {
      (this.api as any).on('didFinishLaunching', async () => {
        await this.loadDevicesWithMatterInit()
        this._setupOpenApiPolling()
        // Start periodic config reload to pick up UI changes
        this.configReloadInterval = setInterval(() => {
          void this.loadDevicesWithMatterInit()
        }, 10000) // Check every 10 seconds
      })
    } else {
      void this.loadDevicesWithMatterInit()
      this._setupOpenApiPolling()
      // Start periodic config reload to pick up UI changes
      this.configReloadInterval = setInterval(() => {
        void this.loadDevicesWithMatterInit()
      }, 10000) // Check every 10 seconds
    }
  }

  /**
   * Setup OpenAPI polling for all devices according to config (global, per-device, batch, rate limit)
   */
  private _setupOpenApiPolling() {
    // Clear any existing timers
    for (const t of this.openApiPollTimers.values()) clearInterval(t)
    this.openApiPollTimers.clear()
    if (this.openApiBatchTimer) {
      clearInterval(this.openApiBatchTimer)
    }
    this.openApiBatchTimer = null

    const cfg = this.config as any
    const devices = cfg.devices ?? []
    const globalRate = Math.max(Number(cfg.openApiRefreshRate) || 300, 30)
    const batchEnabled = cfg.matterBatchEnabled !== false
    const batchRate = Math.max(Number(cfg.matterBatchRefreshRate) || globalRate, 30)
    const batchConcurrency = Math.max(Number(cfg.matterBatchConcurrency) || 5, 1)
    const batchJitter = Math.max(Number(cfg.matterBatchJitter) || 0, 0)
    const dailyLimit = Math.max(Number(cfg.dailyApiLimit) || 10000, 1000)
    const dailyReserve = Math.max(Number(cfg.dailyApiReserveForCommands) || 1000, 0)
    const resetAtLocalMidnight = !!cfg.dailyApiResetLocalMidnight
    const webhookOnlyOnReserve = !!cfg.webhookOnlyOnReserve

    // Helper to reset daily counter
    const resetCounter = () => {
      this.openApiRequestsToday = 0
      this.openApiLastReset = Date.now()
      this.log.info('[OpenAPI] Daily request counter reset')
    }
    // Schedule reset at midnight
    const scheduleMidnightReset = () => {
      const now = new Date()
      let nextReset
      if (resetAtLocalMidnight) {
        nextReset = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
      } else {
        nextReset = new Date(now)
        nextReset.setUTCHours(24, 0, 1, 0)
      }
      const ms = nextReset.getTime() - now.getTime()
      setTimeout(() => {
        resetCounter()
        scheduleMidnightReset()
      }, ms)
    }
    scheduleMidnightReset()

    // Helper to check if polling is allowed
    const canPoll = () => {
      if (this.openApiRequestsToday + dailyReserve >= dailyLimit) {
        if (!webhookOnlyOnReserve) {
          this.log.warn('[OpenAPI] Daily request limit reached, pausing background polling')
        }
        return false
      }
      return true
    }

    // Per-device polling (devices with per-device refreshRate)
    for (const dev of devices) {
      const id = dev.deviceId ?? dev.id
      const enabled = dev.enabled !== false
      if (!id || !enabled) {
        continue
      }
      const perDeviceRate = dev.refreshRate ? Math.max(Number(dev.refreshRate), 30) : null
      if (perDeviceRate) {
        // Individual polling interval for this device
        const timer = setInterval(async () => {
          if (!canPoll()) {
            return
          }
          try {
            const client = (this.config as any)._client
            if (client && typeof client.getDevice === 'function') {
              await client.getDevice(id)
              this.openApiRequestsToday++
              this.log.debug(`[OpenAPI] Polled device ${id} (per-device interval ${perDeviceRate}s) [${this.openApiRequestsToday}/${dailyLimit}]`)
            }
          } catch (e) {
            this.log.debug(`[OpenAPI] Polling failed for device ${id}:`, (e as Error)?.message)
          }
        }, perDeviceRate * 1000)
        this.openApiPollTimers.set(id, timer)
      }
    }

    // Batched polling for all other devices
    if (batchEnabled) {
      // Devices not already polled individually
      const batchDevices = devices.filter((dev: any) => {
        const id = dev.deviceId ?? dev.id
        const enabled = dev.enabled !== false
        const perDeviceRate = dev.refreshRate ? Math.max(Number(dev.refreshRate), 30) : null
        return id && enabled && !perDeviceRate
      })
      // Optional jitter before first batch
      const startBatch = () => {
        this.openApiBatchTimer = setInterval(async () => {
          if (!canPoll()) {
            return
          }
          const client = (this.config as any)._client
          if (!client || typeof client.getDevice !== 'function') {
            return
          }
          // Limit concurrency
          const chunks: any[][] = []
          for (let i = 0; i < batchDevices.length; i += batchConcurrency) {
            chunks.push(batchDevices.slice(i, i + batchConcurrency))
          }
          for (const chunk of chunks) {
            await Promise.all(chunk.map(async (dev: any) => {
              try {
                await client.getDevice(dev.deviceId ?? dev.id)
                this.openApiRequestsToday++
                this.log.debug(`[OpenAPI] Batched poll device ${dev.deviceId ?? dev.id} [${this.openApiRequestsToday}/${dailyLimit}]`)
              } catch (e) {
                this.log.debug(`[OpenAPI] Batched polling failed for device ${dev.deviceId ?? dev.id}:`, (e as Error)?.message)
              }
            }))
          }
        }, batchRate * 1000)
      }
      if (batchJitter > 0) {
        setTimeout(startBatch, Math.floor(Math.random() * batchJitter * 1000))
      } else {
        startBatch()
      }
    }
  }

  /**
   * Ensures Matter API is loaded before loading devices.
   */
  private async loadDevicesWithMatterInit() {
    // Wait for Matter API to be loaded and available before loading devices
    const maxAttempts = 20 // Wait up to 10 seconds (20 x 500ms)
    let attempt = 0
    let matterLoaded = false
    if (
      this.api
      && typeof (this.api as any).isMatterAvailable === 'function'
      && typeof (this.api as any).isMatterEnabled === 'function'
      && typeof (this.api as any).loadMatterAPI === 'function'
    ) {
      if ((this.api as any).isMatterAvailable() && (this.api as any).isMatterEnabled()) {
        try {
          await (this.api as any).loadMatterAPI()
          this.log.info('Homebridge Matter API loaded successfully')
        } catch (e) {
          this.log.warn('Failed to load Homebridge Matter API', e)
        }
        // Wait for api.matter to be available
        while (attempt < maxAttempts) {
          if ((this.api as any).matter) {
            matterLoaded = true
            break
          }
          await new Promise(res => setTimeout(res, 500))
          attempt++
        }
        if (!matterLoaded) {
          this.log.warn('Matter API did not become available after loadMatterAPI()')
        }
      }
    }
    await this.loadDevices()
  }

  private getConfigHash(): string {
    // Create a simple hash of current device config to detect changes
    const devices = (this.config as any)?.devices ?? []
    return JSON.stringify(devices.map((d: any) => ({
      id: d.deviceId ?? d.id,
      type: d.configDeviceType ?? d.type,
      name: d.configDeviceName ?? d.name,
    })))
  }

  async loadDevices() {
    const devices = (this.config as any)?.devices ?? []
    for (const raw of devices) {
      // Normalize config keys from UI schema to internal shape
      const d: any = {
        id: raw.deviceId ?? raw.id,
        name: raw.configDeviceName ?? raw.name,
        type: raw.configDeviceType ?? raw.type ?? raw.deviceType ?? 'unknown',
        encryptionKey: raw.encryptionKey,
        keyId: raw.keyId,
        _raw: raw,
      }

      const type: string = normalizeTypeForMatter(d.type)
      const deviceOpts: any = { id: d.id, type, name: d.name, encryptionKey: d.encryptionKey, keyId: d.keyId, log: this.log }
      this.log.debug(`[Matter/Debug] Device options for ${d.name ?? d.id}:`, JSON.stringify(deviceOpts, null, 2))

      const matterSupported = !!DEVICE_MATTER_SUPPORTED[(type || '').toLowerCase()]
      // Auto-detect Matter from Homebridge API, allow manual override via config
      const matterAvailable = !!(this.api?.isMatterAvailable?.() && this.api?.isMatterEnabled?.())
      const matterEnabled = matterAvailable || !!this.config.enableMatter
      const useMatter = !!(matterEnabled && matterSupported && (!!this.config.preferMatter || matterAvailable))

      try {
        const created = await createDevice(deviceOpts, this.config, useMatter)
        this.devices.push(created)
        // Prefer Matter: try registering to the Matter child bridge first.
        let matterRegistered = false
        if (useMatter) {
          const matterApi = (this.api as any)?.matter
          if (this.api?.isMatterAvailable?.() && this.api?.isMatterEnabled?.() && matterApi && typeof matterApi.registerPlatformAccessories === 'function') {
            try {
              const createdDesc = await created.createAccessory(this.api)
              const uuid = matterApi.uuid.generate(`${d.id}`)
              const defaultClusters = DEVICE_MATTER_CLUSTERS[type.toLowerCase()] || { onOff: { onOff: false } }
              const clusters = createdDesc.clusters || defaultClusters
              const deviceType = resolveMatterDeviceType(matterApi, type, createdDesc.deviceType, clusters)
              const accessory: any = {
                UUID: uuid,
                displayName: createdDesc.name || d.name || type,
                deviceType,
                manufacturer: createdDesc.manufacturer || 'SwitchBot',
                model: createdDesc.model || type,
                serialNumber: createdDesc.serialNumber || d.id,
                reachable: createdDesc.reachable !== false,
                firmwareRevision: createdDesc.firmwareRevision || '1.0.0',
                hardwareRevision: createdDesc.hardwareRevision || '',
                clusters,
                handlers: createdDesc.handlers || createMatterHandlers(this.log, d.id, type, (this.config as any)?._client) || undefined,
                context: { deviceId: d.id, type, _created: true },
              }
              this.log.info(`[MatterDebug] Accessory descriptor for ${d.id}:`, JSON.stringify({
                UUID: accessory.UUID,
                displayName: accessory.displayName,
                deviceType: typeof accessory.deviceType === 'object' && accessory.deviceType?.name ? accessory.deviceType.name : accessory.deviceType,
                clusters: accessory.clusters,
                context: accessory.context,
              }, null, 2))
              await matterApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
              this.accessories.set(uuid, accessory)
              matterRegistered = true
              this.log.info(`[MatterDebug] Registered Matter accessory ${d.id} (${type}) with uuid=${uuid}`)
            } catch (e: any) {
              this.log.error(`[MatterDebug] Failed to register Matter accessory for ${d.id} (${type}):`, e && (e.stack || e.message || e))
              if (e && (e.message?.includes('Conformance') || e.message?.includes('enum value Rollershade') || e.message?.includes('Behaviors have errors'))) {
                try {
                  const uuid = matterApi.uuid.generate(`${d.id}`)
                  const cached = this.accessories.get(uuid)
                  if (cached && typeof this.api?.unregisterPlatformAccessories === 'function') {
                    this.log.warn(`[MatterDebug] Removing cached accessory for ${d.id} due to registration error`)
                    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [cached])
                    this.accessories.delete(uuid)
                  }
                } catch (cleanupErr) {
                  this.log.warn(`[MatterDebug] Failed to cleanup cached accessory for ${d.id}:`, cleanupErr)
                }
              }
            }
          } else {
            this.log.info(`Matter API not available for ${d.id} (${type}); skipping Matter registration and falling back to HAP`)
          }
        }

        // If Matter wasn't registered (either not supported, API missing, or registration failed), fall back to HAP registration.
        if (!matterRegistered && this.api && (this.api as any).hap) {
          // Basic HAP accessory creation using homebridge API when available
          try {
            const hap = (this.api as any).hap
            const uuid = hap.uuid.generate(`${d.id}`)
            // Reuse cached accessory if available by uuid
            let accessory: any = this.accessories.get(uuid)
            // If not found by uuid, attempt to find by stored deviceId in accessory.context
            if (!accessory) {
              for (const [, a] of this.accessories.entries()) {
                try {
                  if (a && a.context && a.context.deviceId === d.id) {
                    accessory = a
                    break
                  }
                } catch (e) {
                  // ignore
                }
              }
            }

            if (!accessory) {
              accessory = new (this.api as any).platformAccessory(d.name || type, uuid)
              // Store device metadata on accessory.context for persistence across restarts
              try {
                accessory.context = accessory.context || {}
                accessory.context.deviceId = d.id
                accessory.context.type = type
              } catch (e) {
                // ignore context failures
              }
              // Register new accessory with Homebridge so it's cached
              try {
                ;(this.api as any).registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
              } catch (e) {
                // older API variations may require different registration; ignore if unavailable
              }
              this.accessories.set(uuid, accessory)
            } else {
              // ensure context includes deviceId (in case restored accessory lacked it)
              try {
                accessory.context = accessory.context || {}
                accessory.context.deviceId = accessory.context.deviceId || d.id
                accessory.context.type = accessory.context.type || type
              } catch (e) {
                // ignore
              }
            }
            // Add basic service descriptor from device
            const accDesc = await created.createAccessory?.(this.api)
            if (accDesc && accDesc.services) {
              for (const s of accDesc.services) {
                const Service = hap.Service[s.type] || hap.Service[s.type]
                if (!Service) {
                  continue
                }
                const service = accessory.getService(Service) || accessory.addService(Service)
                for (const [charName, getterSetterRaw] of Object.entries(s.characteristics || {})) {
                  const getterSetter: any = getterSetterRaw
                  const Characteristic = (hap.Characteristic as any)[charName]
                  if (!Characteristic) {
                    continue
                  }
                  // Apply characteristic props if provided (min/max/step)
                  if (getterSetter && getterSetter.props) {
                    try {
                      service.getCharacteristic(Characteristic).setProps(getterSetter.props)
                    } catch (e) {
                      // ignore setProps failures on older HAP implementations
                    }
                  }

                  // Wire simple get/set handlers if provided
                  if (getterSetter && typeof getterSetter.get === 'function') {
                    service.getCharacteristic(Characteristic).onGet(getterSetter.get)
                  }
                  if (getterSetter && typeof getterSetter.set === 'function') {
                    service.getCharacteristic(Characteristic).onSet(getterSetter.set)
                  }
                }
              }
            }
            this.log.info(`Created/updated HAP accessory ${d.id} (${type})`)
          } catch (e) {
            this.log.warn('HAP accessory creation failed', e)
          }
        } else if (!matterRegistered) {
          this.log.info(`Created HAP descriptor for ${d.id} (${type}) (API not available to register)`)
        }
      } catch (e) {
        this.log.error(`Failed to create device ${d.id}:`, e as any)
      }
    }
    // Update hash after successfully loading devices
    this.lastConfigHash = this.getConfigHash()
  }

  // Example lifecycle method called by Homebridge
  async configureAccessory(accessory: any) {
    // Homebridge calls this for restored cached accessories — keep a reference.
    try {
      const uuid = accessory.UUID || accessory.UUID
      this.accessories.set(uuid, accessory)
      this.log.info(`Restored cached accessory ${accessory.displayName || uuid}`)
    } catch (e) {
      this.log.warn('configureAccessory failed to restore accessory', e)
    }
  }

  // Called by Homebridge when a cached Matter accessory is restored
  configureMatterAccessory?(accessory: any) {
    try {
      const uuid = accessory.uuid || accessory.UUID || accessory.uuid
      this.accessories.set(uuid, accessory)
      this.log.info(`Restored cached Matter accessory ${accessory.displayName || uuid}`)
    } catch (e) {
      this.log.warn('configureMatterAccessory failed to restore accessory', e)
    }
  }
}

// Matter platform implementation (placeholder)
export class SwitchBotMatterPlatform {
  api: API | undefined
  log: Logger
  config: SwitchBotPluginConfig
  devices: any[] = []
  accessories: Map<string, any>
  // Track last loaded config to detect changes
  private lastConfigHash: string = ''
  private configReloadInterval: NodeJS.Timeout | null = null

  constructor(log: Logger, config: PlatformConfig, api?: API) {
    this.log = log
    this.config = { ...(config as any), logger: log }
    this.api = api
    this.accessories = new Map()
    this.log.info('SwitchBot Matter platform initialized')

    if (this.api && typeof (this.api as any).on === 'function') {
      ;(this.api as any).on('didFinishLaunching', () => {
        ;(async () => {
          // After launch, perform discovery (if any) and register Matter accessories
          try {
            await this.loadDevices()
            if ((this.api as any).isMatterAvailable?.() && (this.api as any).isMatterEnabled?.() && (this.api as any).matter && typeof (this.api as any).matter.registerPlatformAccessories === 'function') {
              try {
                await (this as any).registerMatterAccessories?.()
              } catch (e) {
                this.log.warn('registerMatterAccessories failed', e)
              }
            }
          } catch (e) {
            this.log.warn('Error during Matter platform startup', e)
          }
        })()
        // Start periodic config reload to pick up UI changes
        this.configReloadInterval = setInterval(() => {
          void this.checkAndReloadDevices()
        }, 10000) // Check every 10 seconds
      })
    } else {
      void this.loadDevices()
      // Start periodic config reload to pick up UI changes
      this.configReloadInterval = setInterval(() => {
        void this.checkAndReloadDevices()
      }, 10000) // Check every 10 seconds
    }
    // Create/shared SwitchBot client and attach to config so child devices reuse it.
    try {
      const client = new SwitchBotClient(this.config)
      void client.init()
      ;(this.config as any)._client = client
    } catch (e) {
      this.log.debug('Failed to create shared SwitchBot client', e)
    }
  }

  async loadDevices() {
    const devices = (this.config as any)?.devices ?? []
    for (const raw of devices) {
      // Normalize config keys produced by the UI schema
      const d: any = {
        id: raw.deviceId ?? raw.id,
        name: raw.configDeviceName ?? raw.name,
        type: raw.configDeviceType ?? raw.type ?? raw.deviceType ?? 'unknown',
        _raw: raw,
      }

      const type: string = normalizeTypeForMatter(d.type)

      const matterSupported = !!DEVICE_MATTER_SUPPORTED[(type || '').toLowerCase()]
      // Auto-detect Matter from Homebridge API, allow manual override via config
      const matterAvailable = this.api?.isMatterAvailable?.() && this.api?.isMatterEnabled?.()
      const matterEnabled = matterAvailable || !!this.config.enableMatter
      const useMatter = matterEnabled && matterSupported
      try {
        const created = await createDevice({ id: d.id, type, name: d.name, log: this.log }, this.config, useMatter)
        this.devices.push(created)
        if (useMatter) {
          this.log.info(`Prepared Matter accessory for ${d.id} (${type})${matterAvailable ? ' (auto-detected)' : ' (manually enabled)'}`)
        } else {
          if (!matterEnabled) {
            this.log.info(`Skipping Matter for ${d.id} (${type}) - Matter not available on this bridge`)
          } else if (!matterSupported) {
            this.log.info(`Skipping Matter for ${d.id} (${type}) - device type not supported`)
          } else {
            this.log.info(`Skipping Matter for ${d.id} (${type}) - not supported`)
          }
        }
      } catch (e) {
        this.log.error(`Failed to create Matter device ${d.id}:`, e as any)
      }
    }
    // Update hash after successfully loading devices
    this.lastConfigHash = this.getConfigHash()
  }

  private getConfigHash(): string {
    // Create a simple hash of current device config to detect changes
    const devices = (this.config as any)?.devices ?? []
    return JSON.stringify(devices.map((d: any) => ({
      id: d.deviceId ?? d.id,
      type: d.configDeviceType ?? d.type,
      name: d.configDeviceName ?? d.name,
    })))
  }

  private async checkAndReloadDevices() {
    const currentHash = this.getConfigHash()
    if (currentHash !== this.lastConfigHash) {
      this.log.info('[SwitchBot] Detected config changes, reloading devices...')
      // Clear existing devices
      this.devices = []
      await this.loadDevices()
    }
  }

  async configureAccessory(accessory: any) {
    try {
      const uuid = accessory.UUID || accessory.UUID
      this.accessories.set(uuid, accessory)
      this.log.info(`Restored cached Matter accessory ${accessory.displayName || uuid}`)
    } catch (e) {
      this.log.warn('configureAccessory failed to restore Matter accessory', e)
    }
  }

  // Homebridge calls this when restoring cached Matter accessories
  configureMatterAccessory(accessory: any) {
    try {
      const uuid = accessory.uuid || accessory.UUID || accessory.uuid
      this.accessories.set(uuid, accessory)
      this.log.info(`Restored cached Matter accessory ${accessory.displayName || uuid}`)
    } catch (e) {
      this.log.warn('configureMatterAccessory failed to restore Matter accessory', e)
    }
  }

  // Register serialized Matter accessories via Homebridge Matter API
  async registerMatterAccessories() {
    if (!this.api) {
      return
    }
    const matterApi = (this.api as any).matter
    if (!matterApi || typeof matterApi.registerPlatformAccessories !== 'function') {
      this.log.info('Homebridge Matter API not available; skipping Matter accessory registration')
      return
    }

    const devices = (this.config as any)?.devices ?? []
    const accessoriesToRegister: any[] = []

    // Auto-detect Matter from Homebridge API
    const matterAvailable = this.api?.isMatterAvailable?.() && this.api?.isMatterEnabled?.()
    const matterEnabled = matterAvailable || !!this.config.enableMatter

    for (const raw of devices) {
      const d: any = {
        id: raw.deviceId ?? raw.id,
        name: raw.configDeviceName ?? raw.name,
        type: raw.configDeviceType ?? raw.type ?? raw.deviceType ?? 'unknown',
      }

      if (!d.id) {
        continue
      }

      const type: string = normalizeTypeForMatter(d.type)

      const matterSupported = !!DEVICE_MATTER_SUPPORTED[(type || '').toLowerCase()]
      const useMatter = matterEnabled && matterSupported
      if (!useMatter) {
        continue
      }

      try {
        const created = await createDevice({ id: d.id, type, name: d.name, log: this.log }, this.config, true)
        const createdDesc = await created.createAccessory(this.api)
        const uuid = matterApi.uuid.generate(`${d.id}`)
        // Try to find existing restored accessory by deviceId
        let existing: any | undefined
        for (const [, a] of this.accessories.entries()) {
          try {
            if (a && a.context && a.context.deviceId === d.id) {
              existing = a
              break
            }
          } catch (e) {
            // ignore
          }
        }

        if (existing) {
          // Ensure context and displayName are up to date
          // Prioritize device-specific Matter clusters (e.g., RVC for vacuum) over generic HAP-derived clusters
          let clusters = DEVICE_MATTER_CLUSTERS[type.toLowerCase()]
          if (!clusters) {
            clusters = existing.clusters || createdDesc.clusters || { onOff: { onOff: false } }
          }
          const deviceType = resolveMatterDeviceType(matterApi, type, existing.deviceType || createdDesc.deviceType, clusters)
          existing.context = existing.context || {}
          existing.context.deviceId = existing.context.deviceId || d.id
          existing.context.type = existing.context.type || type
          existing.deviceType = deviceType
          existing.manufacturer = existing.manufacturer || createdDesc.manufacturer || 'SwitchBot'
          existing.model = existing.model || createdDesc.model || type
          existing.serialNumber = existing.serialNumber || createdDesc.serialNumber || d.id
          existing.reachable = existing.reachable !== false
          existing.firmwareRevision = existing.firmwareRevision || createdDesc.firmwareRevision || '1.0.0'
          existing.hardwareRevision = existing.hardwareRevision || createdDesc.hardwareRevision || ''
          existing.clusters = clusters
          existing.handlers = createdDesc.handlers || createMatterHandlers(this.log, d.id, type, (this.config as any)?._client) || undefined
          existing.displayName = createdDesc.name || d.name || type
          existing.UUID = existing.UUID || existing.uuid || uuid
          accessoriesToRegister.push(existing)
          this.accessories.set(existing.UUID || uuid, existing)
        } else {
          // Prioritize device-specific Matter clusters (e.g., RVC for vacuum) over generic HAP-derived clusters
          let clusters = DEVICE_MATTER_CLUSTERS[type.toLowerCase()]
          if (!clusters) {
            clusters = createdDesc.clusters || { onOff: { onOff: false } }
          }
          const deviceType = resolveMatterDeviceType(matterApi, type, createdDesc.deviceType, clusters)
          const serialized: any = {
            UUID: uuid,
            displayName: createdDesc.name || d.name || type,
            deviceType,
            manufacturer: createdDesc.manufacturer || 'SwitchBot',
            model: createdDesc.model || type,
            serialNumber: createdDesc.serialNumber || d.id,
            reachable: createdDesc.reachable !== false,
            firmwareRevision: createdDesc.firmwareRevision || '1.0.0',
            hardwareRevision: createdDesc.hardwareRevision || '',
            clusters,
            handlers: createdDesc.handlers || createMatterHandlers(this.log, d.id, type, (this.config as any)?._client) || undefined,
            context: { deviceId: d.id, type, created: true },
          }
          accessoriesToRegister.push(serialized)
          this.accessories.set(uuid, serialized)
        }
      } catch (e) {
        this.log.warn(`Failed to prepare Matter accessory for ${d.id} (${type})`, e)
      }
    }

    if (accessoriesToRegister.length > 0) {
      try {
        await matterApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRegister)
        this.log.info(`Registered ${accessoriesToRegister.length} Matter accessory(ies) with Homebridge`)
      } catch (e) {
        this.log.warn('Failed to register Matter accessories', e)
      }
    } else {
      this.log.info('No Matter accessories to register')
    }
  }
}

export default SwitchBotHAPPlatform || SwitchBotMatterPlatform
