/**
 * Double Exponential Moving Average (DEMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/dema.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Two chained exponential averages combined as 2*EMA1 - EMA2, which removes
 * most of the lag a single EMA carries while keeping its smoothness.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-dema',
    name: 'Double Exponential Moving Average (DEMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'dema', type: 'line', title: 'DEMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      const a = 2.0 / (period + 1)
      const beta = 1.0 - a

      // Pine carries all of these in var state across bars.
      let warmup = true
      let e = 1.0
      let ema1Raw = 0.0
      let ema2Raw = 0.0
      let ema1 = 0.0
      let ema2 = 0.0

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const value = src[i]
        // Pine does not guard the source; leaving state untouched on a missing
        // bar keeps one gap from poisoning every later value.
        if (!Number.isFinite(value)) continue

        ema1Raw = a * (value - ema1Raw) + ema1Raw
        if (warmup) {
          e *= beta
          // e is beta^n with 0 <= beta < 1, so 1 - e is never 0 here, but a
          // period large enough to round beta to 1 would make it so.
          const denom = 1.0 - e
          const c = denom !== 0 ? 1.0 / denom : 1.0
          ema1 = c * ema1Raw
          ema2Raw = a * (ema1 - ema2Raw) + ema2Raw
          ema2 = c * ema2Raw
          warmup = e > 1e-10
        } else {
          ema1 = ema1Raw
          ema2Raw = a * (ema1 - ema2Raw) + ema2Raw
          ema2 = ema2Raw
        }
        out[i] = 2 * ema1 - ema2
      }

      return { dema: nulls(out) }
    },
  })
}
