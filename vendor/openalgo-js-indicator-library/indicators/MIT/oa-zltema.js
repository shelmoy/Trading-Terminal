/**
 * Zero-Lag Triple EMA (ZLTEMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/zltema.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A triple exponential average fed a de-lagged price (today's price plus the
 * distance it has travelled over half the period), with each stage divided by
 * its own warmup compensator so the line is usable from the first bar.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-zltema',
    name: 'Zero-Lag Triple EMA (ZLTEMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'zltema', type: 'line', title: 'ZLTEMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      const a1 = 2 / (period + 1)
      const beta1 = 1 - a1
      const r = Math.pow(1 / a1, 1 / 3)
      const a2 = a1 * r
      const a3 = a2 * r
      // Pine divides two integers here, which truncates, and math.round of an
      // integer leaves it alone: period 10 gives a lag of 4, not 5.
      const lag = Math.max(1, Math.trunc((period - 1) / 2))

      const out = new Array(bars.length).fill(NaN)

      // The lag buffer is filled with the first available price, so the lagged
      // price is that first price until `lag` bars have gone by.
      let firstValid = -1
      let warmup = true
      let e = 1
      let ema1Raw = 0
      let ema2Raw = 0
      let ema3Raw = 0

      for (let i = 0; i < bars.length; i += 1) {
        const source = src[i]
        if (!Number.isFinite(source)) continue
        if (firstValid < 0) firstValid = i

        const laggedPrice = src[Math.max(firstValid, i - lag)]
        const signal = 2 * source - (Number.isFinite(laggedPrice) ? laggedPrice : source)

        ema1Raw += a1 * (signal - ema1Raw)

        let ema1
        let ema2
        let ema3
        if (warmup) {
          e *= beta1
          const denominator = 1 - e
          const c = denominator !== 0 ? 1 / denominator : 1
          ema1 = c * ema1Raw
          ema2Raw += a2 * (ema1 - ema2Raw)
          ema2 = c * ema2Raw
          ema3Raw += a3 * (ema2 - ema3Raw)
          ema3 = c * ema3Raw
          warmup = e > 1e-10
        } else {
          ema1 = ema1Raw
          ema2Raw += a2 * (ema1 - ema2Raw)
          ema2 = ema2Raw
          ema3Raw += a3 * (ema2 - ema3Raw)
          ema3 = ema3Raw
        }

        const value = 3 * ema1 - 3 * ema2 + ema3
        if (Number.isFinite(value)) out[i] = value
      }

      return { zltema: nulls(out) }
    },
  })
}
