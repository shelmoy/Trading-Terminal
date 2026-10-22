/**
 * Standard Deviation (STDDEV) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/stddev.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The population standard deviation of the source over a rolling window,
 * computed in one pass from the running sum and sum of squares.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-stddev',
    name: 'Standard Deviation (STDDEV)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'stddev', type: 'line', title: 'StdDev', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const p = Math.max(1, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      const buffer = new Array(p).fill(NaN)
      let head = 0
      let count = 0
      let sum = 0
      let sumSq = 0

      for (let i = 0; i < bars.length; i++) {
        const oldest = buffer[head]
        if (Number.isFinite(oldest)) {
          sum -= oldest
          sumSq -= oldest * oldest
          count -= 1
        }

        const val = Number.isFinite(src[i]) ? src[i] : 0
        sum += val
        sumSq += val * val
        count += 1
        buffer[head] = val
        head = (head + 1) % p

        // Pine emits the deviation of however many samples it holds rather than
        // na, and a single sample is defined as 0, so there is no warmup gap.
        // count > 1 is also what makes the divide safe.
        out[i] =
          count > 1 ? Math.sqrt(Math.max(0, sumSq / count - Math.pow(sum / count, 2))) : 0
      }

      return { stddev: nulls(out) }
    },
  })
}
