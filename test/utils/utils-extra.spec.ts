import { describe, expect, it } from 'vitest'

import * as utils from '../../src/utils'

describe('extra utils', () => {
  it('normalizeConfig returns empty object for undefined', () => {
    expect(utils.normalizeConfig(undefined)).toEqual({})
  })
  // Add more utility tests as needed
})
