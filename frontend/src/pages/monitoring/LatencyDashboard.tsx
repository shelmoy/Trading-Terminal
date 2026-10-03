import {
  Activity,
  ArrowLeft,
  Calendar,
  Clock,
  Cpu,
  Download,
  Flame,
  Gauge,
  Layers,
  RefreshCw,
  RotateCcw,
  Server,
  Sparkles,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { webClient } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
  total_orders: number
  failed_orders: number
  avg_rtt: number
  avg_validation: number
  avg_response: number
  avg_overhead: number
  avg_total: number
  min_total: number
  max_total: number
  p50_total: number
  p99_total: number
  sla_150ms: number
}

interface LatencyStats {
  session_date?: string
  session_only?: boolean
  session_start_utc?: string
  total_orders: number
  success_rate: number
  failed_orders: number
  avg_rtt?: number
  avg_validation?: number
  avg_response?: number
  avg_overhead?: number
  avg_total: number
  min_total?: number
  max_total?: number
  p50_total?: number
  p90_total?: number
  p95_total?: number
  p99_total?: number
  sla_50ms?: number
  sla_100ms?: number
  sla_150ms: number
  sla_200ms?: number
  broker_stats: Record<string, BrokerStats>
  broker_histograms?: Record<
    string,
    {
      bins: string[]
      counts: number[]
      avg_rtt: number
      min_rtt: number
      max_rtt: number
    }
  >
}

export default function LatencyDashboard() {
  const [isLoading, setIsLoading] = useState(true)
  const [sessionOnly, setSessionOnly] = useState(true)
  const [logs, setLogs] = useState<LatencyLog[]>([])
  const [stats, setStats] = useState<LatencyStats | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<LatencyLog | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [selectedBrokerFilter, setSelectedBrokerFilter] = useState<string>('ALL')

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [sessionOnly])

  const fetchData = async () => {
    try {
      const [logsResponse, statsResponse] = await Promise.all([
        webClient.get<LatencyLog[]>(`/latency/api/logs?session_only=${sessionOnly}&limit=200`),
        webClient.get<LatencyStats>(`/latency/api/stats?session_only=${sessionOnly}`),
      ])

      setLogs(Array.isArray(logsResponse.data) ? logsResponse.data : [])
      setStats(statsResponse.data)
    } catch (_error) {
      showToast.error('Failed to load latency data', 'monitoring')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await fetchData()
    setIsRefreshing(false)
    showToast.success('Latency metrics refreshed', 'monitoring')
  }

  const handleReset = async () => {
    setIsResetting(true)
    try {
      const res = await webClient.post('/latency/api/reset')
      if (res.data?.stats) {
        setStats(res.data.stats)
      }
      await fetchData()
      showToast.success('Daily latency metrics cache re-synchronized', 'monitoring')
    } catch (_e) {
      showToast.error('Failed to reset latency cache', 'monitoring')
    } finally {
      setIsResetting(false)
    }
  }

  const handleExport = () => {
    window.open('/latency/export', '_blank')
  }

  const getSpeedRating = (
    latency: number
  ): {
    label: string
    color: string
    badgeBg: string
    variant: 'default' | 'secondary' | 'destructive' | 'outline'
  } => {
    if (latency < 50) {
      return {
        label: 'Ultra Fast (<50ms)',
        color: 'text-emerald-400',
        badgeBg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        variant: 'secondary',
      }
    }
    if (latency < 150) {
      return {
        label: 'Fast (<150ms)',
        color: 'text-green-400',
        badgeBg: 'bg-green-500/15 text-green-400 border-green-500/30',
        variant: 'secondary',
      }
    }
    if (latency < 250) {
      return {
        label: 'Moderate (150-250ms)',
        color: 'text-amber-400',
        badgeBg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        variant: 'outline',
      }
    }
    if (latency < 500) {
      return {
        label: 'Acceptable (250-500ms)',
        color: 'text-orange-400',
        badgeBg: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
        variant: 'outline',
      }
    }
    return {
      label: 'Lagging (>500ms)',
      color: 'text-rose-400',
      badgeBg: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      variant: 'destructive',
    }
  }

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
        hour12: false,
      })
    } catch {
      return timestamp
    }
  }

  const filteredLogs = useMemo(() => {
    if (selectedBrokerFilter === 'ALL') return logs
    return logs.filter((l) => (l.broker || '').toUpperCase() === selectedBrokerFilter.toUpperCase())
  }, [logs, selectedBrokerFilter])

  // Distribution buckets
  const distribution = useMemo(() => {
    const ultra = filteredLogs.filter((l) => (l.total_latency_ms || 0) < 50).length
    const fast = filteredLogs.filter(
      (l) => (l.total_latency_ms || 0) >= 50 && (l.total_latency_ms || 0) < 150
    ).length
    const moderate = filteredLogs.filter(
      (l) => (l.total_latency_ms || 0) >= 150 && (l.total_latency_ms || 0) < 300
    ).length
    const high = filteredLogs.filter((l) => (l.total_latency_ms || 0) >= 300).length
    const total = filteredLogs.length || 1
    return { ultra, fast, moderate, high, total }
  }, [filteredLogs])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="relative">
          <div className="h-14 w-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <Zap className="h-6 w-6 text-primary absolute inset-0 m-auto animate-pulse" />
        </div>
        <p className="text-sm font-medium text-muted-foreground animate-pulse">
          Connecting to Real-time Latency Engine...
        </p>
      </div>
    )
  }

  const brokerList = stats?.broker_stats ? Object.keys(stats.broker_stats) : []

  return (
    <TooltipProvider>
      <div className="py-6 space-y-6 max-w-7xl mx-auto px-2 sm:px-4">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-card/80 to-card/40 p-5 rounded-2xl border border-border/60 shadow-lg shadow-black/5 backdrop-blur-md">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <Link
                to="/dashboard"
                className="p-1.5 rounded-lg bg-secondary/80 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Back to Dashboard"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                  <Gauge className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                    Latency & Order Execution Engine
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    End-to-end network RTT, broker confirmation speed, and platform processing analytics
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Session Auto-Reset Badge */}
            <div className="flex items-center gap-2 bg-secondary/60 px-3 py-1.5 rounded-xl border border-border/80 text-xs">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span className="text-muted-foreground">Session:</span>
              <span className="font-semibold text-foreground">
                {stats?.session_date || 'Today'}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] py-0 px-1.5 cursor-pointer">
                    Auto-resets 03:00 IST
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    Metrics auto-reset daily matching market rollover at 03:00 AM IST.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Filter Toggle: Today vs All Time */}
            <div className="inline-flex rounded-xl p-0.5 bg-secondary/80 border border-border/80">
              <button
                type="button"
                onClick={() => setSessionOnly(true)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                  sessionOnly
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Today's Session
              </button>
              <button
                type="button"
                onClick={() => setSessionOnly(false)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                  !sessionOnly
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All-Time History
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="rounded-xl border-border/80 shadow-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isResetting}
              className="rounded-xl border-border/80 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors shadow-xs"
              title="Clear stats cache and force re-aggregate"
            >
              <RotateCcw className={`h-3.5 w-3.5 mr-1.5 ${isResetting ? 'animate-spin' : ''}`} />
              Reset Cache
            </Button>

            <Button
              size="sm"
              onClick={handleExport}
              className="rounded-xl shadow-xs"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              CSV
            </Button>
          </div>
        </div>

        {/* Primary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Orders */}
          <Card className="rounded-2xl border-border/60 bg-gradient-to-b from-card to-card/60 shadow-sm relative overflow-hidden group hover:border-border transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Zap className="h-16 w-16 text-primary" />
            </div>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Orders Processed
                </span>
                <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0 bg-secondary/50">
                  {sessionOnly ? "Today" : "Lifetime"}
                </Badge>
              </div>
              <div className="text-3xl font-extrabold tracking-tight text-foreground">
                {stats?.total_orders?.toLocaleString() || 0}
              </div>
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <Activity className="h-3.5 w-3.5 text-primary" />
                <span>
                  {stats?.failed_orders || 0} failed / rejected
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Average Confirmation */}
          <Card className="rounded-2xl border-border/60 bg-gradient-to-b from-card to-card/60 shadow-sm relative overflow-hidden group hover:border-border transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Clock className="h-16 w-16 text-primary" />
            </div>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Avg Confirmation Time
                </span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${getSpeedRating(stats?.avg_total || 0).badgeBg}`}>
                  {getSpeedRating(stats?.avg_total || 0).label.split(' ')[0]}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-extrabold tracking-tight ${getSpeedRating(stats?.avg_total || 0).color}`}>
                  {(stats?.avg_total || 0).toFixed(1)}
                </span>
                <span className="text-sm font-semibold text-muted-foreground">ms</span>
              </div>
              <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground font-mono">
                <span>RTT: {(stats?.avg_rtt || 0).toFixed(1)}ms</span>
                <span>•</span>
                <span>Ovhd: {(stats?.avg_overhead || 0).toFixed(1)}ms</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Median / P99 */}
          <Card className="rounded-2xl border-border/60 bg-gradient-to-b from-card to-card/60 shadow-sm relative overflow-hidden group hover:border-border transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <TrendingUp className="h-16 w-16 text-emerald-500" />
            </div>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Median (P50) & Tail (P99)
                </span>
                <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 bg-secondary/50">
                  Reliability
                </Badge>
              </div>
              <div className="flex items-baseline gap-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold tracking-tight text-emerald-400">
                    {(stats?.p50_total || 0).toFixed(1)}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">ms (P50)</span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                <span>99th Percentile:</span>
                <span className="font-mono font-semibold text-foreground">
                  {(stats?.p99_total || 0).toFixed(1)}ms
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: SLA Target */}
          <Card className="rounded-2xl border-border/60 bg-gradient-to-b from-card to-card/60 shadow-sm relative overflow-hidden group hover:border-border transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Flame className="h-16 w-16 text-emerald-500" />
            </div>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Sub-150ms Execution SLA
                </span>
                <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  Target: 95%
                </Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-extrabold tracking-tight ${
                  (stats?.sla_150ms || 0) >= 90 ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  {(stats?.sla_150ms || 0).toFixed(1)}%
                </span>
                <span className="text-xs text-muted-foreground">compliance</span>
              </div>
              <div className="mt-3">
                <Progress
                  value={stats?.sla_150ms || 0}
                  className="h-1.5 bg-secondary/80"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Breakdown: Speed Distribution & Architecture Timing */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Latency Distribution Breakdown */}
          <Card className="lg:col-span-2 rounded-2xl border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    Latency Distribution Spectrum
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Realized confirmation speeds across processed orders
                  </CardDescription>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {filteredLogs.length} sampled
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stacked bar visual */}
              <div className="h-3 w-full rounded-full overflow-hidden flex bg-secondary/40 border border-border/50">
                <div
                  style={{ width: `${(distribution.ultra / distribution.total) * 100}%` }}
                  className="bg-emerald-400 transition-all duration-500"
                  title={`<50ms: ${distribution.ultra} orders`}
                />
                <div
                  style={{ width: `${(distribution.fast / distribution.total) * 100}%` }}
                  className="bg-green-500 transition-all duration-500"
                  title={`50-150ms: ${distribution.fast} orders`}
                />
                <div
                  style={{ width: `${(distribution.moderate / distribution.total) * 100}%` }}
                  className="bg-amber-400 transition-all duration-500"
                  title={`150-300ms: ${distribution.moderate} orders`}
                />
                <div
                  style={{ width: `${(distribution.high / distribution.total) * 100}%` }}
                  className="bg-rose-500 transition-all duration-500"
                  title={`>300ms: ${distribution.high} orders`}
                />
              </div>

              {/* Bucket Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-400">Ultra Fast</span>
                    <span className="text-[10px] text-muted-foreground font-mono">&lt;50ms</span>
                  </div>
                  <div className="text-xl font-bold mt-1 text-foreground">
                    {distribution.ultra}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {((distribution.ultra / distribution.total) * 100).toFixed(1)}%
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-green-400">Standard Fast</span>
                    <span className="text-[10px] text-muted-foreground font-mono">50-150ms</span>
                  </div>
                  <div className="text-xl font-bold mt-1 text-foreground">
                    {distribution.fast}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {((distribution.fast / distribution.total) * 100).toFixed(1)}%
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-400">Moderate</span>
                    <span className="text-[10px] text-muted-foreground font-mono">150-300ms</span>
                  </div>
                  <div className="text-xl font-bold mt-1 text-foreground">
                    {distribution.moderate}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {((distribution.moderate / distribution.total) * 100).toFixed(1)}%
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-rose-400">Lagging</span>
                    <span className="text-[10px] text-muted-foreground font-mono">&gt;300ms</span>
                  </div>
                  <div className="text-xl font-bold mt-1 text-foreground">
                    {distribution.high}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {((distribution.high / distribution.total) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Internal Processing vs Network RTT Architecture */}
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                Pipeline Breakdown
              </CardTitle>
              <CardDescription className="text-xs">
                Platform overhead vs broker HTTP transit
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3.5 rounded-xl bg-secondary/50 border border-border/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold flex items-center gap-1.5">
                    <Server className="h-3.5 w-3.5 text-primary" /> Broker Network RTT
                  </span>
                  <span className="font-mono font-bold text-foreground">
                    {(stats?.avg_rtt || 0).toFixed(2)}ms
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Network transit to broker API gateway, exchange risk checks, and matching confirmation.
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-secondary/50 border border-border/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-400" /> Platform Pre-Validation
                  </span>
                  <span className="font-mono font-bold text-emerald-400">
                    {(stats?.avg_validation || 0).toFixed(3)}ms
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Sub-millisecond token check, schema sanitization, and symbol transformation.
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-secondary/50 border border-border/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-amber-400" /> Post-Response & Logging
                  </span>
                  <span className="font-mono font-bold text-foreground">
                    {(stats?.avg_response || 0).toFixed(3)}ms
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Asynchronous trade logging, database telemetry, and client serialization.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Broker Breakdown Card */}
        {stats?.broker_stats && Object.keys(stats.broker_stats).length > 0 && (
          <Card className="rounded-2xl border-border/60 shadow-sm overflow-hidden">
            <CardHeader className="bg-secondary/20 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Server className="h-4 w-4 text-primary" />
                    Broker Gateway Benchmarks
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Live connection performance per broker endpoint
                  </CardDescription>
                </div>
                {brokerList.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant={selectedBrokerFilter === 'ALL' ? 'default' : 'outline'}
                      onClick={() => setSelectedBrokerFilter('ALL')}
                      className="text-xs h-7 rounded-lg"
                    >
                      All Brokers
                    </Button>
                    {brokerList.map((broker) => (
                      <Button
                        key={broker}
                        size="sm"
                        variant={selectedBrokerFilter === broker ? 'default' : 'outline'}
                        onClick={() => setSelectedBrokerFilter(broker)}
                        className="text-xs h-7 rounded-lg capitalize"
                      >
                        {broker}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/60 hover:bg-transparent">
                      <TableHead className="font-bold text-xs uppercase text-muted-foreground">Broker Gateway</TableHead>
                      <TableHead className="font-bold text-xs uppercase text-muted-foreground">Avg Latency</TableHead>
                      <TableHead className="font-bold text-xs uppercase text-muted-foreground">Median (P50)</TableHead>
                      <TableHead className="font-bold text-xs uppercase text-muted-foreground">99th Percentile</TableHead>
                      <TableHead className="font-bold text-xs uppercase text-muted-foreground">Validation</TableHead>
                      <TableHead className="font-bold text-xs uppercase text-muted-foreground">SLA (&lt;150ms)</TableHead>
                      <TableHead className="font-bold text-xs uppercase text-muted-foreground">Total Orders</TableHead>
                      <TableHead className="font-bold text-xs uppercase text-muted-foreground">Grade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(stats.broker_stats).map(([broker, data]) => {
                      const rating = getSpeedRating(data.avg_total)
                      return (
                        <TableRow key={broker} className="border-border/40 hover:bg-secondary/30 transition-colors">
                          <TableCell className="font-semibold capitalize flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            {broker}
                          </TableCell>
                          <TableCell>
                            <span className="font-mono font-bold text-foreground">
                              {data.avg_total?.toFixed(2)}ms
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground">
                            {data.p50_total?.toFixed(2)}ms
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground">
                            {data.p99_total?.toFixed(2)}ms
                          </TableCell>
                          <TableCell className="font-mono text-emerald-400">
                            {(data.avg_validation || 0).toFixed(3)}ms
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-xs">
                                {data.sla_150ms?.toFixed(1)}%
                              </span>
                              <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-400"
                                  style={{ width: `${Math.min(100, data.sla_150ms)}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono font-medium">
                            {data.total_orders?.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge className={`${rating.badgeBg} border text-[11px] font-semibold py-0.5 px-2`}>
                              {rating.label.split(' ')[0]}
                            </Badge>
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

        {/* Live Orders Table */}
        <Card className="rounded-2xl border-border/60 shadow-sm overflow-hidden">
          <CardHeader className="bg-secondary/20 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Live Order Latency Stream
                </CardTitle>
                <CardDescription className="text-xs">
                  Real-time chronologically sorted order execution events
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs font-mono self-start sm:self-center">
                Showing {filteredLogs.length} events
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60 hover:bg-transparent">
                    <TableHead className="font-bold text-xs uppercase text-muted-foreground">IST Time</TableHead>
                    <TableHead className="font-bold text-xs uppercase text-muted-foreground">Order ID</TableHead>
                    <TableHead className="font-bold text-xs uppercase text-muted-foreground">Broker</TableHead>
                    <TableHead className="font-bold text-xs uppercase text-muted-foreground">Symbol</TableHead>
                    <TableHead className="font-bold text-xs uppercase text-muted-foreground">Action</TableHead>
                    <TableHead className="font-bold text-xs uppercase text-muted-foreground">Total Confirmation</TableHead>
                    <TableHead className="font-bold text-xs uppercase text-muted-foreground">Status</TableHead>
                    <TableHead className="text-right font-bold text-xs uppercase text-muted-foreground">Inspector</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Gauge className="h-8 w-8 text-muted-foreground/40" />
                          <p className="text-sm">No order latency events recorded for this session.</p>
                          <p className="text-xs text-muted-foreground">Execute an order to stream live telemetry.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs.map((log) => {
                      const rating = getSpeedRating(log.total_latency_ms || 0)
                      return (
                        <TableRow key={log.id} className="border-border/40 hover:bg-secondary/30 transition-colors">
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {formatTimestamp(log.timestamp)}
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-foreground">
                            {log.order_id || 'N/A'}
                          </TableCell>
                          <TableCell className="capitalize text-xs font-medium">
                            {log.broker || 'Kotak'}
                          </TableCell>
                          <TableCell className="font-semibold text-xs text-foreground">
                            {log.symbol || 'N/A'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] font-mono py-0 px-1.5">
                              {log.order_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className={`font-mono font-bold text-xs ${rating.color}`}>
                              {(log.total_latency_ms || 0).toFixed(2)}ms
                            </span>
                          </TableCell>
                          <TableCell>
                            {log.status === 'SUCCESS' ? (
                              <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] py-0 px-1.5">
                                SUCCESS
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px] py-0 px-1.5">
                                {log.status}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedOrder(log)}
                              className="h-7 text-xs font-medium hover:bg-primary/10 hover:text-primary transition-colors rounded-lg"
                            >
                              Inspect
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

        {/* Order Details Modal */}
        <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
          <DialogContent className="max-w-xl rounded-2xl bg-card border-border/80 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Gauge className="h-5 w-5 text-primary" />
                Order Telemetry Inspector
              </DialogTitle>
              <DialogDescription className="text-xs">
                Complete execution pipeline latency for order {selectedOrder?.order_id}
              </DialogDescription>
            </DialogHeader>

            {selectedOrder && (
              <div className="space-y-4 pt-2">
                {/* Meta Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-secondary/50 border border-border/80">
                    <p className="text-xs text-muted-foreground">Order ID & Symbol</p>
                    <p className="font-mono font-bold text-sm text-foreground truncate mt-0.5">
                      {selectedOrder.order_id}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedOrder.symbol} ({selectedOrder.order_type})
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-secondary/50 border border-border/80">
                    <p className="text-xs text-muted-foreground">Performance Class</p>
                    <p className={`font-bold text-sm mt-0.5 ${getSpeedRating(selectedOrder.total_latency_ms).color}`}>
                      {getSpeedRating(selectedOrder.total_latency_ms).label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 capitalize">
                      Broker: {selectedOrder.broker || 'Kotak'}
                    </p>
                  </div>
                </div>

                {/* Microsecond Pipeline Visual */}
                <div className="p-4 rounded-xl bg-secondary/30 border border-border/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Total Confirmation Time
                    </span>
                    <span className="text-xl font-extrabold text-primary font-mono">
                      {(selectedOrder.total_latency_ms || 0).toFixed(2)}ms
                    </span>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border/60">
                    {/* Step 1: Validation */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Platform Validation & Auth
                      </span>
                      <span className="font-mono font-semibold text-emerald-400">
                        {(selectedOrder.validation_latency_ms || 0).toFixed(3)}ms
                      </span>
                    </div>

                    {/* Step 2: Broker Transit */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        Broker Network RTT & Matching
                      </span>
                      <span className="font-mono font-semibold text-primary">
                        {(selectedOrder.rtt_ms || 0).toFixed(2)}ms
                      </span>
                    </div>

                    {/* Step 3: Platform Post-Processing */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        Post-Response Formatting & Logging
                      </span>
                      <span className="font-mono font-semibold text-amber-400">
                        {(selectedOrder.response_latency_ms || 0).toFixed(3)}ms
                      </span>
                    </div>
                  </div>
                </div>

                {/* Error Banner if any */}
                {selectedOrder.error && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5">
                    <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-bold text-rose-400">Rejection / Error Message:</span>
                      <p className="text-xs text-muted-foreground mt-0.5 break-all font-mono">
                        {selectedOrder.error}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
