import { ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn, formatIndianNumber } from '@/lib/utils'
import type { Position } from '@/types/trading'

interface Props {
  atmStrike: number
  strikes: number[]
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
}

export function ScalperMiniDeck({
  atmStrike,
  strikes,
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
  appMode = 'live',
}: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [callLots, setCallLots] = useState(1)
  const [putLots, setPutLots] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Default product is strictly NRML for both Live and Sandbox mode
  const product: 'MIS' | 'NRML' = 'NRML'

  // Quantity calculations
  const effectiveLotSize = lotSize > 0 ? lotSize : 1
  const callQty = callLots * effectiveLotSize
  const putQty = putLots * effectiveLotSize

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
  const handleOrder = async (
    side: 'CALL' | 'PUT',
    action: 'BUY' | 'SELL'
  ) => {
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

  if (collapsed) {
    return (
      <div className="h-6 bg-card/90 border-t border-border flex items-center justify-between px-3 text-[11px] text-muted-foreground select-none shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-emerald-400">CALL: {callStrike} ({callQty} Qty)</span>
          {callPosition && (
            <span className={cn('text-[10px] font-bold font-mono', callPosition.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
              Pos: {callPosition.quantity} ({callPosition.pnl >= 0 ? '+' : ''}₹{callPosition.pnl.toFixed(0)})
            </span>
          )}
          <span>•</span>
          <span className="font-semibold text-rose-400">PUT: {putStrike} ({putQty} Qty)</span>
          {putPosition && (
            <span className={cn('text-[10px] font-bold font-mono', putPosition.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
              Pos: {putPosition.quantity} ({putPosition.pnl >= 0 ? '+' : ''}₹{putPosition.pnl.toFixed(0)})
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-1 hover:text-foreground cursor-pointer font-medium"
        >
          <span>Open Execution Deck</span>
          <ChevronUp className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="bg-card/95 border-t border-border/80 px-3 py-1 flex items-center justify-between gap-3 text-xs select-none shrink-0 shadow-lg z-20">
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
                Pos: {callPosition.quantity > 0 ? '+' : ''}{callPosition.quantity} ({callPosition.pnl >= 0 ? '+' : ''}₹{callPosition.pnl.toFixed(0)})
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground truncate max-w-[125px]" title={callSymbol}>
            {callSymbol || 'No symbol'}
          </span>
        </div>

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

        {/* Strike Select Dropdown */}
        <select
          value={callStrike}
          onChange={(e) => onSelectCallStrike(Number(e.target.value))}
          className="h-7 text-[11px] font-semibold bg-background border border-border rounded px-1.5 cursor-pointer text-foreground focus:outline-hidden"
        >
          {strikes.map((s) => (
            <option key={`ce-opt-${s}`} value={s}>
              {s} {s === atmStrike ? '(ATM)' : ''}
            </option>
          ))}
        </select>

        {/* Call Lots & Quantity Counter */}
        <div className="flex items-center bg-background border border-border rounded h-7">
          <button
            type="button"
            onClick={() => setCallLots((l) => Math.max(1, l - 1))}
            className="px-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
            title="Decrease lot"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span
            className="px-1.5 font-mono text-[11px] font-bold min-w-[56px] text-center"
            title={`${callLots} Lot(s) = ${callQty} Quantity`}
          >
            {callLots}L ({callQty}Q)
          </span>
          <button
            type="button"
            onClick={() => setCallLots((l) => l + 1)}
            className="px-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
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

        {/* Call Buy & Sell 1-Click Buttons */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            onClick={() => handleOrder('CALL', 'BUY')}
            disabled={disabled || isSubmitting || !callSymbol}
            className="h-7 px-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer active:scale-95 transition-transform"
            title="Instant 1-Click Buy Call"
          >
            BUY CE
          </Button>
          <Button
            size="sm"
            onClick={() => handleOrder('CALL', 'SELL')}
            disabled={disabled || isSubmitting || !callSymbol}
            className="h-7 px-2.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-xs cursor-pointer active:scale-95 transition-transform"
            title="Instant 1-Click Sell Call"
          >
            SELL CE
          </Button>
        </div>
      </div>

      {/* 2. CENTER CONTROLS (PRODUCT BADGE, STATUS, COLLAPSE) */}
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

        {/* Minimize deck */}
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
          title="Minimize Execution Deck"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 3. PUT EXECUTION PAD (RIGHT) */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Put Buy & Sell 1-Click Buttons */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            onClick={() => handleOrder('PUT', 'BUY')}
            disabled={disabled || isSubmitting || !putSymbol}
            className="h-7 px-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer active:scale-95 transition-transform"
            title="Instant 1-Click Buy Put"
          >
            BUY PE
          </Button>
          <Button
            size="sm"
            onClick={() => handleOrder('PUT', 'SELL')}
            disabled={disabled || isSubmitting || !putSymbol}
            className="h-7 px-2.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-xs cursor-pointer active:scale-95 transition-transform"
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

        {/* Put Lots & Quantity Counter */}
        <div className="flex items-center bg-background border border-border rounded h-7">
          <button
            type="button"
            onClick={() => setPutLots((l) => Math.max(1, l - 1))}
            className="px-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
            title="Decrease lot"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span
            className="px-1.5 font-mono text-[11px] font-bold min-w-[56px] text-center"
            title={`${putLots} Lot(s) = ${putQty} Quantity`}
          >
            {putLots}L ({putQty}Q)
          </span>
          <button
            type="button"
            onClick={() => setPutLots((l) => l + 1)}
            className="px-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
            title="Increase lot"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        {/* Strike Select Dropdown */}
        <select
          value={putStrike}
          onChange={(e) => onSelectPutStrike(Number(e.target.value))}
          className="h-7 text-[11px] font-semibold bg-background border border-border rounded px-1.5 cursor-pointer text-foreground focus:outline-hidden"
        >
          {strikes.map((s) => (
            <option key={`pe-opt-${s}`} value={s}>
              {s} {s === atmStrike ? '(ATM)' : ''}
            </option>
          ))}
        </select>

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
                Pos: {putPosition.quantity > 0 ? '+' : ''}{putPosition.quantity} ({putPosition.pnl >= 0 ? '+' : ''}₹{putPosition.pnl.toFixed(0)})
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
