/**
 * Normal Distribution CDF (NORMDIST) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/normdist.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The source is z-scored against its own rolling mean and standard deviation,
 * then pushed through the normal CDF, so the plot reads as the percentile the
 * current bar occupies in its recent distribution.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-normdist',
    name: 'Normal Distribution CDF (NORMDIST)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'period',
        type: 'number',
        label: 'Lookback Period',
        default: 50,
        min: 2,
        max: 5000,
        step: 1,
        tooltip: 'Rolling window for z-score normalization',
      },
      {
        key: 'mu',
        type: 'number',
        label: 'Mu',
        default: 0,
        step: 0.1,
        tooltip: 'Mean shift parameter (0 = standard normal)',
      },
      {
        key: 'sigma',
        type: 'number',
        label: 'Sigma',
        default: 1,
        min: 0.01,
        step: 0.1,
        tooltip: 'Scale parameter (1 = standard normal)',
      },
    ],

    plots: [{ key: 'normdist', type: 'line', title: 'NORMDIST', style: { color: '#ffeb3b', lineWidth: 2 } }],

    // Ported from the five hline() calls.
    levels: () => [
      { price: 0.5, title: 'Midline', color: '#787b86', dashed: true },
      { price: 0.975, title: 'Upper 2 sigma', color: '#ef5350', dashed: true },
      { price: 0.025, title: 'Lower 2 sigma', color: '#26a69a', dashed: true },
      { price: 0.841, title: 'Upper 1 sigma', color: '#ff9800', dashed: true },
      { price: 0.159, title: 'Lower 1 sigma', color: '#00897b', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 50))
      const muRaw = Number(settings.mu)
      const mu = Number.isFinite(muRaw) ? muRaw : 0
      const sigma = Math.max(0.01, Number(settings.sigma) || 1)
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      const out = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        const v = src[i]

        // Pine rescans source[0 .. period-1] every bar, skipping na, and this
        // has to stay a rescan. The variance below is the textbook
        // E[x^2] - E[x]^2 form, which cancels catastrophically on price data:
        // on a 24000-level index sumSq is around 1e9 while a quiet window's
        // variance is around 1e-7. A sliding accumulator drifts by roughly
        // 1e-6 over a few thousand bars, which is enough to push that variance
        // negative, collapse stddev to 0 and print a flat 0.5. Rescanning
        // keeps the error bounded to one window, exactly as the source has it.
        let sum = 0
        let sumSq = 0
        let count = 0
        for (let k = 0; k <= period - 1; k++) {
          const idx = i - k
          if (idx < 0) break
          const w = src[idx]
          if (!Number.isFinite(w)) continue
          sum += w
          sumSq += w * w
          count += 1
        }

        // Pine seeds result at 0.5 and only replaces it when count >= 2. An na
        // source then poisons z, so that bar draws as a gap.
        let result = 0.5
        if (count >= 2) {
          const mean = sum / count
          const variance = sumSq / count - mean * mean
          const stddev = variance > 0.0 ? Math.sqrt(variance) : 0.0

          const z = stddev > 0.0 ? (v - mean) / stddev : 0.0
          const zFinal = (z - mu) / sigma

          // erf via Abramowitz and Stegun, max error below 1.5e-7.
          const x = zFinal / Math.sqrt(2.0)
          const ax = Math.abs(x)
          const t = 1.0 / (1.0 + 0.47047 * ax)
          const t2 = t * t
          const t3 = t2 * t

          const a1 = 0.3480242
          const a2 = -0.0958798
          const a3 = 0.7478556

          const erfApprox = 1.0 - (a1 * t + a2 * t2 + a3 * t3) * Math.exp(-(ax * ax))
          const erf = x >= 0.0 ? erfApprox : -erfApprox

          result = 0.5 * (1.0 + erf)
        }
        out[i] = Number.isFinite(result) ? result : NaN
      }

      return { normdist: nulls(out) }
    },
  })
}
