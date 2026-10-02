import {
  Activity,
  ArrowLeft,
  BarChart3,
  CheckCircle,
  Clock,
  Download,
  Gauge,
  Info,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { webClient } from '@/api/client'
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
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { showToast } from '@/utils/toast'

interface LatencyLog {
  id: number
  timestamp: string
  order_id: string
  broker: string | null
  symbol: string | null
  order_type: string
  rtt_ms: number
  validation_latency_ms: number
  response_latency_ms: number
  overhead_ms: number
  total_latency_ms: number
  status: string
  error: string | null
}

interface BrokerStats {
  avg_total: number
  avg_rtt?: number
  avg_overhead?: number
  p50_total: number
  p99_total: number
  sla_150ms: number
  total_orders: number
  failed_orders?: number
}

interface LatencyStats {
  time_range?: string
  session_date?: string
  daily_reset_time?: string
  total_orders: number
  success_rate: number
  failed_orders: number
  avg_total: number
  avg_rtt: number
  avg_overhead: number
  min_total?: number
  max_total?: number
  p50_total?: number
  p90_total?: number
  p95_total?: number
  p99_total?: number
  sla_100ms?: number
  sla_150ms: number
  sla_200ms?: number
  broker_stats: Record<string, BrokerStats>
}

type TimeRange = 'today' | '7d' | 'all'
type StatusFilter = 'ALL' | 'SUCCESS' | 'FAILED' | 'SLOW'

export default function LatencyDashboard() {
  const [timeRange, setTimeRange] = useState<TimeRange>('today')
  const [isLoading, setIsLoading] = useState(true)
  const [logs, setLogs] = useState<LatencyLog[]>([])
  const [stats, setStats] = useState<LatencyStats | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<LatencyLog | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false)
  const [resetScope, setResetScope] = useState<'today' | 'all'>('today')
  const [isResetting, setIsResetting] = useState(false)
  const [hoveredPoint, setHoveredPoint] = useState<LatencyLog | null>(null)

  const fetchData = useCallback(
    async (showLoadingSpinner = false) => {
      if (showLoadingSpinner) setIsLoading(true)
      try {
        const [logsResponse, statsResponse] = await Promise.all([
          webClient.get<LatencyLog[]>(`/latency/api/logs?range=${timeRange}&limit=250`),
          webClient.get<LatencyStats>(`/latency/api/stats?range=${timeRange}`),
        ])

        setLogs(Array.isArray(logsResponse.data) ? logsResponse.data : [])
        setStats(statsResponse.data)
      } catch (_error) {
        showToast.error('Failed to load latency data', 'monitoring')
      } finally {
        if (showLoadingSpinner) setIsLoading(false)
      }
    },
    [timeRange]
  )

  useEffect(() => {
    fetchData(true)
  }, [fetchData])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      fetchData(false)
    }, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    await fetchData(false)
    setIsRefreshing(false)
    showToast.success('Latency metrics updated', 'monitoring')
  }

  const handleExport = () => {
    window.open(`/latency/export?range=${timeRange}`, '_blank')
  }

  const handleResetConfirm = async () => {
    setIsResetting(true)
    try {
      const resp = await webClient.post<{ status: string; message: string; deleted: number }>(
        '/latency/api/reset',
        { scope: resetScope }
      )
      showToast.success(resp.data?.message || 'Latency reset successfully', 'monitoring')
      setIsResetDialogOpen(false)
      await fetchData(false)
    } catch (_err) {
      showToast.error('Failed to reset latency logs', 'monitoring')
    } finally {
      setIsResetting(false)
    }
  }

  const getSpeedRating = (latency: number) => {
    if (latency < 150)
      return {
        label: 'Ultra-Fast',
        badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        textColor: 'text-emerald-400',
        color: '#10b981',
      }
    if (latency < 250)
      return {
        label: 'Fast',
        badge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
        textColor: 'text-cyan-400',
        color: '#06b6d4',
      }
    if (latency < 400)
      return {
        label: 'Acceptable',
        badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        textColor: 'text-amber-400',
        color: '#f59e0b',
      }
    return {
      label: 'Elevated',
      badge: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      textColor: 'text-rose-400',
      color: '#f43f5e',
    }
  }

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      return date.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
    } catch {
      return timestamp
    }
  }

  const formatFullDate = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
    } catch {
      return timestamp
    }
  }

  // Filtered logs based on search query and status filter
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        log.order_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.symbol?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.broker?.toLowerCase().includes(searchQuery.toLowerCase())

      if (!matchesSearch) return false

      if (statusFilter === 'SUCCESS') return log.status === 'SUCCESS'
      if (statusFilter === 'FAILED') return log.status !== 'SUCCESS'
      if (statusFilter === 'SLOW') return (log.total_latency_ms || 0) >= 250
      return true
    })
  }, [logs, searchQuery, statusFilter])

  // Distribution buckets calculation
  const distributionBuckets = useMemo(() => {
    const total = logs.length || 1
    const b1 = logs.filter((l) => (l.total_latency_ms || 0) < 50).length
    const b2 = logs.filter(
      (l) => (l.total_latency_ms || 0) >= 50 && (l.total_latency_ms || 0) < 100
    ).length
    const b3 = logs.filter(
      (l) => (l.total_latency_ms || 0) >= 100 && (l.total_latency_ms || 0) < 150
    ).length
    const b4 = logs.filter(
      (l) => (l.total_latency_ms || 0) >= 150 && (l.total_latency_ms || 0) < 250
    ).length
    const b5 = logs.filter(
      (l) => (l.total_latency_ms || 0) >= 250 && (l.total_latency_ms || 0) < 400
    ).length
    const b6 = logs.filter((l) => (l.total_latency_ms || 0) >= 400).length

    return [
      { label: '<50ms', sub: 'Sub-50ms', count: b1, pct: (b1 / total) * 100, color: 'bg-emerald-500' },
      { label: '50-100ms', sub: 'Low Latency', count: b2, pct: (b2 / total) * 100, color: 'bg-emerald-400' },
      { label: '100-150ms', sub: 'Target SLA', count: b3, pct: (b3 / total) * 100, color: 'bg-cyan-500' },
      { label: '150-250ms', sub: 'Standard', count: b4, pct: (b4 / total) * 100, color: 'bg-yellow-500' },
      { label: '250-400ms', sub: 'Moderate', count: b5, pct: (b5 / total) * 100, color: 'bg-amber-500' },
      { label: '>400ms', sub: 'Elevated', count: b6, pct: (b6 / total) * 100, color: 'bg-rose-500' },
    ]
  }, [logs])

  // Latency Timeline Data points
  const timelinePoints = useMemo(() => {
    if (!logs.length) return []
    // Take chronological up to 80 points
    const sorted = [...logs].reverse().slice(-80)
    const latencies = sorted.map((l) => l.total_latency_ms || 0)
    const maxLat = Math.max(250, ...latencies)

    return sorted.map((log, index) => {
      const lat = log.total_latency_ms || 0
      const xPct = sorted.length > 1 ? (index / (sorted.length - 1)) * 100 : 50
      const yPct = Math.max(5, Math.min(95, 100 - (lat / maxLat) * 90))
      return { log, xPct, yPct, lat, maxLat }
    })
  }, [logs])

  const slaPercentage = stats?.sla_150ms ?? 0
  const avgTotal = stats?.avg_total ?? 0
  const avgRtt = stats?.avg_rtt ?? 0
  const avgOverhead = stats?.avg_overhead ?? 0
  const totalOrders = stats?.total_orders ?? 0
  const successRate = stats?.success_rate ?? 0

  // Platform overhead ratio
  const rttPct = avgTotal > 0 ? Math.min(99, Math.max(1, (avgRtt / avgTotal) * 100)) : 90
  const overheadPct = avgTotal > 0 ? Math.min(99, Math.max(1, (avgOverhead / avgTotal) * 100)) : 10

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <p className="text-xs text-muted-foreground font-mono">Loading real-time latency metrics...</p>
      </div>
    )
  }

  return (
    <div className="py-6 space-y-6 max-w-7xl mx-auto px-2 sm:px-4">
      {/* Header with Navigation and Real-Time Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="p-1.5 rounded-lg border border-border/60 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Gauge className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                High-Frequency Latency Monitor
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                {autoRefresh && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    autoRefresh ? 'bg-emerald-500' : 'bg-muted-foreground'
                  }`}
                />
              </span>
              {autoRefresh ? 'Live Session Feed (5s)' : 'Feed Paused'}
            </span>
            <span>•</span>
            <span className="font-mono">
              Session Date: {stats?.session_date || 'Today'} (IST)
            </span>
            <span>•</span>
            <Badge variant="outline" className="text-[10px] py-0 px-2 font-normal border-border/60">
              Auto-resets daily at 00:00 IST
            </Badge>
          </div>
        </div>

        {/* Top Controls: Time Range Selector, Auto-Refresh & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Time Range Pills */}
          <div className="flex items-center bg-muted/60 p-1 rounded-lg border border-border/50 text-xs">
            <button
              type="button"
              onClick={() => setTimeRange('today')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                timeRange === 'today'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Today (Daily)
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('7d')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                timeRange === '7d'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              7 Days
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('all')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                timeRange === 'all'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All Time
            </button>
          </div>

          {/* Auto Refresh Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`h-8 text-xs ${autoRefresh ? 'text-emerald-400 border-emerald-500/30' : ''}`}
          >
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            {autoRefresh ? 'Auto: ON' : 'Auto: OFF'}
          </Button>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Sync
          </Button>

          {/* Reset Today / Clear */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs text-rose-400 hover:text-rose-300 hover:border-rose-500/50"
            onClick={() => {
              setResetScope(timeRange === 'all' ? 'all' : 'today')
              setIsResetDialogOpen(true)
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset {timeRange === 'all' ? 'All' : 'Today'}
          </Button>

          {/* Export CSV */}
          <Button size="sm" className="h-8 text-xs bg-primary hover:bg-primary/90" onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Hero Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Execution Volume & Success Rate */}
        <Card className="border-border/60 bg-gradient-to-b from-card to-card/60 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {timeRange === 'today' ? "Today's Orders" : 'Total Execution'}
              </p>
              <Zap className="h-4 w-4 text-primary opacity-80" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono tracking-tight text-foreground">
                {totalOrders}
              </span>
              <span className="text-xs text-muted-foreground">orders placed</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-border/40">
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle className="h-3.5 w-3.5" />
                {totalOrders - (stats?.failed_orders || 0)} Passed
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] py-0 font-mono ${
                  successRate >= 98
                    ? 'border-emerald-500/40 text-emerald-400'
                    : 'border-amber-500/40 text-amber-400'
                }`}
              >
                {successRate.toFixed(1)}% Success
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Metric 2: Average End-to-End Latency */}
        <Card className="border-border/60 bg-gradient-to-b from-card to-card/60 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Average Confirmation
              </p>
              <Activity className="h-4 w-4 text-emerald-400 opacity-80" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-3xl font-bold font-mono tracking-tight ${
                  getSpeedRating(avgTotal).textColor
                }`}
              >
                {avgTotal.toFixed(1)}
              </span>
              <span className="text-xs text-muted-foreground">ms round-trip</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-border/40">
              <Badge
                variant="outline"
                className={`text-[10px] py-0 font-medium ${getSpeedRating(avgTotal).badge}`}
              >
                {getSpeedRating(avgTotal).label}
              </Badge>
              <span className="text-[11px] text-muted-foreground font-mono">
                Min: {(stats?.min_total || 0).toFixed(0)}ms | Max: {(stats?.max_total || 0).toFixed(0)}ms
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Metric 3: Median (P50) & 99th Percentile (P99) */}
        <Card className="border-border/60 bg-gradient-to-b from-card to-card/60 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Median (P50) & Tail (P99)
              </p>
              <TrendingUp className="h-4 w-4 text-cyan-400 opacity-80" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div>
                <span className="text-2xl font-bold font-mono tracking-tight text-foreground">
                  {(stats?.p50_total || 0).toFixed(1)}
                </span>
                <span className="text-[10px] text-muted-foreground ml-1">ms (P50)</span>
              </div>
              <div className="text-right">
                <span className="text-xl font-bold font-mono text-muted-foreground">
                  {(stats?.p99_total || 0).toFixed(1)}
                </span>
                <span className="text-[10px] text-muted-foreground ml-1">ms (P99)</span>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-border/40 font-mono text-[11px] text-muted-foreground">
              <span>P90: {(stats?.p90_total || 0).toFixed(1)}ms</span>
              <span>P95: {(stats?.p95_total || 0).toFixed(1)}ms</span>
            </div>
          </CardContent>
        </Card>

        {/* Metric 4: Fast Orders SLA Target (<150ms) */}
        <Card className="border-border/60 bg-gradient-to-b from-card to-card/60 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Ultra-Fast SLA (&lt;150ms)
              </p>
              <ShieldCheck className="h-4 w-4 text-emerald-400 opacity-80" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div>
                <span
                  className={`text-3xl font-bold font-mono tracking-tight ${
                    slaPercentage >= 95
                      ? 'text-emerald-400'
                      : slaPercentage >= 80
                        ? 'text-cyan-400'
                        : 'text-amber-400'
                  }`}
                >
                  {slaPercentage.toFixed(1)}%
                </span>
                <span className="text-xs text-muted-foreground ml-1.5">within SLA</span>
              </div>
              <span className="text-xs font-mono text-muted-foreground">Target: 95%</span>
            </div>
            <div className="mt-3 space-y-1 pt-2 border-t border-border/40">
              <Progress
                value={slaPercentage}
                className="h-1.5 bg-muted rounded-full overflow-hidden"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Graphic 1: Interactive Execution Timeline Scatter Chart */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" />
                Live Order Execution Timeline
              </CardTitle>
              <CardDescription className="text-xs">
                Chronological scatter of order round-trip confirmation speeds across the session
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                &lt;150ms (Ultra-Fast)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
                150-250ms
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                &gt;250ms
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {timelinePoints.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border/60 rounded-lg">
              <Gauge className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No orders executed in this session yet.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Place an order via Trading or API to see live latency traces.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative h-56 w-full bg-card/40 border border-border/40 rounded-lg p-3 overflow-hidden select-none">
                {/* Horizontal reference grid lines */}
                <div className="absolute inset-x-0 top-[20%] border-b border-border/20" />
                <div className="absolute inset-x-0 top-[40%] border-b border-border/20" />
                <div className="absolute inset-x-0 top-[60%] border-b border-border/20" />
                <div className="absolute inset-x-0 top-[80%] border-b border-border/20" />

                {/* 150ms SLA Target Line */}
                <div
                  className="absolute inset-x-0 border-b-2 border-dashed border-emerald-500/50 pointer-events-none"
                  style={{
                    top: `${Math.max(
                      10,
                      Math.min(90, 100 - (150 / (timelinePoints[0]?.maxLat || 250)) * 90)
                    )}%`,
                  }}
                >
                  <span className="absolute right-3 -top-5 text-[10px] font-mono text-emerald-400/80 bg-background/80 px-1.5 py-0.5 rounded border border-emerald-500/30">
                    150ms Target SLA
                  </span>
                </div>

                {/* Data points */}
                <svg className="w-full h-full overflow-visible" aria-label="Order Latency Timeline">
                  {timelinePoints.map(({ log, xPct, yPct, lat }) => {
                    const rating = getSpeedRating(lat)
                    return (
                      <g key={log.id}>
                        <circle
                          cx={`${xPct}%`}
                          cy={`${yPct}%`}
                          r="5"
                          fill={rating.color}
                          fillOpacity="0.85"
                          stroke="#ffffff"
                          strokeWidth="1.5"
                          className="cursor-pointer transition-transform duration-150 hover:scale-150"
                          onMouseEnter={() => setHoveredPoint(log)}
                          onMouseLeave={() => setHoveredPoint(null)}
                          onClick={() => setSelectedOrder(log)}
                        />
                      </g>
                    )
                  })}
                </svg>

                {/* Hover Tooltip Overlay */}
                {hoveredPoint && (
                  <div className="absolute bottom-3 left-3 bg-popover/95 border border-border/80 text-popover-foreground px-3 py-2 rounded-md shadow-xl text-xs font-mono z-20 backdrop-blur pointer-events-none">
                    <p className="font-semibold text-foreground">
                      {hoveredPoint.symbol || 'Instrument'} ({hoveredPoint.order_type})
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      Order: {hoveredPoint.order_id} • {formatTimestamp(hoveredPoint.timestamp)}
                    </p>
                    <p className="text-emerald-400 font-bold mt-1">
                      Total Latency: {(hoveredPoint.total_latency_ms || 0).toFixed(2)}ms
                    </p>
                    <p className="text-muted-foreground text-[10px]">
                      Broker RTT: {(hoveredPoint.rtt_ms || 0).toFixed(2)}ms | Engine: {(hoveredPoint.overhead_ms || 0).toFixed(2)}ms
                    </p>
                  </div>
                )}
              </div>

              {/* Timeline Axis Labels */}
              <div className="flex justify-between text-[11px] text-muted-foreground font-mono px-1">
                <span>{formatTimestamp(logs[logs.length - 1]?.timestamp || '')}</span>
                <span>Session Progression</span>
                <span>{formatTimestamp(logs[0]?.timestamp || '')}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grid: Graphic 2 (Latency Distribution Histogram) & Graphic 3 (Overhead Breakdown) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Graphic 2: Latency Distribution Histogram (2 Columns) */}
        <Card className="lg:col-span-2 border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Latency Distribution Histogram
            </CardTitle>
            <CardDescription className="text-xs">
              Frequency distribution across microsecond and millisecond latency brackets
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {distributionBuckets.map((bucket) => (
                <div
                  key={bucket.label}
                  className="bg-card/60 border border-border/40 p-2.5 rounded-lg flex flex-col justify-between"
                >
                  <div className="text-center">
                    <span className="text-xs font-semibold text-foreground">{bucket.label}</span>
                    <p className="text-[10px] text-muted-foreground">{bucket.sub}</p>
                  </div>

                  {/* Vertical bar container */}
                  <div className="h-28 flex items-end justify-center py-2">
                    <div className="w-8 bg-muted/50 rounded-t-md overflow-hidden relative h-full flex items-end">
                      <div
                        className={`w-full rounded-t-md transition-all duration-500 ${bucket.color}`}
                        style={{ height: `${Math.max(4, Math.min(100, bucket.pct))}%` }}
                      />
                    </div>
                  </div>

                  <div className="text-center pt-1 border-t border-border/30">
                    <p className="text-sm font-bold font-mono text-foreground">{bucket.count}</p>
                    <p className="text-[10px] text-muted-foreground">{bucket.pct.toFixed(1)}%</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Graphic 3: Engine Overhead vs Broker Execution RTT Split (1 Column) */}
        <Card className="border-border/60 shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-400" />
              Architecture Latency Split
            </CardTitle>
            <CardDescription className="text-xs">
              OpenAlgo core engine overhead vs broker & exchange network transit
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-foreground">Broker & Network RTT</span>
                <span className="font-mono text-cyan-400 font-bold">{avgRtt.toFixed(1)}ms</span>
              </div>
              <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                  style={{ width: `${rttPct}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Network transit, broker OMS risk checks, and exchange gateway
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-border/40">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-foreground">OpenAlgo Platform Overhead</span>
                <span className="font-mono text-emerald-400 font-bold">
                  {avgOverhead.toFixed(2)}ms
                </span>
              </div>
              <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${Math.max(2, overheadPct)}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Zero-copy parsing, authentication check & token routing
              </p>
            </div>

            <div className="p-3 bg-muted/40 rounded-lg border border-border/50 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Info className="h-3.5 w-3.5 text-primary" />
                Zero-Latency Guarantee
              </div>
              <p className="text-[11px] text-muted-foreground">
                Internal processing runs asynchronously in non-blocking event loops, introducing
                near-zero delay (&lt;2ms) before orders reach the broker.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Broker Performance Comparison Matrix */}
      {stats?.broker_stats && Object.keys(stats.broker_stats).length > 0 && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Broker Performance Benchmark</CardTitle>
            <CardDescription className="text-xs">
              Side-by-side latency metrics grouped by active broker adapter
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border border-border/60 rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Broker Adapter</TableHead>
                    <TableHead>Avg Confirmation</TableHead>
                    <TableHead>Median (P50)</TableHead>
                    <TableHead>Worst 1% (P99)</TableHead>
                    <TableHead>Target SLA (&lt;150ms)</TableHead>
                    <TableHead>Total Orders</TableHead>
                    <TableHead className="w-36">Speed Meter</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(stats.broker_stats).map(([broker, data]) => {
                    const rating = getSpeedRating(data.avg_total)
                    return (
                      <TableRow key={broker}>
                        <TableCell className="font-semibold text-foreground uppercase tracking-wide">
                          {broker}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`font-mono text-xs ${rating.badge}`}>
                            {data.avg_total?.toFixed(1)}ms
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {data.p50_total?.toFixed(1)}ms
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {data.p99_total?.toFixed(1)}ms
                        </TableCell>
                        <TableCell>
                          <span
                            className={`font-mono text-xs font-semibold ${
                              data.sla_150ms >= 95 ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {data.sla_150ms?.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{data.total_orders}</TableCell>
                        <TableCell>
                          <div className="w-28 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{
                                width: `${Math.max(
                                  0,
                                  Math.min(100, ((400 - data.avg_total) / 400) * 100)
                                )}%`,
                              }}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live Order Latency Log Table */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold">Live Order Latency Log</CardTitle>
              <CardDescription className="text-xs">
                Showing {filteredLogs.length} of {logs.length} tracked executions for {timeRange}
              </CardDescription>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-48 sm:w-60">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search symbol, ID, broker..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs bg-card"
                />
              </div>

              {/* Status Filter Chips */}
              <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50 text-xs">
                {(['ALL', 'SUCCESS', 'FAILED', 'SLOW'] as StatusFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setStatusFilter(f)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                      statusFilter === f
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border border-border/60 rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-28">Time (IST)</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Broker</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Total Latency</TableHead>
                  <TableHead>Broker RTT</TableHead>
                  <TableHead>Overhead</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20 text-right">Trace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-10">
                      {searchQuery || statusFilter !== 'ALL'
                        ? 'No orders match your search filters.'
                        : 'No orders recorded in this session yet.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => {
                    const rating = getSpeedRating(log.total_latency_ms || 0)
                    return (
                      <TableRow key={log.id} className="hover:bg-muted/30">
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {formatTimestamp(log.timestamp)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-foreground">
                          {log.order_id}
                        </TableCell>
                        <TableCell className="text-xs uppercase font-medium">
                          {log.broker || 'N/A'}
                        </TableCell>
                        <TableCell className="font-semibold text-xs text-foreground">
                          {log.symbol || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] py-0 font-normal">
                            {log.order_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`font-mono text-xs ${rating.badge}`}>
                            {(log.total_latency_ms || 0).toFixed(1)}ms
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {(log.rtt_ms || 0).toFixed(1)}ms
                        </TableCell>
                        <TableCell className="font-mono text-xs text-emerald-400">
                          {(log.overhead_ms || 0).toFixed(2)}ms
                        </TableCell>
                        <TableCell>
                          {log.status === 'SUCCESS' ? (
                            <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] py-0">
                              SUCCESS
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px] py-0">
                              {log.status}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs px-2"
                            onClick={() => setSelectedOrder(log)}
                          >
                            Breakdown
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Order Trace & Latency Breakdown Modal */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-emerald-400" />
              Order Latency Trace Breakdown
            </DialogTitle>
            <DialogDescription className="text-xs">
              End-to-end timing execution profile for order{' '}
              <span className="font-mono font-medium text-foreground">
                {selectedOrder?.order_id}
              </span>
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4 pt-2">
              {/* Order Meta Bar */}
              <div className="grid grid-cols-3 gap-2 bg-muted/40 p-3 rounded-lg border border-border/50 text-xs">
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase">Symbol</span>
                  <p className="font-bold text-foreground">{selectedOrder.symbol || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase">Broker</span>
                  <p className="font-bold text-foreground uppercase">{selectedOrder.broker || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase">Execution Time</span>
                  <p className="font-mono text-foreground">
                    {formatFullDate(selectedOrder.timestamp)}
                  </p>
                </div>
              </div>

              {/* Step by step latency bars */}
              <div className="space-y-3">
                {/* Total Time */}
                <div className="bg-card p-3 rounded-lg border border-border/60">
                  <div className="flex justify-between items-center mb-1.5">
                    <div>
                      <span className="text-xs font-semibold text-foreground">
                        Total Confirmation Time
                      </span>
                      <p className="text-[10px] text-muted-foreground">
                        Client order request to verified broker acknowledgement
                      </p>
                    </div>
                    <span
                      className={`text-lg font-bold font-mono ${
                        getSpeedRating(selectedOrder.total_latency_ms || 0).textColor
                      }`}
                    >
                      {(selectedOrder.total_latency_ms || 0).toFixed(2)}ms
                    </span>
                  </div>
                  <Progress
                    value={Math.min(100, ((selectedOrder.total_latency_ms || 0) / 300) * 100)}
                    className="h-2"
                  />
                </div>

                {/* Broker Round-Trip */}
                <div className="bg-muted/30 p-3 rounded-lg border border-border/40">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-foreground">
                      Broker Network & OMS Processing (RTT)
                    </span>
                    <span className="font-mono text-cyan-400 font-bold text-xs">
                      {(selectedOrder.rtt_ms || 0).toFixed(2)}ms
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Transit across HTTP/REST network link + broker risk engine validation.
                  </p>
                </div>

                {/* Platform Overhead */}
                <div className="bg-muted/30 p-3 rounded-lg border border-border/40">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-foreground">
                      OpenAlgo Core Engine Overhead
                    </span>
                    <span className="font-mono text-emerald-400 font-bold text-xs">
                      {(selectedOrder.overhead_ms || 0).toFixed(2)}ms
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground font-mono mt-1">
                    <span>
                      Validation: {(selectedOrder.validation_latency_ms || 0).toFixed(2)}ms
                    </span>
                    <span>
                      Response: {(selectedOrder.response_latency_ms || 0).toFixed(2)}ms
                    </span>
                  </div>
                </div>

                {/* Error Note if any */}
                {selectedOrder.error && (
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-center gap-2.5 text-xs text-rose-400">
                    <XCircle className="h-4 w-4 shrink-0" />
                    <span>{selectedOrder.error}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for Resetting Latency Data */}
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2 text-rose-400">
              <RotateCcw className="h-4 w-4" />
              Reset Latency Monitoring Data
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to reset {resetScope === 'today' ? "today's active session" : 'all'}{' '}
              latency records? This resets your throughput counts and averages back to 0.
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 bg-muted/40 rounded-lg border border-border/60 text-xs space-y-1">
            <p className="font-medium text-foreground">
              Scope: {resetScope === 'today' ? "Today's IST Session" : 'All-Time Records'}
            </p>
            <p className="text-muted-foreground text-[11px]">
              Note: This only purges latency telemetry metrics. Your broker order records in TradeBook
              remain completely untouched.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsResetDialogOpen(false)}
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleResetConfirm}
              disabled={isResetting}
            >
              {isResetting ? 'Resetting...' : 'Yes, Reset Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
