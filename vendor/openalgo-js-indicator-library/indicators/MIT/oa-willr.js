/**
 * Williams %R (WILLR) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/willr.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Where the close sits inside the highest high and lowest low of the lookback
 * window, on a 0 to -100 scale: 0 is a close at the top of the range.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-willr',
    name: 'Williams %R (WILLR)',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      {
        key: 'period',
        type: 'number',
        label: 'Period',
        default: 14,
        min: 1,
        max: 100,
        step: 1,
        tooltip: 'Lookback period for highest high and lowest low calculation',
      },
    ],

    plots: [{ key: 'willr', type: 'line', title: 'Williams %R', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.min(100, Math.floor(Number(settings.period) || 14)))
      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        // Pine reads array.max over a buffer still seeded with na, which skips
        // the unfilled slots, so the window expands from the first bar.
        const from = Math.max(0, i - period + 1)
        let highestHigh = NaN
        let lowestLow = NaN
        for (let k = from; k <= i; k++) {
          const h = bars[k].high
          const l = bars[k].low
          if (Number.isFinite(h) && (!Number.isFinite(highestHigh) || h > highestHigh)) highestHigh = h
          if (Number.isFinite(l) && (!Number.isFinite(lowestLow) || l < lowestLow)) lowestLow = l
        }

        const range = highestHigh - lowestLow
        // A na or zero range takes the mid reading, exactly as the source does.
        if (!(range > 0)) {
          out[i] = -50
          continue
        }
        const close = bars[i].close
        if (!Number.isFinite(close)) continue
        out[i] = (-100 * (highestHigh - close)) / range
      }

      return { willr: nulls(out) }
    },
  })
}
