import { Minus, Plus, Power } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { ScalperOrderMode, ScalperProduct, ScalperUnderlying } from '@/types/scalper'
import type { OptionChainRow } from '@/types/scalping'
import { ScalperStrikeDropdown } from './ScalperStrikeDropdown'

interface Props {
  underlying: ScalperUnderlying
  expiries: string[]
  selectedExpiry: string
  onSelectExpiry: (exp: string) => void
  currentAtm: number | null
  strikeRows: OptionChainRow[]
  selectedCallStrike: number | null
  selectedPutStrike: number | null
  onSelectCallStrike: (strike: number) => void
  onSelectPutStrike: (strike: number) => void
  callLots: number
  onChangeCallLots: (lots: number) => void
  putLots: number
  onChangePutLots: (lots: number) => void
  callLtp: number | null
  putLtp: number | null
  netPnl: number
  orderMode: ScalperOrderMode
  onChangeOrderMode: (mode: ScalperOrderMode) => void
  product: ScalperProduct
  onChangeProduct: (prod: ScalperProduct) => void
  onBuyCall: () => void
  onSellCall: () => void
  onBuyPut: () => void
  onSellPut: () => void
  onExitAll: () => void
  loading?: boolean
}

export function ScalperDeck({
  underlying,
  expiries,
  selectedExpiry,
  onSelectExpiry,
  currentAtm,
  strikeRows,
  selectedCallStrike,
  selectedPutStrike,
  onSelectCallStrike,
  onSelectPutStrike,
  callLots,
  onChangeCallLots,
  putLots,
  onChangePutLots,
  callLtp,
  putLtp,
  netPnl,
  orderMode,
  onChangeOrderMode,
  product,
  onChangeProduct,
  onBuyCall,
  onSellCall,
  onBuyPut,
  onSellPut,
  onExitAll,
  loading = false,
}: Props) {
  const callQty = callLots * underlying.lotSize
  const putQty = putLots * underlying.lotSize

  const callTotalValue = callLtp ? (callLtp * callQty).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'
  const putTotalValue = putLtp ? (putLtp * putQty).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-3 bg-card/85 backdrop-blur border-t border-border/80 shadow-lg select-none">
      {/* 1. CALL EXECUTION PAD (LEFT) */}
      <div className="flex-1 w-full flex flex-col gap-2 p-2.5 bg-muted/20 border border-emerald-500/20 rounded-lg">
        <div className="flex items-center justify-between">
          <ScalperStrikeDropdown
            optType="CE"
            underlyingSymbol={underlying.symbol}
            selectedStrike={selectedCallStrike}
            currentAtm={currentAtm}
            strikeRows={strikeRows}
            onSelectStrike={onSelectCallStrike}
          />

          <div className="text-right">
            <span className="text-[10px] text-muted-foreground mr-1">LTP:</span>
            <span className="font-mono text-xs font-bold text-emerald-500">
              ₹{callLtp != null ? callLtp.toFixed(2) : '—'}
            </span>
          </div>
        </div>

        {/* Lots & Qty Controls */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 bg-background border border-border rounded-md p-0.5">
            <button
              type="button"
              disabled={callLots <= 1}
              onClick={() => onChangeCallLots(Math.max(1, callLots - 1))}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted disabled:opacity-40 cursor-pointer"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="font-mono text-xs font-bold px-2 tabular-nums">
              {callLots} {callLots === 1 ? 'Lot' : 'Lots'}
            </span>
            <button
              type="button"
              disabled={callLots >= 50}
              onClick={() => onChangeCallLots(callLots + 1)}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted disabled:opacity-40 cursor-pointer"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          <div className="text-[11px] text-muted-foreground font-mono">
            <strong>{callQty}</strong> Qty · Est: ₹{callTotalValue}
          </div>
        </div>

        {/* Buy & Sell Call Buttons */}
        <div className="grid grid-cols-2 gap-2 mt-0.5">
          <Button
            size="default"
            disabled={loading}
            onClick={onBuyCall}
            className="h-10 font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex flex-col justify-center leading-none cursor-pointer shadow-sm"
          >
            <span className="text-sm">Buy Call</span>
            <span className="text-[9px] opacity-75 font-mono">Shift + ←</span>
          </Button>
          <Button
            size="default"
            variant="outline"
            disabled={loading}
            onClick={onSellCall}
            className="h-10 font-bold text-rose-500 border-rose-500/40 hover:bg-rose-500/10 flex flex-col justify-center leading-none cursor-pointer"
          >
            <span className="text-sm">Sell Call</span>
            <span className="text-[9px] opacity-75 font-mono">Order</span>
          </Button>
        </div>
      </div>

      {/* 2. CENTER STATUS & EXPIRY CARD */}
      <div className="flex flex-col items-center justify-center gap-1.5 px-3 py-2 bg-muted/30 border border-border/60 rounded-lg min-w-[200px] w-full md:w-auto">
        <div className="flex items-center gap-2">
          <span className="font-bold text-xs text-foreground">{underlying.symbol}</span>
          <Select value={selectedExpiry} onValueChange={onSelectExpiry}>
            <SelectTrigger className="h-7 text-xs font-mono font-semibold bg-background border-border w-28">
              <SelectValue placeholder="Expiry" />
            </SelectTrigger>
            <SelectContent>
              {expiries.map((exp) => (
                <SelectItem key={exp} value={exp} className="text-xs font-mono">
                  {exp}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Real-time Net P&L Display */}
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Net Scalp P&L
          </span>
          <span
            className={cn(
              'font-mono text-lg font-extrabold tabular-nums',
              netPnl > 0 ? 'text-emerald-500' : netPnl < 0 ? 'text-rose-500' : 'text-foreground'
            )}
          >
            {netPnl >= 0 ? '+' : ''}₹{netPnl.toFixed(2)}
          </span>
        </div>

        {/* Controls: Product (MIS/NRML) & Mode (Instant/Confirm) */}
        <div className="flex items-center gap-2 text-[10px]">
          <div className="flex items-center bg-background border border-border rounded p-0.5">
            {(['MIS', 'NRML'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onChangeProduct(p)}
                className={cn(
                  'px-1.5 py-0.5 rounded transition cursor-pointer font-bold',
                  product === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-background border border-border rounded p-0.5">
            {(['INSTANT', 'CONFIRM'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChangeOrderMode(m)}
                className={cn(
                  'px-1.5 py-0.5 rounded transition cursor-pointer font-bold',
                  orderMode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Exit All Panic Button */}
        <Button
          variant="destructive"
          size="sm"
          disabled={loading}
          onClick={onExitAll}
          className="h-7 px-3 text-xs font-bold flex items-center gap-1 bg-rose-600 hover:bg-rose-700 cursor-pointer shadow-sm w-full justify-center"
        >
          <Power className="h-3 w-3" />
          <span>Exit All</span>
          <span className="text-[9px] opacity-70 font-mono ml-1">Shift+Space</span>
        </Button>
      </div>

      {/* 3. PUT EXECUTION PAD (RIGHT) */}
      <div className="flex-1 w-full flex flex-col gap-2 p-2.5 bg-muted/20 border border-rose-500/20 rounded-lg">
        <div className="flex items-center justify-between">
          <ScalperStrikeDropdown
            optType="PE"
            underlyingSymbol={underlying.symbol}
            selectedStrike={selectedPutStrike}
            currentAtm={currentAtm}
            strikeRows={strikeRows}
            onSelectStrike={onSelectPutStrike}
          />

          <div className="text-right">
            <span className="text-[10px] text-muted-foreground mr-1">LTP:</span>
            <span className="font-mono text-xs font-bold text-rose-500">
              ₹{putLtp != null ? putLtp.toFixed(2) : '—'}
            </span>
          </div>
        </div>

        {/* Lots & Qty Controls */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 bg-background border border-border rounded-md p-0.5">
            <button
              type="button"
              disabled={putLots <= 1}
              onClick={() => onChangePutLots(Math.max(1, putLots - 1))}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted disabled:opacity-40 cursor-pointer"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="font-mono text-xs font-bold px-2 tabular-nums">
              {putLots} {putLots === 1 ? 'Lot' : 'Lots'}
            </span>
            <button
              type="button"
              disabled={putLots >= 50}
              onClick={() => onChangePutLots(putLots + 1)}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted disabled:opacity-40 cursor-pointer"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          <div className="text-[11px] text-muted-foreground font-mono">
            <strong>{putQty}</strong> Qty · Est: ₹{putTotalValue}
          </div>
        </div>

        {/* Buy & Sell Put Buttons */}
        <div className="grid grid-cols-2 gap-2 mt-0.5">
          <Button
            size="default"
            disabled={loading}
            onClick={onBuyPut}
            className="h-10 font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex flex-col justify-center leading-none cursor-pointer shadow-sm"
          >
            <span className="text-sm">Buy Put</span>
            <span className="text-[9px] opacity-75 font-mono">Shift + →</span>
          </Button>
          <Button
            size="default"
            variant="outline"
            disabled={loading}
            onClick={onSellPut}
            className="h-10 font-bold text-rose-500 border-rose-500/40 hover:bg-rose-500/10 flex flex-col justify-center leading-none cursor-pointer"
          >
            <span className="text-sm">Sell Put</span>
            <span className="text-[9px] opacity-75 font-mono">Order</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
