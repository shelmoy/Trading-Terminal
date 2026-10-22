/**
 * Cumulative Moving Average - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/cma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The running mean of every value seen so far, with no lookback at all. It is
 * quick to move early on and then flattens as the sample grows, so it reads as
 * the average price of the chart to date rather than a trend follower.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-cma',
    name: 'Cumulative Moving Average',
    category: 'Statistics',
    placement: 'onchart',

    inputs: [{ key: 'source', type: 'source', label: 'Source', default: 'close' }],

    plots: [{ key: 'cma', type: 'line', title: 'CMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      const src = sourceValues(bars, settings.source ?? 'close')

      let mean = 0
      let count = 0

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        // Pine's nz(source, mean) substitutes the running mean for a na source,
        // which leaves the mean unchanged rather than dragging it to zero.
        const val = Number.isFinite(src[i]) ? src[i] : mean
        count += 1
        // Welford: M_n = M_(n-1) + (x_n - M_(n-1)) / n. count is at least 1.
        mean += (val - mean) / count
        if (Number.isFinite(mean)) out[i] = mean
      }

      return { cma: nulls(out) }
    },
  })
}
