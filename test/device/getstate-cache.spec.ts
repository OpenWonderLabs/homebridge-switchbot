/* Copyright(C) 2021-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * getstate-cache.spec.ts: one fetch serves a burst of reads
 */

import { describe, expect, it, vi } from 'vitest'

import { GenericDevice } from '../../src/devices/genericDevice.js'

const log: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), success: vi.fn() }

function device() {
  const getDevice = vi.fn(async () => ({ getStatus: async () => ({ temperature: 22.7, humidity: 59 }) }))
  const d = new GenericDevice({ id: 'B0E9FED044E3', type: 'meter', name: 'M', log }, { log, _client: { getDevice } } as any)
  return { d, getDevice }
}

describe('genericDevice.getState caching', () => {
  // HomeKit reads every characteristic of an accessory at once. Seven
  // characteristics must not mean seven API requests.
  it('fetches once for a burst of concurrent reads', async () => {
    const { d, getDevice } = device()

    const states = await Promise.all([d.getState(), d.getState(), d.getState(), d.getState()])

    expect(getDevice).toHaveBeenCalledTimes(1)
    expect(states.every(s => s.temperature === 22.7)).toBe(true)
  })

  it('reuses the value for sequential reads inside the window', async () => {
    const { d, getDevice } = device()

    await d.getState()
    await d.getState()

    expect(getDevice).toHaveBeenCalledTimes(1)
  })

  it('fetches again once the window has passed', async () => {
    const { d, getDevice } = device()
    await d.getState()

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 20_000)
    await d.getState()
    vi.restoreAllMocks()

    expect(getDevice).toHaveBeenCalledTimes(2)
  })

  it('marks an unreadable device and does not cache it', async () => {
    const getDevice = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ getStatus: async () => ({ temperature: 21 }) })
    const d = new GenericDevice({ id: 'x', type: 'meter', name: 'M', log }, { log, _client: { getDevice } } as any)

    const first = await d.getState()
    const second = await d.getState()

    expect(first).toEqual({ id: 'x', type: 'meter', unreadable: true })
    expect(second.temperature).toBe(21)
  })
})
