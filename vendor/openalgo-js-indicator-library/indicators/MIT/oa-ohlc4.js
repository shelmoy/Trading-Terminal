/**
 * OHLC Average (OHLC4) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/numerics/ohlc4.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The mean of a bar's open, high, low and close. It prints a single, quieter
 * representative price for the bar than the close alone, which is why it is a
 * common input to other studies.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-ohlc4',
    name: 'OHLC Average (OHLC4)',
    category: 'Numerics',
    placement: 'onchart',

    // The Pine source takes no inputs: it reads the bar's own four prices.
    inputs: [],

    plots: [{ key: 'ohlc4', type: 'line', title: 'OHLC4', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars) {
      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        const b = bars[i]
        // A bar missing any leg leaves a gap rather than a partial average.
        if (
          !Number.isFinite(b.open) ||
          !Number.isFinite(b.high) ||
          !Number.isFinite(b.low) ||
          !Number.isFinite(b.close)
        ) {
          continue
        }
        out[i] = (b.open + b.high + b.low + b.close) * 0.25
      }
      return { ohlc4: nulls(out) }
    },
  })
}
