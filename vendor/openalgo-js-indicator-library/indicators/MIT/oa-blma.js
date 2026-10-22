/**
 * Blackman Moving Average (BLMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/blma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A finite impulse response average weighted by the Blackman window, whose
 * three-term cosine taper falls to zero at both ends of the lookback and so
 * removes the ringing a flat-weighted average leaves behind.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-blma',
    name: 'Blackman Moving Average (BLMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'blma', type: 'line', title: 'BLMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Pine keeps the weights in a var array and only rebuilds them when the
      // effective window length changes, which it does once per bar until the
      // full period is available. The single-element seed is what keeps the
      // 1 / (p - 1) term away from a division by zero on the first bar.
      let weights = [1]
      let lastP = 1

      const a0 = 0.42
      const a1 = 0.5
      const a2 = 0.08
      const pi2 = 2 * Math.PI
      const pi4 = 4 * Math.PI

      for (let i = 0; i < n; i++) {
        const p = Math.min(i + 1, period)
        if (lastP !== p) {
          weights = new Array(p).fill(0)
          let totalWeight = 0
          const invPMinus1 = 1 / (p - 1)
          for (let k = 0; k < p; k++) {
            const ratio = k * invPMinus1
            const term1 = a1 * Math.cos(pi2 * ratio)
            const term2 = a2 * Math.cos(pi4 * ratio)
            const w = a0 - term1 + term2
            weights[k] = w
            totalWeight += w
          }
          const invTotal = 1 / totalWeight
          for (let k = 0; k < p; k++) weights[k] = weights[k] * invTotal
          lastP = p
        }

        let sum = 0
        let weightSum = 0
        for (let k = 0; k < p; k++) {
          const price = src[i - k]
          if (Number.isFinite(price)) {
            const w = weights[k]
            sum += price * w
            weightSum += w
          }
        }
        // Pine's nz(sum / weight_sum, source): a degenerate window falls back to
        // the raw price rather than drawing a gap.
        const value = sum / weightSum
        out[i] = Number.isFinite(value) ? value : src[i]
      }

      return { blma: nulls(out) }
    },
  })
}
