/**
 * Mean Relative Absolute Error - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/mrae.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Averages the absolute gap between an actual series and a predicted one as a
 * fraction of the actual value, so 0 is a perfect forecast and 1 is an error
 * the size of the level itself.
 */

export default function ({ registerIndicator, sourceValues, sma, nulls }) {
  registerIndicator({
    id: 'oa-mrae',
    name: 'Mean Relative Absolute Error',
    category: 'Errors',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'actual', type: 'source', label: 'Actual', default: 'close' },
      { key: 'predicted', type: 'source', label: 'Predicted', default: 'open' },
    ],

    plots: [{ key: 'mrae', type: 'line', title: 'MRAE', style: { color: '#ffeb3b', lineWidth: 2 } }],

    // Pine: hline(0, "Perfect") and hline(1, "100% Error"), both dotted.
    levels: () => [
      { price: 0, title: 'Perfect', color: '#26a69a', lineStyle: 'dotted' },
      { price: 1, title: '100% Error', color: '#ef5350', lineStyle: 'dotted' },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const actual = sourceValues(bars, settings.actual ?? 'close')
      const predicted = sourceValues(bars, settings.predicted ?? 'open')

      const epsilon = 1e-10
      const relError = new Array(bars.length).fill(0)
      for (let i = 0; i < bars.length; i++) {
        // Pine uses two different nz defaults on the same series: 1.0 for the
        // denominator so a missing actual cannot divide by zero, 0.0 inside the
        // error term.
        const actualOr1 = Number.isFinite(actual[i]) ? actual[i] : 1
        const actualOr0 = Number.isFinite(actual[i]) ? actual[i] : 0
        const predictedOr0 = Number.isFinite(predicted[i]) ? predicted[i] : 0
        const absActual = Math.abs(actualOr1)
        const absError = Math.abs(actualOr0 - predictedOr0)
        relError[i] = absActual > epsilon ? absError / absActual : 0
      }

      // ta.sma is na for the first length-1 bars; sma() matches that.
      return { mrae: nulls(sma(relError, length)) }
    },
  })
}
