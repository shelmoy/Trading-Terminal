/**
 * WCLPRICE: Weighted Close Price - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/core/wclprice.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A single-bar average price that counts the close twice, so the bar's closing
 * print carries half the weight and the high and the low a quarter each.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-wclprice',
    name: 'WCLPRICE: Weighted Close Price',
    category: 'Price Core',
    placement: 'onchart',

    inputs: [],

    plots: [{ key: 'wclprice', type: 'line', title: 'WclPrice', style: { color: '#ff5252', lineWidth: 2 } }],

    calc(bars) {
      // (h + l + 2 * c) * 0.25, one value per bar, no warmup in the source.
      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const h = bars[i].high
        const l = bars[i].low
        const c = bars[i].close
        if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue
        out[i] = (h + l + 2 * c) * 0.25
      }
      return { wclprice: nulls(out) }
    },
  })
}
