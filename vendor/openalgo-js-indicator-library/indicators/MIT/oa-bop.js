/**
 * Balance of Power (BOP) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/momentum/bop.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Where the close finishes inside the bar's own range, read as the share of the
 * range buyers took from sellers, optionally smoothed by a bias corrected
 * exponential average.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-bop',
    name: 'Balance of Power (BOP)',
    category: 'Momentum',
    placement: 'pane',

    inputs: [
      {
        key: 'smoothing',
        type: 'number',
        label: 'Smoothing Length',
        default: 14,
        min: 0,
        max: 5000,
        step: 1,
        tooltip: '0 for no smoothing.',
      },
    ],

    plots: [{ key: 'bop', type: 'line', title: 'BOP', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      const n = bars.length
      // A cleared field arrives as '', and Number('') is 0, which is also a
      // legal setting here, so the empty string has to be told apart from zero
      // rather than leaned on through `|| 14`.
      const raw = settings.smoothing
      const parsed = raw === '' || raw === null || raw === undefined ? 14 : Number(raw)
      const length = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 14

      const out = new Array(n).fill(NaN)

      // var state carried across bars by the Pine function.
      const alpha = 2 / (length + 1)
      let smoothBop = NaN
      let e = 1
      let warmupComplete = false

      for (let i = 0; i < n; i++) {
        const bar = bars[i]
        const high = bar.high
        const low = bar.low
        if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(bar.close) || !Number.isFinite(bar.open)) {
          continue
        }
        // A doji with no range gives zero rather than a divide by zero.
        const rawBop = high === low ? 0 : (bar.close - bar.open) / (high - low)

        if (length === 0) {
          out[i] = rawBop
          continue
        }

        if (!Number.isFinite(smoothBop)) {
          smoothBop = rawBop
          out[i] = rawBop
          continue
        }

        smoothBop = alpha * (rawBop - smoothBop) + smoothBop
        if (!warmupComplete) {
          e *= 1 - alpha
          const c = e > 1e-10 ? 1 / (1 - e) : 1
          out[i] = smoothBop * c
          if (e <= 1e-10) warmupComplete = true
        } else {
          out[i] = smoothBop
        }
      }

      return { bop: nulls(out) }
    },
  })
}
