/**
 * AVGPRICE: Average Price - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/core/avgprice.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The simple mean of a bar's open, high, low and close, drawn on the price
 * pane as a single smoothed representation of where the bar traded.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-avgprice',
    name: 'AVGPRICE: Average Price',
    category: 'Price Core',
    placement: 'onchart',

    inputs: [],

    plots: [{ key: 'avgprice', type: 'line', title: 'AvgPrice', style: { color: '#2196f3', lineWidth: 2 } }],

    calc(bars) {
      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const b = bars[i]
        const o = Number(b.open)
        const h = Number(b.high)
        const l = Number(b.low)
        const c = Number(b.close)
        if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue
        out[i] = (o + h + l + c) * 0.25
      }
      return { avgprice: nulls(out) }
    },
  })
}
