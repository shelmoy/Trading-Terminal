import type { Bar } from 'openalgo-charts'

/** Ignore malformed broker bars and cached copies without synthesising OHLC. */
export function validHistoryBars(bars: readonly Bar[]): Bar[] {
  return bars.filter(
    (bar) =>
      bar &&
      [bar.time, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) &&
      bar.high >= Math.max(bar.open, bar.close, bar.low) &&
      bar.low <= Math.min(bar.open, bar.close) &&
      (bar.volume === undefined || (Number.isFinite(bar.volume) && bar.volume >= 0))
  )
}

/** A cached response is never allowed to expand the requested date window. */
export function historyBarsInRange(
  bars: readonly Bar[],
  request: { from?: number; to?: number }
): Bar[] {
  const from = request.from ?? -Infinity
  const to = request.to ?? Infinity
  return validHistoryBars(bars).filter((bar) => bar.time >= from && bar.time <= to)
}
