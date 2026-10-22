/**
 * RWMA: Range Weighted Moving Average - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/rwma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A moving average whose weights are the bars' own ranges, so a wide,
 * high-participation bar pulls the average toward its close while a narrow
 * inside bar barely moves it.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-rwma',
    name: 'RWMA: Range Weighted Moving Average',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [{ key: 'period', type: 'number', label: 'Period', default: 14, min: 1, max: 2000, step: 1 }],

    plots: [{ key: 'rwma', type: 'line', title: 'RWMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 14))
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Rolling window sums, which is the same arithmetic as the source's inner
      // loop over src[0 .. period-1] without re-walking the window every bar.
      // A missing bar cannot be folded into a running sum, because one NaN
      // added in never comes back out again and would blank the rest of the
      // series; it is counted separately instead, which is also what the source
      // does with it: an na anywhere in the window poisons sumW, and the
      // ternary at the end of the source falls through to the raw source.
      let sumWV = 0
      let sumW = 0
      let badWeight = 0
      let badValue = 0

      for (let i = 0; i < n; i++) {
        const b = bars[i]
        // high - low is na if either leg is, and math.max(na, 0.0) is na, so a
        // bar with no range at all poisons the weight sum rather than weighing
        // nothing.
        const hasRange = Number.isFinite(b.high) && Number.isFinite(b.low)
        const hasClose = Number.isFinite(b.close)
        if (hasRange) {
          // math.max(rng, 0.0): a bar cannot contribute negative weight, and a
          // zero-range bar contributes nothing at all.
          const w = Math.max(b.high - b.low, 0)
          sumW += w
          if (hasClose) sumWV += b.close * w
        } else {
          badWeight++
        }
        if (!hasClose) badValue++

        const drop = i - period
        if (drop >= 0) {
          const d = bars[drop]
          const dRange = Number.isFinite(d.high) && Number.isFinite(d.low)
          const dClose = Number.isFinite(d.close)
          if (dRange) {
            const dw = Math.max(d.high - d.low, 0)
            sumW -= dw
            if (dClose) sumWV -= d.close * dw
          } else {
            badWeight--
          }
          if (!dClose) badValue--
        }

        const close = hasClose ? b.close : NaN
        // Pine reaches back to src[period-1], which is na before enough history
        // exists. That na poisons sumW exactly as a mid-chart hole does, so
        // both cases plot the raw source rather than a gap, because that is what
        // the source plots on those bars.
        if (badWeight > 0 || i < period - 1) {
          out[i] = close
          continue
        }
        // A window whose ranges are all present but whose close is not leaves
        // sumW finite and sumWV na, so the source divides and plots na.
        if (badValue > 0) continue
        // Guard the divide: a run of doji bars makes every weight zero.
        out[i] = sumW > 0 ? sumWV / sumW : close
      }

      return { rwma: nulls(out) }
    },
  })
}
