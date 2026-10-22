/**
 * Ehlers 3-Pole Butterworth Filter (BUTTER3) - ported to openalgo-charts from Pine Script v6.
 *
 * Source: https://github.com/mihakralj/pinescript/blob/c4e91b962be09733d8fc76caa5191e9e586c5cee/indicators/filters/butter3.pine
 * Repo:   mihakralj/pinescript
 * License: MIT (c) mihakralj
 * SPDX-FileCopyrightText: (c) mihakralj
 * SPDX-FileCopyrightText: (c) 2026 marketcalls (port to openalgo-charts)
 * SPDX-License-Identifier: MIT
 *
 * A third-order Butterworth lowpass IIR filter: it rolls off cycles shorter
 * than the cutoff period more steeply than the two-pole version while keeping
 * the passband flat, so the line is smoother for the same amount of lag.
 */

export default function ({ registerIndicator, sourceValues, nulls }) {
  registerIndicator({
    id: 'oa-butter3',
    name: 'Ehlers 3-Pole Butterworth Filter (BUTTER3)',
    category: 'Filters',
    placement: 'onchart',

    inputs: [
      { key: 'length', type: 'number', label: 'Length', default: 20, min: 2, max: 5000, step: 1 },
      { key: 'source', type: 'source', label: 'Source', default: 'close' },
    ],

    plots: [
      { key: 'butter3', type: 'line', title: 'Butterworth 3-Pole', style: { color: '#ffeb3b', lineWidth: 2 } },
    ],

    calc(bars, settings) {
      // A cleared number field arrives as '', and Number('') is 0.
      const length = Math.max(2, Math.floor(Number(settings.length) || 20))
      const src = sourceValues(bars, settings.source ?? 'close')

      // Pine applies math.max(2, length) again inside the function.
      const p = Math.max(2, length)
      const SQRT3_PI = Math.sqrt(3) * Math.PI
      const a1 = Math.exp(-Math.PI / p)
      const b1 = 2 * a1 * Math.cos(SQRT3_PI / p)
      const c1 = a1 * a1
      const coef2 = b1 + c1
      const coef3 = -(c1 + b1 * c1)
      const coef4 = c1 * c1
      const coef1 = ((1 - b1 + c1) * (1 - c1)) / 8

      const out = new Array(bars.length).fill(NaN)
      const fin = (v) => Number.isFinite(v)

      for (let i = 0; i < bars.length; i++) {
        // nz(x, fallback) chains: each lagged term falls back to the newer one.
        const ssrc = fin(src[i]) ? src[i] : (i > 0 && fin(src[i - 1]) ? src[i - 1] : NaN)
        if (!fin(ssrc)) continue
        const src1 = i > 0 && fin(src[i - 1]) ? src[i - 1] : ssrc
        const src2 = i > 1 && fin(src[i - 2]) ? src[i - 2] : src1
        const src3 = i > 2 && fin(src[i - 3]) ? src[i - 3] : src2

        if (i < 4) {
          // Pine seeds the recursion with the raw source for the first four bars.
          out[i] = ssrc
          continue
        }

        const filt1 = fin(out[i - 1]) ? out[i - 1] : src1
        const filt2 = fin(out[i - 2]) ? out[i - 2] : src2
        const filt3 = fin(out[i - 3]) ? out[i - 3] : src3

        out[i] =
          coef1 * (ssrc + 3 * src1 + 3 * src2 + src3) +
          coef2 * filt1 +
          coef3 * filt2 +
          coef4 * filt3
      }

      return { butter3: nulls(out) }
    },
  })
}
