/**
 * Standard Error of Regression (STDERR) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/statistics/stderr.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * Fits a least-squares line through the last N values and reports the root mean
 * squared residual around it, so a low reading means price is tracking its own
 * trend line closely and a high one means it is scattering away from it.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-stderr',
    name: 'Standard Error of Regression (STDERR)',
    category: 'Statistics',
    placement: 'pane',

    inputs: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 3, max: 1000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'stderr', type: 'line', title: 'Stderr', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine also
      // floors the buffer at 3 with math.max(3, len).
      const period = Math.max(3, Math.min(1000, Math.floor(Number(settings.period) || 14)))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine wraps the source in nz(), so a na source reads as 0 in the buffer.
      const vals = new Array(bars.length)
      for (let i = 0; i < bars.length; i++) vals[i] = Number.isFinite(src[i]) ? src[i] : 0

      const out = new Array(bars.length).fill(NaN)
      for (let i = 0; i < bars.length; i++) {
        // The circular buffer holds min(bars so far, period) values, and the
        // regression runs over whatever it holds once there are at least three.
        const n = Math.min(i + 1, period)
        if (n < 3) continue
        const start = i - n + 1

        let sumX = 0
        let sumY = 0
        let sumXY = 0
        let sumX2 = 0
        for (let j = 0; j < n; j++) {
          const y = vals[start + j]
          sumX += j
          sumY += y
          sumXY += j * y
          sumX2 += j * j
        }

        const denom = n * sumX2 - sumX * sumX
        if (denom === 0) {
          out[i] = 0
          continue
        }
        const slope = (n * sumXY - sumX * sumY) / denom
        const intercept = (sumY - slope * sumX) / n

        let ssr = 0
        for (let j = 0; j < n; j++) {
          const residual = vals[start + j] - (intercept + slope * j)
          ssr += residual * residual
        }

        // n is at least 3 here, so n - 2 is never zero.
        const variance = ssr / (n - 2)
        out[i] = variance > 0 ? Math.sqrt(variance) : 0
      }

      return { stderr: nulls(out) }
    },
  })
}
