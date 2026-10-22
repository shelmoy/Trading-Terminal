/**
 * Elder's Thermometer (ETHERM) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/etherm.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Measures how far a bar pushes beyond the previous bar's range, an inside bar
 * reading zero, then compares that temperature against its own compensated EMA
 * to flag hot and explosive bars.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-etherm',
    name: 'Elder\'s Thermometer (ETHERM)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'EMA Period',
        default: 22,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Number of bars for the EMA signal line',
      },
      {
        key: 'multiplier',
        type: 'number',
        label: 'Explosive Threshold',
        default: 3.0,
        min: 0.1,
        max: 100,
        step: 0.5,
        tooltip: 'Multiplier for explosive move detection',
      },
    ],

    plots: [
      {
        key: 'therm',
        type: 'histogram',
        title: 'Thermometer',
        style: { color: '#2196f3', lineWidth: 2, base: 0 },
        // Pine recolours the histogram bar by bar: red when explosive, orange
        // when merely hot, blue otherwise.
        colorBy({ value, index, values, settings }) {
          const signal = values?.signal?.[index]
          const multiplier = Math.max(0.1, Number(settings?.multiplier) || 3.0)
          if (!Number.isFinite(value) || !Number.isFinite(signal)) return '#2196f3'
          if (value >= signal * multiplier) return '#ff5252'
          if (value >= signal) return '#ff9800'
          return '#2196f3'
        },
      },
      { key: 'signal', type: 'line', title: 'Signal', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 22))

      const n = bars.length
      const therm = new Array(n).fill(NaN)
      const signal = new Array(n).fill(NaN)

      const alpha = 2.0 / (period + 1)
      const beta = 1.0 - alpha
      const EPSILON = 1e-10

      // var state, carried across bars exactly as Pine carries it.
      let rawEma = 0.0
      let e = 1.0

      for (let i = 0; i < n; i++) {
        const high = bars[i].high
        const low = bars[i].low
        if (!Number.isFinite(high) || !Number.isFinite(low)) continue

        // nz(high[1], high): the first bar compares against itself.
        const prevHigh = i > 0 && Number.isFinite(bars[i - 1].high) ? bars[i - 1].high : high
        const prevLow = i > 0 && Number.isFinite(bars[i - 1].low) ? bars[i - 1].low : low

        const highDiff = Math.abs(high - prevHigh)
        const lowDiff = Math.abs(prevLow - low)
        const isInsideBar = high < prevHigh && low > prevLow
        const temp = isInsideBar ? 0.0 : Math.max(highDiff, lowDiff)
        therm[i] = temp

        // EMA with warmup compensation: the running product of beta divides out
        // the missing weight, so the signal is valid from the first bar.
        rawEma = rawEma * beta + temp * alpha
        e *= beta
        const denom = 1.0 - e
        signal[i] = e > EPSILON && denom !== 0 ? rawEma / denom : rawEma
      }

      return { therm: nulls(therm), signal: nulls(signal) }
    },
  })
}
