/**
 * Weighted Moving Average (WMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/wma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A linearly weighted average: the newest bar carries weight `period`, the
 * oldest carries 1. The source builds it from dual running sums, so it plots
 * from the first bar using whatever part of the window has filled.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-wma',
    name: 'Weighted Moving Average (WMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'wma', type: 'line', title: 'WMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)

      // Pine keeps a circular buffer seeded with na. While it is still filling,
      // the weights run 1..count over the bars seen so far and the denominator
      // grows with them, which is why the line starts on bar 0 rather than after
      // a warmup gap. Once full, the update is the O(1) telescoping form.
      const buffer = new Array(period).fill(NaN)
      let head = 0
      let sum = 0
      let weightedSum = 0
      let count = 0
      let norm = 0

      for (let i = 0; i < bars.length; i++) {
        const oldest = buffer[head]
        // nz(source): a missing bar contributes zero, exactly as in the source.
        const current = Number.isFinite(src[i]) ? src[i] : 0

        if (Number.isFinite(oldest)) {
          const oldSum = sum
          sum -= oldest
          sum += current
          weightedSum = weightedSum - oldSum + period * current
        } else {
          count += 1
          sum += current
          weightedSum = weightedSum + count * current
          norm = count * (count + 1) * 0.5
        }

        buffer[head] = current
        head = (head + 1) % period

        out[i] = norm > 0 ? weightedSum / norm : NaN
      }

      return { wma: nulls(out) }
    },
  })
}
