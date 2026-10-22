/**
 * Linear Regression (LINREG) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/linreg.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The end point of a least-squares line fitted over the lookback window, so the
 * plot is the value the trend of the last N bars says this bar should have.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-linreg',
    name: 'Linear Regression (LINREG)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 2, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'linreg', type: 'line', title: 'LinReg', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine returns
      // [na, na] outright for a length below 2, which the minval already bars.
      const len = Math.max(2, Math.floor(Number(settings.period) || 14))
      const src = sourceValues(bars, settings.source ?? 'close')
      const out = new Array(bars.length).fill(NaN)

      const buf = new Array(len).fill(0)
      let count = 0
      let head = 0
      let lastValid = NaN

      for (let i = 0; i < bars.length; i++) {
        // Pine carries the last valid value forward across a na source.
        let curr = src[i]
        if (!Number.isFinite(curr) && Number.isFinite(lastValid)) curr = lastValid
        if (Number.isFinite(curr)) {
          lastValid = curr
          buf[head] = curr
          if (count < len) count += 1
          head = (head + 1) % len
        }

        // The window expands from two bars, so the first value lands on bar 1.
        const n = count
        if (n < 2) continue

        const start = count < len ? 0 : head
        let sumY = 0
        let sumXY = 0
        for (let k = 0; k < n; k++) {
          const y = buf[(start + k) % len]
          sumY += y
          sumXY += k * y
        }

        const sumX = 0.5 * (n - 1) * n
        const sumX2 = ((n - 1) * n * (2 * n - 1)) / 6
        const denom = n * sumX2 - sumX * sumX
        // Pine leaves the slope na when the x spread collapses.
        if (denom === 0) continue

        const slope = (n * sumXY - sumX * sumY) / denom
        const intercept = sumY / n - slope * ((n - 1) / 2)
        out[i] = intercept + slope * (n - 1)
      }

      return { linreg: nulls(out) }
    },
  })
}
