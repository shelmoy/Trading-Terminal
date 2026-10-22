/**
 * Open-Close Midpoint (OC2) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/oc2.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The midpoint of each bar's open and close, a body-centre reference that
 * ignores the wicks entirely.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-oc2',
    name: 'Open-Close Midpoint (OC2)',
    category: 'Numerics',
    placement: 'onchart',

    // The Pine script takes open and close directly and exposes no settings.
    inputs: [],

    plots: [{ key: 'oc2', type: 'line', title: 'OC2', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars) {
      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const o = bars[i].open
        const c = bars[i].close
        if (!Number.isFinite(o) || !Number.isFinite(c)) continue
        out[i] = (o + c) * 0.5
      }
      return { oc2: nulls(out) }
    },
  })
}
