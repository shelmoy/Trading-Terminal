/**
 * Kalman Filter (KF) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/kf.pine
 * Repo:   mihakralj/pinescript
 * License: MIT
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A one-dimensional Kalman filter treats price as a noisy measurement of a
 * hidden level. The ratio of process noise to measurement noise sets how much
 * of each new bar is believed, so a larger Q tracks price and a larger R
 * smooths it.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-kf',
    name: 'Kalman Filter (KF)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
      {
        key: 'q',
        type: 'number',
        label: 'Process Noise (Q)',
        default: 0.01,
        min: 1e-9,
        max: 1000,
        step: 0.01,
        tooltip: 'How much the hidden level is assumed to move on its own. Larger tracks price more closely.',
      },
      {
        key: 'r',
        type: 'number',
        label: 'Measurement Noise (R)',
        default: 0.1,
        min: 1e-9,
        max: 1000,
        step: 0.1,
        tooltip: 'How noisy each price reading is assumed to be. Larger smooths the output more.',
      },
    ],

    plots: [{ key: 'kf', type: 'line', title: 'KF', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0. The source
      // refuses a non-positive Q or R outright, so both are floored.
      const q = Math.max(1e-9, Number(settings.q) || 0.01)
      const r = Math.max(1e-9, Number(settings.r) || 0.1)
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length
      const out = new Array(n).fill(NaN)

      // Pine keeps x and p as var floats seeded na and initialised on the first
      // bar, or whenever the state has gone missing.
      let x = NaN
      let p = NaN

      for (let i = 0; i < n; i++) {
        // Pine reads the measurement through nz(src, 0.0).
        const measurement = Number.isFinite(src[i]) ? src[i] : 0

        if (i === 0 || !Number.isFinite(x)) {
          x = measurement
          p = 1
        }

        const xPred = x
        const pPred = p + q
        const denom = pPred + r
        const gain = denom === 0 ? 0 : pPred / denom

        x = xPred + gain * (measurement - xPred)
        p = (1 - gain) * pPred

        out[i] = x
      }

      return { kf: nulls(out) }
    },
  })
}
