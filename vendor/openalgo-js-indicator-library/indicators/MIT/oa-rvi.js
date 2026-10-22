/**
 * Relative Volatility Index (RVI) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/rvi.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * RSI applied to volatility instead of price: the rolling standard deviation is
 * split into the part that arrived on up closes and the part that arrived on
 * down closes, each Wilder-smoothed, and the up share of the total is reported
 * on a 0-100 scale.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-rvi',
    name: 'Relative Volatility Index (RVI)',
    category: 'Volatility',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'stdevLength',
        type: 'number',
        label: 'StdDev Length',
        default: 10,
        min: 2,
        max: 5000,
        step: 1,
        tooltip: 'Lookback period for calculating the Standard Deviation of source prices.',
      },
      {
        key: 'rmaLength',
        type: 'number',
        label: "RMA Length (Wilder's Smoothing)",
        default: 14,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Lookback period for smoothing Upward and Downward Standard Deviations.',
      },
    ],

    plots: [{ key: 'rvi', type: 'line', title: 'RVI', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const stdevLength = Math.max(2, Math.floor(Number(settings.stdevLength) || 10))
      const rmaLength = Math.max(1, Math.floor(Number(settings.rmaLength) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Pine keeps a circular buffer seeded with na, so the window expands from
      // one sample up to stdevLength and the deviation is the population one
      // (divided by count, not count - 1).
      const buffer = new Array(stdevLength).fill(NaN)
      let head = 0
      let count = 0
      let sum = 0
      let sumSq = 0

      // Bias-corrected Wilder smoothing: raw is the plain recursion seeded at 0,
      // e is the remaining weight of that seed, and dividing it out removes the
      // seed's influence exactly as the source does.
      const EPSILON = 1e-10
      const alpha = 1 / rmaLength
      let rawUp = 0
      let eUp = 1
      let rawDown = 0
      let eDown = 1

      for (let i = 0; i < n; i++) {
        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          sumSq -= oldest * oldest
          count -= 1
        }
        // Pine wraps the sample in nz(), so a missing source reads as 0 here.
        const value = Number.isFinite(src[i]) ? src[i] : 0
        sum += value
        sumSq += value * value
        count += 1
        buffer[head] = value
        head = (head + 1) % stdevLength

        let stdDev = 0
        if (count > 1) {
          stdDev = Math.sqrt(Math.max(0, sumSq / count - Math.pow(sum / count, 2)))
        }

        // priceChange is na on the first bar, and in Pine every comparison with
        // na is false, so both halves stay at zero there.
        const prev = i > 0 ? src[i - 1] : NaN
        const cur = src[i]
        let upStd = 0
        let downStd = 0
        if (Number.isFinite(prev) && Number.isFinite(cur)) {
          const priceChange = cur - prev
          if (priceChange > 0) upStd = stdDev
          else if (priceChange < 0) downStd = stdDev
        }

        rawUp = (rawUp * (rmaLength - 1) + upStd) / rmaLength
        eUp = (1 - alpha) * eUp
        const avgUp = eUp > EPSILON ? rawUp / (1 - eUp) : rawUp

        rawDown = (rawDown * (rmaLength - 1) + downStd) / rmaLength
        eDown = (1 - alpha) * eDown
        const avgDown = eDown > EPSILON ? rawDown / (1 - eDown) : rawDown

        // Pine seeds the result at 50 and only divides when the total is non-zero.
        let rviValue = 50
        const total = avgUp + avgDown
        if (total !== 0 && Number.isFinite(total)) {
          rviValue = (100 * avgUp) / total
        }
        out[i] = rviValue
      }

      return { rvi: nulls(out) }
    },
  })
}
