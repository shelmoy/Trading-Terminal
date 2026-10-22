/**
 * F-Distribution CDF (FDIST) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/fdist.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Normalises the source to its own min-max range over the lookback window, then
 * reads that position through the cumulative distribution of an F variate. The
 * result is a bounded 0 to 1 reading whose shape is set by the two degrees of
 * freedom rather than by a fixed scaling.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Log-gamma via the Lanczos approximation, g = 7 with nine coefficients.
  const LANCZOS = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]

  const lnGamma = (z) => {
    const g = 7
    const zz = z - 1
    let x = LANCZOS[0]
    for (let i = 1; i <= 8; i++) x += LANCZOS[i] / (zz + i)
    const t = zz + g + 0.5
    return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x)
  }

  // Regularized incomplete beta I_x(a, b), evaluated with Lentz's method for the
  // continued fraction. The source computes a `front` term from the unflipped
  // arguments and then discards it in favour of `front2`; only the used term is
  // kept here.
  const betaReg = (x, a, b) => {
    if (!Number.isFinite(x) || !Number.isFinite(a) || !Number.isFinite(b)) return NaN
    if (x <= 0) return 0
    if (x >= 1) return 1

    const flip = x > (a + 1) / (a + b + 2)
    const xx = flip ? 1 - x : x
    const aa = flip ? b : a
    const bb = flip ? a : b

    const lnPfx2 = aa * Math.log(xx) + bb * Math.log(1 - xx) - Math.log(aa) - lnGamma(aa) - lnGamma(bb) + lnGamma(aa + bb)
    const front2 = Math.exp(lnPfx2)

    const TINY = 1e-30
    const EPS = 1e-10
    const MAXITER = 200

    let f = TINY
    let C = TINY
    let D = 0

    for (let m = 0; m < MAXITER; m++) {
      // Pine's `m / 2` on two ints is integer division.
      const mm = Math.floor(m / 2)
      let dVal
      if (m === 0) {
        dVal = 1
      } else if (m % 2 === 0) {
        const mf = mm
        dVal = (mf * (bb - mf) * xx) / ((aa + 2 * mf - 1) * (aa + 2 * mf))
      } else {
        const mf = mm + 1
        dVal = (-(aa + mf - 1) * (aa + bb + mf - 1) * xx) / ((aa + 2 * mf - 2) * (aa + 2 * mf - 1))
      }

      D = 1 + dVal * D
      if (Math.abs(D) < TINY) D = TINY
      D = 1 / D
      C = 1 + dVal / C
      if (Math.abs(C) < TINY) C = TINY
      const delta = C * D
      f *= delta
      if (Math.abs(delta - 1) < EPS) break
    }

    const result = front2 * f
    return flip ? 1 - result : result
  }

  registerIndicator({
    id: 'oa-fdist',
    name: 'F-Distribution CDF (FDIST)',
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
        key: 'd1',
        type: 'number',
        label: 'd1 (numerator df)',
        default: 5,
        min: 0.1,
        max: 1000,
        step: 1,
        tooltip: 'Numerator degrees of freedom.',
      },
      {
        key: 'd2',
        type: 'number',
        label: 'd2 (denominator df)',
        default: 5,
        min: 0.1,
        max: 1000,
        step: 1,
        tooltip: 'Denominator degrees of freedom.',
      },
    ],

    plots: [{ key: 'fdist', type: 'line', title: 'FDIST', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [
      { price: 0.95, title: 'Upper', color: '#ff5252', dashed: true },
      { price: 0.5, title: 'Midline', color: '#787b86', dashed: true },
      { price: 0.05, title: 'Lower', color: '#4caf50', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 50))
      const d1 = Math.max(0.1, Number(settings.d1) || 5)
      const d2 = Math.max(0.1, Number(settings.d2) || 5)
      const src = sourceValues(bars, settings.source ?? 'close')

      const a = d1 / 2
      const b = d2 / 2

      // Pine seeds min and max from the current bar and then walks back up to
      // period - 1 bars, skipping na, so the window simply grows on early bars.
      // Monotonic deques keep that O(n) instead of O(n * period).
      const minDq = []
      const maxDq = []
      let minHead = 0
      let maxHead = 0

      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const oldest = i - period + 1
        while (minHead < minDq.length && minDq[minHead] < oldest) minHead++
        while (maxHead < maxDq.length && maxDq[maxHead] < oldest) maxHead++

        const v = src[i]
        if (Number.isFinite(v)) {
          while (minDq.length > minHead && src[minDq[minDq.length - 1]] >= v) minDq.pop()
          minDq.push(i)
          while (maxDq.length > maxHead && src[maxDq[maxDq.length - 1]] <= v) maxDq.pop()
          maxDq.push(i)
        }

        if (!Number.isFinite(v)) continue

        const minVal = src[minDq[minHead]]
        const maxVal = src[maxDq[maxHead]]
        const range = maxVal - minVal

        // A flat window has no range, so the source sits exactly mid-scale.
        const x = range > 0 ? (v - minVal) / range : 0.5
        const safeX = Math.max(0, x)

        const denom = d1 * safeX + d2
        if (!(denom > 0)) continue
        const t = (d1 * safeX) / denom

        out[i] = betaReg(t, a, b)
      }

      return { fdist: nulls(out) }
    },
  })
}
