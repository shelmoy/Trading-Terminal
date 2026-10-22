/**
 * Tukey - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/tukeybiweight.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Tukey's biweight (bisquare) loss between an actual and a predicted series,
 * averaged over a window: errors beyond the threshold c stop growing, so a
 * single outlier cannot dominate the reading.
 */

export default function ({ registerIndicator, sourceValues, sma, nulls }) {
  registerIndicator({
    id: 'oa-tukeybiweight',
    name: 'Tukey\'s Biweight Loss (TukeyBiweight)',
    category: 'Errors',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      {
        key: 'c',
        type: 'number',
        label: 'Threshold c',
        default: 4.685,
        min: 0.1,
        max: 1000,
        step: 0.1,
        tooltip: '4.685=95% efficiency for normal; 6.0=more permissive',
      },
      { key: 'actual', type: 'source', label: 'Actual', default: 'close' },
      { key: 'predicted', type: 'source', label: 'Predicted', default: 'open' },
    ],

    plots: [{ key: 'tukey', type: 'line', title: 'Tukey Biweight', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const c = Math.max(0.1, Number(settings.c) || 4.685)
      const actual = sourceValues(bars, settings.actual ?? 'close')
      const predicted = sourceValues(bars, settings.predicted ?? 'open')

      const cSquaredOver6 = (c * c) / 6.0

      const loss = new Array(bars.length).fill(0)
      for (let i = 0; i < bars.length; i++) {
        // Pine wraps both operands in nz(), so a missing value reads as 0.
        const a = Number.isFinite(actual[i]) ? actual[i] : 0
        const p = Number.isFinite(predicted[i]) ? predicted[i] : 0
        const error = a - p
        if (Math.abs(error) > c) {
          loss[i] = cSquaredOver6
        } else {
          // c is floored at 0.1 above, so this divide is safe.
          const ratio = error / c
          const oneMinusRatioSq = 1.0 - ratio * ratio
          const cubed = oneMinusRatioSq * oneMinusRatioSq * oneMinusRatioSq
          loss[i] = cSquaredOver6 * (1.0 - cubed)
        }
      }

      return { tukey: nulls(sma(loss, length)) }
    },
  })
}
