import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { OptionChainRow } from '@/types/scalping'
import type { Order, Position } from '@/types/trading'

interface Props {
  positions: Position[]
  orders: Order[]
  strikeRows: OptionChainRow[]
  currentAtm: number | null
  onSquareOffPosition?: (pos: Position) => void
  onCancelOrder?: (orderId: string) => void
  onRefresh?: () => void
  loading?: boolean
}

type SegmentFilter = 'ALL' | 'EQUITY' | 'COMMODITY'
type DrawerSize = 'collapsed' | 'normal' | 'maximized'

function isCommodityItem(item: { exchange?: string; symbol?: string }): boolean {
  const ex = (item.exchange || '').toUpperCase()
  const sym = (item.symbol || '').toUpperCase()
  return (
    ex === 'MCX' ||
    sym.startsWith('CRUDE') ||
    sym.startsWith('GOLD') ||
    sym.startsWith('SILVER') ||
    sym.startsWith('NATURAL') ||
    sym.startsWith('COPPER') ||
    sym.startsWith('ZINC')
  )
}

export function ScalperBottomTabs({
  positions,
  orders,
  strikeRows,
  currentAtm,
  onSquareOffPosition,
  onCancelOrder,
  onRefresh,
  loading = false,
}: Props) {
  const [size, setSize] = useState<DrawerSize>('normal')
  const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'oi'>('positions')
  const [posFilter, setPosFilter] = useState<SegmentFilter>('ALL')
  const [orderFilter, setOrderFilter] = useState<SegmentFilter>('ALL')

  // Filtered positions
  const { equityPositions, commodityPositions, filteredPositions } = useMemo(() => {
    const eq = positions.filter((p) => !isCommodityItem(p))
    const comm = positions.filter((p) => isCommodityItem(p))
    let filtered = positions
    if (posFilter === 'EQUITY') filtered = eq
    else if (posFilter === 'COMMODITY') filtered = comm
    return { equityPositions: eq, commodityPositions: comm, filteredPositions: filtered }
  }, [positions, posFilter])

  // Filtered orders
  const { equityOrders, commodityOrders, filteredOrders } = useMemo(() => {
    const eq = orders.filter((o) => !isCommodityItem(o))
    const comm = orders.filter((o) => isCommodityItem(o))
    let filtered = orders
    if (orderFilter === 'EQUITY') filtered = eq
    else if (orderFilter === 'COMMODITY') filtered = comm
    return { equityOrders: eq, commodityOrders: comm, filteredOrders: filtered }
  }, [orders, orderFilter])

  const isCollapsed = size === 'collapsed'
  const isMaximized = size === 'maximized'

  return (
    <div
      className={cn(
        'flex flex-col border-t border-border bg-card/95 text-xs transition-all duration-200 select-none shrink-0',
        isCollapsed && 'h-9',
        size === 'normal' && 'h-52',
        isMaximized && 'h-[50vh]'
      )}
    >
      {/* Drawer Header Toolbar */}
      <div className="flex items-center justify-between px-3 py-1 bg-muted/40 border-b border-border/50 select-none shrink-0 h-9">
        <div className="flex items-center gap-3">
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              setActiveTab(v as any)
              if (size === 'collapsed') setSize('normal')
            }}
          >
            <TabsList className="h-6 bg-muted/60 p-0 text-[11px]">
              <TabsTrigger value="positions" className="h-5 px-2.5">
                Positions ({positions.length})
              </TabsTrigger>
              <TabsTrigger value="orders" className="h-5 px-2.5">
                Orders ({orders.length})
              </TabsTrigger>
              <TabsTrigger value="oi" className="h-5 px-2.5">
                Open Interest
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Sub-segment pills for Positions */}
          {!isCollapsed && activeTab === 'positions' && (
            <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-border/50 text-[10px]">
              <button
                type="button"
                onClick={() => setPosFilter('ALL')}
                className={cn(
                  'px-1.5 py-0.5 rounded transition-colors',
                  posFilter === 'ALL'
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                All ({positions.length})
              </button>
              <button
                type="button"
                onClick={() => setPosFilter('EQUITY')}
                className={cn(
                  'px-1.5 py-0.5 rounded transition-colors',
                  posFilter === 'EQUITY'
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                Equity F&O ({equityPositions.length})
              </button>
              <button
                type="button"
                onClick={() => setPosFilter('COMMODITY')}
                className={cn(
                  'px-1.5 py-0.5 rounded transition-colors',
                  posFilter === 'COMMODITY'
                    ? 'bg-amber-500 text-white font-semibold'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                Commodities ({commodityPositions.length})
              </button>
            </div>
          )}

          {/* Sub-segment pills for Orders */}
          {!isCollapsed && activeTab === 'orders' && (
            <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-border/50 text-[10px]">
              <button
                type="button"
                onClick={() => setOrderFilter('ALL')}
                className={cn(
                  'px-1.5 py-0.5 rounded transition-colors',
                  orderFilter === 'ALL'
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                All ({orders.length})
              </button>
              <button
                type="button"
                onClick={() => setOrderFilter('EQUITY')}
                className={cn(
                  'px-1.5 py-0.5 rounded transition-colors',
                  orderFilter === 'EQUITY'
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                Equity F&O ({equityOrders.length})
              </button>
              <button
                type="button"
                onClick={() => setOrderFilter('COMMODITY')}
                className={cn(
                  'px-1.5 py-0.5 rounded transition-colors',
                  orderFilter === 'COMMODITY'
                    ? 'bg-amber-500 text-white font-semibold'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                Commodities ({commodityOrders.length})
              </button>
            </div>
          )}
        </div>

        {/* Window controls (Refresh, Maximize, Minimize / Collapse) */}
        <div className="flex items-center gap-1">
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="h-6 w-6 p-0"
              title="Refresh book"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          )}

          {/* Maximize / Restore Toggle */}
          {!isCollapsed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSize(isMaximized ? 'normal' : 'maximized')}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              title={isMaximized ? 'Restore normal height' : 'Maximize panel'}
            >
              {isMaximized ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </Button>
          )}

          {/* Collapse / Expand Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSize(isCollapsed ? 'normal' : 'collapsed')}
            className="h-6 px-1.5 text-[10px] flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
            title={isCollapsed ? 'Expand panel' : 'Minimize to bottom bar'}
          >
            {isCollapsed ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>Expand</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>Minimize</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Drawer Scrollable Body */}
      {!isCollapsed && (
        <div className="flex-1 min-h-0 overflow-y-auto p-2">
          {/* 1. POSITIONS TAB */}
          {activeTab === 'positions' && (
            filteredPositions.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs">
                {positions.length === 0
                  ? 'No open scalping positions'
                  : `No ${posFilter === 'EQUITY' ? 'Equity F&O' : 'Commodity'} positions found`}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="text-[10px] text-muted-foreground border-b border-border/40">
                    <TableHead className="h-6">Symbol</TableHead>
                    <TableHead className="h-6">Product</TableHead>
                    <TableHead className="h-6 text-right">Qty</TableHead>
                    <TableHead className="h-6 text-right">Avg Price</TableHead>
                    <TableHead className="h-6 text-right">LTP</TableHead>
                    <TableHead className="h-6 text-right">P&L</TableHead>
                    <TableHead className="h-6 text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPositions.map((p) => {
                    const isProfit = (p.pnl ?? 0) >= 0
                    const isLong = (p.quantity ?? 0) > 0
                    const isComm = isCommodityItem(p)
                    return (
                      <TableRow
                        key={`${p.exchange}:${p.symbol}:${p.product}`}
                        className="text-xs font-mono border-b border-border/20 hover:bg-muted/30"
                      >
                        <TableCell className="font-semibold py-1">
                          <span className="flex items-center gap-1.5">
                            {p.symbol}
                            {isComm && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-500 border-amber-500/30">
                                MCX
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="py-1">
                          <span
                            className={cn(
                              'px-1 py-0.5 rounded text-[10px] font-bold',
                              isLong
                                ? 'bg-emerald-500/15 text-emerald-500'
                                : 'bg-rose-500/15 text-rose-500'
                            )}
                          >
                            {isLong ? 'BUY' : 'SELL'} ({p.product})
                          </span>
                        </TableCell>
                        <TableCell className="text-right py-1 font-bold">{p.quantity}</TableCell>
                        <TableCell className="text-right py-1">₹{Number(p.average_price ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right py-1">₹{Number(p.ltp ?? 0).toFixed(2)}</TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-bold py-1',
                            isProfit ? 'text-emerald-500' : 'text-rose-500'
                          )}
                        >
                          {isProfit ? '+' : ''}₹{Number(p.pnl ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center py-1">
                          {onSquareOffPosition && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onSquareOffPosition(p)}
                              className="h-5 px-2 text-[10px] font-semibold text-rose-500 hover:bg-rose-500/15 cursor-pointer rounded"
                            >
                              Exit
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )
          )}

          {/* 2. ORDERS TAB */}
          {activeTab === 'orders' && (
            filteredOrders.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs">
                {orders.length === 0
                  ? 'No orders placed today'
                  : `No ${orderFilter === 'EQUITY' ? 'Equity F&O' : 'Commodity'} orders found`}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="text-[10px] text-muted-foreground border-b border-border/40">
                    <TableHead className="h-6">Order ID</TableHead>
                    <TableHead className="h-6">Symbol</TableHead>
                    <TableHead className="h-6">Action</TableHead>
                    <TableHead className="h-6 text-right">Qty</TableHead>
                    <TableHead className="h-6 text-right">Price</TableHead>
                    <TableHead className="h-6 text-center">Status</TableHead>
                    <TableHead className="h-6 text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((o) => {
                    const isComm = isCommodityItem(o)
                    return (
                      <TableRow
                        key={o.orderid}
                        className="text-xs font-mono border-b border-border/20 hover:bg-muted/30"
                      >
                        <TableCell className="py-1 text-muted-foreground">{o.orderid}</TableCell>
                        <TableCell className="font-semibold py-1">
                          <span className="flex items-center gap-1.5">
                            {o.symbol}
                            {isComm && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-500 border-amber-500/30">
                                MCX
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="py-1">
                          <span
                            className={cn(
                              'px-1 py-0.5 rounded text-[10px] font-bold',
                              o.action === 'BUY'
                                ? 'bg-emerald-500/15 text-emerald-500'
                                : 'bg-rose-500/15 text-rose-500'
                            )}
                          >
                            {o.action}
                          </span>
                        </TableCell>
                        <TableCell className="text-right py-1 font-bold">{o.quantity}</TableCell>
                        <TableCell className="text-right py-1">₹{o.price ? Number(o.price).toFixed(2) : 'MKT'}</TableCell>
                        <TableCell className="text-center py-1">
                          <span
                            className={cn(
                              'text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase',
                              String(o.order_status).toUpperCase().includes('COMPLETE') ||
                                String(o.order_status).toUpperCase().includes('TRADED')
                                ? 'bg-emerald-500/20 text-emerald-500'
                                : String(o.order_status).toUpperCase().includes('REJECT') ||
                                    String(o.order_status).toUpperCase().includes('CANCEL')
                                  ? 'bg-rose-500/20 text-rose-500'
                                  : 'bg-amber-500/20 text-amber-500'
                            )}
                          >
                            {o.order_status}
                          </span>
                        </TableCell>
                        <TableCell className="text-center py-1">
                          {onCancelOrder &&
                            (String(o.order_status).toLowerCase().includes('open') ||
                              String(o.order_status).toLowerCase().includes('pending')) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onCancelOrder(o.orderid)}
                                className="h-5 px-1.5 text-[10px] text-rose-500 hover:bg-rose-500/15 cursor-pointer rounded"
                              >
                                <XCircle className="h-3 w-3 mr-0.5" />
                                Cancel
                              </Button>
                            )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )
          )}

          {/* 3. OPEN INTEREST TAB */}
          {activeTab === 'oi' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {strikeRows.slice(0, 12).map((r) => {
                const isAtm = r.strike === currentAtm
                return (
                  <div
                    key={r.strike}
                    className={cn(
                      'flex items-center justify-between p-2 rounded border border-border/40 text-xs font-mono',
                      isAtm && 'bg-primary/10 border-primary/50 ring-1 ring-primary/40'
                    )}
                  >
                    <div>
                      <span className="font-bold">{r.strike}</span>
                      {isAtm && <span className="text-[9px] ml-1 text-primary font-semibold">(ATM)</span>}
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-emerald-500 font-semibold">
                        CE: {r.ce?.symbol ? 'Active' : '—'}
                      </span>
                      <span className="text-rose-500 font-semibold">
                        PE: {r.pe?.symbol ? 'Active' : '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
