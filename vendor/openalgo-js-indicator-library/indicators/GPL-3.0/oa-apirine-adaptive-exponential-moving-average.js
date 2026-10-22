/**
 * Adaptive Exponential Moving Average (AEMA) - ported to openalgo-charts from Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/apirine_adaptive_exponential_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2019-present Vitali Apirine, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * An EMA whose smoothing rate widens as the source sits further from the middle
 * of its recent high-low range, so the average speeds up in a directional move
 * and settles down inside a range.
 */

export default function ({ registerIndicator, sourceValues, sma, highest, lowest, nulls }) {
  registerIndicator({
    id: 'oa-apirine-adaptive-exponential-moving-average',
    name: 'Adaptive Exponential Moving Average (AEMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 10, min: 1, max: 5000, step: 1 },
      {
        key: 'hlLookback',
        type: 'number',
        label: 'Highest/Lowest Lookback',
        default: 10,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Bars of high-low range the adaptive multiplier is measured against.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'highlightMovements',
        type: 'boolean',
        label: 'Highlight Movements ?',
        default: false,
        tooltip: 'Colour the line green when it rises and red when it does not.',
      },
    ],

    plots: [
      {
        key: 'ma',
        type: 'line',
        title: 'AMA',
        style: { color: '#512da8', lineWidth: 2 },
        colorBy({ index, values, settings }) {
          if (settings.highlightMovements !== true) return '#512da8'
          const column = values.ma
          const current = column?.[index]
          const previous = index >= 1 ? column?.[index - 1] : undefined
          // Pine reads `ma > ma[1]`, and any comparison against na is false,
          // which lands on the red branch.
          return Number.isFinite(current) && Number.isFinite(previous) && current > previous
            ? '#4caf50'
            : '#ef5350'
        },
      },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 10))
      const hlLookback = Math.max(1, Math.floor(Number(settings.hlLookback) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      // Pine v3's highest(n) / lowest(n) default to the high and low series.
      const highs = new Array(n)
      const lows = new Array(n)
      for (let i = 0; i < n; i++) {
        highs[i] = Number.isFinite(bars[i].high) ? bars[i].high : NaN
        lows[i] = Number.isFinite(bars[i].low) ? bars[i].low : NaN
      }
      const hh = highest(highs, hlLookback)
      const ll = lowest(lows, hlLookback)

      const seed = sma(src, length)
      const mltp1 = 2 / (length + 1)

      const ma = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        // bar_index <= length runs the plain SMA branch, which is na until the
        // SMA itself has enough bars.
        if (i <= length) {
          ma[i] = seed[i]
          continue
        }

        const value = src[i]
        if (!Number.isFinite(value)) continue

        const range = Number.isFinite(hh[i]) && Number.isFinite(ll[i]) ? hh[i] - ll[i] : NaN
        const mltp2 =
          Number.isFinite(range) && range !== 0 ? Math.abs(2 * value - ll[i] - hh[i]) / range : 0
        const rate = mltp1 * (1 + mltp2)

        // nz(ma[1], src): the previous bar's average, or this bar's source.
        const previous = Number.isFinite(ma[i - 1]) ? ma[i - 1] : value
        ma[i] = previous + rate * (value - previous)
      }

      return { ma: nulls(ma) }
    },
  })
}
