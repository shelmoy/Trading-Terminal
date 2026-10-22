/**
 * Integral of Linear Regression Slope (ILRS) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/ilrs.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The least-squares slope of a rolling window is accumulated bar by bar, so
 * the line is the running integral of trend speed: a smoother price follower
 * than an LSMA with far less lag at turns.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-ilrs',
    name: 'Integral of Linear Regression Slope (ILRS)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 2, max: 5000, step: 1, tooltip: 'Lookback window for the rolling regression slope.' },
    ],

    plots: [{ key: 'ilrs', type: 'line', title: 'ILRS', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)
      let integral = NaN

      for (let i = 0; i < bars.length; i++) {
        // Pine stores nz(source) in the circular buffer.
        const price = Number.isFinite(src[i]) ? src[i] : 0
        const count = Math.min(i + 1, period)

        if (count < 2) {
          integral = price
          out[i] = integral
          continue
        }

        // x-indices run 0 .. n-1 oldest to newest, so the x-sums are closed form.
        const n = count
        const sumX = 0.5 * (n - 1) * n
        const sumX2 = ((n - 1) * n * (2 * n - 1)) / 6
        let sumY = 0
        let sumXY = 0
        for (let k = 0; k < n; k++) {
          const raw = src[i - n + 1 + k]
          const val = Number.isFinite(raw) ? raw : 0
          sumY += val
          sumXY += k * val
        }

        const denomX = n * sumX2 - sumX * sumX
        const slope = denomX !== 0 ? (n * sumXY - sumX * sumY) / denomX : 0

        if (!Number.isFinite(integral)) integral = price
        integral += slope
        out[i] = integral
      }

      return { ilrs: nulls(out) }
    },
  })
}
