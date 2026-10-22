/**
 * Open-High-Low Average (OHL3) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/ohl3.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The average of the open, high and low of each bar. Dropping the close leaves
 * a reference price that ignores where the bar settled, so it tracks the bar's
 * traded range rather than its outcome.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-ohl3',
    name: 'Open-High-Low Average (OHL3)',
    category: 'Numerics',
    placement: 'onchart',

    inputs: [],

    plots: [{ key: 'ohl3', type: 'line', title: 'OHL3', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars) {
      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const b = bars[i]
        const o = b.open
        const h = b.high
        const l = b.low
        if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l)) continue
        // The source multiplies by 0.333333 rather than dividing by 3; keep the
        // same constant so the values match the Pine plot exactly.
        out[i] = (o + h + l) * 0.333333
      }
      return { ohl3: nulls(out) }
    },
  })
}
