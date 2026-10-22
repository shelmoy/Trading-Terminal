/**
 * Fractal Adaptive Moving Average (FRAMA) - ported to openalgo-charts from
 * Pine Script v3.
 *
 * Source: https://github.com/everget/tradingview-pinescript-indicators/blob/60c93d3711d222b8f2db96160defe568429348e0/movings/fractal_adaptive_moving_average.pine
 * Repo:   everget/tradingview-pinescript-indicators
 * License: GPL-3.0 (c) 2018-present, Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2018-present Alex Orekhov (everget)
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * An exponential average whose smoothing constant is set by the fractal
 * dimension of the recent range, so it tracks price closely in a trend and
 * flattens out when the range folds back on itself.
 */

export default function ({ registerIndicator, sourceValues, highest, lowest, nulls }) {
  const UP_COLOR = '#4caf50'
  const DOWN_COLOR = '#ff5252'
  const FLAT_COLOR = '#6d1e7f'

  registerIndicator({
    id: 'oa-fractal-adaptive-moving-average',
    name: 'Fractal Adaptive Moving Average (FRAMA)',
    category: 'Moving Averages',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 2, max: 5000, step: 1 },
      { key: 'highlightMovements', type: 'boolean', label: 'Highlight Movements ?', default: true },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      {
        key: 'frama',
        type: 'line',
        title: 'FRAMA',
        style: { color: FLAT_COLOR, lineWidth: 2 },
        colorBy: ({ index, values, settings }) => {
          if (settings.highlightMovements === false) return FLAT_COLOR
          const cur = values.frama[index]
          const prev = values.frama[index - 1]
          if (!Number.isFinite(cur) || !Number.isFinite(prev)) return FLAT_COLOR
          return cur > prev ? UP_COLOR : DOWN_COLOR
        },
      },
    ],

    calc(bars, settings) {
      const n = bars.length
      // A cleared number field arrives as '', and Number('') is 0. The half
      // length below has to stay at least 1 or every window collapses.
      const length = Math.max(2, Math.floor(Number(settings.length) || 14))
      const half = Math.max(1, Math.floor(length / 2))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine v3's single-argument highest()/lowest() read the high and low
      // series, not the chosen source.
      const highs = bars.map((b) => b.high)
      const lows = bars.map((b) => b.low)
      const hh2 = highest(highs, half)
      const ll2 = lowest(lows, half)
      const hhFull = highest(highs, length)
      const llFull = lowest(lows, length)

      const out = new Array(n).fill(NaN)
      let prevFrama = NaN

      for (let i = 0; i < n; i++) {
        let factor = NaN
        if (i >= half && Number.isFinite(hh2[i]) && Number.isFinite(ll2[i]) &&
            Number.isFinite(hh2[i - half]) && Number.isFinite(ll2[i - half]) &&
            Number.isFinite(hhFull[i]) && Number.isFinite(llFull[i])) {
          const N1 = (hh2[i] - ll2[i]) / half
          const N2 = (hh2[i - half] - ll2[i - half]) / half
          const N3 = (hhFull[i] - llFull[i]) / length
          // A flat window makes both logarithms -Infinity and D not a number,
          // which is what Pine produces there too, so the bar stays blank.
          const D = (Math.log(N1 + N2) - Math.log(N3)) / Math.LN2
          factor = Math.exp(-4.6 * (D - 1))
        }

        // nz(frama[1]) is 0 while the recursion has nothing behind it.
        const base = Number.isFinite(prevFrama) ? prevFrama : 0
        const cur = factor * src[i] + (1 - factor) * base
        prevFrama = Number.isFinite(cur) ? cur : NaN
        out[i] = prevFrama
      }

      return { frama: nulls(out) }
    },
  })
}
