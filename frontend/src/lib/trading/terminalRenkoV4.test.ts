import { type Bar, CandleBuilder, type createChart, type SeriesApi } from 'openalgo-charts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHART_TYPES } from './chartTypes'
import { renkoV4HistoryInterval, renkoV4SettingsView } from './renkoV4Settings'
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

function mount(storageKey = 'oa-trading') {
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
  state.ctype = 'renko-v4'
  state.volumeOn = false
  state.transformChoices = { 'GLOBAL_INDEX:WORLD_INDEX': { 'renko-v4': { boxSize: 10 } } }
  state.rawBars = [bar(960, 100), bar(1020, 120)]
  state.builder = new CandleBuilder({ intervalSec: 60 })
  state.builder.seed(state.rawBars[1])
  state.buildChart()
  state.chart.applySize(800, 600)
  return { terminal, state }
}

describe('Renko V4 terminal integration', () => {
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

  it('exposes sizing, reversal and optional trend controls', () => {
    const request = {
      tabs: [{ id: 'price', label: 'Price', inputs: [] }],
      values: {},
      defaults: {},
    }
    const settings = renkoV4SettingsView(request, 'renko-v4', {})
    expect(settings.values['renkov4.showTrend']).toBe(true)
    expect(settings.tabs[0].inputs[0].key).toBe('renkov4.showTrend')
    expect(renkoV4SettingsView(request, 'candlestick', {})).toBe(request)
  })
})
