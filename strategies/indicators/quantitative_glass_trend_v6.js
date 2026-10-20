/**
 * Port of the user's Pine v5 "Quantitative Glass Trend Engine - Anti-Fakeout [v6]".
 * Endpoint regression residuals, population deviation, Wilder ATR(14), and
 * confirmed-close state changes follow the supplied source. No order actions.
 */
export default function ({ registerIndicator, linreg, stdev, atr, withAlpha }) {
  const BULL = '#00e676'
  const BEAR = '#ff1744'
  const NEUTRAL = '#808080'
  const finite = Number.isFinite
  const number = (value, fallback, min) => {
    const parsed = Number(value)
    return finite(parsed) && parsed >= min ? parsed : fallback
  }
  const trendColor = (state) => state === 1 ? BULL : state === -1 ? BEAR : NEUTRAL
  const isDark = () => typeof document === 'undefined' ||
    document.documentElement.classList.contains('dark')

  registerIndicator({
    id: 'oa-quantitative-glass-trend-v6',
    name: 'Quantitative Glass Trend Engine - Anti-Fakeout [v6]',
    category: 'Trend',
    placement: 'onchart',
    inputs: [
      {
        key: 'lengthInput', type: 'number', label: 'Regression Period',
        default: 21, min: 5, step: 1, group: 'Quantitative Trend Engine',
        tooltip: 'Statistical window for price linear regression.',
      },
      {
        key: 'zThreshold', type: 'number', label: 'Z-Score Threshold',
        default: 1.5, min: 0.5, step: 0.1, group: 'Quantitative Trend Engine',
        tooltip: 'Required endpoint residual divided by its rolling population deviation.',
      },
      {
        key: 'atrMult', type: 'number', label: 'ATR Dynamic Stop Distance',
        default: 2, min: 1, step: 0.1, group: 'Quantitative Trend Engine',
        tooltip: 'Multiplier of Wilder ATR(14) used by the structural trailing filter.',
      },
      {
        key: 'showChannels', type: 'boolean', label: 'Display Regression Channels',
        default: true, group: 'Quantitative Channel Settings',
      },
      {
        key: 'devMultiplier', type: 'number', label: 'Channel Band Width',
        default: 2, min: 0.5, step: 0.1, group: 'Quantitative Channel Settings',
      },
      {
        key: 'showLabels', type: 'boolean', label: 'Show Glass Signal Labels',
        default: true, group: 'Glass UI Customization',
      },
      {
        key: 'showDashboard', type: 'boolean', label: 'Show Liquid Glass UI Panel',
        default: true, group: 'Glass UI Customization',
      },
    ],
    plots: [
      {
        key: 'regLine', type: 'line', title: 'Statistical Trend Line',
        style: { color: NEUTRAL, lineWidth: 2, priceLineVisible: false },
        colorBy: ({ values, index }) => trendColor(values.trendState[index]),
      },
      {
        key: 'upperChannel', type: 'line', title: 'Upper Channel',
        style: { color: '#00e67666', lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
      },
      {
        key: 'lowerChannel', type: 'line', title: 'Lower Channel',
        style: { color: '#ff174466', lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
      },
      {
        key: 'trailingStop', type: 'line', title: 'Structural Trailing Level',
        style: { color: '#80808080', lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
        colorBy: ({ values, index }) => withAlpha(trendColor(values.trendState[index]), 0.5),
      },
    ],
    fills: [
      { between: ['upperChannel', 'regLine'], colorUp: BULL, colorDown: BULL, opacity: 0.06 },
      { between: ['regLine', 'lowerChannel'], colorUp: BEAR, colorDown: BEAR, opacity: 0.06 },
    ],
    calc(bars, settings, _store, ctx) {
      const count = bars.length
      const length = Math.round(number(settings.lengthInput, 21, 5))
      const threshold = number(settings.zThreshold, 1.5, 0.5)
      const stopMult = number(settings.atrMult, 2, 1)
      const bandMult = number(settings.devMultiplier, 2, 0.5)
      const close = bars.map((bar) => bar.close)
      // Local regression coordinates are equivalent to Pine's bar_index fit,
      // without subtracting large global-index sums late in a long history.
      const endpoint = linreg(close, length, 0)
      const offset = linreg(close, length, 1)
      const residual = close.map((value, i) => finite(endpoint[i]) ? value - endpoint[i] : NaN)
      // Pine uses the rolling deviation of the endpoint-residual SERIES, not
      // the residuals of every point against one newly fitted regression line.
      const deviation = stdev(residual, length)
      const volatility = atr(bars.map((bar) => bar.high), bars.map((bar) => bar.low), close, 14)
      const values = Object.fromEntries([
        'regLine', 'upperChannel', 'lowerChannel', 'trailingStop',
        'slope', 'stdErr', 'zScore', 'atrValue', 'trendState', 'buySignal', 'sellSignal',
      ].map((key) => [key, new Array(count).fill(null)]))
      let stop = null
      let state = 0

      for (let i = 0; i < count; i++) {
        const line = endpoint[i]
        const slope = finite(line) && finite(offset[i]) ? line - offset[i] : null
        const sigma = finite(deviation[i]) ? deviation[i] === 0 ? 0.0001 : deviation[i] : null
        const z = sigma !== null ? residual[i] / sigma : null
        const atrValue = finite(volatility[i]) ? volatility[i] : null
        if (i === 0) stop = close[i]
        else if (slope !== null && slope !== 0) {
          // Preserve Pine's nz(previousStop) and its na propagation during ATR
          // warmup, including when the regression period is shorter than 14.
          const previous = stop === null ? 0 : stop
          stop = atrValue === null ? null : slope > 0
            ? Math.max(previous, bars[i].low - atrValue * stopMult)
            : Math.min(previous, bars[i].high + atrValue * stopMult)
        }
        const confirmed = i < count - 1 || ctx?.barState?.isConfirmed === true
        const buy = confirmed && z !== null && finite(z) && slope !== null &&
          stop !== null && z > threshold && slope > 0 && close[i] > stop && state !== 1
        const sell = confirmed && z !== null && finite(z) && slope !== null &&
          stop !== null && z < -threshold && slope < 0 && close[i] < stop && state !== -1
        if (buy) state = 1
        else if (sell) state = -1
        values.regLine[i] = finite(line) ? line : null
        values.upperChannel[i] = settings.showChannels !== false && sigma !== null
          ? line + sigma * bandMult : null
        values.lowerChannel[i] = settings.showChannels !== false && sigma !== null
          ? line - sigma * bandMult : null
        values.trailingStop[i] = stop
        values.slope[i] = slope
        values.stdErr[i] = sigma
        values.zScore[i] = z !== null && finite(z) ? z : null
        values.atrValue[i] = atrValue
        values.trendState[i] = state
        values.buySignal[i] = buy ? 1 : 0
        values.sellSignal[i] = sell ? 1 : 0
      }
      return values
    },
    markers({ bars, values, settings }) {
      if (settings.showLabels === false) return []
      const labels = []
      for (let i = bars.length - 1; i >= 0 && labels.length < 500; i--) {
        const buy = values.buySignal[i] === 1
        const sell = values.sellSignal[i] === 1
        if ((!buy && !sell) || !finite(values.atrValue[i])) continue
        labels.push({
          time: bars[i].time,
          position: 'atPrice',
          price: buy ? bars[i].low - values.atrValue[i] * 0.6
            : bars[i].high + values.atrValue[i] * 0.6,
          shape: buy ? 'labelUp' : 'labelDown',
          size: 'small',
          color: withAlpha(buy ? BULL : BEAR, 0.18),
          textColor: isDark() ? '#f0f3f6' : buy ? '#075c36' : '#9f1239',
          text: buy ? '✦ BUY' : '✦ SELL',
        })
      }
      return labels.reverse()
    },
    table({ bars, values, settings }) {
      if (settings.showDashboard === false || bars.length === 0) return null
      const last = bars.length - 1
      const state = values.trendState[last]
      const z = values.zScore[last]
      const dark = isDark()
      const background = dark ? 'rgba(19,23,34,0.72)' : 'rgba(255,255,255,0.86)'
      const label = dark ? '#b4bec8' : '#64748b'
      const text = dark ? '#f0f3f6' : '#172033'
      const cell = (value, color, align = 'left') => ({
        text: value, textColor: color, bgColor: background, fontSize: 10, align,
      })
      return {
        rows: [
          [cell('TREND', label), cell(state === 1 ? 'BULLISH' : state === -1 ? 'BEARISH' : 'NEUTRAL',
            dark ? trendColor(state) : state === 1 ? '#07874c' : state === -1 ? '#d3153d' : NEUTRAL, 'right')],
          [cell('STRENGTH (Z)', label), cell(finite(z) ? z.toFixed(2) : '—', text, 'right')],
        ],
        options: {
          position: 'top-right', cellWidth: 'auto', cellHeight: 21, fontSize: 10,
          margin: 12, background, borderWidth: 1,
          borderColor: dark ? 'rgba(255,255,255,0.15)' : 'rgba(71,85,105,0.16)',
        },
      }
    },
  })
}
