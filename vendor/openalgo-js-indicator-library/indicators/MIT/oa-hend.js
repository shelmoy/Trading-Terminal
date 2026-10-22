/**
 * Henderson Moving Average (HEND) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/hend.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A symmetric FIR filter from the X-11 seasonal adjustment framework. The
 * closed-form Henderson weights pass a cubic polynomial trend through
 * undistorted, and they turn negative at the edges of the window, which gives
 * the filter a mild bandpass character.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-hend',
    name: 'Henderson Moving Average (HEND)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 7,
        min: 5,
        max: 999,
        step: 2,
        tooltip: 'Must be odd and at least 5. An even value is raised to the next odd one, as in the source script.',
      },
    ],

    plots: [{ key: 'hend', type: 'line', title: 'HEND', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      let period = Math.max(5, Math.floor(Number(settings.period) || 7))
      // Pine: period_adj = per % 2 == 0 ? per + 1 : per
      if (period % 2 === 0) period += 1

      const src = sourceValues(bars, settings.source ?? 'close')
      const out = new Array(bars.length).fill(NaN)
      if (bars.length === 0) return { hend: nulls(out) }

      // Henderson weights, precomputed once:
      //   w(k) = 315 * [(n-1)^2 - k^2][n^2 - k^2][(n+1)^2 - k^2][3n^2 - 16 - 11k^2]
      //          / {8n(n^2-1)(4n^2-1)(4n^2-9)(4n^2-25)}
      // with n = (period + 3) / 2 and k from -(period-1)/2 to (period-1)/2.
      const half = (period - 1) / 2
      const n = (period + 3) / 2
      const n2 = n * n
      const nm1sq = (n - 1) * (n - 1)
      const np1sq = (n + 1) * (n + 1)
      const denom = 8 * n * (n2 - 1) * (4 * n2 - 1) * (4 * n2 - 9) * (4 * n2 - 25)

      const weights = new Array(period).fill(0)
      let wsum = 0
      if (Number.isFinite(denom) && denom !== 0) {
        for (let j = 0; j < period; j++) {
          const k = j - half
          const k2 = k * k
          const w =
            (315 * (nm1sq - k2) * (n2 - k2) * (np1sq - k2) * (3 * n2 - 16 - 11 * k2)) / denom
          weights[j] = w
          wsum += w
        }
      }
      // Normalise so the weights sum to exactly 1, as the source does.
      if (wsum !== 0) {
        for (let j = 0; j < period; j++) weights[j] /= wsum
      }

      for (let i = 0; i < bars.length; i++) {
        // Pine: float price = nz(source)
        const price = Number.isFinite(src[i]) ? src[i] : 0
        // Pine: count = math.min(bar_index + 1, period); count < period -> pass the price through.
        if (i < period - 1) {
          out[i] = price
          continue
        }
        // Weight index 0 is the oldest bar in the window, period-1 the newest.
        let result = 0
        const start = i - (period - 1)
        for (let j = 0; j < period; j++) {
          const v = src[start + j]
          result += (Number.isFinite(v) ? v : 0) * weights[j]
        }
        out[i] = Number.isFinite(result) ? result : NaN
      }

      return { hend: nulls(out) }
    },
  })
}
