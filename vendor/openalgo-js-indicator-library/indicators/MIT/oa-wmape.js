/**
 * Weighted Mean Absolute Percentage Error - ported to openalgo-charts from
 * Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/wmape.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Total absolute forecast error over a rolling window divided by the total
 * absolute actual value, as a percentage. Weighting by magnitude is what keeps
 * it stable where a plain MAPE explodes on small actuals.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-wmape',
    name: 'Weighted Mean Absolute Percentage Error',
    category: 'Errors',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'actual', type: 'source', label: 'Actual', default: 'close' },
      { key: 'predicted', type: 'source', label: 'Predicted', default: 'open' },
    ],

    plots: [
      {
        key: 'wmape',
        type: 'line',
        title: 'WMAPE',
        style: { color: '#ffeb3b', lineWidth: 2 },
        // The source declares format.percent: suffix the reading, do not scale
        // it, because the value is already expressed in percent.
        priceFormat: { type: 'percent' },
      },
    ],

    levels: () => [{ price: 0, title: 'Perfect', color: '#4caf50', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const actual = sourceValues(bars, settings.actual ?? 'close')
      const predicted = sourceValues(bars, settings.predicted ?? 'open')

      const n = bars.length
      const out = new Array(n).fill(NaN)
      const epsilon = 1e-10

      const absError = new Array(n).fill(0)
      const absActual = new Array(n).fill(0)
      let sumError = 0
      let sumActual = 0

      for (let i = 0; i < n; i++) {
        // Both operands are wrapped in nz() by the source, so a missing value
        // contributes zero rather than blanking the whole window.
        const a = Number.isFinite(actual[i]) ? actual[i] : 0
        const p = Number.isFinite(predicted[i]) ? predicted[i] : 0
        absError[i] = Math.abs(a - p)
        absActual[i] = Math.abs(a)

        sumError += absError[i]
        sumActual += absActual[i]
        if (i >= length) {
          sumError -= absError[i - length]
          sumActual -= absActual[i - length]
        }

        // ta.sum has no value until the window is full. Pine's na comparison
        // then falls through to the 0 branch, which would sit on the pane as a
        // real "perfect forecast" reading; a gap is what it actually means.
        if (i < length - 1) continue

        // A window whose actuals are all zero has no scale to divide by. The
        // source reports 0 there, and so does this.
        out[i] = sumActual > epsilon ? (sumError / sumActual) * 100 : 0
      }

      return { wmape: nulls(out) }
    },
  })
}
