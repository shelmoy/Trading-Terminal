/**
 * MCNMA - McNicholl EMA - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/mcnma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Dennis McNicholl's zero-lag average (Better Bollinger Bands, Futures
 * Magazine, October 1998): 2*TEMA(src) - TEMA(TEMA(src)), built from six
 * cascaded exponential stages so the lag of the smoothing is subtracted back out.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-mcnma',
    name: 'MCNMA - McNicholl EMA',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 1, max: 5000, step: 1 },
    ],

    plots: [{ key: 'mcnma', type: 'line', title: 'MCNMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      const alpha = 2 / (period + 1)
      const beta = 1 - alpha

      // Six var-carried stages. Pine seeds all six to the first source value,
      // so the series emits from bar 0 with no warmup bias.
      let e1 = NaN
      let e2 = NaN
      let e3 = NaN
      let e4 = NaN
      let e5 = NaN
      let e6 = NaN
      let seeded = false

      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        // Pine wraps the source in nz(), so a missing value reads as 0.
        const s = Number.isFinite(src[i]) ? src[i] : 0

        if (!seeded) {
          e1 = s
          e2 = s
          e3 = s
          e4 = s
          e5 = s
          e6 = s
          seeded = true
        } else {
          e1 = alpha * s + beta * e1
          e2 = alpha * e1 + beta * e2
          e3 = alpha * e2 + beta * e3

          const stage1 = 3 * e1 - 3 * e2 + e3

          e4 = alpha * stage1 + beta * e4
          e5 = alpha * e4 + beta * e5
          e6 = alpha * e5 + beta * e6
        }

        const tema1 = 3 * e1 - 3 * e2 + e3
        const tema2 = 3 * e4 - 3 * e5 + e6
        const value = 2 * tema1 - tema2
        if (Number.isFinite(value)) out[i] = value
      }

      return { mcnma: nulls(out) }
    },
  })
}
