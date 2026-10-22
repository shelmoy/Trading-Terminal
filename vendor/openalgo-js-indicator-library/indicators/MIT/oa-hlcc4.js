/**
 * Weighted Close (HLCC4) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/hlcc4.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The average of high, low and a double-weighted close, which pulls the
 * typical price towards where the bar actually settled.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-hlcc4',
    name: 'Weighted Close (HLCC4)',
    category: 'Numerics',
    placement: 'onchart',

    // The Pine source declares no inputs.
    inputs: [],

    plots: [
      { key: 'hlcc4', type: 'line', title: 'HLCC4', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars) {
      const n = bars.length
      const out = new Array(n).fill(NaN)
      for (let i = 0; i < n; i++) {
        const b = bars[i]
        const h = Number(b.high)
        const l = Number(b.low)
        const c = Number(b.close)
        if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue
        // (h + l + c + c) * 0.25, exactly as the source writes it.
        out[i] = (h + l + c + c) * 0.25
      }
      return { hlcc4: nulls(out) }
    },
  })
}
