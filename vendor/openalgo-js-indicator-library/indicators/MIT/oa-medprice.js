/**
 * MEDPRICE: Median Price - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/core/medprice.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The midpoint of each bar's range, (high + low) / 2, drawn on the price pane
 * as a smoothing-free reference for where the bar actually traded.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-medprice',
    name: 'MEDPRICE: Median Price',
    category: 'Price Core',
    placement: 'onchart',

    inputs: [],

    plots: [
      { key: 'medprice', type: 'line', title: 'MedPrice', style: { color: '#ff9800', lineWidth: 2 } },
    ],

    calc(bars) {
      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const h = Number(bars[i].high)
        const l = Number(bars[i].low)
        if (!Number.isFinite(h) || !Number.isFinite(l)) continue
        out[i] = (h + l) * 0.5
      }
      return { medprice: nulls(out) }
    },
  })
}
