/**
 * Kalman Filter (KALMAN) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/kalman.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A one-dimensional Kalman filter smooths the source: the process noise sets
 * how fast the estimate is allowed to move and the measurement noise sets how
 * much each new bar is trusted.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-kalman',
    name: 'Kalman Filter (KALMAN)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      { key: 'q', type: 'number', label: 'Process Noise (Q)', default: 0.01, min: 1e-9, max: 1000, step: 0.01 },
      { key: 'r', type: 'number', label: 'Measurement Noise (R)', default: 0.1, min: 1e-9, max: 1000, step: 0.1 },
    ],

    plots: [{ key: 'kf', type: 'line', title: 'KF', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. Pine raises
      // on a non-positive q or r, so hold both at the declared minimum.
      const q = Math.max(1e-9, Number(settings.q) || 0.01)
      const r = Math.max(1e-9, Number(settings.r) || 0.1)
      const src = sourceValues(bars, settings.source ?? 'close')

      const n = bars.length
      const out = new Array(n).fill(NaN)

      // var state: x is the estimate, p its error covariance. Both start na and
      // are seeded from the first measurement.
      let x = NaN
      let p = NaN

      for (let i = 0; i < n; i++) {
        // nz(src, 0.0)
        const measurement = Number.isFinite(src[i]) ? src[i] : 0.0

        if (i === 0 || !Number.isFinite(x)) {
          x = measurement
          p = 1.0
        }

        const xPred = x
        const pPred = p + q
        const denom = pPred + r
        const kGain = denom === 0 || !Number.isFinite(denom) ? 0.0 : pPred / denom

        x = xPred + kGain * (measurement - xPred)
        p = (1.0 - kGain) * pPred
        out[i] = x
      }

      return { kf: nulls(out) }
    },
  })
}
