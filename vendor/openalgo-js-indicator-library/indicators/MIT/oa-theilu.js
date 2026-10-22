/**
 * Theil's U Statistic (TheilU) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/theilu.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The root mean squared error between a forecast series and an actual series is
 * scaled by the root of their combined energy, so 0 is a perfect forecast and
 * values near 1 are no better than a naive one.
 */

export default function ({ registerIndicator, sourceValues, rollingSum, nulls }) {
  registerIndicator({
    id: 'oa-theilu',
    name: 'Theil\'s U Statistic (TheilU)',
    category: 'Errors',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'actual', type: 'source', label: 'Actual', default: 'close' },
      { key: 'predicted', type: 'source', label: 'Predicted', default: 'open' },
    ],

    plots: [{ key: 'theilu', type: 'line', title: "Theil's U", style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [
      { price: 1, title: 'Naive', color: '#ef5350', dashed: true },
      { price: 0, title: 'Perfect', color: '#26a69a', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const actual = sourceValues(bars, settings.actual ?? 'close')
      const predicted = sourceValues(bars, settings.predicted ?? 'open')

      const n = bars.length
      const sqError = new Array(n).fill(0)
      const sqActual = new Array(n).fill(0)
      const sqPred = new Array(n).fill(0)

      for (let i = 0; i < n; i++) {
        // The source nz()s both series to zero before squaring them.
        const a = Number.isFinite(actual[i]) ? actual[i] : 0
        const p = Number.isFinite(predicted[i]) ? predicted[i] : 0
        const err = p - a
        sqError[i] = err * err
        sqActual[i] = a * a
        sqPred[i] = p * p
      }

      const sumSqError = rollingSum(sqError, length)
      const sumSqActual = rollingSum(sqActual, length)
      const sumSqPred = rollingSum(sqPred, length)

      const epsilon = 1e-10
      const out = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        // Warmup stays null. The source lets its na rolling sums fall through to
        // 0.0, which would draw a flat perfect-forecast line for length-1 bars.
        if (!Number.isFinite(sumSqError[i]) || !Number.isFinite(sumSqActual[i]) || !Number.isFinite(sumSqPred[i])) continue
        const denom = Math.sqrt(sumSqActual[i] + sumSqPred[i])
        out[i] = denom > epsilon ? Math.sqrt(sumSqError[i]) / denom : 0
      }

      return { theilu: nulls(out) }
    },
  })
}
