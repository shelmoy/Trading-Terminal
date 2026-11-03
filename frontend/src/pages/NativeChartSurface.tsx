import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ChartPane } from '@/components/trading/ChartPane'
import type { TradingTerminal } from '@/lib/trading/terminal'
import { CHART_TYPE_GROUPS } from '@/lib/trading/chartTypes'
import { useThemeStore } from '@/stores/themeStore'
import { sendNative } from '@/lib/mobileTerminal'

/** Dedicated SDK canvas for the native Android host, without the website shell. */
export default function NativeChartSurface() {
  const [params] = useSearchParams()
  const [connection, setConnection] = useState<{ key: string; ws: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [terminal, setTerminal] = useState<TradingTerminal | null>(null)
  const [switching, setSwitching] = useState(true)
  const [toolsOpen, setToolsOpen] = useState(params.get('tools') === '1')
  const [revision, setRevision] = useState(0)
  const request = params.get('native_request') || ''
  const scope = params.get('native_scope') || ''
  const symbol = params.get('symbol') || 'NIFTY'
  const exchange = params.get('exchange') || 'NSE_INDEX'
  const pane = ['spot', 'call', 'put'].includes(params.get('pane') || '') ? params.get('pane')! : 'spot'
  const interval = params.get('interval') || '1m'
  const chartType = params.get('chartType') || 'candlestick'
  const receiveTerminal = useCallback((_: string, value: TradingTerminal | null) => setTerminal(value), [])
  const failInitialization = useCallback(() => setError('Chart could not initialize. Reload the chart or check your broker connection.'), [])

  useEffect(() => {
    sendNative({ type: 'chart-state', request, state: error ? 'error' : switching ? 'loading' : 'ready', message: error || '' })
  }, [request, error, switching])

  useEffect(() => {
    const controller = new AbortController()
    let disposed = false
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    setError(null); setConnection(null); setTerminal(null); setSwitching(true)
    void Promise.all([
      fetch('/api/websocket/apikey', { credentials: 'include', signal: controller.signal }).then(r => {
        if (!r.ok) throw new Error('Connect your broker again to load charts')
        return r.json()
      }),
      fetch('/api/websocket/config', { credentials: 'include', signal: controller.signal }).then(r => {
        if (!r.ok) throw new Error('Private chart connection is unavailable')
        return r.json()
      }),
    ]).then(([key, config]) => {
      if (controller.signal.aborted) return
      if (key.status !== 'success' || typeof key.api_key !== 'string') throw new Error('Connect your broker to load charts')
      const ws = new URL(config.websocket_url)
      if (ws.protocol !== 'wss:' || ws.host !== location.host || ws.pathname !== '/ws') throw new Error('Private chart connection is not configured')
      setConnection({ key: key.api_key, ws: ws.href })
    }).catch(e => { if (!disposed) setError(controller.signal.aborted ? 'Chart connection timed out. Check Tailscale and retry.' : e instanceof Error ? e.message : 'Chart unavailable') })
      .finally(() => window.clearTimeout(timeout))
    void useThemeStore.getState().syncAppMode()
    return () => { disposed = true; window.clearTimeout(timeout); controller.abort() }
  }, [revision])

  useEffect(() => {
    if (!terminal) return
    setSwitching(true)
    const actualType = CHART_TYPE_GROUPS.flat().some(type => type.value === chartType) ? terminal.setChartType(chartType) : undefined
    const actualInterval = ['1m', '3m', '5m', '15m', '1h', 'D'].includes(interval) ? terminal.setInterval(interval) : undefined
    sendNative({ type: 'chart-presentation', request, scope, chartType: actualType, interval: actualInterval })
    if (symbol.length > 128 || exchange.length > 24 || !/^[A-Z_]+$/.test(exchange)) {
      setError('Invalid chart instrument'); return
    }
    let active = true
    void terminal.ensureSymbol({ symbol, exchange }).then(loaded => {
      if (active && !loaded) setError('Could not load this instrument')
      if (active && loaded) setSwitching(false)
    }).catch(() => { if (active) setError('Could not load this instrument') })
    return () => { active = false }
  }, [terminal, symbol, exchange, interval, chartType, request, scope])

  useEffect(() => {
    if (!terminal) return
    const change = (event: Event) => {
      const value = (event as CustomEvent).detail
      // Presentation only. No native order command or user-supplied JavaScript.
      if (!value || typeof value !== 'object') return
      if (typeof value.tools === 'boolean') setToolsOpen(value.tools)
      const actualType = CHART_TYPE_GROUPS.flat().some(type => type.value === value.chartType) ? terminal.setChartType(value.chartType) : undefined
      const actualInterval = ['1m', '3m', '5m', '15m', '1h', 'D'].includes(value.interval) ? terminal.setInterval(value.interval) : undefined
      sendNative({ type: 'chart-presentation', request, scope, chartType: actualType, interval: actualInterval })
    }
    window.addEventListener('terminal-native-chart', change)
    return () => window.removeEventListener('terminal-native-chart', change)
  }, [terminal, request, scope])

  if (error) return <div role="alert" className="flex h-dvh flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted-foreground">
    <p>{error}</p><button type="button" className="rounded-lg bg-primary px-4 py-3 text-primary-foreground" onClick={() => setRevision(v => v + 1)}>Retry chart</button>
  </div>
  if (!connection) return <div role="status" className="flex h-dvh items-center justify-center text-sm text-muted-foreground">Connecting chart…</div>
  return <div data-native-chart="true" className="h-dvh w-full overflow-hidden bg-background">
    <ChartPane paneId={`native-android-${pane}`} apiKey={connection.key} wsUrl={connection.ws}
      transitionLocked={switching}
      toolbarHost={toolsOpen ? undefined : null} armed={false} railVisible={false} onInitialized={receiveTerminal}
      onInitializationError={failInitialization}
      onTerminalChange={(_, value) => { if (!value) setTerminal(null) }} />
  </div>
}
