/**
 * Leader EMA (LEMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/lema.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Siligardos' leading exponential average: Leader = EMA(src) + EMA(src - EMA(src)).
 * The second term smooths the tracking error of the first and adds it back, so
 * the line leans ahead of a plain EMA of the same period without giving up its
 * smoothness. Both legs carry the source's bias compensation, which is what lets
 * the plot start on bar zero instead of after a warmup gap.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-lema',
    name: 'Leader EMA (LEMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 1, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'lema', type: 'line', title: 'LEMA', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      const alpha = 2 / (period + 1)
      const beta = 1 - alpha

      // Two IIR states plus their bias-compensation decays, carried bar to bar
      // exactly as Pine's var declarations do.
      let ema1 = 0
      let e1 = 1
      let warmup1 = true
      let ema2 = 0
      let e2 = 1
      let warmup2 = true

      for (let i = 0; i < n; i++) {
        // Pine: float price = nz(source)
        const price = Number.isFinite(src[i]) ? src[i] : 0

        ema1 = alpha * (price - ema1) + ema1
        let compEma1 = ema1
        if (warmup1) {
          e1 *= beta
          // beta < 1 for every period, so 1 - e1 is never 0; the guard keeps a
          // degenerate setting from emitting Infinity.
          const denom1 = 1 - e1
          if (Math.abs(denom1) > 1e-300) compEma1 = ema1 / denom1
          warmup1 = e1 > 1e-10
        }

        const error = price - compEma1

        ema2 = alpha * (error - ema2) + ema2
        let compEma2 = ema2
        if (warmup2) {
          e2 *= beta
          const denom2 = 1 - e2
          if (Math.abs(denom2) > 1e-300) compEma2 = ema2 / denom2
          warmup2 = e2 > 1e-10
        }

        const value = compEma1 + compEma2
        if (Number.isFinite(value)) out[i] = value
      }

      return { lema: nulls(out) }
    },
  })
}
