import {
  AlertTriangle,
  ArrowUpDown,
  ChartCandlestick,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Pause,
  Radio,
  RefreshCw,
  Settings2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { tradingApi } from '@/api/trading'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useLivePrice } from '@/hooks/useLivePrice'
import { useOrderEventRefresh } from '@/hooks/useOrderEventRefresh'
import { usePageVisibility } from '@/hooks/usePageVisibility'
import { useSupportedExchanges } from '@/hooks/useSupportedExchanges'
import { cn, makeFormatCurrency, sanitizeCSV } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { broadcastCrossTabEvent, onModeChange, useThemeStore } from '@/stores/themeStore'
import type { MarginData, Position } from '@/types/trading'
import { showToast } from '@/utils/toast'
import { EmptyState } from '@/components/ui/empty-state'

interface Props {
  positions?: Position[]
  onSquareOffPosition?: (pos: Position) => void
  onExitAll?: () => void
  onRefresh?: () => void
  loading?: boolean
  appMode?: 'live' | 'analyzer'
  marginData?: MarginData | null
}


const STORAGE_KEY = 'openalgo_scalper_positions_prefs'

type GroupingType = 'none' | 'underlying' | 'underlying_expiry'
type SortColumn = 0 | 3 | 4 | 6 | 7 | null
type SortDirection = 'asc' | 'desc'
type SegmentFilter = 'ALL' | 'EQUITY' | 'COMMODITY'

interface FilterState {
  product: string[]
  direction: string[]
  exchange: string[]
}

interface Preferences {
  grouping: GroupingType
  filters: FilterState
  segment?: SegmentFilter
}

export function isCommodityPosition(pos: Position): boolean {
  const ex = (pos.exchange || '').toUpperCase()
  const sym = (pos.symbol || '').toUpperCase()
  return (
    ex === 'MCX' ||
    ex === 'NCO' ||
    sym.startsWith('CRUDE') ||
    sym.startsWith('GOLD') ||
    sym.startsWith('SILVER') ||
    sym.startsWith('NATURAL') ||
    sym.startsWith('COPPER') ||
    sym.startsWith('ZINC') ||
    sym.startsWith('LEAD') ||
    sym.startsWith('ALUM') ||
    sym.startsWith('COTTON') ||
    sym.startsWith('MENTHA')
  )
}


function parseSymbol(symbol: string, exchange: string) {
  if (exchange === 'NSE' || exchange === 'BSE') {
    return { underlying: symbol, expiry: null, strike: null, optionType: null }
  }

  const futMatch = symbol.match(/^(.+?)(\d{1,2}[A-Z]{3}\d{2})FUT$/i)
  if (futMatch) {
    return { underlying: futMatch[1], expiry: futMatch[2], strike: null, optionType: 'FUT' }
  }

  const optMatch = symbol.match(/^(.+?)(\d{1,2}[A-Z]{3}\d{2})(\d+\.?\d*)(CE|PE)$/i)
  if (optMatch) {
    return {
      underlying: optMatch[1],
      expiry: optMatch[2],
      strike: optMatch[3],
      optionType: optMatch[4],
    }
  }

  return { underlying: symbol, expiry: null, strike: null, optionType: null }
}

function calculatePnlPercent(position: Position): number {
  const avgPrice = Number(position.average_price) || 0
  const qty = Number(position.quantity) || 0
  const pnl = Number(position.pnl) || 0

  // Use API-provided pnlpercent if available
  if (position.pnlpercent !== undefined && position.pnlpercent !== null) {
    return Number(position.pnlpercent) || 0
  }

  if (avgPrice === 0) return 0

  // For open positions with quantity, calculate based on investment
  if (qty !== 0) {
    const investment = Math.abs(avgPrice * qty)
    return investment > 0 ? (pnl / investment) * 100 : 0
  }

  // For closed positions (qty=0), return 0% like Zerodha
  // We cannot reliably calculate P&L% without knowing the original quantity
  // The P&L amount is still shown correctly from the API
  return 0
}

const EXCHANGE_COLORS: Record<string, string> = {
  NSE: 'bg-cyan-500/20 text-cyan-600 border-cyan-500/30',
  BSE: 'bg-slate-500/20 text-slate-600 border-slate-500/30',
  NFO: 'bg-purple-500/20 text-purple-600 border-purple-500/30',
  BFO: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
  MCX: 'bg-blue-500/20 text-blue-600 border-blue-500/30',
  NCO: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30',
  CDS: 'bg-teal-500/20 text-teal-600 border-teal-500/30',
  NSE_INDEX: 'bg-cyan-500/20 text-cyan-600 border-cyan-500/30',
  BSE_INDEX: 'bg-slate-500/20 text-slate-600 border-slate-500/30',
  GLOBAL_INDEX: 'bg-indigo-500/20 text-indigo-600 border-indigo-500/30',
}

const PRODUCT_COLORS: Record<string, string> = {
  CNC: 'bg-purple-500/20 text-purple-600 border-purple-500/30',
  MIS: 'bg-cyan-500/20 text-cyan-600 border-cyan-500/30',
  NRML: 'bg-slate-500/20 text-slate-600 border-slate-500/30',
}

export function ScalperPositionsView({
  positions: parentPositions,
  onSquareOffPosition,
  onExitAll,
  onRefresh,
  loading: parentLoading = false,
  appMode: propAppMode,
  marginData,
}: Props) {
  const { apiKey: storeApiKey, user } = useAuthStore()
  const { appMode: storeAppMode } = useThemeStore()
  const appMode = propAppMode || storeAppMode
  const { isCrypto } = useSupportedExchanges()
  const formatCurrency = useMemo(() => makeFormatCurrency(user?.broker), [user?.broker])
  const [internalPositions, setInternalPositions] = useState<Position[]>([])
  const [internalLoading, setInternalLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showStaleWarning, setShowStaleWarning] = useState(false)

  const positions = parentPositions !== undefined ? parentPositions : internalPositions
  const isLoading = parentPositions !== undefined ? parentLoading : internalLoading

  // Segment Filter: ALL | EQUITY | COMMODITY
  const [segment, setSegment] = useState<SegmentFilter>('ALL')

  // Page visibility tracking for resource optimization
  const { isVisible, wasHidden, timeSinceHidden } = usePageVisibility()
  const lastFetchRef = useRef<number>(Date.now())

  // Filter and grouping state
  const [grouping, setGrouping] = useState<GroupingType>('none')
  const [filters, setFilters] = useState<FilterState>({
    product: [],
    direction: [],
    exchange: [],
  })
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [sortColumn, setSortColumn] = useState<SortColumn>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Centralized real-time price hook with WebSocket + MultiQuotes fallback
  // Automatically pauses when tab is hidden
  const {
    data: enhancedPositions,
    isLive,
    isPaused,
  } = useLivePrice(positions, {
    enabled: positions.length > 0,
    useMultiQuotesFallback: true,
    staleThreshold: 5000,
    multiQuotesRefreshInterval: 30000,
    pauseWhenHidden: true,
  })

  // Load preferences from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const prefs: Preferences = JSON.parse(saved)
        if (prefs.grouping) setGrouping(prefs.grouping)
        if (prefs.segment) setSegment(prefs.segment)
        if (prefs.filters)
          setFilters({
            product: prefs.filters.product || [],
            direction: prefs.filters.direction || [],
            exchange: prefs.filters.exchange || [],
          })
      }
    } catch (_e) {}
  }, [])

  // Save preferences to localStorage
  const savePreferences = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ grouping, filters, segment }))
  }, [grouping, filters, segment])

  useEffect(() => {
    savePreferences()
  }, [savePreferences])

  const fetchPositions = useCallback(
    async (showRefresh = false) => {
      if (onRefresh) {
        if (showRefresh) setIsRefreshing(true)
        try {
          await onRefresh()
        } finally {
          setIsRefreshing(false)
        }
        return
      }

      if (!storeApiKey) {
        setInternalLoading(false)
        return
      }

      if (showRefresh) setIsRefreshing(true)

      try {
        const response = await tradingApi.getPositions(storeApiKey)
        if (response.status === 'success' && response.data) {
          setInternalPositions(response.data)
          setError(null)
        } else {
          setError(response.message || 'Failed to fetch positions')
        }
      } catch {
        setError('Failed to fetch positions')
      } finally {
        setInternalLoading(false)
        setIsRefreshing(false)
      }
    },
    [onRefresh, storeApiKey]
  )

  // Initial fetch and visibility-aware polling
  // Pauses polling when tab is hidden to save resources
  useEffect(() => {
    // Don't poll when tab is hidden
    if (!isVisible) return

    fetchPositions()
    lastFetchRef.current = Date.now()
  }, [fetchPositions, isVisible])

  // Refresh on order events instead of polling
  useOrderEventRefresh(fetchPositions, {
    events: ['order_event', 'analyzer_update', 'close_position_event'],
  })

  // Refresh data when tab becomes visible after being hidden
  useEffect(() => {
    if (!wasHidden || !isVisible) return

    const timeSinceLastFetch = Date.now() - lastFetchRef.current

    // If hidden for more than 30 seconds, show stale warning and refresh
    if (timeSinceHidden > 30000 || timeSinceLastFetch > 30000) {
      setShowStaleWarning(true)
      fetchPositions()
      lastFetchRef.current = Date.now()
    }
  }, [wasHidden, isVisible, timeSinceHidden, fetchPositions])

  // Auto-dismiss stale data warning after 5 seconds
  useEffect(() => {
    if (!showStaleWarning) return
    const timeout = setTimeout(() => setShowStaleWarning(false), 5000)
    return () => clearTimeout(timeout)
  }, [showStaleWarning])

  // Listen for mode changes (live/analyze) and refresh data
  useEffect(() => {
    const unsubscribe = onModeChange(() => {
      fetchPositions()
    })
    return () => unsubscribe()
  }, [fetchPositions])

  // Get group key for a position
  const getGroupKey = useCallback(
    (pos: Position): string => {
      const exchange = pos.exchange
      const product = pos.product

      if (exchange === 'NSE' || exchange === 'BSE') {
        if (product === 'CNC') return 'Equity (Delivery)'
        if (product === 'MIS') return 'Equity (Intraday)'
      }

      const parsed = parseSymbol(pos.symbol, exchange)

      if (grouping === 'underlying') {
        return parsed.underlying
      } else if (grouping === 'underlying_expiry') {
        return parsed.expiry ? `${parsed.underlying} - ${parsed.expiry}` : parsed.underlying
      }

      return parsed.underlying
    },
    [grouping]
  )

  // Segment counts
  const equityCount = useMemo(
    () => enhancedPositions.filter((p) => !isCommodityPosition(p)).length,
    [enhancedPositions]
  )
  const commodityCount = useMemo(
    () => enhancedPositions.filter((p) => isCommodityPosition(p)).length,
    [enhancedPositions]
  )

  // Filter positions (use enhancedPositions for real-time LTP/PnL)
  const filteredPositions = useMemo(() => {
    return enhancedPositions.filter((pos) => {
      // Segment filter
      if (segment === 'EQUITY' && isCommodityPosition(pos)) return false
      if (segment === 'COMMODITY' && !isCommodityPosition(pos)) return false

      if (filters.product.length > 0 && !filters.product.includes(pos.product)) return false

      const qty = pos.quantity || 0
      if (filters.direction.length > 0) {
        const isLong = qty > 0
        const isShort = qty < 0
        if (filters.direction.includes('LONG') && !filters.direction.includes('SHORT') && !isLong)
          return false
        if (filters.direction.includes('SHORT') && !filters.direction.includes('LONG') && !isShort)
          return false
      }

      if (filters.exchange.length > 0 && !filters.exchange.includes(pos.exchange)) return false

      return true
    })
  }, [enhancedPositions, segment, filters])

  // Sort positions
  const sortedPositions = useMemo(() => {
    if (sortColumn === null) return filteredPositions

    return [...filteredPositions].sort((a, b) => {
      let aVal: string | number
      let bVal: string | number

      switch (sortColumn) {
        case 0:
          aVal = a.symbol
          bVal = b.symbol
          break
        case 3:
          aVal = a.quantity || 0
          bVal = b.quantity || 0
          break
        case 4:
          aVal = a.average_price || 0
          bVal = b.average_price || 0
          break
        case 6:
          aVal = a.pnl || 0
          bVal = b.pnl || 0
          break
        case 7:
          aVal = calculatePnlPercent(a)
          bVal = calculatePnlPercent(b)
          break
        default:
          return 0
      }

      if (typeof aVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal)
      }
      return sortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number)
    })
  }, [filteredPositions, sortColumn, sortDirection])

  // Group positions
  const groupedPositions = useMemo(() => {
    if (grouping === 'none') {
      return { _all: sortedPositions }
    }

    const groups: Record<string, Position[]> = {}
    sortedPositions.forEach((pos) => {
      const groupKey = getGroupKey(pos)
      if (!groups[groupKey]) groups[groupKey] = []
      groups[groupKey].push(pos)
    })

    return groups
  }, [sortedPositions, grouping, getGroupKey])

  // Calculate stats
  const stats = useMemo(() => {
    const long = filteredPositions.filter((p) => (p.quantity || 0) > 0).length
    const short = filteredPositions.filter((p) => (p.quantity || 0) < 0).length
    // Only count positions with non-zero quantity as "open"
    const total = long + short
    const totalPnl = filteredPositions.reduce((sum, p) => sum + (p.pnl || 0), 0)
    return { total, long, short, totalPnl }
  }, [filteredPositions])

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const toggleFilter = (type: keyof FilterState, value: string) => {
    setFilters((prev) => {
      const arr = prev[type]
      const index = arr.indexOf(value)
      if (index > -1) {
        return { ...prev, [type]: arr.filter((v) => v !== value) }
      }
      return { ...prev, [type]: [...arr, value] }
    })
  }

  const clearFilters = () => {
    setFilters({ product: [], direction: [], exchange: [] })
    setGrouping('none')
    setSegment('ALL')
    setCollapsedGroups(new Set())
  }

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }
      return next
    })
  }

  const hasActiveFilters =
    filters.product.length > 0 ||
    filters.direction.length > 0 ||
    filters.exchange.length > 0 ||
    grouping !== 'none' ||
    segment !== 'ALL'

  const handleClosePosition = async (position: Position) => {
    if (onSquareOffPosition) {
      onSquareOffPosition(position)
      return
    }

    try {
      const response = await tradingApi.closePosition(
        position.symbol,
        position.exchange,
        position.product
      )
      if (response.status === 'success') {
        showToast.success(response.message || `Position closed for ${position.symbol}`, 'positions')
        fetchPositions(true)
        broadcastCrossTabEvent('ORDER_OR_POSITION_CHANGED')
      } else {
        showToast.error(response.message || 'Failed to close position', 'positions')
      }
    } catch (_err) {
      showToast.error('Failed to close position', 'positions')
    }
  }

  const handleCloseAllPositions = async () => {
    if (onExitAll) {
      onExitAll()
      return
    }

    try {
      const response = await tradingApi.closeAllPositions()
      if (response.status === 'success') {
        showToast.success('All positions closed', 'positions')
        fetchPositions(true)
      } else {
        showToast.error(response.message || 'Failed to close all positions', 'positions')
      }
    } catch (_err) {
      showToast.error('Failed to close all positions', 'positions')
    }
  }

  const exportToCSV = () => {
    if (filteredPositions.length === 0) {
      showToast.error('No data to export', 'system')
      return
    }

    try {
      const headers = [
        'Symbol',
        'Exchange',
        ...(isCrypto ? [] : ['Product']),
        'Quantity',
        'Avg Price',
        'LTP',
        'P&L',
        'P&L %',
      ]
      const rows = filteredPositions.map((p) => [
        sanitizeCSV(p.symbol),
        sanitizeCSV(p.exchange),
        ...(isCrypto ? [] : [sanitizeCSV(p.product)]),
        sanitizeCSV(p.quantity),
        sanitizeCSV(p.average_price),
        sanitizeCSV(p.ltp),
        sanitizeCSV(p.pnl),
        sanitizeCSV(calculatePnlPercent(p)),
      ])

      const csv = [headers, ...rows].map((row) => row.join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const filename = `positions_${new Date().toISOString().split('T')[0]}.csv`
      a.download = filename
      a.click()
      // Revoke the object URL to free memory
      URL.revokeObjectURL(url)
      showToast.success(`Downloaded ${filename}`, 'clipboard')
    } catch {
      showToast.error('Failed to export CSV', 'system')
    }
  }

  const isProfit = (value: number) => value >= 0

  const FilterChip = ({
    type,
    value,
    label,
  }: {
    type: keyof FilterState
    value: string
    label: string
  }) => (
    <Button
      variant={filters[type].includes(value) ? 'default' : 'outline'}
      size="sm"
      className={cn(
        'rounded-full',
        filters[type].includes(value) && 'bg-pink-500 hover:bg-pink-600'
      )}
      onClick={() => toggleFilter(type, value)}
    >
      {label}
    </Button>
  )

  const SortableHeader = ({
    column,
    label,
    className,
  }: {
    column: SortColumn
    label: string
    className?: string
  }) => (
    <TableHead
      className={cn('cursor-pointer hover:bg-muted/50 select-none', className)}
      onClick={() => handleSort(column)}
    >
      <div
        className={cn(
          'flex items-center gap-1 w-full',
          className?.includes('text-right') && 'justify-end'
        )}
      >
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      </div>
    </TableHead>
  )

  // Calculate group stats
  const calculateGroupStats = (positions: Position[]) => {
    let totalPnl = 0
    let totalInvestment = 0

    positions.forEach((pos) => {
      totalPnl += pos.pnl || 0
      const avgPrice = pos.average_price || 0
      const qty = Math.abs(pos.quantity || 0)
      totalInvestment += avgPrice * qty
    })

    const pnlPercent = totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0
    return { totalPnl, pnlPercent, count: positions.length }
  }

  // Sort group keys
  const sortedGroupKeys = Object.keys(groupedPositions).sort((a, b) => {
    if (a.startsWith('Equity') && !b.startsWith('Equity')) return -1
    if (!a.startsWith('Equity') && b.startsWith('Equity')) return 1
    return a.localeCompare(b)
  })

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6 bg-background text-foreground">
      {/* Sandbox / Analyzer Notice */}
      {appMode === 'analyzer' && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-600 dark:text-purple-300 text-xs font-medium">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
            <span>Sandbox Mode Active — Scalper positions are simulated in virtual paper trading</span>
          </div>
          {marginData?.availablecash !== undefined && (
            <span className="font-semibold">Virtual Cash: {formatCurrency(marginData.availablecash)}</span>
          )}
        </div>
      )}

      {/* Stale Data Warning */}
      {showStaleWarning && (
        <Alert variant="default" className="bg-amber-500/10 border-amber-500/30">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700 dark:text-amber-400">
            Data is being refreshed after tab was inactive...
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Positions</h1>
            {isPaused ? (
              <Badge
                variant="outline"
                className="bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1"
              >
                <Pause className="h-3 w-3" />
                Paused
              </Badge>
            ) : isLive ? (
              <Badge
                variant="outline"
                className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1"
              >
                <Radio className="h-3 w-3 animate-pulse" />
                Live
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground">Monitor and manage your active trading positions</p>
        </div>

        {/* Header Actions & Segment Filter */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Segment Selector */}
          <div className="flex items-center bg-muted/60 p-1 rounded-lg border text-xs">
            <button
              type="button"
              onClick={() => setSegment('ALL')}
              className={cn(
                'px-3 py-1.5 rounded-md font-medium transition-colors',
                segment === 'ALL'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              All ({positions.length})
            </button>
            <button
              type="button"
              onClick={() => setSegment('EQUITY')}
              className={cn(
                'px-3 py-1.5 rounded-md font-medium transition-colors',
                segment === 'EQUITY'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Equity F&O ({equityCount})
            </button>
            <button
              type="button"
              onClick={() => setSegment('COMMODITY')}
              className={cn(
                'px-3 py-1.5 rounded-md font-medium transition-colors',
                segment === 'COMMODITY'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Commodities ({commodityCount})
            </button>
          </div>

          {/* Settings Button */}
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button
                variant={hasActiveFilters ? 'default' : 'outline'}
                size="sm"
                className="relative"
              >
                <Settings2 className="h-4 w-4 mr-2" />
                Settings
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full" />
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Position Settings</DialogTitle>
                <DialogDescription>Configure grouping and filters</DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Grouping */}
                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Grouping
                  </Label>
                  <div className="space-y-2">
                    {[
                      { value: 'none', label: 'None' },
                      { value: 'underlying', label: 'Underlying' },
                      { value: 'underlying_expiry', label: 'Underlying & Expiry' },
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className={cn(
                          'flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted',
                          grouping === opt.value && 'bg-pink-500/10 border border-pink-500/30'
                        )}
                      >
                        <input
                          type="radio"
                          name="grouping"
                          checked={grouping === opt.value}
                          onChange={() => {
                            setGrouping(opt.value as GroupingType)
                            setCollapsedGroups(new Set())
                          }}
                          className="accent-pink-500"
                        />
                        <span
                          className={cn(grouping === opt.value && 'text-pink-500 font-semibold')}
                        >
                          {opt.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="border-t" />

                {/* Product Type */}
                {!isCrypto && (
                  <div className="space-y-3">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Product Type
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      <FilterChip type="product" value="CNC" label="CNC" />
                      <FilterChip type="product" value="MIS" label="MIS" />
                      <FilterChip type="product" value="NRML" label="NRML" />
                    </div>
                  </div>
                )}

                {/* Direction */}
                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Direction
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    <FilterChip type="direction" value="LONG" label="Long" />
                    <FilterChip type="direction" value="SHORT" label="Short" />
                  </div>
                </div>

                {/* Exchange */}
                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Exchange
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    <FilterChip type="exchange" value="NSE" label="NSE" />
                    <FilterChip type="exchange" value="BSE" label="BSE" />
                    <FilterChip type="exchange" value="NFO" label="NFO" />
                    <FilterChip type="exchange" value="BFO" label="BFO" />
                    <FilterChip type="exchange" value="MCX" label="MCX" />
                    <FilterChip type="exchange" value="CDS" label="CDS" />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={clearFilters}>
                  Clear All
                </Button>
                <Button onClick={() => setSettingsOpen(false)}>Done</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchPositions(true)}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>

          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant={stats.total === 0 ? 'outline' : 'destructive'}
                size="sm"
                disabled={stats.total === 0}
                className={cn(
                  stats.total === 0 &&
                    'opacity-40 cursor-not-allowed bg-muted text-muted-foreground border-border/40 hover:bg-muted hover:text-muted-foreground pointer-events-none'
                )}
                title={stats.total === 0 ? 'No open positions to close' : `Close all ${stats.total} open positions`}
              >
                <X className="h-4 w-4 mr-2" />
                Close All
              </Button>
            </AlertDialogTrigger>
            {stats.total > 0 && (
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close All Positions?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will close all {stats.total} open positions at market price. This action
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCloseAllPositions}>Close All</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            )}
          </AlertDialog>
        </div>
      </div>

      {/* Active Filters Bar */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">Active Filters:</span>
          {segment !== 'ALL' && (
            <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
              Segment: {segment === 'COMMODITY' ? 'Commodities' : 'Equity F&O'}
            </Badge>
          )}
          {grouping !== 'none' && (
            <Badge variant="secondary" className="bg-pink-500/10 text-pink-600 border-pink-500/30">
              Grouped: {grouping === 'underlying' ? 'Underlying' : 'Underlying & Expiry'}
            </Badge>
          )}
          {!isCrypto &&
            filters.product.map((v) => (
              <Badge
                key={v}
                variant="secondary"
                className="bg-pink-500/10 text-pink-600 border-pink-500/30"
              >
                {v}
              </Badge>
            ))}
          {filters.direction.map((v) => (
            <Badge
              key={v}
              variant="secondary"
              className="bg-pink-500/10 text-pink-600 border-pink-500/30"
            >
              {v}
            </Badge>
          ))}
          {filters.exchange.map((v) => (
            <Badge
              key={v}
              variant="secondary"
              className="bg-pink-500/10 text-pink-600 border-pink-500/30"
            >
              {v}
            </Badge>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="text-red-500 border-red-500/50 hover:bg-red-500/10"
            onClick={clearFilters}
          >
            Clear All
          </Button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open Positions</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Long</CardDescription>
            <CardTitle className="text-2xl text-green-600">{stats.long}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Short</CardDescription>
            <CardTitle className="text-2xl text-red-600">{stats.short}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total P&L</CardDescription>
            <CardTitle
              className={cn(
                'text-2xl',
                isProfit(stats.totalPnl) ? 'text-green-600' : 'text-red-600'
              )}
            >
              {formatCurrency(stats.totalPnl)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Positions Table */}
      <Card>
        <CardContent className="py-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-muted-foreground">{error}</div>
          ) : filteredPositions.length === 0 ? (
            <EmptyState
              icon={ChartCandlestick}
              title="No positions match your filters"
              description="Try adjusting or clearing your filters to see results."
              action={hasActiveFilters ?
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear Filters
                </Button> : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHeader column={0} label="Symbol" className="w-[140px]" />
                    <TableHead className="w-[80px]">Exchange</TableHead>
                    {!isCrypto && <TableHead className="w-[80px]">Product</TableHead>}
                    <SortableHeader column={3} label="Qty" className="w-[80px] text-right" />
                    <SortableHeader column={4} label="Avg Price" className="w-[120px] text-right" />
                    <TableHead className="w-[120px] text-right">LTP</TableHead>
                    <SortableHeader column={6} label="P&L" className="w-[120px] text-right" />
                    <SortableHeader column={7} label="P&L %" className="w-[100px] text-right" />
                    <TableHead className="w-[60px] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedGroupKeys.map((groupKey) => {
                    const groupPositions = groupedPositions[groupKey]
                    const isCollapsed = collapsedGroups.has(groupKey)
                    const groupStats = calculateGroupStats(groupPositions)

                    return (
                      <React.Fragment key={groupKey}>
                        {/* Group Header Row */}
                        {grouping !== 'none' && (
                          <TableRow
                            className="bg-muted/50 cursor-pointer hover:bg-muted"
                            onClick={() => toggleGroup(groupKey)}
                          >
                            <TableCell colSpan={6}>
                              <div className="flex items-center gap-3 py-1 font-semibold">
                                {isCollapsed ? (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )}
                                <span>{groupKey}</span>
                                <Badge variant="outline" className="text-xs">
                                  {groupStats.count}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell
                              className={cn(
                                'text-right font-bold',
                                isProfit(groupStats.totalPnl) ? 'text-green-600' : 'text-red-600'
                              )}
                            >
                              {groupStats.totalPnl >= 0 ? '+' : ''}
                              {formatCurrency(groupStats.totalPnl)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                'text-right font-semibold',
                                isProfit(groupStats.pnlPercent) ? 'text-green-600' : 'text-red-600'
                              )}
                            >
                              {groupStats.pnlPercent >= 0 ? '+' : ''}
                              {groupStats.pnlPercent.toFixed(2)}%
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        )}

                        {/* Position Rows */}
                        {!isCollapsed &&
                          groupPositions.map((position, index) => {
                            const isClosed = !position.quantity || position.quantity === 0
                            return (
                              <TableRow key={`${position.symbol}-${position.exchange}-${index}`}>
                                <TableCell className="w-[140px] font-medium">
                                  {position.symbol}
                                </TableCell>
                                <TableCell className="w-[80px]">
                                  <Badge
                                    variant="outline"
                                    className={EXCHANGE_COLORS[position.exchange] || ''}
                                  >
                                    {position.exchange}
                                  </Badge>
                                </TableCell>
                                {!isCrypto && (
                                  <TableCell className="w-[80px]">
                                    <Badge
                                      variant="outline"
                                      className={PRODUCT_COLORS[position.product] || ''}
                                    >
                                      {position.product}
                                    </Badge>
                                  </TableCell>
                                )}
                                <TableCell
                                  className={cn(
                                    'w-[80px] text-right font-medium',
                                    position.quantity > 0
                                      ? 'text-green-600'
                                      : position.quantity < 0
                                        ? 'text-red-600'
                                        : 'text-muted-foreground'
                                  )}
                                >
                                  {position.quantity}
                                </TableCell>
                                <TableCell className="w-[120px] text-right font-mono">
                                  {formatCurrency(position.average_price)}
                                </TableCell>
                                <TableCell className="w-[120px] text-right font-mono">
                                  {position.ltp !== undefined ? formatCurrency(position.ltp) : '-'}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    'w-[120px] text-right font-medium',
                                    isProfit(position.pnl) ? 'text-green-600' : 'text-red-600'
                                  )}
                                >
                                  <div className="flex items-center justify-end gap-1">
                                    {isProfit(position.pnl) ? (
                                      <TrendingUp className="h-4 w-4" />
                                    ) : (
                                      <TrendingDown className="h-4 w-4" />
                                    )}
                                    {formatCurrency(position.pnl)}
                                  </div>
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    'w-[100px] text-right',
                                    isProfit(calculatePnlPercent(position))
                                      ? 'text-green-600'
                                      : 'text-red-600'
                                  )}
                                >
                                  {calculatePnlPercent(position) >= 0 ? '+' : ''}
                                  {calculatePnlPercent(position).toFixed(2)}%
                                </TableCell>
                                <TableCell className="w-[60px] text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isClosed}
                                    className={cn(
                                      isClosed
                                        ? 'text-muted-foreground/30 opacity-40 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground/30'
                                        : 'text-destructive hover:text-destructive hover:bg-destructive/10'
                                    )}
                                    onClick={() => !isClosed && handleClosePosition(position)}
                                    aria-label={isClosed ? `Position ${position.symbol} is closed` : `Close ${position.symbol} position`}
                                    title={isClosed ? 'Position already closed' : `Close ${position.symbol} position`}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                      </React.Fragment>
                    )
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="bg-muted/50">
                    <TableCell colSpan={6} className="text-right text-muted-foreground">
                      Total P&L:
                    </TableCell>
                    <TableCell
                      className={cn(
                        'w-[120px] text-right font-bold',
                        isProfit(stats.totalPnl) ? 'text-green-600' : 'text-red-600'
                      )}
                    >
                      {stats.totalPnl >= 0 ? '+' : ''}
                      {formatCurrency(stats.totalPnl)}
                    </TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
