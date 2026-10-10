import { describe, expect, it } from 'vitest'
import type { Position } from '@/types/trading'
import { calculateBrokerPnl } from './brokerPnl'

const row: Position = {
  symbol: 'EXAMPLECE',
  exchange: 'NFO',
  product: 'NRML',
  quantity: 50,
  average_price: 100,
  ltp: 110,
  pnl: 700,
  pnlpercent: 0,
}

describe('broker P&L in Scalper', () => {
  it('preserves partial-exit profits while a live mark moves', () => {
    expect(calculateBrokerPnl([row], new Map([['NFO:EXAMPLECE', 112]])).total).toBe(800)
  })
  it('adds closed positions without marking them again', () => {
    const closed = { ...row, quantity: 0, ltp: 0, pnl: 300 }
    const result = calculateBrokerPnl([row, closed], new Map())
    expect(result.total).toBe(1000)
    expect(result.positionTotals).toEqual({ closed: 300, open: 700 })
  })
  it('uses Kotak carry valuations and all day amounts even when entry cost differs', () => {
    const carried = {
      ...row,
      average_price: 70,
      day_pnl_inputs: {
        opening_quantity: 100,
        opening_value: 10000,
        buy_quantity: 0,
        sell_quantity: 50,
        buy_value: 0,
        sell_value: 6000,
        multiplier: 1,
      },
    }
    expect(calculateBrokerPnl([carried], new Map()).total).toBe(1500)
    expect(calculateBrokerPnl([carried], new Map([['NFO:EXAMPLECE', 112]])).total).toBe(1600)
  })
  it('keeps a fully closed carried position without needing quotes or tradebook', () => {
    const closed = {
      ...row,
      quantity: 0,
      ltp: 0,
      day_pnl_inputs: {
        opening_quantity: 100,
        opening_value: 10000,
        buy_quantity: 0,
        sell_quantity: 100,
        buy_value: 0,
        sell_value: 12000,
        multiplier: 1,
      },
    }
    expect(calculateBrokerPnl([closed], new Map()).total).toBe(2000)
  })
  it('applies short-position direction and contract multiplier', () => {
    const short = { ...row, quantity: -20, lot_size: 2, pnl: 500 }
    expect(calculateBrokerPnl([short], new Map([['NFO:EXAMPLECE', 108]])).total).toBe(580)
  })
  it('does not report a fabricated zero when an open valuation is missing', () => {
    expect(calculateBrokerPnl([{ ...row, ltp: 0 }], new Map()).total).toBeNull()
    expect(calculateBrokerPnl([], new Map()).total).toBe(0)
  })
})
