import { SessionCalendar, type Bar, type BarsRequest } from 'openalgo-charts'
import { describe, expect, it, vi } from 'vitest'
import { completeRenkoV2History } from './renkoV2History'

const time = (day: string, hm: string) => Date.parse(day + 'T' + hm + ':00+05:30') / 1000
const candle = (day: string, hm: string, price: number): Bar => ({
  time: time(day, hm), open: price, high: price + 5, low: price - 5, close: price + 2,
})
const request: BarsRequest = {
  symbol: 'NIFTY', exchange: 'NSE_INDEX', interval: '1m',
  from: time('2026-11-04', '09:15'), to: time('2026-11-11', '10:30'),
}
const calendar = new SessionCalendar({
  timezone: 'Asia/Kolkata',
  sessions: ['0915-1530:23456'],
  exceptions: { '2026-11-08': ['1815-1915'], '2026-11-10': [] },
})

describe('recovering ordinary candles for Renko V2', () => {
  it('backfills missing trading sessions, including Muhurat, with genuine source candles', async () => {
    const fromBroker = [
      candle('2026-11-05', '09:15', 24000),
      candle('2026-11-06', '09:15', 24500),
      candle('2026-11-08', '18:15', 24900),
      candle('2026-11-09', '09:15', 25000),
    ]
    const old = candle('2026-11-04', '15:29', 23960)
    const today = candle('2026-11-11', '09:15', 25337)
    const read = vi.fn(async (query: BarsRequest) => query.from === request.from
      ? [old, today]
      : [old, ...fromBroker, today])
    const bars = await completeRenkoV2History(read, request, calendar, request.to!)
    expect(bars).toEqual([old, ...fromBroker, today])
    expect(read.mock.calls.slice(1).map(([query]) => query.from)).toEqual(fromBroker.map(bar => bar.time))
    expect(read.mock.calls.every(([query]) => query.noCache)).toBe(true)
  })

  it('keeps unavailable sessions empty and continues with the other sessions', async () => {
    const read = vi.fn(async ({ from }: BarsRequest) => {
      if (from === request.from) return [candle('2026-11-04', '15:29', 23960)]
      if (from === time('2026-11-05', '09:15')) throw new Error('history unavailable')
      return []
    })
    const bars = await completeRenkoV2History(read, request, calendar, request.to!)
    expect(bars).toHaveLength(1)
    expect(read).toHaveBeenCalledTimes(5)
  })

  it('keeps a complete window on the one-request path', async () => {
    const supplied = [
      candle('2026-11-04', '15:29', 23960),
      candle('2026-11-05', '09:15', 24000),
      candle('2026-11-06', '09:15', 24500),
      candle('2026-11-08', '18:15', 24900),
      candle('2026-11-09', '09:15', 25000),
      candle('2026-11-11', '09:15', 25337),
    ]
    const read = vi.fn(async () => supplied)
    expect(await completeRenkoV2History(read, request, calendar, request.to!)).toEqual(supplied)
    expect(read).toHaveBeenCalledTimes(1)
  })
})
