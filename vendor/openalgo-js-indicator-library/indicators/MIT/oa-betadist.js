/**
 * Beta Distribution CDF (BETADIST) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/betadist.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Normalizes the source to [0,1] over a min-max window, then evaluates the
 * regularized incomplete beta function at that point, so the reading is the
 * probability that a Beta(alpha, beta) variate falls at or below the current
 * position in its recent range.
 */

export default function ({ registerIndicator, sourceValues, highest, lowest, nulls }) {
  // Lanczos approximation, g = 7, nine coefficients, exactly as in the source.
  const LANCZOS = [
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

  const lnGamma = (z) => {
    const g = 7.0
    const zz = z - 1.0
    let x = LANCZOS[0]
    for (let i = 1; i <= 8; i++) {
      const den = zz + i
      if (den === 0) continue
      x += LANCZOS[i] / den
    }
    const t = zz + g + 0.5
    return 0.5 * Math.log(2.0 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x)
  }

  // Regularized incomplete beta I_x(a,b) by the modified Lentz continued fraction.
  const betaReg = (x, a, b) => {
    if (!Number.isFinite(x)) return NaN
    if (x <= 0.0) return 0.0
    if (x >= 1.0) return 1.0

    const flip = x > (a + 1.0) / (a + b + 2.0)
    const xx = flip ? 1.0 - x : x
    const aa = flip ? b : a
    const bb = flip ? a : b
    if (!(xx > 0.0) || !(1.0 - xx > 0.0)) return flip ? 1.0 : 0.0

    // This is the source's front2: its front, built from the unflipped a and b,
    // is computed and then never used, so it is left out.
    const lnPfx = aa * Math.log(xx) + bb * Math.log(1.0 - xx) - Math.log(aa) - lnGamma(aa) - lnGamma(bb) + lnGamma(aa + bb)
    const front = Math.exp(lnPfx)

    const TINY = 1e-30
    const EPS = 1e-10
    const MAXITER = 200
    let f = TINY
    let C = TINY
    let D = 0.0
    let delta = 0.0

    for (let m = 0; m < MAXITER; m++) {
      const mm = Math.floor(m / 2)
      let d = 0.0
      if (m === 0) {
        d = 1.0
      } else if (m % 2 === 0) {
        const mf = mm
        const den = (aa + 2.0 * mf - 1.0) * (aa + 2.0 * mf)
        d = den !== 0 ? (mf * (bb - mf) * xx) / den : 0.0
      } else {
        const mf = mm + 1.0
        const den = (aa + 2.0 * mf - 2.0) * (aa + 2.0 * mf - 1.0)
        d = den !== 0 ? (-(aa + mf - 1.0) * (aa + bb + mf - 1.0) * xx) / den : 0.0
      }
      if (!Number.isFinite(d)) d = 0.0

      D = 1.0 + d * D
      if (Math.abs(D) < TINY) D = TINY
      D = 1.0 / D
      C = 1.0 + d / C
      if (Math.abs(C) < TINY) C = TINY
      delta = C * D
      f *= delta
      if (Math.abs(delta - 1.0) < EPS) break
    }

    const result = front * f
    if (!Number.isFinite(result)) return NaN
    return flip ? 1.0 - result : result
  }

  registerIndicator({
    id: 'oa-betadist',
    name: 'Beta Distribution CDF (BETADIST)',
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
        key: 'alpha',
        type: 'number',
        label: 'Alpha',
        default: 2,
        min: 0.01,
        max: 1000,
        step: 0.1,
        tooltip: 'Left shape; below 1 weights toward 0, above 1 weights toward the centre',
      },
      {
        key: 'beta',
        type: 'number',
        label: 'Beta',
        default: 2,
        min: 0.01,
        max: 1000,
        step: 0.1,
        tooltip: 'Right shape; below 1 weights toward 1, above 1 weights toward the centre',
      },
    ],

    plots: [{ key: 'betadist', type: 'line', title: 'BETADIST', style: { color: '#ffeb3b', lineWidth: 2 } }],

    // The source draws the two bands dashed and the midline dotted, and a level
    // carries its own lineStyle, so all three styles come across unchanged.
    levels: () => [
      { price: 0.95, title: 'Upper', color: '#ef5350', lineStyle: 'dashed' },
      { price: 0.5, title: 'Midline', color: '#9598a1', lineStyle: 'dotted' },
      { price: 0.05, title: 'Lower', color: '#26a69a', lineStyle: 'dashed' },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 50))
      const alpha = Math.max(0.01, Number(settings.alpha) || 2)
      const betaParam = Math.max(0.01, Number(settings.beta) || 2)
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      // Pine walks source[0 .. period-1] and skips na, so before the window is
      // full the extremes are taken over every bar seen so far.
      const hi = highest(src, period)
      const lo = lowest(src, period)
      const out = new Array(n).fill(NaN)
      let runHi = NaN
      let runLo = NaN

      for (let i = 0; i < n; i++) {
        const v = src[i]
        if (Number.isFinite(v)) {
          runHi = Number.isFinite(runHi) ? Math.max(runHi, v) : v
          runLo = Number.isFinite(runLo) ? Math.min(runLo, v) : v
        }
        if (!Number.isFinite(v)) continue

        let maxVal
        let minVal
        if (i >= period - 1) {
          maxVal = hi[i]
          minVal = lo[i]
        } else {
          maxVal = runHi
          minVal = runLo
        }
        if (!Number.isFinite(maxVal) || !Number.isFinite(minVal)) continue

        const range = maxVal - minVal
        const x = range > 0.0 ? (v - minVal) / range : 0.5
        out[i] = betaReg(x, alpha, betaParam)
      }

      return { betadist: nulls(out) }
    },
  })
}
