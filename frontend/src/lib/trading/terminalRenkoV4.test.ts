import {
  type Bar,
  CandleBuilder,
  type createChart,
  type SeriesApi,
  type SeriesTransformSpec,
  type DataLoadingSnapshot,
} from 'openalgo-charts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHART_TYPES } from './chartTypes'
import { renkoV4HistoryInterval, renkoV4Options, renkoV4SettingsView } from './renkoV4Settings'
import { renkoV4RunKeys } from './renkoV4History'
import type { RenkoV4Run } from './renkoV4Transform'
import { type SymbolView, TradingTerminal } from './terminal'

type State = {
  chart: ReturnType<typeof createChart>
  price: SeriesApi
  volume: SeriesApi
  ctype: string
  sym: SymbolView
  interval: string
  availableIntervals: string[]
  rawBars: Bar[]
  builder: CandleBuilder | null
  renkoV4Run: RenkoV4Run
  renkoV4Trend: SeriesApi
  volumeOn: boolean
  transformChoices: Record<string, Record<string, Record<string, number>>>
  buildChart(): void
  setPriceData(): void
  onTick(event: { ltp: number; timeSec: number }): void
  redrawOnFocus(): void
  syncRenkoV4Trend(reset?: boolean): void
  flushRenkoV4(): void
  withRenkoV4Owner<T>(spec: SeriesTransformSpec, create: () => T): T
  applyDataSnapshot(snapshot: DataLoadingSnapshot): void
  chartDataKey: string | null
  dataKey(request: {symbol:string; exchange:string; interval:string}): string
  clearMismatchedHistoryChart(): void
}

const terminals: TradingTerminal[] = []
const bar = (time: number, close: number): Bar => ({
  time,
  open: 100,
  high: Math.max(100, close),
  low: Math.min(100, close),
  close,
})

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  vi.stubGlobal(
    'WebSocket',
    class {
      readyState = 0
      send() {}
      close() {
        this.readyState = 3
      }
    }
  )
  const context = new Proxy(
    {
      measureText: (text: string) => ({ width: text.length * 7 }),
      createLinearGradient: () => ({ addColorStop() {} }),
      getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }),
    },
    { get: (target, key) => target[key as keyof typeof target] ?? (() => {}) }
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  )
})

afterEach(() => {
  for (const terminal of terminals.splice(0)) terminal.destroy()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function mount(
  storageKey = 'oa-trading',
  chartType = 'renko-v4',
  initialBars = [bar(960, 100), bar(1020, 120)]
) {
  const container = document.createElement('div')
  const terminal = new TradingTerminal({
    apiKey: 'test',
    wsUrl: 'ws://test.invalid',
    container,
    legendEl: document.createElement('div'),
    storageKey,
    getTheme: () => ({ mode: 'dark', appMode: 'live' }),
    callbacks: { onReady() {}, onToast() {}, onWsState() {}, onSymbolLoaded() {}, onLtp() {} },
  })
  terminals.push(terminal)
  const state = terminal as unknown as State
  state.sym = {
    symbol: 'WORLD_INDEX',
    exchange: 'GLOBAL_INDEX',
    name: 'World Index',
    lotsize: 1,
    lots: false,
    tick: 0.01,
    freezeQty: 0,
    quoteOnly: true,
    productOptions: ['MIS'],
    product: 'MIS',
  }
  state.interval = '1m'
  state.availableIntervals = ['1m', '5m', 'D']
  state.ctype = chartType
  state.volumeOn = false
  state.transformChoices = { 'GLOBAL_INDEX:WORLD_INDEX': { 'renko-v4': { boxSize: 10 } } }
  state.rawBars = initialBars
  state.builder = new CandleBuilder({ intervalSec: 60 })
  state.builder.seed(state.rawBars.at(-1)!)
  state.buildChart()
  state.chart.applySize(800, 600)
  return { terminal, state }
}

describe('Renko V5 terminal integration', () => {
  it('prepends older candles as bricks, preserving the ATR size and saved live suffix', () => {
    const { state } = mount('oa-trading-v5-older', 'renko-v5')
    const history = Array.from({ length: 18 }, (_, index) => ({
      ...bar(60 * (index + 1) + 1200, 100), high: 105, low: 95,
    }))
    state.rawBars = history
    state.setPriceData()
    state.onTick({ ltp: 131, timeSec: 2290 })
    const live = structuredClone(state.chart.primaryBars())
    expect(live.map((brick) => brick.close)).toEqual([110, 120, 130])
    state.rawBars = [bar(1080, 60), bar(1200, 80), ...state.rawBars]
    state.setPriceData()
    const extended = structuredClone(state.chart.primaryBars())
    expect(extended.length).toBeGreaterThan(live.length)
    expect(extended.slice(-live.length)).toEqual(live)
    expect(extended.every((brick, i) =>
      Math.abs(brick.close - brick.open) === 10 && (i === 0 || brick.time > extended[i - 1].time)
    )).toBe(true)
    state.setPriceData()
    expect(state.chart.primaryBars()).toEqual(extended)

    state.flushRenkoV4()
    const reopened = mount('oa-trading-v5-older', 'renko-v5', state.rawBars)
    expect(reopened.state.chart.primaryBars()).toEqual(extended)
    reopened.state.rawBars = [bar(900, 30), ...reopened.state.rawBars]
    reopened.state.setPriceData()
    expect(reopened.state.chart.primaryBars().length).toBeGreaterThan(extended.length)
    expect(reopened.state.chart.primaryBars().slice(-extended.length)).toEqual(extended)
  })

  it('excludes a forming minute from the initial ATR seed and catch-up', () => {
    vi.setSystemTime(new Date(60 * 15 * 1000 + 30_000))
    const { state } = mount('oa-trading-v5-forming', 'renko-v5')
    const closed = Array.from({ length: 14 }, (_, index) => ({
      ...bar(60 * (index + 1), 100), high: 105, low: 95,
    }))
    state.rawBars = [...closed, bar(900, 180)]
    state.setPriceData()
    expect(state.renkoV4Run.snapshot()).toBeNull()
    expect(state.chart.primaryBars()).toEqual([])

    vi.setSystemTime(new Date(60 * 16 * 1000 + 500))
    state.rawBars = [...closed, { ...bar(900, 100), high: 105, low: 95 }, bar(960, 180)]
    state.setPriceData()
    expect(state.renkoV4Run.snapshot()?.engine.box).toBe(10)
    expect(state.chart.primaryBars()).toEqual([])
  })

  it('retains tick-confirmed bricks and an ATR seed after reload with revised history', () => {
    const first = mount('oa-trading-v5-fixture', 'renko-v5')
    first.state.rawBars = Array.from({ length: 18 }, (_, index) => ({
      ...bar(60 * (index + 1), 100),
      high: 105,
      low: 95,
    }))
    first.state.setPriceData()
    expect(first.state.chart.primaryBars()).toEqual([])
    first.state.onTick({ ltp: 131, timeSec: 1090 })
    const up = structuredClone(first.state.chart.primaryBars())
    expect(up.map((brick) => brick.close)).toEqual([110, 120, 130])
    first.state.onTick({ ltp: 104, timeSec: 1091 })
    const reversed = structuredClone(first.state.chart.primaryBars())
    expect(reversed.slice(0, up.length)).toEqual(up)
    expect(reversed.map((brick) => brick.close)).toEqual([110, 120, 130, 110])
    first.state.flushRenkoV4()
    const keys = Object.keys(localStorage)
    expect(keys.some((key) => key.includes('-renko-v5-cache:'))).toBe(true)
    expect(keys.some((key) => key.includes('-renko-v4-cache:'))).toBe(false)

    const reopened = mount('oa-trading-v5-fixture', 'renko-v5')
    reopened.state.rawBars = first.state.rawBars.map((bar) => ({ ...bar, high: bar.high + 50 }))
    reopened.state.setPriceData()
    expect(reopened.state.chart.primaryBars()).toEqual(reversed)
    reopened.state.onTick({ ltp: 99, timeSec: 1092 })
    expect(reopened.state.chart.primaryBars().map((brick) => brick.close)).toEqual([
      110, 120, 130, 110, 100,
    ])
  })
})

describe('Renko V4 terminal integration', () => {
  it('clears a prior instrument canvas after a commodity history refusal', () => {
    const { state } = mount('oa-trading-p0')
    state.chartDataKey = state.dataKey({symbol:state.sym.symbol,exchange:state.sym.exchange,interval:'1m'})
    const previous = state.chart
    state.sym = {...state.sym, symbol:'CRUDEOILM19NOV26FUT',exchange:'MCX',quoteOnly:false,lots:true,lotsize:10}
    state.clearMismatchedHistoryChart()
    expect(previous.isDestroyed).toBe(true)
    expect(state.chart.primaryBars()).toEqual([])
    expect(state.rawBars).toEqual([])
    expect(state.price.getData()).toEqual([])
    expect(state.chartDataKey).toBeNull()
  })
  it('keeps same-instrument cached candles through a history refresh failure', () => {
    const { state } = mount('oa-trading-scalper-p0')
    state.chartDataKey = state.dataKey({symbol:state.sym.symbol,exchange:state.sym.exchange,interval:'1m'})
    const previous = state.chart
    const bars = structuredClone(state.rawBars)
    state.clearMismatchedHistoryChart()
    expect(state.chart).toBe(previous)
    expect(state.rawBars).toEqual(bars)
  })
  it('recovers prepared Trading NIFTY from the matching Scalper path without writing preferences', () => {
    const first = mount('oa-trading-scalper-p0')
    first.state.onTick({ ltp: 140, timeSec: 1025 })
    first.state.onTick({ ltp: 100, timeSec: 1026 })
    const spec = { type: 'renko-v4', options: { ...renkoV4Options(0.05), boxSize: 10 } }
    const { fallbackKey } = renkoV4RunKeys('oa-trading-p0', 'NSE_INDEX:NIFTY', spec)
    localStorage.setItem(fallbackKey!, JSON.stringify(first.state.renkoV4Run.snapshot()))
    const original = localStorage.getItem(fallbackKey!)
    const second = mount('oa-trading-p0')
    Object.assign(second.state, {
      preferences: { getItem: () => null, setItem: vi.fn() },
      initialWorkspacePane: {},
      sym: { ...second.state.sym, symbol: 'NIFTY', exchange: 'NSE_INDEX', tick: 0.05 },
      transformChoices: { 'NSE_INDEX:NIFTY': { 'renko-v4': { boxSize: 10 } } },
    })
    second.state.buildChart()
    expect(second.state.chart.primaryBars()).toEqual(first.state.chart.primaryBars())
    second.state.flushRenkoV4()
    expect(localStorage.getItem(fallbackKey!)).toBe(original)
    expect(
      Object.keys(localStorage).filter((key) => key.includes('confirmed-history-v2'))
    ).toHaveLength(0)
  })
  it('keeps the same committed owner through a Trading workspace transform restore', () => {
    const { state } = mount('oa-trading-p0')
    state.onTick({ ltp: 130, timeSec: 1025 })
    state.onTick({ ltp: 100, timeSec: 1026 })
    const committed = structuredClone(state.chart.primaryBars())
    const owner = state.renkoV4Run
    const spec = state.chart.seriesTransform(state.price)!
    state.withRenkoV4Owner(spec, () => state.chart.setSeriesTransform(state.price, spec))
    expect(state.renkoV4Run).toBe(owner)
    expect(state.chart.primaryBars()).toEqual(committed)
    state.onTick({ ltp: 120, timeSec: 1027 })
    expect(state.chart.primaryBars()).toEqual(state.renkoV4Run.elements())
  })
  it('does not lock cached preview prices into an immutable run', () => {
    const { state } = mount('oa-trading-p0')
    const confirmed = structuredClone(state.chart.primaryBars())
    state.applyDataSnapshot({
      request: { symbol: state.sym.symbol, exchange: state.sym.exchange, interval: state.interval },
      bars: [bar(960, 100), bar(1020, 300)],
      reason: 'cache',
      status: 'loading',
      historyStatus: 'idle',
      hasMore: true,
      paused: false,
    })
    expect(state.chart.primaryBars()).toEqual(confirmed)
    expect(state.rawBars.at(-1)?.close).toBe(120)
  })
  it.each([
    'oa-trading',
    'oa-trading-scalper-ce',
    'oa-trading-scalper-pe',
  ])('uses committed bricks in %s with immediate tick updates', (key) => {
    const { state } = mount(key)
    expect(CHART_TYPES['renko-v4'].label).toBe('Renko Version 4')
    expect(state.chart.primaryBars().map((b) => b.close)).toEqual([110, 120])
    const hiddenVolume = structuredClone(state.volume.getData())
    state.onTick({ ltp: 130, timeSec: 1025 })
    state.onTick({ ltp: 100, timeSec: 1026 })
    expect(state.chart.primaryBars().map((b) => b.close)).toEqual([110, 120, 130, 110, 100])
    expect(state.renkoV4Trend.getData().map((b) => b.close)).toEqual([100, 110, 120, 120, 110])
    expect(state.volume.getData()).toEqual(hiddenVolume)
  })

  it('preserves confirmed live bricks and their trend across REST corrections and chart rebuilds', () => {
    const { state } = mount()
    state.onTick({ ltp: 130, timeSec: 1025 })
    state.onTick({ ltp: 100, timeSec: 1026 })
    const locked = structuredClone(state.chart.primaryBars())
    const trend = structuredClone(state.renkoV4Trend.getData())
    state.rawBars[state.rawBars.length - 1] = bar(1020, 125)
    state.setPriceData()
    expect(state.chart.primaryBars()).toEqual(locked)
    state.buildChart()
    expect(state.chart.primaryBars()).toEqual(locked)
    expect(state.renkoV4Trend.getData()).toEqual(trend)
  })

  it('redraws the engine canvas on refocus without changing the price path', () => {
    const { state } = mount()
    const locked = structuredClone(state.chart.primaryBars())
    const invalidate = vi.spyOn(state.chart, 'invalidate')
    state.redrawOnFocus()
    expect(invalidate).toHaveBeenCalledOnce()
    expect(state.chart.primaryBars()).toEqual(locked)
  })

  it('does not mistake a delayed historical response for replay after a new live bucket', () => {
    const { state } = mount()
    state.onTick({ ltp: 140, timeSec: 1085 })
    const locked = structuredClone(state.chart.primaryBars())
    state.rawBars = [bar(960, 100), bar(1020, 120)]
    state.setPriceData()
    expect(state.chart.primaryBars()).toEqual(locked)
    state.onTick({ ltp: 150, timeSec: 1086 })
    expect(state.chart.primaryBars().map((b) => b.close)).toEqual([110, 120, 130, 140, 150])
  })

  it('recovers the committed live path when a new page recreates the same pane', () => {
    const first = mount()
    first.state.onTick({ ltp: 130, timeSec: 1025 })
    first.state.onTick({ ltp: 100, timeSec: 1026 })
    const locked = structuredClone(first.state.chart.primaryBars())
    first.state.flushRenkoV4()
    const second = mount()
    expect(second.state.chart.primaryBars()).toEqual(locked)
    second.state.onTick({ ltp: 120, timeSec: 1027 })
    expect(second.state.chart.primaryBars().map((b) => b.close)).toEqual([
      110, 120, 130, 110, 100, 120,
    ])
  })

  it('keeps the trend limited to replay bricks and restores collected live ticks', () => {
    const { state } = mount()
    const source = structuredClone(state.rawBars)
    state.price.setData([source[0]])
    state.syncRenkoV4Trend(true)
    expect(state.chart.primaryBars()).toEqual([])
    expect(state.renkoV4Trend.getData()).toEqual([])
    state.renkoV4Run.observeLive(bar(1020, 130))
    state.renkoV4Run.observeLive(bar(1020, 100))
    expect(state.chart.primaryBars()).toEqual([])
    state.price.setData(source)
    state.syncRenkoV4Trend(true)
    expect(state.chart.primaryBars().map((b) => b.close)).toEqual([110, 120, 130, 110, 100])
    expect(state.renkoV4Trend.getData()).toHaveLength(5)
  })

  it('keeps a consistent historical seed and directs timeframe changes to brick settings', () => {
    const { terminal } = mount()
    expect(renkoV4HistoryInterval(['5s', '5m', '1m', 'D'])).toBe('1m')
    expect(renkoV4HistoryInterval(['5s', '15m', '5m'])).toBe('5m')
    expect(renkoV4HistoryInterval(['5s', 'D'])).toBeNull()
    expect(terminal.setInterval('5m')).toBe('1m')
    expect(terminal.setInterval('D')).toBe('1m')
  })

  it('starts with bricks only and can enable and disable the line without changing the bricks', async () => {
    const { terminal, state } = mount()
    const bricks = structuredClone(state.chart.primaryBars())
    expect(bricks.length).toBeGreaterThan(0)
    expect(state.chart.seriesStyle(state.renkoV4Trend)?.visible).toBe(false)

    await terminal.applyChartSettings({ 'renkov4.showTrend': true })
    expect(state.chart.seriesStyle(state.renkoV4Trend)?.visible).toBe(true)
    expect(state.chart.primaryBars()).toEqual(bricks)

    await terminal.applyChartSettings({ 'renkov4.showTrend': false })
    expect(state.chart.seriesStyle(state.renkoV4Trend)?.visible).toBe(false)
    expect(state.chart.primaryBars()).toEqual(bricks)
  })

  it('exposes sizing, reversal and optional trend controls', () => {
    const request = {
      tabs: [{ id: 'price', label: 'Price', inputs: [] }],
      values: {},
      defaults: {},
    }
    const settings = renkoV4SettingsView(request, 'renko-v4', {})
    expect(settings.values['renkov4.showTrend']).toBe(false)
    expect(settings.defaults['renkov4.showTrend']).toBe(false)
    expect(renkoV4SettingsView(request, 'renko-v4', { 'renkov4.showTrend': true }).values[
      'renkov4.showTrend'
    ]).toBe(true)
    expect(settings.tabs[0].inputs[0].key).toBe('renkov4.showTrend')
    expect(renkoV4SettingsView(request, 'candlestick', {})).toBe(request)
  })
})
