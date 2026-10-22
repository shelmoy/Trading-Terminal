/**
 * Triple Exponential Moving Average (TEMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/tema.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Combines three chained exponential averages as 3*EMA1 - 3*EMA2 + EMA3, which
 * cancels most of the lag a single EMA carries. Each stage is divided by its own
 * exponential warmup compensator, so the line starts at the source on bar one
 * instead of drifting up from a zero seed.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-tema',
    name: 'Triple Exponential Moving Average (TEMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'tema', type: 'line', title: 'TEMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      // The script is called with corrected = false and no alpha override, so
      // all three stages share one smoothing factor.
      const a1 = 2 / (period + 1)
      const a2 = a1
      const a3 = a1
      const beta1 = 1 - a1
      const beta2 = 1 - a2
      const beta3 = 1 - a3

      // var state carried across bars, seeded exactly as Pine seeds it.
      let e1 = 1
      let e2 = 1
      let e3 = 1
      let warmup = true
      let rema1 = 0
      let rema2 = 0
      let rema3 = 0

      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const value = src[i]
        if (!Number.isFinite(value)) continue

        rema1 = a1 * (value - rema1) + rema1

        let ema1
        let ema2
        let ema3
        if (warmup) {
          e1 *= beta1
          e2 *= beta2
          e3 *= beta3
          const d1 = 1 - e1
          const d2 = 1 - e2
          const d3 = 1 - e3
          if (d1 === 0 || d2 === 0 || d3 === 0) continue
          const c1 = 1 / d1
          const c2 = 1 / d2
          const c3 = 1 / d3
          ema1 = rema1 * c1
          rema2 = a2 * (ema1 - rema2) + rema2
          ema2 = rema2 * c2
          rema3 = a3 * (ema2 - rema3) + rema3
          ema3 = rema3 * c3
          warmup = e1 > 1e-10
        } else {
          ema1 = rema1
          rema2 = a2 * (ema1 - rema2) + rema2
          ema2 = rema2
          rema3 = a3 * (ema2 - rema3) + rema3
          ema3 = rema3
        }

        out[i] = 3 * ema1 - 3 * ema2 + ema3
      }

      return { tema: nulls(out) }
    },
  })
}
