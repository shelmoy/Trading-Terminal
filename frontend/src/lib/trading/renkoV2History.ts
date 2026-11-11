import type { Bar, BarsRequest, SessionCalendar } from 'openalgo-charts'
import { historyBarsInRange } from './historyValidation'

export function needsRenkoV2History(request: Pick<BarsRequest, 'exchange' | 'interval'>): boolean {
  return request.interval === '1m' && ['NSE_INDEX', 'BSE_INDEX'].includes(request.exchange)
}

/**
 * Recover whole missing index sessions from the same broker's ordinary candle
 * endpoint. A one-date query avoids reuse of a cached multi-date response.
 */
export async function completeRenkoV2History(
  getBars: (request: BarsRequest) => Promise<Bar[]>,
  request: BarsRequest,
  calendar: SessionCalendar | null,
  now: number
): Promise<Bar[]> {
  const source = historyBarsInRange(await getBars({ ...request, noCache: true }), request)
  const { from, to, signal } = request
  if (!calendar || from === undefined || to === undefined || signal?.aborted) return source

  // Inspect at most the last ten calendar days. Use the exchange's real
  // sessions (including evening/special sessions) instead of weekdays.
  const start = Math.max(from, to - 10 * 86400)
  const merged = new Map(source.map((bar) => [bar.time, bar]))
  const repairDeadline = performance.now() + 8000
  let session = calendar.sessionFrom(start)
  let remaining = 6
  while (session && session.close <= Math.min(to, now) && !signal?.aborted && remaining > 0) {
    const sessionStart = Math.max(start, session.open)
    const sessionEnd = session.close - 1
    if (session.open >= start && !source.some((bar) => bar.time >= sessionStart && bar.time <= sessionEnd)) {
      const timeoutMs = Math.min(request.timeoutMs ?? 4000, 4000, repairDeadline - performance.now())
      if (timeoutMs <= 0) break
      remaining--
      const window = { ...request, from: sessionStart, to: sessionEnd, noCache: true, timeoutMs }
      try {
        for (const bar of historyBarsInRange(await getBars(window), window)) merged.set(bar.time, bar)
      } catch (error) {
        if (signal?.aborted) throw error
        // A missing broker session stays a gap. Never interpolate it.
      }
    }
    session = calendar.sessionFrom(session.close)
  }
  return [...merged.values()].sort((a, b) => a.time - b.time)
}
