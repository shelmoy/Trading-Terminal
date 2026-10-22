/**
 * Gamma Distribution CDF (GAMMADIST) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/gammadist.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Min-max normalises the source over a lookback window, scales it by the rate
 * parameter and evaluates the regularized lower incomplete gamma function, so
 * the plot reads as the gamma CDF probability of the current price position.
 */

export default function ({ registerIndicator, sourceValues, highest, lowest, nulls }) {
  // Lanczos approximation, g = 7 with nine coefficients, exactly as in the source.
  const LANCZOS_G = 7.0
  const LANCZOS_C = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ]

  // ln(Gamma(z)) for z > 0.
  const lnGamma = (z) => {
    const zz = z - 1.0
    let x = LANCZOS_C[0]
    for (let i = 1; i <= 8; i++) x += LANCZOS_C[i] / (zz + i)
    const t = zz + LANCZOS_G + 0.5
    return 0.5 * Math.log(2.0 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x)
  }

  // Regularized lower incomplete gamma P(a,x) by series expansion.
  const gammaSeries = (a, x) => {
    const EPS = 1e-10
    const MAXITER = 200
    let ap = a
    let sum = 1.0 / a
    let del = sum
    for (let n = 1; n <= MAXITER; n++) {
      ap += 1.0
      del *= x / ap
      sum += del
      if (Math.abs(del) < Math.abs(sum) * EPS) break
    }
    const lnPfx = a * Math.log(x) - x - lnGamma(a)
    return Math.exp(lnPfx) * sum
  }

  // Regularized upper incomplete gamma Q(a,x) by the modified Lentz continued fraction.
  const gammaCF = (a, x) => {
    const TINY = 1e-30
    const EPS = 1e-10
    const MAXITER = 200
    const b0 = x + 1.0 - a
    let C = 1.0 / TINY
    let D = b0 < TINY ? 1.0 / TINY : 1.0 / b0
    let f = D
    for (let i = 1; i <= MAXITER; i++) {
      const ai = -i * (i - a)
      const bi = x + 2.0 * i + 1.0 - a
      D = bi + ai * D
      if (Math.abs(D) < TINY) D = TINY
      D = 1.0 / D
      C = bi + ai / C
      if (Math.abs(C) < TINY) C = TINY
      const delta = C * D
      f *= delta
      if (Math.abs(delta - 1.0) < EPS) break
    }
    const lnPfx = a * Math.log(x) - x - lnGamma(a)
    return Math.exp(lnPfx) * f
  }

  // P(a,x): the series converges quickly below a+1, the continued fraction above it.
  const gammaP = (a, x) => {
    if (x <= 0.0) return 0.0
    if (x < a + 1.0) return gammaSeries(a, x)
    return 1.0 - gammaCF(a, x)
  }

  registerIndicator({
    id: 'oa-gammadist',
    name: 'Gamma Distribution CDF (GAMMADIST)',
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
        tooltip: 'Min-max normalization window',
      },
      {
        key: 'shape',
        type: 'number',
        label: 'Shape (alpha)',
        default: 2,
        min: 0.01,
        max: 1000,
        step: 0.1,
        tooltip: 'Shape parameter; alpha below 1 decays, alpha of 1 is exponential, above 1 is bell-shaped',
      },
      {
        key: 'rate',
        type: 'number',
        label: 'Rate (beta)',
        default: 3,
        min: 0.01,
        max: 1000,
        step: 0.1,
        tooltip: 'Rate parameter; scales normalized x before CDF evaluation',
      },
    ],

    plots: [{ key: 'gammadist', type: 'line', title: 'GAMMADIST', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [
      { price: 0.5, title: 'Midline', color: '#787b86', lineStyle: 'dotted' },
      { price: 0.95, title: 'Upper', color: '#ef5350', lineStyle: 'dashed' },
      { price: 0.05, title: 'Lower', color: '#26a69a', lineStyle: 'dashed' },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 50))
      const shape = Math.max(0.01, Number(settings.shape) || 2)
      const rate = Math.max(0.01, Number(settings.rate) || 3)
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine scans source[0 .. period-1] and skips na, so before a full window is
      // available the window is simply every bar seen so far.
      const rollMax = highest(src, period)
      const rollMin = lowest(src, period)

      const out = new Array(bars.length).fill(NaN)
      let runMin = Infinity
      let runMax = -Infinity

      for (let i = 0; i < bars.length; i++) {
        const s = src[i]
        if (!Number.isFinite(s)) continue
        if (s < runMin) runMin = s
        if (s > runMax) runMax = s

        let minVal = runMin
        let maxVal = runMax
        if (i >= period - 1 && Number.isFinite(rollMin[i]) && Number.isFinite(rollMax[i])) {
          minVal = rollMin[i]
          maxVal = rollMax[i]
        }

        const range = maxVal - minVal
        const x = range > 0.0 ? (s - minVal) / range : 0.5
        const scaled = Math.max(0.0, x * rate)
        const value = gammaP(shape, scaled)
        if (Number.isFinite(value)) out[i] = value
      }

      return { gammadist: nulls(out) }
    },
  })
}
