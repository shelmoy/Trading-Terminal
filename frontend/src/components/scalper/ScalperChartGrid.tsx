import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { ScalperUnderlying, ScalperViewMode } from '@/types/scalper'
import { ScalperChartPane } from './ScalperChartPane'

interface Props {
  underlying: ScalperUnderlying
  spotSymbol: string
  callSymbol: string
  callExchange: string
  putSymbol: string
  putExchange: string
  selectedCallStrike: number | null
  selectedPutStrike: number | null
  expiry: string
  viewMode: ScalperViewMode
  onChangeViewMode: (mode: ScalperViewMode) => void
  timeframe: string
  onChangeTimeframe: (tf: string) => void
  showSupertrend: boolean
  onToggleSupertrend: () => void
  onQuickBuyCall: () => void
  onQuickSellCall: () => void
  onQuickBuyPut: () => void
  onQuickSellPut: () => void
}

export function ScalperChartGrid({
  underlying,
  spotSymbol,
  callSymbol,
  callExchange,
  putSymbol,
  putExchange,
  selectedCallStrike,
  selectedPutStrike,
  expiry,
  viewMode,
  onChangeViewMode,
  timeframe,
  onChangeTimeframe,
  showSupertrend,
  onToggleSupertrend,
  onQuickBuyCall,
  onQuickSellCall,
  onQuickBuyPut,
  onQuickSellPut,
}: Props) {
  const callTitle = `${underlying.symbol} ${expiry} ${selectedCallStrike ?? ''} CE`
  const spotTitle = `${underlying.name} Spot (${underlying.exchange})`
  const putTitle = `${underlying.symbol} ${expiry} ${selectedPutStrike ?? ''} PE`

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden p-2 gap-2">
      {/* Sub-toolbar: Timeframe, Indicators, Layout Toggles (915 style) */}
      <div className="flex items-center justify-between px-2 py-1 bg-card/60 border border-border/60 rounded-md text-xs">
        <div className="flex items-center gap-3">
          {/* Timeframe Selector */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground mr-1">Timeframe:</span>
            {(['1m', '3m', '5m', '15m'] as const).map((tf) => (
              <Button
                key={tf}
                variant={timeframe === tf ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => onChangeTimeframe(tf)}
                className="h-6 px-2 text-[11px] font-mono cursor-pointer"
              >
                {tf}
              </Button>
            ))}
          </div>

          <div className="h-4 w-[1px] bg-border" />

          {/* SuperTrend Toggle */}
          <Button
            variant={showSupertrend ? 'secondary' : 'ghost'}
            size="sm"
            onClick={onToggleSupertrend}
            className="h-6 px-2 text-[11px] flex items-center gap-1 cursor-pointer"
          >
            <SlidersHorizontal className="h-3 w-3" />
            <span>SuperTrend</span>
          </Button>
        </div>

        {/* View Layout Tabs: CALL, SPOT, PUT, ALL 3 */}
        <div className="flex items-center gap-1">
          <Tabs
            value={viewMode}
            onValueChange={(v) => onChangeViewMode(v as ScalperViewMode)}
          >
            <TabsList className="h-7 bg-muted/60 p-0.5 text-xs">
              <TabsTrigger value="ALL_3" className="h-6 px-2 text-[11px]">
                3-Split
              </TabsTrigger>
              <TabsTrigger value="CALL" className="h-6 px-2 text-[11px] text-emerald-500">
                CALL
              </TabsTrigger>
              <TabsTrigger value="SPOT" className="h-6 px-2 text-[11px] text-sky-500">
                SPOT
              </TabsTrigger>
              <TabsTrigger value="PUT" className="h-6 px-2 text-[11px] text-rose-500">
                PUT
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* 3-Section Charts Grid */}
      <div className="flex-1 min-h-0 w-full grid gap-2 grid-cols-1 md:grid-cols-3">
        {/* Left: CALL Option Chart */}
        {(viewMode === 'ALL_3' || viewMode === 'CALL') && (
          <div
            className={cn(
              'h-full min-h-0',
              viewMode === 'CALL' ? 'col-span-3' : 'col-span-1'
            )}
          >
            <ScalperChartPane
              symbol={callSymbol}
              exchange={callExchange}
              interval={timeframe}
              title={callTitle}
              badgeText="CALL"
              badgeVariant="call"
              showBuySellButtons={true}
              onQuickBuy={onQuickBuyCall}
              onQuickSell={onQuickSellCall}
              showSupertrend={showSupertrend}
            />
          </div>
        )}

        {/* Center: SPOT Index / Future Chart */}
        {(viewMode === 'ALL_3' || viewMode === 'SPOT') && (
          <div
            className={cn(
              'h-full min-h-0',
              viewMode === 'SPOT' ? 'col-span-3' : 'col-span-1'
            )}
          >
            <ScalperChartPane
              symbol={spotSymbol}
              exchange={underlying.exchange}
              interval={timeframe}
              title={spotTitle}
              badgeText="SPOT"
              badgeVariant="spot"
              showBuySellButtons={false}
              showSupertrend={showSupertrend}
            />
          </div>
        )}

        {/* Right: PUT Option Chart */}
        {(viewMode === 'ALL_3' || viewMode === 'PUT') && (
          <div
            className={cn(
              'h-full min-h-0',
              viewMode === 'PUT' ? 'col-span-3' : 'col-span-1'
            )}
          >
            <ScalperChartPane
              symbol={putSymbol}
              exchange={putExchange}
              interval={timeframe}
              title={putTitle}
              badgeText="PUT"
              badgeVariant="put"
              showBuySellButtons={true}
              onQuickBuy={onQuickBuyPut}
              onQuickSell={onQuickSellPut}
              showSupertrend={showSupertrend}
            />
          </div>
        )}
      </div>
    </div>
  )
}
