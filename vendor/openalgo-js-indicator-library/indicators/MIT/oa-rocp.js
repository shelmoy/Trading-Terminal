/**
 * Rate of Change Percentage (ROCP) - ported to openalgo-charts from Pine
 * Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/momentum/rocp.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The percentage change between the current price and the price N bars ago,
 * with the lookback growing bar by bar until it reaches N so the line starts on
 * the first bar instead of after a gap.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-rocp',
    name: 'Rate of Change Percentage (ROCP)',
    category: 'Momentum',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'length', type: 'number', label: 'Length', default: 9, min: 1, max: 5000, step: 1 },
    ],

    plots: [{ key: 'rocp', type: 'line', title: 'ROCP', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. The source
      // refuses a length of 0 or less.
      const length = Math.max(1, Math.floor(Number(settings.length) || 9))
      const n = bars.length
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(n).fill(NaN)

      // The source's var count: the reference bar starts at the current bar and
      // walks back one bar at a time, but only on a bar whose reference value
      // is usable, and it stops at `length`.
      let count = 0

      for (let i = 0; i < n; i++) {
        const j = i - count
        const ref = j >= 0 ? src[j] : NaN
        if (Number.isFinite(ref) && ref !== 0) {
          out[i] = Number.isFinite(src[i]) ? (100 * (src[i] - ref)) / ref : NaN
          count = Math.min(count + 1, length)
        }
      }

      return { rocp: nulls(out) }
    },
  })
}
