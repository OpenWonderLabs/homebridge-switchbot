import { describe, expect, it } from 'vitest'

import { MotionSensorDevice } from '../../src/devices/genericDevice'
import { DEVICE_MATTER_CLUSTERS } from '../../src/utils'

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

describe('matter cluster shapes', () => {
  it('declares only OnOff for plugs (no non-Matter electricalMeasurement cluster)', () => {
    expect(DEVICE_MATTER_CLUSTERS.plug).toEqual({
      onOff: { onOff: false },
    })
    expect(DEVICE_MATTER_CLUSTERS.plug).not.toHaveProperty('electricalMeasurement')
  })

  it('declares no cluster named electricalMeasurement for any device type', () => {
    for (const clusters of Object.values(DEVICE_MATTER_CLUSTERS)) {
      expect(clusters).not.toHaveProperty('electricalMeasurement')
    }
  })

  it('declares the motion sensor occupancy as a bitmap', () => {
    expect(DEVICE_MATTER_CLUSTERS.motion.occupancySensing.occupancy).toEqual({ occupied: false })
  })

  it.each([
    [
      { motion: true },
      true,
    ],
    [
      { moveDetected: true },
      true,
    ],
    [
      { motion: false },
      false,
    ],
    [
      { moveDetected: false },
      false,
    ],
  ])('reads occupancy %o as { occupied: %s }', async (state, occupied) => {
    const device = new MotionSensorDevice({ id: 'motion1', type: 'Motion Sensor' }, { log: mockLogger })
    device.getState = async () => state
    const matter = await device.createMatterAccessory({})
    const cluster = matter.clusters.find((c: any) => c.type === 'OccupancySensing')
    expect(cluster).toBeDefined()
    expect(await cluster.attributes.occupancy.read()).toEqual({ occupied })
  })
})
