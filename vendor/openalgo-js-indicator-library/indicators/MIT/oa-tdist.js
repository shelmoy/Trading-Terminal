/**
 * Student's t-Distribution CDF (TDIST) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/tdist.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The source is min-max normalized over a lookback window, mapped onto a
 * t-statistic, and read through the Student's t cumulative distribution, so the
 * output is the probability that price sits at or below its position in the
 * recent range under a heavy-tailed model.
 */

export default function ({ registerIndicator, sourceValues, highest, lowest, nulls }) {
  // Natural log of the Gamma function, Lanczos approximation with g = 7 and
  // nine coefficients, exactly the constants used by the Pine source.
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
  const LOG_SQRT_2PI = 0.9189385332046727

  const lnGamma = (z) => {
    const g = 7.0
    const zz = z < 0.5 ? 1.0 - z : z - 1.0
    let x = LANCZOS[0]
    for (let i = 1; i <= 8; i++) x += LANCZOS[i] / (zz + i)
    const t = zz + g + 0.5
    const lnG = LOG_SQRT_2PI + Math.log(t) * (zz + 0.5) - t + Math.log(x)
    return z < 0.5 ? Math.log(Math.PI / Math.sin(Math.PI * z)) - lnG : lnG
  }

  // Regularized incomplete beta function I_x(a, b), Lentz continued fraction
  // with the usual symmetry flip for fast convergence.
  //
  // Ported exactly as the Pine source has it, including one upstream quirk:
  // the iteration starts at m = 1 with the even term, so the leading odd term
  // of the continued fraction (m = 0, numerator -(a)(a+b)x/(a(a+1))) is never
  // applied, and f is seeded at 1 instead of at that term. The result is a few
  // percent away from the textbook value (I_0.1(0.5, 0.5) comes out 0.18835
  // against an exact 0.20483), which shifts the plotted CDF slightly towards
  // the extremes. Reproduced here so this study matches the Pine original and
  // its sibling BETADIST and FDIST ports rather than quietly disagreeing with
  // them. Fix it upstream, not here.
  const betaReg = (x, a, b) => {
    const MAXITER = 200
    const EPS = 1e-10
    const TINY = 1e-30

    if (!(x > 0.0)) return 0.0
    if (x >= 1.0) return 1.0

    const flipped = x > (a + 1.0) / (a + b + 2.0)
    const xx = flipped ? 1.0 - x : x
    const aa = flipped ? b : a
    const bb = flipped ? a : b

    const logPfx =
      aa * Math.log(xx) +
      bb * Math.log(1.0 - xx) -
      Math.log(aa) -
      lnGamma(aa) -
      lnGamma(bb) +
      lnGamma(aa + bb)
    const pfx = Math.exp(logPfx)

    let f = 1.0 + TINY
    let C = f
    let D = 0.0
    for (let m = 1; m <= MAXITER; m++) {
      const m2 = 2.0 * m
      const numEven = (m * (bb - m) * xx) / ((aa + m2 - 1.0) * (aa + m2))
      D = 1.0 + numEven * D
      if (Math.abs(D) < TINY) D = TINY
      D = 1.0 / D
      C = 1.0 + numEven / C
      if (Math.abs(C) < TINY) C = TINY
      f *= C * D
      const numOdd = (-(aa + m) * (aa + bb + m) * xx) / ((aa + m2) * (aa + m2 + 1.0))
      D = 1.0 + numOdd * D
      if (Math.abs(D) < TINY) D = TINY
      D = 1.0 / D
      C = 1.0 + numOdd / C
      if (Math.abs(C) < TINY) C = TINY
      const delta = C * D
      f *= delta
      if (Math.abs(delta - 1.0) < EPS) break
    }

    const raw = pfx * f
    return flipped ? 1.0 - raw : raw
  }

  registerIndicator({
    id: 'oa-tdist',
    name: 'Student\'s t-Distribution CDF (TDIST)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 50, min: 1, max: 5000, step: 1 },
      {
        key: 'df',
        type: 'number',
        label: 'Degrees of Freedom',
        default: 5,
        min: 0.1,
        max: 1000,
        step: 0.1,
        tooltip: 'Tail weight. 1 is Cauchy with very heavy tails, large values approach the normal distribution.',
      },
    ],

    plots: [{ key: 'value', type: 'line', title: 'TDIST', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [
      { price: 0.5, title: 'Midline', color: '#787b86' },
      { price: 0.95, title: 'Upper', color: '#ef5350', dashed: true },
      { price: 0.05, title: 'Lower', color: '#4caf50', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 50))
      const df = Math.max(0.1, Number(settings.df) || 5)
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine reads source[i] for i = 1 .. period-1 through nz(), so a lookback
      // that reaches before the first bar folds a 0 into the window extremes.
      // For a complete window the rolling helpers give the same answer.
      const hiFull = highest(src, period)
      const loFull = lowest(src, period)

      const out = new Array(bars.length).fill(NaN)
      let prefixHi = -Infinity
      let prefixLo = Infinity

      for (let i = 0; i < bars.length; i++) {
        const s = Number.isFinite(src[i]) ? src[i] : 0
        prefixHi = Math.max(prefixHi, s)
        prefixLo = Math.min(prefixLo, s)

        let hi
        let lo
        if (i >= period - 1 && Number.isFinite(hiFull[i]) && Number.isFinite(loFull[i])) {
          hi = hiFull[i]
          lo = loFull[i]
        } else if (period <= 1) {
          // A one-bar window has no lookback at all.
          hi = s
          lo = s
        } else {
          // The window still reaches before bar zero, so nz() contributes a 0.
          hi = Math.max(prefixHi, 0)
          lo = Math.min(prefixLo, 0)
        }

        const range = hi - lo
        const x = range === 0 ? 0.5 : (s - lo) / range

        const tScale = 6.0
        const t = (x - 0.5) * tScale
        const t2 = t * t
        const denom = df + t2
        if (!(denom > 0)) continue
        const bx = df / denom
        const ibeta = betaReg(bx, df / 2.0, 0.5)
        if (!Number.isFinite(ibeta)) continue
        out[i] = t >= 0.0 ? 1.0 - 0.5 * ibeta : 0.5 * ibeta
      }

      return { value: nulls(out) }
    },
  })
}
