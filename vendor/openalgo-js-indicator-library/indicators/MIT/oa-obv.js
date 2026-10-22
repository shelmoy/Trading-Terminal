/**
 * On Balance Volume (OBV) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volume/obv.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A running total that adds the bar's volume on an up close and subtracts it
 * on a down close, so the line tracks whether volume is arriving with buyers
 * or with sellers.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-obv',
    name: 'On Balance Volume (OBV)',
    category: 'Volume',
    placement: 'pane',

    inputs: [],

    plots: [{ key: 'obv', type: 'line', title: 'OBV', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars) {
      const out = new Array(bars.length).fill(NaN)
      // var float obv_cumulative = 0.0, so the running total starts at zero on
      // the first bar and the first bar can never contribute: prev_close falls
      // back to this bar's own close.
      let cumulative = 0.0

      for (let i = 0; i < bars.length; i++) {
        const closePrice = Number.isFinite(bars[i].close) ? bars[i].close : NaN
        if (!Number.isFinite(closePrice)) {
          out[i] = cumulative
          continue
        }
        // Index series carry no volume, and nz(vol, 0.0) reads a missing one
        // as zero rather than dividing the plot into gaps.
        const volumeVal = Number.isFinite(bars[i].volume) ? bars[i].volume : 0.0
        const prev = i > 0 && Number.isFinite(bars[i - 1].close) ? bars[i - 1].close : closePrice
        if (closePrice > prev) cumulative += volumeVal
        else if (closePrice < prev) cumulative -= volumeVal
        out[i] = cumulative
      }

      return { obv: nulls(out) }
    },
  })
}
