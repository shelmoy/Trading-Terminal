/**
 * Hann FIR Filter (HANN) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/hann.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A finite impulse response smoother whose taps follow a Hann (raised cosine)
 * window, so the oldest and newest bars in the window carry almost no weight
 * and the filter rings far less than a flat moving average of the same length.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-hann',
    name: 'Hann FIR Filter (HANN)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'hann', type: 'line', title: 'HANN', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const len = Math.max(1, Math.floor(Number(settings.length) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Hann coefficients: c[i] = 0.5 * (1 - cos(2*pi*i / (len - 1))).
      // At len = 1 the denominator is zero, exactly as in Pine, so the single
      // coefficient is NaN and the filter falls back to the raw source below.
      const w = new Array(len)
      for (let i = 0; i < len; i++) {
        w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (len - 1)))
      }

      const out = new Array(bars.length).fill(NaN)
      for (let b = 0; b < bars.length; b++) {
        // Pine uses p = min(bar_index + 1, len): before the window is full it
        // convolves with the first p taps only, so the filter emits from bar 0.
        const p = Math.min(b + 1, len)
        let acc = 0
        let weightSum = 0
        for (let i = 0; i < p; i++) {
          const price = src[b - (p - 1 - i)]
          if (!Number.isFinite(price)) continue
          const weight = w[i]
          if (!Number.isFinite(weight)) continue
          acc += price * weight
          weightSum += weight
        }
        // Pine: nz(currentWeightSum == 0 ? src : acc / currentWeightSum, src).
        // The first bar's only tap is zero, so the fallback to the raw source
        // is the normal path there, not an error case.
        const value = weightSum === 0 ? src[b] : acc / weightSum
        out[b] = Number.isFinite(value) ? value : src[b]
      }

      return { hann: nulls(out) }
    },
  })
}
