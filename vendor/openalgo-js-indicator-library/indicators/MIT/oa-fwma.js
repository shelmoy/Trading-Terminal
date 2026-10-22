/**
 * Fibonacci Weighted Moving Average (FWMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/fwma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A finite impulse response average weighted by the Fibonacci sequence, with
 * the largest term on the most recent bar. The weights grow far faster than the
 * linear ramp of a WMA, so the curve tracks price more closely than a weighted
 * average of the same length.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  // Fibonacci weights for p taps: index 0 is the most recent bar and carries
  // F(p); the oldest bar carries F(1). Sequence is 1, 1, 2, 3, 5, 8, ...
  const fibWeights = (p) => {
    const weights = new Array(p).fill(0)
    let prev2 = 0.0
    let prev1 = 1.0
    for (let i = 0; i < p; i++) {
      const fib = i === 0 ? 1.0 : i === 1 ? 1.0 : prev1 + prev2
      weights[p - 1 - i] = fib
      prev2 = prev1
      prev1 = fib
    }
    return weights
  }

  registerIndicator({
    id: 'oa-fwma',
    name: 'Fibonacci Weighted Moving Average (FWMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 10,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Number of Fibonacci weights in the window.',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'fwma', type: 'line', title: 'FWMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Pine uses p = min(bar_index + 1, period), so the window grows from the
      // first bar and the weights are rebuilt each time p changes.
      let weights = null
      let lastP = -1
      for (let i = 0; i < n; i++) {
        const p = Math.min(i + 1, period)
        if (p !== lastP) {
          weights = fibWeights(p)
          lastP = p
        }
        let sum = 0
        let weightSum = 0
        for (let j = 0; j < p; j++) {
          const price = src[i - j]
          if (!Number.isFinite(price)) continue
          const w = weights[j]
          sum += price * w
          weightSum += w
        }
        // nz(sum / weight_sum, source): a degenerate window falls back to source.
        const value = sum / weightSum
        if (Number.isFinite(value)) out[i] = value
        else if (Number.isFinite(src[i])) out[i] = src[i]
      }

      return { fwma: nulls(out) }
    },
  })
}
