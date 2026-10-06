import { ArrowUpRight, Check, ChevronsUpDown, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export interface StrikeChoice {
  strike: number
  symbol: string
  price?: number
  openInterest?: number
  label?: string
  direction?: 'up' | 'down'
  exists?: boolean
}

interface Props {
  side: 'CE' | 'PE'
  choices: StrikeChoice[]
  value: string
  atmStrike: number | null
  expiry: string
  open: boolean
  loading: boolean
  streaming: boolean
  marketOpen: boolean
  onOpenChange(open: boolean): void
  onSelect(strike: string): void
  onRefresh(): void
  onFullChain(): void
}

const rupees = (price?: number) => typeof price === 'number' && Number.isFinite(price) && price > 0
  ? `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : '—'

export function ScalperStrikePicker({ side, choices, value, atmStrike, expiry, open, loading,
  streaming, marketOpen, onOpenChange, onSelect, onRefresh, onFullChain }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const centredRef = useRef(false)
  const rows = useMemo(() => [...choices].filter((row) => row.symbol && row.exists !== false)
    .sort((a, b) => a.strike - b.strike), [choices])
  const atmIndex = useMemo(() => {
    if (atmStrike == null || !rows.length) return -1
    return rows.findIndex((row) => row.strike === atmStrike)
  }, [rows, atmStrike])
  const selectedIndex = rows.findIndex((row) => String(row.strike) === value)
  const selected = rows[selectedIndex]
  const peakOi = useMemo(() => rows.reduce((peak, row) => {
    const oi = row.openInterest
    return typeof oi === 'number' && Number.isFinite(oi) && oi > peak ? oi : peak
  }, 0), [rows])
  const label = (index: number) => {
    if (rows[index]?.label) return rows[index].label!.replace(/(ITM|OTM)(\d+)/, '$1 $2')
    if (atmIndex < 0) return '—'
    const distance = (index - atmIndex) * (side === 'CE' ? 1 : -1)
    return distance === 0 ? 'ATM' : `${distance > 0 ? 'OTM' : 'ITM'} ${Math.abs(distance)}`
  }
  const choose = (row?: StrikeChoice) => {
    if (!row) return
    onSelect(String(row.strike))
    onOpenChange(false)
  }
  useEffect(() => {
    if (!open) { centredRef.current = false; return }
    if (centredRef.current || !rows.length) return
    const frame = requestAnimationFrame(() => {
      const target = listRef.current?.querySelector<HTMLElement>('[data-selected="true"]')
        ?? listRef.current?.querySelector<HTMLElement>('[data-atm="true"]')
      target?.scrollIntoView({ block: 'center', behavior: 'instant' })
      target?.focus({ preventScroll: true })
      centredRef.current = true
    })
    return () => cancelAnimationFrame(frame)
  }, [open, rows.length])

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="scalper-strike-trigger" data-option-side={side}
          aria-label={`Select ${side === 'CE' ? 'call' : 'put'} strike`} title="Choose a strike or use Quick select">
          <span className="scalper-option-dot" />
          <span className="scalper-strike-contract">{value || 'Select strike'} {side === 'CE' ? 'CALL' : 'PUT'}</span>
          <span className="scalper-strike-moneyness">{selectedIndex >= 0 ? label(selectedIndex) : '—'}</span>
          <span className={cn('scalper-strike-price', selected?.direction && `scalper-tick-${selected.direction}`)}>{rupees(selected?.price)}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align={side === 'CE' ? 'start' : 'end'} sideOffset={10}
          collisionPadding={12} className="scalper-strike-menu" data-option-side={side}>
        <div className="scalper-strike-menu-heading">
          <div className="flex min-w-0 items-center gap-2">
            <span className="scalper-option-dot" />
            <span className="font-semibold">{side === 'CE' ? 'Call options' : 'Put options'}</span>
            <span className="scalper-strike-expiry">{expiry || 'Select expiry'}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={onRefresh} aria-label="Refresh strike prices" className="scalper-menu-icon">
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </button>
            <button type="button" aria-label="Open full option chain" title="Full option chain"
              onClick={() => { onOpenChange(false); onFullChain() }} className="scalper-menu-icon">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="scalper-strike-column-labels" aria-hidden="true">
          <span>Position</span><span>Strike <i /> OI</span><span>Price</span>
        </div>
        <div ref={listRef} className="scalper-strike-list">
          {!rows.length ? <div className="scalper-strike-empty">
            {loading ? 'Loading strikes…' : 'No strikes available for this expiry'}
          </div> : rows.map((row, index) => {
            const oi = typeof row.openInterest === 'number' && Number.isFinite(row.openInterest)
              ? Math.max(0, row.openInterest) : 0
            const oiPercent = peakOi > 0 ? Math.min(100, oi / peakOi * 100) : 0
            return <DropdownMenuItem key={row.symbol} onSelect={() => choose(row)}
              className="scalper-strike-row" data-selected={String(row.strike) === value ? 'true' : undefined}
              data-atm={index === atmIndex ? 'true' : undefined}
              aria-current={String(row.strike) === value ? 'true' : undefined}>
              <span className="scalper-strike-moneyness">{label(index)}</span>
              <span className="scalper-strike-details">
                <span className="scalper-strike-row-contract">{row.strike} {side === 'CE' ? 'CALL' : 'PUT'}
                  {String(row.strike) === value && <Check className="h-3 w-3 opacity-75" />}
                </span>
                <span className="scalper-strike-oi" role="img" title={oi > 0 ? 'Open interest relative to the highest OI in this chain' : 'No open interest reported'}
                  aria-label={oi > 0 ? `Open interest: ${Math.round(oiPercent)}% of the highest ${side === 'CE' ? 'call' : 'put'} OI in this chain` : 'No open interest reported'}>
                  <span style={{ width: `${oiPercent}%` }} />
                </span>
              </span>
              <span className={cn('scalper-strike-price', row.direction && `scalper-tick-${row.direction}`)}>{rupees(row.price)}</span>
            </DropdownMenuItem>
          })}
        </div>
        <div className="scalper-quick-select">
          <span className="scalper-quick-label">Quick select</span>
          {(['OTM 1', 'ATM', 'ITM 1'] as const).map((name) => {
            const row = atmIndex >= 0 ? rows.find((_row, index) => label(index) === name) : undefined
            return <DropdownMenuItem key={name} disabled={!row} onSelect={() => choose(row)}
              aria-label={`Quick select ${name} ${side === 'CE' ? 'call' : 'put'}`}
              className="scalper-quick-chip" data-active={row && String(row.strike) === value ? 'true' : undefined}>
              {name}
            </DropdownMenuItem>
          })}
        </div>
        <div className="scalper-strike-menu-note">
          <span className={cn('h-1 w-1 rounded-full', streaming && marketOpen ? 'bg-emerald-400' : 'bg-muted-foreground/50')} />
          {streaming && marketOpen ? 'Live market prices' : 'Last available market prices'}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
