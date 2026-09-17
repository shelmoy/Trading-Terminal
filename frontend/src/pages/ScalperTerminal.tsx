import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createLinkGroup, type LinkGroup } from 'openalgo-charts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ChevronDown, ChevronUp, RefreshCw, Search, TrendingUp, X } from 'lucide-react'
import { scalpingApi } from '@/api/scalping'
import { tradingApi } from '@/api/trading'
import {
  type ScalperLayoutMode,
  type ScalperTab,
  ScalperUnifiedHeader,
} from '@/components/scalper/ScalperUnifiedHeader'
import { ScalperPositionsView } from '@/components/scalper/ScalperPositionsView'
import { ScalperOrdersView } from '@/components/scalper/ScalperOrdersView'
import { ScalperMiniDeck } from '@/components/scalper/ScalperMiniDeck'
import { ChartPane } from '@/components/trading/ChartPane'
import { IndicatorPickerDialog } from '@/components/trading/IndicatorPickerDialog'
import { SymbolSearchDialog } from '@/components/trading/SymbolSearchDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import OIRange from '@/pages/OIRange'
import { useMarketData } from '@/hooks/useMarketData'
import { useOrderEventRefresh } from '@/hooks/useOrderEventRefresh'
import { CHART_TYPE_GROUPS, CHART_TYPES, chartTypeIcon } from '@/lib/trading/chartTypes'
import type { TradingTerminal } from '@/lib/trading/terminal'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { broadcastCrossTabEvent, onModeChange, useThemeStore } from '@/stores/themeStore'
import { MCX_FUTURE_MAP, SCALPER_UNDERLYINGS, type ScalperUnderlying } from '@/types/scalper'
import type { OptionChainRow } from '@/types/scalping'
import type { Order, Position } from '@/types/trading'
import { showToast } from '@/utils/toast'

function ReplayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M11.5 6.4v11.2a.7.7 0 0 1-1.1.6l-7.1-5.6a.7.7 0 0 1 0-1.2l7.1-5.6a.7.7 0 0 1 1.1.6Z" />
      <path d="M20.5 6.4v11.2a.7.7 0 0 1-1.1.6l-7.1-5.6a.7.7 0 0 1 1.1.6Z" />
    </svg>
  )
}

function UndoIcon({ className, flip }: { className?: string; flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </svg>
  )
}

export default function ScalperTerminal() {
  const { apiKey: storeApiKey } = useAuthStore()
  const { appMode } = useThemeStore()
  const queryClient = useQueryClient()

  // 1. WebSocket config & API key (shares same auth as native Trading page)
  const [apiKey, setApiKey] = useState<string | null>(storeApiKey ?? null)
  const [wsUrl, setWsUrl] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [keyRes, cfgRes] = await Promise.all([
          fetch('/api/websocket/apikey').then((r) => r.json()),
          fetch('/api/websocket/config').then((r) => r.json()),
        ])
        if (!alive) return
        if (keyRes.status === 'success') {
          setApiKey(keyRes.api_key)
        }
        setWsUrl(cfgRes.websocket_url || 'ws://127.0.0.1:8765')
      } catch {
        // use store fallback
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // 2. Active Tab & Layout Mode
  const [activeTab, setActiveTab] = useState<ScalperTab>('scalper')
  const [layoutMode, setLayoutMode] = useState<ScalperLayoutMode>('grid')
  const [deckCollapsed, setDeckCollapsed] = useState(false)

  // 3. Active Underlying Asset (Indices & Commodities)
  const [underlying, setUnderlying] = useState<ScalperUnderlying>(SCALPER_UNDERLYINGS[0])

  // 4. Expiries for active underlying
  const { data: expiryResp } = useQuery({
    queryKey: ['scalper', 'expiry', underlying.foExchange, underlying.symbol],
    queryFn: () => scalpingApi.getExpiry(underlying.symbol, underlying.foExchange, 'options'),
    staleTime: 60000,
  })

  const expiries = useMemo(() => expiryResp?.data ?? [], [expiryResp])
  const [selectedExpiry, setSelectedExpiry] = useState<string>(() => {
    try {
      return localStorage.getItem(`oa-scalper-expiry-${underlying.symbol}`) || ''
    } catch {
      return ''
    }
  })

  // Persist selectedExpiry
  useEffect(() => {
    if (selectedExpiry) {
      try {
        localStorage.setItem(`oa-scalper-expiry-${underlying.symbol}`, selectedExpiry)
      } catch {
        // ignore
      }
    }
  }, [selectedExpiry, underlying.symbol])

  // Default to nearest expiry (current week) as soon as expiries load if none selected or invalid
  useEffect(() => {
    if (expiries.length > 0) {
      if (!selectedExpiry || !expiries.includes(selectedExpiry)) {
        setSelectedExpiry(expiries[0])
      }
    }
  }, [expiries, selectedExpiry])

  // 5. Option strikes chain
  const { data: strikesResp } = useQuery({
    queryKey: ['scalper', 'strikes', underlying.foExchange, underlying.symbol, selectedExpiry],
    queryFn: () =>
      scalpingApi.getStrikes(underlying.symbol, underlying.foExchange, selectedExpiry, 15),
    enabled: !!selectedExpiry && !!underlying.symbol,
    staleTime: 30000,
  })

  const strikeRows = useMemo<OptionChainRow[]>(() => strikesResp?.chain ?? [], [strikesResp])
  const availableStrikes = useMemo(() => strikeRows.map((r) => r.strike).sort((a, b) => a - b), [
    strikeRows,
  ])

  // 6. Live Spot / Future Price via WebSocket (resolves near-month FUT for MCX/commodities)
  const resolvedCommodityFuture = MCX_FUTURE_MAP[underlying.symbol]
  const activeSpotSymbol = strikesResp?.underlying_symbol || resolvedCommodityFuture || underlying.symbol
  const activeSpotExchange = strikesResp?.underlying_exchange || underlying.exchange

  const spotEnabled = !!(activeSpotSymbol && activeSpotExchange)
  const { data: spotMarketData } = useMarketData({
    symbols: spotEnabled
      ? [
          { symbol: activeSpotSymbol, exchange: activeSpotExchange },
          ...(activeSpotSymbol !== underlying.symbol
            ? [{ symbol: underlying.symbol, exchange: underlying.exchange }]
            : []),
        ]
      : [],
    mode: 'LTP',
    enabled: spotEnabled,
  })
  const spotTick = spotEnabled
    ? spotMarketData.get(`${activeSpotExchange}:${activeSpotSymbol}`) ||
      spotMarketData.get(`${underlying.exchange}:${underlying.symbol}`)
    : undefined
  const spotLtp = spotTick?.data?.ltp ?? strikesResp?.underlying_ltp ?? null

  // 7. Calculate ATM Strike
  const currentAtm = useMemo<number | null>(() => {
    if (spotLtp && underlying.strikeStep) {
      return Math.round(spotLtp / underlying.strikeStep) * underlying.strikeStep
    }
    if (strikeRows.length > 0) {
      const mid = Math.floor(strikeRows.length / 2)
      return strikeRows[mid].strike
    }
    if (underlying.symbol === 'NIFTY') return 23250
    return null
  }, [spotLtp, underlying.strikeStep, strikeRows, underlying.symbol])

  // 8. Call & Put Selected Strikes (Default to ATM or cached strike immediately on mount)
  const [selectedCallStrike, setSelectedCallStrike] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(`oa-scalper-call-strike-${underlying.symbol}`)
      if (saved) return Number(saved)
    } catch {
      // ignore
    }
    return underlying.symbol === 'NIFTY' ? 23250 : null
  })
  const [selectedPutStrike, setSelectedPutStrike] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(`oa-scalper-put-strike-${underlying.symbol}`)
      if (saved) return Number(saved)
    } catch {
      // ignore
    }
    return underlying.symbol === 'NIFTY' ? 23250 : null
  })

  useEffect(() => {
    if (selectedCallStrike != null) {
      try {
        localStorage.setItem(`oa-scalper-call-strike-${underlying.symbol}`, String(selectedCallStrike))
      } catch {
        // ignore
      }
    }
  }, [selectedCallStrike, underlying.symbol])

  useEffect(() => {
    if (selectedPutStrike != null) {
      try {
        localStorage.setItem(`oa-scalper-put-strike-${underlying.symbol}`, String(selectedPutStrike))
      } catch {
        // ignore
      }
    }
  }, [selectedPutStrike, underlying.symbol])

  // When ATM strike becomes available, update selected strikes if not yet set
  useEffect(() => {
    if (currentAtm != null) {
      setSelectedCallStrike((prev) => prev ?? currentAtm)
      setSelectedPutStrike((prev) => prev ?? currentAtm)
    }
  }, [currentAtm])

  // 9. Resolve Option Symbols for Call & Put
  const selectedCallRow = useMemo(() => {
    if (selectedCallStrike == null) return null
    return strikeRows.find((r) => r.strike === selectedCallStrike) ?? null
  }, [strikeRows, selectedCallStrike])

  const selectedPutRow = useMemo(() => {
    if (selectedPutStrike == null) return null
    return strikeRows.find((r) => r.strike === selectedPutStrike) ?? null
  }, [strikeRows, selectedPutStrike])

  const lastSavedCallSymbol = useMemo(() => {
    try {
      return localStorage.getItem(`oa-scalper-last-call-${underlying.symbol}`) || ''
    } catch {
      return ''
    }
  }, [underlying.symbol])

  const lastSavedPutSymbol = useMemo(() => {
    try {
      return localStorage.getItem(`oa-scalper-last-put-${underlying.symbol}`) || ''
    } catch {
      return ''
    }
  }, [underlying.symbol])

  const callSymbol =
    selectedCallRow?.ce?.symbol ||
    (selectedCallStrike && selectedExpiry
      ? `${underlying.symbol}${selectedExpiry}${selectedCallStrike}CE`
      : '') ||
    lastSavedCallSymbol

  const putSymbol =
    selectedPutRow?.pe?.symbol ||
    (selectedPutStrike && selectedExpiry
      ? `${underlying.symbol}${selectedExpiry}${selectedPutStrike}PE`
      : '') ||
    lastSavedPutSymbol

  useEffect(() => {
    if (callSymbol) {
      try {
        localStorage.setItem(`oa-scalper-last-call-${underlying.symbol}`, callSymbol)
      } catch {
        // ignore
      }
    }
  }, [callSymbol, underlying.symbol])

  useEffect(() => {
    if (putSymbol) {
      try {
        localStorage.setItem(`oa-scalper-last-put-${underlying.symbol}`, putSymbol)
      } catch {
        // ignore
      }
    }
  }, [putSymbol, underlying.symbol])

  // Live ticks for the chosen Call and Put contracts
  const callEnabled = !!(callSymbol && underlying.foExchange)
  const { data: callMarketData } = useMarketData({
    symbols: callEnabled ? [{ symbol: callSymbol, exchange: underlying.foExchange }] : [],
    mode: 'LTP',
    enabled: callEnabled,
  })
  const callTick = callEnabled
    ? callMarketData.get(`${underlying.foExchange}:${callSymbol}`)
    : undefined
  const callLtp = callTick?.data?.ltp ?? selectedCallRow?.ce?.ltp

  const putEnabled = !!(putSymbol && underlying.foExchange)
  const { data: putMarketData } = useMarketData({
    symbols: putEnabled ? [{ symbol: putSymbol, exchange: underlying.foExchange }] : [],
    mode: 'LTP',
    enabled: putEnabled,
  })
  const putTick = putEnabled ? putMarketData.get(`${underlying.foExchange}:${putSymbol}`) : undefined
  const putLtp = putTick?.data?.ltp ?? selectedPutRow?.pe?.ltp

  // Clean up any stale saved symbols for scalper panes that point to BHEL or SENSEX
  useEffect(() => {
    ;['scalper-spot', 'scalper-call', 'scalper-put'].forEach((paneId) => {
      try {
        const raw = localStorage.getItem(`oa-trading-${paneId}-symbol`)
        if (
          raw &&
          (raw.includes('BHEL') ||
            (paneId !== 'scalper-spot' && raw.includes('SENSEX')) ||
            (paneId === 'scalper-spot' && raw.includes('SENSEX') && underlying.symbol === 'NIFTY'))
        ) {
          localStorage.removeItem(`oa-trading-${paneId}-symbol`)
        }
      } catch {
        // ignore
      }
    })
  }, [underlying.symbol])

  const spotSymbolObj = useMemo(
    () => ({
      symbol: activeSpotSymbol,
      exchange: activeSpotExchange,
      name: activeSpotSymbol !== underlying.symbol ? `${underlying.name} (${activeSpotSymbol})` : underlying.name,
    }),
    [activeSpotSymbol, activeSpotExchange, underlying.symbol, underlying.name]
  )

  const callSymbolObj = useMemo(() => {
    if (!callSymbol) return undefined
    return {
      symbol: callSymbol,
      exchange: underlying.foExchange,
      name: `${underlying.name} ${selectedCallStrike ?? ''} CE`,
    }
  }, [callSymbol, underlying.foExchange, underlying.name, selectedCallStrike])

  const putSymbolObj = useMemo(() => {
    if (!putSymbol) return undefined
    return {
      symbol: putSymbol,
      exchange: underlying.foExchange,
      name: `${underlying.name} ${selectedPutStrike ?? ''} PE`,
    }
  }, [putSymbol, underlying.foExchange, underlying.name, selectedPutStrike])

  // Focused pane tracking (for symbol search and replay)
  const [focusedPaneId, setFocusedPaneId] = useState<string>('scalper-spot')
  const [armed, setArmed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [isReplaying, setIsReplaying] = useState(false)

  const activeSymbol = useMemo(() => {
    if (focusedPaneId === 'scalper-call' && callSymbol) {
      return { symbol: callSymbol, exchange: underlying.foExchange }
    }
    if (focusedPaneId === 'scalper-put' && putSymbol) {
      return { symbol: putSymbol, exchange: underlying.foExchange }
    }
    return { symbol: underlying.symbol, exchange: underlying.exchange }
  }, [focusedPaneId, callSymbol, putSymbol, underlying.symbol, underlying.exchange, underlying.foExchange])

  const handlePickSymbol = (row: { symbol: string; exchange: string; name?: string }) => {
    const matched = SCALPER_UNDERLYINGS.find(
      (u) =>
        u.symbol === row.symbol ||
        (row.symbol.includes(u.symbol) &&
          (row.exchange === 'NSE_INDEX' || row.exchange === 'BSE_INDEX'))
    )
    if (matched) {
      setUnderlying(matched)
      return
    }
    const targetId = focusedPaneId || 'scalper-spot'
    const term = terminalsRef.current[targetId] || terminalsRef.current['scalper-spot']
    if (term) {
      void term.loadSymbol(row)
    }
  }

  const handleToggleReplay = () => {
    const term = terminalsRef.current[focusedPaneId] || terminalsRef.current['scalper-spot']
    if (!term) return
    if (isReplaying) {
      term.stopReplay()
      setIsReplaying(false)
    } else {
      term.startReplay()
      setIsReplaying(true)
    }
  }

  const handleUndoDraw = () => {
    const term = terminalsRef.current[focusedPaneId] || terminalsRef.current['scalper-spot']
    term?.undoDraw()
  }

  const handleRedoDraw = () => {
    const term = terminalsRef.current[focusedPaneId] || terminalsRef.current['scalper-spot']
    term?.redoDraw()
  }

  // 10. LinkGroup for 3 Charts Synchronized Parallel Crosshair & Viewport (Time & Zoom Sync)
  const linkRef = useRef<LinkGroup | null>(null)
  if (linkRef.current === null) {
    linkRef.current = createLinkGroup({
      crosshair: true,
      viewport: true,
      symbol: false,
      whenMissing: 'nearest',
    })
  }

  useEffect(() => {
    linkRef.current?.setOptions({
      crosshair: true,
      viewport: true,
      symbol: false,
      whenMissing: 'nearest',
    })
  }, [])

  useEffect(() => {
    const grp = linkRef.current
    return () => {
      grp?.destroy()
    }
  }, [])

  // Force chart resize when layout mode changes
  useEffect(() => {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'))
    })
    const t = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 50)
    return () => clearTimeout(t)
  }, [layoutMode])

  // 11. Universal Chart Controls (Timeframe, Chart Type, Indicators, Refresh)
  const [universalInterval, setUniversalInterval] = useState('1m')
  const [universalChartType, setUniversalChartType] = useState('candlestick')
  const [indicatorPickerOpen, setIndicatorPickerOpen] = useState(false)
  const [catalog, setCatalog] = useState<{ id: string; name: string; category: string }[]>([])
  const [universalIndicators, setUniversalIndicators] = useState<{ id: string; name: string }[]>([])

  // 11B. Native TradingTerminals Registry
  const terminalsRef = useRef<Record<string, TradingTerminal | null>>({})

  const noteTerminal = useCallback((paneId: string, terminal: TradingTerminal | null) => {
    if (terminal) {
      terminalsRef.current[paneId] = terminal
      terminal.setInterval(universalInterval)
      terminal.setChartType(universalChartType)
    } else {
      delete terminalsRef.current[paneId]
    }
  }, [universalInterval, universalChartType])

  // Inherit indicators from native trading chart (oa-trading-p0-indicators)
  useEffect(() => {
    const tradingIndicators = localStorage.getItem('oa-trading-p0-indicators')
    if (tradingIndicators) {
      try {
        const parsed = JSON.parse(tradingIndicators)
        if (Array.isArray(parsed) && parsed.length > 0) {
          ;['scalper-spot', 'scalper-call', 'scalper-put'].forEach((paneId) => {
            localStorage.setItem(`oa-trading-${paneId}-indicators`, tradingIndicators)
          })
        }
      } catch {
        // ignore
      }
    }
  }, [])

  const handleSetUniversalInterval = (iv: string) => {
    setUniversalInterval(iv)
    ;['scalper-spot', 'scalper-call', 'scalper-put'].forEach((pid) => {
      try {
        localStorage.setItem(`oa-trading-${pid}-interval`, iv)
      } catch {
        // ignore
      }
    })
    Object.values(terminalsRef.current).forEach((t) => {
      t?.setInterval(iv)
    })
  }

  const handleSetUniversalChartType = (ct: string) => {
    setUniversalChartType(ct)
    ;['scalper-spot', 'scalper-call', 'scalper-put'].forEach((pid) => {
      try {
        localStorage.setItem(`oa-trading-${pid}-chart-type`, ct)
      } catch {
        // ignore
      }
    })
    Object.values(terminalsRef.current).forEach((t) => {
      t?.setChartType(ct)
    })
  }

  const handleOpenIndicatorsPicker = async () => {
    const t =
      terminalsRef.current['scalper-spot'] ||
      terminalsRef.current['scalper-call'] ||
      terminalsRef.current['scalper-put']
    if (t) {
      try {
        const cat = await t.indicatorCatalog()
        setCatalog(cat)
        setUniversalIndicators(t.listIndicators().map((i) => ({ id: i.id, name: i.name })))
      } catch {
        // fallback
      }
    }
    setIndicatorPickerOpen(true)
  }

  const handleAddUniversalIndicator = async (indicatorId: string) => {
    await Promise.all(
      Object.values(terminalsRef.current).map((t) => t?.addIndicatorById(indicatorId))
    )
    const t =
      terminalsRef.current['scalper-spot'] ||
      terminalsRef.current['scalper-call'] ||
      terminalsRef.current['scalper-put']
    if (t) {
      setUniversalIndicators(t.listIndicators().map((i) => ({ id: i.id, name: i.name })))
    }
  }

  const handleRemoveUniversalIndicator = (instanceId: string) => {
    Object.values(terminalsRef.current).forEach((t) => {
      t?.removeIndicatorById(instanceId)
    })
    const t =
      terminalsRef.current['scalper-spot'] ||
      terminalsRef.current['scalper-call'] ||
      terminalsRef.current['scalper-put']
    if (t) {
      setUniversalIndicators(t.listIndicators().map((i) => ({ id: i.id, name: i.name })))
    }
  }

  const handleRefreshAllCharts = () => {
    if (underlying && terminalsRef.current['scalper-spot']) {
      void terminalsRef.current['scalper-spot'].loadSymbol({
        symbol: activeSpotSymbol,
        exchange: activeSpotExchange,
        name: activeSpotSymbol !== underlying.symbol ? `${underlying.name} (${activeSpotSymbol})` : underlying.name,
      })
    }
    if (callSymbol && terminalsRef.current['scalper-call']) {
      void terminalsRef.current['scalper-call'].loadSymbol({
        symbol: callSymbol,
        exchange: underlying.foExchange,
        name: `${underlying.name} ${selectedCallStrike} CE`,
      })
    }
    if (putSymbol && terminalsRef.current['scalper-put']) {
      void terminalsRef.current['scalper-put'].loadSymbol({
        symbol: putSymbol,
        exchange: underlying.foExchange,
        name: `${underlying.name} ${selectedPutStrike} PE`,
      })
    }
    showToast.success('Refreshed all 3 charts')
  }

  // Vertical Collapsible Positions Side Drawer state
  const [isVerticalPositionsOpen, setIsVerticalPositionsOpen] = useState(false)

  // 12. Positions, Orders, and Funds Queries
  const [exitLoading, setExitLoading] = useState(false)
  const effectiveApiKey = apiKey || storeApiKey || ''

  const { data: posResp, refetch: refetchPositions, isFetching: isFetchingPos } = useQuery({
    queryKey: ['scalper', 'positions', effectiveApiKey, appMode],
    queryFn: () => tradingApi.getPositions(effectiveApiKey),
    enabled: !!effectiveApiKey,
    refetchInterval: 10000,
  })

  const { data: ordResp, refetch: refetchOrders, isFetching: isFetchingOrd } = useQuery({
    queryKey: ['scalper', 'orders', effectiveApiKey, appMode],
    queryFn: () => tradingApi.getOrders(effectiveApiKey),
    enabled: !!effectiveApiKey,
    refetchInterval: 10000,
  })

  const { data: fundsResp, refetch: refetchFunds } = useQuery({
    queryKey: ['scalper', 'funds', effectiveApiKey, appMode],
    queryFn: () => tradingApi.getFunds(effectiveApiKey),
    enabled: !!effectiveApiKey,
    refetchInterval: 10000,
  })

  const marginData = fundsResp?.data ?? null

  // Invalidate and refetch immediately whenever Live / Analyzer mode is toggled
  useEffect(() => {
    const unsubscribe = onModeChange(() => {
      void refetchPositions()
      void refetchOrders()
      void refetchFunds()
    })
    return () => unsubscribe()
  }, [refetchPositions, refetchOrders, refetchFunds])

  useOrderEventRefresh(() => {
    refetchPositions()
    refetchOrders()
    refetchFunds()
  })

  const positions = useMemo<Position[]>(() => (posResp?.data ?? []) as Position[], [posResp])
  const orders = useMemo<Order[]>(() => (ordResp?.data?.orders ?? []) as Order[], [ordResp])

  const netPnl = useMemo(() => {
    return positions.reduce((sum, p) => sum + (p.pnl ?? 0), 0)
  }, [positions])

  const openPositionsCount = useMemo(() => {
    return positions.filter((p) => Math.abs(p.quantity ?? 0) > 0).length
  }, [positions])

  const openOrdersCount = useMemo(() => {
    return orders.filter(
      (o) =>
        o.order_status === 'open' ||
        o.order_status === 'pending' ||
        o.order_status === 'trigger pending'
    ).length
  }, [orders])

  // 13. Order Execution Handler
  const handleExecuteOrder = async (params: {
    symbol: string
    exchange: string
    action: 'BUY' | 'SELL'
    quantity: number
    pricetype: 'MARKET' | 'LIMIT'
    product: 'MIS' | 'NRML'
    ltp?: number
  }) => {
    try {
      const resp = await scalpingApi.placeOrder({
        symbol: params.symbol,
        exchange: params.exchange,
        action: params.action,
        quantity: params.quantity,
        product: params.product,
        ltp: params.ltp,
      })

      if (resp && resp.status === 'success') {
        showToast.success(`${params.action} ${params.quantity} ${params.symbol} executed`)
        refetchPositions()
        refetchOrders()
        refetchFunds()
        // Invalidate universal app-wide query caches immediately
        void queryClient.invalidateQueries({ queryKey: ['trading-dock'] })
        void queryClient.invalidateQueries({ queryKey: ['positions'] })
        void queryClient.invalidateQueries({ queryKey: ['orders'] })
        void queryClient.invalidateQueries({ queryKey: ['funds'] })
        void queryClient.invalidateQueries({ queryKey: ['orderbook'] })
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        // Broadcast across all other open windows/tabs in 0ms
        broadcastCrossTabEvent('ORDER_OR_POSITION_CHANGED')
      } else {
        showToast.error(resp?.message || 'Order failed')
      }
    } catch (e: any) {
      showToast.error(e?.message || 'Order placement failed')
    }
  }

  // 14. Square-Off Leg Handler
  const handleSquareOffPosition = async (pos: Position) => {
    try {
      await scalpingApi.closeLeg({
        symbol: pos.symbol,
        exchange: pos.exchange,
        action: (pos.quantity ?? 0) > 0 ? 'SELL' : 'BUY',
        quantity: Math.abs(pos.quantity ?? 0),
        product: pos.product as any,
      })
      showToast.success(`Closed position for ${pos.symbol}`)
      refetchPositions()
      refetchOrders()
      refetchFunds()
      void queryClient.invalidateQueries({ queryKey: ['trading-dock'] })
      void queryClient.invalidateQueries({ queryKey: ['positions'] })
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['funds'] })
      void queryClient.invalidateQueries({ queryKey: ['orderbook'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      broadcastCrossTabEvent('ORDER_OR_POSITION_CHANGED')
    } catch (e: any) {
      showToast.error(e?.message || 'Failed to close position')
    }
  }

  // 15. Cancel Order Handler
  const handleCancelOrder = async (orderId: string) => {
    try {
      await tradingApi.cancelOrder(orderId)
      showToast.success(`Order ${orderId} cancelled`)
      refetchOrders()
      refetchFunds()
      void queryClient.invalidateQueries({ queryKey: ['trading-dock'] })
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['orderbook'] })
      broadcastCrossTabEvent('ORDER_OR_POSITION_CHANGED')
    } catch (e: any) {
      showToast.error(e?.message || 'Failed to cancel order')
    }
  }

  const handleCancelAllOrders = async () => {
    const workingOrders = orders.filter(
      (o) =>
        o.order_status === 'open' ||
        o.order_status === 'pending' ||
        o.order_status === 'trigger pending'
    )
    if (!workingOrders.length) return

    try {
      await Promise.all(workingOrders.map((o) => tradingApi.cancelOrder(o.orderid)))
      showToast.success(`Cancelled ${workingOrders.length} working orders`)
      refetchOrders()
      refetchFunds()
      void queryClient.invalidateQueries({ queryKey: ['trading-dock'] })
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['orderbook'] })
      broadcastCrossTabEvent('ORDER_OR_POSITION_CHANGED')
    } catch (e: any) {
      showToast.error(e?.message || 'Failed to cancel all orders')
    }
  }

  // 16. Exit All Handler
  const handleExitAll = async () => {
    setExitLoading(true)
    try {
      const resp = await scalpingApi.closeAll()
      if (resp && resp.status === 'success') {
        showToast.success('Exit all positions requested')
        refetchPositions()
        refetchOrders()
        refetchFunds()
        void queryClient.invalidateQueries({ queryKey: ['trading-dock'] })
        void queryClient.invalidateQueries({ queryKey: ['positions'] })
        void queryClient.invalidateQueries({ queryKey: ['orders'] })
        void queryClient.invalidateQueries({ queryKey: ['funds'] })
        void queryClient.invalidateQueries({ queryKey: ['orderbook'] })
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        broadcastCrossTabEvent('ORDER_OR_POSITION_CHANGED')
      } else {
        showToast.error(resp?.message || 'Exit all failed')
      }
    } catch (e: any) {
      showToast.error(e?.message || 'Exit all failed')
    } finally {
      setExitLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden select-none">
      {/* 1. UNIFIED SINGLE-LINE HEADER (h-11) */}
      <ScalperUnifiedHeader
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        activeUnderlying={underlying}
        onSelectUnderlying={(u) => {
          setUnderlying(u)
          setSelectedCallStrike(null)
          setSelectedPutStrike(null)
          const savedExp = localStorage.getItem(`oa-scalper-expiry-${u.symbol}`) || ''
          setSelectedExpiry(savedExp)
        }}
        expiries={expiries}
        selectedExpiry={selectedExpiry}
        onSelectExpiry={setSelectedExpiry}
        currentAtm={currentAtm}
        layoutMode={layoutMode}
        onChangeLayoutMode={setLayoutMode}
        openPositionsCount={openPositionsCount}
        openOrdersCount={openOrdersCount}
        netPnl={netPnl}
        onExitAll={handleExitAll}
        exitLoading={exitLoading}
        appMode={appMode}
        availableMargin={marginData?.availablecash}
      />

      {/* 2. MAIN WORKSPACE CONTENT */}
      {/* 2A. SCALPER TAB: 3 NATIVE OPENALGO CHARTS + MINI EXECUTION DECK */}
      <div
        className={cn(
          'flex-1 flex flex-col min-h-0 w-full overflow-hidden',
          activeTab !== 'scalper' && 'hidden'
        )}
      >
        {/* UNIVERSAL CHART CONTROLS TOOLBAR */}
        <div className="h-8 border-b border-border bg-background/95 backdrop-blur px-2 flex items-center justify-between gap-2 text-xs select-none shrink-0 z-30">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {/* Symbol Search Pill at Start of Toolbar */}
            <Button
              variant="outline"
              size="sm"
              className="h-6.5 shrink-0 gap-1.5 font-medium px-2 text-[11px] bg-muted/40 border-border/60 hover:bg-accent cursor-pointer"
              onClick={() => setSearchOpen(true)}
              title="Search symbol to chart"
            >
              <Search className="h-3.5 w-3.5 opacity-70" />
              <span className="font-semibold tracking-wide">{activeSymbol.symbol}</span>
              <span className="rounded bg-muted px-1.5 py-0.2 text-[9px] font-mono font-medium text-muted-foreground">
                {activeSymbol.exchange}
              </span>
            </Button>

            <div className="h-3.5 w-px bg-border/60 mx-0.5 shrink-0" />

            {/* Timeframe Selector Pills */}
            <div className="flex items-center bg-muted/60 p-0.5 rounded-md border border-border/50 shrink-0">
              {['1m', '3m', '5m', '15m', '1h', '1D'].map((iv) => (
                <button
                  key={iv}
                  type="button"
                  onClick={() => handleSetUniversalInterval(iv)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer',
                    universalInterval === iv
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  )}
                >
                  {iv}
                </button>
              ))}
            </div>

            <div className="h-3.5 w-px bg-border/60 mx-0.5 shrink-0" />

            {/* Universal Chart Type Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 gap-1 text-[11px] font-medium border border-border/50 cursor-pointer"
                >
                  <span className="h-3.5 w-3.5">{chartTypeIcon(universalChartType)}</span>
                  <span className="capitalize">{CHART_TYPES[universalChartType]?.label || 'Candles'}</span>
                  <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {CHART_TYPE_GROUPS.map((group, gIdx) => (
                  <div key={`group-${gIdx}`} className="px-1 py-1">
                    {group.map((d) => (
                      <DropdownMenuItem
                        key={d.value}
                        onSelect={() => handleSetUniversalChartType(d.value)}
                        className={cn(
                          'gap-2 text-xs cursor-pointer',
                          d.value === universalChartType && 'text-primary font-bold'
                        )}
                      >
                        <span className="h-3.5 w-3.5">{chartTypeIcon(d.iconKey)}</span>
                        {d.label}
                      </DropdownMenuItem>
                    ))}
                    {gIdx < CHART_TYPE_GROUPS.length - 1 && <DropdownMenuSeparator />}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Universal Indicators Trigger */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenIndicatorsPicker}
              className="h-6 px-2 gap-1 text-[11px] font-medium shrink-0 cursor-pointer"
              title="Add or manage indicators on all 3 charts"
            >
              <Activity className="h-3.5 w-3.5 text-primary" />
              <span>Indicators</span>
              {universalIndicators.length > 0 && (
                <span className="rounded bg-primary/20 text-primary px-1 text-[10px] font-bold">
                  {universalIndicators.length}
                </span>
              )}
            </Button>

            {/* Universal Refresh Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshAllCharts}
              className="h-6 px-2 gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
              title="Refresh all 3 charts simultaneously"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            <div className="h-3.5 w-px bg-border/60 mx-0.5 shrink-0" />

            {/* Native One-Click Switch from Trading */}
            <label className="flex h-6 shrink-0 cursor-pointer items-center gap-1.5 pl-1 select-none">
              <Switch
                checked={armed}
                onCheckedChange={setArmed}
                aria-label="One-Click"
                className="scale-75"
              />
              <Badge variant={armed ? 'destructive' : 'secondary'} className="text-[10px] h-4.5 px-1.5 font-bold">
                <span className="hidden lg:inline">One-Click&nbsp;</span>
                {armed ? 'ARMED' : 'off'}
              </Badge>
            </label>

            <div className="h-3.5 w-px bg-border/60 mx-0.5 shrink-0" />

            {/* Native Replay Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleReplay}
              className={cn(
                'h-6 px-2 gap-1 text-[11px] font-medium shrink-0 cursor-pointer',
                isReplaying ? 'bg-primary/20 text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
              )}
              title={isReplaying ? 'Leave replay mode' : 'Replay session from a chosen bar'}
            >
              <ReplayIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Replay</span>
            </Button>

            <div className="h-3.5 w-px bg-border/60 mx-0.5 shrink-0" />

            {/* Drawing Undo / Redo */}
            <div className="flex items-center gap-0.5 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={handleUndoDraw}
                title="Undo drawing (Ctrl + Z)"
              >
                <UndoIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={handleRedoDraw}
                title="Redo drawing (Ctrl + Shift + Z)"
              >
                <UndoIcon className="h-3.5 w-3.5" flip />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Synced Crosshair & Cursor Badge */}
            <div className="hidden md:flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted/40 border border-border/40 px-2 py-0.5 rounded">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Synced Crosshair</span>
            </div>
          </div>
        </div>

        {/* 3 CHARTS GRID + VERTICAL POSITIONS DRAWER */}
        <div className="flex-1 min-h-0 w-full overflow-hidden flex relative">
          {/* Charts container (flex-1) */}
          <div className="flex-1 min-w-0 h-full overflow-hidden relative">
            {apiKey && wsUrl ? (
              <>
                <div
                  className={cn(
                    'h-full w-full gap-1 bg-border/40 p-0.5',
                    layoutMode === 'grid' && 'grid grid-cols-2 grid-rows-2',
                    layoutMode === 'columns' && 'grid grid-cols-3',
                    (layoutMode === 'spot' || layoutMode === 'call' || layoutMode === 'put') && 'flex'
                  )}
                >
                  {/* SPOT PANE */}
                  <div
                    onClick={() => setFocusedPaneId('scalper-spot')}
                    className={cn(
                      'relative h-full w-full bg-background overflow-hidden transition-[ring,box-shadow] duration-75 rounded-lg p-0.5',
                      layoutMode === 'grid' && 'col-span-1 row-span-2',
                      layoutMode === 'columns' && 'order-2 col-span-1',
                      layoutMode === 'spot' && 'flex-1',
                      (layoutMode === 'call' || layoutMode === 'put') && 'hidden',
                      'hover:ring-2 hover:ring-sky-500 hover:z-20 hover:shadow-[0_0_15px_rgba(14,165,233,0.35)]',
                      focusedPaneId === 'scalper-spot' &&
                        'ring-2 ring-sky-500 shadow-[0_0_12px_rgba(14,165,233,0.25)] z-10'
                    )}
                  >
                    <ChartPane
                      paneId="scalper-spot"
                      apiKey={apiKey}
                      wsUrl={wsUrl}
                      linkGroup={linkRef.current}
                      onTerminalChange={noteTerminal}
                      onFocusPane={(_, pid) => pid && setFocusedPaneId(pid)}
                      armed={armed}
                      hideToolbar={true}
                      paneTitle={`SPOT: ${underlying.name}`}
                      initialSymbol={spotSymbolObj}
                      symbol={spotSymbolObj}
                      isFocused={focusedPaneId === 'scalper-spot'}
                      className={cn(
                        'hover:border-sky-500',
                        focusedPaneId === 'scalper-spot' && 'border-sky-500 ring-1 ring-sky-500/80'
                      )}
                    />
                  </div>

                  {/* CALL PANE */}
                  <div
                    onClick={() => setFocusedPaneId('scalper-call')}
                    className={cn(
                      'relative h-full w-full bg-background overflow-hidden transition-[ring,box-shadow] duration-75 rounded-lg p-0.5',
                      layoutMode === 'grid' && 'col-span-1 row-span-1',
                      layoutMode === 'columns' && 'order-1 col-span-1',
                      layoutMode === 'call' && 'flex-1',
                      (layoutMode === 'spot' || layoutMode === 'put') && 'hidden',
                      'hover:ring-2 hover:ring-emerald-500 hover:z-20 hover:shadow-[0_0_15px_rgba(16,185,129,0.35)]',
                      focusedPaneId === 'scalper-call' &&
                        'ring-2 ring-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.25)] z-10'
                    )}
                  >
                    <ChartPane
                      paneId="scalper-call"
                      apiKey={apiKey}
                      wsUrl={wsUrl}
                      linkGroup={linkRef.current}
                      onTerminalChange={noteTerminal}
                      onFocusPane={(_, pid) => pid && setFocusedPaneId(pid)}
                      armed={armed}
                      hideToolbar={true}
                      paneTitle={`CALL: ${callSymbol || (selectedCallStrike ? `${selectedCallStrike} CE` : 'ATM CE')}`}
                      initialSymbol={callSymbolObj}
                      symbol={callSymbolObj}
                      isFocused={focusedPaneId === 'scalper-call'}
                      className={cn(
                        'hover:border-emerald-500',
                        focusedPaneId === 'scalper-call' && 'border-emerald-500 ring-1 ring-emerald-500/80'
                      )}
                    />
                  </div>

                  {/* PUT PANE */}
                  <div
                    onClick={() => setFocusedPaneId('scalper-put')}
                    className={cn(
                      'relative h-full w-full bg-background overflow-hidden transition-[ring,box-shadow] duration-75 rounded-lg p-0.5',
                      layoutMode === 'grid' && 'col-span-1 row-span-1',
                      layoutMode === 'columns' && 'order-3 col-span-1',
                      layoutMode === 'put' && 'flex-1',
                      (layoutMode === 'spot' || layoutMode === 'call') && 'hidden',
                      'hover:ring-2 hover:ring-rose-500 hover:z-20 hover:shadow-[0_0_15px_rgba(244,63,94,0.35)]',
                      focusedPaneId === 'scalper-put' &&
                        'ring-2 ring-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.25)] z-10'
                    )}
                  >
                    <ChartPane
                      paneId="scalper-put"
                      apiKey={apiKey}
                      wsUrl={wsUrl}
                      linkGroup={linkRef.current}
                      onTerminalChange={noteTerminal}
                      onFocusPane={(_, pid) => pid && setFocusedPaneId(pid)}
                      armed={armed}
                      hideToolbar={true}
                      paneTitle={`PUT: ${putSymbol || (selectedPutStrike ? `${selectedPutStrike} PE` : 'ATM PE')}`}
                      initialSymbol={putSymbolObj}
                      symbol={putSymbolObj}
                      isFocused={focusedPaneId === 'scalper-put'}
                      className={cn(
                        'hover:border-rose-500',
                        focusedPaneId === 'scalper-put' && 'border-rose-500 ring-1 ring-rose-500/80'
                      )}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                Loading charting terminal…
              </div>
            )}
          </div>

          {/* Vertical Collapsible Positions Side Drawer */}
          {isVerticalPositionsOpen && (
            <div className="w-[440px] max-w-[50vw] h-full flex flex-col border-l border-border bg-background shrink-0 z-30 animate-in slide-in-from-right duration-200 shadow-xl">
              <div className="h-8 border-b border-border px-3 flex items-center justify-between bg-card/60 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">Positions</span>
                  {openPositionsCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-bold bg-emerald-500/20 text-emerald-400">
                      {openPositionsCount} Open
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => setIsVerticalPositionsOpen(false)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <ScalperPositionsView
                  positions={positions}
                  onSquareOffPosition={handleSquareOffPosition}
                  onExitAll={handleExitAll}
                  onRefresh={refetchPositions}
                  loading={isFetchingPos}
                  appMode={appMode}
                  marginData={marginData}
                />
              </div>
            </div>
          )}

          {/* Vertical POSITIONS Rail Tab */}
          <button
            type="button"
            onClick={() => setIsVerticalPositionsOpen((prev) => !prev)}
            className={cn(
              'w-7 flex flex-col items-center justify-start pt-3 pb-3 bg-muted/40 hover:bg-muted border-l border-border transition-colors cursor-pointer select-none shrink-0 group',
              isVerticalPositionsOpen && 'bg-primary/15 text-primary border-primary/40'
            )}
            title={isVerticalPositionsOpen ? 'Collapse Positions Drawer' : 'Expand Positions Drawer'}
          >
            <TrendingUp className="h-3.5 w-3.5 mb-3 group-hover:scale-110 transition-transform" />
            <span className="[writing-mode:vertical-lr] rotate-180 text-[10px] font-extrabold tracking-widest uppercase">
              Positions
            </span>
            {openPositionsCount > 0 && (
              <span className="mt-3 px-1 py-0.5 rounded text-[9px] bg-emerald-500 text-white font-extrabold leading-none">
                {openPositionsCount}
              </span>
            )}
          </button>
        </div>

        {/* Indicator Picker Dialog for Universal Toolbar */}
        <IndicatorPickerDialog
          open={indicatorPickerOpen}
          catalog={catalog}
          active={universalIndicators}
          onAdd={handleAddUniversalIndicator}
          onRemove={handleRemoveUniversalIndicator}
          onSettings={() => {}}
          onClose={() => setIndicatorPickerOpen(false)}
        />

        {/* Symbol Search Dialog for Universal Toolbar */}
        <SymbolSearchDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          search={(q, ex, limit) => {
            const term = terminalsRef.current[focusedPaneId] || terminalsRef.current['scalper-spot']
            return term ? term.search(q, ex, limit) : Promise.resolve([])
          }}
          onPick={handlePickSymbol}
          initialQuery={activeSymbol.symbol}
        />

        {/* EXPAND / MINIMIZE HANDLE BETWEEN CHARTS AND EXECUTION DECK */}
        <div className="h-2 w-full flex items-center justify-center relative bg-border/40 hover:bg-primary/20 transition-colors group cursor-pointer select-none">
          <button
            type="button"
            onClick={() => setDeckCollapsed((c) => !c)}
            className="absolute -top-1.5 px-3 py-0.5 rounded-full bg-background/95 border border-border/80 text-[10px] text-muted-foreground group-hover:text-primary group-hover:border-primary/50 shadow-xs flex items-center gap-1 transition-all z-30 cursor-pointer"
            title={deckCollapsed ? 'Expand Execution Deck' : 'Minimize Execution Deck'}
          >
            {deckCollapsed ? (
              <>
                <ChevronUp className="h-3 w-3" />
                <span className="font-semibold text-[9px] uppercase tracking-wider">Expand Deck</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                <span className="font-semibold text-[9px] uppercase tracking-wider">Minimize Deck</span>
              </>
            )}
          </button>
        </div>

        {/* MINIMALIST EXECUTION DECK BELOW CHARTS */}
        <ScalperMiniDeck
          atmStrike={currentAtm ?? 0}
          strikes={availableStrikes}
          strikeRows={strikeRows}
          callStrike={selectedCallStrike ?? currentAtm ?? 0}
          putStrike={selectedPutStrike ?? currentAtm ?? 0}
          onSelectCallStrike={(s) => setSelectedCallStrike(s)}
          onSelectPutStrike={(s) => setSelectedPutStrike(s)}
          callSymbol={callSymbol}
          putSymbol={putSymbol}
          exchange={underlying.foExchange}
          callLtp={callLtp}
          putLtp={putLtp}
          lotSize={selectedCallRow?.ce?.lotsize || selectedPutRow?.pe?.lotsize || underlying.lotSize || 1}
          positions={positions}
          onExecuteOrder={handleExecuteOrder}
          appMode={appMode}
          collapsed={deckCollapsed}
          onToggleCollapse={() => setDeckCollapsed((c) => !c)}
        />
      </div>

      {/* 2B. POSITIONS WORKSPACE TAB */}
      {activeTab === 'positions' && (
        <ScalperPositionsView
          positions={positions}
          onSquareOffPosition={handleSquareOffPosition}
          onExitAll={handleExitAll}
          onRefresh={refetchPositions}
          loading={isFetchingPos}
          appMode={appMode}
          marginData={marginData}
        />
      )}

      {/* 2C. ORDERS WORKSPACE TAB */}
      {activeTab === 'orders' && (
        <ScalperOrdersView
          orders={orders}
          onCancelOrder={handleCancelOrder}
          onCancelAll={handleCancelAllOrders}
          onRefresh={refetchOrders}
          loading={isFetchingOrd}
          appMode={appMode}
        />
      )}

      {/* 2D. OPEN INTEREST / OPTION CHAIN WORKSPACE TAB (OI RANGE) */}
      {activeTab === 'oi' && (
        <div className="flex-1 min-h-0 flex flex-col bg-background text-foreground overflow-y-auto">
          <OIRange
            isEmbedded={true}
            initialExchange={underlying.foExchange}
            initialUnderlying={underlying.symbol}
            initialExpiry={selectedExpiry}
            onSelectStrike={(strike) => {
              setSelectedCallStrike(strike)
              setSelectedPutStrike(strike)
              setActiveTab('scalper')
              showToast.info(`Loaded ${strike} strike into Scalper charts`)
            }}
          />
        </div>
      )}
    </div>
  )
}

