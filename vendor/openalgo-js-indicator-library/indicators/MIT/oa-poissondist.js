/**
 * Poisson Distribution CDF (POISSONDIST) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/poissondist.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Min-max normalises price over a lookback window, reads the normalised value
 * as a Poisson event rate lambda, and plots P(X <= k) for that rate. Low
 * readings mean price sits high in its range (a high event rate), high readings
 * mean it sits low.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Log-gamma via the Lanczos approximation, g = 7 with 9 coefficients.
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
    for (let i = 1; i <= 8; i++) x += LANCZOS[i] / (zz + i)
    const t = zz + g + 0.5
    return 0.5 * Math.log(2.0 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x)
  }

  const EPS = 1e-10
  const TINY = 1e-30
  const MAXITER = 200

  // Regularized lower incomplete gamma P(a,x) by series expansion.
  const gammaSeries = (a, x) => {
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

  const gammaP = (a, x) => {
    if (x <= 0.0) return 0.0
    if (x < a + 1.0) return gammaSeries(a, x)
    return 1.0 - gammaCF(a, x)
  }

  registerIndicator({
    id: 'oa-poissondist',
    name: 'Poisson Distribution CDF (POISSONDIST)',
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
        key: 'k',
        type: 'number',
        label: 'Threshold (k)',
        default: 5,
        min: 0,
        max: 1000,
        step: 1,
        tooltip: 'P(X <= k); number of events threshold.',
      },
      {
        key: 'lambdaScale',
        type: 'number',
        label: 'Lambda Scale',
        default: 10,
        min: 0.01,
        max: 1000,
        step: 0.5,
        tooltip: 'Scales normalized price to lambda; higher = wider event-rate range.',
      },
    ],

    plots: [{ key: 'poissondist', type: 'line', title: 'POISSONDIST', style: { color: '#ffeb3b', lineWidth: 2 } }],

    levels: () => [
      { price: 0.5, title: 'Midline', color: '#787b86', lineStyle: 'dotted' },
      { price: 0.95, title: 'Upper', color: '#ef5350', lineStyle: 'dashed' },
      { price: 0.05, title: 'Lower', color: '#26a69a', lineStyle: 'dashed' },
    ],

    calc(bars, settings) {
      // A cleared field arrives as '', and Number('') is 0. k is legitimately 0,
      // so it falls back to its default only when the field is empty or unparsable.
      const period = Math.max(2, Math.floor(Number(settings.period) || 50))
      const lambdaScale = Math.max(0.01, Number(settings.lambdaScale) || 10)
      const rawK = settings.k
      const parsedK = Number(rawK)
      const k =
        rawK === '' || rawK === null || rawK === undefined || !Number.isFinite(parsedK)
          ? 5
          : Math.max(0, Math.floor(parsedK))

      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Sliding window min and max over the last `period` bars, finite values only.
      // Monotonic deques keep this O(n) where the Pine loop is O(n * period).
      const minQ = []
      const maxQ = []
      let minHead = 0
      let maxHead = 0

      for (let i = 0; i < n; i++) {
        const value = src[i]
        if (Number.isFinite(value)) {
          while (minQ.length > minHead && src[minQ[minQ.length - 1]] >= value) minQ.pop()
          minQ.push(i)
          while (maxQ.length > maxHead && src[maxQ[maxQ.length - 1]] <= value) maxQ.pop()
          maxQ.push(i)
        }
        const oldest = i - period + 1
        while (minQ.length > minHead && minQ[minHead] < oldest) minHead++
        while (maxQ.length > maxHead && maxQ[maxHead] < oldest) maxHead++

        // Pine seeds minVal and maxVal from the current bar, so a non-finite
        // source leaves both na and every comparison against them false.
        let x = 0.5
        if (Number.isFinite(value) && minQ.length > minHead && maxQ.length > maxHead) {
          const minVal = src[minQ[minHead]]
          const maxVal = src[maxQ[maxHead]]
          const range = maxVal - minVal
          if (range > 0.0) x = (value - minVal) / range
        }

        const lambda = Math.max(0.0, x * lambdaScale)
        // lambda = 0 is degenerate: all Poisson mass sits at X = 0, so P(X <= k) = 1.
        const result = lambda <= 0.0 ? 1.0 : 1.0 - gammaP(k + 1, lambda)
        out[i] = Number.isFinite(result) ? result : NaN
      }

      return { poissondist: nulls(out) }
    },
  })
}
