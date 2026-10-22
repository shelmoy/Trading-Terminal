/**
 * Williams Accumulation/Distribution (WAD) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/wad.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A running total of each bar's move measured from its true range low on an up
 * close and from its true range high on a down close, weighted by volume.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-wad',
    name: 'Williams Accumulation/Distribution (WAD)',
    category: 'Volume',
    placement: 'pane',

    inputs: [],

    plots: [{ key: 'wad', type: 'line', title: 'WAD', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars) {
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // var float in Pine: the running total starts at zero and carries across
      // every bar, so the series is defined from the first bar onwards.
      let cumulative = 0

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const close = Number(bar.close)
        const high = Number(bar.high)
        const low = Number(bar.low)

        // nz(close[1], close): the first bar compares against itself, so its
        // price move contributes nothing.
        const prevClose = i > 0 && Number.isFinite(Number(bars[i - 1].close)) ? Number(bars[i - 1].close) : close

        let pm = 0
        if (Number.isFinite(close) && Number.isFinite(prevClose) && Number.isFinite(high) && Number.isFinite(low)) {
          const trueRangeHigh = Math.max(high, prevClose)
          const trueRangeLow = Math.min(low, prevClose)
          if (close > prevClose) pm = close - trueRangeLow
          else if (close < prevClose) pm = close - trueRangeHigh
          else pm = 0
        }

        // nz(volume, 0): an index or a computed series carries no volume, and
        // the source treats that as zero rather than breaking the running total.
        const volume = Number.isFinite(bar.volume) ? bar.volume : 0

        cumulative += pm * volume
        out[i] = cumulative
      }

      return { wad: nulls(out) }
    },
  })
}
