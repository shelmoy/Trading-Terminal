/**
 * Median Absolute Percentage Error (MdAPE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/mdape.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The rolling median of the absolute percentage gap between two series. Taking
 * the median rather than the mean is what makes it robust: one outlier bar
 * moves MAPE a long way and moves this hardly at all.
 */

export default function ({ registerIndicator, sourceValues, percentileNearestRank, nulls }) {
  registerIndicator({
    id: 'oa-mdape',
    name: 'Median Absolute Percentage Error',
    category: 'Errors',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'actual', type: 'source', label: 'Actual', default: 'close' },
      { key: 'predicted', type: 'source', label: 'Predicted', default: 'open' },
    ],

    plots: [
      {
        key: 'mdape',
        type: 'line',
        title: 'MdAPE',
        // The source declares format=format.percent; the values are already on a
        // 0..100 scale, and this formatter suffixes without rescaling them.
        priceFormat: { type: 'percent' },
        style: { color: '#ffeb3b', lineWidth: 2 },
      },
    ],

    levels: () => [{ price: 0, title: 'Zero', color: '#9e9e9e', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const actual = sourceValues(bars, settings.actual ?? 'close')
      const predicted = sourceValues(bars, settings.predicted ?? 'open')
      const epsilon = 1e-10

      const n = bars.length
      const pctError = new Array(n).fill(0)
      for (let i = 0; i < n; i++) {
        const a = actual[i]
        const p = predicted[i]
        // The source uses two different na replacements on the same series:
        // nz(actual, 1.0) for the scale and nz(actual, 0.0) for the gap.
        const absActual = Math.abs(Number.isFinite(a) ? a : 1)
        const absError = Math.abs((Number.isFinite(a) ? a : 0) - (Number.isFinite(p) ? p : 0))
        pctError[i] = absActual > epsilon ? (absError / absActual) * 100 : 0
      }

      // ta.median is the 50th percentile by nearest rank, so an even-length
      // window returns a member of the window rather than a mean of two.
      const median = percentileNearestRank(pctError, length, 50)

      return { mdape: nulls(median) }
    },
  })
}
