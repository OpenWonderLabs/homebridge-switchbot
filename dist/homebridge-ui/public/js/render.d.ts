/**
 * Get RSSI signal quality level and color based on dBm value
 * @param rssi Signal strength in dBm (typically -30 to -90)
 * @returns Object with quality level, color, and description
 */
export declare function getRssiSignalQuality(rssi: number | undefined): {
    level: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
    color: string;
    bgColor: string;
    description: string;
    bars: number;
};
/**
 * Create visual signal strength indicator bars
 * @param rssi Signal strength in dBm
 * @returns HTML element showing filled bars
 */
export declare function renderSignalBars(rssi: number | undefined): HTMLElement;
/**
 * Create signal quality badge with color
 * @param rssi Signal strength in dBm
 * @returns HTML element showing quality level
 */
export declare function renderSignalQualityBadge(rssi: number | undefined): HTMLElement;
export declare function renderBadge(text: string, style: string): HTMLElement;
export declare function renderConnectionBadge(connectionType: string): HTMLElement | null;
export declare function renderIRBadge(): HTMLElement;
export declare function renderDeviceDetailsPanel(device: any): HTMLElement;
export declare function renderDiscoveredDevices(devices: any[], options?: {
    configuredIds?: Set<string>;
    selectedIds?: Set<string>;
    onToggleSelect?: (device: any, selected: boolean) => void;
}): Promise<HTMLElement>;
/**
 * Filter devices by connection type and search query
 * @param devices Discovered devices array
 * @param connectionType Filter: 'all' | 'ble' | 'api' | 'both' | 'ir'
 * @param searchQuery Search term to match against name/id/type
 * @returns Filtered devices array
 */
export declare function filterDevices(devices: any[], connectionType?: 'all' | 'ble' | 'api' | 'both' | 'ir', searchQuery?: string): any[];
/**
 * Sort devices by specified criteria
 * @param devices Devices array to sort
 * @param sortBy Sort criterion: 'name' | 'signal' | 'type' | 'connection'
 * @returns Sorted devices array
 */
export declare function sortDevices(devices: any[], sortBy?: 'name' | 'signal' | 'type' | 'connection'): any[];
/**
 * Get filter/sort preferences from localStorage
 * @returns Object with current filter and sort preferences
 */
export declare function getDiscoveryPreferences(): {
    connectionType: 'all' | 'ble' | 'api' | 'both' | 'ir';
    sortBy: 'name' | 'signal' | 'type' | 'connection';
    searchQuery: string;
};
/**
 * Save filter/sort preferences to localStorage
 * @param preferences Preferences object to save
 * @param preferences.connectionType Connection type filter
 * @param preferences.sortBy Sort criterion
 * @param preferences.searchQuery Search query string
 */
export declare function setDiscoveryPreferences(preferences: {
    connectionType: 'all' | 'ble' | 'api' | 'both' | 'ir';
    sortBy: 'name' | 'signal' | 'type' | 'connection';
    searchQuery: string;
}): void;
export declare function renderDeviceList(list: any[]): void;
//# sourceMappingURL=render.d.ts.map