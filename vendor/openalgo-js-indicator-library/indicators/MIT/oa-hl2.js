/**
 * Midprice (HL2) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/hl2.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The midprice of each bar, the simple average of its high and its low. It is
 * the neutral reference price a bar's body straddles.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-hl2',
    name: 'Midprice (HL2)',
    category: 'Numerics',
    placement: 'onchart',

    inputs: [],

    plots: [{ key: 'hl2', type: 'line', title: 'HL2', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars) {
      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const h = bars[i].high
        const l = bars[i].low
        if (!Number.isFinite(h) || !Number.isFinite(l)) continue
        out[i] = (h + l) * 0.5
      }
      return { hl2: nulls(out) }
    },
  })
}
