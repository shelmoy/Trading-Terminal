/**
 * Pseudo-Huber Loss - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/errors/pseudohuber.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The Charbonnier form of the Huber loss: quadratic for errors smaller than
 * delta and linear beyond it, averaged over a rolling window, so a forecast is
 * scored without a single outlier dominating the reading.
 */

export default function ({ registerIndicator, sourceValues, sma, nulls }) {
  registerIndicator({
    id: 'oa-pseudohuber',
    name: 'Pseudo-Huber Loss',
    category: 'Errors',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      {
        key: 'delta',
        type: 'number',
        label: 'Delta (transition scale)',
        default: 1,
        min: 0.001,
        max: 100000,
        step: 0.1,
        tooltip: 'Controls transition between quadratic and linear behavior',
      },
      { key: 'actual', type: 'source', label: 'Actual', default: 'close' },
      { key: 'predicted', type: 'source', label: 'Predicted', default: 'open' },
    ],

    plots: [
      { key: 'loss', type: 'line', title: 'Pseudo-Huber', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86' }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const delta = Math.max(0.001, Number(settings.delta) || 1)
      const actual = sourceValues(bars, settings.actual ?? 'close')
      const predicted = sourceValues(bars, settings.predicted ?? 'open')

      const deltaSquared = delta * delta

      // Pine wraps both series in nz(), so a missing value counts as zero here
      // rather than blanking the bar.
      const loss = new Array(bars.length)
      for (let i = 0; i < bars.length; i++) {
        const a = Number.isFinite(actual[i]) ? actual[i] : 0
        const p = Number.isFinite(predicted[i]) ? predicted[i] : 0
        const ratio = (a - p) / delta
        loss[i] = deltaSquared * (Math.sqrt(1.0 + ratio * ratio) - 1.0)
      }

      // ta.sma is na for the first length-1 bars.
      return { loss: nulls(sma(loss, length)) }
    },
  })
}
