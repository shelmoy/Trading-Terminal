import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type DepthData, type DepthLevel, type QuotesData, tradingApi } from '@/api/trading'
import { useMarketData } from '@/hooks/useMarketData'
import { useMarketStatus } from '@/hooks/useMarketStatus'
import { useAuthStore } from '@/stores/authStore'

/**
 * Depth data in normalized format (used by both WebSocket and REST)
 */
export interface NormalizedDepth {
  buy: DepthLevel[]
  sell: DepthLevel[]
}

/**
 * Combined quote and depth data
 */
/**
 * First usable price from the given sources, treating 0 as "not available".
 *
 * A real traded price is never 0, so a 0 from any source means that source has
 * nothing to say yet rather than that the instrument is worthless. Using ??
 * here would accept the 0 and stop, which is how a WebSocket tick with no
 * last-traded price ends up displayed as 0.00 while REST has the real number.
 */
function firstPrice(...values: (number | undefined | null)[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value
    }
  }
  return undefined
}

export interface LiveQuoteData {
  ltp?: number
  open?: number
  high?: number
  low?: number
  close?: number
  volume?: number
  oi?: number
  change?: number
  changePercent?: number
  bidPrice?: number
  askPrice?: number
  bidSize?: number
  askSize?: number
  depth?: NormalizedDepth
}

/**
 * Configuration options for useLiveQuote hook
 */
export interface UseLiveQuoteOptions {
  /** Whether the hook is enabled (default: true) */
  enabled?: boolean
  /** WebSocket subscription mode: 'LTP', 'Quote', or 'Depth' (default: 'Depth') */
  mode?: 'LTP' | 'Quote' | 'Depth'
  /** Whether to fetch REST quotes as fallback (default: true) */
  useQuotesFallback?: boolean
  /** Whether to fetch REST depth as fallback (default: true) */
  useDepthFallback?: boolean
  /** Time in ms after which WebSocket data is considered stale (default: 5000) */
  staleThreshold?: number
  /** Interval in ms to refresh REST data (default: 30000) */
  refreshInterval?: number
  /** Pause when tab is hidden (default: true) */
  pauseWhenHidden?: boolean
}

/**
 * Return type for useLiveQuote hook
 */
export interface UseLiveQuoteResult {
  /** Combined quote and depth data */
  data: LiveQuoteData
  /** Whether real-time data is available (WebSocket connected AND market open) */
  isLive: boolean
  /** Whether WebSocket is connected */
  isConnected: boolean
  /** Whether data is being loaded */
  isLoading: boolean
  /** Whether WebSocket is paused due to tab being hidden */
  isPaused: boolean
  /** Whether using REST API fallback instead of WebSocket */
  isFallbackMode: boolean
  /** Data source: 'websocket', 'rest', or 'none' */
  dataSource: 'websocket' | 'rest' | 'none'
  /** Manually refresh REST data */
  refresh: () => Promise<void>
}

interface QuoteSnapshot<T> {
  scope: string
  data: T
  requestedAt: number
}

/**
 * Centralized hook for real-time quote and depth data with automatic REST fallback.
 *
 * Similar to useLivePrice but for single symbol with full quote + depth support.
 * Use this for PlaceOrderDialog, symbol details, or anywhere you need live market data.
 *
 * Priority chain:
 * 1. WebSocket data (when market is open and data is fresh)
 * 2. REST API data (fallback when WebSocket unavailable)
 *
 * @example
 * ```tsx
 * const { data, isLive, isLoading } = useLiveQuote('RELIANCE', 'NSE', {
 *   enabled: dialogOpen,
 *   mode: 'Depth',
 * });
 *
 * // Access data
 * console.log(data.ltp, data.bidPrice, data.depth?.buy);
 * ```
 */
export function useLiveQuote(
  symbol: string,
  exchange: string,
  options: UseLiveQuoteOptions = {}
): UseLiveQuoteResult {
  const {
    enabled = true,
    mode = 'Depth',
    useQuotesFallback = true,
    useDepthFallback = true,
    staleThreshold = 5000,
    refreshInterval = 30000,
  } = options

  const { apiKey, user } = useAuthStore()
  const { isMarketOpen } = useMarketStatus()

  // Never render an old instrument/account's quote, even before effects run.
  // This scope stays in memory; credentials are never persisted or logged here.
  const scope = JSON.stringify([user?.broker, user?.username, user?.loginTime, apiKey, symbol, exchange])
  const currentScope = useRef(scope)
  currentScope.current = scope
  const epoch = useRef(0)
  const inFlight = useRef<{ scope: string; work: Promise<void>; controller: AbortController } | null>(null)
  const [quoteSnapshot, setQuoteSnapshot] = useState<QuoteSnapshot<QuotesData> | null>(null)
  const [depthSnapshot, setDepthSnapshot] = useState<QuoteSnapshot<DepthData> | null>(null)
  const restQuotes = quoteSnapshot?.scope === scope ? quoteSnapshot.data : null
  const restDepth = depthSnapshot?.scope === scope ? depthSnapshot.data : null
  const [isLoadingRest, setIsLoadingRest] = useState(false)
  const [, checkFreshness] = useState(0)

  // Check if we have valid symbol/exchange
  const hasSymbol = !!symbol && !!exchange

  // WebSocket subscription
  const symbols = useMemo(
    () => (hasSymbol ? [{ symbol, exchange }] : []),
    [symbol, exchange, hasSymbol]
  )

  const {
    data: marketData,
    isConnected: wsConnected,
    isPaused: wsPaused,
    isFallbackMode,
  } = useMarketData({
    symbols,
    mode,
    enabled: enabled && hasSymbol,
  })

  // useMarketData clears its map in an effect on a session change. Block its
  // previous render's map immediately so same-symbol account switches are safe.
  const subscription = useRef<{ scope: string; blocked?: typeof marketData }>({ scope })
  if (subscription.current.scope !== scope) subscription.current = { scope, blocked: marketData }
  if (subscription.current.blocked && subscription.current.blocked !== marketData) subscription.current.blocked = undefined
  const wsRecord = subscription.current.blocked === marketData ? undefined : marketData.get(`${exchange}:${symbol}`)
  const wsLastUpdate = wsRecord?.lastUpdate

  // Check if market is open for this exchange
  const marketOpen = isMarketOpen(exchange)

  // Check if WebSocket data is fresh
  const hasWsData = !!(
    enabled &&
    wsConnected &&
    !wsPaused &&
    !isFallbackMode &&
    wsRecord?.data &&
    wsLastUpdate &&
    Date.now() - wsLastUpdate < staleThreshold
  )
  const restAsOf = Math.max(
    quoteSnapshot?.scope === scope && firstPrice(quoteSnapshot.data.ltp) ? quoteSnapshot.requestedAt : 0,
    depthSnapshot?.scope === scope && firstPrice(depthSnapshot.data.ltp) ? depthSnapshot.requestedAt : 0
  )
  const useWs = hasWsData && (wsLastUpdate ?? 0) >= restAsOf
  const wsData = useWs ? wsRecord?.data : undefined

  // Re-evaluate freshness when ticks stop, without waiting for another tick.
  useEffect(() => {
    if (!enabled || !wsLastUpdate) return
    const remaining = wsLastUpdate + staleThreshold - Date.now()
    if (remaining <= 0) return
    const timer = setTimeout(() => checkFreshness(value => value + 1), remaining + 1)
    return () => clearTimeout(timer)
  }, [enabled, wsLastUpdate, staleThreshold, scope])

  // Effective live status (WebSocket connected, data fresh, market open)
  const isLive = useWs && marketOpen

  /**
   * Fetch REST data (quotes and/or depth)
   */
  const fetchRestData = useCallback((): Promise<void> => {
    if (!enabled || !apiKey || !hasSymbol) return Promise.resolve()
    if (inFlight.current?.scope === scope) return inFlight.current.work
    const generation = epoch.current
    const requestedAt = Date.now()
    const controller = new AbortController()
    const isCurrent = () => currentScope.current === scope && epoch.current === generation && !controller.signal.aborted
    setIsLoadingRest(true)
    const work = (async () => {
      try {
        // Fetch quotes and depth together, sharing cancellation and identity.
        const promises: Promise<void>[] = []
        if (useQuotesFallback) {
          promises.push(
            tradingApi.getQuotes(apiKey, symbol, exchange, controller.signal)
              .then(response => {
                if (isCurrent() && response.status === 'success' && response.data) {
                  setQuoteSnapshot({ scope, data: response.data, requestedAt })
                }
              })
              .catch(() => {})
          )
        }
        if (useDepthFallback && mode === 'Depth') {
          promises.push(
            tradingApi.getDepth(apiKey, symbol, exchange, controller.signal)
              .then(response => {
                if (isCurrent() && response.status === 'success' && response.data) {
                  setDepthSnapshot({ scope, data: response.data, requestedAt })
                }
              })
              .catch(() => {})
          )
        }
        await Promise.all(promises)
      } finally {
        if (isCurrent()) setIsLoadingRest(false)
        if (inFlight.current?.controller === controller) inFlight.current = null
      }
    })()
    inFlight.current = { scope, work, controller }
    return work
  }, [enabled, apiKey, symbol, exchange, hasSymbol, scope, useQuotesFallback, useDepthFallback, mode])

  useEffect(() => {
    epoch.current++
    setQuoteSnapshot(null)
    setDepthSnapshot(null)
    setIsLoadingRest(false)
    void fetchRestData()
    const interval = enabled && hasSymbol ? setInterval(() => void fetchRestData(), refreshInterval) : undefined
    return () => {
      epoch.current++
      if (interval) clearInterval(interval)
      inFlight.current?.controller.abort()
      inFlight.current = null
    }
  }, [fetchRestData, enabled, hasSymbol, refreshInterval])

  // Convert REST depth format to normalized format
  const restDepthNormalized: NormalizedDepth | undefined = useMemo(() => {
    if (!restDepth) return undefined
    return {
      buy: restDepth.bids.map((level) => ({ price: level.price, quantity: level.quantity })),
      sell: restDepth.asks.map((level) => ({ price: level.price, quantity: level.quantity })),
    }
  }, [restDepth])

  // Merge WebSocket and REST data
  const mergedData: LiveQuoteData = useMemo(() => {
    // Determine best depth source
    const depth = wsData?.depth ?? restDepthNormalized

    // Determine best bid/ask from depth or quotes
    const bidPrice = firstPrice(
      wsData?.depth?.buy?.[0]?.price,
      restDepthNormalized?.buy?.[0]?.price,
      wsData?.bid_price,
      restQuotes?.bid
    )
    const askPrice = firstPrice(
      wsData?.depth?.sell?.[0]?.price,
      restDepthNormalized?.sell?.[0]?.price,
      wsData?.ask_price,
      restQuotes?.ask
    )
    const bidSize =
      wsData?.depth?.buy?.[0]?.quantity ??
      restDepthNormalized?.buy?.[0]?.quantity ??
      wsData?.bid_size
    const askSize =
      wsData?.depth?.sell?.[0]?.quantity ??
      restDepthNormalized?.sell?.[0]?.quantity ??
      wsData?.ask_size

    // Merge all data with priority: WebSocket > REST depth > REST quotes.
    //
    // Price fields use firstPrice, not ??. A feed can deliver a tick whose ltp
    // is 0 -- before the first trade of the session, or when the adapter has
    // depth but no last-traded price yet. ?? only falls through on null and
    // undefined, so a 0 would win and pin the display at 0.00 while depth shows
    // a real bid/ask, with the REST fallback never consulted. Treating 0 as
    // absent lets REST fill the gap.
    return {
      ltp: firstPrice(wsData?.ltp, restDepth?.ltp, restQuotes?.ltp),
      open: firstPrice(wsData?.open, restDepth?.open, restQuotes?.open),
      high: firstPrice(wsData?.high, restDepth?.high, restQuotes?.high),
      low: firstPrice(wsData?.low, restDepth?.low, restQuotes?.low),
      close: firstPrice(wsData?.close, restDepth?.prev_close, restQuotes?.prev_close),
      volume: wsData?.volume ?? restDepth?.volume ?? restQuotes?.volume,
      oi: restDepth?.oi ?? restQuotes?.oi,
      change: wsData?.change,
      changePercent: wsData?.change_percent,
      bidPrice,
      askPrice,
      bidSize,
      askSize,
      depth,
    }
  }, [wsData, restQuotes, restDepth, restDepthNormalized])

  // Calculate change if not available from WebSocket
  const dataWithChange: LiveQuoteData = useMemo(() => {
    if (mergedData.change !== undefined) return mergedData

    const change =
      mergedData.ltp && mergedData.close ? mergedData.ltp - mergedData.close : undefined
    const changePercent = change && mergedData.close ? (change / mergedData.close) * 100 : undefined

    return {
      ...mergedData,
      change,
      changePercent,
    }
  }, [mergedData])

  // Determine data source
  const dataSource: 'websocket' | 'rest' | 'none' = useMemo(() => {
    if (useWs) return 'websocket'
    if (restQuotes || restDepth) return 'rest'
    return 'none'
  }, [useWs, restQuotes, restDepth])

  return {
    data: dataWithChange,
    isLive,
    isConnected: wsConnected,
    isLoading: isLoadingRest && !restQuotes && !restDepth,
    isPaused: wsPaused,
    isFallbackMode,
    dataSource,
    refresh: fetchRestData,
  }
}
