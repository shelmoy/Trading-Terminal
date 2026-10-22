/**
 * Hamming Moving Average (HAMMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/hamma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A finite impulse response average whose weights follow the Hamming window,
 * so the middle of the lookback dominates and the two ends contribute least.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-hamma',
    name: 'Hamming Moving Average (HAMMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'hamma', type: 'line', title: 'HAMMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // The window grows with the chart until it reaches `period`. Pine seeds
      // the weight array with a single 1.0 and only rebuilds it when the width
      // changes, so a width of one keeps that seeded weight instead of the
      // degenerate cos(0 / 0) the formula would give at p - 1 == 0.
      let weights = [1]
      let lastP = 1

      for (let i = 0; i < n; i++) {
        const p = Math.min(i + 1, period)
        if (lastP !== p) {
          weights = new Array(p)
          for (let k = 0; k < p; k++) weights[k] = 0.54 - 0.46 * Math.cos((2 * Math.PI * k) / (p - 1))
          lastP = p
        }

        let sum = 0
        let weightSum = 0
        for (let k = 0; k < p; k++) {
          const price = src[i - k]
          if (!Number.isFinite(price)) continue
          sum += price * weights[k]
          weightSum += weights[k]
        }

        // nz(sum / weight_sum, source): an empty or zero-weight window falls
        // back to the raw source rather than dividing by zero.
        const value = weightSum !== 0 ? sum / weightSum : NaN
        out[i] = Number.isFinite(value) ? value : src[i]
      }

      return { hamma: nulls(out) }
    },
  })
}
