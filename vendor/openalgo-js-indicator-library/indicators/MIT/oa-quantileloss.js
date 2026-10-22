/**
 * Quantile Loss (Pinball Loss) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/quantileloss.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The rolling mean of the pinball loss between an actual and a predicted
 * series: an asymmetric error measure that charges the two directions of the
 * miss at different rates, so a quantile above 0.5 punishes under-prediction
 * and one below 0.5 punishes over-prediction.
 */

export default function ({ registerIndicator, sourceValues, sma, nulls }) {
  registerIndicator({
    id: 'oa-quantileloss',
    name: 'Quantile Loss (Pinball Loss)',
    category: 'Errors',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      {
        key: 'quantile',
        type: 'number',
        label: 'Quantile',
        default: 0.5,
        min: 0.01,
        max: 0.99,
        step: 0.05,
        tooltip: '0.5 is the median (mean absolute error). Above 0.5 penalises under-prediction, below 0.5 penalises over-prediction.',
      },
      { key: 'actual', type: 'source', label: 'Actual', default: 'close' },
      { key: 'predicted', type: 'source', label: 'Predicted', default: 'open' },
    ],

    plots: [
      { key: 'loss', type: 'line', title: 'Quantile Loss', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const quantile = Math.min(0.99, Math.max(0.01, Number(settings.quantile) || 0.5))
      const actual = sourceValues(bars, settings.actual ?? 'close')
      const predicted = sourceValues(bars, settings.predicted ?? 'open')

      // Pine wraps both operands in nz(), so a missing value reads as 0 here.
      const loss = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const a = Number.isFinite(actual[i]) ? actual[i] : 0
        const p = Number.isFinite(predicted[i]) ? predicted[i] : 0
        const diff = a - p
        loss[i] = diff >= 0 ? quantile * diff : (quantile - 1) * diff
      }

      // ta.sma over the window: na for the first length - 1 bars.
      return { loss: nulls(sma(loss, length)) }
    },
  })
}
