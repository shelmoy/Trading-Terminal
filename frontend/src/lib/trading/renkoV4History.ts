import type { Bar, BarsRequest, SeriesTransformSpec } from 'openalgo-charts'
import { candleSessionAnchor } from './sessionHours'
import { historyBarsInRange } from './historyValidation'

/** An immutable price path must see the missed session before its first live tick.
 * A wide history can be cached longer than today's single-day broker repair.
 */
export async function confirmedRenkoV4History(
  getBars: (request: BarsRequest) => Promise<Bar[]>,
  request: BarsRequest
): Promise<Bar[]> {
  const fresh = { ...request, noCache: true }
  const to = request.to ?? Math.floor(Date.now() / 1000)
  const from = Math.max(request.from ?? 0, candleSessionAnchor(request.exchange ?? '', to))
  const [history, session] = await Promise.all([
    getBars(fresh),
    from > (request.from ?? 0) && from < to ? getBars({ ...fresh, from, to }) : Promise.resolve([]),
  ])
  const merged = new Map(historyBarsInRange(history, request).map((bar) => [bar.time, bar]))
  for (const bar of historyBarsInRange(session, { ...request, from, to })) merged.set(bar.time, bar)
  return [...merged.values()].sort((a, b) => a.time - b.time)
}

/** Repair only the reported Trading NIFTY cache. Scalper and other symbols keep
 * their existing saved paths. The fallback is the same origin/instrument/options.
 */
export function renkoV4RunKeys(
  storageKey: string,
  instrument: string | null,
  transform: SeriesTransformSpec
) {
  const legacy = `${instrument}:${JSON.stringify(transform.options)}`
  const canonical = `${instrument}:${JSON.stringify(
    Object.fromEntries(
      Object.entries(transform.options ?? {}).sort(([a], [b]) => a.localeCompare(b))
    )
  )}`
  const repair = instrument === 'NSE_INDEX:NIFTY' && !storageKey.startsWith('oa-trading-scalper')
  return {
    runKey: repair ? `${canonical}:confirmed-history-v2` : legacy,
    fallbackKey: repair ? `oa-trading-scalper-p0-renko-v4-cache:${legacy}` : undefined,
  }
}
