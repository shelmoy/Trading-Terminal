/**
 * Rolling Sum - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/sum.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The sum of the last N values of the source, accumulated with a second-order
 * Kahan-Babuska compensation so the running total does not drift over a long
 * history of additions and subtractions.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-sum',
    name: 'Rolling Sum',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'sum', type: 'line', title: 'Sum', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)

      // Pine `var` state, carried bar to bar inside this single pass.
      let sum = 0
      let c = 0 // first-order compensation
      let cc = 0 // second-order compensation

      for (let i = 0; i < bars.length; i++) {
        const val = Number.isFinite(src[i]) ? src[i] : 0
        const dropped = src[i - length]
        const oldVal = i >= length ? (Number.isFinite(dropped) ? dropped : 0) : 0

        if (i >= length) {
          // Kahan-Babuska subtract of the value leaving the window.
          const yS = -oldVal - c
          const tS = sum + yS
          c = tS - sum - yS
          sum = tS

          const zS = c - cc
          const ttS = sum + zS
          cc = ttS - sum - zS
          sum = ttS
        }

        // Kahan-Babuska add of the value entering the window.
        const yA = val - c
        const tA = sum + yA
        c = tA - sum - yA
        sum = tA

        const zA = c - cc
        const ttA = sum + zA
        cc = ttA - sum - zA
        sum = ttA

        // Pine emits from the very first bar: before the window is full this
        // is the sum of however many values exist so far.
        out[i] = sum
      }

      return { sum: nulls(out) }
    },
  })
}
