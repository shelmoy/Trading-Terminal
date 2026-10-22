/**
 * Hanning Moving Average (HANMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/hanma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A finite impulse response average whose taps follow a raised cosine (Hanning)
 * window, so the newest and oldest bars in the window carry almost no weight and
 * the centre carries the most. That taper suppresses the ringing a flat boxcar
 * average leaves behind.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-hanma',
    name: 'Hanning Moving Average (HANMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'hanma', type: 'line', title: 'HANMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)

      // Pine seeds the window array with a single unit tap and only rebuilds it
      // when the effective length changes, so bar 0 (and a period of 1) weights
      // the current bar by 1.0 rather than by the degenerate cos(0/0) tap.
      let weights = [1]
      let lastP = 1

      for (let i = 0; i < bars.length; i++) {
        // The window grows with the chart: p = min(bar_index + 1, period).
        const p = Math.min(i + 1, period)
        if (p !== lastP) {
          weights = new Array(p)
          for (let k = 0; k < p; k++) {
            weights[k] = 0.5 * (1 - Math.cos((2 * Math.PI * k) / (p - 1)))
          }
          lastP = p
        }

        let sum = 0
        let weightSum = 0
        for (let k = 0; k < p; k++) {
          const price = src[i - k]
          if (!Number.isFinite(price)) continue
          const w = weights[k]
          if (!Number.isFinite(w)) continue
          sum += price * w
          weightSum += w
        }

        // Pine's nz(sum / weight_sum, source): a fully zero taper (p of 2, where
        // both Hanning endpoints are zero) falls back to the raw source.
        const value = weightSum !== 0 ? sum / weightSum : NaN
        out[i] = Number.isFinite(value) ? value : src[i]
      }

      return { hanma: nulls(out) }
    },
  })
}
