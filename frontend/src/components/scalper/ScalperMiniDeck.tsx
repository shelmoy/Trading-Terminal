import { ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn, formatIndianNumber } from '@/lib/utils'
import { useThemeStore } from '@/stores/themeStore'
import type { OptionChainRow } from '@/types/scalping'
import type { Position } from '@/types/trading'

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
}

/**
 * Groww 915 Style Strike Selector with Glass Texture Popover.
 * Features 5-strike ladder (ITM 2, ITM 1, ATM, OTM 1, OTM 2), live prices inside,
 * and quick-select pills.
 */
function GrowwStrikeSelector({
  type,
  selectedStrike,
  onSelectStrike,
  atmStrike,
  strikes,
  strikeRows = [],
  ltp,
}: {
  type: 'CE' | 'PE'
  selectedStrike: number
  onSelectStrike: (strike: number) => void
  atmStrike: number
  strikes: number[]
  strikeRows?: OptionChainRow[]
  ltp?: number
}) {
  const [open, setOpen] = useState(false)
  const isCe = type === 'CE'

  // Map rows for fast lookup of live price and label
  const rowMap = useMemo(() => {
    const map = new Map<number, { ltp?: number; label?: string }>()
    for (const r of strikeRows) {
      const data = isCe ? r.ce : r.pe
      map.set(r.strike, { ltp: data?.ltp, label: data?.label })
    }
    return map
  }, [strikeRows, isCe])

  // Find ATM index in sorted strikes
  const atmIdx = useMemo(() => {
    if (!strikes.length) return -1
    let closestIdx = 0
    let minDiff = Math.abs(strikes[0] - atmStrike)
    for (let i = 1; i < strikes.length; i++) {
      const diff = Math.abs(strikes[i] - atmStrike)
      if (diff < minDiff) {
        minDiff = diff
        closestIdx = i
      }
    }
    return closestIdx
  }, [strikes, atmStrike])

  interface LadderItem {
    strike: number
    label: string
    ltp?: number
  }

  // 5-strike ladder around ATM
  const ladderStrikes = useMemo<LadderItem[]>(() => {
    if (atmIdx === -1) {
      return strikes.slice(0, 7).map((s) => ({
        strike: s,
        label: s === atmStrike ? 'ATM' : '',
        ltp: rowMap.get(s)?.ltp,
      }))
    }
    const offsets = isCe
      ? [
          { off: -2, defaultLabel: 'ITM 2' },
          { off: -1, defaultLabel: 'ITM 1' },
          { off: 0, defaultLabel: 'ATM' },
          { off: 1, defaultLabel: 'OTM 1' },
          { off: 2, defaultLabel: 'OTM 2' },
        ]
      : [
          { off: 2, defaultLabel: 'ITM 2' },
          { off: 1, defaultLabel: 'ITM 1' },
          { off: 0, defaultLabel: 'ATM' },
          { off: -1, defaultLabel: 'OTM 1' },
          { off: -2, defaultLabel: 'OTM 2' },
        ]

    const list: LadderItem[] = []
    for (const { off, defaultLabel } of offsets) {
      const s = strikes[atmIdx + off]
      if (s !== undefined) {
        const info = rowMap.get(s)
        list.push({
          strike: s,
          label: info?.label || defaultLabel,
          ltp: info?.ltp,
        })
      }
    }
    return list
  }, [atmIdx, strikes, isCe, rowMap, atmStrike])

  // Current selected label
  const selectedInfo = rowMap.get(selectedStrike)
  const currentLabel = selectedInfo?.label || (selectedStrike === atmStrike ? 'ATM' : '')

  return (
    <div className="relative">
      {/* Groww 915 Style Strike Button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'h-7 px-2.5 rounded-md border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs',
          'bg-background/90 hover:bg-muted/70 border-border/80 text-foreground',
          open && 'ring-1 ring-primary border-primary bg-muted/50'
        )}
        title={`Click to open ${type} Strike Selector`}
      >
        <span className={cn('font-mono font-bold', isCe ? 'text-emerald-400' : 'text-rose-400')}>
          {selectedStrike > 0 ? `${selectedStrike} ${type}` : `Select ${type}`}
        </span>
        {currentLabel && (
          <span className="text-[9px] px-1 py-0.2 rounded bg-muted font-bold text-muted-foreground">
            {currentLabel}
          </span>
        )}
        {ltp !== undefined && (
          <span className="font-mono text-[11px] font-semibold text-foreground ml-0.5">
            ₹{ltp.toFixed(2)}
          </span>
        )}
        <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {/* Groww 915 Glass Texture Popover */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'absolute bottom-full mb-1.5 z-50 w-72 rounded-xl p-2.5',
              'backdrop-blur-xl bg-zinc-950/90 border border-zinc-700/60 shadow-2xl',
              'animate-in fade-in zoom-in-95 duration-100',
              isCe ? 'left-0' : 'right-0'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80 text-xs">
              <div className="flex items-center gap-1.5">
                <span className={cn('font-bold text-xs', isCe ? 'text-emerald-400' : 'text-rose-400')}>
                  {isCe ? 'CALL (CE)' : 'PUT (PE)'} Option Chain
                </span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-400 border-amber-500/30 font-mono">
                  ATM {atmStrike}
                </Badge>
              </div>
              <span className="text-[10px] text-zinc-400 font-mono">
                {type} Strikes
              </span>
            </div>

            {/* Strike Ladder with Live Prices */}
            <div className="py-1.5 space-y-1 max-h-56 overflow-y-auto scrollbar-thin">
              {ladderStrikes.map((s) => {
                const isSelected = s.strike === selectedStrike
                const isAtm = s.strike === atmStrike
                return (
                  <div
                    key={`${type}-${s.strike}`}
                    onClick={() => {
                      onSelectStrike(s.strike)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all border',
                      isSelected
                        ? isCe
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-white font-bold'
                          : 'bg-rose-500/20 border-rose-500/50 text-white font-bold'
                        : isAtm
                        ? 'bg-zinc-800/60 border-amber-500/40 text-zinc-100 hover:bg-zinc-800'
                        : 'bg-zinc-900/40 border-zinc-800/40 text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold">{s.strike}</span>
                      <span
                        className={cn(
                          'text-[9px] px-1 py-0.2 rounded font-semibold',
                          isAtm
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-zinc-800 text-zinc-400'
                        )}
                      >
                        {s.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {s.ltp !== undefined && (
                        <span className="font-mono text-[11px] font-bold text-zinc-100">
                          ₹{s.ltp.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Quick Select Pills at bottom */}
            <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-1 text-[11px]">
              <span className="text-[10px] text-zinc-400 uppercase font-semibold">Quick:</span>
              <div className="flex items-center gap-1">
                {ladderStrikes.slice(1, 4).map((s) => (
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
                        ? isCe
                          ? 'bg-emerald-500/30 border-emerald-500 text-emerald-300 font-bold'
                          : 'bg-rose-500/30 border-rose-500 text-rose-300 font-bold'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                    )}
                  >
                    {s.label} ({s.strike})
                  </button>
                ))}
              </div>
            </div>
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

  // Find ATM index in sorted strikes
  const atmIdx = useMemo(() => {
    if (!strikes.length) return -1
    let closestIdx = 0
    let minDiff = Math.abs(strikes[0] - atmStrike)
    for (let i = 1; i < strikes.length; i++) {
      const diff = Math.abs(strikes[i] - atmStrike)
      if (diff < minDiff) {
        minDiff = diff
        closestIdx = i
      }
    }
    return closestIdx
  }, [strikes, atmStrike])

  // Call quick strikes (lower = ITM, higher = OTM)
  const callQuickPills = useMemo(() => {
    if (atmIdx === -1) return []
    return [
      { label: 'ITM 2', strike: strikes[atmIdx - 2] },
      { label: 'ITM 1', strike: strikes[atmIdx - 1] },
      { label: 'ATM', strike: strikes[atmIdx] },
      { label: 'OTM 1', strike: strikes[atmIdx + 1] },
      { label: 'OTM 2', strike: strikes[atmIdx + 2] },
    ].filter((p) => p.strike !== undefined)
  }, [strikes, atmIdx])

  // Put quick strikes (higher = ITM, lower = OTM)
  const putQuickPills = useMemo(() => {
    if (atmIdx === -1) return []
    return [
      { label: 'ITM 2', strike: strikes[atmIdx + 2] },
      { label: 'ITM 1', strike: strikes[atmIdx + 1] },
      { label: 'ATM', strike: strikes[atmIdx] },
      { label: 'OTM 1', strike: strikes[atmIdx - 1] },
      { label: 'OTM 2', strike: strikes[atmIdx - 2] },
    ].filter((p) => p.strike !== undefined)
  }, [strikes, atmIdx])

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
      <div className="h-7 bg-card/90 border-t border-border flex items-center justify-between px-3 text-[11px] text-muted-foreground select-none shrink-0 z-20">
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
          onClick={toggleCollapse}
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
    <div className="bg-card/95 border-t border-border/80 px-3 py-1.5 flex items-center justify-between gap-3 text-xs select-none shrink-0 shadow-lg z-20">
      {/* 1. CALL EXECUTION PAD (LEFT) */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-emerald-400 text-[11px] tracking-wide">
              CALL (CE)
            </span>
            {callLtp !== undefined && (
              <span className="font-mono text-[11px] font-semibold text-foreground">
                ₹{callLtp.toFixed(2)}
              </span>
            )}
            {callPosition && (
              <span
                className={cn(
                  'text-[9px] font-bold px-1 py-0.2 rounded font-mono border',
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
          <span className="text-[10px] text-muted-foreground truncate max-w-[125px]" title={callSymbol}>
            {callSymbol || 'No symbol'}
          </span>
        </div>

        {/* Groww 915 Style Strike Selector */}
        <GrowwStrikeSelector
          type="CE"
          selectedStrike={callStrike}
          onSelectStrike={onSelectCallStrike}
          atmStrike={atmStrike}
          strikes={strikes}
          strikeRows={strikeRows}
          ltp={callLtp}
        />

        {/* Quick Strike Pills */}
        <div className="flex items-center gap-0.5 bg-muted/30 p-0.5 rounded-md border border-border/40">
          {callQuickPills.map((p) => {
            const isSelected = p.strike === callStrike
            return (
              <button
                key={`ce-${p.label}-${p.strike}`}
                type="button"
                onClick={() => onSelectCallStrike(p.strike)}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer',
                  isSelected
                    ? 'bg-emerald-500 text-white font-bold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
                title={`${p.strike} CE`}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {/* Call Lots & Quantity Counter with Editable Input */}
        <div className="flex items-center bg-background border border-border rounded h-7 px-1">
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
            className="hidden sm:flex items-center px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 text-[10px] font-mono text-muted-foreground whitespace-nowrap"
            title={`Required Margin for ${callQty} Qty at LTP ₹${callLtp?.toFixed(2)}`}
          >
            <span>Margin: ~₹{formatIndianNumber(callMargin)}</span>
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
      </div>

      {/* 2. CENTER CONTROLS (PRODUCT BADGE, STATUS, COLLAPSE BUTTON) */}
      <div className="flex items-center gap-1.5 shrink-0 border-x border-border/60 px-2">
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

        {/* Minimize deck handle button */}
        <button
          type="button"
          onClick={toggleCollapse}
          className="text-muted-foreground hover:text-foreground cursor-pointer p-0.5 rounded hover:bg-muted/60 transition-colors"
          title="Minimize Execution Deck"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 3. PUT EXECUTION PAD (RIGHT) */}
      <div className="flex items-center gap-2 min-w-0">
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
            className="hidden sm:flex items-center px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 text-[10px] font-mono text-muted-foreground whitespace-nowrap"
            title={`Required Margin for ${putQty} Qty at LTP ₹${putLtp?.toFixed(2)}`}
          >
            <span>Margin: ~₹{formatIndianNumber(putMargin)}</span>
          </div>
        )}

        {/* Put Lots & Quantity Counter with Editable Input */}
        <div className="flex items-center bg-background border border-border rounded h-7 px-1">
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

        {/* Groww 915 Style Strike Selector */}
        <GrowwStrikeSelector
          type="PE"
          selectedStrike={putStrike}
          onSelectStrike={onSelectPutStrike}
          atmStrike={atmStrike}
          strikes={strikes}
          strikeRows={strikeRows}
          ltp={putLtp}
        />

        {/* Quick Strike Pills */}
        <div className="flex items-center gap-0.5 bg-muted/30 p-0.5 rounded-md border border-border/40">
          {putQuickPills.map((p) => {
            const isSelected = p.strike === putStrike
            return (
              <button
                key={`pe-${p.label}-${p.strike}`}
                type="button"
                onClick={() => onSelectPutStrike(p.strike)}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer',
                  isSelected
                    ? 'bg-rose-500 text-white font-bold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
                title={`${p.strike} PE`}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        <div className="flex flex-col text-right">
          <div className="flex items-center justify-end gap-1.5">
            {putPosition && (
              <span
                className={cn(
                  'text-[9px] font-bold px-1 py-0.2 rounded font-mono border',
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
            <span className="font-bold text-rose-400 text-[11px] tracking-wide">
              PUT (PE)
            </span>
            {putLtp !== undefined && (
              <span className="font-mono text-[11px] font-semibold text-foreground">
                ₹{putLtp.toFixed(2)}
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground truncate max-w-[125px]" title={putSymbol}>
            {putSymbol || 'No symbol'}
          </span>
        </div>
      </div>
    </div>
  )
}
