import { ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { StrikeOffset } from '@/types/scalper'
import type { OptionChainRow } from '@/types/scalping'

interface Props {
  optType: 'CE' | 'PE'
  underlyingSymbol: string
  selectedStrike: number | null
  currentAtm: number | null
  strikeRows: OptionChainRow[]
  onSelectStrike: (strike: number) => void
  disabled?: boolean
}

export function ScalperStrikeDropdown({
  optType,
  underlyingSymbol,
  selectedStrike,
  currentAtm,
  strikeRows,
  onSelectStrike,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false)

  // Compute offset label for the currently selected strike
  const currentOffsetLabel = useMemo<string>(() => {
    if (selectedStrike == null || currentAtm == null || strikeRows.length === 0)
      return 'ATM'
    const diff = selectedStrike - currentAtm
    if (diff === 0) return 'ATM'

    const sortedStrikes = Array.from(new Set(strikeRows.map((r) => r.strike))).sort(
      (a, b) => a - b
    )
    const atmIndex = sortedStrikes.indexOf(currentAtm)
    const curIndex = sortedStrikes.indexOf(selectedStrike)

    if (atmIndex === -1 || curIndex === -1) return `${selectedStrike}`
    const steps = curIndex - atmIndex

    if (optType === 'CE') {
      if (steps > 0) return `OTM ${steps}`
      return `ITM ${Math.abs(steps)}`
    } else {
      if (steps < 0) return `OTM ${Math.abs(steps)}`
      return `ITM ${steps}`
    }
  }, [selectedStrike, currentAtm, strikeRows, optType])

  // Quick 5 offsets: ITM2, ITM1, ATM, OTM1, OTM2
  const quickOffsets = useMemo(() => {
    if (currentAtm == null || strikeRows.length === 0) return []
    const sortedStrikes = Array.from(new Set(strikeRows.map((r) => r.strike))).sort(
      (a, b) => a - b
    )
    const atmIndex = sortedStrikes.indexOf(currentAtm)
    if (atmIndex === -1) return []

    const items: Array<{ offset: StrikeOffset; strike: number }> = []

    if (optType === 'CE') {
      if (atmIndex >= 2) items.push({ offset: 'ITM 2', strike: sortedStrikes[atmIndex - 2] })
      if (atmIndex >= 1) items.push({ offset: 'ITM 1', strike: sortedStrikes[atmIndex - 1] })
      items.push({ offset: 'ATM', strike: currentAtm })
      if (atmIndex + 1 < sortedStrikes.length)
        items.push({ offset: 'OTM 1', strike: sortedStrikes[atmIndex + 1] })
      if (atmIndex + 2 < sortedStrikes.length)
        items.push({ offset: 'OTM 2', strike: sortedStrikes[atmIndex + 2] })
    } else {
      if (atmIndex + 2 < sortedStrikes.length)
        items.push({ offset: 'ITM 2', strike: sortedStrikes[atmIndex + 2] })
      if (atmIndex + 1 < sortedStrikes.length)
        items.push({ offset: 'ITM 1', strike: sortedStrikes[atmIndex + 1] })
      items.push({ offset: 'ATM', strike: currentAtm })
      if (atmIndex >= 1) items.push({ offset: 'OTM 1', strike: sortedStrikes[atmIndex - 1] })
      if (atmIndex >= 2) items.push({ offset: 'OTM 2', strike: sortedStrikes[atmIndex - 2] })
    }

    return items
  }, [currentAtm, strikeRows, optType])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || strikeRows.length === 0}
          className="flex items-center justify-between gap-2 h-9 px-3 bg-muted/20 border-border font-mono text-xs w-full max-w-[200px]"
        >
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-bold text-foreground">
              {selectedStrike ?? currentAtm ?? '—'}
            </span>
            <span className={cn('text-[10px] font-semibold px-1 py-0.2 rounded', optType === 'CE' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-500')}>
              {optType === 'CE' ? 'CALL' : 'PUT'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {currentOffsetLabel}
            </span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-2" align="start">
        <div className="text-[11px] font-semibold text-muted-foreground px-2 py-1">
          Quick Select ({underlyingSymbol} {optType})
        </div>

        {/* 5 Quick Offset Pills */}
        <div className="grid grid-cols-5 gap-1 mb-2 p-1 bg-muted/40 rounded">
          {quickOffsets.map(({ offset, strike }) => {
            const isSel = strike === selectedStrike
            return (
              <button
                key={offset}
                type="button"
                onClick={() => {
                  onSelectStrike(strike)
                  setOpen(false)
                }}
                className={cn(
                  'flex flex-col items-center justify-center p-1 rounded text-[10px] transition cursor-pointer',
                  isSel
                    ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                    : 'hover:bg-muted text-muted-foreground'
                )}
              >
                <span>{offset}</span>
                <span className="font-mono text-[9px] opacity-80">{strike}</span>
              </button>
            )
          })}
        </div>

        {/* Scrollable full strike list */}
        <div className="text-[10px] text-muted-foreground font-medium px-2 pb-1 border-b border-border/40">
          All Available Strikes
        </div>
        <div className="max-h-48 overflow-y-auto divide-y divide-border/20 mt-1">
          {strikeRows.map((r) => {
            const isAtm = r.strike === currentAtm
            const isSel = r.strike === selectedStrike
            return (
              <button
                key={r.strike}
                type="button"
                onClick={() => {
                  onSelectStrike(r.strike)
                  setOpen(false)
                }}
                className={cn(
                  'w-full flex items-center justify-between px-2.5 py-1.5 text-xs hover:bg-muted/50 rounded transition text-left cursor-pointer',
                  isSel && 'bg-primary/10 font-bold text-primary',
                  isAtm && !isSel && 'bg-muted/30 font-medium'
                )}
              >
                <div className="flex items-center gap-1.5 font-mono">
                  <span>{r.strike}</span>
                  {isAtm && (
                    <span className="text-[9px] px-1 bg-primary/20 text-primary rounded font-sans">
                      ATM
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {optType === 'CE' ? r.ce?.symbol : r.pe?.symbol}
                </span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
