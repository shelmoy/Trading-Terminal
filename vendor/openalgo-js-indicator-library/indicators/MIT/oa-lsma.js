/**
 * Least Squares Moving Average (LSMA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/trends_FIR/lsma.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Fits a least squares straight line to the last N samples and plots the value
 * of that line at the current bar, so the average lags far less than an SMA.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-lsma',
    name: 'Least Squares Moving Average (LSMA)',
    category: 'Trends FIR',
    placement: 'onchart',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 10, min: 1, max: 2000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'lsma', type: 'line', title: 'LSMA', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(1, Math.floor(Number(settings.period) || 10))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const current = src[i]

        // The source draws from the very first bar, falling back to the raw
        // source wherever a line cannot be fitted yet.
        const p = Math.min(i + 1, period)
        if (period <= 1 || p <= 1) {
          out[i] = current
          continue
        }

        // x counts backwards from the current bar, so x = 0 is this bar and the
        // intercept is the fitted value here.
        let sumX = 0
        let sumY = 0
        let sumXY = 0
        let sumX2 = 0
        let count = 0
        for (let j = 0; j < p; j++) {
          // The source writes into its ring buffer inside the same else branch
          // that the p <= 1 guard skips, so the very first bar never enters the
          // buffer and its slot still reads na. Excluding bar 0 here keeps the
          // fitted window identical to Pine's through the whole warmup.
          const val = i - j >= 1 ? src[i - j] : NaN
          if (!Number.isFinite(val)) continue
          sumX += j
          sumY += val
          sumXY += j * val
          sumX2 += j * j
          count += 1
        }

        if (count <= 1) {
          out[i] = current
          continue
        }

        const denom = count * sumX2 - sumX * sumX
        if (denom === 0) {
          out[i] = current
          continue
        }

        const slope = (count * sumXY - sumX * sumY) / denom
        out[i] = (sumY - slope * sumX) / count
      }

      return { lsma: nulls(out) }
    },
  })
}
