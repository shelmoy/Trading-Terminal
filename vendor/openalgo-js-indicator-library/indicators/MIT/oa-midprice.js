/**
 * MIDPRICE: Midpoint Price over Period - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/core/midprice.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The midpoint of the range covered over the lookback: the highest high and the
 * lowest low of the last N bars, averaged. It marks the centre of the recent
 * trading range rather than the centre of the latest bar.
 */

export default function ({ registerIndicator, highest, lowest, nulls }) {
  registerIndicator({
    id: 'oa-midprice',
    name: 'MIDPRICE: Midpoint Price over Period',
    category: 'Price Core',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 1, max: 5000, step: 1 },
    ],

    plots: [{ key: 'midprice', type: 'line', title: 'MidPrice', style: { color: '#9c27b0', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 14))
      const n = bars.length

      // ta.highest / ta.lowest are na for the first period - 1 bars, which is
      // exactly what the highest / lowest helpers do.
      const hi = highest(bars.map((b) => b.high), period)
      const lo = lowest(bars.map((b) => b.low), period)

      const out = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(hi[i]) || !Number.isFinite(lo[i])) continue
        out[i] = (hi[i] + lo[i]) * 0.5
      }
      return { midprice: nulls(out) }
    },
  })
}
