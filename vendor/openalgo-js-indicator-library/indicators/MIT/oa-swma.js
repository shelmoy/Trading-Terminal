/**
 * SWMA: Symmetric Weighted Moving Average - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/swma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A FIR average whose triangular weights peak at the centre of the window, so
 * the middle of the lookback counts most and the two ends count least. For
 * period 4 the weights are the classic [1, 2, 2, 1] / 6 of Pine's ta.swma.
 */

export default function ({ registerIndicator, nulls }) {
  registerIndicator({
    id: 'oa-swma',
    name: 'SWMA: Symmetric Weighted Moving Average',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 4, min: 2, max: 2000, step: 1 },
    ],

    plots: [
      { key: 'swma', type: 'line', title: 'SWMA', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    // Pine hard-wires the source to close, so there is no source input here.
    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 4))
      const n = bars.length
      const out = new Array(n).fill(NaN)
      if (n === 0) return { swma: nulls(out) }

      // half = (period - 1) / 2, w(i) = half + 1 - |i - half| for i bars back.
      const half = (period - 1) / 2
      const weights = new Array(period)
      let sumW = 0
      for (let i = 0; i < period; i++) {
        const w = half + 1 - Math.abs(i - half)
        weights[i] = w
        sumW += w
      }
      // Triangular weights are strictly positive so sumW cannot be zero, but a
      // guard here is cheaper than emitting Infinity across the whole column.
      if (!(sumW > 0)) return { swma: nulls(out) }

      // Pine reads src[i] out to period - 1, so the first period - 1 bars are
      // na there and stay a gap here.
      for (let i = period - 1; i < n; i++) {
        let sumWV = 0
        let ok = true
        for (let k = 0; k < period; k++) {
          const v = bars[i - k].close
          if (!Number.isFinite(v)) { ok = false; break }
          sumWV += v * weights[k]
        }
        if (ok) out[i] = sumWV / sumW
      }
      return { swma: nulls(out) }
    },
  })
}
