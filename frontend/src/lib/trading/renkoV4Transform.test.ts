import { describe, expect, it } from 'vitest'
import { type Bar, getSeriesTransform } from 'openalgo-charts'
import {
  RenkoV4Run,
  RenkoV4Transform,
  calculateRenkoV4BoxSize,
  withRenkoV4Run,
} from './renkoV4Transform'

const bar = (close: number, time = 1000, open = close): Bar => ({
  time,
  open,
  high: Math.max(open, close),
  low: Math.min(open, close),
  close,
})

describe('Renko Version 4', () => {
  it('keeps every confirmed brick and trend point unchanged through 20,000 live ticks and delayed refreshes', () => {
    const run = new RenkoV4Run({ boxSize: 5 })
    run.setData([bar(10_000, 1_800_000_000)])
    run.update(bar(10_030, 1_800_000_000))
    const locked = structuredClone(run.elements())
    const lockedTrend = structuredClone(run.trendPoints())
    for (const brick of run.elements()) Object.freeze(brick)
    for (const point of run.trendPoints()) Object.freeze(point)
    let random = 123456789
    let price = 10_030
    for (let i = 1; i <= 20_000; i++) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0
      price += (random % 21) - 10
      const time = 1_800_000_000 + Math.floor(i / 10)
      run.update(bar(price, time))
      if (i % 200 === 0) {
        run.resumeLive()
        run.setData([bar(10_000, 1_800_000_000), bar(price + 100, time - 60)])
      }
    }
    expect(run.elements().slice(0, locked.length)).toEqual(locked)
    expect(run.trendPoints().slice(0, lockedTrend.length)).toEqual(lockedTrend)
    const bricks = run.elements()
    expect(bricks.length).toBeGreaterThan(1000)
    expect(new Set(bricks.map(b => b.time)).size).toBe(bricks.length)
    expect(run.trendPoints()).toHaveLength(bricks.length)
  })

  it('waits for real movement and confirms every full brick in a gap', () => {
    const engine = new RenkoV4Transform({ boxSize: 10 })
    expect(engine.push(bar(100))).toEqual([])
    expect(engine.pushTick(109.999, 1001)).toEqual([])
    expect(engine.pushTick(135, 1001).map((b) => [b.open, b.close])).toEqual([
      [100, 110],
      [110, 120],
      [120, 130],
    ])
    expect(engine.pushTick(135, 1002)).toEqual([])
  })

  it('requires two bricks to reverse, then continues in the new direction', () => {
    const engine = new RenkoV4Transform({ boxSize: 10 })
    engine.push(bar(130, 1000, 100))
    expect(engine.pushTick(111, 1001)).toEqual([])
    expect(engine.pushTick(100, 1002).map((b) => [b.open, b.close])).toEqual([
      [120, 110],
      [110, 100],
    ])
    expect(engine.pushTick(119, 1003)).toEqual([])
    expect(engine.pushTick(120, 1004).map((b) => [b.open, b.close])).toEqual([[110, 120]])
  })

  it('filters reversals using a configurable price distance', () => {
    const engine = new RenkoV4Transform({ boxSize: 10, reversal: 3 })
    engine.push(bar(130, 1000, 100))
    expect(engine.pushTick(101, 1001)).toEqual([])
    expect(engine.pushTick(100, 1002).map((b) => [b.open, b.close])).toEqual([[110, 100]])
  })

  it('produces the same prices regardless of tick times or candle duration', () => {
    const prices = [100, 109, 110, 139, 119, 100, 120]
    const run = (times: number[]) => {
      const engine = new RenkoV4Transform({ boxSize: 10 })
      return prices.flatMap((p, i) => engine.pushTick(p, times[i])).map((b) => [b.open, b.close])
    }
    expect(run(prices.map(() => 1000))).toEqual(run(prices.map((_, i) => 1000 + i * 86400)))
  })

  it('uses decimal tick precision for different price scales', () => {
    for (const [start, tick] of [
      [0.01, 0.00001],
      [100, 0.01],
      [73000, 0.05],
    ]) {
      const engine = new RenkoV4Transform({ mode: 'percent', percent: 0.04, tickSize: tick })
      engine.seed(start)
      const box = engine.getBoxSize()
      expect(box).toBeGreaterThanOrEqual(tick)
      expect(engine.pushTick(start + box, 1000)).toHaveLength(1)
      expect(engine.pushTick(start + box * 1.5, 1000)).toEqual([])
    }
    expect(calculateRenkoV4BoxSize(100, { points: 0.015, mode: 'points', tickSize: 0.01 })).toBe(
      0.02
    )
  })

  it('keeps committed bricks and trend points after an intrabar round trip and REST correction', () => {
    const run = new RenkoV4Run({ boxSize: 10 })
    run.setData([bar(100)])
    run.update(bar(130))
    const committed = structuredClone(run.elements())
    const trend = structuredClone(run.trendPoints())
    run.update(bar(100))
    const all = structuredClone(run.elements())
    run.setData([bar(125, 1000, 100)])
    expect(run.elements()).toEqual(all)
    expect(run.elements().slice(0, 3)).toEqual(committed)
    expect(run.trendPoints().slice(0, 3)).toEqual(trend)
    expect(run.trendPoints().map((b) => b.close)).toEqual([100, 110, 120, 120, 110])
  })

  it('rejects late corrections and invalid ticks without changing brick state', () => {
    const run = new RenkoV4Run({ boxSize: 10 })
    run.setData([bar(100), bar(120, 1060)])
    const old = structuredClone(run.elements())
    for (const b of [bar(500, 1000), bar(NaN, 1060), bar(-10, 1060)]) run.update(b)
    expect(run.elements()).toEqual(old)
  })

  it('freezes percentage sizing after the initial seed, even after older history arrives', () => {
    const run = new RenkoV4Run({ percent: 10, tickSize: 0.01 })
    run.setData([bar(100), bar(130, 1060)])
    const confirmed = structuredClone(run.elements())
    run.prepend([bar(90, 940)])
    run.update(bar(140, 1120))
    expect(run.elements().slice(0, confirmed.length)).toEqual(confirmed)
    expect(run.elements().at(-1)?.close).toBe(140)
    expect(run.sourceIndex()).toEqual([2, 2, 2, 3])
  })

  it('isolates replay from locked live state and restores the original price path', () => {
    const run = new RenkoV4Run({ boxSize: 10 })
    const history = [bar(100), bar(120, 1060), bar(130, 1120)]
    run.setData(history)
    run.update(bar(100, 1120))
    const live = structuredClone(run.elements())
    run.setData([])
    expect(run.elements()).toEqual([])
    run.setData(history.slice(0, 2))
    expect(run.elements()).toHaveLength(2)
    run.setData(history)
    expect(run.elements()).toEqual(live)
  })

  it('registers synchronously and reuses the pane-owned state when a chart is recreated', () => {
    const run = new RenkoV4Run({ boxSize: 10 })
    const definition = getSeriesTransform('renko-v4')
    expect(withRenkoV4Run(run, () => definition.create({ boxSize: 10 }))).toBe(run)
    expect(definition.create({ boxSize: 10 })).not.toBe(run)
    run.setData([bar(100)])
    run.update(bar(130))
    const locked = structuredClone(run.elements())
    withRenkoV4Run(run, () => definition.create({ boxSize: 10 })).setData([bar(100)])
    expect(run.elements()).toEqual(locked)
  })

  it('labels bricks from the same tick without inventing future trading hours', () => {
    const run = new RenkoV4Run({ boxSize: 1 })
    run.setData([bar(100, 1_800_000_000)])
    run.update(bar(1100, 1_800_000_000))
    const times = run.elements().map((b) => b.time)
    expect(new Set(times).size).toBe(1000)
    expect(times.at(-1)! - times[0]).toBeLessThan(0.01)
  })

  it('validates stored snapshots and restores the price grid and fixed trend', () => {
    const run = new RenkoV4Run({ boxSize: 10 })
    run.setData([bar(100), bar(120, 1060)])
    run.update(bar(100, 1060))
    const saved = run.snapshot()!
    const recovered = new RenkoV4Run({ boxSize: 10 })
    expect(recovered.restoreSnapshot(JSON.parse(JSON.stringify(saved)))).toBe(true)
    expect(recovered.elements()).toEqual(run.elements())
    expect(recovered.trendPoints()).toEqual(run.trendPoints())
    recovered.update(bar(120, 1060))
    expect(recovered.elements().at(-1)?.close).toBe(120)
    for (const value of [
      null,
      {},
      { ...saved, version: 2 },
      { ...saved, engine: { ...saved.engine, box: 0 } },
      { ...saved, bricks: [[1000, 0, 100, 1000]] },
    ]) {
      expect(new RenkoV4Run({ boxSize: 10 }).restoreSnapshot(value)).toBe(false)
    }
    expect(new RenkoV4Run({ boxSize: 20 }).restoreSnapshot(saved)).toBe(false)
    expect(new RenkoV4Run({ boxSize: 10, reversal: 3 }).restoreSnapshot(saved)).toBe(false)
  })
})
