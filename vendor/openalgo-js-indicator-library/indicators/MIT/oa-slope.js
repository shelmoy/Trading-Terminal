/**
 * Slope, Linear Regression (SLOPE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/slope.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The slope of the least-squares line fitted through the last N samples, in
 * price units per bar: positive while the fitted trend rises, negative while
 * it falls, and near zero in a range.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-slope',
    name: 'Slope, Linear Regression (SLOPE)',
    category: 'Numerics',
    placement: 'pane',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 2, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'slope', type: 'line', title: 'Slope', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine raises
      // below 2, so floor at 2.
      const len = Math.max(2, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Rolling regression sums. The Pine source accumulates against an
      // ever-growing absolute bar counter; the slope is unchanged by shifting
      // the x axis, so positions are kept relative to the oldest bar in the
      // window (j = 0 .. count - 1). That is the same arithmetic without the
      // cancellation that an unbounded counter causes on a long chart.
      const buf = new Array(len).fill(NaN)
      let start = 0
      let count = 0
      let valid = 0
      let sumY = 0
      let sumJY = 0
      let sumJ = 0
      let sumJ2 = 0
      let sinceRefresh = 0

      for (let i = 0; i < n; i++) {
        const y = src[i]
        const yOk = Number.isFinite(y)

        if (count < len) {
          const j = count
          if (yOk) {
            sumY += y
            sumJY += j * y
            sumJ += j
            sumJ2 += j * j
            valid += 1
          }
          buf[(start + count) % len] = y
          count += 1
        } else {
          // Drop the oldest sample, which sits at j = 0 and so only carries sumY.
          const oldest = buf[start]
          if (Number.isFinite(oldest)) {
            sumY -= oldest
            valid -= 1
          }
          // Every surviving sample moves one position closer to the front.
          sumJ2 = sumJ2 - 2 * sumJ + valid
          sumJ = sumJ - valid
          sumJY = sumJY - sumY
          // Append the new sample at the far end of the window.
          buf[start] = y
          start = (start + 1) % len
          const j = len - 1
          if (yOk) {
            sumY += y
            sumJY += j * y
            sumJ += j
            sumJ2 += j * j
            valid += 1
          }
        }

        // Adding and subtracting the same running totals for thousands of bars
        // lets rounding accumulate, so rebuild them from the window itself once
        // every len bars. That is O(1) per bar amortised and caps the drift at
        // one window's worth of arithmetic.
        sinceRefresh += 1
        if (sinceRefresh >= len) {
          sinceRefresh = 0
          sumY = 0
          sumJY = 0
          sumJ = 0
          sumJ2 = 0
          valid = 0
          for (let j = 0; j < count; j++) {
            const v = buf[(start + j) % len]
            if (!Number.isFinite(v)) continue
            sumY += v
            sumJY += j * v
            sumJ += j
            sumJ2 += j * j
            valid += 1
          }
        }

        // Pine leaves the slope na below two valid points or on a zero divisor.
        if (valid < 2) continue
        const divisor = valid * sumJ2 - sumJ * sumJ
        if (divisor === 0) continue
        const value = (valid * sumJY - sumJ * sumY) / divisor
        if (Number.isFinite(value)) out[i] = value
      }

      return { slope: nulls(out) }
    },
  })
}
