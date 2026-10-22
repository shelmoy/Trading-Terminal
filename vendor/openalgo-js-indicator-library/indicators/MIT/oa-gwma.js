/**
 * Gaussian-Weighted Moving Average (GWMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/gwma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A finite impulse response average whose window weights follow a Gaussian bell
 * centred on the middle of the lookback, so bars near the centre of the window
 * dominate and the two ends taper off smoothly. Sigma sets the bell's width.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-gwma',
    name: 'Gaussian-Weighted Moving Average (GWMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      {
        key: 'sigma',
        type: 'number',
        label: 'Sigma',
        default: 0.4,
        min: 0.1,
        max: 1,
        step: 0.1,
        tooltip: 'Controls the width of the Gaussian bell curve. Lower values make the curve narrower.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'gwma', type: 'line', title: 'GWMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.min(5000, Math.floor(Number(settings.period) || 10)))
      const sigmaRaw = Number(settings.sigma)
      const sigma = Number.isFinite(sigmaRaw) && sigmaRaw > 0 ? Math.min(1, Math.max(0.1, sigmaRaw)) : 0.4
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      let weights = []
      let lastP = -1

      for (let i = 0; i < bars.length; i++) {
        // Pine grows the window from bar 0: p = min(bar_index + 1, period).
        const p = Math.min(i + 1, period)

        // Weights only change when p changes, which is once per bar until the
        // window fills and never again after that.
        if (p !== lastP) {
          weights = new Array(p).fill(0)
          const center = (p - 1) / 2
          const invSigmaP = 1 / (sigma * p)
          let total = 0
          for (let k = 0; k < p; k++) {
            const x = (k - center) * invSigmaP
            const w = Math.exp(-0.5 * x * x)
            weights[k] = w
            total += w
          }
          // total is a sum of positive exponentials, but guard the divide anyway.
          const invTotal = total > 0 ? 1 / total : 0
          for (let k = 0; k < p; k++) weights[k] *= invTotal
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

        // Pine: nz(sum / weight_sum, source) - an all-na window falls back to
        // the current sample.
        const value = weightSum !== 0 ? sum / weightSum : NaN
        if (Number.isFinite(value)) out[i] = value
        else if (Number.isFinite(src[i])) out[i] = src[i]
      }

      return { gwma: nulls(out) }
    },
  })
}
