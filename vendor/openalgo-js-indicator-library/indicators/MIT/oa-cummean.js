/**
 * Cumulative Mean (CUMMEAN) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/cummean.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The running arithmetic mean of the source from the very first bar of the
 * data, so every new bar shifts the average by less than the one before it.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-cummean',
    name: 'Cumulative Mean (CUMMEAN)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [{ key: 'source', type: 'source', label: 'Source', default: 'close' }],

    // Pine declares precision=8 on the indicator; that maps to the plot style
    // precision, which sets the pane's own axis formatting.
    plots: [
      { key: 'cummean', type: 'line', title: 'CumMean', style: { color: '#ffeb3b', lineWidth: 2, precision: 8 } },
    ],

    calc(bars, settings) {
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      // Pine carries cumulative_sum and valid_data_count in var state and skips
      // na bars entirely, returning na until at least one valid value exists.
      let cumulativeSum = 0
      let validCount = 0
      for (let i = 0; i < bars.length; i++) {
        const v = src[i]
        if (Number.isFinite(v)) {
          cumulativeSum += v
          validCount += 1
        }
        if (validCount > 0) out[i] = cumulativeSum / validCount
      }

      return { cummean: nulls(out) }
    },
  })
}
