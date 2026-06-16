export type DeviceCommandHandler = (device: any, body: any) => Promise<any>;
export interface DeviceCommandMap {
    [command: string]: DeviceCommandHandler;
}
export interface DeviceTypeCommandMap {
    [deviceType: string]: DeviceCommandMap;
}
export declare const deviceTypeCommandMap: DeviceTypeCommandMap;
export declare function getDeviceCommandHandler(deviceType: string, command: string): DeviceCommandHandler | undefined;
//# sourceMappingURL=deviceCommandMapper.d.ts.map