/**
 * Mean Arctangent Absolute Percentage Error - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/maape.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The rolling mean of arctan(|actual - predicted| / |actual|). Wrapping the
 * percentage error in an arctangent bounds it at pi/2, so a near-zero actual
 * value cannot blow the average up the way a plain MAPE does.
 */

export default function ({ registerIndicator, sourceValues, sma, nulls }) {
  registerIndicator({
    id: 'oa-maape',
    name: 'Mean Arctangent Absolute Percentage Error',
    category: 'Errors',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'actual', type: 'source', label: 'Actual', default: 'close' },
      { key: 'predicted', type: 'source', label: 'Predicted', default: 'open' },
    ],

    plots: [
      {
        key: 'maape',
        type: 'line',
        title: 'MAAPE',
        style: { color: '#ffeb3b', lineWidth: 2 },
        // indicator(..., format=format.percent) in the source: the axis and the
        // crosshair suffix the raw value with a percent sign, they do not scale
        // it, so the pane still reads 0 to pi/2.
        priceFormat: { type: 'percent' },
      },
    ],

    levels: () => [
      { price: 0, title: 'Zero', color: '#787b86', dashed: true },
      { price: Math.PI / 2, title: 'Max (pi/2)', color: '#ff5252', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const actual = sourceValues(bars, settings.actual ?? 'close')
      const predicted = sourceValues(bars, settings.predicted ?? 'open')

      const EPSILON = 1e-10
      const HALF_PI = Math.PI / 2

      const n = bars.length
      const atanError = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        // Pine wraps both series in nz(), so a missing value reads as 0 here.
        const a = Number.isFinite(actual[i]) ? actual[i] : 0
        const p = Number.isFinite(predicted[i]) ? predicted[i] : 0
        const absActual = Math.abs(a)
        const absError = Math.abs(a - p)
        // A guard on the divide, and the same fallback the source uses: an
        // actual value at zero is treated as the maximum possible error.
        atanError[i] = absActual > EPSILON ? Math.atan(absError / absActual) : HALF_PI
      }

      // ta.sma(atanError, length): na for the first length - 1 bars.
      return { maape: nulls(sma(atanError, length)) }
    },
  })
}
