/**
 * Log-Normal Distribution CDF (LOGNORMDIST) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/lognormdist.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Normalises the source to its own min-max range, then reads that position off
 * a log-normal cumulative distribution: an oscillator bounded in [0,1] whose
 * S-curve steepness is set by sigma rather than by a smoothing period.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Standard normal CDF via the Abramowitz and Stegun rational approximation
  // 7.1.26, accurate to about 1.5e-7.
  const normalCdf = (z) => {
    const P = 0.2316419
    const B1 = 0.319381530
    const B2 = -0.356563782
    const B3 = 1.781477937
    const B4 = -1.821255978
    const B5 = 1.330274429
    const az = Math.abs(z)
    const t = 1 / (1 + P * az)
    const phi = Math.exp(-0.5 * az * az) / Math.sqrt(2 * Math.PI)
    const poly = ((((B5 * t + B4) * t + B3) * t + B2) * t + B1) * t
    const cdf = 1 - phi * poly
    return z >= 0 ? cdf : 1 - cdf
  }

  registerIndicator({
    id: 'oa-lognormdist',
    name: 'Log-Normal Distribution CDF (LOGNORMDIST)',
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
        tooltip: 'Min-max normalization window.',
      },
      {
        key: 'mu',
        type: 'number',
        label: 'Mu',
        default: 0,
        step: 0.1,
        tooltip: 'Location parameter; mean of ln(X). 0 = centered on geometric mean of [0,1].',
      },
      {
        key: 'sigma',
        type: 'number',
        label: 'Sigma',
        default: 1,
        min: 0.01,
        step: 0.1,
        tooltip: 'Scale parameter; std dev of ln(X). Lower = steeper S-curve.',
      },
    ],

    plots: [
      { key: 'lognormdist', type: 'line', title: 'LOGNORMDIST', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    levels: () => [
      { price: 0.5, title: 'Midline', color: '#787b86', dashed: true },
      { price: 0.95, title: 'Upper', color: '#ff5252', dashed: true },
      { price: 0.05, title: 'Lower', color: '#4caf50', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.min(5000, Math.floor(Number(settings.period) || 50)))
      const mu = Number(settings.mu) || 0
      const sigma = Math.max(0.01, Number(settings.sigma) || 1)
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const current = src[i]
        if (!Number.isFinite(current)) continue

        // The window seeds from the current value and walks back, skipping any
        // bar before the start of history, so a short window is still valid.
        let minVal = current
        let maxVal = current
        for (let k = 1; k < period; k++) {
          const j = i - k
          if (j < 0) break
          const value = src[j]
          if (!Number.isFinite(value)) continue
          if (value < minVal) minVal = value
          if (value > maxVal) maxVal = value
        }

        // A flat window has no range to normalise against, so the source pins
        // the position at the middle rather than dividing by zero.
        const range = maxVal - minVal
        const x = range > 0 ? (current - minVal) / range : 0.5
        const safeX = Math.max(1e-10, x)
        out[i] = normalCdf((Math.log(safeX) - mu) / sigma)
      }

      return { lognormdist: nulls(out) }
    },
  })
}
