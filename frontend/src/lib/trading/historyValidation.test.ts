import { RenkoTransform, runTransform } from 'openalgo-charts/transform'
import { describe, expect, it } from 'vitest'
import { historyBarsInRange } from './historyValidation'

const july = Date.parse('2026-07-29T09:30:00+05:30') / 1000
const october = Date.parse('2026-10-23T09:30:00+05:30') / 1000
const candle = (time: number, close: number) => ({
  time, open: close, high: close + 1, low: close - 1, close, volume: 0,
})
const mixed = [candle(july, 24200), candle(july + 60, 24270),
  candle(october, 22550), candle(october + 60, 22580), candle(october + 120, 22560)]

describe('requested history window', () => {
  it('does not turn cached July prices into an October Renko collapse', () => {
    const request = { from: october, to: october + 120 }
    const corruptBricks = runTransform(new RenkoTransform({ boxSize: 10 }), mixed)
    expect(corruptBricks.some((bar) => bar.close > 24000)).toBe(true)
    const input = historyBarsInRange(mixed, request)
    const bricks = runTransform(new RenkoTransform({ boxSize: 10 }), input)
    expect(input).toHaveLength(3)
    expect(bricks.length).toBeGreaterThan(0)
    expect(bricks.every((bar) => bar.time >= request.from && bar.time <= request.to + 5)).toBe(true)
    expect(bricks.every((bar) => bar.close < 22600)).toBe(true)
    expect(mixed[0].time).toBe(july) // Source cache is not destructively edited.
  })
  it('rejects a wholly old preview so the caller can fetch the requested window', () => {
    expect(historyBarsInRange(mixed.slice(0, 2), { from: october, to: october + 120 })).toEqual([])
  })
  it('keeps July available when explicitly paging to July', () => {
    expect(historyBarsInRange(mixed, { from: july, to: july + 60 })).toEqual(mixed.slice(0, 2))
  })
  it('excludes future and malformed bars without inventing replacements', () => {
    const rows = [...mixed, candle(october + 180, 22590), { ...candle(october + 20, 10), high: 1 }]
    expect(historyBarsInRange(rows, { from: october, to: october + 120 })).toEqual(mixed.slice(2))
  })
  it('keeps an unbounded historical request valid and includes exact boundary bars', () => {
    expect(historyBarsInRange(mixed, {})).toEqual(mixed)
    expect(historyBarsInRange(mixed, { from: october, to: october })).toEqual([mixed[2]])
  })
  it('dates newly formed Monday bricks from the Monday source, after Friday history', () => {
    const monday = Date.parse('2026-10-26T09:16:00+05:30') / 1000
    const transform = new RenkoTransform({ boxSize: 10 })
    const recent = historyBarsInRange(mixed, { from: october, to: monday })
    for (const bar of recent) transform.push(bar)
    const live = transform.push(candle(monday, 22520))
    expect(live.length).toBeGreaterThan(0)
    expect(live.every((bar) => bar.time === monday)).toBe(true)
    expect(live.at(-1)?.close).toBe(22520)
  })
})
