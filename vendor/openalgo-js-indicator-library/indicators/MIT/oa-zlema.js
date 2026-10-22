/**
 * Zero-Lag EMA (ZLEMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_IIR/zlema.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * An exponential average fed a de-lagged price, price plus the change over
 * half the period, so it tracks a trend with far less of the delay an EMA of
 * the same period carries.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-zlema',
    name: 'Zero-Lag EMA (ZLEMA)',
    category: 'Trends IIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'zlema', type: 'line', title: 'ZLEMA', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      const alpha = 2 / (period + 1)
      const beta = 1 - alpha
      // Pine divides two ints here, and that truncates, so math.round is handed
      // a whole number and changes nothing: period 10 lags 4 bars, not 5.
      const lag = Math.max(1, Math.trunc((period - 1) / 2))

      // The source's lag buffer is pre-filled with 0.0, not na, so the lagged
      // price reads 0 until lag bars have been pushed and the de-lagged signal
      // is 2 * price over those bars: the line starts at roughly twice the
      // price and converges within lag bars. That is the source's own output,
      // kept rather than blanked. Only bars with a finite source are pushed,
      // matching the `if not na(source)` guard.
      const pushed = []

      let warmup = true
      let e = 1
      let zlema = 0
      let result = NaN

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const value = src[i]
        if (Number.isFinite(value)) {
          pushed.push(value)
          const laggedPrice = pushed.length > lag ? pushed[pushed.length - 1 - lag] : 0
          const signal = 2 * value - laggedPrice
          zlema = alpha * (signal - zlema) + zlema
          if (warmup) {
            // Compensator: divide out the fraction of the impulse the filter
            // has not accumulated yet, so the first bars are not dragged to 0.
            e *= beta
            const denom = 1 - e
            result = denom > 0 ? zlema / denom : zlema
            warmup = e > 1e-10
          } else {
            result = zlema
          }
        }
        out[i] = result
      }

      return { zlema: nulls(out) }
    },
  })
}
