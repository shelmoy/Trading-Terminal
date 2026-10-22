/**
 * Z-Score (ZSCORE) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/zscore.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * How far the current value sits from its own rolling mean, measured in
 * standard deviations of the lookback window.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-zscore',
    name: 'Z-Score (ZSCORE)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 2, max: 5000, step: 1 },
    ],

    plots: [
      { key: 'zscore', type: 'line', title: 'Z-Score', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const period = Math.max(2, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Pine keeps running sums over a circular buffer of `period` slots, so the
      // window is partial until it has filled and the first bar, with a single
      // sample, stays na. The deviation is the population one, dividing by the
      // count in the window rather than by count - 1.
      let sumY = 0
      let sumY2 = 0
      let validCount = 0

      for (let i = 0; i < n; i++) {
        const oldest = i >= period ? src[i - period] : NaN
        if (Number.isFinite(oldest)) {
          sumY -= oldest
          sumY2 -= oldest * oldest
          validCount -= 1
        }
        const current = src[i]
        if (Number.isFinite(current)) {
          sumY += current
          sumY2 += current * current
          validCount += 1
        }

        if (validCount < 2 || !Number.isFinite(current)) continue
        const count = validCount
        const mean = sumY / count
        const variance = Math.max(sumY2 / count - mean * mean, 0)
        const stdDev = Math.sqrt(variance)
        // A flat window has no dispersion to measure, so the source reports 0
        // rather than dividing by it.
        out[i] = stdDev > 1e-10 ? (current - mean) / stdDev : 0
      }

      return { zscore: nulls(out) }
    },
  })
}
