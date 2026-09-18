import { ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useMarketData } from '@/hooks/useMarketData'
import { cn, formatIndianNumber } from '@/lib/utils'
import { useThemeStore } from '@/stores/themeStore'
import type { OptionChainRow } from '@/types/scalping'
import type { Position } from '@/types/trading'

function formatOi(oi: number): string {
  if (!oi || oi <= 0) return '0'
  if (oi >= 10000000) return `${(oi / 10000000).toFixed(2)}Cr`
  if (oi >= 100000) return `${(oi / 100000).toFixed(2)}L`
  if (oi >= 1000) return `${(oi / 1000).toFixed(1)}K`
  return oi.toLocaleString('en-IN')
}

interface Props {
  atmStrike: number
  strikes: number[]
  strikeRows?: OptionChainRow[]
  callStrike: number
  putStrike: number
  onSelectCallStrike: (strike: number) => void
  onSelectPutStrike: (strike: number) => void
  callSymbol: string
  putSymbol: string
  exchange: string
  callLtp?: number
  putLtp?: number
  lotSize: number
  positions?: Position[]
  onExecuteOrder: (params: {
    symbol: string
    exchange: string
    action: 'BUY' | 'SELL'
    quantity: number
    pricetype: 'MARKET' | 'LIMIT'
    product: 'MIS' | 'NRML'
    ltp?: number
  }) => Promise<void>
  disabled?: boolean
  appMode?: 'live' | 'analyzer'
  collapsed?: boolean
  onToggleCollapse?: () => void
  selectedExpiry?: string
  expiries?: string[]
  onSelectExpiry?: (exp: string) => void
  onExitAll?: () => Promise<void>
}

/**
 * Groww 915 Style Strike Selector with Glass Texture Popover.
 * Features 5-strike ladder (ITM 2, ITM 1, ATM, OTM 1, OTM 2), real-time prices inside,
 * live fluctuating percentage change, and visual OI bar line below each strike.
 */
function GrowwStrikeSelector({
  type,
  selectedStrike,
  onSelectStrike,
  atmStrike,
  strikes,
  strikeRows = [],
  ltp,
  exchange,
  selectedExpiry,
  expiries = [],
  onSelectExpiry,
}: {
  type: 'CE' | 'PE'
  selectedStrike: number
  onSelectStrike: (strike: number) => void
  atmStrike: number
  strikes: number[]
  strikeRows?: OptionChainRow[]
  ltp?: number
  exchange: string
  selectedExpiry?: string
  expiries?: string[]
  onSelectExpiry?: (exp: string) => void
}) {
  const [open, setOpen] = useState(false)
  const isCe = type === 'CE'
  const atmRowRef = useRef<HTMLDivElement>(null)

  // Sorted unique strikes
  const sortedStrikes = useMemo(() => {
    const unique = Array.from(new Set(strikes.filter((s) => s > 0)))
    return unique.sort((a, b) => a - b)
  }, [strikes])

  // Find ATM index in sorted strikes
  const atmIdx = useMemo(() => {
    if (!sortedStrikes.length) return -1
    let closestIdx = 0
    let minDiff = Math.abs(sortedStrikes[0] - atmStrike)
    for (let i = 1; i < sortedStrikes.length; i++) {
      const diff = Math.abs(sortedStrikes[i] - atmStrike)
      if (diff < minDiff) {
        minDiff = diff
        closestIdx = i
      }
    }
    return closestIdx
  }, [sortedStrikes, atmStrike])

  interface LadderItem {
    strike: number
    label: string
    symbol?: string
    rowLtp?: number
    prevClose?: number
    oi?: number
    changePercent?: number
  }

  // All available strikes mapped to ladder items with accurate ITM/ATM/OTM labels
  const ladderStrikes = useMemo<LadderItem[]>(() => {
    return sortedStrikes.map((s, idx) => {
      const row = strikeRows.find((r) => r.strike === s)
      const leg = isCe ? row?.ce : row?.pe
      let label = ''
      if (idx === atmIdx) {
        label = 'ATM'
      } else if (isCe) {
        label = idx < atmIdx ? `ITM ${atmIdx - idx}` : `OTM ${idx - atmIdx}`
      } else {
        label = idx > atmIdx ? `ITM ${idx - atmIdx}` : `OTM ${atmIdx - idx}`
      }

      return {
        strike: s,
        label: leg?.label || label,
        symbol: leg?.symbol,
        rowLtp: leg?.ltp,
        prevClose: leg?.prev_close,
        oi: leg?.oi,
        changePercent: leg?.change_percent,
      }
    })
  }, [sortedStrikes, atmIdx, isCe, strikeRows])

  // Real-time WebSocket streaming: all strikes when popover is open, selected strike when closed (0-1ms latency)
  const ladderSymbols = useMemo(() => {
    if (open) {
      return ladderStrikes
        .filter((s) => !!s.symbol)
        .map((s) => ({ symbol: s.symbol!, exchange }))
    }
    const sel = ladderStrikes.find((s) => s.strike === selectedStrike)
    return sel?.symbol ? [{ symbol: sel.symbol, exchange }] : []
  }, [open, ladderStrikes, exchange, selectedStrike])

  const { data: wsMarketData } = useMarketData({
    symbols: ladderSymbols,
    mode: 'Quote',
    enabled: ladderSymbols.length > 0,
  })

  // Compute live price, % change, and OI for each ladder strike
  const evaluatedLadder = useMemo(() => {
    return ladderStrikes.map((s) => {
      const tick = s.symbol ? wsMarketData.get(`${exchange}:${s.symbol}`) : undefined
      const liveLtp = tick?.data?.ltp ?? s.rowLtp ?? (s.strike === selectedStrike ? ltp : undefined)
      const prevClose =
        s.prevClose ??
        (tick?.data as any)?.prev_close ??
        (tick?.data?.close && liveLtp !== undefined && Math.abs(tick.data.close - liveLtp) > 0.05
          ? tick.data.close
          : undefined)

      let chgPct = 0
      if (tick?.data?.change_percent !== undefined && Math.abs(tick.data.change_percent) > 0.0001) {
        chgPct = tick.data.change_percent
      } else if (liveLtp && prevClose && prevClose > 0) {
        chgPct = ((liveLtp - prevClose) / prevClose) * 100
      } else if (s.changePercent !== undefined) {
        chgPct = s.changePercent
      }

      const oi = (tick?.data as any)?.oi ?? s.oi ?? tick?.data?.volume ?? 0

      return {
        ...s,
        liveLtp,
        prevClose,
        chgPct,
        oi,
      }
    })
  }, [ladderStrikes, wsMarketData, exchange, selectedStrike, ltp])

  // Auto-scroll to center on ATM row when popover opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        if (atmRowRef.current) {
          atmRowRef.current.scrollIntoView({ block: 'center', behavior: 'auto' })
        }
      }, 30)
      return () => clearTimeout(timer)
    }
  }, [open])

  // Maximum OI across visible strikes for proportional visual OI bar
  const maxOi = useMemo(() => {
    let max = 0
    for (const item of evaluatedLadder) {
      if (item.oi > max) max = item.oi
    }
    return max > 0 ? max : 1
  }, [evaluatedLadder])

  // Currently selected strike's stats
  const selectedItem = evaluatedLadder.find((s) => s.strike === selectedStrike)
  const currentLtp = selectedItem?.liveLtp ?? ltp
  const currentChg = selectedItem?.chgPct ?? 0

  // Quick strikes around ATM
  const quickStrikes = useMemo(() => {
    if (atmIdx === -1) return []
    const offsets = isCe ? [-1, 0, 1] : [1, 0, -1]
    return offsets
      .map((off) => evaluatedLadder[atmIdx + off])
      .filter((item): item is typeof evaluatedLadder[0] => Boolean(item))
  }, [atmIdx, isCe, evaluatedLadder])

  return (
    <div className="relative">
      {/* Groww 915 Style Strike Button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'h-7 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs',
          'bg-muted/40 hover:bg-muted/70 border-border/80 text-foreground backdrop-blur-md',
          open && 'ring-1 ring-primary border-primary bg-muted/60'
        )}
        title={`Click to open ${type} Strike Selector`}
      >
        <span className={cn('font-mono font-bold text-xs', isCe ? 'text-emerald-400' : 'text-rose-400')}>
          {selectedStrike > 0 ? `${selectedStrike} ${type}` : `Select ${type}`}
        </span>
        {currentLtp !== undefined && currentLtp > 0 && (
          <span className="font-mono text-[11px] font-semibold text-foreground ml-0.5">
            ₹{currentLtp.toFixed(2)}
          </span>
        )}
        {currentLtp !== undefined && currentLtp > 0 && (
          <span
            className={cn(
              'font-mono text-[9px] font-bold px-1 rounded tabular-nums',
              currentChg >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
            )}
          >
            {currentChg >= 0 ? '+' : ''}{currentChg.toFixed(1)}%
          </span>
        )}
        <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {/* Native OpenAlgo Aesthetic Popover with Scrollable Strikes */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'absolute bottom-full mb-1.5 z-50 w-84 rounded-xl p-2.5',
              'backdrop-blur-xl bg-card/95 border border-border shadow-2xl',
              'animate-in fade-in zoom-in-95 duration-100',
              isCe ? 'left-0' : 'right-0'
            )}
          >
            {/* Header: Title, ATM, and Expiry Selector */}
            <div className="flex items-center justify-between pb-2 border-b border-border text-xs">
              <div className="flex items-center gap-1.5">
                <span className={cn('font-bold text-xs', isCe ? 'text-emerald-400' : 'text-rose-400')}>
                  {isCe ? 'CALL (CE)' : 'PUT (PE)'}
                </span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-400 border-amber-500/30 font-mono">
                  ATM {atmStrike}
                </Badge>
              </div>

              {/* Expiry Selector / Badge */}
              <div className="flex items-center gap-1">
                {expiries && expiries.length > 1 ? (
                  <select
                    value={selectedExpiry}
                    onChange={(e) => onSelectExpiry?.(e.target.value)}
                    className="bg-muted text-foreground text-[10px] font-mono font-medium rounded px-1.5 py-0.5 border border-border focus:outline-hidden cursor-pointer"
                    title="Select Expiry Date"
                  >
                    {expiries.map((exp) => (
                      <option key={exp} value={exp} className="bg-popover text-popover-foreground">
                        {exp}
                      </option>
                    ))}
                  </select>
                ) : selectedExpiry ? (
                  <span className="text-[10px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border/50">
                    {selectedExpiry}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {type} Strikes
                  </span>
                )}
              </div>
            </div>

            {/* Column labels */}
            <div className="flex items-center justify-between px-2 pt-1.5 pb-0.5 text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
              <span>Strike / Tag</span>
              <span>LTP / Change</span>
            </div>

            {/* Scrollable Strike Ladder (All Available Strikes) with Centered ATM */}
            <div className="py-1 space-y-1 max-h-72 overflow-y-auto scrollbar-thin">
              {evaluatedLadder.map((s) => {
                const isSelected = s.strike === selectedStrike
                const isAtm = s.strike === atmStrike
                const oiPct = maxOi > 0 ? Math.min(100, Math.max(s.oi > 0 ? 6 : 0, (s.oi / maxOi) * 100)) : 0
                return (
                  <div
                    key={`${type}-${s.strike}`}
                    ref={isAtm ? atmRowRef : undefined}
                    onClick={() => {
                      onSelectStrike(s.strike)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex flex-col px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all border relative overflow-hidden',
                      isSelected
                        ? 'bg-primary/15 border-primary/70 text-foreground font-semibold ring-1 ring-primary/40'
                        : isAtm
                        ? 'bg-amber-500/5 border-amber-500/40 text-foreground hover:bg-muted/70'
                        : 'bg-card/40 border-border/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    )}
                  >
                    {/* Top Row: Strike + Label | LTP + % Change */}
                    <div className="flex items-center justify-between z-10 relative">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs text-foreground">{s.strike}</span>
                        <span
                          className={cn(
                            'text-[9px] px-1 py-0.2 rounded font-mono font-semibold',
                            isAtm
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {s.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-semibold text-foreground">
                          {s.liveLtp !== undefined && s.liveLtp > 0 ? `₹${s.liveLtp.toFixed(2)}` : '—'}
                        </span>
                        <span
                          className={cn(
                            'font-mono text-[10px] font-semibold px-1 rounded tabular-nums',
                            s.chgPct >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
                          )}
                        >
                          {s.chgPct >= 0 ? '+' : ''}{s.chgPct.toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    {/* Bottom Row: Line below strike with Decent Color OI bar */}
                    <div className="mt-1 flex items-center justify-between gap-2 z-10 relative">
                      <div className="flex-1 h-1.5 bg-muted/80 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300 bg-sky-500/70"
                          style={{ width: `${oiPct}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-muted-foreground whitespace-nowrap">
                        OI: <span className="text-sky-400 font-semibold">{formatOi(s.oi)}</span>
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Quick Select Pills at bottom */}
            {quickStrikes.length > 0 && (
              <div className="pt-2 border-t border-border flex items-center justify-between gap-1 text-[11px]">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Quick:</span>
                <div className="flex items-center gap-1">
                  {quickStrikes.map((s) => (
                    <button
                      key={`quick-${type}-${s.strike}`}
                      type="button"
                      onClick={() => {
                        onSelectStrike(s.strike)
                        setOpen(false)
                      }}
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer border',
                        s.strike === selectedStrike
                          ? 'bg-primary text-primary-foreground font-bold border-primary'
                          : 'bg-muted/50 border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted'
                      )}
                    >
                      {s.label} ({s.strike})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function ScalperMiniDeck({
  atmStrike,
  strikes,
  strikeRows = [],
  callStrike,
  putStrike,
  onSelectCallStrike,
  onSelectPutStrike,
  callSymbol,
  putSymbol,
  exchange,
  callLtp,
  putLtp,
  lotSize,
  positions = [],
  onExecuteOrder,
  disabled = false,
  appMode: propAppMode,
  collapsed: propCollapsed,
  onToggleCollapse,
  selectedExpiry,
  expiries,
  onSelectExpiry,
  onExitAll,
}: Props) {
  const { appMode: storeAppMode } = useThemeStore()
  const appMode = propAppMode || storeAppMode

  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const isCollapsed = propCollapsed !== undefined ? propCollapsed : internalCollapsed
  const toggleCollapse = onToggleCollapse || (() => setInternalCollapsed((prev) => !prev))

  const [callLots, setCallLots] = useState(1)
  const [putLots, setPutLots] = useState(1)
  const [callLotsInput, setCallLotsInput] = useState<string>('1')
  const [putLotsInput, setPutLotsInput] = useState<string>('1')

  const [isSubmitting, setIsSubmitting] = useState(false)

  // Default product is strictly NRML for both Live and Sandbox mode
  const product: 'MIS' | 'NRML' = 'NRML'

  // Quantity calculations
  const effectiveLotSize = lotSize > 0 ? lotSize : 1
  const callQty = callLots * effectiveLotSize
  const putQty = putLots * effectiveLotSize

  // Keep string inputs in sync when lots are changed via step buttons
  useEffect(() => {
    setCallLotsInput(String(callLots))
  }, [callLots])

  useEffect(() => {
    setPutLotsInput(String(putLots))
  }, [putLots])

  // Margin required calculations (Option buying premium = LTP * Qty)
  const callMargin = (callLtp || 0) * callQty
  const putMargin = (putLtp || 0) * putQty

  // Running position tracking for active CE & PE
  const callPosition = useMemo(
    () => positions.find((p) => p.symbol === callSymbol && Math.abs(p.quantity ?? 0) > 0),
    [positions, callSymbol]
  )
  const putPosition = useMemo(
    () => positions.find((p) => p.symbol === putSymbol && Math.abs(p.quantity ?? 0) > 0),
    [positions, putSymbol]
  )

  // Overall position stats
  const totalPnl = useMemo(() => {
    return positions.reduce((acc, p) => acc + (p.pnl || 0), 0)
  }, [positions])
  const hasOpenPositions = useMemo(() => {
    return positions.some((p) => Math.abs(p.quantity ?? 0) > 0)
  }, [positions])

  // Instant 1-Click Order Execution
  const handleOrder = async (side: 'CALL' | 'PUT', action: 'BUY' | 'SELL') => {
    if (disabled || isSubmitting) return
    const symbol = side === 'CALL' ? callSymbol : putSymbol
    const quantity = side === 'CALL' ? callQty : putQty

    if (!symbol) return

    try {
      setIsSubmitting(true)
      await onExecuteOrder({
        symbol,
        exchange,
        action,
        quantity,
        pricetype: 'MARKET',
        product,
        ltp: side === 'CALL' ? callLtp : putLtp,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isCollapsed) {
    return (
      <div
        onClick={toggleCollapse}
        className="h-7 bg-card/90 hover:bg-card/95 border-t border-border flex items-center justify-between px-3 text-[11px] text-muted-foreground select-none shrink-0 z-20 cursor-pointer transition-colors"
        title="Click to expand Execution Deck"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-emerald-400">
            CALL: {callStrike} ({callQty} Qty)
          </span>
          {callPosition && (
            <span
              className={cn(
                'text-[10px] font-bold font-mono',
                callPosition.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              )}
            >
              Pos: {callPosition.quantity} ({callPosition.pnl >= 0 ? '+' : ''}₹{callPosition.pnl.toFixed(0)})
            </span>
          )}
          <span>•</span>
          <span className="font-semibold text-rose-400">
            PUT: {putStrike} ({putQty} Qty)
          </span>
          {putPosition && (
            <span
              className={cn(
                'text-[10px] font-bold font-mono',
                putPosition.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              )}
            >
              Pos: {putPosition.quantity} ({putPosition.pnl >= 0 ? '+' : ''}₹{putPosition.pnl.toFixed(0)})
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            toggleCollapse()
          }}
          className="flex items-center gap-1.5 hover:text-foreground cursor-pointer font-medium px-2 py-0.5 rounded bg-muted/40 hover:bg-muted/70 transition-colors"
          title="Expand Execution Deck"
        >
          <span className="text-[10px] font-semibold">Expand Deck</span>
          <ChevronUp className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="bg-card/90 backdrop-blur-xl border-t border-border/80 px-3 py-1 flex items-center justify-between gap-2 text-xs select-none shrink-0 shadow-lg z-20">
      {/* 1. CALL EXECUTION PAD (LEFT) */}
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Groww Style Strike Selector */}
        <GrowwStrikeSelector
          type="CE"
          selectedStrike={callStrike}
          onSelectStrike={onSelectCallStrike}
          atmStrike={atmStrike}
          strikes={strikes}
          strikeRows={strikeRows}
          ltp={callLtp}
          exchange={exchange}
          selectedExpiry={selectedExpiry}
          expiries={expiries}
          onSelectExpiry={onSelectExpiry}
        />

        {/* Call Lots & Quantity Counter with Editable Input */}
        <div className="flex items-center bg-background/80 border border-border/70 rounded-md h-7 px-1">
          <button
            type="button"
            onClick={() => {
              const next = Math.max(1, callLots - 1)
              setCallLots(next)
              setCallLotsInput(String(next))
            }}
            className="px-1 text-muted-foreground hover:text-foreground cursor-pointer"
            title="Decrease lot"
          >
            <Minus className="h-3 w-3" />
          </button>
          <div className="flex items-center gap-1 px-1">
            <input
              type="text"
              inputMode="numeric"
              value={callLotsInput}
              onChange={(e) => {
                const val = e.target.value
                if (val === '' || /^\d+$/.test(val)) {
                  setCallLotsInput(val)
                  const num = parseInt(val, 10)
                  if (!isNaN(num) && num > 0) {
                    setCallLots(Math.min(num, 100))
                  }
                }
              }}
              onBlur={() => {
                if (!callLotsInput || parseInt(callLotsInput, 10) < 1) {
                  setCallLots(1)
                  setCallLotsInput('1')
                }
              }}
              className="w-7 font-mono text-[11px] font-bold text-center bg-transparent border-none focus:outline-hidden text-foreground"
              title="Lots to trade (type to change)"
            />
            <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
              L ({callQty}Q)
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = Math.min(100, callLots + 1)
              setCallLots(next)
              setCallLotsInput(String(next))
            }}
            className="px-1 text-muted-foreground hover:text-foreground cursor-pointer"
            title="Increase lot"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        {/* Call Margin Required Pill */}
        {callMargin > 0 && (
          <div
            className="hidden md:flex items-center px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 text-[10px] font-mono text-muted-foreground whitespace-nowrap"
            title={`Required Margin for ${callQty} Qty at LTP ₹${callLtp?.toFixed(2)}`}
          >
            <span>~₹{formatIndianNumber(callMargin)}</span>
          </div>
        )}

        {/* Call Buy (Blue) & Sell (Red) 1-Click Buttons */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            onClick={() => handleOrder('CALL', 'BUY')}
            disabled={disabled || isSubmitting || !callSymbol}
            className="h-7 px-3 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-xs cursor-pointer active:scale-95 transition-transform"
            title="Instant 1-Click Buy Call"
          >
            BUY CE
          </Button>
          <Button
            size="sm"
            onClick={() => handleOrder('CALL', 'SELL')}
            disabled={disabled || isSubmitting || !callSymbol}
            className="h-7 px-3 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-xs cursor-pointer active:scale-95 transition-transform"
            title="Instant 1-Click Sell Call"
          >
            SELL CE
          </Button>
        </div>

        {/* Running CE Position Badge */}
        {callPosition && (
          <span
            className={cn(
              'text-[9px] font-bold px-1.5 py-0.5 rounded font-mono border whitespace-nowrap hidden sm:inline-flex',
              callPosition.pnl >= 0
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
            )}
            title={`Running CE Position: ${callPosition.quantity} Qty, P&L: ₹${callPosition.pnl.toFixed(2)}`}
          >
            Pos: {callPosition.quantity > 0 ? '+' : ''}
            {callPosition.quantity} ({callPosition.pnl >= 0 ? '+' : ''}₹{callPosition.pnl.toFixed(0)})
          </span>
        )}
      </div>

      {/* 2. CENTER CONTROLS (PRODUCT BADGE, P&L, EXIT ALL, HIDE BUTTON) */}
      <div className="flex items-center gap-1.5 shrink-0 border-x border-border/60 px-2.5">
        <span
          className="text-[9px] font-bold text-muted-foreground bg-muted/60 border border-border/50 px-1.5 py-0.5 rounded"
          title="Orders are placed with NRML product by default"
        >
          NRML • 1-CLICK
        </span>

        {appMode === 'analyzer' && (
          <span className="text-[9px] font-bold text-purple-400 bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 rounded tracking-wide">
            SANDBOX
          </span>
        )}

        {hasOpenPositions && (
          <div className="flex items-center gap-1">
            <span
              className={cn(
                'font-mono text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums',
                totalPnl >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
              )}
            >
              P&L: {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toFixed(0)}
            </span>
            {onExitAll && (
              <button
                type="button"
                onClick={onExitAll}
                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30 cursor-pointer transition-colors"
                title="Exit all open scalper positions"
              >
                Exit All
              </button>
            )}
          </div>
        )}

        {/* Minimize deck button */}
        <button
          type="button"
          onClick={toggleCollapse}
          className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground cursor-pointer px-1.5 py-0.5 rounded hover:bg-muted/60 transition-colors"
          title="Minimize Execution Deck"
        >
          <span>Hide</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 3. PUT EXECUTION PAD (RIGHT) */}
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Running PE Position Badge */}
        {putPosition && (
          <span
            className={cn(
              'text-[9px] font-bold px-1.5 py-0.5 rounded font-mono border whitespace-nowrap hidden sm:inline-flex',
              putPosition.pnl >= 0
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
            )}
            title={`Running PE Position: ${putPosition.quantity} Qty, P&L: ₹${putPosition.pnl.toFixed(2)}`}
          >
            Pos: {putPosition.quantity > 0 ? '+' : ''}
            {putPosition.quantity} ({putPosition.pnl >= 0 ? '+' : ''}₹{putPosition.pnl.toFixed(0)})
          </span>
        )}

        {/* Put Buy (Blue) & Sell (Red) 1-Click Buttons */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            onClick={() => handleOrder('PUT', 'BUY')}
            disabled={disabled || isSubmitting || !putSymbol}
            className="h-7 px-3 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-xs cursor-pointer active:scale-95 transition-transform"
            title="Instant 1-Click Buy Put"
          >
            BUY PE
          </Button>
          <Button
            size="sm"
            onClick={() => handleOrder('PUT', 'SELL')}
            disabled={disabled || isSubmitting || !putSymbol}
            className="h-7 px-3 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-xs cursor-pointer active:scale-95 transition-transform"
            title="Instant 1-Click Sell Put"
          >
            SELL PE
          </Button>
        </div>

        {/* Put Margin Required Pill */}
        {putMargin > 0 && (
          <div
            className="hidden md:flex items-center px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 text-[10px] font-mono text-muted-foreground whitespace-nowrap"
            title={`Required Margin for ${putQty} Qty at LTP ₹${putLtp?.toFixed(2)}`}
          >
            <span>~₹{formatIndianNumber(putMargin)}</span>
          </div>
        )}

        {/* Put Lots & Quantity Counter with Editable Input */}
        <div className="flex items-center bg-background/80 border border-border/70 rounded-md h-7 px-1">
          <button
            type="button"
            onClick={() => {
              const next = Math.max(1, putLots - 1)
              setPutLots(next)
              setPutLotsInput(String(next))
            }}
            className="px-1 text-muted-foreground hover:text-foreground cursor-pointer"
            title="Decrease lot"
          >
            <Minus className="h-3 w-3" />
          </button>
          <div className="flex items-center gap-1 px-1">
            <input
              type="text"
              inputMode="numeric"
              value={putLotsInput}
              onChange={(e) => {
                const val = e.target.value
                if (val === '' || /^\d+$/.test(val)) {
                  setPutLotsInput(val)
                  const num = parseInt(val, 10)
                  if (!isNaN(num) && num > 0) {
                    setPutLots(Math.min(num, 100))
                  }
                }
              }}
              onBlur={() => {
                if (!putLotsInput || parseInt(putLotsInput, 10) < 1) {
                  setPutLots(1)
                  setPutLotsInput('1')
                }
              }}
              className="w-7 font-mono text-[11px] font-bold text-center bg-transparent border-none focus:outline-hidden text-foreground"
              title="Lots to trade (type to change)"
            />
            <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
              L ({putQty}Q)
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = Math.min(100, putLots + 1)
              setPutLots(next)
              setPutLotsInput(String(next))
            }}
            className="px-1 text-muted-foreground hover:text-foreground cursor-pointer"
            title="Increase lot"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        {/* Groww Style Strike Selector */}
        <GrowwStrikeSelector
          type="PE"
          selectedStrike={putStrike}
          onSelectStrike={onSelectPutStrike}
          atmStrike={atmStrike}
          strikes={strikes}
          strikeRows={strikeRows}
          ltp={putLtp}
          exchange={exchange}
          selectedExpiry={selectedExpiry}
          expiries={expiries}
          onSelectExpiry={onSelectExpiry}
        />
      </div>
    </div>
  )
}
