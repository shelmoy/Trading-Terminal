/**
 * Volume Accumulation (VA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/va.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Running sum of volume signed by where the close sits against the bar midpoint:
 * it rises while closes print in the upper half of their ranges on rising volume
 * and falls when they print in the lower half.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-va',
    name: 'Volume Accumulation (VA)',
    category: 'Volume',
    placement: 'pane',

    inputs: [],

    plots: [{ key: 'va', type: 'line', title: 'VA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars) {
      const n = bars.length
      const out = new Array(n).fill(NaN)
      let cumulative = 0

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const close = Number.isFinite(bar.close) ? bar.close : NaN
        // nz(h, close) / nz(l, close): a missing high or low falls back to the close.
        const high = Number.isFinite(bar.high) ? bar.high : close
        const low = Number.isFinite(bar.low) ? bar.low : close
        // nz(vol, 0): index series carry no volume, which leaves the line flat at 0
        // rather than blanking it.
        const volume = Number.isFinite(bar.volume) ? bar.volume : 0

        const midpoint = (high + low) / 2
        const period = volume * (close - midpoint)
        // Pine lets a na bar poison the running total for good; skipping it keeps
        // the rest of the series readable.
        if (Number.isFinite(period)) cumulative += period
        out[i] = cumulative
      }

      return { va: nulls(out) }
    },
  })
}
