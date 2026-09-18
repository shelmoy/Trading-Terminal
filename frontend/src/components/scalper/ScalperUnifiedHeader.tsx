import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  CandlestickChart,
  ChevronDown,
  ClipboardList,
  Columns3,
  ExternalLink,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { tradingApi, type QuotesData } from '@/api/trading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/stores/authStore'
import { useMarketData } from '@/hooks/useMarketData'
import { showToast } from '@/utils/toast'
import { cn, formatIndianNumber } from '@/lib/utils'
import { useThemeStore } from '@/stores/themeStore'
import {
  SCALPER_UNDERLYINGS,
  getUnderlyingQuoteSymbol,
  getUnderlyingQuoteExchange,
  type ScalperUnderlying,
} from '@/types/scalper'

export type ScalperTab = 'scalper' | 'positions' | 'orders' | 'oi'
export type ScalperLayoutMode = 'grid' | 'columns' | 'spot' | 'call' | 'put'

interface Props {
  activeTab: ScalperTab
  onChangeTab: (tab: ScalperTab) => void
  activeUnderlying: ScalperUnderlying
  onSelectUnderlying: (u: ScalperUnderlying) => void
  expiries: string[]
  selectedExpiry: string
  onSelectExpiry: (exp: string) => void
  currentAtm: number | null
  layoutMode: ScalperLayoutMode
  onChangeLayoutMode: (mode: ScalperLayoutMode) => void
  openPositionsCount: number
  openOrdersCount: number
  netPnl: number
  onExitAll?: () => void
  exitLoading?: boolean
  appMode?: 'live' | 'analyzer'
  availableMargin?: number | string | null
  visibleCharts?: { spot: boolean; ce: boolean; pe: boolean }
  onToggleChart?: (chart: 'spot' | 'ce' | 'pe') => void
}

export function ScalperUnifiedHeader({
  activeTab,
  onChangeTab,
  activeUnderlying,
  onSelectUnderlying,
  expiries,
  selectedExpiry,
  onSelectExpiry,
  currentAtm,
  layoutMode,
  onChangeLayoutMode,
  openPositionsCount,
  openOrdersCount,
  netPnl,
  onExitAll,
  exitLoading = false,
  appMode: propAppMode,
  availableMargin,
  visibleCharts,
  onToggleChart,
}: Props) {
  const { apiKey } = useAuthStore()
  const { appMode: storeAppMode, toggleAppMode, isTogglingMode } = useThemeStore()
  const appMode = propAppMode || storeAppMode

  // Real-time market data symbols for all underlyings (including MCX near-month futures)
  const streamSymbols = useMemo(() => {
    const list: Array<{ symbol: string; exchange: string }> = []
    const seen = new Set<string>()
    for (const u of SCALPER_UNDERLYINGS) {
      const qSym = getUnderlyingQuoteSymbol(u)
      const qEx = getUnderlyingQuoteExchange(u)
      const key = `${qEx}:${qSym}`
      if (!seen.has(key)) {
        seen.add(key)
        list.push({ symbol: qSym, exchange: qEx })
      }
      const rawKey = `${u.exchange}:${u.symbol}`
      if (!seen.has(rawKey)) {
        seen.add(rawKey)
        list.push({ symbol: u.symbol, exchange: u.exchange })
      }
    }
    return list
  }, [])

  // 1. Shared WebSocket feed (0-1ms latency)
  const { data: wsMarketData } = useMarketData({
    symbols: streamSymbols,
    mode: 'Quote',
    enabled: true,
  })

  // 2. Initial MultiQuotes fetch for instant baseline display
  const { data: multiQuotesResp } = useQuery({
    queryKey: ['scalper', 'underlyings-multiquotes', apiKey],
    queryFn: () =>
      apiKey
        ? tradingApi.getMultiQuotes(apiKey, streamSymbols)
        : Promise.resolve({ status: 'success', results: [] } as any),
    enabled: !!apiKey,
    staleTime: 15000,
    refetchInterval: 30000,
  })

  const mqMap = useMemo(() => {
    const map = new Map<string, QuotesData>()
    if (multiQuotesResp?.results) {
      for (const item of multiQuotesResp.results) {
        map.set(`${item.exchange}:${item.symbol}`, item.data)
      }
    }
    return map
  }, [multiQuotesResp])

  // Helper to extract live LTP, previous close, and day % change for any underlying
  const getUnderlyingQuote = useCallback(
    (u: ScalperUnderlying) => {
      const qSym = getUnderlyingQuoteSymbol(u)
      const qEx = getUnderlyingQuoteExchange(u)
      const tick = wsMarketData.get(`${qEx}:${qSym}`) || wsMarketData.get(`${u.exchange}:${u.symbol}`)
      const mq = mqMap.get(`${qEx}:${qSym}`) || mqMap.get(`${u.exchange}:${u.symbol}`)

      const ltp: number | null = tick?.data?.ltp ?? mq?.ltp ?? null
      // prevClose MUST use broker quote prev_close (or tick.data.prev_close).
      // Never fall back to tick.data.close if it equals ltp, because brokers send the current bar close as close.
      const prevClose: number | null =
        mq?.prev_close ??
        (tick?.data as any)?.prev_close ??
        (tick?.data?.close && ltp !== null && Math.abs(tick.data.close - ltp) > 0.05 ? tick.data.close : null)

      let chgPct = 0
      if (tick?.data?.change_percent !== undefined && Math.abs(tick.data.change_percent) > 0.0001) {
        chgPct = tick.data.change_percent
      } else if (prevClose && prevClose > 0 && ltp && ltp > 0) {
        chgPct = ((ltp - prevClose) / prevClose) * 100
      } else if (mq?.ltp && mq?.prev_close && mq.prev_close > 0) {
        chgPct = ((mq.ltp - mq.prev_close) / mq.prev_close) * 100
      }

      return { ltp, prevClose, chgPct }
    },
    [wsMarketData, mqMap]
  )

  const currentQuote = getUnderlyingQuote(activeUnderlying)
  const currentLtp = currentQuote.ltp
  const currentChg = currentQuote.chgPct
  const isUp = currentChg >= 0

  const isProfit = netPnl >= 0

  const [isFullscreen, setIsFullscreen] = useState(false)

  const handleModeToggle = async () => {
    if (isTogglingMode) return
    const result = await toggleAppMode()
    if (result.success) {
      const newMode = useThemeStore.getState().appMode
      showToast.success(`Switched to ${newMode === 'live' ? 'Live' : 'Sandbox (Analyze)'} mode`)
      if (newMode === 'analyzer') {
        setTimeout(() => {
          showToast.warning('Analyzer (Sandbox) mode is for paper trading / testing only', undefined, {
            duration: 10000,
          })
        }, 1500)
      }
    } else {
      showToast.error(result.message || 'Failed to toggle mode')
    }
  }

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
      window.dispatchEvent(new Event('resize'))
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50)
      setTimeout(() => window.dispatchEvent(new Event('resize')), 150)
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  return (
    <header className="h-11 border-b border-border bg-background/95 backdrop-blur px-2.5 flex items-center justify-between text-xs select-none shrink-0 z-40">
      {/* ── LEFT SECTION: Logo + Top Workspace Tabs + Underlying Picker ── */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
        {/* Brand */}
        <Link to="/dashboard" className="flex items-center gap-1.5 mr-1 shrink-0" title="OpenAlgo Dashboard">
          <img src="/logo.png" alt="OpenAlgo" className="h-6 w-6" />
          <span className="font-bold text-xs hidden lg:inline tracking-tight">Scalper 915</span>
        </Link>

        {/* Top Workspace Navigation Tabs (Groww 915 Style) */}
        <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50 shrink-0">
          <button
            type="button"
            onClick={() => onChangeTab('scalper')}
            className={cn(
              'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer',
              activeTab === 'scalper'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <Zap className="h-3 w-3" />
            <span>Scalper</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('positions')}
            className={cn(
              'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer',
              activeTab === 'positions'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <CandlestickChart className="h-3 w-3" />
            <span>Positions</span>
            {openPositionsCount > 0 && (
              <span className="px-1 py-0 rounded text-[9px] bg-emerald-500 text-white font-bold">
                {openPositionsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('orders')}
            className={cn(
              'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer',
              activeTab === 'orders'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <ClipboardList className="h-3 w-3" />
            <span>Orders</span>
            {openOrdersCount > 0 && (
              <span className="px-1 py-0 rounded text-[9px] bg-amber-500 text-white font-bold">
                {openOrdersCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('oi')}
            className={cn(
              'px-2 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer hidden sm:flex',
              activeTab === 'oi'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <BarChart3 className="h-3 w-3" />
            <span>OI</span>
          </button>
        </div>

        <div className="h-4 w-px bg-border/60 mx-0.5 shrink-0" />

        {/* Underlying Asset Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 font-semibold text-xs flex items-center gap-1.5 bg-background border-border/70 hover:bg-muted/60 cursor-pointer shrink-0"
            >
              <span className="font-bold text-primary">{activeUnderlying.name}</span>
              {currentLtp != null && (
                <span className="font-mono tabular-nums text-foreground ml-0.5">
                  {currentLtp.toLocaleString('en-IN', {
                    minimumFractionDigits: activeUnderlying.decimals,
                    maximumFractionDigits: activeUnderlying.decimals,
                  })}
                </span>
              )}
              {currentLtp != null && (
                <span
                  className={cn(
                    'text-[10px] tabular-nums font-semibold flex items-center font-mono',
                    isUp ? 'text-emerald-500' : 'text-rose-500'
                  )}
                >
                  {isUp ? '+' : ''}
                  {currentChg.toFixed(2)}%
                </span>
              )}
              <ChevronDown className="h-3 w-3 text-muted-foreground ml-0.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 max-h-80 overflow-y-auto">
            <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground tracking-wider">
              Indian Indices (NSE / BSE)
            </DropdownMenuLabel>
            {SCALPER_UNDERLYINGS.filter((u) => u.category === 'INDICES').map((u) => {
              const q = getUnderlyingQuote(u)
              const isSelected = u.symbol === activeUnderlying.symbol
              const isItemUp = q.chgPct >= 0
              return (
                <DropdownMenuItem
                  key={u.symbol}
                  onClick={() => onSelectUnderlying(u)}
                  className={cn(
                    'flex items-center justify-between text-xs cursor-pointer py-1.5 px-2.5',
                    isSelected && 'bg-primary/10 font-bold text-primary'
                  )}
                >
                  <div>
                    <span className="font-semibold">{u.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5">({u.exchange})</span>
                  </div>
                  <div className="text-right font-mono tabular-nums text-[11px] flex flex-col items-end">
                    <span className="font-semibold text-foreground">
                      {q.ltp != null
                        ? q.ltp.toLocaleString('en-IN', {
                            minimumFractionDigits: u.decimals,
                            maximumFractionDigits: u.decimals,
                          })
                        : '—'}
                    </span>
                    {q.ltp != null && (
                      <span className={cn('text-[10px] font-semibold', isItemUp ? 'text-emerald-500' : 'text-rose-500')}>
                        {isItemUp ? '+' : ''}
                        {q.chgPct.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </DropdownMenuItem>
              )
            })}

            <DropdownMenuSeparator />

            <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground tracking-wider">
              MCX Commodities
            </DropdownMenuLabel>
            {SCALPER_UNDERLYINGS.filter((u) => u.category === 'COMMODITIES').map((u) => {
              const q = getUnderlyingQuote(u)
              const isSelected = u.symbol === activeUnderlying.symbol
              const isItemUp = q.chgPct >= 0
              return (
                <DropdownMenuItem
                  key={u.symbol}
                  onClick={() => onSelectUnderlying(u)}
                  className={cn(
                    'flex items-center justify-between text-xs cursor-pointer py-1.5 px-2.5',
                    isSelected && 'bg-primary/10 font-bold text-primary'
                  )}
                >
                  <div>
                    <span className="font-semibold">{u.name}</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1.5 bg-amber-500/10 text-amber-500 border-amber-500/30">
                      MCX
                    </Badge>
                  </div>
                  <div className="text-right font-mono tabular-nums text-[11px] flex flex-col items-end">
                    <span className="font-semibold text-foreground">
                      {q.ltp != null
                        ? q.ltp.toLocaleString('en-IN', {
                            minimumFractionDigits: u.decimals,
                            maximumFractionDigits: u.decimals,
                          })
                        : '—'}
                    </span>
                    {q.ltp != null && (
                      <span className={cn('text-[10px] font-semibold', isItemUp ? 'text-emerald-500' : 'text-rose-500')}>
                        {isItemUp ? '+' : ''}
                        {q.chgPct.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Expiry Selector Dropdown */}
        {expiries.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs flex items-center gap-1 font-mono text-muted-foreground hover:text-foreground shrink-0"
              >
                <span>Exp: <strong className="text-foreground">{selectedExpiry || expiries[0]}</strong></span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40 max-h-64 overflow-y-auto">
              <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
                Expiries
              </DropdownMenuLabel>
              {expiries.map((exp, idx) => (
                <DropdownMenuItem
                  key={exp}
                  onClick={() => onSelectExpiry(exp)}
                  className={cn(
                    'text-xs font-mono cursor-pointer flex items-center justify-between',
                    exp === selectedExpiry && 'bg-primary/15 font-bold text-primary'
                  )}
                >
                  <span>{exp}</span>
                  {idx === 0 && <span className="text-[9px] text-emerald-500 font-bold">Current</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* ATM Strike Badge */}
        {currentAtm != null && (
          <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 h-5 shrink-0 hidden md:inline-flex">
            ATM: {currentAtm}
          </Badge>
        )}
      </div>

      {/* ── RIGHT SECTION: Layout Toggle + P&L + Live/Analyze Mode + Exit All ── */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Mode Toggle Button / Badge */}
        <Badge
          variant="outline"
          onClick={handleModeToggle}
          role="button"
          tabIndex={0}
          className={cn(
            'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 h-6 flex items-center gap-1.5 shrink-0 cursor-pointer select-none transition-all',
            appMode === 'analyzer'
              ? 'bg-purple-500/15 text-purple-400 border-purple-500/40 hover:bg-purple-500/30'
              : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30',
            isTogglingMode && 'opacity-60 cursor-wait'
          )}
          title={`Click to switch to ${appMode === 'live' ? 'Sandbox (Analyze)' : 'Live'} mode`}
        >
          {isTogglingMode ? (
            <div className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
          ) : (
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                appMode === 'analyzer' ? 'bg-purple-400 animate-pulse' : 'bg-emerald-400'
              )}
            />
          )}
          <span>{appMode === 'analyzer' ? 'SANDBOX' : 'LIVE'}</span>
        </Badge>

        {/* Chart Visibility Switcher (SPOT, CE, PE) */}
        {activeTab === 'scalper' && visibleCharts && onToggleChart && (
          <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50 shrink-0 gap-0.5">
            <button
              type="button"
              onClick={() => onToggleChart('spot')}
              title={visibleCharts.spot ? 'Hide SPOT Chart' : 'Show SPOT Chart'}
              className={cn(
                'h-6 px-2 text-[10px] font-bold uppercase rounded transition-all cursor-pointer select-none',
                visibleCharts.spot
                  ? 'bg-primary/20 text-primary border border-primary/30 shadow-xs'
                  : 'text-muted-foreground/60 hover:text-foreground opacity-60'
              )}
            >
              SPOT
            </button>
            <button
              type="button"
              onClick={() => onToggleChart('ce')}
              title={visibleCharts.ce ? 'Hide CE Chart' : 'Show CE Chart'}
              className={cn(
                'h-6 px-2 text-[10px] font-bold uppercase rounded transition-all cursor-pointer select-none',
                visibleCharts.ce
                  ? 'bg-blue-500/20 text-blue-500 dark:text-blue-400 border border-blue-500/30 shadow-xs'
                  : 'text-muted-foreground/60 hover:text-foreground opacity-60'
              )}
            >
              CE
            </button>
            <button
              type="button"
              onClick={() => onToggleChart('pe')}
              title={visibleCharts.pe ? 'Hide PE Chart' : 'Show PE Chart'}
              className={cn(
                'h-6 px-2 text-[10px] font-bold uppercase rounded transition-all cursor-pointer select-none',
                visibleCharts.pe
                  ? 'bg-rose-500/20 text-rose-500 dark:text-rose-400 border border-rose-500/30 shadow-xs'
                  : 'text-muted-foreground/60 hover:text-foreground opacity-60'
              )}
            >
              PE
            </button>
          </div>
        )}

        {/* Layout Switcher (when on Scalper tab) */}
        {activeTab === 'scalper' && (
          <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50 shrink-0">
            <button
              type="button"
              onClick={() => onChangeLayoutMode('grid')}
              title="Split Layout (Spot Left, Options Right)"
              className={cn(
                'h-6 w-6 rounded flex items-center justify-center transition-colors cursor-pointer',
                layoutMode === 'grid' ? 'bg-background shadow-xs text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onChangeLayoutMode('columns')}
              title="3 Columns (Call Left, Spot Center, Put Right)"
              className={cn(
                'h-6 w-6 rounded flex items-center justify-center transition-colors cursor-pointer',
                layoutMode === 'columns' ? 'bg-background shadow-xs text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Columns3 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Available Margin / Funds */}
        {availableMargin !== undefined && availableMargin !== null && (
          <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-muted/50 border border-border/50 font-mono text-xs tabular-nums">
            <span className="text-muted-foreground text-[10px]">Margin:</span>
            <span className="font-semibold text-foreground">
              ₹{formatIndianNumber(availableMargin)}
            </span>
          </div>
        )}

        {/* Net Scalp P&L */}
        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-muted/50 border border-border/50 font-mono text-xs tabular-nums">
          <span className="text-muted-foreground text-[10px]">P&L:</span>
          <span className={cn('font-bold', isProfit ? 'text-emerald-500' : 'text-rose-500')}>
            {isProfit ? '+' : ''}₹{netPnl.toFixed(2)}
          </span>
        </div>

        {/* Exit All Panic Button */}
        {onExitAll && (
          <Button
            variant={openPositionsCount === 0 ? 'outline' : 'destructive'}
            size="sm"
            onClick={onExitAll}
            disabled={exitLoading || openPositionsCount === 0}
            className={cn(
              'h-7 px-2 text-[11px] font-bold uppercase shadow-sm transition-all',
              (exitLoading || openPositionsCount === 0) &&
                'opacity-40 cursor-not-allowed bg-muted text-muted-foreground border border-border/40 hover:bg-muted hover:text-muted-foreground pointer-events-none'
            )}
            title={
              openPositionsCount === 0
                ? 'No open positions to exit'
                : 'Square off all open positions immediately (Shift + Space)'
            }
          >
            {exitLoading ? 'Exiting…' : 'Exit All'}
          </Button>
        )}

        {/* Trading page link */}
        <Link
          to="/trading"
          className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          title="Back to Classic Trading Chart"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>

        {/* Whole Window / Fullscreen Expander */}
        <button
          type="button"
          onClick={() => {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen().catch(() => {})
            } else {
              document.exitFullscreen?.().catch(() => {})
            }
          }}
          className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          title={isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen / Whole Window Mode'}
        >
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </header>
  )
}
