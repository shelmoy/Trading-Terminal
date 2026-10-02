import { describe, expect, it } from 'vitest'
import {
  calculateATR,
  calculateRenkoV2BoxSize,
  RenkoV2Transform,
} from './renkoV2Transform'
import { runTransform } from 'openalgo-charts/transform'

describe('RenkoV2Transform', () => {
  it('implements traditional 2-brick reversal rule', () => {
    const transform = new RenkoV2Transform({ boxSize: 10 })

    // Bar 0: Starts at 100, closes at 110 -> 1st bullish brick: open=100, close=110
    const b0 = transform.push({ time: 1000, open: 100, high: 110, low: 100, close: 110 })
    expect(b0).toHaveLength(1)
    expect(b0[0].open).toBe(100)
    expect(b0[0].close).toBe(110)

    // Bar 1: Continuation up: closes at 120 -> 2nd bullish brick: open=110, close=120
    const b1 = transform.push({ time: 1060, open: 110, high: 120, low: 110, close: 120 })
    expect(b1).toHaveLength(1)
    expect(b1[0].open).toBe(110)
    expect(b1[0].close).toBe(120)

    // Bar 2: Small dip to 112 (only 8 pts down from 120, doesn't break open=110 - 10 = 100)
    // No reversal should trigger! (Eliminates whipsaws)
    const b2 = transform.push({ time: 1120, open: 120, high: 121, low: 112, close: 112 })
    expect(b2).toHaveLength(0)

    // Bar 3: Dip down to 105 (breaks below previous brick's close of 120, but not <= open - boxSize = 100)
    // In standard 1-brick renko this would reverse, but in 2-brick Renko it must NOT reverse!
    const b3 = transform.push({ time: 1180, open: 112, high: 113, low: 105, close: 105 })
    expect(b3).toHaveLength(0)

    // Bar 4: Drop down to 98 (penetrates below 100, which is 2 full bricks down from 120: open=110, close=100)
    // Reversal triggers!
    const b4 = transform.push({ time: 1240, open: 105, high: 105, low: 98, close: 98 })
    expect(b4).toHaveLength(1)
    expect(b4[0].open).toBe(110)
    expect(b4[0].close).toBe(100)
    expect(b4[0].high).toBe(110)
    expect(b4[0].low).toBe(100)

    // Bar 5: Bearish continuation: drops to 89 (<= 100 - 10 = 90)
    const b5 = transform.push({ time: 1300, open: 98, high: 98, low: 89, close: 89 })
    expect(b5).toHaveLength(1)
    expect(b5[0].open).toBe(100)
    expect(b5[0].close).toBe(90)
  })

  it('calculates percentage, points, and ATR box sizing accurately', () => {
    const bars = [
      { time: 1000, open: 100, high: 105, low: 95, close: 100 },
      { time: 1060, open: 100, high: 108, low: 98, close: 106 },
      { time: 1120, open: 106, high: 110, low: 102, close: 104 },
    ]

    // Mode: points
    const pts = calculateRenkoV2BoxSize(bars, { mode: 'points', points: 15.0, tickSize: 0.05 })
    expect(pts).toBe(15.0)

    // Mode: percent (0.04% of 104 = 0.0416 -> quantized to tick 0.05)
    const pct = calculateRenkoV2BoxSize(bars, { mode: 'percent', percent: 0.04, tickSize: 0.05 })
    expect(pct).toBe(0.05)

    // Mode: ATR
    const atr = calculateATR(bars, 14)
    expect(atr).toBeGreaterThan(0)
    const atrBox = calculateRenkoV2BoxSize(bars, { mode: 'atr', atrPeriod: 14, atrMultiplier: 1.0, tickSize: 0.05 })
    expect(atrBox).toBeGreaterThan(0)
  })

  it('runs smoothly through runTransform pipeline with ensureIncreasingTimes', () => {
    const bars = [
      { time: 1000, open: 100, high: 100, low: 100, close: 100 },
      { time: 1060, open: 100, high: 135, low: 100, close: 135 }, // Multiple bricks formed in single bar
    ]

    const transform = new RenkoV2Transform({ boxSize: 10 })
    const result = runTransform(transform, bars)

    expect(result.length).toBeGreaterThanOrEqual(3)
    // Verify times are strictly increasing (DataLayer requirement)
    for (let i = 1; i < result.length; i++) {
      expect(result[i].time).toBeGreaterThan(result[i - 1].time)
    }
  })
})
