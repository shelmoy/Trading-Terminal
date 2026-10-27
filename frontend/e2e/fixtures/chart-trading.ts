import { createChart, darkTheme, lightTheme, getSeriesTransform } from 'openalgo-charts'
import { CHART_TYPES } from '../../src/lib/trading/chartTypes'
import { CleanChartTrading } from '../../src/lib/trading/cleanChartTrading'
import { CleanTradeButtons } from '../../src/lib/trading/chartTradingLayer'

const params = new URLSearchParams(location.search),
  dark = params.get('theme') !== 'light'
const element = document.getElementById('chart')!,
  notice = document.getElementById('notice')!
element.style.width = `${Number(params.get('width') || 900)}px`
document.body.style.background = dark ? '#0b0c12' : '#fff'
document.body.style.color = dark ? '#eee' : '#111'
const type = params.get('type') || 'candlestick'
const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  )
for (let i = 0; i < 30 && type.startsWith('renko-'); i++) {
  try {
    getSeriesTransform(type)
    break
  } catch {
    await frames()
  }
}
const chart = createChart(element, {
  theme: dark ? darkTheme : lightTheme,
  priceAxisWidth: 84,
  movablePrimaryPane: true,
})
const def = CHART_TYPES[type]
if (!def) throw new Error(`Unknown fixture chart ${type}`)
const series = chart.addSeries(def.series as 'candlestick', {
  priceFormat: { type: 'custom', formatter: (price) => price.toFixed(2) },
  ...(def.transform ? { transform: def.transform(0.2) } : {}),
})
const bars = Array.from({ length: 120 }, (_, i) => {
  const close = 100 + Math.sin(i / 8) * 2,
    open = 100 + Math.sin((i - 1) / 8) * 2
  return {
    time: 1792995900 + i * 60,
    open,
    high: Math.max(open, close) + 0.25,
    low: Math.min(open, close) - 0.25,
    close,
    volume: 100 + i,
  }
})
series.setData(bars)
chart.fitContent()
chart.setPriceScaleOptions({ minMove: 0.05, inverted: params.get('inverted') === '1' })
let locked = false
const controller = new CleanChartTrading({
  element: () => element,
  instrument: () => ({ symbol: 'FIXTURE', exchange: 'NFO', tick: 0.05, quoteOnly: false }),
  locked: () => locked,
  mode: () => (params.get('mode') === 'live' ? 'live' : 'analyze'),
  mark: () => 101,
  format: (price) => price.toFixed(2),
  toast: (message) => {
    notice.textContent = message
  },
  openPriceMenu: (point) => {
    notice.textContent = `Actions at ${chart.coordinateToPrice(point.y, 0)?.toFixed(2)}`
  },
})
controller.attach(chart)
const buttons = new CleanTradeButtons('1L', (price) => price.toFixed(2))
buttons.setPrices(100.95, 101.05)
chart.addPrimitive(buttons, 0)
await controller.refresh()
controller.mark(101)
await frames()
const api = {
  chart,
  controller,
  element,
  boxes: () =>
    (
      controller as unknown as { lines: { options(): unknown; price: number; box: unknown }[] }
    ).lines.map((line) => ({
      options: line.options(),
      price: line.price,
      box: line.box,
      pixelY: chart.priceToCoordinate(line.price),
    })),
  priceY: (price: number) => chart.priceToCoordinate(price),
  movePrimary: async () => {
    const study = chart.addSeries('line', { paneIndex: 1 })
    study.setData(bars.map((bar) => ({ ...bar, open: 1, high: 2, low: 0.5, close: 1.5 })))
    const moved = chart.movePane(chart.primaryPaneIndex(), 1)
    await frames()
    return moved
  },
  arm: () =>
    controller.arm({
      symbol: 'FIXTURE',
      exchange: 'NFO',
      action: 'BUY',
      product: 'NRML',
      quantity: 75,
      pricetype: 'LIMIT',
      price: 100,
    }),
  draftArmed: () => Boolean((controller as unknown as { draft: unknown }).draft),
  nativeMarkY: () => chart.priceToCoordinate(chart.primaryBars().at(-1)!.close, 0),
  overflow: () =>
    (controller as unknown as { layer: { overflowCount: number } }).layer.overflowCount,
  measure: async (count = 60) => {
    const lines = (controller as any).lines,
      target = lines.at(-1),
      original = target.draw
    const processing: number[] = [],
      draws: number[] = []
    let receipt: number | null = null
    target.draw = function (...args: any[]) {
      original.apply(this, args)
      if (receipt != null) {
        draws.push(performance.now() - receipt)
        receipt = null
      }
    }
    try {
      for (let i = 0; i < count; i++) {
        receipt = performance.now()
        controller.mark(101 + (i % 4) * 0.01)
        processing.push(performance.now() - receipt)
        await frames()
      }
    } finally {
      target.draw = original
    }
    const percentile = (values: number[], q: number) =>
      [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)]
    return {
      scope:
        'synthetic browser receipt to own primitive draw completion; excludes broker/network/fill/compositor',
      samples: draws.length,
      processingP50: percentile(processing, 0.5),
      processingP95: percentile(processing, 0.95),
      drawP50: percentile(draws, 0.5),
      drawP95: percentile(draws, 0.95),
    }
  },
  lock: () => {
    locked = true
    controller.cancelGesture()
  },
  refresh: () => controller.refresh(),
  dispose: () => {
    controller.detach()
    chart.destroy()
  },
  frames,
}
Object.assign(window, { chartFixture: api, fixtureReady: true })
