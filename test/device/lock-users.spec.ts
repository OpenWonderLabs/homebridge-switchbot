import { describe, expect, it, vi } from 'vitest'

import { LockDevice } from '../../src/devices/genericDevice'

const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }

const failRegex = /fail/

describe('lockDevice user management', () => {
  function makeLock(id: string) {
    const lock = new LockDevice({ id, type: 'Smart Lock' }, { log: mockLogger });
    (lock as any).client = { setDeviceState: vi.fn().mockResolvedValue({ status: 'success' }) }
    return lock
  }

  it('should add a user', async () => {
    const lock = makeLock('lock1')
    await lock.setState({ addUser: { name: 'Alice', code: '1234' } })
    expect((lock as any).client.setDeviceState).toHaveBeenCalledWith('lock1', { addUser: { name: 'Alice', code: '1234' } })
  })

  it('should remove a user', async () => {
    const lock = makeLock('lock2')
    await lock.setState({ removeUser: { name: 'Bob' } })
    expect((lock as any).client.setDeviceState).toHaveBeenCalledWith('lock2', { removeUser: { name: 'Bob' } })
  })

  it('should return error if setDeviceState fails', async () => {
    const lock = makeLock('lock3');
    ((lock as any).client.setDeviceState as any).mockRejectedValueOnce(new Error('fail'))
    const result = await lock.setState({ addUser: { name: 'Eve', code: '9999' } })
    expect(result.success).toBe(false)
    expect(result.reason).toMatch(failRegex)
  })
})
