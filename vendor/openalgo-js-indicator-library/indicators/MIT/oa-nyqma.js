/**
 * Nyquist Moving Average (NYQMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/nyqma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Duerschner's lag-compensated average: a linearly weighted average and a
 * double-smoothed one are extrapolated as (1 + alpha) * MA1 - alpha * MA2, with
 * the second period held at or below half the first to avoid aliasing.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-nyqma',
    name: 'Nyquist Moving Average (NYQMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period (N1)', default: 89, min: 3, max: 5000, step: 1 },
      {
        key: 'nyquistPeriod',
        type: 'number',
        label: 'Nyquist Period (N2)',
        default: 21,
        min: 1,
        max: 5000,
        step: 1,
        tooltip: 'Secondary weighted-average period, clamped to at most half of Period (N1).',
      },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'nyqma', type: 'line', title: 'NYQMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(3, Math.floor(Number(settings.period) || 89))
      const nyquistPeriod = Math.max(1, Math.floor(Number(settings.nyquistPeriod) || 21))
      const src = sourceValues(bars, settings.source || 'close')

      // Pine's `period / 2` on two ints is integer division.
      const n2 = Math.min(Math.max(nyquistPeriod, 1), Math.floor(period / 2))
      const alpha = n2 / (period - n2)

      // MA1: weighted average of the source, partial window while it fills.
      const buf1 = new Array(period).fill(NaN)
      let head1 = 0
      let sum1 = 0
      let wsum1 = 0
      let cnt1 = 0

      // MA2: weighted average of MA1 over n2 bars.
      const buf2 = new Array(n2).fill(NaN)
      let head2 = 0
      let sum2 = 0
      let wsum2 = 0
      let cnt2 = 0

      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const price = Number.isFinite(src[i]) ? src[i] : 0

        const oldest1 = buf1[head1]
        if (Number.isFinite(oldest1)) {
          const oldSum1 = sum1
          sum1 = sum1 - oldest1 + price
          wsum1 = wsum1 - oldSum1 + period * price
        } else {
          cnt1 += 1
          sum1 += price
          wsum1 = wsum1 + cnt1 * price
        }
        buf1[head1] = price
        head1 = (head1 + 1) % period

        const p1 = Math.min(cnt1, period)
        const norm1 = p1 * (p1 + 1) * 0.5
        const ma1 = norm1 > 0 ? wsum1 / norm1 : NaN
        if (!Number.isFinite(ma1)) continue

        const oldest2 = buf2[head2]
        if (Number.isFinite(oldest2)) {
          const oldSum2 = sum2
          sum2 = sum2 - oldest2 + ma1
          wsum2 = wsum2 - oldSum2 + n2 * ma1
        } else {
          cnt2 += 1
          sum2 += ma1
          wsum2 = wsum2 + cnt2 * ma1
        }
        buf2[head2] = ma1
        head2 = (head2 + 1) % n2

        const p2 = Math.min(cnt2, n2)
        const norm2 = p2 * (p2 + 1) * 0.5
        const ma2 = norm2 > 0 ? wsum2 / norm2 : NaN
        if (!Number.isFinite(ma2)) continue

        out[i] = (1.0 + alpha) * ma1 - alpha * ma2
      }

      return { nyqma: nulls(out) }
    },
  })
}
