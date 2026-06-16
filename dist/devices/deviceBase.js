import { MATTER_ATTRIBUTE_IDS, MATTER_CLUSTER_IDS } from '../utils.js';
export class DeviceBase {
    opts;
    cfg;
    client;
    constructor(opts, cfg) {
        this.opts = opts;
        this.cfg = cfg;
        this.client = cfg?._client ?? null;
    }
    // Initialize any connections/resources
    async init() { }
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
    createHAPAccessory(api) {
        const base = {
            id: this.opts.id,
            name: this.opts.name ?? this.opts.type,
            protocol: 'hap',
            services: [
                {
                    type: 'Switch',
                    characteristics: {
                        On: {
                            get: async () => {
                                const s = await this.getState();
                                return !!(s && (s.on === true || s.state === 'on' || s.power === 'on'));
                            },
                            set: async (v) => {
                                await this.setState({ on: !!v });
                            },
                        },
                    },
                },
            ],
        };
        try {
            const hap = api?.hap;
            if (hap && hap.Service && hap.Characteristic) {
                base._resolved = { Service: hap.Service, Characteristic: hap.Characteristic };
            }
        }
        catch (e) {
            // ignore
        }
        return base;
    }
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
    createMatterAccessory(api) {
        const base = {
            id: this.opts.id,
            name: this.opts.name ?? this.opts.type,
            protocol: 'matter',
            clusters: [
                {
                    type: 'OnOff',
                    clusterId: MATTER_CLUSTER_IDS.OnOff,
                    attributes: {
                        onOff: {
                            read: async () => {
                                const s = await this.getState();
                                return !!(s && (s.on === true || s.state === 'on' || s.power === 'on'));
                            },
                            write: async (v) => this.setState({ on: !!v }),
                        },
                        [MATTER_ATTRIBUTE_IDS.OnOff.OnOff]: {
                            read: async () => {
                                const s = await this.getState();
                                return !!(s && (s.on === true || s.state === 'on' || s.power === 'on'));
                            },
                            write: async (v) => this.setState({ on: !!v }),
                        },
                    },
                },
            ],
        };
        try {
            const matter = api?.matter;
            if (matter) {
                base._resolved = {
                    matter,
                };
            }
        }
        catch (e) {
            // ignore
        }
        return base;
    }
    async destroy() { }
}
//# sourceMappingURL=deviceBase.js.map