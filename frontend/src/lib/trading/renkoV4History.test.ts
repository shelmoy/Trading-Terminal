import { describe, expect, it, vi } from 'vitest'
import type { Bar, BarsRequest } from 'openalgo-charts'
import { confirmedRenkoV4History, renkoV4RunKeys } from './renkoV4History'
import { RenkoV4Run } from './renkoV4Transform'
const start = Date.parse('2026-10-27T09:15:00+05:30') / 1000
const bar = (time: number, close: number): Bar => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
})
const request: BarsRequest = {
  symbol: 'NIFTY',
  exchange: 'NSE_INDEX',
  interval: '1m',
  from: start - 86400,
  to: start + 10800,
}
const transform = { type: 'renko-v4', options: { mode: 'percent', percent: 0.04, tickSize: 0.05 } }
describe('confirmed Renko V4 seed', () => {
  it('keeps the Trading NIFTY owner stable when workspace JSON reorders options', () => {
    const a = renkoV4RunKeys('oa-trading-p0', 'NSE_INDEX:NIFTY', {
      type: 'renko-v4',
      options: { mode: 'percent', boxSize: 10, reversal: 2 },
    })
    const b = renkoV4RunKeys('oa-trading-p0', 'NSE_INDEX:NIFTY', {
      type: 'renko-v4',
      options: { reversal: 2, boxSize: 10, mode: 'percent' },
    })
    expect(a.runKey).toBe(b.runKey)
  })
  it('recovers the missed morning swings before admitting the first live jump', async () => {
    const previous = bar(start - 60, 100)
    const cached = [previous, bar(start, 100), bar(start + 10800, 120)]
    const morning = [
      bar(start, 100),
      bar(start + 3600, 140),
      bar(start + 7200, 100),
      bar(start + 10800, 120),
    ]
    const feed = vi.fn(async (r: BarsRequest) => (r.from === start ? morning : cached))
    const stale = new RenkoV4Run({ boxSize: 10 })
    stale.setData(cached)
    expect(stale.elements().map((b) => b.close)).toEqual([110, 120])
    const run = new RenkoV4Run({ boxSize: 10 })
    run.setData(await confirmedRenkoV4History(feed, request))
    expect(run.elements().map((b) => b.close)).toEqual([110, 120, 130, 140, 120, 110, 100, 120])
    expect(feed).toHaveBeenCalledTimes(2)
    expect(feed.mock.calls.every(([r]) => r.noCache === true)).toBe(true)
  })
  it('does not silently fall back to the cache if the session repair fails', async () => {
    const feed = vi.fn(async (r: BarsRequest) => {
      if (r.from === start) throw new Error('Broker history unavailable')
      return [bar(start - 60, 100)]
    })
    await expect(confirmedRenkoV4History(feed, request)).rejects.toThrow(
      'Broker history unavailable'
    )
  })
  it('keeps the prior session on holidays and rejects out-of-range rows', async () => {
    const feed = vi.fn(async (r: BarsRequest) =>
      r.from === start
        ? []
        : [bar(start - 86460, 90), bar(start - 60, 100), bar(start + 10860, 500)]
    )
    expect(await confirmedRenkoV4History(feed, request)).toEqual([bar(start - 60, 100)])
  })
  it('does not duplicate a request already confined to the current session', async () => {
    const feed = vi.fn(async () => [bar(start, 100)])
    await confirmedRenkoV4History(feed, { ...request, from: start })
    expect(feed).toHaveBeenCalledTimes(1)
  })
  it('migrates only Trading NIFTY, leaving Scalper and SENSEX keys intact', () => {
    const trading = renkoV4RunKeys('oa-trading-p0', 'NSE_INDEX:NIFTY', transform)
    const scalper = renkoV4RunKeys('oa-trading-scalper-p0', 'NSE_INDEX:NIFTY', transform)
    expect(trading.runKey).toBe(`${scalper.runKey}:confirmed-history-v2`)
    expect(trading.fallbackKey).toBe(`oa-trading-scalper-p0-renko-v4-cache:${scalper.runKey}`)
    expect(scalper.fallbackKey).toBeUndefined()
    expect(
      renkoV4RunKeys('oa-trading-p0', 'BSE_INDEX:SENSEX', transform).fallbackKey
    ).toBeUndefined()
    expect(
      renkoV4RunKeys('oa-trading-p0', 'NSE_INDEX:NIFTY', {
        ...transform,
        options: { ...transform.options, percent: 0.1 },
      }).fallbackKey
    ).not.toBe(trading.fallbackKey)
  })
})
