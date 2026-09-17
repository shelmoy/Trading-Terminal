import { ChevronDown, Search, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLivePrice } from '@/hooks/useLivePrice'
import { cn } from '@/lib/utils'
import {
  SCALPER_UNDERLYINGS,
  type ScalperCategory,
  type ScalperUnderlying,
} from '@/types/scalper'

interface Props {
  activeUnderlying: ScalperUnderlying
  onSelectUnderlying: (underlying: ScalperUnderlying) => void
}

export function ScalperHeader({ activeUnderlying, onSelectUnderlying }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [filterTab, setFilterTab] = useState<'ALL' | ScalperCategory>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Priceable list for the top ticker strip
  const tickerItems = useMemo(
    () =>
      SCALPER_UNDERLYINGS.map((u) => ({
        symbol: u.symbol,
        exchange: u.exchange,
      })),
    []
  )

  const { data: quoteMap } = useLivePrice(tickerItems, {
    enabled: true,
    useMultiQuotesFallback: true,
    multiQuotesRefreshInterval: 5000,
    pauseWhenHidden: true,
  })

  // Filtered items in asset picker dialog
  const filteredUnderlyings = useMemo(() => {
    const q = searchQuery.trim().toUpperCase()
    return SCALPER_UNDERLYINGS.filter((u) => {
      const matchCat = filterTab === 'ALL' || u.category === filterTab
      const matchQuery =
        !q || u.symbol.includes(q) || u.name.toUpperCase().includes(q)
      return matchCat && matchQuery
    })
  }, [filterTab, searchQuery])

  return (
    <div className="flex flex-col border-b border-border bg-card/60 backdrop-blur">
      {/* Top Benchmarks Ticker Bar */}
      <div className="flex items-center gap-1 overflow-x-auto px-3 py-1.5 scrollbar-none border-b border-border/40 text-xs select-none">
        {SCALPER_UNDERLYINGS.map((item) => {
          const key = `${item.exchange}:${item.symbol}`
          const quote = (quoteMap as Record<string, any>)?.[key]
          const ltp = quote?.ltp ?? null
          const chg = quote?.change ?? 0
          const chgPct = quote?.changePercent ?? 0
          const isUp = chg >= 0
          const isActive = item.symbol === activeUnderlying.symbol

          return (
            <button
              type="button"
              key={item.symbol}
              onClick={() => onSelectUnderlying(item)}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 transition-colors hover:bg-muted/70 cursor-pointer',
                isActive
                  ? 'bg-primary/15 border border-primary/40 font-semibold'
                  : 'bg-muted/30 border border-transparent'
              )}
            >
              <span className="text-muted-foreground font-medium">{item.name}</span>
              <span className="font-mono tabular-nums">
                {ltp != null ? ltp.toFixed(item.decimals) : '—'}
              </span>
              {chgPct !== 0 && (
                <span
                  className={cn(
                    'flex items-center text-[10px] tabular-nums',
                    isUp ? 'text-emerald-500' : 'text-rose-500'
                  )}
                >
                  {isUp ? (
                    <TrendingUp className="mr-0.5 h-2.5 w-2.5 inline" />
                  ) : (
                    <TrendingDown className="mr-0.5 h-2.5 w-2.5 inline" />
                  )}
                  {isUp ? '+' : ''}
                  {chgPct.toFixed(2)}%
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Asset Selection Bar */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 h-8 px-3 font-semibold bg-background"
          >
            <span className="text-primary font-bold">{activeUnderlying.symbol}</span>
            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
              {activeUnderlying.category === 'INDICES' ? 'INDEX' : 'COMMODITY'}
            </Badge>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-1" />
          </Button>

          <span className="text-xs text-muted-foreground hidden sm:inline">
            Spot Exchange: <strong className="text-foreground">{activeUnderlying.exchange}</strong> · Options: <strong className="text-foreground">{activeUnderlying.foExchange}</strong> · Lot: <strong className="text-foreground">{activeUnderlying.lotSize}</strong>
          </span>
        </div>
      </div>

      {/* Asset Picker Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 border-b border-border">
            <DialogTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              Select Underlying Asset
            </DialogTitle>
            <div className="mt-2">
              <Input
                placeholder="Search symbol (e.g. NIFTY, CRUDEOIL)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 text-xs"
                autoFocus
              />
            </div>
            <Tabs
              value={filterTab}
              onValueChange={(v) => setFilterTab(v as any)}
              className="mt-2"
            >
              <TabsList className="grid grid-cols-3 h-8 text-xs">
                <TabsTrigger value="ALL">ALL</TabsTrigger>
                <TabsTrigger value="INDICES">EQUITY F&O</TabsTrigger>
                <TabsTrigger value="COMMODITIES">COMMODITIES</TabsTrigger>
              </TabsList>
            </Tabs>
          </DialogHeader>

          <div className="max-h-72 overflow-y-auto p-2 divide-y divide-border/30">
            {filteredUnderlyings.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No matching underlying found
              </div>
            ) : (
              filteredUnderlyings.map((item) => {
                const key = `${item.exchange}:${item.symbol}`
                const q = (quoteMap as Record<string, any>)?.[key]
                const ltp = q?.ltp ?? null
                const chgPct = q?.changePercent ?? 0
                const isUp = chgPct >= 0
                const isCurrent = item.symbol === activeUnderlying.symbol

                return (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => {
                      onSelectUnderlying(item)
                      setModalOpen(false)
                    }}
                    className={cn(
                      'w-full flex items-center justify-between p-2.5 rounded hover:bg-muted/60 transition text-left cursor-pointer',
                      isCurrent && 'bg-primary/10'
                    )}
                  >
                    <div>
                      <div className="font-semibold text-xs text-foreground flex items-center gap-2">
                        {item.symbol}
                        <span className="text-[10px] text-muted-foreground font-normal">
                          {item.name}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {item.exchange} · Step: {item.strikeStep} · Lot: {item.lotSize}
                      </div>
                    </div>

                    <div className="text-right tabular-nums">
                      <div className="text-xs font-mono font-medium">
                        {ltp != null ? ltp.toFixed(item.decimals) : '—'}
                      </div>
                      {chgPct !== 0 && (
                        <div
                          className={cn(
                            'text-[10px]',
                            isUp ? 'text-emerald-500' : 'text-rose-500'
                          )}
                        >
                          {isUp ? '+' : ''}
                          {chgPct.toFixed(2)}%
                        </div>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
