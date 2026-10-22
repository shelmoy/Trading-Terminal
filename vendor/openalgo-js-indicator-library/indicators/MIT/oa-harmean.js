/**
 * Harmonic Mean (HARMEAN) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/harmean.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Averages the reciprocals of the last N positive values and inverts the
 * result, which pulls the mean toward the smaller readings and ignores any
 * bar whose value is missing or not positive.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-harmean',
    name: 'Harmonic Mean (HARMEAN)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      {
        key: 'source',
        type: 'source',
        label: 'Source (must be positive values)',
        default: 'close',
      },
      { key: 'length', type: 'number', label: 'Lookback Period', default: 14, min: 1, max: 5000, step: 1 },
    ],

    plots: [{ key: 'harmean', type: 'line', title: 'HARMEAN', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const len = Math.max(1, Math.floor(Number(settings.length) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Circular buffer of the last `len` accepted values, seeded with na, plus
      // a running sum of reciprocals and a count of the slots that hold a usable
      // value. The window therefore expands over the first `len` bars.
      const buffer = new Array(len).fill(NaN)
      let sumReciprocal = 0
      let nValid = 0
      let index = 0

      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const value = src[i]
        const valid = Number.isFinite(value) && value > 0

        const old = buffer[index]
        if (Number.isFinite(old) && old > 0) {
          sumReciprocal -= 1 / old
          nValid -= 1
        }

        if (valid) {
          sumReciprocal += 1 / value
          nValid += 1
          buffer[index] = value
        } else {
          buffer[index] = NaN
        }

        index = (index + 1) % len

        if (nValid > 0 && sumReciprocal > 1e-10) out[i] = nValid / sumReciprocal
      }

      return { harmean: nulls(out) }
    },
  })
}
