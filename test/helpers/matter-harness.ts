export function makeFakeMatterApi() {
  const registered: any[] = []
  return {
    uuid: { generate: (s: string) => `m-${s}` },
    registerPlatformAccessories: async (_plugin: string, _name: string, accs: any[]) => {
      registered.push(...accs)
    },
    getRegistered: () => registered,
  }
}

export function makeFakeHap() {
  return {
    uuid: { generate: (s: string) => `h-${s}` },
    Service: { Switch: 'Switch', Lightbulb: 'Lightbulb', Fan: 'Fan', WindowCovering: 'WindowCovering', LockMechanism: 'LockMechanism', HumiditySensor: 'HumiditySensor' },
    Characteristic: { On: 'On', Brightness: 'Brightness', RotationSpeed: 'RotationSpeed', CurrentPosition: 'CurrentPosition', TargetPosition: 'TargetPosition' },
  }
}

export function makeFakeApiWithMatter(matterApi?: any) {
  const matter = matterApi || makeFakeMatterApi()
  const api: any = {
    matter,
    isMatterAvailable: () => true,
    isMatterEnabled: () => true,
    hap: makeFakeHap(),
  }
  return api
}

export function makeFakeApiWithoutMatter() {
  // Provide a minimal platformAccessory constructor and registerPlatformAccessories
  interface IPlatformAccessory {
    displayName: string
    UUID: string
    services: any[]
    context: Record<string, any>
    getService: (type: any) => any
    addService: (type: any) => any
  }
  function PlatformAccessory(this: IPlatformAccessory, name: string, uuid: string) {
    this.displayName = name
    this.UUID = uuid
    this.services = []
    this.context = {}
  }
  PlatformAccessory.prototype.getService = function (this: IPlatformAccessory, type: any) {
    return this.services.find((s: any) => s.type === type)
  }
  PlatformAccessory.prototype.addService = function (this: IPlatformAccessory, type: any) {
    const s: any = { type, characteristics: {} }
    this.services.push(s)
    return s
  }

  return {
    isMatterAvailable: () => false,
    isMatterEnabled: () => false,
    hap: makeFakeHap(),
    platformAccessory: PlatformAccessory,
    registerPlatformAccessories: () => {},
    on: () => {},
  }
}
