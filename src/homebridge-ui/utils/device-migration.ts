import { DEVICE_TYPES, isValidDeviceType, normalizeDeviceType } from '../../device-types.js'

export interface DeviceMigrationResult {
  migrated: boolean
  originalType: string | undefined
  correctedType: string | null
  message: string
}

/**
 * Validate and optionally correct a device's configDeviceType
 * @param device Device object from config
 * @param autoCorrect Whether to auto-correct invalid types
 * @returns Migration result with details
 */
export function validateAndMigrateDeviceType(
  device: any,
  autoCorrect = false,
): DeviceMigrationResult {
  const originalType = device.configDeviceType
  const deviceId = device.deviceId || device.id || 'unknown'

  // Check if type is valid
  if (isValidDeviceType(originalType)) {
    return {
      migrated: false,
      originalType,
      correctedType: originalType,
      message: `Device "${device.configDeviceName || deviceId}" type is valid`,
    }
  }

  // Try to find a valid mapping
  const correctedType = normalizeDeviceType(originalType)

  if (!correctedType) {
    return {
      migrated: false,
      originalType,
      correctedType: null,
      message: `Device "${device.configDeviceName || deviceId}" has invalid type "${originalType}" with no valid mapping`,
    }
  }

  // Found a valid mapping
  if (autoCorrect) {
    device.configDeviceType = correctedType
    return {
      migrated: true,
      originalType,
      correctedType,
      message: `Device "${device.configDeviceName || deviceId}" type auto-corrected: "${originalType}" → "${correctedType}"`,
    }
  } else {
    return {
      migrated: false,
      originalType,
      correctedType,
      message: `Device "${device.configDeviceName || deviceId}" requires migration: "${originalType}" → "${correctedType}"`,
    }
  }
}

/**
 * Validate all devices in config and optionally auto-correct invalid types
 * @param config Configuration object containing devices array
 * @param autoCorrect Whether to auto-correct invalid types
 * @returns Array of migration results with statistics
 */
export function validateAndMigrateConfig(
  config: any,
  autoCorrect = false,
): {
  results: DeviceMigrationResult[]
  statistics: {
    total: number
    valid: number
    corrected: number
    invalid: number
  }
  warnings: string[]
} {
  const results: DeviceMigrationResult[] = []
  const warnings: string[] = []
  let validCount = 0
  let correctedCount = 0
  let invalidCount = 0

  if (!config?.devices || !Array.isArray(config.devices)) {
    return {
      results,
      statistics: {
        total: 0,
        valid: 0,
        corrected: 0,
        invalid: 0,
      },
      warnings: ['No devices found in config'],
    }
  }

  for (const device of config.devices) {
    const result = validateAndMigrateDeviceType(device, autoCorrect)
    results.push(result)

    if (!result.originalType || isValidDeviceType(result.originalType)) {
      validCount++
    } else if (result.migrated) {
      correctedCount++
    } else if (result.correctedType) {
      warnings.push(
        `Device "${device.configDeviceName || device.deviceId}" needs correction: "${result.originalType}" → "${result.correctedType}"`,
      )
      invalidCount++
    } else {
      invalidCount++
      warnings.push(
        `Device "${device.configDeviceName || device.deviceId}" has INVALID type "${result.originalType}" with no mapping`,
      )
    }
  }

  // Validation complete - results and warnings are returned via return value
  // Caller (config endpoint) will handle logging/reporting

  return {
    results,
    statistics: {
      total: config.devices.length,
      valid: validCount,
      corrected: correctedCount,
      invalid: invalidCount,
    },
    warnings,
  }
}

/**
 * Get list of all valid device types for error messages
 * @returns Array of valid device types grouped by category
 */
export function getValidDeviceTypesList(): Record<string, readonly string[]> {
  return DEVICE_TYPES
}
