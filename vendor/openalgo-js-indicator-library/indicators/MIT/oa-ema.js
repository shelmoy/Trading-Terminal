/**
 * Exponential Moving Average (EMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/ema.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A standard exponential moving average whose early bars are divided by a
 * warmup compensator, so the line is unbiased from the very first bar instead
 * of crawling up from a zero seed.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-ema',
    name: 'Exponential Moving Average (EMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'ema', type: 'line', title: 'EMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      const alpha = 2 / (period + 1)
      const beta = 1 - alpha

      const out = new Array(bars.length).fill(NaN)

      // Pine carries these as var state across bars: the raw zero-seeded EMA,
      // the running beta^n term and the warmup flag that switches the
      // compensator off once beta^n has decayed below 1e-10.
      let state = 0
      let decay = 1
      let warmup = true

      for (let i = 0; i < bars.length; i++) {
        const s = src[i]
        // A non-finite source would poison the recursion for the whole series,
        // so skip the bar and leave a gap instead.
        if (!Number.isFinite(s)) continue

        state = alpha * (s - state) + state

        if (warmup) {
          decay *= beta
          const denom = 1 - decay
          out[i] = denom !== 0 ? state / denom : state
          warmup = decay > 1e-10
        } else {
          out[i] = state
        }
      }

      return { ema: nulls(out) }
    },
  })
}
