/**
 * Savitzky-Golay Moving Average (SGMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/sgma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A finite impulse response smoother that fits a low order polynomial across a
 * symmetric window, so it follows turns with less lag than a simple average of
 * the same length.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Pine rebuilds the weight array whenever the usable window length changes,
  // which during warmup is every bar until the full period is available.
  // The deg == 2 branch has three tabulated windows and a parabolic fallback.
  const buildWeights = (p, useDeg) => {
    if (useDeg === 2) {
      if (p === 5) return [-0.0857, 0.3429, 0.4857, 0.3429, -0.0857]
      if (p === 7) return [-0.0476, 0.0952, 0.2857, 0.3333, 0.2857, 0.0952, -0.0476]
      if (p === 9) return [-0.0281, 0.0337, 0.1236, 0.2247, 0.2921, 0.2247, 0.1236, 0.0337, -0.0281]
      const halfWindow = (p - 1) / 2
      const weights = new Array(p).fill(0)
      let totalWeight = 0
      for (let i = 0; i < p; i++) {
        const x = i - halfWindow
        // p == 1 makes halfWindow zero: 0 / 0 is NaN here exactly as it is na in
        // Pine, and the nz() fallback below then returns the source itself.
        const normX = x / halfWindow
        const w = 1 - normX * normX
        weights[i] = w
        totalWeight += w
      }
      // Pine does not guard this divide on the deg == 2 path. A zero or NaN
      // total poisons every weight, and the nz() fallback catches it.
      const invTotal = 1 / totalWeight
      for (let i = 0; i < p; i++) weights[i] = weights[i] * invTotal
      return weights
    }

    const halfWindow = (p - 1) / 2
    const weights = new Array(p).fill(0)
    let totalWeight = 0
    for (let i = 0; i < p; i++) {
      const x = i - halfWindow
      const normX = x / halfWindow
      let w
      if (useDeg === 0) w = 1
      else if (useDeg === 1) w = 1 - Math.abs(normX)
      else if (useDeg === 3) w = 1 - Math.abs(Math.pow(normX, 3))
      else if (useDeg === 4) w = 1 - Math.pow(normX, 4)
      else w = 1 - normX * normX
      weights[i] = w
      totalWeight += w
    }
    if (totalWeight > 0) {
      const invTotal = 1 / totalWeight
      for (let i = 0; i < p; i++) weights[i] = weights[i] * invTotal
    }
    return weights
  }

  registerIndicator({
    id: 'oa-sgma',
    name: 'Savitzky-Golay Moving Average (SGMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 9,
        min: 3,
        max: 5000,
        step: 2,
        tooltip: 'Must be odd number (will be adjusted if even).',
      },
      {
        key: 'degree',
        type: 'number',
        label: 'Polynomial Degree',
        default: 2,
        min: 0,
        max: 4,
        step: 1,
        tooltip: 'Higher degrees fit more complex shapes but risk overfitting.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'sgma', type: 'line', title: 'SGMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(3, Math.floor(Number(settings.period) || 9))
      const rawDegree = Number(settings.degree)
      const degree = Number.isFinite(rawDegree) ? Math.min(4, Math.max(0, Math.floor(rawDegree))) : 2
      const src = sourceValues(bars, settings.source ?? 'close')

      const usePeriod = period % 2 === 0 ? period + 1 : period
      const useDeg = degree < 0 || degree >= usePeriod ? 2 : Math.min(degree, 4)

      // Weights depend only on the usable window length, so cache them per call.
      const cache = new Map()
      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const p = Math.min(i + 1, usePeriod)
        let weights = cache.get(p)
        if (!weights) {
          weights = buildWeights(p, useDeg)
          cache.set(p, weights)
        }

        let sum = 0
        let weightSum = 0
        for (let k = 0; k < p; k++) {
          const price = src[i - k]
          if (!Number.isFinite(price)) continue
          const w = weights[k]
          sum += price * w
          weightSum += w
        }

        // Pine: nz(sum / weight_sum, source). A degenerate window falls back to
        // the raw source rather than drawing a spike.
        const value = sum / weightSum
        if (Number.isFinite(value)) out[i] = value
        else if (Number.isFinite(src[i])) out[i] = src[i]
      }

      return { sgma: nulls(out) }
    },
  })
}
