/**
 * Jarque-Bera Test (JB) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/jb.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A goodness-of-fit statistic testing whether the last N values are normally
 * distributed, combining sample skewness and excess kurtosis. Larger readings
 * mean the distribution departs further from normal.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-jb',
    name: 'Jarque-Bera Test (JB)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'length',
        type: 'number',
        label: 'Lookback Period (Sample Size)',
        default: 20,
        min: 10,
        max: 200,
        step: 1,
        tooltip: 'Number of bars for calculation. Min 10. Max 200 due to array processing. Higher values provide more stable estimates but lag more.',
      },
    ],

    plots: [{ key: 'jb', type: 'line', title: 'Jarque-Bera Statistic', style: { color: '#ffeb3b', lineWidth: 2 } }],

    // Chi-squared critical values with 2 degrees of freedom.
    levels: () => [
      { price: 4.605, title: 'Critical Value (10%)', color: '#9598a1', lineStyle: 'dotted', lineWidth: 1 },
      { price: 5.991, title: 'Critical Value (5%)', color: '#ff9800', lineStyle: 'dashed', lineWidth: 1 },
      { price: 9.21, title: 'Critical Value (1%)', color: '#f23645', lineStyle: 'solid', lineWidth: 1 },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.min(200, Math.max(10, Math.floor(Number(settings.length) || 20)))
      const src = sourceValues(bars, settings.source ?? 'close')

      const out = new Array(bars.length).fill(NaN)

      // Pine builds a window of the last `length` values; any na inside it makes
      // the central moments na, so the statistic only exists from bar length-1.
      for (let i = length - 1; i < bars.length; i++) {
        const start = i - length + 1

        let sum = 0
        let complete = true
        for (let j = start; j <= i; j++) {
          if (!Number.isFinite(src[j])) {
            complete = false
            break
          }
          sum += src[j]
        }
        if (!complete) continue

        const mean = sum / length

        let m2 = 0
        let m3 = 0
        let m4 = 0
        for (let j = start; j <= i; j++) {
          const d = src[j] - mean
          const d2 = d * d
          m2 += d2
          m3 += d2 * d
          m4 += d2 * d2
        }
        m2 /= length
        m3 /= length
        m4 /= length

        // Pine bails out below 1e-10 rather than dividing by a near-zero sigma.
        if (!(m2 >= 1e-10)) continue

        const sd = Math.sqrt(m2)
        const skew = m3 / Math.pow(sd, 3)
        const excessKurtosis = m4 / Math.pow(sd, 4) - 3
        if (!Number.isFinite(skew) || !Number.isFinite(excessKurtosis)) continue

        out[i] = (length / 6) * (skew * skew + (excessKurtosis * excessKurtosis) / 4)
      }

      return { jb: nulls(out) }
    },
  })
}
