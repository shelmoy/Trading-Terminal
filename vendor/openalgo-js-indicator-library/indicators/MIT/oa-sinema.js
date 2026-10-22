/**
 * Sine-weighted Moving Average (SINEMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/sinema.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A FIR average whose weights follow half a sine arch across the window, so
 * the middle of the lookback dominates and both ends fade to nothing.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-sinema',
    name: 'Sine-weighted Moving Average (SINEMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'sinema', type: 'line', title: 'SINEMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      // Pine rebuilds the weight array whenever the usable window p changes,
      // where p = min(bar_index + 1, period): the window grows with the data
      // and the indicator emits from the very first bar.
      let prevP = 0
      let weights = []
      for (let i = 0; i < bars.length; i++) {
        const p = Math.min(i + 1, period)
        if (p !== prevP) {
          weights = new Array(p)
          for (let j = 0; j < p; j++) weights[j] = Math.sin((Math.PI * (j + 1)) / p)
          prevP = p
        }
        let sum = 0
        let weight = 0
        for (let k = 0; k < p; k++) {
          const price = src[i - k]
          if (!Number.isFinite(price)) continue
          sum += price * weights[k]
          weight += weights[k]
        }
        // Pine wraps the division in nz(sum / weight, source): a zero weight
        // sum (p = 1 gives sin(pi) = 0) falls back to the raw source value.
        const value = weight !== 0 ? sum / weight : NaN
        out[i] = Number.isFinite(value) ? value : src[i]
      }

      return { sinema: nulls(out) }
    },
  })
}
