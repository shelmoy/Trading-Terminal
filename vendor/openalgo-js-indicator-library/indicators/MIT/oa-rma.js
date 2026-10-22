/**
 * Wilder's Moving Average (RMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/rma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Wilder's smoothing with an alpha of 1/period, compensated during warmup so
 * the average is usable from the very first bar instead of starting at zero.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-rma',
    name: 'Wilder\'s Moving Average (RMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'rma', type: 'line', title: 'RMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length
      const out = new Array(n).fill(NaN)

      const a = 1.0 / period
      const beta = 1.0 - a

      // var state, carried across bars exactly as Pine carries it. This is not
      // ta.rma: there is no SMA seed, the running product of beta divides the
      // missing weight back out instead.
      let warmup = true
      let e = 1.0
      let ema = 0.0

      for (let i = 0; i < n; i++) {
        const s = src[i]
        // Pine would propagate na here; hold the state and leave a gap instead.
        if (!Number.isFinite(s)) continue

        ema = a * (s - ema) + ema

        if (warmup) {
          e *= beta
          const denom = 1.0 - e
          const c = denom === 0 || !Number.isFinite(denom) ? 1.0 : 1.0 / denom
          out[i] = c * ema
          warmup = e > 1e-10
        } else {
          out[i] = ema
        }
      }

      return { rma: nulls(out) }
    },
  })
}
