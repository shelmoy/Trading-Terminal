/**
 * Ehlers 3-Pole Super Smoother Filter (SSF3) - ported to openalgo-charts from
 * Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/ssf3.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A three-pole infinite impulse response filter: it smooths price with far less
 * lag than a moving average of the same length and almost no overshoot, because
 * the poles are placed to cancel the filter's own ringing.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  const SQRT3_PI = Math.sqrt(3.0) * Math.PI

  registerIndicator({
    id: 'oa-ssf3',
    name: 'Ehlers 3-Pole Super Smoother Filter (SSF3)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 1, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [{ key: 'ssf3', type: 'line', title: 'SSF3', style: { color: '#ffeb3b', lineWidth: 2 } }],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(1, Math.floor(Number(settings.length) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')
      const n = bars.length

      // Pine recomputes the coefficients only when the length changes; they are
      // constant for a given setting, so they are computed once here.
      const p = Math.max(1, length)
      const a1 = Math.exp(-Math.PI / p)
      const b1 = 2.0 * a1 * Math.cos(SQRT3_PI / p)
      const c1 = a1 * a1
      const coef2 = b1 + c1
      const coef3 = -(c1 + b1 * c1)
      const coef4 = c1 * c1
      const coef1 = 1.0 - coef2 - coef3 - coef4

      // The filter emits from the first bar: the nz() chain in the source
      // substitutes the newest available price for every value it does not have
      // yet, so there is no warmup gap to reproduce.
      const out = new Array(n).fill(NaN)
      const fin = (v) => Number.isFinite(v)

      for (let i = 0; i < n; i++) {
        const ssrc = fin(src[i]) ? src[i] : i >= 1 && fin(src[i - 1]) ? src[i - 1] : NaN
        const src1 = i >= 1 && fin(src[i - 1]) ? src[i - 1] : ssrc
        const src2 = i >= 2 && fin(src[i - 2]) ? src[i - 2] : src1
        const src3 = i >= 3 && fin(src[i - 3]) ? src[i - 3] : src2

        const filt1 = i >= 1 && fin(out[i - 1]) ? out[i - 1] : src1
        const filt2 = i >= 2 && fin(out[i - 2]) ? out[i - 2] : src2
        const filt3 = i >= 3 && fin(out[i - 3]) ? out[i - 3] : src3

        if (!fin(ssrc) || !fin(filt1) || !fin(filt2) || !fin(filt3)) continue
        out[i] = coef1 * ssrc + coef2 * filt1 + coef3 * filt2 + coef4 * filt3
      }

      return { ssf3: nulls(out) }
    },
  })
}
