/**
 * Triangular Moving Average (TRIMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/trima.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A finite-impulse average whose weights rise to a peak in the middle of the
 * window and fall away again, so it is smoother than a simple average of the
 * same length at the cost of a little more lag.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-trima',
    name: 'Triangular Moving Average (TRIMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'trima', type: 'line', title: 'TRIMA', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        // Pine uses p = math.min(bar_index + 1, period), so the window expands
        // over the first bars and the line is drawn from bar zero onwards.
        const p = Math.min(i + 1, period)
        const mid = p - 1
        let sum = 0
        let weightSum = 0

        for (let j = 0; j < p; j++) {
          const price = src[i - j]
          // Pine skips a na price, which drops its weight from the divisor too.
          if (!Number.isFinite(price)) continue
          const w = Math.min(j, mid - j) + 1
          sum += price * w
          weightSum += w
        }

        // Pine: nz(sum / weight_sum, source) falls back to the raw source when
        // every bar in the window was na.
        if (weightSum > 0) out[i] = sum / weightSum
        else if (Number.isFinite(src[i])) out[i] = src[i]
      }

      return { trima: nulls(out) }
    },
  })
}
