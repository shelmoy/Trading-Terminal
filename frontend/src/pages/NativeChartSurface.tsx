import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ChartPane } from '@/components/trading/ChartPane'
import type { TradingTerminal } from '@/lib/trading/terminal'
import { CHART_TYPE_GROUPS } from '@/lib/trading/chartTypes'
import { useThemeStore } from '@/stores/themeStore'

/** Dedicated SDK canvas for the native Android host, without the website shell. */
export default function NativeChartSurface() {
  const [params] = useSearchParams()
  const [connection, setConnection] = useState<{ key: string; ws: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [terminal, setTerminal] = useState<TradingTerminal | null>(null)
  const [switching, setSwitching] = useState(true)
  const [toolsOpen, setToolsOpen] = useState(params.get('tools') === '1')
  const symbol = params.get('symbol') || 'NIFTY'
  const exchange = params.get('exchange') || 'NSE_INDEX'
  const pane = ['spot', 'call', 'put'].includes(params.get('pane') || '') ? params.get('pane')! : 'spot'
  const interval = params.get('interval') || '1m'
  const chartType = params.get('chartType') || 'candlestick'
  const receiveTerminal = useCallback((_: string, value: TradingTerminal | null) => setTerminal(value), [])

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      fetch('/api/websocket/apikey', { signal: controller.signal }).then(r => r.json()),
      fetch('/api/websocket/config', { signal: controller.signal }).then(r => r.json()),
    ]).then(([key, config]) => {
      if (controller.signal.aborted) return
      if (key.status !== 'success' || typeof key.api_key !== 'string') throw new Error('Connect your broker to load charts')
      const ws = new URL(config.websocket_url)
      if (ws.protocol !== 'wss:' || ws.host !== location.host || ws.pathname !== '/ws') throw new Error('Private chart connection is not configured')
      setConnection({ key: key.api_key, ws: ws.href })
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Chart unavailable') })
    void useThemeStore.getState().syncAppMode()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!terminal) return
    setSwitching(true)
    if (['1m', '3m', '5m', '15m', '1h', 'D'].includes(interval)) terminal.setInterval(interval)
    if (CHART_TYPE_GROUPS.flat().some(type => type.value === chartType)) terminal.setChartType(chartType)
    if (symbol.length > 128 || exchange.length > 24 || !/^[A-Z_]+$/.test(exchange)) {
      setError('Invalid chart instrument'); return
    }
    let active = true
    void terminal.ensureSymbol({ symbol, exchange }).then(loaded => {
      if (active && !loaded) setError('Could not load this instrument')
      if (active && loaded) setSwitching(false)
    }).catch(() => { if (active) setError('Could not load this instrument') })
    return () => { active = false }
  }, [terminal, symbol, exchange, interval, chartType])

  useEffect(() => {
    if (!terminal) return
    const change = (event: Event) => {
      const value = (event as CustomEvent).detail
      // Presentation only. No native order command or user-supplied JavaScript.
      if (!value || typeof value !== 'object') return
      if (typeof value.tools === 'boolean') setToolsOpen(value.tools)
      if (['1m', '3m', '5m', '15m', '1h', 'D'].includes(value.interval)) terminal.setInterval(value.interval)
      if (CHART_TYPE_GROUPS.flat().some(type => type.value === value.chartType)) terminal.setChartType(value.chartType)
    }
    window.addEventListener('terminal-native-chart', change)
    return () => window.removeEventListener('terminal-native-chart', change)
  }, [terminal])

  if (error) return <div role="alert" className="flex h-dvh items-center justify-center p-6 text-sm text-muted-foreground">{error}</div>
  if (!connection) return <div role="status" className="flex h-dvh items-center justify-center text-sm text-muted-foreground">Connecting chart…</div>
  return <div className="h-dvh w-full overflow-hidden bg-background">
    <ChartPane paneId={`native-android-${pane}`} apiKey={connection.key} wsUrl={connection.ws}
      transitionLocked={switching}
      toolbarHost={toolsOpen ? undefined : null} armed={false} railVisible={false} onInitialized={receiveTerminal}
      onTerminalChange={(_, value) => { if (!value) setTerminal(null) }} />
  </div>
}
