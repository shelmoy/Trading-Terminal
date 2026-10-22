/**
 * Inertia (INERTIA) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/oscillators/inertia.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * The distance between price and the value of a least-squares regression line
 * fitted through the last N bars. It reads positive while price runs ahead of
 * its own trend line and negative while it lags behind it.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-inertia',
    name: 'Inertia',
    category: 'Oscillators',
    placement: 'pane',

    inputs: [
      {
        key: 'length',
        type: 'number',
        label: 'Length',
        default: 20,
        min: 1,
        max: 500,
        step: 1,
        tooltip: 'Period for linear regression calculation.',
      },
      {
        key: 'source',
        type: 'source',
        label: 'Source',
        default: 'close',
        tooltip: 'Price series to analyze.',
      },
    ],

    plots: [{ key: 'inertia', type: 'line', title: 'Inertia', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')
      const out = new Array(bars.length).fill(NaN)

      for (let i = 0; i < bars.length; i++) {
        const cur = src[i]
        if (!Number.isFinite(cur)) continue

        // Pine clamps the window to the bars available, so early bars fit a
        // shorter regression rather than producing nothing.
        const n = Math.min(length, i + 1)
        let sumX = 0
        let sumY = 0
        let sumXY = 0
        let sumX2 = 0
        for (let k = 0; k < n; k++) {
          const x = n - 1 - k
          const raw = src[i - k]
          const y = Number.isFinite(raw) ? raw : 0
          sumX += x
          sumY += y
          sumXY += x * y
          sumX2 += x * x
        }

        const denominator = n * sumX2 - sumX * sumX
        if (denominator === 0) {
          // A single-bar window has no slope; Pine returns 0 here.
          out[i] = 0
          continue
        }
        const slope = (n * sumXY - sumX * sumY) / denominator
        const intercept = (sumY - slope * sumX) / n
        const regressionValue = slope * (n - 1) + intercept
        if (!Number.isFinite(regressionValue)) continue
        out[i] = cur - regressionValue
      }

      return { inertia: nulls(out) }
    },
  })
}
