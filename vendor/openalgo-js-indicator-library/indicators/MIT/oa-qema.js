/**
 * Quadruple EMA (QEMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/qema.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Four exponential stages with rising smoothing factors are combined
 * 4/-6/4/-1, which cancels most of the lag an ordinary EMA carries while a
 * warmup compensator keeps the line usable from the very first bar.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-qema',
    name: 'Quadruple EMA (QEMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'qema', type: 'line', title: 'QEMA', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Each stage smooths faster than the one before it by the cube root of
      // 1 / a1, so the fourth factor lands on 1 and the stage tracks its input.
      const a1 = 2 / (period + 1)
      const r = Math.pow(1 / a1, 1 / 3)
      const a2 = a1 * r
      const a3 = a2 * r
      const a4 = a3 * r
      const beta1 = 1 - a1
      const beta2 = 1 - a2
      const beta3 = 1 - a3
      const beta4 = 1 - a4

      // Pine carries all of this in var state across bars.
      let e1 = 1
      let e2 = 1
      let e3 = 1
      let e4 = 1
      let warmup = true
      let rema1 = 0
      let rema2 = 0
      let rema3 = 0
      let rema4 = 0
      let ema1 = 0
      let ema2 = 0
      let ema3 = 0
      let ema4 = 0

      // 1 - e is positive for every period the input allows; the fallback only
      // covers a factor so small that beta rounds to exactly 1.
      const comp = (e) => (1 - e > 0 ? 1 / (1 - e) : 1)

      for (let i = 0; i < n; i++) {
        const s = src[i]
        // Pine would let a na source poison every later bar. Holding the state
        // and leaving a gap is the same line either side of a missing print.
        if (!Number.isFinite(s)) continue

        rema1 = a1 * (s - rema1) + rema1

        if (warmup) {
          e1 *= beta1
          e2 *= beta2
          e3 *= beta3
          e4 *= beta4
          const c1 = comp(e1)
          const c2 = comp(e2)
          const c3 = comp(e3)
          const c4 = comp(e4)
          ema1 = rema1 * c1
          rema2 = a2 * (ema1 - rema2) + rema2
          ema2 = rema2 * c2
          rema3 = a3 * (ema2 - rema3) + rema3
          ema3 = rema3 * c3
          rema4 = a4 * (ema3 - rema4) + rema4
          ema4 = rema4 * c4
          warmup = e1 > 1e-10
        } else {
          ema1 = rema1
          rema2 = a2 * (ema1 - rema2) + rema2
          ema2 = rema2
          rema3 = a3 * (ema2 - rema3) + rema3
          ema3 = rema3
          rema4 = a4 * (ema3 - rema4) + rema4
          ema4 = rema4
        }

        const value = 4 * ema1 - 6 * ema2 + 4 * ema3 - ema4
        if (Number.isFinite(value)) out[i] = value
      }

      return { qema: nulls(out) }
    },
  })
}
