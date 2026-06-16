import type { SwitchBotPluginConfig } from '../settings.js';
export interface DeviceOptions {
    id: string;
    type: string;
    name?: string;
    [key: string]: any;
}
export declare abstract class DeviceBase {
    protected opts: DeviceOptions;
    protected cfg: SwitchBotPluginConfig;
    protected client: any | null;
    constructor(opts: DeviceOptions, cfg: SwitchBotPluginConfig);
    init(): Promise<void>;
    abstract getState(): Promise<any>;
    abstract setState(change: any): Promise<any>;
    /**
     * Create and return a HAP accessory descriptor.
     *
     * This method returns a descriptor object (not a platformAccessory instance).
     * The platform will use this descriptor to construct a real HAP accessory.
     *
     * Default descriptor provides a simple Switch service with an `On` characteristic
     * backed by `getState()` / `setState()` so most simple devices work out of the box.
     *
     * If the Homebridge `api` is passed, `Service` and `Characteristic` constructors
     * are included under `_resolved` for callers that need them.
     *
     * @example
     * {
     *   id: 'd1',
     *   name: 'My Device',
     *   protocol: 'hap',
     *   services: [ { type: 'Switch', characteristics: { On: { get: async ()=>true, set: async v=>{} } } } ]
     * }
     */
    createHAPAccessory(api: any): any;
    /**
     * Create and return a Matter accessory descriptor.
     *
     * Returns a descriptor containing `clusters` and attribute read/write handlers
     * which the platform will serialize when registering Matter accessories. The
     * default provides an `OnOff` cluster wired to `getState()` / `setState()`.
     *
     * If the Homebridge `api` provides a `matter` namespace it is attached under
     * `_resolved.matter` for callers that need direct access to the Matter API.
     */
    createMatterAccessory(api: any): any;
    destroy(): Promise<void>;
}
//# sourceMappingURL=deviceBase.d.ts.map