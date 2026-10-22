/**
 * Median Absolute Error (MdAE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/mdae.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The rolling median of the absolute gap between an actual series and a
 * forecast series, which reports typical forecast error while ignoring the
 * occasional outlier that would drag a mean.
 */

export default function ({ registerIndicator, sourceValues, percentileNearestRank, nulls }) {
  registerIndicator({
    id: 'oa-mdae',
    name: 'Median Absolute Error',
    category: 'Errors',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'actual', type: 'source', label: 'Actual', default: 'close' },
      { key: 'predicted', type: 'source', label: 'Predicted', default: 'open' },
    ],

    plots: [{ key: 'mdae', type: 'line', title: 'MdAE', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero', color: '#9598a1', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const actual = sourceValues(bars, settings.actual ?? 'close')
      const predicted = sourceValues(bars, settings.predicted ?? 'open')

      // Pine wraps both operands in nz(), so a missing value reads as 0 here.
      const absError = new Array(bars.length)
      for (let i = 0; i < bars.length; i++) {
        const a = Number.isFinite(actual[i]) ? actual[i] : 0
        const p = Number.isFinite(predicted[i]) ? predicted[i] : 0
        absError[i] = Math.abs(a - p)
      }

      // Pine's ta.median is the 50th percentile by nearest rank, which on an
      // even window takes the lower of the two middle values rather than
      // averaging them. It is na until the window fills.
      return { mdae: nulls(percentileNearestRank(absError, length, 50)) }
    },
  })
}
