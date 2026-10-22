/**
 * Pascal Weighted Moving Average (PWMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/pwma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A FIR average weighted by a row of Pascal's triangle, so the binomial bell
 * sits over the window and the centre bars dominate. The window shrinks to the
 * bars available, so the line starts on the very first bar rather than after a
 * warmup gap.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  /**
   * Row p - 1 of Pascal's triangle, built with the same recurrence Pine uses:
   * w[0] = 1 and w[i] = w[i - 1] * (p - i) / i.
   */
  function pascalWeights(p) {
    const w = new Array(p).fill(0)
    w[0] = 1
    let prev = 1
    for (let i = 1; i < p; i++) {
      const curr = (prev * (p - i)) / i
      w[i] = curr
      prev = curr
    }
    return w
  }

  registerIndicator({
    id: 'oa-pwma',
    name: 'Pascal Weighted Moving Average (PWMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      // Pine has no upper bound, but the binomial coefficients overflow a double
      // past roughly 1030, so the window is capped short of that.
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 1000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'pwma', type: 'line', title: 'PWMA', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)
      if (n === 0) return { pwma: nulls(out) }

      // Every bar from index period - 1 onward shares the same full-width row.
      const fullWeights = pascalWeights(period)

      for (let i = 0; i < n; i++) {
        // Pine: int p = math.min(bar_index + 1, period)
        const p = Math.min(i + 1, period)
        const weights = p === period ? fullWeights : pascalWeights(p)

        let sum = 0
        let weightSum = 0
        for (let k = 0; k < p; k++) {
          const price = src[i - k]
          // Pine skips an na price and leaves its weight out of the divisor too.
          if (!Number.isFinite(price)) continue
          sum += price * weights[k]
          weightSum += weights[k]
        }

        const value = weightSum > 0 ? sum / weightSum : NaN
        // Pine: nz(sum / weight_sum, source) falls back to the raw source.
        if (Number.isFinite(value)) out[i] = value
        else if (Number.isFinite(src[i])) out[i] = src[i]
      }

      return { pwma: nulls(out) }
    },
  })
}
