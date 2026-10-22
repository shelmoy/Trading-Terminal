/**
 * Quadratic Regression Moving Average (QRMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/qrma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Fits a second-degree polynomial y = a + b*x + c*x^2 to the lookback window by
 * ordinary least squares and plots the fitted value at the newest bar, so the
 * average tracks curvature as well as slope.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-qrma',
    name: 'Quadratic Regression Moving Average (QRMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 3, max: 1000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'qrma', type: 'line', title: 'QRMA', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine enforces
      // period >= 3 with runtime.error; here the floor does the same job.
      const period = Math.max(3, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source || 'close')

      // Constant sums for x = 0 .. N-1, exactly as the Pine source derives them.
      const n = period
      const sx = (n * (n - 1.0)) / 2.0
      const sx2 = (n * (n - 1.0) * (2.0 * n - 1.0)) / 6.0
      const sx3 = sx * sx
      const sx4 = (n * (n - 1.0) * (2.0 * n - 1.0) * (3.0 * n * n - 3.0 * n - 1.0)) / 30.0

      const d00 = n
      const d01 = sx
      const d02 = sx2
      const d10 = sx
      const d11 = sx2
      const d12 = sx3
      const d20 = sx2
      const d21 = sx3
      const d22 = sx4

      const det =
        d00 * (d11 * d22 - d12 * d21) -
        d01 * (d10 * d22 - d12 * d20) +
        d02 * (d10 * d21 - d11 * d20)
      const solvable = Number.isFinite(det) && Math.abs(det) >= 1e-20

      // Pine feeds the circular buffer with nz(source), so a gap reads as 0.
      const price = new Array(bars.length)
      for (let i = 0; i < bars.length; i++) price[i] = Number.isFinite(src[i]) ? src[i] : 0

      const xEnd = n - 1.0
      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        // count = min(bar_index + 1, period); a partial window returns the raw price.
        if (i < period - 1 || !solvable) {
          out[i] = price[i]
          continue
        }

        let sy = 0.0
        let sxy = 0.0
        let sx2y = 0.0
        const start = i - period + 1
        for (let j = 0; j < period; j++) {
          const val = price[start + j] // x = 0 is the oldest bar in the window
          sy += val
          sxy += j * val
          sx2y += j * j * val
        }

        // Cramer's rule on the 3x3 normal equations.
        const detA =
          sy * (d11 * d22 - d12 * d21) -
          d01 * (sxy * d22 - sx2y * d21) +
          d02 * (sxy * d21 - sx2y * d11)
        const detB =
          d00 * (sxy * d22 - sx2y * d21) -
          sy * (d10 * d22 - d12 * d20) +
          d02 * (d10 * sx2y - sxy * d20)
        const detC =
          d00 * (d11 * sx2y - sxy * d21) -
          d01 * (d10 * sx2y - sxy * d20) +
          sy * (d10 * d21 - d11 * d20)

        const a = detA / det
        const b = detB / det
        const c = detC / det

        const fitted = a + b * xEnd + c * xEnd * xEnd
        out[i] = Number.isFinite(fitted) ? fitted : price[i]
      }

      return { qrma: nulls(out) }
    },
  })
}
