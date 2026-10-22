/**
 * Binomial Distribution CDF (BINOMDIST) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/binomdist.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The source is min-max normalized over a lookback window to a probability p,
 * then read as the success rate of n Bernoulli trials: the plot is P(X <= k),
 * so it rises towards 1 as price sits high in its own recent range.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Log-gamma via the Lanczos approximation (g = 7, 9 coefficients), exactly as
  // the Pine source spells it.
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

  // ln C(n, i) = ln(n!) - ln(i!) - ln((n - i)!)
  const lnBinom = (n, i) => lnGamma(n + 1) - lnGamma(i + 1) - lnGamma(n - i + 1)

  registerIndicator({
    id: 'oa-binomdist',
    name: 'Binomial Distribution CDF (BINOMDIST)',
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
        key: 'trials',
        type: 'number',
        label: 'Trials (n)',
        default: 20,
        min: 1,
        max: 1000,
        step: 1,
        tooltip: 'Number of Bernoulli trials',
      },
      {
        key: 'threshold',
        type: 'number',
        label: 'Threshold (k)',
        default: 10,
        min: 0,
        max: 1000,
        step: 1,
        tooltip: 'Compute P(X <= k)',
      },
    ],

    plots: [{ key: 'binomdist', type: 'line', title: 'BINOMDIST', style: { color: '#ffeb3b', lineWidth: 2 } }],

    // Ported from the three hline() calls.
    levels: () => [
      { price: 0.5, title: 'Midline', color: '#787b86', dashed: true },
      { price: 0.95, title: 'Upper', color: '#ef5350', dashed: true },
      { price: 0.05, title: 'Lower', color: '#26a69a', dashed: true },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 50))
      const trials = Math.max(1, Math.floor(Number(settings.trials) || 20))
      // 0 is a legal threshold, so a cleared field cannot be caught by || here.
      const thresholdRaw = Number(settings.threshold)
      const threshold =
        settings.threshold === '' || settings.threshold == null || !Number.isFinite(thresholdRaw)
          ? 10
          : Math.max(0, Math.floor(thresholdRaw))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      // n and k are simple in Pine, so every bar sums the same ln C(n, i)
      // terms: build them once instead of once per bar.
      const kk = Math.min(threshold, trials)
      const lnC = new Array(kk + 1)
      for (let i = 0; i <= kk; i++) lnC[i] = lnBinom(trials, i)

      // Pine rebuilds min and max by scanning source[0 .. period-1] and skips
      // na, so the window is simply the bars that exist. Monotonic deques give
      // the same answer without the per-bar rescan.
      const minQ = []
      const maxQ = []
      const out = new Array(n).fill(NaN)

      for (let i = 0; i < n; i++) {
        const v = src[i]
        if (Number.isFinite(v)) {
          while (minQ.length && src[minQ[minQ.length - 1]] >= v) minQ.pop()
          minQ.push(i)
          while (maxQ.length && src[maxQ[maxQ.length - 1]] <= v) maxQ.pop()
          maxQ.push(i)
        }
        const from = i - period + 1
        while (minQ.length && minQ[0] < from) minQ.shift()
        while (maxQ.length && maxQ[0] < from) maxQ.shift()

        if (!Number.isFinite(v) || !minQ.length || !maxQ.length) continue
        const minVal = src[minQ[0]]
        const maxVal = src[maxQ[0]]
        const span = maxVal - minVal
        const p = span > 0.0 ? (v - minVal) / span : 0.5

        // binomCdf: the two degenerate branches short-circuit the sum.
        if (p <= 0.0) {
          out[i] = threshold >= 0 ? 1.0 : 0.0
          continue
        }
        if (p >= 1.0) {
          out[i] = threshold >= trials ? 1.0 : 0.0
          continue
        }

        const lnP = Math.log(p)
        const lnQ = Math.log(1.0 - p)
        let cdf = 0.0
        for (let j = 0; j <= kk; j++) cdf += Math.exp(lnC[j] + j * lnP + (trials - j) * lnQ)
        out[i] = Math.min(cdf, 1.0)
      }

      return { binomdist: nulls(out) }
    },
  })
}
