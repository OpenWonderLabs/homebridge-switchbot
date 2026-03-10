import type { SwitchBotPluginConfig } from '../settings.js'

import { MATTER_ATTRIBUTE_IDS, MATTER_CLUSTER_IDS } from '../utils.js'

export interface DeviceOptions {
  id: string
  type: string
  name?: string
  [key: string]: any
}

export abstract class DeviceBase {
  protected opts: DeviceOptions
  protected cfg: SwitchBotPluginConfig
  protected client: any | null

  constructor(opts: DeviceOptions, cfg: SwitchBotPluginConfig) {
    this.opts = opts
    this.cfg = cfg
    this.client = (cfg as any)?._client ?? null
  }

  // Initialize any connections/resources
  async init(): Promise<void> {}

  // Return current device state from SwitchBot or cache
  abstract getState(): Promise<any>

  // Apply a state change to the device
  abstract setState(change: any): Promise<any>

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
  createHAPAccessory(api: any): any {
    const base: any = {
      id: this.opts.id,
      name: this.opts.name ?? this.opts.type,
      protocol: 'hap',
      services: [
        {
          type: 'Switch',
          characteristics: {
            On: {
              get: async () => {
                const s = await this.getState()
                return !!(s && (s.on === true || s.state === 'on' || s.power === 'on'))
              },
              set: async (v: any) => {
                await this.setState({ on: !!v })
              },
            },
          },
        },
      ],
    }

    try {
      const hap = api?.hap
      if (hap && hap.Service && hap.Characteristic) {
        base._resolved = { Service: hap.Service, Characteristic: hap.Characteristic }
      }
    } catch (e) {
      // ignore
    }

    return base
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
  createMatterAccessory(api: any): any {
    const base: any = {
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
                const s = await this.getState()
                return !!(s && (s.on === true || s.state === 'on' || s.power === 'on'))
              },
              write: async (v: any) => this.setState({ on: !!v }),
            },
            [MATTER_ATTRIBUTE_IDS.OnOff.OnOff]: {
              read: async () => {
                const s = await this.getState()
                return !!(s && (s.on === true || s.state === 'on' || s.power === 'on'))
              },
              write: async (v: any) => this.setState({ on: !!v }),
            },
          },
        },
      ],
    }

    try {
      const matter = api?.matter
      if (matter) {
        base._resolved = {
          matter,
        }
      }
    } catch (e) {
      // ignore
    }

    return base
  }

  async destroy(): Promise<void> {}
}
