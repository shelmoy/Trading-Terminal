/**
 * TRIX - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/trix.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The percentage rate of change of a triple exponential moving average. The
 * triple smoothing strips out cycles shorter than the period, so what is left
 * crossing zero is a slow trend signal rather than a price wiggle.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-trix',
    name: 'TRIX',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 14,
        min: 1,
        max: 100,
        step: 1,
        tooltip: 'Period for triple exponential smoothing',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close', tooltip: 'Price series to analyze' },
    ],

    plots: [{ key: 'trix', type: 'line', title: 'TRIX', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.min(100, Math.max(1, Math.floor(Number(settings.period) || 14)))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const alpha = 2 / (period + 1)
      const d = 1 - alpha

      const out = new Array(n).fill(NaN)

      // Pine `var` state. e1/e2/e3 are the compounding bias-correction terms
      // that make the three EMAs unbiased from the very first bar; the warmup
      // flag drops the correction once it is numerically irrelevant.
      let e1 = 1
      let e2 = 1
      let e3 = 1
      let warmup = true
      let rema1 = 0
      let rema2 = 0
      let rema3 = 0
      let ema1 = NaN
      let ema2 = NaN
      let ema3 = NaN
      let prevEma3 = NaN
      let seeded = false

      for (let i = 0; i < n; i++) {
        const raw = src[i]
        // float src = na(source) ? source[1] : source
        const s = Number.isFinite(raw) ? raw : i > 0 && Number.isFinite(src[i - 1]) ? src[i - 1] : NaN

        if (!seeded) {
          // var float ema1 = src, ... var float prev_ema3 = src
          ema1 = s
          ema2 = s
          ema3 = s
          prevEma3 = s
          seeded = true
        }

        rema1 = alpha * (s - rema1) + rema1
        if (warmup) {
          e1 *= d
          e2 *= d
          e3 *= d
          ema1 = rema1 / (1 - e1)
          rema2 = alpha * (ema1 - rema2) + rema2
          ema2 = rema2 / (1 - e2)
          rema3 = alpha * (ema2 - rema3) + rema3
          ema3 = rema3 / (1 - e3)
          warmup = e1 > 1e-10
        } else {
          ema1 = rema1
          rema2 = alpha * (ema1 - rema2) + rema2
          ema2 = rema2
          rema3 = alpha * (ema2 - rema3) + rema3
          ema3 = rema3
        }

        // Pine's `prev_ema3 != 0` is false while prev_ema3 is na; JavaScript
        // would say true, so the finite check has to come first.
        const trixValue =
          Number.isFinite(prevEma3) && prevEma3 !== 0 ? (100 * (ema3 - prevEma3)) / prevEma3 : 0
        prevEma3 = ema3

        out[i] = Number.isFinite(raw) ? trixValue : NaN
      }

      return { trix: nulls(out) }
    },
  })
}
