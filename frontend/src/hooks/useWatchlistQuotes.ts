import { useEffect, useMemo, useRef, useState } from 'react'
import type { QuotesData } from '@/api/trading'
import type { PriceableItem } from '@/hooks/useLivePrice'
import { useMarketStatus } from '@/hooks/useMarketStatus'
import { previousClose } from '@/lib/trading/previousClose'
import { quoteSessionScope } from '@/lib/quoteSnapshots'

const SESSION_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })

export interface WatchlistQuote {
  ltp: number
  change: number | null
  changePercent: number | null
  volume?: number
  high?: number
  low?: number
  open?: number
  source?: string
  receivedAt?: number
  streamLimited?: boolean
}

/** Broker previous close is authoritative, including a genuinely flat session. */
function validClose(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/** Tick-by-tick day change, with a paced history fallback only for missing closes. */
export function useWatchlistQuotes(
  apiKey: string,
  prices: PriceableItem[],
  snapshots: Map<string, QuotesData>,
  scope = 'watchlist'
): Record<string, WatchlistQuote> {
  const { isMarketOpen } = useMarketStatus()
  const day = SESSION_DATE.format(new Date())
  const session = `${scope}:${quoteSessionScope()}:${day}`
  const [resolved, setResolved] = useState<Record<string, number>>({})
  const resolvedRef = useRef(resolved)
  resolvedRef.current = resolved

  // This string only changes as instruments arrive or lose a reference close,
  // not on every price tick. One queue per mounted watchlist, never one per tick.
  const missing = JSON.stringify(
    prices
      .filter((row) => {
        const snapshot = row._quote ?? snapshots.get(`${row.exchange}:${row.symbol}`)
        const ltp = row.ltp ?? snapshot?.ltp
        return (
          typeof ltp === 'number' &&
          Number.isFinite(ltp) &&
          ltp !== 0 &&
          !validClose(snapshot?.prev_close)
        )
      })
      .map(({ symbol, exchange }) => ({ symbol, exchange }))
  )

  useEffect(() => {
    if (!apiKey) return
    let alive = true
    const timer = window.setTimeout(async () => {
      const instruments: Array<{ symbol: string; exchange: string }> = JSON.parse(missing)
      for (const row of instruments) {
        if (!alive) break
        const key = `${session}:${row.exchange}:${row.symbol}`
        if (resolvedRef.current[key] !== undefined) continue
        const value = await previousClose(
          apiKey,
          row.symbol,
          row.exchange,
          isMarketOpen(row.exchange)
        )
        if (!alive) break
        // Cache a failure too, so unsupported contracts cannot flood history.
        setResolved((current) => ({ ...current, [key]: value ?? 0 }))
      }
    }, 300)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [apiKey, missing, session, isMarketOpen])

  return useMemo(() => {
    const quotes: Record<string, WatchlistQuote> = {}
    for (const row of prices) {
      const key = `${row.exchange}:${row.symbol}`
      const snapshot = row._quote ?? snapshots.get(key)
      const ltp = row.ltp ?? snapshot?.ltp
      if (typeof ltp !== 'number' || !Number.isFinite(ltp) || ltp === 0) continue
      const close = validClose(snapshot?.prev_close)
        ? snapshot.prev_close
        : resolved[`${session}:${key}`]
      const change = validClose(close) ? ltp - close : null
      quotes[key] = {
        ltp,
        change,
        changePercent: change !== null && validClose(close) ? (change / close) * 100 : null,
        volume: snapshot?.volume,
        high: snapshot?.high,
        low: snapshot?.low,
        open: snapshot?.open,
        source: row._dataSource,
        receivedAt: row._priceReceivedAt,
        streamLimited: row._streamLimited,
      }
    }
    return quotes
  }, [prices, snapshots, resolved, session])
}
