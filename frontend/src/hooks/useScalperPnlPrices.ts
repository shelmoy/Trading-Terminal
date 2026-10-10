import { useCallback, useEffect, useMemo, useState } from 'react'
import { tradingApi } from '@/api/trading'
import { useLivePrice } from '@/hooks/useLivePrice'
import { useMarketStatus } from '@/hooks/useMarketStatus'
import {
  brokerPreviousClose,
  type DayPnlBook,
  pnlDay,
  pnlInstrumentKey,
} from '@/lib/trading/dayPnl'
import { useAuthStore } from '@/stores/authStore'

type Phase = 'live' | 'frozen' | 'prior' | 'pending'
interface ClosingPrices {
  scope: string
  prices: Record<string, number>
}
const positive = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value > 0

/** Kite's F&O mark-price policy, isolated from chart prices and order execution. */
export function useScalperPnlPrices(book: DayPnlBook, scope: string, enabled: boolean) {
  const { apiKey, user } = useAuthStore()
  const calendar = useMarketStatus()
  const items = useMemo(
    () =>
      book.rows
        .filter((row) => row.opening !== 0 || Number(row.position.quantity) !== 0)
        .map(({ position }) => ({
          symbol: position.symbol,
          exchange: position.exchange,
          ltp: position.ltp,
        })),
    [book]
  )
  const {
    data: live,
    multiQuotes: quotes,
    multiQuotesFetchedAt,
  } = useLivePrice(items, {
    enabled: enabled && items.length > 0,
    staleThreshold: 1500,
    multiQuotesRefreshInterval: 10000,
    pauseWhenHidden: true,
  })
  const phaseSignature = useCallback(() => {
    const phaseFor = (exchange: string): Phase => {
      if (exchange === 'CRYPTO') return 'live'
      if (calendar.isLoading || calendar.error) return 'pending'
      const today = pnlDay()
      const holiday = calendar.holidays.find((entry) => entry.date === today)
      const special = holiday?.open_exchanges?.find((entry) => entry.exchange === exchange)
      if (!special && holiday?.closed_exchanges?.includes(exchange)) return 'prior'
      const timing = special ?? calendar.timings.find((entry) => entry.exchange === exchange)
      if (!timing) return 'pending'
      const start = Number(timing.start_time)
      const end = Number(timing.end_time)
      // Calendar timestamps describe a date. A stale calendar must never keep
      // yesterday's frozen LTP in today's P&L after midnight or across a holiday.
      if (pnlDay(start) !== today) return 'prior'
      const now = Date.now()
      if (now < start) return 'prior'
      if (now < end) return 'live'
      return 'frozen'
    }
    return [...new Set(items.map((item) => item.exchange))]
      .sort()
      .map((exchange) => `${exchange}:${phaseFor(exchange)}`)
      .join('|')
  }, [items, calendar.isLoading, calendar.error, calendar.holidays, calendar.timings])
  const [phase, setPhase] = useState(phaseSignature)
  useEffect(() => {
    const update = () => setPhase(phaseSignature())
    update()
    const timer = setInterval(update, 1000)
    window.addEventListener('focus', update)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', update)
    }
  }, [phaseSignature])
  const phases = useMemo(
    () =>
      new Map(
        phase
          .split('|')
          .filter(Boolean)
          .map((part) => {
            const [exchange, value] = part.split(':')
            return [exchange, value as Phase]
          })
      ),
    [phase]
  )
  const storageKey = `oa-scalper-closing-ltp:v1:${user?.username ?? ''}:${user?.broker ?? ''}:${scope.split(':')[0]}`
  const [closing, setClosing] = useState<ClosingPrices>({ scope: '', prices: {} })

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as ClosingPrices | null
      const prices =
        saved?.scope === scope && saved.prices && typeof saved.prices === 'object'
          ? Object.fromEntries(Object.entries(saved.prices).filter(([, value]) => positive(value)))
          : {}
      setClosing({ scope, prices })
    } catch {
      setClosing({ scope, prices: {} })
    }
  }, [storageKey, scope])

  useEffect(() => {
    if (!enabled || !apiKey || closing.scope !== scope) return
    const missing = items.filter(
      (item) =>
        phases.get(item.exchange) === 'frozen' && !positive(closing.prices[pnlInstrumentKey(item)])
    )
    if (!missing.length) return
    let cancelled = false
    let retry: ReturnType<typeof setTimeout> | undefined
    const resolve = async () => {
      try {
        // Ask after the boundary: the last React render before close may have
        // missed the final tick. A broker LTP remains the last trade even when
        // its OHLC closing reference differs. No historical candle substitution.
        const response = await tradingApi.getMultiQuotes(apiKey, missing)
        if (cancelled) return
        if (response.status !== 'success') throw new Error('Closing quote unavailable')
        const prices = { ...closing.prices }
        for (const quote of response.results ?? []) {
          const key = pnlInstrumentKey(quote)
          if (missing.some((item) => pnlInstrumentKey(item) === key) && positive(quote.data?.ltp))
            prices[key] = quote.data.ltp
        }
        if (Object.keys(prices).length !== Object.keys(closing.prices).length) {
          const value = { scope, prices }
          setClosing(value)
          try {
            localStorage.setItem(storageKey, JSON.stringify(value))
          } catch {
            /* Storage optional. */
          }
          return
        }
      } catch {
        /* Keep the total unavailable rather than inventing a close. */
      }
      if (!cancelled) retry = setTimeout(() => void resolve(), 10000)
    }
    void resolve()
    return () => {
      cancelled = true
      if (retry) clearTimeout(retry)
    }
  }, [enabled, apiKey, scope, storageKey, items, phases, closing])

  const closes: Record<string, number> = {}
  for (const { position } of book.rows) {
    const key = pnlInstrumentKey(position)
    const quoteIsToday = pnlDay(multiQuotesFetchedAt) === pnlDay()
    const reference =
      brokerPreviousClose(position) ?? (quoteIsToday ? quotes.get(key)?.prev_close : undefined)
    if (positive(reference)) closes[key] = reference
  }
  const marks = new Map<string, number>()
  for (const item of live) {
    const key = pnlInstrumentKey(item)
    const policy = phases.get(item.exchange)
    const mark =
      policy === 'prior'
        ? closes[key]
        : policy === 'frozen'
          ? closing.scope === scope
            ? closing.prices[key]
            : undefined
          : policy === 'live'
            ? item.ltp
            : undefined
    if (positive(mark)) marks.set(key, mark)
  }
  const note = [...phases.values()].includes('frozen')
    ? 'F&O marks frozen at the session’s last LTP until midnight. Before charges.'
    : [...phases.values()].includes('prior')
      ? 'Before opening: previous broker close. Carried inventory rebased daily. Before charges.'
      : 'Live LTP; carried inventory uses the broker’s previous close. Before charges.'
  return { marks, closes, note }
}
