/**
 * The option chain picker on the right of the charting terminal.
 *
 * Click a leg and it charts, which is the whole point: getting from "what is
 * the 24800 call doing" to a chart of it currently means leaving the terminal
 * for /tools and coming back with a symbol to paste.
 *
 * Greeks come from the same request as the prices. get_option_chain inverts
 * Black-76 over the quotes it has already fetched, so implied volatility and
 * delta cost no extra broker call, which is why the metric switch can offer
 * them beside LTP and OI without making the panel any slower.
 *
 * Colour polarity and moneyness shading deliberately match
 * pages/OptionChain.tsx: it is the same product showing the same chain, and a
 * user with both open must not have to read one of them backwards.
 *
 * Bar ANCHORING deliberately differs. The reference grows its bars inward
 * from the outer edges, which it can afford across a full page. In a 340px
 * panel that puts the number at one edge and its bar at the other, so here
 * both grow outward from the strike instead, keeping each value beside the
 * strike it belongs to.
 */

import { Check, ChevronsUpDown, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useOptionChainLive } from '@/hooks/useOptionChainLive'
import { scalpingApi } from '@/api/scalping'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMarketStatus } from '@/hooks/useMarketStatus'
import { needsPreviousClose } from '@/lib/trading/previousClose'
import type { SearchRow } from '@/lib/trading/terminal'
import { cn } from '@/lib/utils'
import type { OptionData } from '@/types/option-chain'
import { PlaceOrderDialog } from './PlaceOrderDialog'
import { PANEL_HEADER, PanelShell } from './panelShell'

/** Survives a reload so the panel reopens on the contract the user was watching. */
const PREFS_KEY = 'oa-trading-optionchain'

/** Derivative segments that carry an option chain. */
const EXCHANGES = ['NFO', 'BFO', 'MCX', 'CDS'] as const
type Exchange = (typeof EXCHANGES)[number]

/**
 * What the two side columns show.
 *
 * LTP is the default because it is what a chart click is about. Everything
 * else rides along in the same response, so offering it costs nothing: the
 * service inverts Black-76 over the quotes it has already fetched and returns
 * the whole Greek set with the prices, in one broker call.
 *
 * `dp` is per metric because the magnitudes are nothing alike. Gamma for an
 * index option is around 0.0019, so at the two decimals that suit delta and
 * theta every strike on the board would read 0.00.
 *
 * `symbol` is the notation the instrument is actually discussed in. A trader
 * reads a column of deltas under a bare capital delta without being told; the
 * name is kept beside it in the picker so nothing depends on recognising it.
 * Sigma for implied volatility, and vega keeps a Latin V because it is not a
 * Greek letter at all, whatever the family is called.
 */
const METRICS = [
  { id: 'ltp', label: 'LTP', symbol: 'LTP', group: 'Price', dp: 2 },
  { id: 'oi', label: 'OI', symbol: 'OI', group: 'Price', dp: 0 },
  { id: 'volume', label: 'Volume', symbol: 'Vol', group: 'Price', dp: 0 },
  { id: 'iv', label: 'IV', symbol: 'σ', group: 'Greeks', dp: 1 },
  { id: 'delta', label: 'Delta', symbol: 'Δ', group: 'Greeks', dp: 2 },
  { id: 'gamma', label: 'Gamma', symbol: 'Γ', group: 'Greeks', dp: 4 },
  { id: 'theta', label: 'Theta', symbol: 'Θ', group: 'Greeks', dp: 2 },
  { id: 'vega', label: 'Vega', symbol: 'V', group: 'Greeks', dp: 2 },
] as const
type Metric = (typeof METRICS)[number]['id']

/** The order the picker lists them in, so the groups stay together. */
const METRIC_GROUPS = ['Price', 'Greeks'] as const

/** Strikes either side of ATM. Twenty rows is about one panel-height of scroll. */
const STRIKE_COUNT = 10

/** The row and its column header share this, so the two cannot drift apart. */
const ROW_GRID = 'grid grid-cols-[1fr_64px_1fr]'

interface Props {
  apiKey: string
  /** Charts the leg that was clicked, in whichever pane was last touched. */
  onPick(row: SearchRow): void
  /**
   * The focused pane's instrument as `EXCHANGE:SYMBOL`, so the leg currently
   * on the chart is marked. The watchlist has always had this; without it
   * here, charting a leg gave no confirmation that anything had happened.
   */
  activeSymbol?: string | null
}

interface Prefs {
  exchange: Exchange
  underlying: string
  expiry: string
}

function readPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
    return {
      exchange: EXCHANGES.includes(saved.exchange) ? saved.exchange : 'NFO',
      underlying: typeof saved.underlying === 'string' ? saved.underlying : 'NIFTY',
      expiry: typeof saved.expiry === 'string' ? saved.expiry : '',
    }
  } catch {
    return { exchange: 'NFO', underlying: 'NIFTY', expiry: '' }
  }
}

/** Lakhs and crores: OI in raw units does not fit a 64px column. */
function compact(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return '-'
  if (value >= 1e7) return `${(value / 1e7).toFixed(2)}Cr`
  if (value >= 1e5) return `${(value / 1e5).toFixed(2)}L`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return String(Math.round(value))
}

/**
 * One leg's value for the selected metric.
 *
 * Everything unavailable renders as a dash rather than a zero. A leg with no
 * quote, or one on an expired chain, cannot be inverted, and printing 0.00
 * would read as a real measurement of zero volatility or zero sensitivity.
 * That distinction is the whole reason to show Greeks at all.
 */
function metricOf(leg: OptionData | null, metric: Metric): string {
  if (!leg) return '-'

  if (metric === 'ltp') return leg.ltp > 0 ? leg.ltp.toFixed(2) : '-'
  if (metric === 'oi') return compact(leg.oi)
  if (metric === 'volume') return compact(leg.volume)

  const dp = METRICS.find((m) => m.id === metric)?.dp ?? 2
  const value =
    metric === 'iv'
      ? leg.implied_volatility
      : metric === 'delta'
        ? leg.delta
        : metric === 'gamma'
          ? leg.gamma
          : metric === 'theta'
            ? leg.theta
            : leg.vega

  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return metric === 'iv' ? `${value.toFixed(dp)}%` : value.toFixed(dp)
}

/**
 * Buy and sell pills for one leg.
 *
 * They sit immediately beside the value, not at the panel's outer edge. The
 * value is what the trader is reading and what they are acting on, so putting
 * the controls an inch away across empty cell made the pair read as unrelated.
 *
 * Laid out in flow rather than absolutely positioned, so they hold their space
 * while hidden: revealing them on hover cannot shift the number the pointer is
 * aimed at. Nothing is ever covered to make room either, which is the failure
 * mode a hover control usually has in a column this narrow.
 *
 * Colours match pages/OptionChain.tsx exactly, green to buy and amber to sell.
 * Amber rather than red because red already means "put" in this table.
 */
function OrderPills({
  leg,
  onOrder,
}: {
  leg: OptionData | null
  onOrder(leg: OptionData, action: 'BUY' | 'SELL'): void
}) {
  if (!leg?.symbol) return null
  return (
    <span
      className={cn(
        'relative z-10 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity',
        'group-hover/leg:opacity-100 focus-within:opacity-100'
      )}
    >
      {(['BUY', 'SELL'] as const).map((action) => (
        <button
          key={action}
          type="button"
          onClick={() => onOrder(leg, action)}
          className={cn(
            'rounded px-1 py-0.5 text-[9px] font-bold leading-none text-white transition-colors',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            action === 'BUY'
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-amber-600 hover:bg-amber-700'
          )}
          aria-label={`${action === 'BUY' ? 'Buy' : 'Sell'} ${leg.symbol}`}
          title={`${action === 'BUY' ? 'Buy' : 'Sell'} ${leg.symbol}`}
        >
          {action === 'BUY' ? 'B' : 'S'}
        </button>
      ))}
    </span>
  )
}

export function OptionChainPanel({ apiKey, onPick, activeSymbol }: Props) {
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
  const [underlyings, setUnderlyings] = useState<string[]>([])
  const [globalUnderlyings, setGlobalUnderlyings] = useState<Array<{ name: string; exchange: Exchange }>>([])
  const [underlyingSearch, setUnderlyingSearch] = useState('')
  const [expiries, setExpiries] = useState<string[]>([])
  const [metric, setMetric] = useState<Metric>('ltp')
  const [pickerOpen, setPickerOpen] = useState(false)
  /**
   * One slot per loader, not one shared between them.
   */
  const [underlyingError, setUnderlyingError] = useState<string | null>(null)
  const [expiryError, setExpiryError] = useState<string | null>(null)

  /** Bumped to re-run the loaders after a Retry. */
  const [attempt, setAttempt] = useState(0)

  /** Flash map for real-time 0-1ms micro-price changes */
  const [flashes, setFlashes] = useState<Record<string, 'up' | 'down'>>({})
  const prevPricesRef = useRef<Map<string, number>>(new Map())

  /** Track previously synced active symbol to avoid feedback loops */
  const lastSyncedSymbolRef = useRef<string | null>(null)

  /**
   * The leg an order is being placed on, or null.
   */
  const [order, setOrder] = useState<{
    leg: OptionData
    action: 'BUY' | 'SELL'
  } | null>(null)

  const { isMarketOpen } = useMarketStatus()

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  }, [prefs])

  /* ── Fetch underlyings globally across ALL derivative segments ──────────────── */
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is a deliberate re-run trigger
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const results = await Promise.allSettled(
          EXCHANGES.map(async (ex) => {
            const res = await scalpingApi.getAllUnderlyings(ex, 'options')
            return { exchange: ex, list: res.data ?? [] }
          })
        )
        if (!alive) return

        const allItems: Array<{ name: string; exchange: Exchange }> = []
        let currentSegmentList: string[] = []

        for (const r of results) {
          if (r.status === 'fulfilled') {
            for (const item of r.value.list) {
              allItems.push({ name: item, exchange: r.value.exchange })
            }
            if (r.value.exchange === prefs.exchange) {
              currentSegmentList = r.value.list
            }
          }
        }

        // De-duplicate if same symbol exists in multiple
        setGlobalUnderlyings(allItems)
        setUnderlyings(currentSegmentList)
        setUnderlyingError(null)

        // If current underlying isn't in current segment or global, ensure fallback
        setPrefs((p) => {
          if (currentSegmentList.length > 0 && !currentSegmentList.includes(p.underlying)) {
            // Check if current underlying exists in any exchange
            const match = allItems.find((item) => item.name.toUpperCase() === p.underlying.toUpperCase())
            if (match) {
              return { ...p, exchange: match.exchange, underlying: match.name, expiry: '' }
            }
            return { ...p, underlying: currentSegmentList[0], expiry: '' }
          }
          return p
        })
      } catch {
        if (!alive) return
        setUnderlyings([])
        setGlobalUnderlyings([])
        setUnderlyingError(`Could not load ${prefs.exchange} underlyings`)
      }
    })()
    return () => {
      alive = false
    }
  }, [prefs.exchange, attempt])

  /* ── Auto-sync with active chart symbol ───────────────────────────────────── */
  useEffect(() => {
    if (!activeSymbol || activeSymbol === lastSyncedSymbolRef.current) return
    lastSyncedSymbolRef.current = activeSymbol

    // Parse active symbol format: e.g. "BSE_INDEX:SENSEX", "BFO:SENSEX...", "NSE_INDEX:NIFTY", "NFO:NIFTY...", "NSE:RELIANCE"
    const parts = activeSymbol.split(':')
    const rawSym = (parts.length > 1 ? parts[1] : parts[0]).toUpperCase()
    const rawEx = (parts.length > 1 ? parts[0] : '').toUpperCase()

    let detectedExchange: Exchange | null = null
    let detectedUnderlying: string | null = null

    // 1. Direct index or common underlying detection
    if (rawSym.includes('SENSEX') || rawEx === 'BSE_INDEX' || rawEx === 'BFO') {
      detectedExchange = 'BFO'
      detectedUnderlying = rawSym.includes('BANKEX') ? 'BANKEX' : 'SENSEX'
    } else if (rawSym.includes('NIFTY') || rawEx === 'NSE_INDEX' || rawEx === 'NFO') {
      detectedExchange = 'NFO'
      if (rawSym.includes('BANKNIFTY')) detectedUnderlying = 'BANKNIFTY'
      else if (rawSym.includes('FINNIFTY')) detectedUnderlying = 'FINNIFTY'
      else if (rawSym.includes('MIDCPNIFTY')) detectedUnderlying = 'MIDCPNIFTY'
      else if (rawSym.includes('NIFTYNXT50')) detectedUnderlying = 'NIFTYNXT50'
      else detectedUnderlying = 'NIFTY'
    } else if (rawEx === 'MCX' || rawSym === 'CRUDEOIL' || rawSym === 'GOLD' || rawSym === 'SILVER' || rawSym === 'NATURALGAS') {
      detectedExchange = 'MCX'
      detectedUnderlying = rawSym.replace(/[0-9].*$/, '')
    } else {
      // 2. Check if clean symbol matches any global derivative underlying
      const cleanSym = rawSym.replace(/(CE|PE)$/i, '').replace(/[0-9].*$/, '')
      const match = globalUnderlyings.find(
        (u) => u.name.toUpperCase() === cleanSym || cleanSym.startsWith(u.name.toUpperCase())
      )
      if (match) {
        detectedExchange = match.exchange
        detectedUnderlying = match.name
      } else if (cleanSym) {
        // Assume default NFO for equity stocks like RELIANCE, TCS, etc.
        detectedExchange = 'NFO'
        detectedUnderlying = cleanSym
      }
    }

    if (detectedExchange && detectedUnderlying) {
      setPrefs((p) => {
        if (p.underlying === detectedUnderlying && p.exchange === detectedExchange) {
          return p
        }
        return {
          exchange: detectedExchange!,
          underlying: detectedUnderlying!,
          expiry: '', // Will auto-select nearest expiry upon expiries load
        }
      })
    }
  }, [activeSymbol, globalUnderlyings])

  /* ── expiries for the chosen underlying ───────────────────────────────── */
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is a deliberate re-run trigger
  useEffect(() => {
    if (!prefs.underlying) return
    let alive = true
    ;(async () => {
      try {
        const res = await scalpingApi.getExpiry(prefs.underlying, prefs.exchange, 'options')
        if (!alive) return
        const dates = res.data ?? []
        setExpiries(dates)
        setExpiryError(null)
        setPrefs((p) =>
          dates.length === 0 || dates.includes(p.expiry) ? p : { ...p, expiry: dates[0] }
        )
      } catch {
        if (!alive) return
        setExpiries([])
        setExpiryError(`Could not load expiries for ${prefs.underlying}`)
      }
    })()
    return () => {
      alive = false
    }
  }, [prefs.underlying, prefs.exchange, attempt])

  /* ── the chain itself ─────────────────────────────────────────────────── */
  const {
    data: chain,
    isLoading: loading,
    isStreaming,
    error: chainError,
    lastUpdate,
    refetch,
  } = useOptionChainLive(
    apiKey,
    prefs.underlying,
    prefs.exchange,
    prefs.exchange,
    prefs.expiry,
    STRIKE_COUNT,
    { enabled: Boolean(prefs.underlying && prefs.expiry), oiRefreshInterval: 30000, pauseWhenHidden: true }
  )

  const marketOpen = isMarketOpen(prefs.exchange)

  const retry = () => {
    setUnderlyingError(null)
    setExpiryError(null)
    setAttempt((n) => n + 1)
    refetch()
  }

  /* ── derived ──────────────────────────────────────────────────────────── */
  const rows = chain?.chain ?? []

  /** The widest OI on screen, so the bars are scaled to what is visible. */
  const peakOi = useMemo(
    () => Math.max(1, ...rows.flatMap((r) => [r.ce?.oi ?? 0, r.pe?.oi ?? 0])),
    [rows]
  )

  const pcr = useMemo(() => {
    const ce = rows.reduce((sum, r) => sum + (r.ce?.oi ?? 0), 0)
    const pe = rows.reduce((sum, r) => sum + (r.pe?.oi ?? 0), 0)
    return ce > 0 ? pe / ce : 0
  }, [rows])

  /**
   * Strike Open Interest Analysis:
   * r1: Strike with highest Call OI (Max Call OI / Resistance)
   * s1: Strike with highest Put OI (Max Put OI / Support)
   * maxOiStrike: Strike with absolute highest single OI (Call or Put)
   * maxOiStrike: Strike with absolute highest single OI (Call or Put)
   */
  const { r1, s1, r1Oi, s1Oi, maxOiStrike } = useMemo(() => {
    let maxCeOi = 0
    let r1Strike: number | null = null
    let maxPeOi = 0
    let s1Strike: number | null = null
    for (const r of rows) {
      const ceOi = r.ce?.oi ?? 0
      const peOi = r.pe?.oi ?? 0

      if (ceOi > maxCeOi) {
        maxCeOi = ceOi
        r1Strike = r.strike
      }
      if (peOi > maxPeOi) {
        maxPeOi = peOi
        s1Strike = r.strike
      }
    }

    const maxSingle = maxCeOi >= maxPeOi ? r1Strike : s1Strike
    return {
      r1: r1Strike,
      s1: s1Strike,
      r1Oi: maxCeOi,
      s1Oi: maxPeOi,
      maxOiStrike: maxSingle,
    }
  }, [rows])

  /* ── Real-time 0-1ms micro-price tick flash detector ────────────────────── */
  useEffect(() => {
    if (!rows.length) return
    const newFlashes: Record<string, 'up' | 'down'> = {}
    let hasChanged = false

    for (const row of rows) {
      if (row.ce?.symbol && typeof row.ce.ltp === 'number' && row.ce.ltp > 0) {
        const prev = prevPricesRef.current.get(row.ce.symbol)
        if (prev !== undefined && prev !== row.ce.ltp) {
          newFlashes[row.ce.symbol] = row.ce.ltp > prev ? 'up' : 'down'
          hasChanged = true
        }
        prevPricesRef.current.set(row.ce.symbol, row.ce.ltp)
      }
      if (row.pe?.symbol && typeof row.pe.ltp === 'number' && row.pe.ltp > 0) {
        const prev = prevPricesRef.current.get(row.pe.symbol)
        if (prev !== undefined && prev !== row.pe.ltp) {
          newFlashes[row.pe.symbol] = row.pe.ltp > prev ? 'up' : 'down'
          hasChanged = true
        }
        prevPricesRef.current.set(row.pe.symbol, row.pe.ltp)
      }
    }

    if (hasChanged) {
      setFlashes((prev) => ({ ...prev, ...newFlashes }))
      const timer = setTimeout(() => {
        setFlashes({})
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [rows])

  const chartLeg = (leg: OptionData | null) => {
    if (!leg?.symbol) return
    onPick({ symbol: leg.symbol, exchange: prefs.exchange })
  }

  /**
   * Tri-state, not a boolean. With no previous close there is no direction.
   */
  const spotDirection: 'up' | 'down' | 'flat' = (() => {
    const ltp = chain?.underlying_ltp
    if (typeof ltp !== 'number') return 'flat'
    if (needsPreviousClose(chain?.underlying_prev_close, ltp)) return 'flat'
    const prev = chain?.underlying_prev_close as number
    if (ltp === prev) return 'flat'
    return ltp > prev ? 'up' : 'down'
  })()

  const activeMetric = METRICS.find((m) => m.id === metric)
  const metricLabel = activeMetric?.symbol ?? ''

  // Filter global items or current exchange items based on underlyingSearch
  const filteredUnderlyings = useMemo(() => {
    const query = underlyingSearch.trim().toUpperCase()
    if (!query) {
      // Default: current exchange underlyings first
      return underlyings.map((name) => ({ name, exchange: prefs.exchange }))
    }
    // Search across ALL underlyings globally
    const matches: Array<{ name: string; exchange: Exchange }> = []
    const seen = new Set<string>()

    // Prioritize startsWith matches
    for (const item of globalUnderlyings) {
      if (item.name.toUpperCase().startsWith(query)) {
        const key = `${item.exchange}:${item.name}`
        if (!seen.has(key)) {
          seen.add(key)
          matches.push(item)
        }
      }
    }
    // Then includes matches
    for (const item of globalUnderlyings) {
      if (!item.name.toUpperCase().startsWith(query) && item.name.toUpperCase().includes(query)) {
        const key = `${item.exchange}:${item.name}`
        if (!seen.has(key)) {
          seen.add(key)
          matches.push(item)
        }
      }
    }
    // Fallback: if query matches none, keep current underlyings filtered
    if (matches.length === 0 && underlyings.length > 0) {
      return underlyings
        .filter((u) => u.toUpperCase().includes(query))
        .map((name) => ({ name, exchange: prefs.exchange }))
    }
    return matches
  }, [underlyingSearch, globalUnderlyings, underlyings, prefs.exchange])

  return (
    <PanelShell
      id="oa-panel-options"
      label="Option chain"
      storageKey="oa-trading-optionchain-width"
      defaultWidth={340}
    >
      {/* Header: the contract. Global Search across segments & Segment selector */}
      <div className={PANEL_HEADER}>
        <Select
          value={prefs.exchange}
          onValueChange={(value) =>
            setPrefs((p) => ({ ...p, exchange: value as Exchange, expiry: '' }))
          }
        >
          <SelectTrigger className="h-8 w-[76px] text-[12px] font-semibold tracking-wide border-border/60 bg-muted/20" aria-label="Exchange segment">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXCHANGES.map((ex) => (
              <SelectItem key={ex} value={ex} className="text-[12px]">
                {ex}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Global searchable combobox across ALL exchanges */}
        <Popover open={pickerOpen} onOpenChange={(open) => {
          setPickerOpen(open)
          if (!open) setUnderlyingSearch('')
        }}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={pickerOpen}
              aria-label="Underlying"
              className="h-8 min-w-0 flex-1 justify-between px-2 text-[12px] font-semibold border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className="truncate">{prefs.underlying || 'Select'}</span>
                <span className="rounded bg-primary/10 px-1 py-0.2 text-[9px] font-mono text-primary/80 uppercase">
                  {prefs.exchange}
                </span>
              </div>
              <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[240px] p-0 shadow-lg border-border/80" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search global (e.g. SENSEX, NIFTY)..."
                value={underlyingSearch}
                onValueChange={setUnderlyingSearch}
                className="h-8 text-[12px]"
              />
              <CommandList className="max-h-[260px]">
                <CommandEmpty className="py-4 text-center text-[12px]">
                  {underlyingError ?? 'No underlying found.'}
                </CommandEmpty>
                <CommandGroup>
                  {filteredUnderlyings.map((item) => {
                    const isSelected = prefs.underlying === item.name && prefs.exchange === item.exchange
                    return (
                      <CommandItem
                        key={`${item.exchange}:${item.name}`}
                        value={`${item.name} ${item.exchange}`}
                        onSelect={() => {
                          setPrefs({
                            exchange: item.exchange,
                            underlying: item.name,
                            expiry: '',
                          })
                          setPickerOpen(false)
                          setUnderlyingSearch('')
                        }}
                        className="flex items-center justify-between text-[12px] py-1.5 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Check
                            className={cn(
                              'h-3.5 w-3.5 text-primary',
                              isSelected ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <span className={cn('font-medium', isSelected && 'text-primary')}>
                            {item.name}
                          </span>
                        </div>
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold',
                            item.exchange === 'BFO'
                              ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                              : item.exchange === 'NFO'
                              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                              : item.exchange === 'MCX'
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {item.exchange}
                        </span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 hover:bg-muted/40"
          onClick={() => refetch()}
          title="Refresh"
          aria-label="Refresh option chain"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* Second band: expiry and what the side columns are showing */}
      <div className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1.5">
        <Select
          value={prefs.expiry}
          onValueChange={(value) => setPrefs((p) => ({ ...p, expiry: value }))}
        >
          <SelectTrigger
            className={cn(
              'h-8 min-w-0 flex-1 text-[12px]',
              expiryError && 'border-destructive text-destructive'
            )}
            aria-label="Expiry"
            title={expiryError ?? undefined}
          >
            <SelectValue placeholder={expiryError ? 'Expiry unavailable' : 'Expiry'} />
          </SelectTrigger>
          <SelectContent>
            {expiries.map((date) => (
              <SelectItem key={date} value={date} className="text-[12px]">
                {date}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={metric} onValueChange={(value) => setMetric(value as Metric)}>
          <SelectTrigger className="h-8 w-[104px] text-[12px]" aria-label="Metric shown">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METRIC_GROUPS.map((group) => (
              <SelectGroup key={group}>
                <SelectLabel className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {group}
                </SelectLabel>
                {METRICS.filter((m) => m.group === group).map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-[12px]">
                    {/* Notation and name together: the column header carries
                        only the notation, so this is where the two are tied. */}
                    <span className="inline-flex w-4 shrink-0 justify-center font-medium">
                      {m.symbol === m.label ? '' : m.symbol}
                    </span>
                    <span>{m.label}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Spot, ATM, PCR, Support & Resistance Summary */}
      {chain && (
        <div className="flex flex-col border-b bg-muted/10 text-[11px]">
          <div className="flex shrink-0 items-center justify-between px-2 py-1">
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground font-medium">Spot</span>
              <span
                className={cn(
                  'font-semibold tabular-nums',
                  spotDirection === 'up' && 'text-emerald-600 dark:text-emerald-400',
                  spotDirection === 'down' && 'text-rose-600 dark:text-rose-400',
                  spotDirection === 'flat' && 'text-foreground'
                )}
              >
                {chain.underlying_ltp?.toFixed(2) ?? '-'}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground font-medium">ATM</span>
              <span className="font-semibold tabular-nums text-foreground">{chain.atm_strike}</span>
            </span>
            {/* Labelled with the strike count, because this is the ratio across
                the strikes on screen, not the whole chain a trader may expect. */}
            <span
              className="flex items-center gap-1"
              title={`Across ${rows.length} strikes on screen`}
            >
              <span className="text-muted-foreground font-medium">PCR({rows.length})</span>
              <span className={cn('font-semibold tabular-nums', pcr >= 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
                {pcr ? pcr.toFixed(2) : '-'}
              </span>
            </span>
          </div>

          {/* S & R and Max OI Strike Insights Row */}
          {(s1 || r1 || maxOiStrike) && (
            <div className="flex shrink-0 items-center justify-between border-t border-border/40 px-2 py-0.5 text-[10px] bg-muted/20">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium" title={`Support S1 (Max Put OI: ${compact(s1Oi)})`}>
                <span className="rounded bg-emerald-500/15 px-1 py-0.2 text-[9px] font-bold border border-emerald-500/30">SUP S1</span>
                <span className="tabular-nums font-semibold">{s1 ?? '-'}</span>
              </span>
              {maxOiStrike && (
                <span className="flex items-center gap-1 text-amber-500 font-medium" title={`Strike with More/Max OI: ${maxOiStrike} (${maxOiStrike === r1 ? `Calls ${compact(r1Oi)}` : `Puts ${compact(s1Oi)}`})`}>
                  <span className="rounded bg-amber-500/15 px-1 py-0.2 text-[9px] font-bold border border-amber-500/30">MAX OI</span>
                  <span className="tabular-nums font-semibold text-foreground">{maxOiStrike}</span>
                </span>
              )}
              <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium" title={`Resistance R1 (Max Call OI: ${compact(r1Oi)})`}>
                <span className="tabular-nums font-semibold">{r1 ?? '-'}</span>
                <span className="rounded bg-rose-500/15 px-1 py-0.2 text-[9px] font-bold border border-rose-500/30">RES R1</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Column header. It names the metric, because the cells hold whichever
          of LTP, OI, IV or Delta is selected and "Calls | Puts" alone would
          leave two columns of unlabelled numbers. */}
      <div
        className={cn(
          ROW_GRID,
          'shrink-0 border-b px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70'
        )}
      >
        {/* Each label sits on the side its numbers do. Calls are right
            aligned against the strike and puts left aligned, so a label at
            the outer edge sat ~130px from the column it names. */}
        {/* normal-case on the notation: CSS uppercase maps sigma to capital
            sigma, which in this domain reads as a sum rather than volatility,
            so selecting IV rendered "CALLS Σ". */}
        <span className="text-right">
          Calls <span className="normal-case">{metricLabel}</span>
        </span>
        <span className="text-center">Strike</span>
        <span className="text-left">
          Puts <span className="normal-case">{metricLabel}</span>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {chainError && rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <p className="text-[12px] text-muted-foreground">{chainError}</p>
            <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={retry}>
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        ) : loading && rows.length === 0 ? (
          <p className="p-3 text-[12px] text-muted-foreground">Loading chain...</p>
        ) : rows.length === 0 ? (
          <p className="p-3 text-[12px] text-muted-foreground">
            No chain for this contract. Check the expiry, or that master contracts are downloaded.
          </p>
        ) : (
          rows.map((row) => {
            const atm = chain != null && row.strike === chain.atm_strike
            // Above ATM the call is out of the money; below it, the put is.
            const ceOtm = chain != null && !atm && row.strike > chain.atm_strike
            const peOtm = chain != null && !atm && row.strike < chain.atm_strike

            const isResistance = r1 !== null && row.strike === r1
            const isSupport = s1 !== null && row.strike === s1

            const ceFlash = row.ce?.symbol ? flashes[row.ce.symbol] : undefined
            const peFlash = row.pe?.symbol ? flashes[row.pe.symbol] : undefined

            return (
              <div
                key={row.strike}
                className={cn(ROW_GRID, 'items-stretch border-b border-border/40 text-[12px]')}
              >
                {/* Calls cell: Right aligned against the strike */}
                <div
                  className={cn(
                    'group/leg relative flex items-center gap-1 justify-end px-2 py-1 transition-colors duration-200',
                    ceFlash === 'up' && 'bg-emerald-500/25',
                    ceFlash === 'down' && 'bg-rose-500/25',
                    !ceFlash && (ceOtm ? 'bg-amber-500/5 hover:bg-amber-500/15' : 'hover:bg-accent'),
                    activeSymbol === `${prefs.exchange}:${row.ce?.symbol}` &&
                      'font-medium ring-1 ring-inset ring-primary/60'
                  )}
                >
                  {/* OI Bar gradient */}
                  {metric === 'oi' && (
                    <span
                      className="pointer-events-none absolute inset-y-0 right-0 bg-gradient-to-l from-emerald-500/25 to-transparent transition-all duration-300"
                      style={{ width: `${Math.min(100, ((row.ce?.oi ?? 0) / peakOi) * 100)}%` }}
                      aria-hidden="true"
                    />
                  )}
                  {/* The click target, stretched underneath */}
                  <button
                    type="button"
                    onClick={() => chartLeg(row.ce)}
                    disabled={!row.ce?.symbol}
                    className="absolute inset-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none"
                    title={row.ce?.symbol ? `Chart ${row.ce.symbol}` : undefined}
                    aria-current={
                      activeSymbol === `${prefs.exchange}:${row.ce?.symbol}` ? true : undefined
                    }
                    aria-label={
                      row.ce?.symbol
                        ? `Chart ${row.ce.symbol}, ${metricLabel} ${metricOf(row.ce, metric)}`
                        : undefined
                    }
                  />
                  <OrderPills leg={row.ce} onOrder={(leg, action) => setOrder({ leg, action })} />
                  <span className={cn(
                    "pointer-events-none relative tabular-nums font-mono text-[11px]",
                    ceFlash === 'up' && 'text-emerald-600 dark:text-emerald-400 font-bold',
                    ceFlash === 'down' && 'text-rose-600 dark:text-rose-400 font-bold'
                  )}>
                    {metricOf(row.ce, metric)}
                  </span>
                </div>

                {/* Strike center column: with ATM, S1, and R1 highlights */}
                {(() => {
                  const isMaxOi = maxOiStrike !== null && row.strike === maxOiStrike
                  return (
                    <span
                      className={cn(
                        'relative flex items-center justify-center border-x border-border/40 py-1 tabular-nums font-mono text-[11px]',
                        atm
                          ? 'bg-primary/10 font-semibold text-foreground ring-1 ring-inset ring-primary/50'
                          : isMaxOi
                          ? 'bg-amber-500/10 font-bold text-amber-500 ring-1 ring-inset ring-amber-500/40'
                          : isResistance
                          ? 'bg-rose-500/10 font-semibold text-rose-600 dark:text-rose-400'
                          : isSupport
                          ? 'bg-emerald-500/10 font-semibold text-emerald-600 dark:text-emerald-400'
                          : 'text-muted-foreground'
                      )}
                      title={
                        atm
                          ? 'At The Money (ATM)'
                          : isMaxOi
                          ? `Max Open Interest Strike: ${row.strike} (Call OI: ${compact(row.ce?.oi)}, Put OI: ${compact(row.pe?.oi)})`
                          : isResistance
                          ? `Major Resistance R1 (Max CE OI: ${compact(r1Oi)})`
                          : isSupport
                          ? `Major Support S1 (Max PE OI: ${compact(s1Oi)})`
                          : `Strike ${row.strike} - CE OI: ${compact(row.ce?.oi)} | PE OI: ${compact(row.pe?.oi)}`
                      }
                    >
                      {row.strike}
                      {isSupport && !atm && (
                        <span className="pointer-events-none absolute left-0.5 top-0.5 text-[8px] font-extrabold text-emerald-600 dark:text-emerald-400" aria-hidden="true" title="Major Support (Max Put OI)">
                          ●
                        </span>
                      )}
                      {isResistance && !atm && (
                        <span className="pointer-events-none absolute right-0.5 top-0.5 text-[8px] font-extrabold text-rose-600 dark:text-rose-400" aria-hidden="true" title="Major Resistance (Max Call OI)">
                          ▲
                        </span>
                      )}
                    </span>
                  )
                })()}

                {/* Puts cell: Left aligned against the strike */}
                <div
                  className={cn(
                    'group/leg relative flex items-center gap-1 justify-start px-2 py-1 transition-colors duration-200',
                    peFlash === 'up' && 'bg-emerald-500/25',
                    peFlash === 'down' && 'bg-rose-500/25',
                    !peFlash && (peOtm ? 'bg-amber-500/5 hover:bg-amber-500/15' : 'hover:bg-accent'),
                    activeSymbol === `${prefs.exchange}:${row.pe?.symbol}` &&
                      'font-medium ring-1 ring-inset ring-primary/60'
                  )}
                >
                  {/* OI Bar gradient */}
                  {metric === 'oi' && (
                    <span
                      className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-rose-500/25 to-transparent transition-all duration-300"
                      style={{ width: `${Math.min(100, ((row.pe?.oi ?? 0) / peakOi) * 100)}%` }}
                      aria-hidden="true"
                    />
                  )}
                  {/* The click target, stretched underneath */}
                  <button
                    type="button"
                    onClick={() => chartLeg(row.pe)}
                    disabled={!row.pe?.symbol}
                    className="absolute inset-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none"
                    title={row.pe?.symbol ? `Chart ${row.pe.symbol}` : undefined}
                    aria-current={
                      activeSymbol === `${prefs.exchange}:${row.pe?.symbol}` ? true : undefined
                    }
                    aria-label={
                      row.pe?.symbol
                        ? `Chart ${row.pe.symbol}, ${metricLabel} ${metricOf(row.pe, metric)}`
                        : undefined
                    }
                  />
                  <span className={cn(
                    "pointer-events-none relative tabular-nums font-mono text-[11px]",
                    peFlash === 'up' && 'text-emerald-600 dark:text-emerald-400 font-bold',
                    peFlash === 'down' && 'text-rose-600 dark:text-rose-400 font-bold'
                  )}>
                    {metricOf(row.pe, metric)}
                  </span>
                  <OrderPills leg={row.pe} onOrder={(leg, action) => setOrder({ leg, action })} />
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* A chain that stopped updating an hour ago otherwise looks live. The
          poll is silent by design, so this line is the only thing that says
          the numbers above have stopped moving. */}
      {rows.length > 0 &&
        (chainError && lastUpdate ? (
          <p className="shrink-0 border-t px-2 py-1 text-[10px] text-amber-600 dark:text-amber-400">
            Not updating. Last loaded {lastUpdate.toLocaleTimeString()}
          </p>
        ) : marketOpen && !isStreaming && lastUpdate ? (
          // Streaming is the point of this panel. If the socket is not up the
          // numbers are still refreshed by the structural poll, just far more
          // slowly, and saying so beats letting them read as live.
          <p className="shrink-0 border-t px-2 py-1 text-[10px] text-amber-600 dark:text-amber-400">
            Not streaming. Last update {lastUpdate.toLocaleTimeString()}
          </p>
        ) : !marketOpen ? (
          // The panel already backs the poll off to a minute when the market is
          // shut; saying so is what stops a static chain reading as a stalled
          // one. The watchlist has carried this caption from the start.
          <p className="shrink-0 border-t px-2 py-1 text-[10px] text-muted-foreground">
            Market closed. Showing last traded prices.
          </p>
        ) : null)}

      {/* The same dialog pages/OptionChain.tsx opens. Quantity, product and
          price type are confirmed there, so a pill starts an order but never
          places one, and analyze mode is honoured the same way everywhere. */}
      <PlaceOrderDialog
        open={order !== null}
        onOpenChange={(next) => !next && setOrder(null)}
        symbol={order?.leg.symbol}
        exchange={prefs.exchange}
        action={order?.action}
        lotSize={order?.leg.lotsize ?? 1}
        tickSize={order?.leg.tick_size ?? 0.05}
        product="NRML"
        onSuccess={() => setOrder(null)}
      />
    </PanelShell>
  )
}
