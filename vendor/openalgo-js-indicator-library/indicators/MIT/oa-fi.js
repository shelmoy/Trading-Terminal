/**
 * Force Index (FI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/fi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Elder's Force Index multiplies the bar-to-bar price change by volume and
 * smooths it with an EMA, so the sign shows who won the bar and the size shows
 * how much conviction was behind it.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-fi',
    name: 'Force Index (FI)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [{ key: 'period', type: 'number', label: 'Period', default: 13, min: 1, max: 500, step: 1 }],

    plots: [{ key: 'fi', type: 'line', title: 'Force Index', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [{ price: 0, title: 'Zero', color: '#787b86', dashed: true }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.min(500, Math.max(1, Math.floor(Number(settings.period) || 13)))
      const n = bars.length
      const alpha = 2 / (period + 1)
      const beta = 1 - alpha

      const out = new Array(n).fill(NaN)

      // Pine carries all of this in var state across bars.
      let emaValue = 0
      let e = 1
      let warmup = true
      let first = true
      let prevClose = NaN

      for (let i = 0; i < n; i++) {
        const src = Number.isFinite(bars[i].close) ? bars[i].close : 0
        // Index series carry no volume: Pine's nz(volume) reads that as 0.
        const vol = Number.isFinite(bars[i].volume) ? bars[i].volume : 0

        const rawForce = Number.isFinite(prevClose) ? (src - prevClose) * vol : 0
        prevClose = src

        if (first) {
          emaValue = rawForce
          first = false
        } else {
          emaValue = alpha * rawForce + beta * emaValue
        }

        // While the EMA is still filling, divide out the accumulated weight so
        // the early values are not dragged toward the zero seed.
        let result
        if (warmup) {
          e = e * beta
          const c = e > 1e-10 ? 1 / (1 - e) : 1
          result = emaValue * c
          if (e <= 1e-10) warmup = false
        } else {
          result = emaValue
        }

        out[i] = result
      }

      return { fi: nulls(out) }
    },
  })
}
