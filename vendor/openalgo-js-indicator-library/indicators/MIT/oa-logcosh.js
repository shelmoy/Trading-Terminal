/**
 * Log-Cosh Loss - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/logcosh.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The rolling mean of log(cosh(actual - predicted)): a squared error for small
 * misses that flattens to a linear one for large misses, so a single outlier
 * does not dominate the reading.
 */

export default function ({ registerIndicator, sourceValues, sma, nulls }) {
  const LOG2 = 0.6931471805599453

  // Large inputs would overflow exp(), so the asymptote is used beyond 20.
  const stableLogCosh = (x) => {
    const absX = Math.abs(x)
    if (absX > 20) return absX - LOG2
    return Math.log((Math.exp(x) + Math.exp(-x)) / 2)
  }

  registerIndicator({
    id: 'oa-logcosh',
    name: 'Log-Cosh Loss',
    category: 'Errors',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'actual', type: 'source', label: 'Actual', default: 'close' },
      { key: 'predicted', type: 'source', label: 'Predicted', default: 'open' },
    ],

    plots: [{ key: 'logcosh', type: 'line', title: 'Log-Cosh Loss', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const actual = sourceValues(bars, settings.actual ?? 'close')
      const predicted = sourceValues(bars, settings.predicted ?? 'open')

      const loss = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        // Pine wraps both series in nz(), so a missing value reads as zero.
        const a = Number.isFinite(actual[i]) ? actual[i] : 0
        const p = Number.isFinite(predicted[i]) ? predicted[i] : 0
        loss[i] = stableLogCosh(a - p)
      }

      return { logcosh: nulls(sma(loss, length)) }
    },
  })
}
