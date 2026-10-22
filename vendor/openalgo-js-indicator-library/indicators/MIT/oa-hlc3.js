/**
 * Typical Price (HLC3) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/hlc3.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The typical price of a bar: the average of its high, low and close, the
 * single price most commonly used to stand in for the whole bar.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-hlc3',
    name: 'Typical Price (HLC3)',
    category: 'Numerics',
    placement: 'onchart',

    inputs: [],

    plots: [{ key: 'hlc3', type: 'line', title: 'HLC3', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars) {
      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const h = bars[i].high
        const l = bars[i].low
        const c = bars[i].close
        if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue
        // The source multiplies by 0.333333 instead of dividing by 3, so the
        // port keeps that constant to reproduce its values bit for bit.
        out[i] = (h + l + c) * 0.333333
      }
      return { hlc3: nulls(out) }
    },
  })
}
