/**
 * SP15: Spencer 15-Point Moving Average - ported to openalgo-charts from
 * Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/sp15.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A symmetric 15-tap FIR filter with the fixed Spencer weights, whose response
 * is zero at the 4-bar and 5-bar frequencies, so quarterly and quintile
 * seasonality is removed rather than merely damped. The filter is centred on
 * lag 7 and, like the source, is plotted at the current bar without an offset.
 */

// Spencer's 15 weights indexed by lag: w[0] is the current bar, w[14] is 14
// bars back. Symmetric, and the set sums to 320.
const WEIGHTS = [-3, -6, -5, 3, 21, 46, 67, 74, 67, 46, 21, 3, -5, -6, -3]
const DIVISOR = 320
const TAPS = WEIGHTS.length

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-sp15',
    name: 'SP15: Spencer 15-Point Moving Average',
    category: 'Trends FIR',
    placement: 'onchart',

    // The source script declares no inputs: the weights are fixed and the
    // series is always close.
    inputs: [],

    plots: [
      { key: 'sp15', type: 'line', title: 'SP15', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars) {
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // src[14] is the oldest tap, so the filter has nothing to say until bar 14.
      for (let i = TAPS - 1; i < n; i++) {
        let total = 0
        let ok = true
        for (let lag = 0; lag < TAPS; lag++) {
          const v = bars[i - lag].close
          if (!Number.isFinite(v)) {
            ok = false
            break
          }
          total += WEIGHTS[lag] * v
        }
        if (ok) out[i] = total / DIVISOR
      }

      return { sp15: nulls(out) }
    },
  })
}
