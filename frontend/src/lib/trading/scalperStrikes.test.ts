import { describe, expect, it } from 'vitest'
import { resolveScalperStrikes } from './scalperStrikes'

const rows = [22300, 22100, 22200].map((strike) => ({ strike }))

describe('Scalper strike defaults and independent selections', () => {
  it('opens both legs at ATM, independent of cached previous selections', () => {
    expect(resolveScalperStrikes(rows, 22200)).toEqual({ atm: 22200, ce: '22200', pe: '22200' })
  })
  it('preserves a manual call when a late response updates the ATM default for the put', () => {
    expect(resolveScalperStrikes(rows, 22300, { ce: '22100', pe: null }))
      .toEqual({ atm: 22300, ce: '22100', pe: '22300' })
  })
  it('keeps a manual put when the call selection changes or the chain refreshes', () => {
    expect(resolveScalperStrikes(rows, 22200, { ce: '22300', pe: '22100' }))
      .toEqual({ atm: 22200, ce: '22300', pe: '22100' })
  })
  it('falls back only the missing leg to the nearest available ATM strike', () => {
    expect(resolveScalperStrikes(rows, 22210, { ce: '99999', pe: '22100' }))
      .toEqual({ atm: 22200, ce: '22200', pe: '22100' })
  })
  it('does not create a strike when the contract list is empty', () => {
    expect(resolveScalperStrikes([], 22200)).toEqual({ atm: null, ce: '', pe: '' })
  })
})
