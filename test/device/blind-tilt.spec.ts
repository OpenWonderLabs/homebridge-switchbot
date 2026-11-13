import { describe, expect, it, vi } from 'vitest'

import { DEVICE_TYPES } from '../../src/device-types'
import { createDevice } from '../../src/deviceFactory'
import { BlindTiltDevice } from '../../src/devices/genericDevice'
import { normalizeTypeForMatter } from '../../src/utils'

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}
const config = {
  logger: log,
  log,
  _client: {
    getCachedDevice: () => undefined,
  },
} as any

// Issue #1453: both platforms pass createDevice the type from normalizeTypeForMatter, which turns
// 'Blind Tilt' into 'blindtilt'. That key was missing, so Blind Tilts became a GenericDevice and
// were exposed as a Switch that sent turnOn.
describe('blind Tilt accessory (#1453)', () => {
  it('creates a BlindTiltDevice from the configured and the normalized type', async () => {
    for (const type of [
      'Blind Tilt',
      normalizeTypeForMatter('Blind Tilt'),
    ]) {
      const { instance } = await createDevice({ id: 'blind', type, deviceType: 'Blind Tilt' }, config, false)
      expect(instance).toBeInstanceOf(BlindTiltDevice)
      expect(instance.createHAPAccessory({}).services[0].type).toBe('WindowCovering')
    }
  })

  it('never turns a known type into a GenericDevice when the type is normalized', async () => {
    const downgraded: string[] = []
    for (const type of Object.values(DEVICE_TYPES).flat()) {
      const configured = await createDevice({ id: type, type }, config, false)
      if (configured.instance.constructor.name === 'GenericDevice') {
        continue
      }
      const normalized = await createDevice({
        id: type,
        type: normalizeTypeForMatter(type),
        deviceType: type,
      }, config, false)
      if (normalized.instance.constructor.name === 'GenericDevice') {
        downgraded.push(`${type} -> ${normalizeTypeForMatter(type)}`)
      }
    }
    expect(downgraded).toEqual([])
  })
})

describe('blind Tilt position', () => {
  function blindTilt(position: number) {
    const advertisement = { position }
    const client = {
      getCachedDevice: () => ({
        hasBLE: () => true,
        getInfo: () => ({ bleServiceData: advertisement }),
      }),
    }
    const device = new BlindTiltDevice({
      id: 'blind',
      type: 'blindtilt',
      log,
      blePollingEnabled: false,
    }, { _client: client, log } as any)
    const setState = vi.spyOn(device, 'setState').mockResolvedValue(true)
    const characteristics = device.createHAPAccessory({}).services[0].characteristics
    return { characteristics, setState, advertisement }
  }

  it.each([
    [0, 0], // closed down
    [25, 50],
    [50, 100], // open
    [75, 50],
    [100, 0], // closed up
  ])('reports tilt position %i as %i percent open', async (tilt, open) => {
    expect(await blindTilt(tilt).characteristics.CurrentPosition.get()).toBe(open)
  })

  it('opens and closes on the down side by default', async () => {
    const { characteristics, setState } = blindTilt(0)
    await characteristics.CurrentPosition.get()
    await characteristics.TargetPosition.set(100)
    expect(setState).toHaveBeenLastCalledWith({ position: 50 })
    await characteristics.TargetPosition.set(40)
    expect(setState).toHaveBeenLastCalledWith({ position: 20 })
    await characteristics.TargetPosition.set(0)
    expect(setState).toHaveBeenLastCalledWith({ position: 0 })
  })

  it('keeps to the up side when the blind was last tilted up', async () => {
    const { characteristics, setState } = blindTilt(90)
    expect(await characteristics.CurrentPosition.get()).toBe(20)
    await characteristics.TargetPosition.set(60)
    expect(setState).toHaveBeenLastCalledWith({ position: 70 })
    await characteristics.TargetPosition.set(0)
    expect(setState).toHaveBeenLastCalledWith({ position: 100 })
  })
})
