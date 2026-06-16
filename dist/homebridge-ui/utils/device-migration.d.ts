export interface DeviceMigrationResult {
    migrated: boolean;
    originalType: string | undefined;
    correctedType: string | null;
    message: string;
}
/**
 * Validate and optionally correct a device's configDeviceType
 * @param device Device object from config
 * @param autoCorrect Whether to auto-correct invalid types
 * @returns Migration result with details
 */
export declare function validateAndMigrateDeviceType(device: any, autoCorrect?: boolean): DeviceMigrationResult;
/**
 * Validate all devices in config and optionally auto-correct invalid types
 * @param config Configuration object containing devices array
 * @param autoCorrect Whether to auto-correct invalid types
 * @returns Array of migration results with statistics
 */
export declare function validateAndMigrateConfig(config: any, autoCorrect?: boolean): {
    results: DeviceMigrationResult[];
    statistics: {
        total: number;
        valid: number;
        corrected: number;
        invalid: number;
    };
    warnings: string[];
};
/**
 * Get list of all valid device types for error messages
 * @returns Array of valid device types grouped by category
 */
export declare function getValidDeviceTypesList(): Record<string, readonly string[]>;
//# sourceMappingURL=device-migration.d.ts.map