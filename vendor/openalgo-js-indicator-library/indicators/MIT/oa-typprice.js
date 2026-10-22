/**
 * TYPPRICE: Typical Price - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/core/typprice.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The plain average of a bar's high, low and close: one price standing for
 * where the bar actually traded, and the usual source for band and volume
 * studies that want more than the close.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-typprice',
    name: 'TYPPRICE: Typical Price',
    category: 'Price Core',
    placement: 'onchart',

    inputs: [],

    plots: [
      { key: 'typprice', type: 'line', title: 'TypPrice', style: { color: '#4caf50', lineWidth: 2 } },
    ],

    calc(bars) {
      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i]
        if (!Number.isFinite(bar.high) || !Number.isFinite(bar.low) || !Number.isFinite(bar.close)) continue
        out[i] = (bar.high + bar.low + bar.close) / 3
      }
      return { typprice: nulls(out) }
    },
  })
}
