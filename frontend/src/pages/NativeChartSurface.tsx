import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ChartPane } from '@/components/trading/ChartPane'
import type { TradingTerminal } from '@/lib/trading/terminal'
import { CHART_TYPE_GROUPS } from '@/lib/trading/chartTypes'
import { useThemeStore } from '@/stores/themeStore'
import { sendNative } from '@/lib/mobileTerminal'
import { ChartOrderBridgeContext, type ChartOrderBridgeRef } from '@/components/trading/dock/chartOrderBridge'
import { TradingDock } from '@/components/trading/dock/TradingDock'
import { PlaceOrderDialog, type TicketOrder } from '@/components/trading/PlaceOrderDialog'
const OptionChainPanel = lazy(() => import('@/components/trading/OptionChainPanel').then(m => ({ default: m.OptionChainPanel })))

/** Dedicated SDK canvas for the native Android host, without the website shell. */
export default function NativeChartSurface() {
  const [params] = useSearchParams()
  const [connection, setConnection] = useState<{ key: string; ws: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [terminal, setTerminal] = useState<TradingTerminal | null>(null)
  const [switching, setSwitching] = useState(true)
  const [toolsOpen, setToolsOpen] = useState(params.get('tools') === '1')
  const [revision, setRevision] = useState(0)
  const [indicatorRequest, setIndicatorRequest] = useState(0)
  const [panel, setPanel] = useState<'chain' | 'orders' | 'positions' | null>(null)
  const bridge = useRef(null) as ChartOrderBridgeRef
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [side, setSide] = useState<'BUY' | 'SELL' | null>(null)
  const selectionTicket = useRef(0)
  useEffect(() => { selectionTicket.current++; return () => { selectionTicket.current++ } }, [terminal])
  const [lots, setLots] = useState(1)
  const instrument = terminal?.currentInstrument()
  const locked = useCallback(() => !terminal || switching || terminal.replayState() !== null, [terminal, switching])
  const place = useCallback((order: TicketOrder) => {
    if (locked() || !terminal) return Promise.reject(new Error('Chart is loading or replaying. Return to the live chart before placing an order.'))
    return terminal.placeTicket(order)
  }, [terminal, locked])
  const request = params.get('native_request') || ''
  const scope = params.get('native_scope') || ''
  const symbol = params.get('symbol') || 'NIFTY'
  const exchange = params.get('exchange') || 'NSE_INDEX'
  const pane = ['spot', 'call', 'put', 'contract'].includes(params.get('pane') || '') ? params.get('pane')! : 'spot'
  const interval = params.get('interval') || '1m'
  const chartType = params.get('chartType') || 'candlestick'
  const receiveTerminal = useCallback((_: string, value: TradingTerminal | null) => setTerminal(value), [])
  const failInitialization = useCallback(() => setError('Chart could not initialize. Reload the chart or check your broker connection.'), [])
  const pickContract = useCallback((row: { symbol: string; exchange: string }) => {
    if (!terminal) return
    const ticket = ++selectionTicket.current
    setSide(null); setSwitching(true)
    void terminal.ensureSymbol(row).then(ok => {
      if (ok && ticket === selectionTicket.current) {
        setSelectedSymbol(`${row.exchange}:${row.symbol}`); setPanel(null)
        sendNative({ type: 'chart-contract-selection', request, scope, symbol: row.symbol, exchange: row.exchange })
      }
    }).catch(() => { if (ticket === selectionTicket.current) setError('Could not load the selected contract') })
      .finally(() => { if (ticket === selectionTicket.current) setSwitching(false) })
  }, [terminal, request, scope])

  useEffect(() => {
    const report = () => sendNative({ type: 'chart-state', request, state: error ? 'error' : switching ? 'loading' : 'ready', message: error || '' })
    report()
    window.addEventListener('focus', report)
    return () => window.removeEventListener('focus', report)
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
  return <ChartOrderBridgeContext.Provider value={bridge}><div data-native-chart="true" className="relative flex h-dvh w-full flex-col overflow-hidden bg-background">
    <div className="min-h-0 flex-1">
    <ChartPane paneId={`native-android-${pane}`} apiKey={connection.key} wsUrl={connection.ws}
      indicatorRequest={indicatorRequest}
      onSymbolChange={(_, value) => {
        setSelectedSymbol(value); setSide(null); setLots(1)
        if (value && value.includes(':')) sendNative({ type: 'chart-symbol', request, scope, exchange: value.slice(0, value.indexOf(':')), symbol: value.slice(value.indexOf(':') + 1) })
      }}
      transitionLocked={switching}
      toolbarHost={toolsOpen ? undefined : null} armed={false} railVisible={false} onInitialized={receiveTerminal}
      onInitializationError={failInitialization}
      onTerminalChange={(_, value) => { if (!value) setTerminal(null) }} />
    </div>
    {instrument && !instrument.quoteOnly && !instrument.synthetic && <div className="flex shrink-0 items-center gap-2 border-t bg-background p-2 text-xs" aria-label="Contract order controls">
      <button className="h-11 flex-1 rounded-lg bg-red-700 text-white" disabled={locked()} onClick={() => setSide('SELL')}>Sell</button>
      <label className="flex items-center gap-1">{instrument.lots ? 'Lots' : 'Qty'}<input aria-label="Order lots or quantity" type="number" min="1" step="1" value={lots} onChange={e => setLots(Math.max(1, Math.floor(Number(e.target.value) || 1)))} className="h-11 w-16 rounded-lg border bg-background px-2" /></label>
      <button className="h-11 flex-1 rounded-lg bg-emerald-700 text-white" disabled={locked()} onClick={() => setSide('BUY')}>Buy</button>
    </div>}
    <nav aria-label="Chart workspace" className="flex shrink-0 items-center justify-around border-t bg-background text-xs">
      <button className="min-h-11 px-2" onClick={() => setIndicatorRequest(v => v + 1)}>Indicators</button>
      <button className="min-h-11 px-2" onClick={() => setPanel(p => p === 'chain' ? null : 'chain')}>Option chain</button>
      <button className="min-h-11 px-2" onClick={() => setPanel(p => p === 'orders' ? null : 'orders')}>Orders</button>
      <button className="min-h-11 px-2" onClick={() => setPanel(p => p === 'positions' ? null : 'positions')}>Positions</button>
    </nav>
    {panel === 'chain' && <section aria-label="Option chain" className="absolute inset-x-0 bottom-11 z-30 h-[65%] overflow-auto border-t bg-background shadow-xl">
      <button className="absolute right-2 top-1 z-40 min-h-11 px-3" onClick={() => setPanel(null)} aria-label="Close option chain">Close</button>
      <Suspense fallback={<p>Loading option chain…</p>}><OptionChainPanel apiKey={connection.key} place={place} activeSymbol={selectedSymbol || `${exchange}:${symbol}`}
        onPick={pickContract} /></Suspense>
    </section>}
    <div className={panel === 'orders' || panel === 'positions' ? 'absolute inset-x-0 bottom-11 z-30 max-h-[65%] overflow-auto bg-background' : 'hidden'}>
    <TradingDock apiKey={connection.key} tab={panel === 'orders' || panel === 'positions' ? panel : null}
      onTabChange={tab => setPanel(tab === 'orders' || tab === 'positions' ? tab : null)}
      activeSymbol={selectedSymbol || `${exchange}:${symbol}`} tradingLocked={locked} bridge={bridge}
      onPick={pickContract} />
    </div>
    {side && instrument && <PlaceOrderDialog open onOpenChange={open => { if (!open) setSide(null) }} symbol={instrument.symbol} exchange={instrument.exchange}
      action={side} quantity={lots * (instrument.lots ? instrument.lotsize : 1)} lotSize={instrument.lotsize} tickSize={instrument.tick}
      product={instrument.product as 'MIS' | 'NRML' | 'CNC'} place={place} onSuccess={() => setSide(null)} />}
  </div></ChartOrderBridgeContext.Provider>
}
