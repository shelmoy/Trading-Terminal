/**
 * Parzen Window Moving Average (PARZEN) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/parzen.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A symmetric FIR average whose kernel is the Parzen (de la Vallee-Poussin)
 * window, a piecewise cubic that reaches zero smoothly at both ends and so
 * suppresses sidelobes far harder than a plain or triangular average.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-parzen',
    name: 'Parzen Window Moving Average (PARZEN)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 2, max: 5000, step: 1 },
    ],

    plots: [{ key: 'parzen', type: 'line', title: 'PARZEN', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine raises
      // below 2, so the floor is 2.
      const period = Math.max(2, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      // Parzen weights, computed once: w[0] is the oldest bar in the window,
      // w[period - 1] the newest.
      const halfN = (period - 1) / 2
      const weights = new Array(period).fill(0)
      let wsum = 0
      for (let k = 0; k < period; k++) {
        const u = halfN > 0 ? (k - halfN) / halfN : 0
        const absU = Math.abs(u)
        let w = 0
        if (absU <= 0.5) {
          w = 1 - 6 * absU * absU + 6 * absU * absU * absU
        } else if (absU <= 1) {
          const t = 1 - absU
          w = 2 * t * t * t
        }
        weights[k] = w
        wsum += w
      }
      if (wsum > 0) {
        for (let j = 0; j < period; j++) weights[j] = weights[j] / wsum
      }

      const out = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        // Pine stores nz(source) in the ring buffer.
        const price = Number.isFinite(src[i]) ? src[i] : 0
        // Until the window is full Pine passes the raw price straight through.
        if (i + 1 < period) {
          out[i] = price
          continue
        }
        let result = 0
        for (let j = 0; j < period; j++) {
          const idx = i - period + 1 + j
          const val = Number.isFinite(src[idx]) ? src[idx] : 0
          result += val * weights[j]
        }
        out[i] = result
      }

      return { parzen: nulls(out) }
    },
  })
}
