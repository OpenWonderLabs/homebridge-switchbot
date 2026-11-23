/* Copyright(C) 2021-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved. */

import { Characteristic } from '@homebridge/hap-nodejs'
import { describe, expect, it, vi } from 'vitest'

import { LockDevice } from '../../src/devices/genericDevice.js'
import { SwitchBotHAPPlatform } from '../../src/SwitchBotHAPPlatform.js'

const ID = 'classic-lock'
const { LockCurrentState, LockTargetState } = Characteristic

function setupLock(initialStatus: object, deviceType = 'Smart Lock') {
  const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
  const getStatus = vi.fn().mockResolvedValue(initialStatus)
  const client = {
    getDevice: vi.fn(async () => ({ getStatus })),
  }
  const config = {
    _client: client,
    enableBLE: false,
    log,
    devices: [
      { id: ID, refreshRate: 30 },
    ],
  }
  const device = new LockDevice({ id: ID, type: 'lock', deviceType }, config)
  const { characteristics } = device.createHAPAccessory(undefined).services[0]
  return {
    config,
    device,
    getStatus,
    log,
    characteristics,
  }
}

describe('classic SwitchBot Lock HomeKit status', () => {
  it.each([
    [
      { lockState: 'locked', doorState: 'opened' },
      LockCurrentState.SECURED,
      LockTargetState.SECURED,
    ],
    [
      { lockState: 'locked', doorState: 'closed' },
      LockCurrentState.SECURED,
      LockTargetState.SECURED,
    ],
    [
      { lockState: 'unlocked', doorState: 'opened' },
      LockCurrentState.UNSECURED,
      LockTargetState.UNSECURED,
    ],
    [
      { lockState: 'unlocked', doorState: 'closed' },
      LockCurrentState.UNSECURED,
      LockTargetState.UNSECURED,
    ],
    [
      { locked: true },
      LockCurrentState.SECURED,
      LockTargetState.SECURED,
    ],
    [
      { locked: false },
      LockCurrentState.UNSECURED,
      LockTargetState.UNSECURED,
    ],
  ])('maps %j to current state %i and target state %i', async (status, current, target) => {
    const { characteristics } = setupLock(status)

    await expect(characteristics.LockCurrentState.get()).resolves.toBe(current)
    await expect(characteristics.LockTargetState.get()).resolves.toBe(target)
  })

  it('publishes a changed OpenAPI status on the next poll', async () => {
    vi.useFakeTimers()
    try {
      const { config, device, getStatus, log, characteristics } = setupLock({ lockState: 'unlocked', doorState: 'opened' })
      const current = {
        updateValue: vi.fn(),
      }
      const target = {
        updateValue: vi.fn(),
      }
      const entries = [
        {
          service: {
            getCharacteristic: () => current,
          },
          characteristic: LockCurrentState,
          get: characteristics.LockCurrentState.get,
        },
        {
          service: {
            getCharacteristic: () => target,
          },
          characteristic: LockTargetState,
          get: characteristics.LockTargetState.get,
        },
      ]
      const platform = Object.assign(Object.create(SwitchBotHAPPlatform.prototype), {
        config,
        log,
        hapPushTargets: new Map([
          [
            ID,
            { device, entries },
          ],
        ]),
        openApiPollTimers: new Map(),
        openApiRequestsToday: 0,
      })

      platform._setupOpenApiPolling()
      await vi.advanceTimersByTimeAsync(30_000)
      expect(current.updateValue).toHaveBeenLastCalledWith(LockCurrentState.UNSECURED)
      expect(target.updateValue).toHaveBeenLastCalledWith(LockTargetState.UNSECURED)

      getStatus.mockResolvedValue({ lockState: 'locked', doorState: 'opened' })
      await vi.advanceTimersByTimeAsync(30_000)
      expect(current.updateValue).toHaveBeenLastCalledWith(LockCurrentState.SECURED)
      expect(target.updateValue).toHaveBeenLastCalledWith(LockTargetState.SECURED)
      expect(getStatus).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('other SwitchBot Lock HomeKit status', () => {
  it.each(['Smart Lock Pro', 'Smart Lock Ultra', 'Lock Lite'])('keeps the existing boolean mapping for %s', async (deviceType) => {
    const secured = setupLock({ locked: true, lockState: 'unlocked' }, deviceType).characteristics
    const unsecured = setupLock({ locked: false, lockState: 'locked' }, deviceType).characteristics

    await expect(secured.LockCurrentState.get()).resolves.toBe(LockCurrentState.SECURED)
    await expect(secured.LockTargetState.get()).resolves.toBe(LockTargetState.SECURED)
    await expect(unsecured.LockCurrentState.get()).resolves.toBe(LockCurrentState.UNSECURED)
    await expect(unsecured.LockTargetState.get()).resolves.toBe(LockTargetState.UNSECURED)
  })
})
