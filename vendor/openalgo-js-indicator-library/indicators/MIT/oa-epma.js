/**
 * Endpoint Moving Average (EPMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/epma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A linearly weighted average whose weights fall from the newest bar to the
 * oldest, so the newest price carries the most of the line. The window expands
 * with the chart, which is why it plots from the very first bar.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-epma',
    name: 'Endpoint Moving Average (EPMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 1000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'epma', type: 'line', title: 'EPMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.min(1000, Math.floor(Number(settings.period) || 10)))
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length
      const out = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        // Pine: math.max(1, math.min(bar_index + 1, period)). The window grows
        // with the chart instead of waiting for `period` bars.
        const p = Math.max(1, Math.min(i + 1, period))
        if (p <= 1) {
          out[i] = Number.isFinite(src[i]) ? src[i] : NaN
          continue
        }
        let weightedSum = 0
        let totalWeight = 0
        for (let k = 0; k < p; k++) {
          const price = src[i - k]
          // A na bar contributes neither value nor weight, so the remaining
          // bars keep their relative weighting.
          if (!Number.isFinite(price)) continue
          const weight = p - k
          weightedSum += price * weight
          totalWeight += weight
        }
        // Pine: nz(weightedSum / totalWeight, na) - an all-na window is a gap.
        out[i] = totalWeight > 0 ? weightedSum / totalWeight : NaN
      }

      return { epma: nulls(out) }
    },
  })
}
