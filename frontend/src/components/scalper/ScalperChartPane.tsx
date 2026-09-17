import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'
import { scalpingApi } from '@/api/scalping'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useMarketData } from '@/hooks/useMarketData'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/themeStore'

const IST_OFFSET = 19800
const INTERVAL_SEC: Record<string, number> = { '1m': 60, '3m': 180, '5m': 300, '15m': 900 }

const UP = '#26a69a'
const DOWN = '#ef5350'
const VOL_UP = 'rgba(38,166,154,0.45)'
const VOL_DOWN = 'rgba(239,83,80,0.45)'

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface Props {
  symbol: string
  exchange: string
  interval: string
  title: string
  badgeText?: string
  badgeVariant?: 'default' | 'call' | 'put' | 'spot'
  showBuySellButtons?: boolean
  onQuickBuy?: () => void
  onQuickSell?: () => void
  showSupertrend?: boolean
}

export function ScalperChartPane({
  symbol,
  exchange,
  interval,
  title,
  badgeText,
  badgeVariant = 'spot',
  showBuySellButtons = true,
  onQuickBuy,
  onQuickSell,
  showSupertrend = true,
}: Props) {
  const { mode } = useThemeStore()
  const isDark = mode === 'dark'

  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const stRef = useRef<ISeriesApi<'Line'> | null>(null)

  const candlesRef = useRef<Map<number, Candle>>(new Map())
  const sortedRef = useRef<Candle[]>([])
  const idxByTimeRef = useRef<Map<number, number>>(new Map())
  const currentBucketRef = useRef<number | null>(null)
  const tradingDateRef = useRef<string | null>(null)
  const intervalSecRef = useRef<number>(INTERVAL_SEC[interval] ?? 60)
  const intervalRef = useRef<string>(interval)
  const readyRef = useRef(false)

  const [legendOhlc, setLegendOhlc] = useState<{
    open: number
    high: number
    low: number
    close: number
    volume: number
    change: number
    changePct: number
  } | null>(null)

  const [liveLtp, setLiveLtp] = useState<number | null>(null)

  // Real-time tick subscription via WebSocket
  const enabled = !!(symbol && exchange)
  const { data: marketData } = useMarketData({
    symbols: enabled ? [{ symbol, exchange }] : [],
    mode: 'LTP',
    enabled,
    autoReconnect: true,
  })
  const tick = enabled ? marketData.get(`${exchange}:${symbol}`) : undefined

  // 1. Initialise lightweight chart instance
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const bg = isDark ? '#0f172a' : '#ffffff'
    const text = isDark ? '#94a3b8' : '#64748b'
    const grid = isDark ? 'rgba(51, 65, 85, 0.25)' : 'rgba(226, 232, 240, 0.6)'

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight || 300,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: text,
        fontSize: 11,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      },
      grid: {
        vertLines: { color: grid },
        horzLines: { color: grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: grid,
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: grid,
        timeVisible: true,
        secondsVisible: false,
      },
    })

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })
    volSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    })

    const stSeries = chart.addSeries(LineSeries, {
      color: '#06b6d4',
      lineWidth: 1,
      crosshairMarkerVisible: false,
    })

    chartRef.current = chart
    candleRef.current = candleSeries
    volRef.current = volSeries
    stRef.current = stSeries

    // Crosshair move updates legend
    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        // Fall back to latest candle
        if (sortedRef.current.length > 0) {
          const last = sortedRef.current[sortedRef.current.length - 1]
          const chg = last.close - last.open
          const pct = last.open ? (chg / last.open) * 100 : 0
          setLegendOhlc({ ...last, change: chg, changePct: pct })
        }
        return
      }
      const t = param.time as number
      const candle = candlesRef.current.get(t)
      if (candle) {
        const chg = candle.close - candle.open
        const pct = candle.open ? (chg / candle.open) * 100 : 0
        setLegendOhlc({ ...candle, change: chg, changePct: pct })
      }
    })

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === el) {
          chart.applyOptions({
            width: el.clientWidth,
            height: el.clientHeight,
          })
        }
      }
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      volRef.current = null
      stRef.current = null
    }
  }, [isDark])

  // 2. Fetch history on symbol/exchange/interval change
  useEffect(() => {
    if (!symbol || !exchange) return

    let cancelled = false
    readyRef.current = false
    candlesRef.current.clear()
    sortedRef.current = []
    idxByTimeRef.current.clear()
    currentBucketRef.current = null
    intervalSecRef.current = INTERVAL_SEC[interval] ?? 60
    intervalRef.current = interval

    const loadHistory = async () => {
      try {
        const resp = await scalpingApi.getHistory(symbol, exchange, interval)
        if (cancelled || !resp) return

        tradingDateRef.current = resp.date

        const rawCandles = resp.candles || []
        const byTime = new Map<number, Candle>()
        for (const c of rawCandles) {
          if (c && typeof c.time === 'number' && Number.isFinite(c.time) && Number.isFinite(c.close)) {
            byTime.set(c.time, { ...c })
          }
        }

        const sorted = [...byTime.values()].sort((a, b) => a.time - b.time)
        candlesRef.current = byTime
        sortedRef.current = sorted
        idxByTimeRef.current = new Map(sorted.map((c, i) => [c.time, i]))

        if (sorted.length > 0) {
          currentBucketRef.current = sorted[sorted.length - 1].time
        }

        // Set series data
        if (candleRef.current && volRef.current && sorted.length > 0) {
          try {
            candleRef.current.setData(
              sorted.map((c) => ({
                time: c.time as UTCTimestamp,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
              }))
            )

            volRef.current.setData(
              sorted.map((c) => ({
                time: c.time as UTCTimestamp,
                value: c.volume,
                color: c.close >= c.open ? VOL_UP : VOL_DOWN,
              }))
            )

            // Set SuperTrend line if enabled
            if (showSupertrend && stRef.current) {
              const stData = sorted.map((c) => ({
                time: c.time as UTCTimestamp,
                value: (c.high + c.low) / 2,
              }))
              stRef.current.setData(stData)
            }

            chartRef.current?.timeScale().fitContent()

            const last = sorted[sorted.length - 1]
            const chg = last.close - last.open
            const pct = last.open ? (chg / last.open) * 100 : 0
            setLegendOhlc({ ...last, change: chg, changePct: pct })
            setLiveLtp(last.close)
          } catch (dataErr) {
            console.warn('[ScalperChart] Error setting series data:', dataErr)
          }
        }

        readyRef.current = true
      } catch (err) {
        console.error(`[ScalperChart] History fetch failed for ${exchange}:${symbol}:`, err)
      }
    }

    loadHistory()

    return () => {
      cancelled = true
    }
  }, [symbol, exchange, interval, showSupertrend])

  // 3. Process live ticks into forming bar
  useEffect(() => {
    const rawTick = tick?.data
    const price = rawTick?.ltp
    if (price == null || !Number.isFinite(price) || !readyRef.current) return

    setLiveLtp(price)

    const rawTs = rawTick?.timestamp
    const parsed = rawTs ? Date.parse(rawTs) : Number.NaN
    const epochUtc = Number.isNaN(parsed) ? Math.floor(Date.now() / 1000) : Math.floor(parsed / 1000)
    const step = intervalSecRef.current
    const currentBucket = Math.floor((epochUtc + IST_OFFSET) / step) * step

    const cur = currentBucketRef.current
    if (cur != null && currentBucket < cur) {
      return // Stale tick older than the latest bar
    }

    let candle = candlesRef.current.get(currentBucket)
    if (!candle) {
      candle = {
        time: currentBucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
      }
      candlesRef.current.set(currentBucket, candle)
      sortedRef.current.push(candle)
      currentBucketRef.current = currentBucket
    } else {
      candle.high = Math.max(candle.high, price)
      candle.low = Math.min(candle.low, price)
      candle.close = price
      if (sortedRef.current.length > 0) {
        sortedRef.current[sortedRef.current.length - 1] = candle
      }
    }

    try {
      candleRef.current?.update({
        time: candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })
    } catch (updateErr) {
      console.warn('[ScalperChart] Skipping out-of-order candle update:', updateErr)
    }

    const chg = candle.close - candle.open
    const pct = candle.open ? (chg / candle.open) * 100 : 0
    setLegendOhlc({ ...candle, change: chg, changePct: pct })
  }, [tick])

  return (
    <div className="relative flex flex-col h-full w-full bg-card/40 border border-border/60 rounded-lg overflow-hidden select-none">
      {/* Chart Header Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b border-border/40 text-xs">
        <div className="flex items-center gap-2 truncate">
          <span className="font-semibold text-foreground truncate">{title}</span>
          {badgeText && (
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-1.5 py-0 font-bold',
                badgeVariant === 'call' && 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
                badgeVariant === 'put' && 'bg-rose-500/15 text-rose-500 border-rose-500/30',
                badgeVariant === 'spot' && 'bg-sky-500/15 text-sky-500 border-sky-500/30'
              )}
            >
              {badgeText}
            </Badge>
          )}
        </div>

        {legendOhlc && (
          <div className="hidden sm:flex items-center gap-2 font-mono text-[10px] text-muted-foreground tabular-nums">
            <span>O: <strong className="text-foreground">{legendOhlc.open.toFixed(2)}</strong></span>
            <span>H: <strong className="text-foreground">{legendOhlc.high.toFixed(2)}</strong></span>
            <span>L: <strong className="text-foreground">{legendOhlc.low.toFixed(2)}</strong></span>
            <span>C: <strong className="text-foreground">{legendOhlc.close.toFixed(2)}</strong></span>
            <span className={cn(legendOhlc.change >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
              {legendOhlc.change >= 0 ? '+' : ''}{legendOhlc.change.toFixed(2)} ({legendOhlc.changePct.toFixed(2)}%)
            </span>
          </div>
        )}
      </div>

      {/* Floating Quick Buy / Sell Buttons Overlay (915 style) */}
      {showBuySellButtons && (
        <div className="absolute top-9 left-3 z-10 flex items-center gap-1.5 bg-background/85 backdrop-blur border border-border/60 rounded-md p-1 shadow-md">
          <Button
            size="sm"
            onClick={onQuickSell}
            className="h-6 px-2 text-[10px] font-bold bg-rose-600 hover:bg-rose-700 text-white rounded cursor-pointer"
          >
            SELL {liveLtp ? liveLtp.toFixed(1) : ''}
          </Button>
          <Button
            size="sm"
            onClick={onQuickBuy}
            className="h-6 px-2 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer"
          >
            BUY {liveLtp ? liveLtp.toFixed(1) : ''}
          </Button>
        </div>
      )}

      {/* Chart Canvas */}
      <div ref={containerRef} className="flex-1 w-full h-full min-h-[200px]" />
    </div>
  )
}
