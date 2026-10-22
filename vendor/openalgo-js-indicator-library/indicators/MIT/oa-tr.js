/**
 * True Range (TR) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/volatility/tr.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The greater of this bar's own range and its two gaps to the previous close,
 * so a bar that opens away from yesterday is measured from where trading
 * actually stopped rather than from where it restarted.
 */

export default function ({ registerIndicator, trueRange, nulls }) {
  registerIndicator({
    id: 'oa-tr',
    name: 'True Range',
    category: 'Volatility',
    placement: 'pane',

    inputs: [],

    plots: [{ key: 'tr', type: 'line', title: 'TR', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars) {
      const n = bars.length
      const high = new Array(n)
      const low = new Array(n)
      const close = new Array(n)
      for (let i = 0; i < n; i++) {
        high[i] = bars[i].high
        low[i] = bars[i].low
        close[i] = bars[i].close
      }

      // Pine's nz(close[1], close) makes the first bar fall back to its own
      // close, which reduces the three way maximum to high - low. trueRange()
      // emits exactly that at index 0 and the three way maximum thereafter.
      return { tr: nulls(trueRange(high, low, close)) }
    },
  })
}
